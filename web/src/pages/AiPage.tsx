import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FileText, Sparkles } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
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
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

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
      html.push(
        `<h3 class="mt-3 mb-1.5 text-sm font-semibold text-foreground">${escape(line.replace(/^##\s+/, ""))}</h3>`
      );
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        html.push('<ul class="list-disc space-y-1.5 pl-5">');
        inList = true;
      }
      html.push(
        `<li class="text-sm leading-relaxed text-muted-foreground">${inline(escape(line.replace(/^[-*]\s+/, "")))}</li>`
      );
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
      html.push(`<p class="text-sm leading-relaxed text-muted-foreground">${inline(escape(line))}</p>`);
    }
  }
  if (inList) html.push("</ul>");
  return html.join("\n");
}

function inline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-medium text-foreground">$1</strong>')
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

export default function AiPage() {
  const queryClient = useQueryClient();
  const models = useQuery({ queryKey: ["aiModels"], queryFn: fetchModels, staleTime: 3600_000 });
  const settings = useQuery({ queryKey: ["aiSettings"], queryFn: fetchAiSettings });
  const [reportsPage, setReportsPage] = useState(1);
  const reports = useQuery({
    queryKey: ["aiReports", reportsPage],
    queryFn: () => fetchReports(reportsPage, 5),
  });
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [activeReport, setActiveReport] = useState<AiReportFull | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [generating, setGenerating] = useState<"daily" | "weekly" | null>(null);

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
    onMutate: (period) => setGenerating(period),
    onSettled: () => setGenerating(null),
    onSuccess: (data) => {
      setReportError(null);
      setActiveReport(data);
      setSelectedReportId(data.id);
      setReportsPage(1);
      queryClient.invalidateQueries({ queryKey: ["aiReports"] });
    },
    onError: (e) => setReportError((e as Error).message),
  });

  const currentModel = settings.data?.model ?? "";
  const shownReport = activeReport ?? selectedReport.data ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <ChatPanel />

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Model</CardTitle>
            <CardDescription>
              Selected model is stored server-side; your API key never reaches the browser.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {models.isError ? (
              <p className="text-sm text-destructive">
                Failed to load models: {(models.error as Error).message}
              </p>
            ) : models.isLoading || settings.isLoading ? (
              <div className="h-9 rounded bg-muted/40" />
            ) : (
              <Select
                value={currentModel || undefined}
                onValueChange={(v) => saveModel.mutate(String(v))}
                items={(models.data ?? []).map((m) => ({ value: m.id, label: m.name }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a model…" />
                </SelectTrigger>
                <SelectContent>
                  {(models.data ?? []).slice(0, 400).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {saveModel.isSuccess && !saveModel.isPending ? (
              <p className="mt-2 text-xs text-emerald-400">Model saved</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reports</CardTitle>
            <CardDescription>
              Structured analysis of your recent data, generated and stored on demand.
            </CardDescription>
            <CardAction>
              <ButtonGroup>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => report.mutate("daily")}
                  disabled={generating === "daily"}
                >
                  {generating === "daily" ? <Spinner /> : <Sparkles />}
                  Daily
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => report.mutate("weekly")}
                  disabled={generating === "weekly"}
                >
                  {generating === "weekly" ? <Spinner /> : <FileText />}
                  Weekly
                </Button>
              </ButtonGroup>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {reportError ? <p className="text-xs text-destructive">{reportError}</p> : null}

            <div>
              {report.isPending && !shownReport ? (
                <div className="h-72 rounded-lg bg-muted/40" />
              ) : selectedReport.isError ? (
                <p className="flex h-72 items-center justify-center rounded-lg border text-xs text-destructive">
                  Failed to load report: {(selectedReport.error as Error).message}
                </p>
              ) : selectedReportId != null && !shownReport ? (
                <div className="h-72 rounded-lg bg-muted/40" />
              ) : shownReport ? (
                <ScrollArea className="h-72 rounded-lg border bg-muted/20">
                  <article
                    className="p-4"
                    dangerouslySetInnerHTML={{ __html: markdownToHtml(shownReport.content) }}
                  />
                </ScrollArea>
              ) : (
                <p className="flex h-72 items-center justify-center rounded-lg border px-8 text-center text-xs text-muted-foreground">
                  Generate a report above — it will appear here and be saved to the history below.
                </p>
              )}
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">History</span>
                {reports.data ? (
                  <span className="text-[11px] text-muted-foreground/70">
                    {reports.data.total} report{reports.data.total === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
              {reports.isLoading ? (
                <div className="space-y-1.5">
                  <div className="h-8 rounded-lg bg-muted/40" />
                  <div className="h-8 rounded-lg bg-muted/40" />
                  <div className="h-8 rounded-lg bg-muted/40" />
                </div>
              ) : reports.isError ? (
                <p className="text-xs text-destructive">
                  Failed to load history: {(reports.error as Error).message}
                </p>
              ) : (reports.data?.total ?? 0) === 0 ? (
                <p className="rounded-lg border px-3 py-2.5 text-xs text-muted-foreground">
                  No reports yet — generate your first one above.
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border">
                  <ul className="divide-y">
                    {reports.data!.reports.map((r) => (
                      <li key={r.id}>
                        <button
                          onClick={() => {
                            setSelectedReportId(r.id);
                            setActiveReport(null);
                          }}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors",
                            selectedReportId === r.id
                              ? "bg-secondary text-secondary-foreground"
                              : "hover:bg-muted"
                          )}
                        >
                          <span className="font-medium">
                            {r.period === "daily" ? "Daily check-in" : "Weekly analysis"}
                          </span>
                          <span className="text-muted-foreground">
                            {r.range_end} · {r.model.split("/").pop()}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {reports.data && reports.data.totalPages > 1 ? (
                <div className="mt-2 flex items-center justify-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={reports.data.page <= 1}
                    onClick={() => setReportsPage((p) => Math.max(1, p - 1))}
                    aria-label="Previous page"
                  >
                    <ChevronLeft />
                  </Button>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    Page {reports.data.page} of {reports.data.totalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={reports.data.page >= reports.data.totalPages}
                    onClick={() => setReportsPage((p) => p + 1)}
                    aria-label="Next page"
                  >
                    <ChevronRight />
                  </Button>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
