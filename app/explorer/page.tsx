"use client";

import { useState, useEffect, useCallback } from "react";

interface TableRow {
  table_name: string;
  table_type: string;
}

interface Column {
  name: string;
  type: string;
  nullable: boolean;
}

interface QueryResult {
  columns: string[];
  rows: unknown[][];
  count: number;
  truncated: boolean;
  error?: string;
}

export default function ExplorerPage() {
  const [health, setHealth] = useState<string>("verificando...");
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loadingTables, setLoadingTables] = useState(true);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [previewData, setPreviewData] = useState<QueryResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setHealth(d.error ? `Erro: ${d.error}` : JSON.stringify(d)))
      .catch((e) => setHealth(`Falha: ${e.message}`));

    fetch("/api/tables")
      .then((r) => r.json())
      .then((d: QueryResult) => {
        if (d.error) return;
        const rows = d.rows.map((r) => ({
          table_name: String(r[0]),
          table_type: String(r[1]),
        }));
        setTables(rows);
      })
      .finally(() => setLoadingTables(false));
  }, []);

  const selectTable = useCallback(async (tableName: string) => {
    setSelectedTable(tableName);
    setColumns([]);
    setPreviewData(null);
    setLoadingSchema(true);

    try {
      const res = await fetch(`/api/schema/${encodeURIComponent(`pref_aruja_sp.${tableName}`)}`);
      const data = await res.json();
      if (Array.isArray(data)) setColumns(data);
    } catch {
      // schema pode não estar disponível via endpoint
    } finally {
      setLoadingSchema(false);
    }

    setLoadingPreview(true);
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sql: `SELECT TOP 5 * FROM pref_aruja_sp.${tableName}`,
          limit: 5,
        }),
      });
      const data = await res.json();
      setPreviewData(data);
    } catch (e) {
      setPreviewData({ columns: [], rows: [], count: 0, truncated: false, error: String(e) });
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  const filtered = tables.filter((t) =>
    t.table_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <h1 className="text-xl font-bold text-blue-400">Explorador — pref_aruja_sp / IQHML</h1>
        <p className="text-xs text-gray-500 mt-1">
          Status:{" "}
          <span className={health.startsWith("Erro") || health.startsWith("Falha") ? "text-red-400" : "text-green-400"}>
            {health}
          </span>
        </p>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Painel esquerdo: lista de tabelas */}
        <aside className="w-72 bg-gray-900 border-r border-gray-800 flex flex-col">
          <div className="p-3 border-b border-gray-800">
            <input
              type="text"
              placeholder="Filtrar tabelas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-gray-800 text-sm text-gray-200 rounded px-3 py-2 outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {loadingTables ? (
              <p className="text-sm text-gray-500 p-4">Carregando tabelas...</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-gray-500 p-4">Nenhuma tabela encontrada.</p>
            ) : (
              filtered.map((t) => (
                <button
                  key={t.table_name}
                  onClick={() => selectTable(t.table_name)}
                  className={`w-full text-left px-4 py-2 text-sm border-b border-gray-800 hover:bg-gray-800 transition-colors ${
                    selectedTable === t.table_name ? "bg-blue-900 text-blue-200" : "text-gray-300"
                  }`}
                >
                  <span className="block truncate">{t.table_name}</span>
                  <span className="text-xs text-gray-500">{t.table_type}</span>
                </button>
              ))
            )}
          </div>
          <div className="p-3 border-t border-gray-800 text-xs text-gray-500">
            {tables.length} tabelas/views
          </div>
        </aside>

        {/* Painel direito: detalhes */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {!selectedTable ? (
            <div className="text-gray-500 text-center mt-20">
              Selecione uma tabela na lista para ver detalhes
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-white">
                pref_aruja_sp.<span className="text-blue-400">{selectedTable}</span>
              </h2>

              {/* Colunas */}
              <section>
                <h3 className="text-sm font-medium text-gray-400 mb-2">Colunas</h3>
                {loadingSchema ? (
                  <p className="text-sm text-gray-500">Carregando schema...</p>
                ) : columns.length > 0 ? (
                  <div className="overflow-x-auto rounded border border-gray-800">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-800 text-gray-400">
                        <tr>
                          <th className="text-left px-3 py-2">Nome</th>
                          <th className="text-left px-3 py-2">Tipo</th>
                          <th className="text-left px-3 py-2">Nullable</th>
                        </tr>
                      </thead>
                      <tbody>
                        {columns.map((c, i) => (
                          <tr key={i} className="border-t border-gray-800 hover:bg-gray-800/50">
                            <td className="px-3 py-2 font-mono text-blue-300">{c.name}</td>
                            <td className="px-3 py-2 text-yellow-300">{c.type}</td>
                            <td className="px-3 py-2 text-gray-400">{c.nullable ? "sim" : "não"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    Schema não disponível via endpoint — veja os dados na prévia abaixo.
                  </p>
                )}
              </section>

              {/* Prévia */}
              <section>
                <h3 className="text-sm font-medium text-gray-400 mb-2">Prévia (TOP 5)</h3>
                {loadingPreview ? (
                  <p className="text-sm text-gray-500">Carregando dados...</p>
                ) : previewData?.error ? (
                  <p className="text-sm text-red-400">Erro: {previewData.error}</p>
                ) : previewData && previewData.columns.length > 0 ? (
                  <div className="overflow-x-auto rounded border border-gray-800">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-800 text-gray-400">
                        <tr>
                          {previewData.columns.map((col) => (
                            <th key={col} className="text-left px-3 py-2 whitespace-nowrap">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.rows.map((row, i) => (
                          <tr key={i} className="border-t border-gray-800 hover:bg-gray-800/50">
                            {(row as unknown[]).map((cell, j) => (
                              <td key={j} className="px-3 py-2 whitespace-nowrap text-gray-300">
                                {cell === null ? (
                                  <span className="text-gray-600">null</span>
                                ) : (
                                  String(cell)
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Sem dados.</p>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
