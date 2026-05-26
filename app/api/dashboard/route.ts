import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/sybase";

const MES_ATUAL = 4;
const ANO_ATUAL = 2026;

export async function GET() {
  try {
    const [kpiMes, kpiAno, mensal, diario, cotacoes, aprovacoes, categorias, pedAbertos, cotMensal, pedMensal, ticketMensal, diasReais] = await Promise.all([

      // KPI: faturamento do mês atual
      executeQuery(`
        SELECT SUM(InvoiceTotal) as total_mes, COUNT(DISTINCT InvoiceDocInternalNumber) as qtd_nfs,
               AVG(InvoiceTotal) as ticket_medio
        FROM cordeiro.NFSAIDA_SAP_PRODUCAO
        WHERE InvoiceDocumentStatus = 'O'
          AND YEAR(InvoiceDocumentDate) = ${ANO_ATUAL}
          AND MONTH(InvoiceDocumentDate) = ${MES_ATUAL}
      `, 1),

      // KPI: faturamento acumulado no ano
      executeQuery(`
        SELECT SUM(InvoiceTotal) as total_ano, COUNT(DISTINCT InvoiceDocInternalNumber) as qtd_nfs_ano
        FROM cordeiro.NFSAIDA_SAP_PRODUCAO
        WHERE InvoiceDocumentStatus = 'O'
          AND YEAR(InvoiceDocumentDate) = ${ANO_ATUAL}
      `, 1),

      // Faturamento mensal (últimos 12 meses)
      executeQuery(`
        SELECT YEAR(InvoiceDocumentDate) as ano, MONTH(InvoiceDocumentDate) as mes,
               SUM(InvoiceTotal) as total, COUNT(DISTINCT InvoiceDocInternalNumber) as qtd
        FROM cordeiro.NFSAIDA_SAP_PRODUCAO
        WHERE InvoiceDocumentStatus = 'O'
          AND InvoiceDocumentDate >= '2025-05-01'
        GROUP BY YEAR(InvoiceDocumentDate), MONTH(InvoiceDocumentDate)
        ORDER BY ano, mes
      `, 14),

      // Faturamento diário do mês atual
      executeQuery(`
        SELECT DAY(InvoiceDocumentDate) as dia, SUM(InvoiceTotal) as total,
               COUNT(DISTINCT InvoiceDocInternalNumber) as qtd
        FROM cordeiro.NFSAIDA_SAP_PRODUCAO
        WHERE InvoiceDocumentStatus = 'O'
          AND YEAR(InvoiceDocumentDate) = ${ANO_ATUAL}
          AND MONTH(InvoiceDocumentDate) = ${MES_ATUAL}
        GROUP BY DAY(InvoiceDocumentDate)
        ORDER BY dia
      `, 31),

      // Cotações: abertas, ganhas, perdidas + funil
      executeQuery(`
        SELECT
          COUNT(DISTINCT CASE WHEN QuotationDocumentStatus='O' THEN QuotationDocInternalNumber END) as abertas,
          COUNT(DISTINCT CASE WHEN QuotationDocumentStatus='C' AND QuotationDocCancellationStatus='N' THEN QuotationDocInternalNumber END) as ganhas,
          COUNT(DISTINCT CASE WHEN QuotationDocumentStatus='C' AND QuotationDocCancellationStatus='Y' THEN QuotationDocInternalNumber END) as perdidas,
          SUM(CASE WHEN QuotationDocumentStatus='O' THEN QuotationTotal ELSE 0 END) as valor_abertas,
          COUNT(DISTINCT CASE WHEN YEAR(QuotationDocumentDate)=${ANO_ATUAL} AND MONTH(QuotationDocumentDate)=${MES_ATUAL} THEN QuotationDocInternalNumber END) as total_mes,
          SUM(CASE WHEN YEAR(QuotationDocumentDate)=${ANO_ATUAL} AND MONTH(QuotationDocumentDate)=${MES_ATUAL} THEN QuotationTotal ELSE 0 END) as valor_mes
        FROM cordeiro.COTACOES_SAP_PRODUCAO
      `, 1),

      // Aprovações pendentes
      executeQuery(`
        SELECT COUNT(DISTINCT DocumentSourceNumber) as docs_pendentes
        FROM cordeiro.APROVACOES_SAP_PRODUCAO
        WHERE DocumentApprovalStatus = 'W'
      `, 1),

      // Top categorias de produto do mês
      executeQuery(`
        SELECT
          CASE
            WHEN UPPER(InvoiceItemDescription) LIKE '%COBRE NU%'
              OR UPPER(InvoiceItemDescription) LIKE '%CATODO%'
              OR UPPER(InvoiceItemDescription) LIKE '%VERGALHAO%'
              OR UPPER(InvoiceItemDescription) LIKE '%TREFILADO%' THEN 'Cobre / Metais'
            WHEN UPPER(InvoiceItemCode) LIKE 'GEF%' THEN 'Fotovoltaica'
            WHEN UPPER(InvoiceItemDescription) LIKE '%FLEX%'
              OR UPPER(InvoiceItemDescription) LIKE '%CORTOX%'
              OR UPPER(InvoiceItemDescription) LIKE '%HEPR%' THEN 'Cabos Flexíveis'
            WHEN UPPER(InvoiceItemDescription) LIKE '%ALUMIN%'
              OR UPPER(InvoiceItemDescription) LIKE '%CONCENTRICO AL%'
              OR UPPER(InvoiceItemDescription) LIKE '%QUADR AL%' THEN 'Alumínio'
            ELSE 'Outros'
          END as categoria,
          SUM(InvoiceItemItemTotal) as total
        FROM cordeiro.NFSAIDA_SAP_PRODUCAO
        WHERE InvoiceDocumentStatus = 'O'
          AND YEAR(InvoiceDocumentDate) = ${ANO_ATUAL}
          AND MONTH(InvoiceDocumentDate) = ${MES_ATUAL}
        GROUP BY categoria
        ORDER BY total DESC
      `, 6),

      // Pedidos em aberto
      executeQuery(`
        SELECT COUNT(DISTINCT OrderDocInternalNumber) as total, SUM(OrderItemOpenAmount) as valor
        FROM cordeiro.PEDIDOS_SAP_PRODUCAO
        WHERE OrderDocumentStatus = 'O'
      `, 1),

      // Cotações mensais (últimos 6 meses) para sparkline conversão
      executeQuery(`
        SELECT YEAR(QuotationDocumentDate) as ano, MONTH(QuotationDocumentDate) as mes,
               COUNT(DISTINCT QuotationDocInternalNumber) as total_cot,
               COUNT(DISTINCT CASE WHEN QuotationDocumentStatus='C' AND QuotationDocCancellationStatus='N' THEN QuotationDocInternalNumber END) as ganhas
        FROM cordeiro.COTACOES_SAP_PRODUCAO
        WHERE QuotationDocumentDate >= '2025-11-01'
        GROUP BY YEAR(QuotationDocumentDate), MONTH(QuotationDocumentDate)
        ORDER BY ano, mes
      `, 8),

      // Pedidos mensais (últimos 6 meses) para sparkline conversão
      executeQuery(`
        SELECT YEAR(OrderDocumentDate) as ano, MONTH(OrderDocumentDate) as mes,
               COUNT(DISTINCT OrderDocInternalNumber) as total_ped
        FROM cordeiro.PEDIDOS_SAP_PRODUCAO
        WHERE OrderDocumentDate >= '2025-11-01'
        GROUP BY YEAR(OrderDocumentDate), MONTH(OrderDocumentDate)
        ORDER BY ano, mes
      `, 8),

      // Ticket médio real por mês (últimos 6 meses)
      executeQuery(`
        SELECT YEAR(InvoiceDocumentDate) as ano, MONTH(InvoiceDocumentDate) as mes,
               AVG(InvoiceTotal) as ticket_medio
        FROM cordeiro.NFSAIDA_SAP_PRODUCAO
        WHERE InvoiceDocumentStatus = 'O'
          AND InvoiceDocumentDate >= '2025-11-01'
        GROUP BY YEAR(InvoiceDocumentDate), MONTH(InvoiceDocumentDate)
        ORDER BY ano, mes
      `, 8),

      // Dias com movimento no mês atual (para meta diária real)
      executeQuery(`
        SELECT COUNT(DISTINCT DAY(InvoiceDocumentDate)) as dias
        FROM cordeiro.NFSAIDA_SAP_PRODUCAO
        WHERE InvoiceDocumentStatus = 'O'
          AND YEAR(InvoiceDocumentDate) = ${ANO_ATUAL}
          AND MONTH(InvoiceDocumentDate) = ${MES_ATUAL}
      `, 1),
    ]);

    const km = kpiMes.rows[0] as number[];
    const ka = kpiAno.rows[0] as number[];
    const cot = cotacoes.rows[0] as number[];
    const apr = aprovacoes.rows[0] as number[];
    const ped = pedAbertos.rows[0] as number[];

    const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

    // Mês anterior para delta
    const mensalRows = mensal.rows;
    const mesIdx = mensalRows.findIndex(r => Number(r[0]) === ANO_ATUAL && Number(r[1]) === MES_ATUAL);
    const totalMes = Number(km[0]);
    const totalMesAnt = mesIdx > 0 ? Number(mensalRows[mesIdx - 1][2]) : null;
    const deltaMes = totalMesAnt ? ((totalMes - totalMesAnt) / totalMesAnt) * 100 : null;

    // Sparklines reais
    const sparkFat = mensalRows.slice(-6).map(r => Number(r[2]));

    // Sparkline acumulado ano real (soma mês a mês dentro de 2026)
    const sparkAcum = mensalRows
      .filter(r => Number(r[0]) === ANO_ATUAL)
      .reduce<number[]>((acc, r) => {
        const prev = acc[acc.length - 1] ?? 0;
        acc.push(prev + Number(r[2]));
        return acc;
      }, []);

    // Sparkline ticket médio real por mês
    const sparkTicket = ticketMensal.rows.map(r => Number(r[2]));

    // Sparklines de conversão reais
    const sparkConvCotPed = cotMensal.rows.map((r, i) => {
      const pedRow = pedMensal.rows[i];
      const cots = Number(r[2]);
      const peds = pedRow ? Number(pedRow[2]) : 0;
      return cots > 0 ? (peds / cots) * 100 : 0;
    });

    const sparkConvPedNf = pedMensal.rows.map((r, i) => {
      const nfRow = mensalRows.find(m => Number(m[0]) === Number(r[0]) && Number(m[1]) === Number(r[1]));
      const peds = Number(r[2]);
      const nfs  = nfRow ? Number(nfRow[3]) : 0;
      return peds > 0 ? (nfs / peds) * 100 : 0;
    });

    // Meta diária real: total do mês / dias com movimento
    const diasComMovimento = Number((diasReais.rows[0] as number[])[0]) || 22;

    // Funil do mês
    const pedMes = await executeQuery(`
      SELECT COUNT(DISTINCT OrderDocInternalNumber) as qtd, SUM(OrderTotal) as valor
      FROM cordeiro.PEDIDOS_SAP_PRODUCAO
      WHERE YEAR(OrderDocumentDate) = ${ANO_ATUAL} AND MONTH(OrderDocumentDate) = ${MES_ATUAL}
    `, 1);
    const pm = pedMes.rows[0] as number[];

    // Conversão
    const totalCotMes = Number(cot[4]);
    const totalPedMes = Number(pm[0]);
    const totalNfMes = Number(km[1]);
    const convCotPed = totalCotMes > 0 ? (totalPedMes / totalCotMes) * 100 : 0;
    const convPedNf  = totalPedMes > 0 ? (totalNfMes  / totalPedMes)  * 100 : 0;

    return NextResponse.json({
      kpis: {
        totalMes, deltaMes,
        totalAno: Number(ka[0]),
        qtdNfsAno: Number(ka[1]),
        ticketMedio: Number(km[2]),
        pedidosAbertos: Number(ped[0]),
        valorAbertoPedidos: Number(ped[1]),
        cotacoesAbertas: Number(cot[0]),
        cotacoesGanhas:  Number(cot[1]),
        cotacoesPerdidas: Number(cot[2]),
        aprovacoesPendentes: Number(apr[0]),
        convCotPed, convPedNf,
        qtdNfsMes: totalNfMes,
      },
      sparklines: {
        faturamento: sparkFat,
        acumulado: sparkAcum,
        ticketMedio: sparkTicket,
        convCotPed: sparkConvCotPed,
        convPedNf: sparkConvPedNf,
        metaDiaria: totalMes / diasComMovimento,
      },
      chartMensal: mensalRows.map(r => ({
        label: `${MESES[Number(r[1]) - 1]}/${String(r[0]).slice(2)}`,
        total: Number(r[2]), qtd: Number(r[3]),
      })),
      chartDiario: diario.rows.map(r => ({ dia: Number(r[0]), total: Number(r[1]), qtd: Number(r[2]) })),
      categorias: categorias.rows.map(r => ({ nome: String(r[0]), total: Number(r[1]) })),
      funil: {
        cotacoes: { count: totalCotMes, value: Number(cot[5]) },
        pedidos:  { count: totalPedMes, value: Number(pm[1]) },
        nfs:      { count: totalNfMes,  value: totalMes },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
