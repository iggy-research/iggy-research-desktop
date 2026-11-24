/**
 * Katalog modeli: OpenRouter (pobierany z /models) + modele lokalne (Ollama, LM Studio).
 *
 * Model zapisujemy jako „klucz”:
 *   - OpenRouter:  "anthropic/claude-sonnet-5.5"   (ID jak w OpenRouterze)
 *   - lokalne:     "ollama:llama3.2" / "lmstudio:qwen3-8b"
 */

import { t, Key } from "./i18n";

export type Provider = "openrouter" | "ollama" | "lmstudio";

export interface ModelInfo {
  key: string;
  provider: Provider;
  id: string;          // ID wysyłane do API
  name: string;        // nazwa do wyświetlenia
  vendor: string;      // dostawca modelu (Anthropic, OpenAI…) albo „Ollama” / „LM Studio”
  prompt?: number;     // $ za token wejścia
  completion?: number; // $ za token wyjścia
  context?: number;    // okno kontekstu w tokenach
  note?: Key;          // klucz krótkiego opisu (tylko polecane)
}

export const LOCAL_PROVIDERS: Record<Exclude<Provider, "openrouter">, { label: string; defaultUrl: string }> = {
  ollama: { label: "Ollama", defaultUrl: "http://localhost:11434" },
  lmstudio: { label: "LM Studio", defaultUrl: "http://localhost:1234" },
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1";

/** Polecane do roli redaktora; dane zastępcze, gdy nie ma internetu (stan z 2026-11). Opisy to klucze i18n. */
const RECOMMENDED: ModelInfo[] = [
  or("anthropic/claude-sonnet-5.5", "Claude Sonnet 5.5", "Anthropic", 2, 10, 1e6, "note.sonnet"),
  or("anthropic/claude-haiku-5.5", "Claude Haiku 5.5", "Anthropic", 0.1, 0.5, 1e6, "note.haiku"),
  or("anthropic/claude-opus-5.5", "Claude Opus 5.5", "Anthropic", 4, 20, 1e6, "note.opus"),
  or("anthropic/claude-fable-5.2", "Claude Fable 5.2", "Anthropic", 8, 40, 1e6, "note.fable"),
  or("openai/gpt-6.2-sol", "GPT-6.2 Sol", "OpenAI", 2, 10, 1.05e6, "note.gpt"),
  or("openai/gpt-6-luna", "GPT-6 Luna", "OpenAI", 0.1, 0.5, 1.05e6, "note.luna"),
  or("google/gemini-4-neon", "Gemini 4 Neon", "Google", 3, 15, 1048576, "note.gemini"),
  or("google/gemini-3.8-flash", "Gemini 3.8 Flash", "Google", 0.825, 4.125, 1048576, "note.flash"),
  or("mistralai/mistral-large-4-0", "Mistral Large 4", "Mistral", 0.7, 2.1, 1048576, "note.mistral"),
  or("deepseek/deepseek-v4.1-flash", "DeepSeek V4.1 Flash", "DeepSeek", 0.14, 0.42, 1048576, "note.deepseek"),
];
export const RECOMMENDED_KEYS = new Set(RECOMMENDED.map((m) => m.key));

function or(id: string, name: string, vendor: string, inM: number, outM: number, context: number, note: Key): ModelInfo {
  return { key: id, provider: "openrouter", id, name, vendor, prompt: inM / 1e6, completion: outM / 1e6, context, note };
}

// ---------- Klucze i endpointy ----------

export function parseKey(key: string): { provider: Provider; id: string } {
  const m = /^(ollama|lmstudio):(.+)$/.exec(key);
  return m ? { provider: m[1] as Provider, id: m[2] } : { provider: "openrouter", id: key };
}

export interface Endpoint { url: string; model: string; headers: Record<string, string> }

export function endpointFor(key: string, apiKey: string, localUrls: Record<string, string>): Endpoint {
  const { provider, id } = parseKey(key);
  if (provider === "openrouter") {
    return {
      url: `${OPENROUTER_URL}/chat/completions`, model: id,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://github.com/rafalgawlik/iggy-research",
        "X-Title": "Iggy Research",
      },
    };
  }
  return { url: `${baseUrl(provider, localUrls)}/v1/chat/completions`, model: id, headers: {} };
}

const baseUrl = (p: Exclude<Provider, "openrouter">, urls: Record<string, string>) =>
  (urls[p] || LOCAL_PROVIDERS[p].defaultUrl).replace(/\/+$/, "").replace(/\/v1$/, "");

// ---------- Pobieranie list ----------

/** Pełna lista modeli tekstowych z OpenRoutera (bez wariantów :batch, które nie obsługują czatu na żywo). */
export async function fetchOpenRouterModels(): Promise<ModelInfo[]> {
  const res = await fetch(`${OPENROUTER_URL}/models`);
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const { data } = await res.json();
  return (data as any[])
    .filter((m) => !m.id.includes(":batch")
      && (m.architecture?.output_modalities ?? ["text"]).includes("text")
      && (!m.endpoints || m.endpoints.includes("/api/v1/chat/completions")))
    .map((m): ModelInfo => {
      const prompt = Number(m.pricing?.prompt), completion = Number(m.pricing?.completion);
      const [vendorPart, ...rest] = String(m.name).split(": ");
      return {
        key: m.id, provider: "openrouter", id: m.id,
        name: rest.length ? rest.join(": ") : m.name,
        vendor: rest.length ? vendorPart : m.id.split("/")[0],
        prompt: prompt >= 0 ? prompt : undefined,
        completion: completion >= 0 ? completion : undefined,
        context: m.context_length || undefined,
      };
    });
}

/** Modele zainstalowane lokalnie (Ollama i LM Studio mają endpoint zgodny z OpenAI: /v1/models). */
export async function fetchLocalModels(provider: Exclude<Provider, "openrouter">, urls: Record<string, string>): Promise<ModelInfo[]> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 2500);
  try {
    const res = await fetch(`${baseUrl(provider, urls)}/v1/models`, { signal: ctl.signal });
    if (!res.ok) throw new Error(`${LOCAL_PROVIDERS[provider].label} ${res.status}`);
    const { data } = await res.json();
    return (data as any[])
      .filter((m) => !/embed/i.test(m.id))
      .map((m) => ({
        key: `${provider}:${m.id}`, provider, id: m.id, name: m.id,
        vendor: LOCAL_PROVIDERS[provider].label, prompt: 0, completion: 0,
      }));
  } finally { clearTimeout(t); }
}

// ---------- Katalog (pamięć + cache) ----------

export interface Catalog {
  models: Map<string, ModelInfo>;
  /** stan źródeł do pokazania w interfejsie */
  status: Partial<Record<Provider, string>>;
}

export const catalog: Catalog = { models: new Map(RECOMMENDED.map((m) => [m.key, m])), status: {} };

export interface CatalogCache { at: number; models: ModelInfo[] }
const CACHE_TTL = 24 * 3600 * 1000;

/** Wypełnia katalog: najpierw z cache, potem (jeśli stary albo force) z sieci. Zwraca nowy cache do zapisania. */
export async function loadCatalog(
  cache: CatalogCache | null,
  localUrls: Record<string, string>,
  local: Record<string, boolean>,
  force = false,
): Promise<CatalogCache | null> {
  let fresh: CatalogCache | null = null;
  if (cache?.models?.length) merge(cache.models);
  if (force || !cache || Date.now() - cache.at > CACHE_TTL) {
    try {
      const models = await fetchOpenRouterModels();
      merge(models);
      fresh = { at: Date.now(), models };
      catalog.status.openrouter = t("mp.count", { n: models.length });
    } catch (e: any) {
      catalog.status.openrouter = t(cache ? "mp.offlineCache" : "mp.offline");
    }
  } else {
    catalog.status.openrouter = t("mp.count", { n: cache.models.length });
  }
  for (const p of Object.keys(LOCAL_PROVIDERS) as Exclude<Provider, "openrouter">[]) {
    for (const [k, m] of catalog.models) if (m.provider === p) catalog.models.delete(k);
    if (!local[p]) { delete catalog.status[p]; continue; }
    try {
      const models = await fetchLocalModels(p, localUrls);
      merge(models);
      catalog.status[p] = models.length ? t("mp.count", { n: models.length }) : t("mp.noModels");
    } catch {
      catalog.status[p] = t("mp.unavailable");
    }
  }
  return fresh;
}

function merge(list: ModelInfo[]) {
  for (const m of list) {
    const prev = catalog.models.get(m.key);
    catalog.models.set(m.key, { ...m, note: prev?.note ?? m.note });
  }
}

/** Informacje o modelu; dla nieznanego klucza (np. wpisanego ręcznie) budujemy minimalny opis. */
export function modelInfo(key: string): ModelInfo {
  const known = catalog.models.get(key);
  if (known) return known;
  const { provider, id } = parseKey(key);
  return { key, provider, id, name: id, vendor: provider === "openrouter" ? id.split("/")[0] : LOCAL_PROVIDERS[provider].label };
}

// ---------- Formatowanie ----------

export function formatPrice(m: ModelInfo): string {
  if (m.provider !== "openrouter") return t("price.local");
  if (m.prompt === undefined || m.completion === undefined) return t("price.variable");
  if (m.prompt === 0 && m.completion === 0) return t("price.free");
  const f = (v: number) => {
    const x = v * 1e6;
    return "$" + (x >= 10 ? x.toFixed(0) : x >= 1 ? x.toFixed(2).replace(/\.?0+$/, "") : x.toPrecision(2).replace(/\.?0+$/, ""));
  };
  return t("price.per1m", { in: f(m.prompt), out: f(m.completion) });
}

export function formatContext(n?: number): string {
  if (!n) return "";
  if (n >= 1e6) return `${Math.floor(n / 1e5) / 10}M`;
  return `${Math.round(n / 1000)}k`;
}
