import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAiSettings,
  fetchModels,
  fetchReport,
  fetchReports,
  generateReport,
  saveAiModel,
  type AiReportFull,
} from "../aiApi";
import ChatPanel from "../components/ChatPanel";

function markdownToHtml(md: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = md.split("\n");
  const html: string[] = [];
  let inList = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^##\s+/.test(line)) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      html.push(`<h3 class="mt-3 mb-1 text-sm font-semibold text-slate-100">${escape(line.replace(/^##\s+/, ""))}</h3>`);
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        html.push('<ul class="list-disc space-y-1 pl-5">');
        inList = true;
      }
      html.push(`<li class="text-sm text-slate-300">${inline(escape(line.replace(/^[-*]\s+/, "")))}</li>`);
    } else if (line.trim() === "") {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
    } else {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      html.push(`<p class="text-sm text-slate-300">${inline(escape(line))}</p>`);
    }
  }
  if (inList) html.push("</ul>");
  return html.join("\n");
}

function inline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-slate-100">$1</strong>')
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

export default function AiPage() {
  const queryClient = useQueryClient();
  const models = useQuery({ queryKey: ["aiModels"], queryFn: fetchModels, staleTime: 3600_000 });
  const settings = useQuery({ queryKey: ["aiSettings"], queryFn: fetchAiSettings });
  const reports = useQuery({ queryKey: ["aiReports"], queryFn: fetchReports });
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [activeReport, setActiveReport] = useState<AiReportFull | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  const selectedReport = useQuery({
    queryKey: ["aiReport", selectedReportId],
    queryFn: () => fetchReport(selectedReportId!),
    enabled: selectedReportId != null,
  });

  const saveModel = useMutation({
    mutationFn: saveAiModel,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["aiSettings"] }),
  });

  const report = useMutation({
    mutationFn: generateReport,
    onSuccess: (data) => {
      setReportError(null);
      setActiveReport(data);
      setSelectedReportId(data.id);
      queryClient.invalidateQueries({ queryKey: ["aiReports"] });
    },
    onError: (e) => setReportError((e as Error).message),
  });

  const currentModel = settings.data?.model ?? "";
  const modelOptions = (models.data ?? []).slice(0, 400);
  const shownReport = activeReport ?? selectedReport.data ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <ChatPanel />

      <div className="space-y-4">
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">Model</h2>
          {models.isError ? (
            <p className="text-xs text-rose-400">Failed to load models: {(models.error as Error).message}</p>
          ) : models.isLoading || settings.isLoading ? (
            <p className="text-xs text-slate-500">Loading…</p>
          ) : (
            <select
              value={currentModel}
              onChange={(e) => saveModel.mutate(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
            >
              {!currentModel ? <option value="">Select a model…</option> : null}
              {modelOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          {saveModel.isSuccess && !saveModel.isPending ? (
            <p className="mt-2 text-xs text-emerald-400">Model saved</p>
          ) : null}
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Reports</h2>
            <div className="flex gap-2">
              <button
                onClick={() => report.mutate("daily")}
                disabled={report.isPending}
                className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {report.isPending ? "Generating…" : "Daily check-in"}
              </button>
              <button
                onClick={() => report.mutate("weekly")}
                disabled={report.isPending}
                className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                Weekly analysis
              </button>
            </div>
          </div>
          {reportError ? <p className="mb-2 text-xs text-rose-400">{reportError}</p> : null}
          {reports.data && reports.data.length > 0 ? (
            <ul className="mb-3 max-h-28 space-y-1 overflow-y-auto">
              {reports.data.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => {
                      setSelectedReportId(r.id);
                      setActiveReport(null);
                    }}
                    className={`w-full rounded-md px-2 py-1 text-left text-xs ${
                      selectedReportId === r.id
                        ? "bg-slate-700 text-slate-100"
                        : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    }`}
                  >
                    {r.period === "daily" ? "Daily" : "Weekly"} · {r.range_end} · {r.model.split("/").pop()}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-xs text-slate-500">No reports yet — generate your first one above.</p>
          )}
          {report.isPending ? (
            <div className="flex h-24 items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-700 border-t-sky-400" />
            </div>
          ) : selectedReport.isError ? (
            <p className="text-xs text-rose-400">Failed to load report: {(selectedReport.error as Error).message}</p>
          ) : selectedReport.isLoading && selectedReportId != null && !shownReport ? (
            <div className="flex h-24 items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-700 border-t-sky-400" />
            </div>
          ) : shownReport ? (
            <article
              className="max-h-72 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900 p-3"
              dangerouslySetInnerHTML={{ __html: markdownToHtml(shownReport.content) }}
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}
