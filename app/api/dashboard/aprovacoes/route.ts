import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/sybase";

// DocumentType codes in SAP B1
// 17 = Pedido de Venda   23 = Cotação   14 = Nota Crédito
const TYPE_LABEL: Record<number, string> = { 17: "Pedido", 23: "Cotação", 14: "Crédito" };

export async function GET() {
  try {
    const [
      kpiPendentes,
      kpiPendentesAnt,
      kpiTempo,
      kpiSla,
      etapas,
      aprovadores,
      fila,
      tiposDist,
    ] = await Promise.all([

      // ── Pendentes agora (documento-nível)
      executeQuery(`
        SELECT
          COUNT(*)                                              AS total,
          COUNT(CASE WHEN DATEDIFF(day, DocumentItemCreationDate, TODAY()) > 3
                     THEN 1 END)                              AS alta_prio,
          COUNT(DISTINCT CAST(CAST(DocumentApproverName AS FLOAT) AS INTEGER)) AS aprovadores_ativos
        FROM cordeiro.APROVACOES_SAP_PRODUCAO
        WHERE DocumentApprovalStatus = 'W'
      `, 1),

      // ── Pendentes mês anterior (criados no mês ant)
      executeQuery(`
        SELECT COUNT(*) AS total_ant
        FROM cordeiro.APROVACOES_SAP_PRODUCAO
        WHERE DocumentApprovalStatus = 'W'
          AND YEAR(DocumentCreationDate)  = 2026
          AND MONTH(DocumentCreationDate) = 3
      `, 1),

      // ── Tempo médio de aprovação (itens aprovados nos últimos 30 dias)
      executeQuery(`
        SELECT
          AVG(CAST(DATEDIFF(day, DocumentItemCreationDate, DocumentItemApprovalDate) AS FLOAT)) AS tempo_medio,
          COUNT(*) AS total_aprovados_30d
        FROM cordeiro.APROVACOES_SAP_PRODUCAO
        WHERE DocumentItemApprovalStatus = 'Y'
          AND DocumentItemApprovalDate >= DATEADD(day, -30, TODAY())
          AND DocumentItemApprovalDate >= DocumentItemCreationDate
      `, 1),

      // ── SLA cumprido (aprovados em <= 2 dias / total aprovados, últimos 30d)
      executeQuery(`
        SELECT
          COUNT(*) AS total_ap,
          COUNT(CASE
            WHEN DATEDIFF(day, DocumentItemCreationDate, DocumentItemApprovalDate) <= 2
            THEN 1 END) AS dentro_sla
        FROM cordeiro.APROVACOES_SAP_PRODUCAO
        WHERE DocumentItemApprovalStatus = 'Y'
          AND DocumentItemApprovalDate >= DATEADD(day, -30, TODAY())
          AND DocumentItemApprovalDate >= DocumentItemCreationDate
      `, 1),

      // ── Etapas: pendentes por DocumentCurrStepName
      executeQuery(`
        SELECT
          DocumentCurrStepName                              AS etapa,
          COUNT(*)                                          AS qtd,
          AVG(CAST(DATEDIFF(day, DocumentItemCreationDate, TODAY()) AS FLOAT)) AS dias_medio
        FROM cordeiro.APROVACOES_SAP_PRODUCAO
        WHERE DocumentApprovalStatus = 'W'
          AND DocumentCurrStepName IS NOT NULL
          AND TRIM(DocumentCurrStepName) <> ''
        GROUP BY DocumentCurrStepName
        ORDER BY qtd DESC
      `, 10),

      // ── Aprovadores: pendentes + aprovados 30d + SLA por código
      executeQuery(`
        SELECT
          CAST(CAST(DocumentApproverName AS FLOAT) AS INTEGER) AS aprov_code,
          COUNT(CASE WHEN DocumentApprovalStatus = 'W' THEN 1 END) AS pendentes,
          COUNT(CASE WHEN DocumentItemApprovalStatus = 'Y'
                      AND DocumentItemApprovalDate >= DATEADD(day, -30, TODAY())
                      THEN 1 END) AS aprovados_30d,
          AVG(CASE WHEN DocumentItemApprovalStatus = 'Y'
                    AND DocumentItemApprovalDate >= DocumentItemCreationDate
                   THEN CAST(DATEDIFF(day, DocumentItemCreationDate, DocumentItemApprovalDate) AS FLOAT)
                   ELSE NULL END) AS tempo_medio,
          COUNT(CASE WHEN DocumentItemApprovalStatus = 'Y'
                      AND DocumentItemApprovalDate >= DATEADD(day, -30, TODAY())
                      AND DATEDIFF(day, DocumentItemCreationDate, DocumentItemApprovalDate) <= 2
                      THEN 1 END) AS dentro_sla_30d
        FROM cordeiro.APROVACOES_SAP_PRODUCAO
        WHERE DocumentApproverName IS NOT NULL
          AND CAST(CAST(DocumentApproverName AS FLOAT) AS INTEGER) > 0
        GROUP BY CAST(CAST(DocumentApproverName AS FLOAT) AS INTEGER)
        ORDER BY pendentes DESC
      `, 10),

      // ── Fila: TOP 100 pendentes com detalhes
      executeQuery(`
        SELECT TOP 100
          CAST(CAST(DocumentType AS FLOAT) AS INTEGER)    AS tipo,
          DocumentDate                                     AS doc_date,
          DocumentCurrStepName                            AS etapa,
          CAST(CAST(DocumentApproverName AS FLOAT) AS INTEGER) AS aprov_code,
          DATEDIFF(day, DocumentItemCreationDate, TODAY()) AS dias_espera,
          DocumentItemCreationDate                         AS criacao
        FROM cordeiro.APROVACOES_SAP_PRODUCAO
        WHERE DocumentApprovalStatus = 'W'
        ORDER BY dias_espera DESC
      `, 100),

      // ── Distribuição por tipo (para tabs)
      executeQuery(`
        SELECT
          CAST(CAST(DocumentType AS FLOAT) AS INTEGER) AS tipo,
          COUNT(*) AS qtd
        FROM cordeiro.APROVACOES_SAP_PRODUCAO
        WHERE DocumentApprovalStatus = 'W'
        GROUP BY CAST(CAST(DocumentType AS FLOAT) AS INTEGER)
      `, 20),
    ]);

    /* ── Extrair linhas ────────────────────────────────── */
    const kp  = kpiPendentes.rows[0]    as number[];
    const kpa = kpiPendentesAnt.rows[0] as number[];
    const kt  = kpiTempo.rows[0]        as number[];
    const ks  = kpiSla.rows[0]          as number[];

    const totalPend   = Number(kp[0]);
    const altaPrio    = Number(kp[1]);
    const aprovAtivos = Number(kp[2]);
    const totalAnt    = Number(kpa[0]);
    const deltaMoM    = totalAnt > 0 ? ((totalPend - totalAnt) / totalAnt) * 100 : null;

    const tempoMedio  = Number(kt[0]) || 0;
    const aprovados30 = Number(kt[1]);

    const totalSla    = Number(ks[0]);
    const dentreSla   = Number(ks[1]);
    const slaPct      = totalSla > 0 ? (dentreSla / totalSla) * 100 : 0;

    /* ── Etapas ────────────────────────────────────────── */
    const etapasData = (etapas.rows as (string | number)[][]).map((r, i) => ({
      idx:       i + 1,
      etapa:     String(r[0]).trim(),
      qtd:       Number(r[1]),
      diasMedio: Number(r[2]) || 0,
    }));

    const maxQtdEtapa = Math.max(...etapasData.map(e => e.qtd), 1);

    /* ── Aprovadores ───────────────────────────────────── */
    const aprovadoresData = (aprovadores.rows as number[][])
      .slice(0, 8)
      .map(r => {
        const code       = Number(r[0]);
        const pend       = Number(r[1]);
        const aprov30    = Number(r[2]);
        const tempo      = Number(r[3]) || 0;
        const slaCnt     = Number(r[4]);
        const slaPctAprov= aprov30 > 0 ? (slaCnt / aprov30) * 100 : 0;
        const a = String.fromCharCode(65 + (code % 26));
        const b = String.fromCharCode(65 + (Math.floor(code / 26) % 26));
        return {
          code,
          label: `Cód. ${code}`,
          initials: a + b,
          pendentes: pend,
          aprovados30d: aprov30,
          tempoMedio: tempo,
          slaPct: slaPctAprov,
        };
      });

    /* ── Fila ──────────────────────────────────────────── */
    const filaData = (fila.rows as (string | number)[][]).map((r, i) => {
      const tipo      = Number(r[0]);
      const docDate   = String(r[1]).slice(0, 10);
      const etapa     = String(r[2]).trim();
      const aprovCode = Number(r[3]);
      const dias      = Number(r[4]);
      const prioridade= dias > 3 ? "Alta" : dias > 1 ? "Média" : "Baixa";
      const tipoLabel = TYPE_LABEL[tipo] ?? "Documento";
      return { idx: i + 1, tipo, tipoLabel, docDate, etapa, aprovCode, dias, prioridade };
    });

    /* ── Distribuição por tipo ─────────────────────────── */
    const tiposMap = new Map(
      (tiposDist.rows as number[][]).map(r => [Number(r[0]), Number(r[1])])
    );

    return NextResponse.json({
      kpis: {
        totalPend, deltaMoM, altaPrio, aprovAtivos,
        tempoMedio, aprovados30,
        slaPct,
      },
      etapas: etapasData,
      maxQtdEtapa,
      aprovadores: aprovadoresData,
      fila: filaData,
      tiposDist: {
        pedidos:  tiposMap.get(17) ?? 0,
        cotacoes: tiposMap.get(23) ?? 0,
        creditos: tiposMap.get(14) ?? 0,
        outros:   [...tiposMap.entries()].filter(([k]) => ![17,23,14].includes(k)).reduce((a,[,v]) => a+v, 0),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
