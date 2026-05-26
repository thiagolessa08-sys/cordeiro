import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/sybase";

const MES = 4, ANO = 2026;
const MES_ANT = 3, ANO_ANT = 2026;

export async function GET() {
  try {
    const [
      kpiMes,
      kpiMesAnt,
      kpiYtd,
      kpiYtdAnt,
      mensal12,
      diario,
      topClientes,
      topProdutos,
      maiorNf,
      diasMov,
    ] = await Promise.all([

      // KPI mês atual
      executeQuery(`
        SELECT
          SUM(InvoiceTotal)                             AS total_mes,
          COUNT(DISTINCT InvoiceDocInternalNumber)      AS qtd_nfs,
          AVG(InvoiceTotal)                             AS ticket_medio
        FROM cordeiro.NFSAIDA_SAP_PRODUCAO
        WHERE InvoiceDocumentStatus = 'O'
          AND YEAR(InvoiceDocumentDate) = ${ANO}
          AND MONTH(InvoiceDocumentDate) = ${MES}
      `, 1),

      // KPI mês anterior (para delta MoM)
      executeQuery(`
        SELECT
          SUM(InvoiceTotal)                             AS total_ant,
          COUNT(DISTINCT InvoiceDocInternalNumber)      AS qtd_ant,
          AVG(InvoiceTotal)                             AS ticket_ant
        FROM cordeiro.NFSAIDA_SAP_PRODUCAO
        WHERE InvoiceDocumentStatus = 'O'
          AND YEAR(InvoiceDocumentDate) = ${ANO_ANT}
          AND MONTH(InvoiceDocumentDate) = ${MES_ANT}
      `, 1),

      // YTD atual (jan–abr 2026)
      executeQuery(`
        SELECT SUM(InvoiceTotal) AS ytd
        FROM cordeiro.NFSAIDA_SAP_PRODUCAO
        WHERE InvoiceDocumentStatus = 'O'
          AND YEAR(InvoiceDocumentDate) = ${ANO}
          AND MONTH(InvoiceDocumentDate) <= ${MES}
      `, 1),

      // YTD anterior (jan–abr 2025)
      executeQuery(`
        SELECT SUM(InvoiceTotal) AS ytd_ant
        FROM cordeiro.NFSAIDA_SAP_PRODUCAO
        WHERE InvoiceDocumentStatus = 'O'
          AND YEAR(InvoiceDocumentDate) = ${ANO - 1}
          AND MONTH(InvoiceDocumentDate) <= ${MES}
      `, 1),

      // Evolução mensal — 12 meses (mai/25 → abr/26)
      executeQuery(`
        SELECT
          YEAR(InvoiceDocumentDate)                     AS ano,
          MONTH(InvoiceDocumentDate)                    AS mes,
          SUM(InvoiceTotal)                             AS total,
          COUNT(DISTINCT InvoiceDocInternalNumber)      AS qtd
        FROM cordeiro.NFSAIDA_SAP_PRODUCAO
        WHERE InvoiceDocumentStatus = 'O'
          AND InvoiceDocumentDate >= '2025-05-01'
          AND InvoiceDocumentDate < '2026-05-01'
        GROUP BY YEAR(InvoiceDocumentDate), MONTH(InvoiceDocumentDate)
        ORDER BY ano, mes
      `, 14),

      // Faturamento diário do mês atual
      executeQuery(`
        SELECT
          DAY(InvoiceDocumentDate)                      AS dia,
          SUM(InvoiceTotal)                             AS total,
          COUNT(DISTINCT InvoiceDocInternalNumber)      AS qtd
        FROM cordeiro.NFSAIDA_SAP_PRODUCAO
        WHERE InvoiceDocumentStatus = 'O'
          AND YEAR(InvoiceDocumentDate) = ${ANO}
          AND MONTH(InvoiceDocumentDate) = ${MES}
        GROUP BY DAY(InvoiceDocumentDate)
        ORDER BY dia
      `, 31),

      // Top 10 clientes por CNPJ
      executeQuery(`
        SELECT TOP 10
          TRIM(InvoiceTaxID)                            AS cnpj,
          COUNT(DISTINCT InvoiceDocInternalNumber)      AS pedidos,
          AVG(InvoiceTotal)                             AS ticket,
          SUM(InvoiceItemItemTotal)                     AS total
        FROM cordeiro.NFSAIDA_SAP_PRODUCAO
        WHERE InvoiceDocumentStatus = 'O'
          AND YEAR(InvoiceDocumentDate) = ${ANO}
          AND MONTH(InvoiceDocumentDate) = ${MES}
          AND InvoiceTaxID IS NOT NULL
          AND TRIM(InvoiceTaxID) <> ''
        GROUP BY TRIM(InvoiceTaxID)
        ORDER BY total DESC
      `, 10),

      // Top 10 produtos
      executeQuery(`
        SELECT TOP 10
          TRIM(InvoiceItemCode)                         AS code,
          TRIM(InvoiceItemDescription)                  AS descr,
          SUM(InvoiceItemQuantity)                      AS qtd,
          SUM(InvoiceItemItemTotal)                     AS total
        FROM cordeiro.NFSAIDA_SAP_PRODUCAO
        WHERE InvoiceDocumentStatus = 'O'
          AND YEAR(InvoiceDocumentDate) = ${ANO}
          AND MONTH(InvoiceDocumentDate) = ${MES}
          AND InvoiceItemCode IS NOT NULL
          AND TRIM(InvoiceItemCode) <> ''
        GROUP BY TRIM(InvoiceItemCode), TRIM(InvoiceItemDescription)
        ORDER BY total DESC
      `, 10),

      // Maior NF do mês
      executeQuery(`
        SELECT MAX(InvoiceTotal) AS maior_nf
        FROM cordeiro.NFSAIDA_SAP_PRODUCAO
        WHERE InvoiceDocumentStatus = 'O'
          AND YEAR(InvoiceDocumentDate) = ${ANO}
          AND MONTH(InvoiceDocumentDate) = ${MES}
      `, 1),

      // Dias com movimento (para projeção)
      executeQuery(`
        SELECT COUNT(DISTINCT DAY(InvoiceDocumentDate)) AS dias
        FROM cordeiro.NFSAIDA_SAP_PRODUCAO
        WHERE InvoiceDocumentStatus = 'O'
          AND YEAR(InvoiceDocumentDate) = ${ANO}
          AND MONTH(InvoiceDocumentDate) = ${MES}
      `, 1),
    ]);

    const km  = kpiMes.rows[0]    as number[];
    const ka  = kpiMesAnt.rows[0] as number[];
    const ytd = kpiYtd.rows[0]    as number[];
    const yta = kpiYtdAnt.rows[0] as number[];
    const mn  = maiorNf.rows[0]   as number[];
    const dm  = diasMov.rows[0]   as number[];

    const totalMes   = Number(km[0]);
    const qtdNfs     = Number(km[1]);
    const ticketMed  = Number(km[2]);
    const totalAnt   = Number(ka[0]);
    const qtdAnt     = Number(ka[1]);
    const ticketAnt  = Number(ka[2]);
    const ytdVal     = Number(ytd[0]);
    const ytdAntVal  = Number(yta[0]);
    const maiorNfVal = Number(mn[0]);
    const diasComMov = Number(dm[0]) || 1;

    const TOTAL_DIAS = 30; // abril tem 30 dias
    const projecao   = (totalMes / diasComMov) * TOTAL_DIAS;

    const deltaMoM      = totalAnt  > 0 ? ((totalMes  - totalAnt)  / totalAnt)  * 100 : null;
    const deltaQtdMoM   = qtdAnt    > 0 ? ((qtdNfs    - qtdAnt)    / qtdAnt)    * 100 : null;
    const deltaTicket   = ticketAnt > 0 ? ((ticketMed - ticketAnt) / ticketAnt) * 100 : null;
    const deltaYoY      = ytdAntVal > 0 ? ((ytdVal    - ytdAntVal) / ytdAntVal) * 100 : null;

    const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

    // Sparkline faturamento mensal (últimos 6)
    const mensalRows = mensal12.rows;
    const sparkFat   = mensalRows.slice(-6).map(r => Number(r[2]));
    const sparkTicket= mensalRows.slice(-6).map(r =>
      Number(r[3]) > 0 ? Number(r[2]) / Number(r[3]) : 0
    );
    const sparkYtd   = mensalRows
      .filter(r => Number(r[0]) === ANO)
      .reduce<number[]>((acc, r) => {
        acc.push((acc[acc.length - 1] ?? 0) + Number(r[2]));
        return acc;
      }, []);

    // Totais para share
    const totalTopClientes = (topClientes.rows as number[][]).reduce((a, r) => a + Number(r[3]), 0);
    const totalTopProdutos = (topProdutos.rows as number[][]).reduce((a, r) => a + Number(r[3]), 0);

    return NextResponse.json({
      kpis: {
        totalMes, deltaMoM,
        ytdVal, deltaYoY,
        ticketMed, deltaTicket,
        qtdNfs, deltaQtdMoM,
        maiorNf: maiorNfVal,
        totalAnt, diasComMov,
        projecao,
      },
      sparklines: { faturamento: sparkFat, ytd: sparkYtd, ticket: sparkTicket },

      chartMensal: mensalRows.map(r => ({
        label: `${MESES[Number(r[1]) - 1]}/${String(r[0]).slice(2)}`,
        ano: Number(r[0]), mes: Number(r[1]),
        total: Number(r[2]), qtd: Number(r[3]),
      })),

      chartDiario: (diario.rows as number[][]).map(r => ({
        dia: Number(r[0]), total: Number(r[1]), qtd: Number(r[2]),
      })),

      topClientes: (topClientes.rows as (string|number)[][]).map(r => ({
        cnpj:    String(r[0]).trim(),
        pedidos: Number(r[1]),
        ticket:  Number(r[2]),
        total:   Number(r[3]),
        share:   totalTopClientes > 0 ? (Number(r[3]) / totalMes) * 100 : 0,
      })),

      topProdutos: (topProdutos.rows as (string|number)[][]).map(r => ({
        code:  String(r[0]).trim(),
        descr: String(r[1]).trim(),
        qtd:   Number(r[2]),
        total: Number(r[3]),
        share: totalTopProdutos > 0 ? (Number(r[3]) / totalTopProdutos) * 100 : 0,
      })),
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
