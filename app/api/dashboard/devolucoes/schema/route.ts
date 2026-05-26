import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/sybase";

export async function GET() {
  try {
    const [sample, cnt] = await Promise.all([
      executeQuery(
        "SELECT TOP 3 * FROM cordeiro.APROVACAOCREDITO_SAP_PRODUCAO",
        3
      ),
      executeQuery(
        "SELECT COUNT(*) AS total FROM cordeiro.APROVACAOCREDITO_SAP_PRODUCAO",
        1
      ),
    ]);

    return NextResponse.json({
      columns: sample.columns,
      rows:    sample.rows,
      total:   cnt.rows[0],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
