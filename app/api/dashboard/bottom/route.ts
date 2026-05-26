import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/sybase";

const MES = 4, ANO = 2026;

export async function GET() {
  try {
    const [topClientes, topProdutos, statusPedidos, statusCotacoes, alertas] = await Promise.all([

      // Top 6 clientes por CNPJ — NFs do mês
      executeQuery(`
        SELECT TOP 6
          TRIM(InvoiceTaxID)   AS cnpj,
          COUNT(DISTINCT InvoiceDocInternalNumber) AS nfs,
          SUM(InvoiceTotal)    AS total
        FROM cordeiro.NFSAIDA_SAP_PRODUCAO
        WHERE InvoiceDocumentStatus = 'O'
          AND YEAR(InvoiceDocumentDate) = ${ANO}
          AND MONTH(InvoiceDocumentDate) = ${MES}
          AND InvoiceTaxID IS NOT NULL
          AND TRIM(InvoiceTaxID) <> ''
        GROUP BY TRIM(InvoiceTaxID)
        ORDER BY total DESC
      `, 6),

      // Top 6 produtos — NFs do mês
      executeQuery(`
        SELECT TOP 6
          TRIM(InvoiceItemCode)        AS code,
          TRIM(InvoiceItemDescription) AS descr,
          SUM(InvoiceItemItemTotal)    AS total
        FROM cordeiro.NFSAIDA_SAP_PRODUCAO
        WHERE InvoiceDocumentStatus = 'O'
          AND YEAR(InvoiceDocumentDate) = ${ANO}
          AND MONTH(InvoiceDocumentDate) = ${MES}
          AND InvoiceItemCode IS NOT NULL
        GROUP BY TRIM(InvoiceItemCode), TRIM(InvoiceItemDescription)
        ORDER BY total DESC
      `, 6),

      // Status dos pedidos
      executeQuery(`
        SELECT
          COUNT(DISTINCT CASE WHEN OrderDocCancellationStatus='Y' THEN OrderDocInternalNumber END) AS cancelado,
          COUNT(DISTINCT CASE WHEN OrderDocumentStatus='C' AND OrderDocCancellationStatus='N' THEN OrderDocInternalNumber END) AS faturado,
          COUNT(DISTINCT CASE WHEN OrderDocumentStatus='O' AND OrderItemOpenQty < OrderItemQuantity AND OrderItemOpenQty > 0 THEN OrderDocInternalNumber END) AS parcial,
          COUNT(DISTINCT CASE WHEN OrderDocumentStatus='O' AND (OrderItemOpenQty = OrderItemQuantity OR OrderItemQuantity = 0) THEN OrderDocInternalNumber END) AS aberto
        FROM cordeiro.PEDIDOS_SAP_PRODUCAO
      `, 1),

      // Status das cotações
      executeQuery(`
        SELECT
          COUNT(DISTINCT CASE WHEN QuotationDocumentStatus='O' THEN QuotationDocInternalNumber END) AS abertas,
          COUNT(DISTINCT CASE WHEN QuotationDocumentStatus='C' AND QuotationDocCancellationStatus='N' THEN QuotationDocInternalNumber END) AS ganhas,
          COUNT(DISTINCT CASE WHEN QuotationDocumentStatus='C' AND QuotationDocCancellationStatus='Y' THEN QuotationDocInternalNumber END) AS perdidas
        FROM cordeiro.COTACOES_SAP_PRODUCAO
      `, 1),

      // Alertas operacionais
      executeQuery(`
        SELECT
          COUNT(DISTINCT CASE WHEN DATEDIFF(day, OrderDocumentDate, TODAY()) > 60 AND OrderDocumentStatus='O' THEN OrderDocInternalNumber END) AS aging_60,
          SUM(CASE WHEN DATEDIFF(day, OrderDocumentDate, TODAY()) > 60 AND OrderDocumentStatus='O' THEN OrderItemOpenAmount ELSE 0 END) AS valor_aging
        FROM cordeiro.PEDIDOS_SAP_PRODUCAO
      `, 1),
    ]);

    // Aprovações pendentes (W = aguardando)
    const aprPendentes = await executeQuery(`
      SELECT COUNT(DISTINCT DocumentSourceNumber) AS docs_pendentes
      FROM cordeiro.APROVACOES_SAP_PRODUCAO
      WHERE DocumentApprovalStatus = 'W'
    `, 1);

    const sp = statusPedidos.rows[0] as number[];
    const sc = statusCotacoes.rows[0] as number[];
    const al = alertas.rows[0] as number[];
    const ap = aprPendentes.rows[0] as number[];

    return NextResponse.json({
      topClientes: topClientes.rows.map(r => ({
        cnpj:  String(r[0]).trim(),
        nfs:   Number(r[1]),
        total: Number(r[2]),
      })),

      topProdutos: topProdutos.rows.map(r => ({
        code:  String(r[0]).trim(),
        descr: String(r[1]).trim(),
        total: Number(r[2]),
      })),

      statusPedidos: [
        { label: "Faturado",  count: Number(sp[1]), color: "ok"   },
        { label: "Aberto",    count: Number(sp[3]), color: "info" },
        { label: "Parcial",   count: Number(sp[2]), color: "warn" },
        { label: "Cancelado", count: Number(sp[0]), color: "dang" },
      ],

      statusCotacoes: [
        { label: "Ganhas",   count: Number(sc[1]), color: "ok"   },
        { label: "Abertas",  count: Number(sc[0]), color: "info" },
        { label: "Perdidas", count: Number(sc[2]), color: "dang" },
      ],

      alertas: {
        aging60:          Number(al[0]),
        valorAging60:     Number(al[1]),
        aprovPendentes:   Number(ap[0]),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
