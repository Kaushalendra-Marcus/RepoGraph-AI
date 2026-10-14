import { AIProvider, Message, ProviderConfig } from "./types";

export class OpenAIProvider implements AIProvider {
  constructor(private config: ProviderConfig) {}

  async chat(messages: Message[], systemPrompt?: string): Promise<string> {
    const msgs: Message[] = systemPrompt
      ? [{ role: "system", content: systemPrompt }, ...messages]
      : messages;

    // Newer reasoning models (o-series, GPT-5-class) reject `max_tokens` and
    // require `max_completion_tokens`. Try legacy first, fall back once.
    try {
      return await this.send(msgs, false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/max_tokens|max_completion_tokens|unsupported parameter/i.test(msg)) {
        return this.send(msgs, true);
      }
      throw e;
    }
  }

  private async send(msgs: Message[], useCompletionTokens: boolean): Promise<string> {
    const tokenParam = useCompletionTokens ? { max_completion_tokens: 2048 } : { max_tokens: 2048 };
    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model || "gpt-4o-mini",
          messages: msgs,
          ...tokenParam,
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (e: unknown) {
      throw new Error(`OpenAI request failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (!res.ok) {
      const text = await res.text();
      const short = text.length > 500 ? text.slice(0, 500) + "…(truncated)" : text;
      throw new Error(`OpenAI error (status ${res.status}): ${short}`);
    }
    const data = await res.json() as any;
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text) {
      const reason = data?.choices?.[0]?.finish_reason ?? "unknown";
      throw new Error(`OpenAI error: empty response content (finish_reason: ${reason})`);
    }
    return text;
  }
}
