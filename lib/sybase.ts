// Env vars lidas em runtime para não quebrar o build do Railway
const getEnv = () => {
  const url = process.env.AGENT_URL;
  const key = process.env.AGENT_API_KEY;
  if (!url) throw new Error("AGENT_URL não definida nas variáveis de ambiente");
  if (!key) throw new Error("AGENT_API_KEY não definida nas variáveis de ambiente");
  return { url, key };
};

export interface QueryResult {
  columns: string[];
  rows:    unknown[][];
  count:   number;
  truncated: boolean;
}

export interface TableInfo  { name: string; type: string }
export interface TablesResponse { tables: TableInfo[] }
export interface ColumnInfo { name: string; type: string; nullable: boolean }
export interface HealthStatus { status: string; database?: string; [k: string]: unknown }

export async function checkHealth(): Promise<HealthStatus> {
  const { url, key } = getEnv();
  const res = await fetch(`${url}/health`, {
    headers: { "Content-Type": "application/json", "X-API-Key": key },
  });
  if (!res.ok) throw new Error(`Health check falhou: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function listTables(): Promise<TablesResponse> {
  const { url, key } = getEnv();
  const res = await fetch(`${url}/tables`, {
    headers: { "Content-Type": "application/json", "X-API-Key": key },
  });
  if (!res.ok) throw new Error(`Falha ao listar tabelas: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function getSchema(table: string): Promise<ColumnInfo[]> {
  const { url, key } = getEnv();
  const res = await fetch(`${url}/schema/${encodeURIComponent(table)}`, {
    headers: { "Content-Type": "application/json", "X-API-Key": key },
  });
  if (!res.ok) throw new Error(`Falha ao buscar schema de ${table}: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function executeQuery(sql: string, limit = 500): Promise<QueryResult> {
  const { url, key } = getEnv();
  const res = await fetch(`${url}/query`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": key },
    body:    JSON.stringify({ sql, limit }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Query falhou: ${res.status} ${res.statusText} — ${err}`);
  }
  return res.json();
}

export async function listSchemaTables(schema = "cordeiro"): Promise<QueryResult> {
  const sql = `
    SELECT table_name, table_type
    FROM sys.systable
    WHERE user_name(creator) = '${schema}'
    AND table_type IN ('BASE', 'VIEW')
    ORDER BY table_name
  `;
  return executeQuery(sql, 1000);
}
