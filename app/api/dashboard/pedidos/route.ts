import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/sybase";

const MES = 4, ANO = 2026;
const MES_ANT = 3, ANO_ANT = 2026;

export async function GET() {
  try {
    const [
      kpiAbertos,
      kpiAbertosAnt,
      aging,
      statusGeral,
      tabelaPedidos,
    ] = await Promise.all([

      // ── KPIs: pedidos em aberto no mês atual (criados no mês)
      executeQuery(`
        SELECT
          COUNT(DISTINCT OrderDocInternalNumber)          AS total_pedidos,
          SUM(OrderItemOpenAmount)                        AS valor_aberto,
          AVG(OrderItemOpenAmount)                        AS ticket_aberto,
          COUNT(DISTINCT CASE
            WHEN DATEDIFF(day, OrderDocumentDate, TODAY()) > 60
            THEN OrderDocInternalNumber END)              AS aging_60,
          SUM(CASE
            WHEN DATEDIFF(day, OrderDocumentDate, TODAY()) > 60
            THEN OrderItemOpenAmount ELSE 0 END)          AS valor_aging_60
        FROM cordeiro.PEDIDOS_SAP_PRODUCAO
        WHERE OrderDocumentStatus = 'O'
          AND OrderItemOpenQty > 0
      `, 1),

      // ── KPIs mês anterior (para delta MoM — pedidos criados no mês ant ainda abertos)
      executeQuery(`
        SELECT
          COUNT(DISTINCT OrderDocInternalNumber)          AS total_pedidos_ant,
          SUM(OrderItemOpenAmount)                        AS valor_aberto_ant,
          AVG(OrderItemOpenAmount)                        AS ticket_aberto_ant,
          COUNT(DISTINCT CASE
            WHEN DATEDIFF(day, OrderDocumentDate, TODAY()) > 60
            THEN OrderDocInternalNumber END)              AS aging_60_ant
        FROM cordeiro.PEDIDOS_SAP_PRODUCAO
        WHERE OrderDocumentStatus = 'O'
          AND OrderItemOpenQty > 0
          AND YEAR(OrderDocumentDate) = ${ANO_ANT}
          AND MONTH(OrderDocumentDate) = ${MES_ANT}
      `, 1),

      // ── Aging: faixas de dias em aberto (contagem + valor por bucket)
      executeQuery(`
        SELECT
          CASE
            WHEN DATEDIFF(day, OrderDocumentDate, TODAY()) BETWEEN 0  AND 7  THEN '0-7'
            WHEN DATEDIFF(day, OrderDocumentDate, TODAY()) BETWEEN 8  AND 15 THEN '8-15'
            WHEN DATEDIFF(day, OrderDocumentDate, TODAY()) BETWEEN 16 AND 30 THEN '16-30'
            WHEN DATEDIFF(day, OrderDocumentDate, TODAY()) BETWEEN 31 AND 60 THEN '31-60'
            WHEN DATEDIFF(day, OrderDocumentDate, TODAY()) BETWEEN 61 AND 90 THEN '61-90'
            ELSE '>90'
          END                                             AS faixa,
          COUNT(DISTINCT OrderDocInternalNumber)          AS qtd,
          SUM(OrderItemOpenAmount)                        AS valor
        FROM cordeiro.PEDIDOS_SAP_PRODUCAO
        WHERE OrderDocumentStatus = 'O'
          AND OrderItemOpenQty > 0
        GROUP BY
          CASE
            WHEN DATEDIFF(day, OrderDocumentDate, TODAY()) BETWEEN 0  AND 7  THEN '0-7'
            WHEN DATEDIFF(day, OrderDocumentDate, TODAY()) BETWEEN 8  AND 15 THEN '8-15'
            WHEN DATEDIFF(day, OrderDocumentDate, TODAY()) BETWEEN 16 AND 30 THEN '16-30'
            WHEN DATEDIFF(day, OrderDocumentDate, TODAY()) BETWEEN 31 AND 60 THEN '31-60'
            WHEN DATEDIFF(day, OrderDocumentDate, TODAY()) BETWEEN 61 AND 90 THEN '61-90'
            ELSE '>90'
          END
      `, 6),

      // ── Status geral dos pedidos (todos)
      executeQuery(`
        SELECT
          COUNT(DISTINCT CASE
            WHEN OrderDocumentStatus='O'
              AND OrderItemOpenQty > 0
              AND OrderItemOpenQty >= OrderItemQuantity
            THEN OrderDocInternalNumber END)              AS aberto,
          COUNT(DISTINCT CASE
            WHEN OrderDocumentStatus='O'
              AND OrderItemOpenQty > 0
              AND OrderItemOpenQty < OrderItemQuantity
            THEN OrderDocInternalNumber END)              AS parcial,
          COUNT(DISTINCT CASE
            WHEN OrderDocumentStatus='C'
              AND OrderDocCancellationStatus='N'
            THEN OrderDocInternalNumber END)              AS faturado,
          COUNT(DISTINCT CASE
            WHEN OrderDocCancellationStatus='Y'
            THEN OrderDocInternalNumber END)              AS cancelado
        FROM cordeiro.PEDIDOS_SAP_PRODUCAO
      `, 1),

      // ── Tabela: TOP 100 pedidos em aberto ordenados por open amount
      executeQuery(`
        SELECT TOP 100
          OrderDocInternalNumber                              AS num,
          TRIM(COALESCE(OrderTaxID, ''))                     AS cnpj,
          CAST(CAST(OrderSalesEmployeeName AS FLOAT) AS INTEGER) AS vend_code,
          MIN(OrderDocumentDate)                             AS emissao,
          DATEDIFF(day, MIN(OrderDocumentDate), TODAY())     AS dias,
          MAX(OrderTotal)                                    AS total,
          SUM(OrderItemOpenAmount)                           AS open_amount,
          SUM(OrderItemQuantity)                             AS total_qty,
          SUM(OrderItemOpenQty)                              AS open_qty
        FROM cordeiro.PEDIDOS_SAP_PRODUCAO
        WHERE OrderDocumentStatus = 'O'
          AND OrderItemOpenQty > 0
        GROUP BY
          OrderDocInternalNumber,
          TRIM(COALESCE(OrderTaxID, '')),
          CAST(CAST(OrderSalesEmployeeName AS FLOAT) AS INTEGER)
        ORDER BY open_amount DESC
      `, 100),
    ]);

    const kp  = kpiAbertos.rows[0]    as number[];
    const kpa = kpiAbertosAnt.rows[0] as number[];
    const sg  = statusGeral.rows[0]   as number[];

    const totalPedidos  = Number(kp[0]);
    const valorAberto   = Number(kp[1]);
    const ticketAberto  = Number(kp[2]);
    const aging60       = Number(kp[3]);
    const valorAging60  = Number(kp[4]);

    const totalAnt  = Number(kpa[0]);
    const valorAnt  = Number(kpa[1]);
    const ticketAnt = Number(kpa[2]);
    const aging60Ant= Number(kpa[3]);

    const deltaTotal  = totalAnt  > 0 ? ((totalPedidos - totalAnt)  / totalAnt)  * 100 : null;
    const deltaValor  = valorAnt  > 0 ? ((valorAberto  - valorAnt)  / valorAnt)  * 100 : null;
    const deltaTicket = ticketAnt > 0 ? ((ticketAberto - ticketAnt) / ticketAnt) * 100 : null;
    const deltaAging  = aging60Ant > 0 ? ((aging60 - aging60Ant) / aging60Ant) * 100 : null;

    // Aging buckets — ensure all 6 faixas present (fill missing with 0)
    const FAIXAS = ["0-7","8-15","16-30","31-60","61-90",">90"];
    const agingMap = new Map(
      (aging.rows as (string|number)[][]).map(r => [String(r[0]), { qtd: Number(r[1]), valor: Number(r[2]) }])
    );
    const agingBuckets = FAIXAS.map(f => ({
      faixa: f,
      qtd:   agingMap.get(f)?.qtd   ?? 0,
      valor: agingMap.get(f)?.valor ?? 0,
    }));

    // Status totals
    const stAberto   = Number(sg[0]);
    const stParcial  = Number(sg[1]);
    const stFaturado = Number(sg[2]);
    const stCancelado= Number(sg[3]);
    const stTotal    = stAberto + stParcial + stFaturado + stCancelado;

    // Tabela pedidos
    type PRow = (string | number)[];
    const pedidos = (tabelaPedidos.rows as PRow[]).map(r => {
      const totalQty = Number(r[7]);
      const openQty  = Number(r[8]);
      const total    = Number(r[5]);
      const openAmt  = Number(r[6]);
      const openPct  = total > 0 ? (openAmt / total) * 100 : 0;
      const dias     = Number(r[4]);
      const status   = openQty >= totalQty ? "Aberto" : "Parcial";
      const vendCode = Number(r[2]);

      return {
        num:      Number(r[0]),
        cnpj:     String(r[1]).trim(),
        vend:     vendCode > 0 ? `Cód. ${vendCode}` : "—",
        emissao:  String(r[3]).slice(0, 10),
        dias,
        total,
        openAmt,
        openPct,
        status,
      };
    });

    return NextResponse.json({
      kpis: {
        totalPedidos, deltaTotal,
        valorAberto,  deltaValor,
        aging60,      deltaAging, valorAging60,
        ticketAberto, deltaTicket,
      },
      agingBuckets,
      statusGeral: {
        aberto:    { count: stAberto,    pct: stTotal > 0 ? (stAberto    / stTotal) * 100 : 0 },
        parcial:   { count: stParcial,   pct: stTotal > 0 ? (stParcial   / stTotal) * 100 : 0 },
        faturado:  { count: stFaturado,  pct: stTotal > 0 ? (stFaturado  / stTotal) * 100 : 0 },
        cancelado: { count: stCancelado, pct: stTotal > 0 ? (stCancelado / stTotal) * 100 : 0 },
        total:     stTotal,
      },
      pedidos,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
