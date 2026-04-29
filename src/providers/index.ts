export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ProviderConfig {
  name: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface AIProvider {
  chat(messages: Message[], systemPrompt?: string): Promise<string>;
}

// ── Groq ───────────────────────────────────────────────────────────────────

export class GroqProvider implements AIProvider {
  constructor(private config: ProviderConfig) {}

  async chat(messages: Message[], systemPrompt?: string): Promise<string> {
    const msgs = systemPrompt
      ? [{ role: "system", content: systemPrompt }, ...messages]
      : messages;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model || "llama-3.3-70b-versatile",
        messages: msgs,
        max_tokens: 2048,
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Groq API error ${res.status}: ${err}`);
    }

    const data = (await res.json()) as any;
    return data.choices[0].message.content;
  }
}

// ── Ollama (local) ─────────────────────────────────────────────────────────

export class OllamaProvider implements AIProvider {
  constructor(private config: ProviderConfig) {}

  async chat(messages: Message[], systemPrompt?: string): Promise<string> {
    const baseUrl = this.config.baseUrl || "http://localhost:11434";
    const msgs = systemPrompt
      ? [{ role: "system", content: systemPrompt }, ...messages]
      : messages;

    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.config.model || "llama3.2",
        messages: msgs,
        stream: false,
      }),
    });

    if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as any;
    return data.message.content;
  }
}

// ── Gemini ─────────────────────────────────────────────────────────────────

export class GeminiProvider implements AIProvider {
  constructor(private config: ProviderConfig) {}

  async chat(messages: Message[], systemPrompt?: string): Promise<string> {
    const model = this.config.model || "gemini-1.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.config.apiKey}`;

    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const body: any = { contents };
    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as any;
    return data.candidates[0].content.parts[0].text;
  }
}

// ── Anthropic ──────────────────────────────────────────────────────────────

export class AnthropicProvider implements AIProvider {
  constructor(private config: ProviderConfig) {}

  async chat(messages: Message[], systemPrompt?: string): Promise<string> {
    const body: any = {
      model: this.config.model || "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: messages.filter((m) => m.role !== "system"),
    };
    if (systemPrompt) body.system = systemPrompt;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as any;
    return data.content[0].text;
  }
}

// ── OpenAI ─────────────────────────────────────────────────────────────────

export class OpenAIProvider implements AIProvider {
  constructor(private config: ProviderConfig) {}

  async chat(messages: Message[], systemPrompt?: string): Promise<string> {
    const msgs = systemPrompt
      ? [{ role: "system", content: systemPrompt }, ...messages]
      : messages;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model || "gpt-4o-mini",
        messages: msgs,
        max_tokens: 2048,
        temperature: 0.3,
      }),
    });

    if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as any;
    return data.choices[0].message.content;
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

export function createProvider(name: string, config: ProviderConfig): AIProvider {
  switch (name) {
    case "groq":      return new GroqProvider(config);
    case "ollama":    return new OllamaProvider(config);
    case "gemini":    return new GeminiProvider(config);
    case "anthropic": return new AnthropicProvider(config);
    case "openai":    return new OpenAIProvider(config);
    default: throw new Error(`Unknown provider: ${name}`);
  }
}