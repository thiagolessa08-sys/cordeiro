import { NextResponse } from "next/server";
import { checkHealth } from "@/lib/sybase";

export async function GET() {
  try {
    const data = await checkHealth();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
