import type { AppDatabase } from "../db.js";
import type { Config } from "../config.js";
import { encrypt, decrypt } from "./crypto.js";
import { refreshAccessToken, revokeToken, type OAuthTokens } from "./oauth.js";

interface TokenRow {
  access_token: string;
  refresh_token: string | null;
  access_expires_at: number;
  scope: string | null;
  health_user_id: string | null;
}

export interface StoredTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  scope: string;
  healthUserId: string | null;
}

export class TokenStore {
  constructor(private db: AppDatabase, private config: Config) {}

  saveTokens(tokens: OAuthTokens): void {
    this.requireAppSecret();
    const existing = this.readRow();
    const refreshToken = tokens.refreshToken ?? existing?.refresh_token ?? null;
    const healthUserId = existing?.health_user_id ?? null;
    this.db
      .prepare(
        `INSERT INTO tokens (id, access_token, refresh_token, access_expires_at, scope, health_user_id, updated_at)
         VALUES (1, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           access_token = excluded.access_token,
           refresh_token = excluded.refresh_token,
           access_expires_at = excluded.access_expires_at,
           scope = excluded.scope,
           health_user_id = CASE WHEN excluded.health_user_id IS NOT NULL THEN excluded.health_user_id ELSE tokens.health_user_id END,
           updated_at = excluded.updated_at`
      )
      .run(
        encrypt(tokens.accessToken, this.getAppSecret()),
        refreshToken ? encrypt(refreshToken, this.getAppSecret()) : null,
        tokens.expiresAt,
        tokens.scope,
        healthUserId
      );
  }

  get(): StoredTokens | null {
    const row = this.readRow();
    if (!row) return null;
    const secret = this.getAppSecret();
    return {
      accessToken: decrypt(row.access_token, secret),
      refreshToken: row.refresh_token ? decrypt(row.refresh_token, secret) : null,
      expiresAt: row.access_expires_at,
      scope: row.scope ?? "",
      healthUserId: row.health_user_id,
    };
  }

  async getValidAccessToken(forceRefresh = false): Promise<string> {
    const stored = this.get();
    if (!stored) throw new Error("not connected");
    if (!forceRefresh && Date.now() < stored.expiresAt) return stored.accessToken;
    if (!stored.refreshToken) throw new Error("session expired: re-authentication required");
    const clientId = this.requireClientId();
    const refreshed = await refreshAccessToken({
      refreshToken: stored.refreshToken,
      clientId,
      clientSecret: this.requireClientSecret(),
    });
    this.saveTokens({ ...refreshed, refreshToken: refreshed.refreshToken ?? stored.refreshToken });
    return refreshed.accessToken;
  }

  setHealthUserId(healthUserId: string): void {
    this.db
      .prepare("UPDATE tokens SET health_user_id = ?, updated_at = datetime('now') WHERE id = 1")
      .run(healthUserId);
  }

  async disconnect(): Promise<void> {
    const stored = this.get();
    if (stored?.refreshToken) {
      try {
        await revokeToken(stored.refreshToken);
      } catch (e) {
        console.warn(`token revoke failed: ${(e as Error).message}`);
      }
    }
    this.db.prepare("DELETE FROM tokens WHERE id = 1").run();
  }

  isConnected(): boolean {
    return this.readRow() !== null;
  }

  private readRow(): TokenRow | null {
    return (
      (this.db
        .prepare(
          "SELECT access_token, refresh_token, access_expires_at, scope, health_user_id FROM tokens WHERE id = 1"
        )
        .get() as TokenRow | undefined) ?? null
    );
  }

  private requireAppSecret(): string {
    if (!this.config.appSecret) throw new Error("APP_SECRET is not configured");
    return this.config.appSecret;
  }

  private getAppSecret(): string {
    if (!this.config.appSecret) throw new Error("APP_SECRET is not configured");
    return this.config.appSecret;
  }

  private requireClientId(): string {
    if (!this.config.googleClientId) throw new Error("GOOGLE_CLIENT_ID is not configured");
    return this.config.googleClientId;
  }

  private requireClientSecret(): string {
    if (!this.config.googleClientSecret) throw new Error("GOOGLE_CLIENT_SECRET is not configured");
    return this.config.googleClientSecret;
  }
}
