import { NextResponse } from "next/server";
import { listTables } from "@/lib/sybase";

const SYSTEM_PREFIXES = ["ISYS", "SYS", "sa_", "spt_", "ix_", "rs_", "ST_", "jdbc", "migrate", "RowGenerator", "DUMMY", "EXCLUDEOBJECT", "ES_STATISTICS", "SYSOPTIONDEFAULTS"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const showSystem = searchParams.get("system") === "true";

  try {
    const data = await listTables();
    let tables = data.tables.map((t) => ({
      name: t.name.trim(),
      type: t.type.trim(),
    }));

    if (!showSystem) {
      tables = tables.filter(
        (t) => !SYSTEM_PREFIXES.some((p) => t.name.startsWith(p))
      );
    }

    return NextResponse.json({ tables });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
