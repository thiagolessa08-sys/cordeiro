import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/sybase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sql, limit } = body as { sql: string; limit?: number };

    if (!sql || typeof sql !== "string") {
      return NextResponse.json({ error: "Campo 'sql' obrigatório" }, { status: 400 });
    }

    const normalized = sql.trim().toUpperCase();
    if (!normalized.startsWith("SELECT") && !normalized.startsWith("WITH")) {
      return NextResponse.json({ error: "Apenas SELECT é permitido" }, { status: 400 });
    }

    const data = await executeQuery(sql, limit ?? 500);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
