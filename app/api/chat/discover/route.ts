import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/sybase";

const TABLES = [
  "COTACOES_SAP_PRODUCAO",
  "ENTREGA_SAP_PRODUCAO",
  "FATURAADIANTAMENTO_SAP_PRODUCAO",
];

export async function GET() {
  const results: Record<string, { columns: string[]; sample: unknown[][] }> = {};

  for (const t of TABLES) {
    try {
      const r = await executeQuery(
        `SELECT TOP 2 * FROM cordeiro.${t}`, 2
      );
      results[t] = { columns: r.columns, sample: r.rows };
    } catch (e) {
      results[t] = { columns: [`ERRO: ${(e as Error).message}`], sample: [] };
    }
  }

  return NextResponse.json(results);
}
