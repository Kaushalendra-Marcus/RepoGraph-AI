import { AIProvider, Message, ProviderConfig } from "./types";

export class AnthropicProvider implements AIProvider {
  constructor(private config: ProviderConfig) {}

  async chat(messages: Message[], systemPrompt?: string): Promise<string> {
    const body: any = {
      model: this.config.model || "claude-sonnet-4-5-20250929",
      max_tokens: 2048,
      messages: messages.filter((m) => m.role !== "system"),
    };
    if (systemPrompt) body.system = systemPrompt;

    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.config.apiKey || "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (e: unknown) {
      throw new Error(`Anthropic request failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (!res.ok) {
      const text = await res.text();
      const short = text.length > 500 ? text.slice(0, 500) + "…(truncated)" : text;
      throw new Error(`Anthropic error (status ${res.status}): ${short}`);
    }
    const data = await res.json() as any;
    // Content is a block array; refusals/tool_use may carry no text block.
    const blocks = Array.isArray(data?.content) ? data.content : [];
    const textBlock = blocks.find((b: any) => b?.type === "text" && typeof b?.text === "string");
    if (!textBlock) {
      const stop = typeof data?.stop_reason === "string" ? data.stop_reason : "unknown";
      throw new Error(`Anthropic error: no text in response (stop_reason: ${stop})`);
    }
    return textBlock.text;
  }
}
