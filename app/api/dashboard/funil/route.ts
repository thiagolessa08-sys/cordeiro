import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/sybase";

const MES = 4, ANO = 2026;
const MES_ANT = 3, ANO_ANT = 2026; // março 2026

export async function GET() {
  try {
    const [
      funilMes,
      funilMesAnt,
      statusCot,
      vendNfs,
      vendPed,
      vendCot,
      cicloRes,
    ] = await Promise.allSettled([

      // ── Funil do mês: cotações, pedidos, NFs
      executeQuery(`
        SELECT
          (SELECT COUNT(DISTINCT QuotationDocInternalNumber)
           FROM cordeiro.COTACOES_SAP_PRODUCAO
           WHERE YEAR(QuotationDocumentDate)=${ANO} AND MONTH(QuotationDocumentDate)=${MES}) AS cot_qtd,
          (SELECT SUM(QuotationTotal)
           FROM cordeiro.COTACOES_SAP_PRODUCAO
           WHERE YEAR(QuotationDocumentDate)=${ANO} AND MONTH(QuotationDocumentDate)=${MES}) AS cot_val,

          (SELECT COUNT(DISTINCT OrderDocInternalNumber)
           FROM cordeiro.PEDIDOS_SAP_PRODUCAO
           WHERE YEAR(OrderDocumentDate)=${ANO} AND MONTH(OrderDocumentDate)=${MES}) AS ped_qtd,
          (SELECT SUM(OrderTotal)
           FROM cordeiro.PEDIDOS_SAP_PRODUCAO
           WHERE YEAR(OrderDocumentDate)=${ANO} AND MONTH(OrderDocumentDate)=${MES}) AS ped_val,

          (SELECT COUNT(DISTINCT InvoiceDocInternalNumber)
           FROM cordeiro.NFSAIDA_SAP_PRODUCAO
           WHERE InvoiceDocumentStatus='O'
             AND YEAR(InvoiceDocumentDate)=${ANO} AND MONTH(InvoiceDocumentDate)=${MES}) AS nf_qtd,
          (SELECT SUM(InvoiceTotal)
           FROM cordeiro.NFSAIDA_SAP_PRODUCAO
           WHERE InvoiceDocumentStatus='O'
             AND YEAR(InvoiceDocumentDate)=${ANO} AND MONTH(InvoiceDocumentDate)=${MES}) AS nf_val
        FROM sys.dummy
      `, 1),

      // ── Funil mês anterior (para delta)
      executeQuery(`
        SELECT
          (SELECT COUNT(DISTINCT QuotationDocInternalNumber)
           FROM cordeiro.COTACOES_SAP_PRODUCAO
           WHERE YEAR(QuotationDocumentDate)=${ANO_ANT} AND MONTH(QuotationDocumentDate)=${MES_ANT}) AS cot_qtd,
          (SELECT COUNT(DISTINCT OrderDocInternalNumber)
           FROM cordeiro.PEDIDOS_SAP_PRODUCAO
           WHERE YEAR(OrderDocumentDate)=${ANO_ANT} AND MONTH(OrderDocumentDate)=${MES_ANT}) AS ped_qtd,
          (SELECT COUNT(DISTINCT InvoiceDocInternalNumber)
           FROM cordeiro.NFSAIDA_SAP_PRODUCAO
           WHERE InvoiceDocumentStatus='O'
             AND YEAR(InvoiceDocumentDate)=${ANO_ANT} AND MONTH(InvoiceDocumentDate)=${MES_ANT}) AS nf_qtd
        FROM sys.dummy
      `, 1),

      // ── Status cotações do mês: abertas, ganhas, perdidas + valor
      executeQuery(`
        SELECT
          COUNT(DISTINCT CASE WHEN QuotationDocumentStatus='O'
            THEN QuotationDocInternalNumber END) AS abertas,
          SUM(CASE WHEN QuotationDocumentStatus='O' THEN QuotationTotal ELSE 0 END) AS val_abertas,

          COUNT(DISTINCT CASE WHEN QuotationDocumentStatus='C' AND QuotationDocCancellationStatus='N'
            THEN QuotationDocInternalNumber END) AS ganhas,
          SUM(CASE WHEN QuotationDocumentStatus='C' AND QuotationDocCancellationStatus='N'
            THEN QuotationTotal ELSE 0 END) AS val_ganhas,

          COUNT(DISTINCT CASE WHEN QuotationDocumentStatus='C' AND QuotationDocCancellationStatus='Y'
            THEN QuotationDocInternalNumber END) AS perdidas,
          SUM(CASE WHEN QuotationDocumentStatus='C' AND QuotationDocCancellationStatus='Y'
            THEN QuotationTotal ELSE 0 END) AS val_perdidas,

          COUNT(DISTINCT QuotationDocInternalNumber) AS total_mes
        FROM cordeiro.COTACOES_SAP_PRODUCAO
        WHERE YEAR(QuotationDocumentDate)=${ANO} AND MONTH(QuotationDocumentDate)=${MES}
      `, 1),

      // ── Vendedores: NFs do mês (top 10 por valor)
      // InvoiceSalesEmployeeName stores the numeric SAP SlpCode (e.g. 952)
      executeQuery(`
        SELECT TOP 10
          CAST(CAST(InvoiceSalesEmployeeName AS FLOAT) AS INTEGER) AS code,
          COUNT(DISTINCT InvoiceDocInternalNumber) AS nfs,
          SUM(InvoiceItemItemTotal)                AS valor_nf
        FROM cordeiro.NFSAIDA_SAP_PRODUCAO
        WHERE InvoiceDocumentStatus='O'
          AND YEAR(InvoiceDocumentDate)=${ANO}
          AND MONTH(InvoiceDocumentDate)=${MES}
          AND InvoiceSalesEmployeeName IS NOT NULL
          AND CAST(CAST(InvoiceSalesEmployeeName AS FLOAT) AS INTEGER) > 0
        GROUP BY CAST(CAST(InvoiceSalesEmployeeName AS FLOAT) AS INTEGER)
        ORDER BY valor_nf DESC
      `, 10),

      // ── Vendedores: Pedidos do mês
      executeQuery(`
        SELECT
          CAST(CAST(OrderSalesEmployeeName AS FLOAT) AS INTEGER) AS code,
          COUNT(DISTINCT OrderDocInternalNumber) AS peds
        FROM cordeiro.PEDIDOS_SAP_PRODUCAO
        WHERE YEAR(OrderDocumentDate)=${ANO}
          AND MONTH(OrderDocumentDate)=${MES}
          AND OrderSalesEmployeeName IS NOT NULL
          AND CAST(CAST(OrderSalesEmployeeName AS FLOAT) AS INTEGER) > 0
        GROUP BY CAST(CAST(OrderSalesEmployeeName AS FLOAT) AS INTEGER)
      `, 50),

      // ── Vendedores: Cotações do mês
      executeQuery(`
        SELECT
          CAST(CAST(QuotationSalesEmployeeName AS FLOAT) AS INTEGER) AS code,
          COUNT(DISTINCT QuotationDocInternalNumber) AS cots
        FROM cordeiro.COTACOES_SAP_PRODUCAO
        WHERE YEAR(QuotationDocumentDate)=${ANO}
          AND MONTH(QuotationDocumentDate)=${MES}
          AND QuotationSalesEmployeeName IS NOT NULL
          AND CAST(CAST(QuotationSalesEmployeeName AS FLOAT) AS INTEGER) > 0
        GROUP BY CAST(CAST(QuotationSalesEmployeeName AS FLOAT) AS INTEGER)
      `, 50),

      // ── Ciclo médio: tentativa de join por código de base
      executeQuery(`
        SELECT AVG(CAST(DATEDIFF(day, q.QuotationDocumentDate, o.OrderDocumentDate) AS FLOAT)) AS ciclo
        FROM cordeiro.PEDIDOS_SAP_PRODUCAO o
        JOIN cordeiro.COTACOES_SAP_PRODUCAO q
          ON o.OrderBaseDocEntry = q.QuotationDocInternalNumber
        WHERE YEAR(o.OrderDocumentDate)=${ANO}
          AND MONTH(o.OrderDocumentDate)=${MES}
      `, 1),
    ]);

    /* ── Funil do mês ──────────────────────────────── */
    const ok = <T>(r: PromiseSettledResult<T>): T | null =>
      r.status === "fulfilled" ? r.value : null;

    const fm  = ok(funilMes);
    const fma = ok(funilMesAnt);
    const sc  = ok(statusCot);
    const cicloData = ok(cicloRes);

    const fmRow  = fm?.rows[0]  as number[] | undefined;
    const fmaRow = fma?.rows[0] as number[] | undefined;

    const cotQtd = Number(fmRow?.[0] ?? 0);
    const cotVal = Number(fmRow?.[1] ?? 0);
    const pedQtd = Number(fmRow?.[2] ?? 0);
    const pedVal = Number(fmRow?.[3] ?? 0);
    const nfQtd  = Number(fmRow?.[4] ?? 0);
    const nfVal  = Number(fmRow?.[5] ?? 0);

    const convCotPed = cotQtd > 0 ? (pedQtd / cotQtd) * 100 : 0;
    const convPedNf  = pedQtd > 0 ? (nfQtd  / pedQtd)  * 100 : 0;
    const convTotalCotNf = cotQtd > 0 ? (nfQtd / cotQtd) * 100 : 0;

    // Delta MoM (pp)
    const cotQtdAnt = Number(fmaRow?.[0] ?? 0);
    const pedQtdAnt = Number(fmaRow?.[1] ?? 0);
    const nfQtdAnt  = Number(fmaRow?.[2] ?? 0);
    const convCotPedAnt = cotQtdAnt > 0 ? (pedQtdAnt / cotQtdAnt) * 100 : null;
    const convPedNfAnt  = pedQtdAnt > 0 ? (nfQtdAnt  / pedQtdAnt) * 100 : null;
    const convTotalAnt  = cotQtdAnt > 0 ? (nfQtdAnt / cotQtdAnt) * 100 : null;

    /* ── Status cotações ───────────────────────────── */
    const scRow = sc?.rows[0] as number[] | undefined;
    const statusCotacoes = {
      abertas:   { count: Number(scRow?.[0] ?? 0), value: Number(scRow?.[1] ?? 0) },
      ganhas:    { count: Number(scRow?.[2] ?? 0), value: Number(scRow?.[3] ?? 0) },
      perdidas:  { count: Number(scRow?.[4] ?? 0), value: Number(scRow?.[5] ?? 0) },
      totalMes:  Number(scRow?.[6] ?? 0),
    };

    /* ── Ciclo médio ───────────────────────────────── */
    const cicloRow = cicloData?.rows[0] as number[] | undefined;
    const cicloMedio = cicloRow?.[0] != null ? Number(cicloRow[0]) : null;

    /* ── Vendedores ────────────────────────────────── */
    const nfRows  = (ok(vendNfs)?.rows  ?? []) as (string | number)[][];
    const pedRows = (ok(vendPed)?.rows  ?? []) as (string | number)[][];
    const cotRows = (ok(vendCot)?.rows  ?? []) as (string | number)[][];

    // Maps: code (as plain integer string) → count
    const pedMap = new Map(pedRows.map(r => [String(Number(r[0])), Number(r[1])]));
    const cotMap = new Map(cotRows.map(r => [String(Number(r[0])), Number(r[1])]));

    const vendedores = nfRows.map(r => {
      const code  = String(Number(r[0]));    // e.g. "952"
      const nfs   = Number(r[1]);
      const valor = Number(r[2]);
      const peds  = pedMap.get(code) ?? 0;
      const cots  = cotMap.get(code) ?? 0;
      const taxa  = cots > 0 ? (peds / cots) * 100 : 0;
      const name  = `Cód. ${code}`;
      // Generate consistent 2-char "initials" from the numeric code
      const n = Number(code);
      const a = String.fromCharCode(65 + (n % 26));
      const b = String.fromCharCode(65 + (Math.floor(n / 26) % 26));
      const initials = a + b;
      return { code, name, initials, cotacoes: cots, pedidos: peds, nfs, valorNf: valor, taxaCotPed: taxa };
    });

    return NextResponse.json({
      kpis: {
        convCotPed,   deltaCotPed:   convCotPedAnt  != null ? convCotPed  - convCotPedAnt  : null,
        convPedNf,    deltaPedNf:    convPedNfAnt   != null ? convPedNf   - convPedNfAnt   : null,
        convTotalCotNf, deltaTotal:  convTotalAnt   != null ? convTotalCotNf - convTotalAnt : null,
        cotQtd, cotVal, pedQtd, pedVal, nfQtd, nfVal,
        cicloMedio,
      },
      statusCotacoes,
      vendedores,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
