export interface AiModel {
  id: string;
  name: string;
  context_length: number | null;
  pricing: { prompt: string; completion: string } | null;
}

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface AiReportMeta {
  id: number;
  period: "daily" | "weekly";
  range_start: string;
  range_end: string;
  model: string;
  created_at: string;
}

export interface AiReportFull extends AiReportMeta {
  content: string;
}

export async function fetchModels(): Promise<AiModel[]> {
  const res = await fetch("/api/ai/models");
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = (await res.json()) as { models: AiModel[] };
  return data.models;
}

export async function fetchAiSettings(): Promise<{ model: string | null }> {
  const res = await fetch("/api/ai/settings");
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export async function saveAiModel(model: string): Promise<void> {
  const res = await fetch("/api/ai/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
}

export async function fetchChatHistory(): Promise<ChatHistoryMessage[]> {
  const res = await fetch("/api/ai/history");
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = (await res.json()) as { messages: ChatHistoryMessage[] };
  return data.messages;
}

export async function clearChatHistory(): Promise<void> {
  const res = await fetch("/api/ai/history", { method: "DELETE" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
}

export interface ReportsPage {
  reports: AiReportMeta[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export async function fetchReports(page = 1, pageSize = 5): Promise<ReportsPage> {
  const res = await fetch(`/api/ai/reports?page=${page}&pageSize=${pageSize}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<ReportsPage>;
}

export async function fetchReport(id: number): Promise<AiReportFull> {
  const res = await fetch(`/api/ai/reports/${id}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = (await res.json()) as { report: AiReportFull };
  return data.report;
}

export async function generateReport(period: "daily" | "weekly"): Promise<AiReportFull> {
  const res = await fetch("/api/ai/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ period }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body.slice(0, 300) || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export interface StreamCallbacks {
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

export async function streamChat(message: string, callbacks: StreamCallbacks): Promise<void> {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    callbacks.onError(body.slice(0, 300) || `${res.status} ${res.statusText}`);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      let event = "message";
      let data = "";
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      let parsed: any;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }
      if (event === "delta") callbacks.onDelta(parsed.text ?? "");
      else if (event === "done") callbacks.onDone();
      else if (event === "error") callbacks.onError(parsed.error ?? "unknown error");
    }
  }
}
