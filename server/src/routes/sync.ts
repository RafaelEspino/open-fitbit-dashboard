import { Router, type Request, type Response } from "express";
import type { AppDatabase } from "../db.js";
import { getSetting } from "../db.js";
import type { Config } from "../config.js";
import type { SyncService } from "../health/sync.js";
import type { BackfillManager } from "../health/backfill.js";
import type { HealthClient } from "../health/client.js";
import type { TokenStore } from "../auth/store.js";

export interface SyncRouterDeps {
  db: AppDatabase;
  config: Config;
  sync: SyncService;
  backfill: BackfillManager;
  client: HealthClient;
  tokenStore: TokenStore;
}

export function createSyncRouter(deps: SyncRouterDeps): Router {
  const router = Router();

  router.post("/now", (_req: Request, res: Response) => {
    if (!deps.tokenStore.isConnected()) {
      res.status(401).json({ error: "not connected" });
      return;
    }
    deps.sync
      .syncRecent(3)
      .then((summary) => console.log("manual sync complete", summary))
      .catch((e) => console.error(`manual sync failed: ${(e as Error).message}`));
    res.status(202).json({ started: true });
  });

  router.get("/status", (_req: Request, res: Response) => {
    res.json({
      connected: deps.tokenStore.isConnected(),
      lastSyncAt: getSetting(deps.db, "last_sync_at") ?? null,
      backfill: deps.backfill.status(),
    });
  });

  router.get("/devices", async (_req: Request, res: Response) => {
    if (!deps.tokenStore.isConnected()) {
      res.status(401).json({ error: "not connected" });
      return;
    }
    try {
      const devices = await deps.client.get("/users/me/pairedDevices");
      res.json(devices ?? { pairedDevices: [] });
    } catch (e) {
      res.status(502).json({ error: `failed to fetch devices: ${(e as Error).message}` });
    }
  });

  return router;
}
