import type { Config } from "../config.js";

const BASE_URL = "https://openrouter.ai/api/v1";

export interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number | null;
  pricing: { prompt: string; completion: string } | null;
}

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatStreamHandlers {
  onDelta: (text: string) => void;
  onDone: (usage?: { prompt_tokens?: number; completion_tokens?: number }) => void;
  onError: (message: string) => void;
}

export class OpenRouterClient {
  constructor(private config: Config) {}

  private requireApiKey(): string {
    if (!this.config.openRouterApiKey) {
      throw new Error("OPENROUTER_API_KEY is not configured");
    }
    return this.config.openRouterApiKey;
  }

  async listModels(): Promise<OpenRouterModel[]> {
    const res = await fetch(`${BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${this.requireApiKey()}` },
    });
    if (!res.ok) {
      throw new Error(`openrouter models returned ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as {
      data: {
        id: string;
        name: string;
        architecture?: { input_modalities?: string[] };
        context_length?: number;
        pricing?: { prompt?: string; completion?: string };
      }[];
    };
    return (json.data ?? [])
      .filter(
        (m) =>
          !m.architecture?.input_modalities ||
          m.architecture.input_modalities.length === 0 ||
          m.architecture.input_modalities.includes("text")
      )
      .map((m) => ({
        id: m.id,
        name: m.name,
        context_length: m.context_length ?? null,
        pricing: m.pricing
          ? { prompt: m.pricing.prompt ?? "", completion: m.pricing.completion ?? "" }
          : null,
      }));
  }

  async chatCompletion(params: {
    model: string;
    messages: OpenRouterMessage[];
    temperature?: number;
  }): Promise<{ content: string }> {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.requireApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        temperature: params.temperature ?? 0.4,
      }),
    });
    if (!res.ok) {
      throw new Error(`openrouter chat returned ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return { content: json.choices?.[0]?.message?.content ?? "" };
  }

  async streamChat(
    params: {
      model: string;
      messages: OpenRouterMessage[];
      temperature?: number;
    },
    handlers: ChatStreamHandlers
  ): Promise<void> {
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.requireApiKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: params.model,
          messages: params.messages,
          temperature: params.temperature ?? 0.4,
          stream: true,
        }),
      });
    } catch (e) {
      handlers.onError(`network error: ${(e as Error).message}`);
      return;
    }
    if (!res.ok || !res.body) {
      handlers.onError(`openrouter chat returned ${res.status}: ${await res.text()}`);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const event = JSON.parse(payload) as {
              choices?: { delta?: { content?: string } }[];
              usage?: { prompt_tokens?: number; completion_tokens?: number };
            };
            if (event.usage) usage = event.usage;
            const delta = event.choices?.[0]?.delta?.content;
            if (delta) handlers.onDelta(delta);
          } catch {
            // ignore malformed keepalive lines
          }
        }
      }
      handlers.onDone(usage);
    } catch (e) {
      handlers.onError(`stream interrupted: ${(e as Error).message}`);
    }
  }
}
