import express, { type Request, type Response, type NextFunction } from "express";
import path from "node:path";
import { loadConfig, missingEnvVars } from "./config.js";
import { openDatabase, fileExists } from "./db.js";
import { TokenStore } from "./auth/store.js";
import { HealthClient } from "./health/client.js";
import { SyncService } from "./health/sync.js";
import { BackfillManager } from "./health/backfill.js";
import { startScheduler, type SchedulerHandle } from "./health/scheduler.js";
import { createAuthRouter } from "./routes/auth.js";
import { createSyncRouter } from "./routes/sync.js";
import { createMetricsRouter } from "./routes/metrics.js";
import { createAiRouter } from "./routes/ai.js";
import { OpenRouterClient } from "./ai/openrouter.js";

const config = loadConfig();
const db = openDatabase(config.dataDir);
const tokenStore = new TokenStore(db, config);
const client = new HealthClient(tokenStore);
const sync = new SyncService(db, config, client);
const backfill = new BackfillManager(db, sync);
const ai = new OpenRouterClient(config);
let scheduler: SchedulerHandle | null = null;

function ensureScheduler(): void {
  if (!scheduler) {
    scheduler = startScheduler(sync, backfill);
  }
}

function stopScheduler(): void {
  if (scheduler) {
    scheduler.stop();
    scheduler = null;
  }
}

function onConnected(): void {
  ensureScheduler();
  backfill.start();
}

function onDisconnected(): void {
  stopScheduler();
}

const app = express();
app.use(express.json());

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", createAuthRouter({ db, config, tokenStore, client, backfill, onConnected, onDisconnected }));
app.use("/api/sync", createSyncRouter({ db, config, sync, backfill, client, tokenStore }));
app.use("/api/metrics", createMetricsRouter(db));
app.use("/api/ai", createAiRouter(db, config, ai));

const indexHtml = path.join(config.staticDir, "index.html");
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method !== "GET" || req.path.startsWith("/api")) {
    next();
    return;
  }
  if (fileExists(indexHtml)) {
    res.sendFile(indexHtml);
    return;
  }
  res.status(503).json({ error: "frontend not built" });
});

app.listen(config.port, () => {
  console.log(`fitbit-ai-dashboard listening on port ${config.port}`);
  const missing = missingEnvVars(config);
  if (missing.length > 0) {
    console.warn(`missing env vars: ${missing.join(", ")}`);
  }
  try {
    if (tokenStore.get()) {
      ensureScheduler();
      backfill.start();
      console.log("restored google health session, resuming sync");
    }
  } catch (e) {
    console.error(`failed to restore session: ${(e as Error).message}`);
  }
});
