import { Router, type Request, type Response } from "express";
import type { AppDatabase } from "../db.js";
import { getSetting, setSetting } from "../db.js";
import type { Config } from "../config.js";
import type { OpenRouterClient, OpenRouterMessage } from "../ai/openrouter.js";
import {
  buildContextUserMessage,
  buildMetricContext,
  buildReportPrompt,
  buildSystemPrompt,
} from "../ai/context.js";

const CONTEXT_DAYS = 14;
const MODELS_CACHE_MS = 24 * 60 * 60 * 1000;
const MAX_HISTORY_MESSAGES = 20;
const MAX_REPORT_PAGE_SIZE = 20;

interface ChatHistoryRow {
  role: "user" | "assistant";
  content: string;
}

export function createAiRouter(db: AppDatabase, config: Config, ai: OpenRouterClient): Router {
  const router = Router();

  router.get("/models", async (_req: Request, res: Response) => {
    try {
      const cached = getSetting(db, "ai_models_cache");
      const cachedAt = getSetting(db, "ai_models_cached_at");
      if (
        cached &&
        cachedAt &&
        Date.now() - Number(cachedAt) < MODELS_CACHE_MS
      ) {
        res.json({ models: JSON.parse(cached), cached: true });
        return;
      }
      const models = await ai.listModels();
      setSetting(db, "ai_models_cache", JSON.stringify(models));
      setSetting(db, "ai_models_cached_at", String(Date.now()));
      res.json({ models, cached: false });
    } catch (e) {
      const cached = getSetting(db, "ai_models_cache");
      if (cached) {
        res.json({ models: JSON.parse(cached), cached: true });
        return;
      }
      res.status(502).json({ error: `failed to list models: ${(e as Error).message}` });
    }
  });

  router.get("/settings", (_req: Request, res: Response) => {
    res.json({ model: getSetting(db, "ai_model") ?? null });
  });

  router.post("/settings", (req: Request, res: Response) => {
    const model = req.body?.model;
    if (typeof model !== "string" || model.length === 0 || model.length > 200) {
      res.status(400).json({ error: "model must be a non-empty string" });
      return;
    }
    setSetting(db, "ai_model", model);
    res.json({ model });
  });

  router.get("/history", (_req: Request, res: Response) => {
    const rows = db
      .prepare("SELECT role, content, created_at FROM chat_history ORDER BY id ASC")
      .all() as ChatHistoryRow[];
    res.json({ messages: rows.slice(-MAX_HISTORY_MESSAGES * 2) });
  });

  router.delete("/history", (_req: Request, res: Response) => {
    db.prepare("DELETE FROM chat_history").run();
    res.json({ cleared: true });
  });

  router.post("/chat", async (req: Request, res: Response) => {
    if (!config.openRouterApiKey) {
      res.status(500).json({ error: "OPENROUTER_API_KEY is not configured" });
      return;
    }
    const message = req.body?.message;
    if (typeof message !== "string" || message.trim().length === 0) {
      res.status(400).json({ error: "message must be a non-empty string" });
      return;
    }
    const model = getSetting(db, "ai_model") ?? "openai/gpt-4o-mini";

    const history = (
      db
        .prepare("SELECT role, content FROM chat_history ORDER BY id ASC")
        .all() as ChatHistoryRow[]
    ).slice(-MAX_HISTORY_MESSAGES);

    const context = buildMetricContext(db, CONTEXT_DAYS);
    const messages: OpenRouterMessage[] = [
      { role: "system", content: buildSystemPrompt(context) },
      { role: "user", content: buildContextUserMessage(context) },
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: message.trim() },
    ];

    db.prepare("INSERT INTO chat_history (role, content) VALUES ('user', ?)").run(message.trim());

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    let assistantContent = "";
    let closed = false;
    const send = (event: string, data: unknown) => {
      if (closed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    req.on("close", () => {
      closed = true;
      if (assistantContent) {
        db.prepare("INSERT INTO chat_history (role, content) VALUES ('assistant', ?)").run(
          assistantContent
        );
      }
    });

    await ai.streamChat(
      { model, messages },
      {
        onDelta: (text) => {
          assistantContent += text;
          send("delta", { text });
        },
        onDone: () => {
          if (assistantContent) {
            db.prepare("INSERT INTO chat_history (role, content) VALUES ('assistant', ?)").run(
              assistantContent
            );
          }
          send("done", { model });
          closed = true;
          res.end();
        },
        onError: (errorMessage) => {
          if (assistantContent) {
            db.prepare("INSERT INTO chat_history (role, content) VALUES ('assistant', ?)").run(
              assistantContent
            );
          }
          send("error", { error: errorMessage });
          closed = true;
          res.end();
        },
      }
    );
  });

  router.post("/report", async (req: Request, res: Response) => {
    if (!config.openRouterApiKey) {
      res.status(500).json({ error: "OPENROUTER_API_KEY is not configured" });
      return;
    }
    const period = req.body?.period === "weekly" ? "weekly" : "daily";
    const model = getSetting(db, "ai_model") ?? "openai/gpt-4o-mini";
    const contextDays = period === "weekly" ? 21 : 14;
    const context = buildMetricContext(db, contextDays);

    try {
      const { content } = await ai.chatCompletion({
        model,
        messages: [{ role: "user", content: buildReportPrompt(context, period) }],
        temperature: 0.3,
      });
      if (!content.trim()) {
        res.status(502).json({ error: "model returned an empty report" });
        return;
      }
      const dates = context.daily.map((d) => d.date);
      const info = db
        .prepare(
          "INSERT INTO ai_reports (period, range_start, range_end, model, content) VALUES (?, ?, ?, ?, ?)"
        )
        .run(period, dates[0] ?? "", dates[dates.length - 1] ?? "", model, content);
      res.json({ id: info.lastInsertRowid, period, model, content });
    } catch (e) {
      res.status(502).json({ error: `report generation failed: ${(e as Error).message}` });
    }
  });

  router.get("/reports", (req: Request, res: Response) => {
    const requestedPageSize = Number(req.query.pageSize);
    const pageSize = Number.isFinite(requestedPageSize)
      ? Math.min(MAX_REPORT_PAGE_SIZE, Math.max(1, Math.round(requestedPageSize)))
      : 5;
    const totalRow = db.prepare("SELECT COUNT(*) AS c FROM ai_reports").get() as { c: number };
    const total = totalRow.c;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const requestedPage = Number(req.query.page);
    const page = Number.isFinite(requestedPage)
      ? Math.min(totalPages, Math.max(1, Math.round(requestedPage)))
      : 1;
    const rows = db
      .prepare(
        `SELECT id, period, range_start, range_end, model, created_at FROM ai_reports
         ORDER BY id DESC LIMIT ? OFFSET ?`
      )
      .all(pageSize, (page - 1) * pageSize);
    res.json({ reports: rows, page, pageSize, total, totalPages });
  });

  router.get("/reports/:id", (req: Request, res: Response) => {
    const row = db
      .prepare("SELECT id, period, range_start, range_end, model, content, created_at FROM ai_reports WHERE id = ?")
      .get(req.params.id);
    if (!row) {
      res.status(404).json({ error: "report not found" });
      return;
    }
    res.json({ report: row });
  });

  return router;
}
