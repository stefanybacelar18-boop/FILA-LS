"use client";

import { useRef, useState } from "react";

// ── tipos ──────────────────────────────────────────────────────────────────

interface MinutaRow {
  minuta: string;
  qtdMotos: number;
  status: string;
  saidaBelem: string | null;
  dataChegada: string | null;
  descarregamento: string | null;
  eta: string | null;
}

interface ApiResult {
  descarregadasHoje: MinutaRow[];
  emTransito: MinutaRow[];
  atrasadas: MinutaRow[];
  porEta: Record<string, MinutaRow[]>;
  semData: MinutaRow[];
  totalMinutas: number;
  totalMotos: number;
  motosExpedidas: number;
  frotatmsViagens: number;
  voloFile: string;
  relatorioFile: string;
  voloAtualizado: boolean;
  error?: string;
}

// ── helpers ────────────────────────────────────────────────────────────────

function downloadB64(b64: string, filename: string) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function todayLabel() {
  return new Date().toLocaleDateString("pt-BR");
}

function todayFileSuffix() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}${mm}${yy}`;
}

// ── componentes ────────────────────────────────────────────────────────────

function UploadBox({
  label,
  hint,
  accept,
  file,
  onChange,
  required,
}: {
  label: string;
  hint: string;
  accept: string;
  file: File | null;
  onChange: (f: File | null) => void;
  required?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div
      onClick={() => ref.current?.click()}
      className={`
        relative flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed
        cursor-pointer transition-colors min-h-[120px]
        ${file
          ? "border-green-500 bg-green-50"
          : "border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50"
        }
      `}
    >
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <>
          <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm font-semibold text-green-700">{file.name}</p>
          <p className="text-xs text-green-600">{(file.size / 1024).toFixed(0)} KB — clique para trocar</p>
        </>
      ) : (
        <>
          <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-sm font-semibold text-gray-700">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </p>
          <p className="text-xs text-gray-500">{hint}</p>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color = "blue" }: {
  label: string; value: string | number; sub?: string;
  color?: "blue" | "green" | "orange" | "gray";
}) {
  const colors = {
    blue:   "bg-blue-50 border-blue-200 text-blue-700",
    green:  "bg-green-50 border-green-200 text-green-700",
    orange: "bg-orange-50 border-orange-200 text-orange-700",
    gray:   "bg-gray-50 border-gray-200 text-gray-600",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
      <p className="text-3xl font-bold">{value}</p>
      {sub && <p className="text-xs opacity-60 mt-1">{sub}</p>}
    </div>
  );
}

// ── página principal ───────────────────────────────────────────────────────

export default function AutomacaoVoluPage() {
  const [chronusFile, setChronusFile] = useState<File | null>(null);
  const [voloFile, setVoloFile]       = useState<File | null>(null);
  const [loading, setLoading]         = useState(false);
  const [result, setResult]           = useState<ApiResult | null>(null);
  const [error, setError]             = useState("");
  const [activeTab, setActiveTab]     = useState<"descarregadas" | "transito" | "atrasadas">("descarregadas");

  async function processar() {
    if (!chronusFile) { setError("Selecione o arquivo do Chronus primeiro."); return; }
    setError("");
    setLoading(true);
    setResult(null);

    try {
      const form = new FormData();
      form.append("chronus", chronusFile);
      if (voloFile) form.append("volo", voloFile);

      const resp = await fetch("/api/automacao-volu", { method: "POST", body: form });
      const data: ApiResult = await resp.json();

      if (data.error) { setError(data.error); return; }
      setResult(data);
      setActiveTab("descarregadas");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Automação Volu Recebimento</h1>
            <p className="text-xs text-gray-500">LSL / SIF — {todayLabel()}</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Upload */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            1. Selecione os arquivos
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UploadBox
              label="Chegada de Carreta — Chronus"
              hint="Arquivo .xls exportado do Chronus"
              accept=".xls,.xlsx"
              file={chronusFile}
              onChange={setChronusFile}
              required
            />
            <UploadBox
              label="Volu Recebimento (opcional)"
              hint="Planilha .xlsx para preenchimento automático"
              accept=".xlsx,.xlsm"
              file={voloFile}
              onChange={setVoloFile}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm">
              <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          <button
            onClick={processar}
            disabled={!chronusFile || loading}
            className="w-full py-3 rounded-xl font-semibold text-white transition-all
              bg-blue-600 hover:bg-blue-700 active:scale-95
              disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Processando... consultando FrotaTMS
              </span>
            ) : (
              "Processar"
            )}
          </button>
        </div>

        {/* Resultado */}
        {result && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Minutas hoje" value={result.totalMinutas} color="blue" />
              <StatCard label="Motos recebidas" value={result.totalMotos.toLocaleString("pt-BR")} sub="Chronus" color="green" />
              <StatCard
                label="Motos expedidas"
                value={result.motosExpedidas > 0 ? result.motosExpedidas.toLocaleString("pt-BR") : "—"}
                sub={result.frotatmsViagens > 0 ? `${result.frotatmsViagens} viagens FrotaTMS` : "FrotaTMS indisponível"}
                color={result.motosExpedidas > 0 ? "blue" : "gray"}
              />
              <StatCard
                label="Atrasadas"
                value={result.atrasadas.length}
                sub={result.atrasadas.length > 0 ? `${result.atrasadas.reduce((s, r) => s + r.qtdMotos, 0)} motos` : "nenhuma"}
                color={result.atrasadas.length > 0 ? "orange" : "green"}
              />
            </div>

            {/* Previsão de chegadas */}
            {Object.keys(result.porEta).length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
                  Previsão de chegadas — Saída Belém + 5 dias
                </h2>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(result.porEta).map(([eta, lista]) => {
                    const totalM = lista.reduce((s, r) => s + r.qtdMotos, 0);
                    const isToday = eta === todayLabel();
                    return (
                      <div
                        key={eta}
                        className={`rounded-xl px-4 py-3 border min-w-[120px]
                          ${isToday ? "bg-blue-50 border-blue-300" : "bg-gray-50 border-gray-200"}`}
                      >
                        <p className={`text-xs font-semibold ${isToday ? "text-blue-700" : "text-gray-500"}`}>{eta}</p>
                        <p className={`text-2xl font-bold ${isToday ? "text-blue-800" : "text-gray-800"}`}>
                          {totalM.toLocaleString("pt-BR")}
                        </p>
                        <p className="text-xs text-gray-500">{lista.length} minutas</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tabs de detalhe */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="flex border-b border-gray-200">
                {([
                  { id: "descarregadas", label: `Descarregadas (${result.totalMinutas})` },
                  { id: "transito", label: `Em Trânsito (${result.emTransito.length})` },
                  { id: "atrasadas", label: `Atrasadas (${result.atrasadas.length})` },
                ] as const).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`flex-1 px-4 py-3 text-sm font-medium transition-colors
                      ${activeTab === t.id
                        ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50"
                        : "text-gray-500 hover:text-gray-700"
                      }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="overflow-x-auto">
                {activeTab === "descarregadas" && (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">Minuta</th>
                        <th className="px-4 py-3 text-left">Saída Belém</th>
                        <th className="px-4 py-3 text-left">Chegada</th>
                        <th className="px-4 py-3 text-left">Descarga</th>
                        <th className="px-4 py-3 text-right">Motos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {result.descarregadasHoje.map((m) => (
                        <tr key={m.minuta} className="hover:bg-green-50">
                          <td className="px-4 py-2 font-mono font-semibold">{m.minuta}</td>
                          <td className="px-4 py-2 text-gray-500">{m.saidaBelem ?? "—"}</td>
                          <td className="px-4 py-2">{m.dataChegada ?? "—"}</td>
                          <td className="px-4 py-2">{m.descarregamento ?? "—"}</td>
                          <td className="px-4 py-2 text-right font-semibold">{m.qtdMotos}</td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50 font-semibold">
                        <td className="px-4 py-2" colSpan={4}>Total</td>
                        <td className="px-4 py-2 text-right">{result.totalMotos.toLocaleString("pt-BR")}</td>
                      </tr>
                    </tbody>
                  </table>
                )}

                {activeTab === "transito" && (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">Minuta</th>
                        <th className="px-4 py-3 text-left">Saída Belém</th>
                        <th className="px-4 py-3 text-left">Previsão Chegada</th>
                        <th className="px-4 py-3 text-right">Motos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {Object.entries(result.porEta).flatMap(([eta, lista]) =>
                        lista.map((m) => (
                          <tr key={m.minuta} className="hover:bg-blue-50">
                            <td className="px-4 py-2 font-mono font-semibold">{m.minuta}</td>
                            <td className="px-4 py-2 text-gray-500">{m.saidaBelem ?? "—"}</td>
                            <td className="px-4 py-2 font-medium text-blue-700">{eta}</td>
                            <td className="px-4 py-2 text-right">{m.qtdMotos}</td>
                          </tr>
                        ))
                      )}
                      {result.semData.map((m) => (
                        <tr key={m.minuta} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-mono">{m.minuta}</td>
                          <td className="px-4 py-2 text-gray-400">—</td>
                          <td className="px-4 py-2 text-gray-400 italic">Sem data de saída</td>
                          <td className="px-4 py-2 text-right">{m.qtdMotos}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {activeTab === "atrasadas" && (
                  result.atrasadas.length === 0 ? (
                    <div className="flex items-center justify-center py-12 text-green-600 gap-2">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="font-medium">Nenhuma minuta atrasada</span>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-orange-50 text-orange-700 text-xs uppercase">
                        <tr>
                          <th className="px-4 py-3 text-left">Minuta</th>
                          <th className="px-4 py-3 text-left">Saída Belém</th>
                          <th className="px-4 py-3 text-left">Previsão Era</th>
                          <th className="px-4 py-3 text-right">Dias Atraso</th>
                          <th className="px-4 py-3 text-right">Motos</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-orange-100">
                        {result.atrasadas.map((m) => (
                          <tr key={m.minuta} className="bg-orange-50 hover:bg-orange-100">
                            <td className="px-4 py-2 font-mono font-semibold text-orange-800">{m.minuta}</td>
                            <td className="px-4 py-2 text-orange-600">{m.saidaBelem ?? "—"}</td>
                            <td className="px-4 py-2 text-orange-600">{m.eta ?? "—"}</td>
                            <td className="px-4 py-2 text-right font-bold text-orange-700">
                              {m.eta
                                ? Math.round((Date.now() - new Date(m.eta).getTime()) / 86_400_000)
                                : "?"}
                            </td>
                            <td className="px-4 py-2 text-right">{m.qtdMotos}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                )}
              </div>
            </div>

            {/* Downloads */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
                2. Baixar arquivos gerados
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {result.voloFile && (
                  <button
                    onClick={() => downloadB64(result.voloFile, `Volu_Recebimento_ATUALIZADO_${todayFileSuffix()}.xlsx`)}
                    className="flex items-center gap-3 p-4 rounded-xl border-2 border-green-400 bg-green-50
                      hover:bg-green-100 transition-colors text-left"
                  >
                    <svg className="w-8 h-8 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                    </svg>
                    <div>
                      <p className="font-semibold text-green-800 text-sm">Volu Recebimento Atualizado</p>
                      <p className="text-xs text-green-600">
                        {result.voloAtualizado
                          ? `Linha de ${todayLabel()} preenchida: ${result.totalMinutas} minutas · ${result.totalMotos} motos`
                          : "Data de hoje não encontrada — verifique o arquivo"}
                      </p>
                    </div>
                  </button>
                )}

                <button
                  onClick={() => downloadB64(result.relatorioFile, `RELATORIO_TRANSITO_${todayFileSuffix()}.xlsx`)}
                  className="flex items-center gap-3 p-4 rounded-xl border-2 border-blue-400 bg-blue-50
                    hover:bg-blue-100 transition-colors text-left"
                >
                  <svg className="w-8 h-8 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                  </svg>
                  <div>
                    <p className="font-semibold text-blue-800 text-sm">Relatório de Trânsito</p>
                    <p className="text-xs text-blue-600">
                      {result.emTransito.length + result.atrasadas.length} minutas em trânsito
                      {result.atrasadas.length > 0 ? ` · ${result.atrasadas.length} atrasadas` : ""}
                    </p>
                  </div>
                </button>
              </div>

              {result.motosExpedidas === 0 && (
                <p className="mt-3 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                  FrotaTMS sem viagens registradas hoje. A coluna "Motos Expedidas" do Volu ficou em branco
                  — preencha manualmente com o valor do dia.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
