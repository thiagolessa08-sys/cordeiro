import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/sybase";

const MES = 4, ANO = 2026;
const MES_ANT = 3, ANO_ANT = 2026;

export async function GET() {
  try {
    const [
      kpiMes,
      kpiMesAnt,
      kpiQtd12m,
      taxa,
      taxaAnt,
      mensal12,
      topClientes,
      topProdutos,
    ] = await Promise.all([

      // ── KPI mês atual
      executeQuery(`
        SELECT
          SUM(CreditMemoItemItemTotal)                        AS total_mes,
          COUNT(DISTINCT CreditMemoDocInternalNumber)         AS qtd_ncs
        FROM cordeiro.APROVACAOCREDITO_SAP_PRODUCAO
        WHERE CreditMemoCancellationStatus = 'N'
          AND YEAR(CreditMemoDocDate) = ${ANO}
          AND MONTH(CreditMemoDocDate) = ${MES}
      `, 1),

      // ── KPI mês anterior
      executeQuery(`
        SELECT
          SUM(CreditMemoItemItemTotal)                        AS total_ant,
          COUNT(DISTINCT CreditMemoDocInternalNumber)         AS qtd_ant
        FROM cordeiro.APROVACAOCREDITO_SAP_PRODUCAO
        WHERE CreditMemoCancellationStatus = 'N'
          AND YEAR(CreditMemoDocDate) = ${ANO_ANT}
          AND MONTH(CreditMemoDocDate) = ${MES_ANT}
      `, 1),

      // ── Total NCs emitidas últimos 12 meses
      executeQuery(`
        SELECT COUNT(DISTINCT CreditMemoDocInternalNumber) AS qtd_12m
        FROM cordeiro.APROVACAOCREDITO_SAP_PRODUCAO
        WHERE CreditMemoCancellationStatus = 'N'
          AND CreditMemoDocDate >= DATEADD(month, -12, TODAY())
      `, 1),

      // ── Faturado mês atual (para calcular taxa no JS)
      executeQuery(`
        SELECT COALESCE(SUM(InvoiceTotal), 0) AS fat_mes
        FROM cordeiro.NFSAIDA_SAP_PRODUCAO
        WHERE InvoiceDocumentStatus = 'O'
          AND YEAR(InvoiceDocumentDate) = ${ANO}
          AND MONTH(InvoiceDocumentDate) = ${MES}
      `, 1),

      // ── Faturado mês anterior
      executeQuery(`
        SELECT COALESCE(SUM(InvoiceTotal), 0) AS fat_ant
        FROM cordeiro.NFSAIDA_SAP_PRODUCAO
        WHERE InvoiceDocumentStatus = 'O'
          AND YEAR(InvoiceDocumentDate) = ${ANO_ANT}
          AND MONTH(InvoiceDocumentDate) = ${MES_ANT}
      `, 1),

      // ── Mensal últimos 12 meses
      executeQuery(`
        SELECT
          YEAR(CreditMemoDocDate)                             AS ano,
          MONTH(CreditMemoDocDate)                            AS mes,
          SUM(CreditMemoItemItemTotal)                        AS total,
          COUNT(DISTINCT CreditMemoDocInternalNumber)         AS qtd
        FROM cordeiro.APROVACAOCREDITO_SAP_PRODUCAO
        WHERE CreditMemoCancellationStatus = 'N'
          AND CreditMemoDocDate >= DATEADD(month, -12, TODAY())
        GROUP BY YEAR(CreditMemoDocDate), MONTH(CreditMemoDocDate)
        ORDER BY YEAR(CreditMemoDocDate) ASC, MONTH(CreditMemoDocDate) ASC
      `, 13),

      // ── Top 10 clientes por CNPJ (12 meses)
      executeQuery(`
        SELECT TOP 10
          TRIM(COALESCE(CreditMemoTaxID, ''))                 AS cnpj,
          COUNT(DISTINCT CreditMemoDocInternalNumber)         AS qtd_ncs,
          SUM(CreditMemoItemItemTotal)                        AS total
        FROM cordeiro.APROVACAOCREDITO_SAP_PRODUCAO
        WHERE CreditMemoCancellationStatus = 'N'
          AND CreditMemoDocDate >= DATEADD(month, -12, TODAY())
          AND CreditMemoTaxID IS NOT NULL
          AND TRIM(CreditMemoTaxID) <> ''
        GROUP BY TRIM(COALESCE(CreditMemoTaxID, ''))
        ORDER BY total DESC
      `, 10),

      // ── Top 5 produtos retornados (donut, 12 meses)
      executeQuery(`
        SELECT TOP 5
          TRIM(COALESCE(CreditMemoItemCode, ''))              AS code,
          TRIM(COALESCE(CreditMemoItemDescription, ''))       AS descr,
          SUM(CreditMemoItemQuantity)                         AS qtd,
          SUM(CreditMemoItemItemTotal)                        AS total
        FROM cordeiro.APROVACAOCREDITO_SAP_PRODUCAO
        WHERE CreditMemoCancellationStatus = 'N'
          AND CreditMemoDocDate >= DATEADD(month, -12, TODAY())
          AND CreditMemoItemCode IS NOT NULL
          AND TRIM(CreditMemoItemCode) <> ''
        GROUP BY TRIM(COALESCE(CreditMemoItemCode, '')), TRIM(COALESCE(CreditMemoItemDescription, ''))
        ORDER BY total DESC
      `, 5),
    ]);

    /* ── KPI Mês ────────────────────────────────────────── */
    const km  = kpiMes.rows[0]    as number[];
    const ka  = kpiMesAnt.rows[0] as number[];
    const q12 = kpiQtd12m.rows[0] as number[];

    const totalMes = Number(km[0]) || 0;
    const qtdNcs   = Number(km[1]) || 0;
    const totalAnt = Number(ka[0]) || 0;
    const qtdAnt   = Number(ka[1]) || 0;
    const qtd12m   = Number(q12[0]) || 0;

    const ticketMed = qtdNcs   > 0 ? totalMes / qtdNcs   : 0;
    const ticketAnt = qtdAnt   > 0 ? totalAnt / qtdAnt   : 0;

    const deltaMoM    = totalAnt  > 0 ? ((totalMes  - totalAnt)  / totalAnt)  * 100 : null;
    const deltaQtd    = qtdAnt    > 0 ? ((qtdNcs    - qtdAnt)    / qtdAnt)    * 100 : null;
    const deltaTicket = ticketAnt > 0 ? ((ticketMed - ticketAnt) / ticketAnt) * 100 : null;

    /* ── Taxa de retorno ──────────────────────────────── */
    const fatMesRow = taxa.rows[0]    as number[];
    const fatAntRow = taxaAnt.rows[0] as number[];
    const fatMes    = Number(fatMesRow[0]) || 0;
    const fatAnt    = Number(fatAntRow[0]) || 0;
    const taxaPct    = fatMes > 0 ? (totalMes / fatMes) * 100 : 0;
    const taxaAntPct = fatAnt > 0 ? (totalAnt / fatAnt) * 100 : 0;
    const deltaTaxa  = taxaPct - taxaAntPct;   // diferença em pp

    /* ── Mensal 12 meses ──────────────────────────────── */
    const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

    const mensalData = (mensal12.rows as number[][]).map(r => ({
      ano:   Number(r[0]),
      mes:   Number(r[1]),
      total: Number(r[2]) || 0,
      qtd:   Number(r[3]) || 0,
      label: MESES[Number(r[1]) - 1],
    }));

    const sparkTrend = mensalData.slice(-6).map(r => r.total);

    const withTotal = mensalData.filter(r => r.total > 0);
    const maxMes = withTotal.length
      ? withTotal.reduce((a, b) => b.total > a.total ? b : a)
      : null;
    const minMes = withTotal.length
      ? withTotal.reduce((a, b) => b.total < a.total ? b : a)
      : null;

    /* ── Top clientes ─────────────────────────────────── */
    const totalDev12m = (topClientes.rows as number[][])
      .reduce((a, r) => a + Number(r[2]), 0);

    const clientesData = (topClientes.rows as (string | number)[][]).map((r, i) => ({
      rank:  i + 1,
      cnpj:  String(r[0]).trim() || "—",
      qtd:   Number(r[1]) || 0,
      total: Number(r[2]) || 0,
      share: totalDev12m > 0 ? (Number(r[2]) / totalDev12m) * 100 : 0,
    }));

    /* ── Top produtos (donut) ─────────────────────────── */
    const totalProdutos = (topProdutos.rows as number[][])
      .reduce((a, r) => a + Number(r[3]), 0);

    const produtosData = (topProdutos.rows as (string | number)[][]).map((r, i) => ({
      code:  String(r[0]).trim(),
      descr: String(r[1]).trim(),
      qtd:   Number(r[2]) || 0,
      total: Number(r[3]) || 0,
      pct:   totalProdutos > 0 ? (Number(r[3]) / totalProdutos) * 100 : 0,
    }));

    return NextResponse.json({
      kpis: {
        totalMes, deltaMoM,
        qtdNcs,   deltaQtd,   qtd12m,
        taxaPct,  deltaTaxa,
        ticketMed, deltaTicket,
        sparkTrend,
      },
      mensal:  mensalData,
      maxMes:  maxMes ? { label: `${maxMes.label}/${String(maxMes.ano).slice(-2)}`, total: maxMes.total } : null,
      minMes:  minMes ? { label: `${minMes.label}/${String(minMes.ano).slice(-2)}`, total: minMes.total } : null,
      clientes: clientesData,
      produtos: produtosData,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
