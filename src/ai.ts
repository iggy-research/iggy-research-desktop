import { endpointFor, parseKey, LOCAL_PROVIDERS } from "./models";
import { t, uiLang } from "./i18n";
import { DOC_LANGS } from "./lang";

/** Zadania AI; każde może mieć własny model. Puste = taki jak do analizy akapitu. */
export type Task = "analyze" | "summary" | "links";
export const TASK_LIST: Task[] = ["analyze", "summary", "links"];
export const taskLabel = (task: Task) => t(`task.${task}`);

export interface AiSettings {
  apiKey: string;
  models: Record<Task, string>;
  prompt: string;
  debounceMs: number;
  autoAnalyze: boolean;
  local: { ollama: boolean; lmstudio: boolean };
  localUrls: { ollama: string; lmstudio: string };
}

/** Domyślne prompty w językach, w których je napisaliśmy; dla pozostałych języków angielski + „odpowiadaj po …”. */
const PROMPTS: Record<"pl" | "en", Record<Task, string>> = {
  pl: {
    analyze: `Jesteś redaktorem. Przeanalizuj podany akapit (w kontekście całego tekstu) pod kątem:
- poprawności językowej (gramatyka, interpunkcja, literówki),
- jasności i zwięzłości (zbędne słowa, strona bierna, powtórzenia),
- spójności z resztą tekstu.
Odpowiedz krótko w Markdown: najpierw jedna linia oceny, potem maks. 5 punktów z konkretnymi poprawkami ("przed → po"). Odpowiadaj w języku akapitu.`,
    summary: `Jesteś uważnym czytelnikiem notatek autora. Nie piszesz za niego — pomagasz mu zobaczyć własną myśl.
Odpowiedz w Markdown, w języku notatki:
1. **Teza** — jedno zdanie: co ta notatka właściwie twierdzi.
2. **Kluczowe punkty** — maks. 5 krótkich punktów.
3. **Luki i pytania** — 2–3 pytania, które warto sobie zadać, żeby myśl poszła dalej (brakujące argumenty, kontrprzykłady, niejasne pojęcia).`,
    links: `Pomagasz budować sieć połączonych notatek (drugi mózg). Dostajesz bieżącą notatkę i listę nazw istniejących notatek.
Wskaż maks. 7 istniejących notatek, z którymi bieżąca notatka naprawdę się łączy. Używaj WYŁĄCZNIE nazw z listy, dokładnie w zapisie [[Nazwa]].
Dla każdej: [[Nazwa]] — w którym miejscu notatki warto wstawić link i dlaczego (jedno zdanie).
Na końcu, jeśli to ma sens, zaproponuj 1–2 nowe notatki do napisania jako [[Nowa notatka]] z dopiskiem „(nowa)”.
Jeśli nic się nie łączy, napisz to wprost. Odpowiadaj w języku notatki, w Markdown.`,
  },
  en: {
    analyze: `You are an editor. Review the given paragraph (in the context of the whole text) for:
- correctness (grammar, punctuation, typos),
- clarity and concision (filler words, passive voice, repetition),
- consistency with the rest of the text.
Reply briefly in Markdown: first a one-line verdict, then at most 5 bullet points with concrete fixes ("before → after"). Reply in the paragraph's language.`,
    summary: `You are an attentive reader of the author's notes. You do not write for them — you help them see their own thought.
Reply in Markdown, in the note's language:
1. **Thesis** — one sentence: what this note actually claims.
2. **Key points** — at most 5 short bullets.
3. **Gaps and questions** — 2–3 questions worth asking to push the thought further (missing arguments, counterexamples, vague terms).`,
    links: `You help build a network of linked notes (a second brain). You get the current note and a list of existing note names.
Point to at most 7 existing notes the current note genuinely connects to. Use ONLY names from the list, written exactly as [[Name]].
For each: [[Name]] — where in the note to add the link and why (one sentence).
At the end, if it makes sense, propose 1–2 new notes to write as [[New note]] marked "(new)".
If nothing connects, say so plainly. Reply in the note's language, in Markdown.`,
  },
};

/** Domyślny prompt zadania dla języka dokumentu. */
export const defaultPrompt = (task: Task, docLang: string | null) =>
  PROMPTS[(docLang ?? uiLang()) === "pl" ? "pl" : "en"][task];
/** Czy tekst to któryś z domyślnych promptów (wtedy zapisujemy "", żeby dopasowywał się do języka). */
export const isDefaultPrompt = (p: string) =>
  Object.values(PROMPTS).some((byTask) => byTask.analyze.trim() === p.trim());

export const DEFAULT_SETTINGS: AiSettings = {
  apiKey: "",
  models: { analyze: "anthropic/claude-sonnet-5.5", summary: "", links: "" },
  prompt: "", // "" = domyślny w języku dokumentu
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
  if (isDefaultPrompt(s.prompt)) s.prompt = "";
  return s;
}

export const modelFor = (s: AiSettings, task: Task) => s.models[task] || s.models.analyze;

/** null = można wysłać; inaczej komunikat, czego brakuje. */
export function missingConfig(s: AiSettings, task: Task): string | null {
  return parseKey(modelFor(s, task)).provider === "openrouter" && !s.apiKey
    ? t("ai.needKey")
    : null;
}

/** Wywoływane po udanej odpowiedzi — do listy „ostatnio używane”. */
export let onModelUsed: (key: string) => void = () => {};
export const setOnModelUsed = (f: (key: string) => void) => (onModelUsed = f);

const controllers: Partial<Record<Task, AbortController>> = {};

/** Strumieniuje odpowiedź modelu przypisanego do zadania. Poprzednie żądanie tego samego zadania jest przerywane. */
async function chat(s: AiSettings, task: Task, docLang: string | null, system: string, user: string, onToken: (full: string) => void): Promise<string> {
  const info = docLang ? DOC_LANGS[docLang] : null;
  if (info) system += `\n\nReply in ${info.en} (${info.native}).`;
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
      ? t("ai.connOpenRouter", { err: e?.message ?? e })
      : t("ai.connLocal", { name: LOCAL_PROVIDERS[p].label, url: ep.url }));
  }
  if (!res.ok || !res.body) throw new Error(`${ep.url.includes("openrouter") ? "OpenRouter" : t("ai.localModel")} ${res.status}: ${await res.text()}`);

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

export const analyzeParagraph = (s: AiSettings, docLang: string | null, paragraph: string, context: string, onToken: (full: string) => void) =>
  chat(s, "analyze", docLang, s.prompt.trim() || defaultPrompt("analyze", docLang),
    `CONTEXT (whole document, truncated):\n${context.slice(0, 6000)}\n\nPARAGRAPH TO REVIEW:\n${paragraph}`, onToken);

export const summarizeNote = (s: AiSettings, docLang: string | null, doc: string, onToken: (full: string) => void) =>
  chat(s, "summary", docLang, defaultPrompt("summary", docLang), `NOTE:\n${doc.slice(0, 24000)}`, onToken);

export const suggestLinks = (s: AiSettings, docLang: string | null, doc: string, current: string, notes: string[], onToken: (full: string) => void) =>
  chat(s, "links", docLang, defaultPrompt("links", docLang),
    `EXISTING NOTES:\n${notes.filter((n) => n !== current).slice(0, 400).map((n) => `- ${n}`).join("\n")}\n\n` +
    `CURRENT NOTE ("${current}"):\n${doc.slice(0, 12000)}`, onToken);
