import { AIProvider, Message, ProviderConfig } from "./types";

export class GeminiProvider implements AIProvider {
  constructor(private config: ProviderConfig) {}

  async chat(messages: Message[], systemPrompt?: string): Promise<string> {
    const model = this.config.model || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.config.apiKey || "")}`;

    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const body: any = { contents, generationConfig: { maxOutputTokens: 2048 } };
    if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (e: unknown) {
      throw new Error(`Gemini request failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (!res.ok) {
      const text = await res.text();
      const short = text.length > 500 ? text.slice(0, 500) + "…(truncated)" : text;
      throw new Error(`Gemini error (status ${res.status}): ${short}`);
    }
    const data = await res.json() as any;
    // Safety blocks / refusals return candidates: [] — surface the reason.
    const cand = Array.isArray(data?.candidates) ? data.candidates[0] : undefined;
    const parts = Array.isArray(cand?.content?.parts) ? cand.content.parts : [];
    const textPart = parts.find((p: any) => typeof p?.text === "string" && p.text);
    if (!textPart) {
      const reason = data?.promptFeedback?.blockReason ?? cand?.finishReason ?? "unknown";
      throw new Error(`Gemini error: no text in response (reason: ${reason})`);
    }
    return textPart.text;
  }
}
