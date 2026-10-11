# 07 — Settings & Providers

## Providers

Five providers are supported. All implement the `AIProvider` interface from `providers/types.ts`.

### AIProvider interface
```typescript
interface AIProvider {
  chat(messages: ChatMessage[]): Promise<string>;
  name: string;
}
interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}
```

### Provider files

| File | Provider | Auth | Notes |
|------|----------|------|-------|
| `GroqProvider.ts` | Groq | API key | Free. Default model: llama-3.3-70b-versatile |
| `GeminiProvider.ts` | Google Gemini | API key | Free tier. Default: gemini-1.5-flash |
| `AnthropicProvider.ts` | Anthropic Claude | API key | Paid. Default: claude-haiku-4-5-20251001 |
| `OpenAIProvider.ts` | OpenAI | API key | Paid. Default: gpt-4o-mini |
| `OllamaProvider.ts` | Ollama (local) | None | baseUrl: http://localhost:11434, model configurable |

### `createProvider(name, settings)` — factory in `providers/index.ts`
```typescript
createProvider(name: string, settings: ProviderSettings): AIProvider
```
Throws if `name` is unrecognized or if required credentials are missing.

---

## SettingsHandler.ts

### `saveProvider(payload: ProviderSettings)`
1. Stores API key in VS Code `SecretStorage` (encrypted): key `repograph.${name}.apiKey`
2. Stores active provider name in `globalState`: key `repograph.activeProvider`
3. Stores model in `globalState`: key `repograph.${name}.model`
4. Stores baseUrl in `globalState`: key `repograph.${name}.baseUrl`
5. Creates new provider instance → stores in `state.provider`
6. Re-creates `QAAgent` if analysis data already exists (so Q&A uses new provider immediately)
7. Posts `providerSaved`

### `loadSavedSettings()`
1. Posts `workspaceStatus` with workspace name and whether folder is open
2. Gets stored provider name from `globalState`
3. Loads API key from `SecretStorage`
4. Tries to create provider (silently fails at startup if key missing)
5. Posts `settingsLoaded` with `{ providerName, model, baseUrl, hasKey }`

---

## Webview — Settings tab

### Provider cards
Each provider has:
- Collapsed card showing name + free/paid badge
- Click → expands `#pf-{name}` fields
- Fields: API key input, model select + optional custom model input, save button
- Ollama has: model text input + baseUrl input (no API key)

### `selProv(name)`
Removes `selected` from all cards, adds to clicked one. Opens the fields div.

### `saveProv(name)`
Collects: `apiKey`, `model` (or custom), `baseUrl` → sends `saveProvider` message.

### `toggleCustomModel(name)`
Shows/hides the custom model text input based on whether the select is on `__custom__`.

### `settingsLoaded` handler
1. Calls `selProv(providerName)` to expand the right card
2. If `hasKey` — updates placeholder to "(saved) — paste to update"
3. If `model` — sets the select value or switches to custom input

### Token usage display
`#token-display` in Settings tab. Updated by `updateTokenDisplay(total)` on every `tokenUsage` message.

---

## Key storage layout

| Storage | Key | Value |
|---------|-----|-------|
| SecretStorage | `repograph.groq.apiKey` | API key string |
| SecretStorage | `repograph.gemini.apiKey` | API key string |
| SecretStorage | `repograph.anthropic.apiKey` | API key string |
| SecretStorage | `repograph.openai.apiKey` | API key string |
| globalState | `repograph.activeProvider` | Provider name string |
| globalState | `repograph.groq.model` | Model string |
| globalState | `repograph.gemini.model` | Model string |
| globalState | `repograph.anthropic.model` | Model string |
| globalState | `repograph.openai.model` | Model string |
| globalState | `repograph.ollama.model` | Model string |
| globalState | `repograph.ollama.baseUrl` | URL string |
| workspaceState | `repograph.history` | `AnalysisRecord[]` |
| workspaceState | `repograph.graphLayout` | `{id,x,y}[]` |

---

## Adding a new provider

1. Create `src/providers/NewProvider.ts` implementing `AIProvider`
2. Add case to `createProvider()` in `providers/index.ts`
3. Add provider card HTML in `webviewContent.ts` Settings tab
4. No other files need changing — SettingsHandler is generic

---

## CSS classes
| Class | Usage |
|-------|-------|
| `.provider-card` | Clickable card container |
| `.provider-card.selected` | Active provider highlight |
| `.provider-hdr` | flex row with icon + name + badge |
| `.p-icon` | 22×22 colored letter icon |
| `.p-name` | Provider name |
| `.provider-fields` | Hidden by default, shown when selected |
| `.provider-fields.open` | Expanded state |
| `.model-row` | flex row with select + optional custom input |
| `.badge-free` | Green badge |
| `.badge-paid` | Yellow badge |
