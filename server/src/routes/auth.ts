import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import type { AppDatabase } from "../db.js";
import { getSetting, setSetting } from "../db.js";
import type { Config } from "../config.js";
import type { TokenStore } from "../auth/store.js";
import { buildAuthUrl, exchangeCode } from "../auth/oauth.js";
import type { HealthClient } from "../health/client.js";
import type { BackfillManager } from "../health/backfill.js";

export interface AuthRouterDeps {
  db: AppDatabase;
  config: Config;
  tokenStore: TokenStore;
  client: HealthClient;
  backfill: BackfillManager;
  onConnected: () => void;
  onDisconnected: () => void;
}

export function createAuthRouter(deps: AuthRouterDeps): Router {
  const router = Router();

  router.get("/start", (_req: Request, res: Response) => {
    const { config, db } = deps;
    if (!config.googleClientId || !config.googleClientSecret || !config.appSecret) {
      res
        .status(500)
        .json({ error: "server misconfigured: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and APP_SECRET are required" });
      return;
    }
    if (!config.publicBaseUrl) {
      res.status(500).json({ error: "server misconfigured: PUBLIC_BASE_URL is required" });
      return;
    }
    const state = crypto.randomBytes(16).toString("hex");
    setSetting(db, "auth_state", state);
    const redirectUri = `${config.publicBaseUrl.replace(/\/+$/, "")}/api/auth/callback`;
    res.redirect(buildAuthUrl({ clientId: config.googleClientId, redirectUri, state }));
  });

  router.get("/callback", async (req: Request, res: Response) => {
    const { config, db, tokenStore, client } = deps;
    const code = String(req.query.code ?? "");
    const state = String(req.query.state ?? "");
    const error = String(req.query.error ?? "");
    if (error) {
      res.status(400).json({ error: `authorization denied: ${error}` });
      return;
    }
    if (!code || !state) {
      res.status(400).json({ error: "missing code or state" });
      return;
    }
    const expectedState = getSetting(db, "auth_state");
    if (!expectedState || state !== expectedState) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    setSetting(db, "auth_state", "");
    try {
      if (!config.googleClientId || !config.googleClientSecret) {
        throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not configured");
      }
      const redirectUri = `${(config.publicBaseUrl ?? "").replace(/\/+$/, "")}/api/auth/callback`;
      const tokens = await exchangeCode({
        code,
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret,
        redirectUri,
      });
      tokenStore.saveTokens(tokens);
      try {
        const identity = await client.get("/users/me/identity");
        if (identity?.healthUserId) {
          tokenStore.setHealthUserId(String(identity.healthUserId));
        }
      } catch (e) {
        console.warn(`getIdentity failed: ${(e as Error).message}`);
      }
      deps.onConnected();
      res.redirect("/");
    } catch (e) {
      console.error(`oauth callback failed: ${(e as Error).message}`);
      res.status(500).json({ error: "oauth callback failed, check server logs" });
    }
  });

  router.get("/status", (_req: Request, res: Response) => {
    const stored = deps.tokenStore.get();
    res.json({
      connected: stored !== null,
      healthUserId: stored?.healthUserId ?? null,
      lastSyncAt: getSetting(deps.db, "last_sync_at") ?? null,
      backfill: deps.backfill.status(),
    });
  });

  router.post("/disconnect", async (_req: Request, res: Response) => {
    try {
      await deps.tokenStore.disconnect();
      deps.onDisconnected();
      res.json({ connected: false });
    } catch (e) {
      res.status(500).json({ error: `disconnect failed: ${(e as Error).message}` });
    }
  });

  return router;
}
