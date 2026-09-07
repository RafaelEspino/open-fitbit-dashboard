import type { TokenStore } from "../auth/store.js";

const BASE_URL = "https://health.googleapis.com/v4";
const MAX_ATTEMPTS = 6;

export class HealthApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | undefined,
    public readonly details: string | undefined
  ) {
    super(message);
    this.name = "HealthApiError";
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class HealthClient {
  constructor(private tokenStore: TokenStore) {}

  async get(path: string): Promise<any> {
    return this.request(path, "GET");
  }

  async post(path: string, body: unknown): Promise<any> {
    return this.request(path, "POST", body);
  }

  private async request(path: string, method: string, body?: unknown): Promise<any> {
    let forceRefresh = false;
    let lastError: HealthApiError | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const accessToken = await this.tokenStore.getValidAccessToken(forceRefresh);
      forceRefresh = false;
      let res: Response;
      try {
        res = await fetch(`${BASE_URL}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
            ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
      } catch (e) {
        lastError = new HealthApiError(`network error calling ${method} ${path}: ${(e as Error).message}`, undefined, undefined);
        if (attempt < MAX_ATTEMPTS) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw lastError;
      }
      if (res.ok) {
        const text = await res.text();
        return text ? JSON.parse(text) : null;
      }
      const details = await res.text().catch(() => "");
      if (res.status === 401) {
        const stored = this.tokenStore.get();
        if (stored?.refreshToken) {
          forceRefresh = true;
          continue;
        }
        throw new HealthApiError(`health api 401 at ${method} ${path}: re-authentication required`, 401, details);
      }
      if ((res.status === 429 || res.status === 504 || res.status >= 500) && attempt < MAX_ATTEMPTS) {
        lastError = new HealthApiError(`health api ${res.status} at ${method} ${path}`, res.status, details);
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new HealthApiError(
        `health api ${method} ${path} failed with ${res.status}`,
        res.status,
        details
      );
    }
    throw lastError ?? new HealthApiError(`health api request failed after retries: ${method} ${path}`, undefined, undefined);
  }
}

function backoffMs(attempt: number): number {
  const base = Math.min(30_000, 1000 * 2 ** (attempt - 1));
  return Math.round(base * (0.8 + Math.random() * 0.4));
}
