const AGENT_URL = process.env.AGENT_URL;
const AGENT_API_KEY = process.env.AGENT_API_KEY;

if (!AGENT_URL) throw new Error("AGENT_URL não definida nas variáveis de ambiente");
if (!AGENT_API_KEY) throw new Error("AGENT_API_KEY não definida nas variáveis de ambiente");

const headers = {
  "Content-Type": "application/json",
  "X-API-Key": AGENT_API_KEY,
};

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  count: number;
  truncated: boolean;
}

export interface TableInfo {
  name: string;
  type: string;
}

export interface TablesResponse {
  tables: TableInfo[];
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}

export interface HealthStatus {
  status: string;
  database?: string;
  [key: string]: unknown;
}

export async function checkHealth(): Promise<HealthStatus> {
  const res = await fetch(`${AGENT_URL}/health`, { headers });
  if (!res.ok) throw new Error(`Health check falhou: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function listTables(): Promise<TablesResponse> {
  const res = await fetch(`${AGENT_URL}/tables`, { headers });
  if (!res.ok) throw new Error(`Falha ao listar tabelas: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function getSchema(table: string): Promise<ColumnInfo[]> {
  const res = await fetch(`${AGENT_URL}/schema/${encodeURIComponent(table)}`, { headers });
  if (!res.ok) throw new Error(`Falha ao buscar schema de ${table}: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function executeQuery(sql: string, limit = 500): Promise<QueryResult> {
  const res = await fetch(`${AGENT_URL}/query`, {
    method: "POST",
    headers,
    body: JSON.stringify({ sql, limit }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Query falhou: ${res.status} ${res.statusText} — ${err}`);
  }
  return res.json();
}

export async function listSchemaTables(schema = "pref_aruja_sp"): Promise<QueryResult> {
  const sql = `
    SELECT table_name, table_type
    FROM sys.systable
    WHERE user_name(creator) = '${schema}'
    AND table_type IN ('BASE', 'VIEW')
    ORDER BY table_name
  `;
  return executeQuery(sql, 1000);
}
