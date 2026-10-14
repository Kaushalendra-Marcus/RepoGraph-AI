import { AIProvider, Message, ProviderConfig } from "./types";

export class GroqProvider implements AIProvider {
  private static readonly TPM_LIMIT = 11000;
  private static readonly WINDOW_MS = 60_000;
  private static readonly ledgers = new Map<string, { at: number; tokens: number }[]>();

  constructor(private config: ProviderConfig) {}

  async chat(messages: Message[], systemPrompt?: string): Promise<string> {
    const msgs: Message[] = systemPrompt
      ? [{ role: "system", content: systemPrompt }, ...messages]
      : messages;

    const estimatedTokens = this.estimateTokens(msgs);
    await this.waitForBudget(estimatedTokens);

    return this.sendWithRetry(msgs, estimatedTokens);
  }

  private static readonly REQUEST_TIMEOUT_MS = 60_000;
  private static readonly MAX_ERROR_BODY = 500;

  private async sendWithRetry(messages: Message[], estimatedTokens: number): Promise<string> {
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let res: Response;
      try {
        res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            model: this.config.model || "llama-3.3-70b-versatile",
            messages,
            max_tokens: 2048,
            temperature: 0.3,
          }),
          signal: AbortSignal.timeout(GroqProvider.REQUEST_TIMEOUT_MS),
        });
      } catch (e: unknown) {
        // Network failure or 60s timeout — retry once, then surface.
        if (attempt === maxAttempts) throw new Error(`Groq request failed: ${this.errOf(e)}`);
        await this.sleep(2_000);
        await this.waitForBudget(estimatedTokens);
        continue;
      }

      if (res.ok) {
        const data = await res.json() as any;
        const text = data?.choices?.[0]?.message?.content;
        // Prefer the API's actual token usage over our estimate for throttling.
        const used = typeof data?.usage?.total_tokens === "number" ? data.usage.total_tokens : estimatedTokens;
        this.recordUsage(used);
        if (typeof text !== "string" || !text) {
          throw new Error(`Groq API error: empty response content (status ${res.status})`);
        }
        return text;
      }

      const body = await res.text();
      const short = this.errBody(body);
      const retryAfter = this.parseRetryAfter(res.headers.get("retry-after")) ?? this.parseRetryAfterFromBody(body);
      const rateLimitHit = res.status === 429 || /rate_limit_exceeded|tokens per minute|TPM/i.test(body);

      if (!rateLimitHit || attempt === maxAttempts) {
        throw new Error(`Groq API error (status ${res.status}): ${short}`);
      }

      const delay = retryAfter ?? 15_000;
      await this.sleep(delay);
      await this.waitForBudget(estimatedTokens);
    }

    throw new Error("Groq API error: request failed after retries");
  }

  private estimateTokens(messages: Message[]): number {
    const chars = messages.reduce((total, message) => total + (message.content?.length || 0), 0);
    const promptTokens = Math.ceil(chars / 4);
    const responseBudget = 2048;
    return Math.max(64, promptTokens + responseBudget + 128);
  }

  private recordUsage(tokens: number) {
    const key = this.bucketKey();
    const ledger = GroqProvider.ledgers.get(key) || [];
    ledger.push({ at: Date.now(), tokens });
    GroqProvider.ledgers.set(key, ledger);
  }

  private async waitForBudget(requestTokens: number) {
    // A single request larger than the whole per-minute budget can never
    // fit — fail fast instead of sleeping forever (livelock).
    if (requestTokens > GroqProvider.TPM_LIMIT) {
      throw new Error(
        `Groq request (~${requestTokens} tokens) exceeds the per-minute budget of ${GroqProvider.TPM_LIMIT} tokens. Shorten the context or re-analyze a smaller scope.`
      );
    }
    const key = this.bucketKey();
    while (true) {
      const now = Date.now();
      const ledger = (GroqProvider.ledgers.get(key) || []).filter((entry) => now - entry.at < GroqProvider.WINDOW_MS);
      GroqProvider.ledgers.set(key, ledger);

      const used = ledger.reduce((sum, entry) => sum + entry.tokens, 0);
      if (used + requestTokens <= GroqProvider.TPM_LIMIT) return;

      const sorted = [...ledger].sort((a, b) => a.at - b.at);
      let remaining = used;
      let cutoffAt = sorted[0]?.at ?? now;
      for (const entry of sorted) {
        remaining -= entry.tokens;
        cutoffAt = entry.at;
        if (remaining + requestTokens <= GroqProvider.TPM_LIMIT) break;
      }

      const waitMs = Math.max(500, GroqProvider.WINDOW_MS - (now - cutoffAt) + 50);
      await this.sleep(waitMs);
    }
  }

  private parseRetryAfter(value: string | null): number | undefined {
    if (!value) return undefined;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds * 1000);
    const dateMs = Date.parse(value);
    if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
    return undefined;
  }

  private parseRetryAfterFromBody(body: string): number | undefined {
    const match = body.match(/try again in\s+([0-9.]+)s/i);
    if (!match) return undefined;
    const seconds = Number(match[1]);
    return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1000) : undefined;
  }

  private bucketKey(): string {
    return `${this.config.name}:${this.config.apiKey || ""}:${this.config.model || "llama-3.3-70b-versatile"}`;
  }

  private errBody(body: string): string {
    return body.length > GroqProvider.MAX_ERROR_BODY
      ? body.slice(0, GroqProvider.MAX_ERROR_BODY) + "…(truncated)"
      : body;
  }

  private errOf(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
