import { AIProvider, Message, ProviderConfig } from "./types";

export class OllamaProvider implements AIProvider {
  constructor(private config: ProviderConfig) {}

  async chat(messages: Message[], systemPrompt?: string): Promise<string> {
    // Strip trailing slashes so baseUrl "...:11434/" doesn't become "//api/chat".
    const baseUrl = (this.config.baseUrl || "http://localhost:11434").replace(/\/+$/, "");
    const msgs = systemPrompt
      ? [{ role: "system", content: systemPrompt }, ...messages]
      : messages;

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.config.model || "qwen3",
          messages: msgs,
          stream: false,
          // Cap local generation like the cloud providers (was unbounded).
          options: { num_predict: 2048 },
        }),
        // Cold model pulls can stall; 5 min instead of the 60s cloud default.
        signal: AbortSignal.timeout(300_000),
      });
    } catch (e: unknown) {
      throw new Error(`Ollama request failed (is Ollama running at ${baseUrl}?): ${e instanceof Error ? e.message : String(e)}`);
    }

    if (!res.ok) {
      const text = await res.text();
      const short = text.length > 500 ? text.slice(0, 500) + "…(truncated)" : text;
      throw new Error(`Ollama error (status ${res.status}): ${short}`);
    }
    const data = await res.json() as any;
    const text = data?.message?.content;
    if (typeof text !== "string" || !text) {
      throw new Error(`Ollama error: empty response content (model may still be loading — try again)`);
    }
    return text;
  }
}
