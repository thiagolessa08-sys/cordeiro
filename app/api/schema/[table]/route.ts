import { NextResponse } from "next/server";
import { getSchema } from "@/lib/sybase";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ table: string }> }
) {
  const { table } = await params;
  try {
    const data = await getSchema(table);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
