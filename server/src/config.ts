import path from "node:path";
import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

export interface Config {
  port: number;
  publicBaseUrl: string | undefined;
  appSecret: string | undefined;
  googleClientId: string | undefined;
  googleClientSecret: string | undefined;
  openRouterApiKey: string | undefined;
  dataDir: string;
  staticDir: string;
}

export function loadConfig(): Config {
  return {
    port: Number(process.env.PORT ?? 3000),
    publicBaseUrl: process.env.PUBLIC_BASE_URL,
    appSecret: process.env.APP_SECRET,
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    openRouterApiKey: process.env.OPENROUTER_API_KEY,
    dataDir: process.env.DATA_DIR ?? path.join(process.cwd(), "data"),
    staticDir: process.env.STATIC_DIR ?? path.join(process.cwd(), "web-dist"),
  };
}

export function missingEnvVars(config: Config): string[] {
  const missing: string[] = [];
  if (!config.googleClientId) missing.push("GOOGLE_CLIENT_ID");
  if (!config.googleClientSecret) missing.push("GOOGLE_CLIENT_SECRET");
  if (!config.appSecret) missing.push("APP_SECRET");
  if (!config.openRouterApiKey) missing.push("OPENROUTER_API_KEY");
  return missing;
}
