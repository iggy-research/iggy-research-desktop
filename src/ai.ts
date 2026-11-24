import { endpointFor, parseKey } from "./models";

/** Zadania AI; każde może mieć własny model. Puste = taki jak do analizy akapitu. */
export type Task = "analyze" | "summary" | "links";
export const TASKS: Record<Task, string> = {
  analyze: "Analiza akapitu",
  summary: "Podsumowanie notatki",
  links: "Sugestie linków",
};

export interface AiSettings {
  apiKey: string;
  models: Record<Task, string>;
  prompt: string;
  debounceMs: number;
  autoAnalyze: boolean;
  local: { ollama: boolean; lmstudio: boolean };
  localUrls: { ollama: string; lmstudio: string };
}

export const DEFAULT_PROMPT = `Jesteś redaktorem. Przeanalizuj podany akapit (w kontekście całego tekstu) pod kątem:
- poprawności językowej (gramatyka, interpunkcja, literówki),
- jasności i zwięzłości (zbędne słowa, strona bierna, powtórzenia),
- spójności z resztą tekstu.
Odpowiedz krótko w Markdown: najpierw jedna linia oceny, potem maks. 5 punktów z konkretnymi poprawkami ("przed → po"). Odpowiadaj w języku akapitu.`;

const SUMMARY_PROMPT = `Jesteś uważnym czytelnikiem notatek autora. Nie piszesz za niego — pomagasz mu zobaczyć własną myśl.
Odpowiedz w Markdown, w języku notatki:
1. **Teza** — jedno zdanie: co ta notatka właściwie twierdzi.
2. **Kluczowe punkty** — maks. 5 krótkich punktów.
3. **Luki i pytania** — 2–3 pytania, które warto sobie zadać, żeby myśl poszła dalej (brakujące argumenty, kontrprzykłady, niejasne pojęcia).`;

const LINKS_PROMPT = `Pomagasz budować sieć połączonych notatek (drugi mózg). Dostajesz bieżącą notatkę i listę nazw istniejących notatek.
Wskaż maks. 7 istniejących notatek, z którymi bieżąca notatka naprawdę się łączy. Używaj WYŁĄCZNIE nazw z listy, dokładnie w zapisie [[Nazwa]].
Dla każdej: [[Nazwa]] — w którym miejscu notatki warto wstawić link i dlaczego (jedno zdanie).
Na końcu, jeśli to ma sens, zaproponuj 1–2 nowe notatki do napisania jako [[Nowa notatka]] z dopiskiem „(nowa)”.
Jeśli nic się nie łączy, napisz to wprost. Odpowiadaj w języku notatki, w Markdown.`;

export const DEFAULT_SETTINGS: AiSettings = {
  apiKey: "",
  models: { analyze: "anthropic/claude-sonnet-5.5", summary: "", links: "" },
  prompt: DEFAULT_PROMPT,
  debounceMs: 1500,
  autoAnalyze: true,
  local: { ollama: false, lmstudio: false },
  localUrls: { ollama: "", lmstudio: "" },
};

/** Wczytuje ustawienia z pliku; zamienia stare pole `model` na `models.analyze`. */
export function migrateSettings(raw: any): AiSettings {
  const s: AiSettings = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  s.models = { ...DEFAULT_SETTINGS.models, ...(raw?.models ?? {}) };
  if (raw?.model && !raw?.models) s.models.analyze = raw.model;
  s.local = { ...DEFAULT_SETTINGS.local, ...(raw?.local ?? {}) };
  s.localUrls = { ...DEFAULT_SETTINGS.localUrls, ...(raw?.localUrls ?? {}) };
  delete (s as any).model;
  return s;
}

export const modelFor = (s: AiSettings, t: Task) => s.models[t] || s.models.analyze;

/** null = można wysłać; inaczej komunikat, czego brakuje. */
export function missingConfig(s: AiSettings, t: Task): string | null {
  return parseKey(modelFor(s, t)).provider === "openrouter" && !s.apiKey
    ? "Dodaj klucz OpenRouter w ustawieniach (⚙) albo wybierz model lokalny."
    : null;
}

/** Wywoływane po udanej odpowiedzi — do listy „ostatnio używane”. */
export let onModelUsed: (key: string) => void = () => {};
export const setOnModelUsed = (f: (key: string) => void) => (onModelUsed = f);

const controllers: Partial<Record<Task, AbortController>> = {};

/** Strumieniuje odpowiedź modelu przypisanego do zadania. Poprzednie żądanie tego samego zadania jest przerywane. */
async function chat(s: AiSettings, task: Task, system: string, user: string, onToken: (full: string) => void): Promise<string> {
  controllers[task]?.abort();
  const controller = (controllers[task] = new AbortController());
  const key = modelFor(s, task);
  const ep = endpointFor(key, s.apiKey, s.localUrls);
  let res: Response;
  try {
    res = await fetch(ep.url, {
      method: "POST",
      signal: controller.signal,
      headers: { ...ep.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ep.model,
        stream: true,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });
  } catch (e: any) {
    if (e?.name === "AbortError") throw e;
    const p = parseKey(key).provider;
    throw new Error(p === "openrouter"
      ? `Brak połączenia z OpenRouterem: ${e?.message ?? e}`
      : `Nie można połączyć się z ${p === "ollama" ? "Ollamą" : "LM Studio"} (${ep.url}). Czy serwer jest uruchomiony?`);
  }
  if (!res.ok || !res.body) throw new Error(`${ep.url.includes("openrouter") ? "OpenRouter" : "Model lokalny"} ${res.status}: ${await res.text()}`);

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", out = "";
  const finish = () => { onModelUsed(key); return out; };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") return finish();
      try {
        const delta = JSON.parse(data).choices?.[0]?.delta?.content;
        if (delta) { out += delta; onToken(out); }
      } catch { /* komentarze SSE / niepełne fragmenty */ }
    }
  }
  return finish();
}

export const analyzeParagraph = (s: AiSettings, paragraph: string, context: string, onToken: (full: string) => void) =>
  chat(s, "analyze", s.prompt,
    `KONTEKST (cały dokument, skrócony):\n${context.slice(0, 6000)}\n\nAKAPIT DO ANALIZY:\n${paragraph}`, onToken);

export const summarizeNote = (s: AiSettings, doc: string, onToken: (full: string) => void) =>
  chat(s, "summary", SUMMARY_PROMPT, `NOTATKA:\n${doc.slice(0, 24000)}`, onToken);

export const suggestLinks = (s: AiSettings, doc: string, current: string, notes: string[], onToken: (full: string) => void) =>
  chat(s, "links", LINKS_PROMPT,
    `ISTNIEJĄCE NOTATKI:\n${notes.filter((n) => n !== current).slice(0, 400).map((n) => `- ${n}`).join("\n")}\n\n` +
    `BIEŻĄCA NOTATKA („${current}”):\n${doc.slice(0, 12000)}`, onToken);
