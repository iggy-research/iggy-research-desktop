import { endpointFor, parseKey, LOCAL_PROVIDERS } from "./models";
import { t, uiLang } from "./i18n";
import { DOC_LANGS } from "./lang";

/** Zadania AI; każde może mieć własny model. Puste = taki jak do analizy akapitu. */
export type Task = "analyze" | "summary" | "links" | "cliche" | "devil" | "past"
  | "claim" | "assumptions" | "lay" | "starter" | "precheck" | "socratic";
export const TASK_LIST: Task[] = ["analyze", "summary", "links", "cliche", "devil", "past", "claim", "assumptions", "lay", "starter", "precheck", "socratic"];
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

// Wykrywacz banału odpowiada JSON-em, żeby aplikacja mogła podkreślić zdania w edytorze
const CLICHE_PL = `Jesteś redaktorem wyczulonym na język. Znajdź w tekście zdania, które brzmią jak przeciętny tekst z internetu albo wygenerowany przez AI: frazesy, puste ogólniki, korporacyjna nowomowa, oczywistości, efektowne zakończenia, które nic nie mówią.
Nie poprawiaj ich i nie proponuj nowych wersji — autor zrobi to sam.
Odpowiedz WYŁĄCZNIE tablicą JSON, bez Markdown i komentarzy:
[{"quote": "fragment skopiowany z tekstu znak w znak", "why": "krótko, dlaczego to banał"}]
Maks. 8 pozycji; fragment to jedno zdanie albo jego część (min. 4 słowa). Pole "why" w języku tekstu. Jeśli nic nie ma, zwróć [].`;
const CLICHE_EN = `You are an editor with a sharp ear for language. Find sentences that sound like average internet text or AI output: clichés, empty generalities, corporate speak, truisms, punchy endings that say nothing.
Do not fix them or offer new versions — the author will do that.
Reply ONLY with a JSON array, no Markdown or commentary:
[{"quote": "fragment copied from the text character for character", "why": "briefly, why it is a cliché"}]
At most 8 items; a fragment is one sentence or part of it (min. 4 words). Write "why" in the text's language. If there is nothing, return [].`;

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
    cliche: CLICHE_PL,
    devil: `Jesteś adwokatem diabła. Autor przedstawia tezę. Zbuduj najmocniejszy możliwy kontrargument — taki, jaki postawiłby inteligentny, dobrze poinformowany przeciwnik. Nie poprawiaj tekstu, nie chwal, nie łagodź.
Odpowiedz w Markdown, w języku tekstu:
1. **Teza, którą atakuję** — jedno zdanie.
2. **Kontrargument** — 1–2 akapity.
3. **Najsłabsze założenie** — jedno zdanie: co autor przyjmuje bez dowodu.
4. **Pytanie, na które musisz odpowiedzieć** — jedno.`,
    past: `Widzisz fragmenty starszych notatek autora. Porównaj z nimi bieżący tekst i wskaż miejsca, gdzie autor wcześniej myślał inaczej: sprzeczności, zmiany zdania, napięcia albo dawne argumenty, których dziś brakuje. Nie oceniaj, która wersja jest lepsza.
Dla każdego: **[[Nazwa notatki]]** — co tam twierdziłeś (krótki cytat) → co twierdzisz teraz → pytanie, które z tego wynika. Maks. 5. Używaj WYŁĄCZNIE nazw z listy, dokładnie w zapisie [[Nazwa]].
Jeśli nie ma realnych rozbieżności, napisz to wprost — niczego nie wymyślaj. Odpowiadaj w języku tekstu, w Markdown.`,
    claim: `Przeczytaj tekst i odpowiedz w Markdown, w języku tekstu:
1. **Co tu właściwie twierdzisz** — teza w JEDNYM zdaniu, tak jak zrozumie ją uważny czytelnik.
2. **Czy tekst jej broni** — jedno, dwa zdania: które fragmenty ją wspierają, a które ciągną gdzie indziej.
Nie poprawiaj tekstu i nie proponuj nowej tezy. Jeśli tekst ma kilka konkurujących tez, wymień je krótko — to sygnał dla autora.`,
    assumptions: `Wypisz założenia, które tekst przyjmuje bez uzasadnienia — rzeczy, które muszą być prawdą, żeby rozumowanie działało.
Każde jako pytanie do autora: **Zakładasz, że …** — czy na pewno? (jedno zdanie, dlaczego to warto sprawdzić).
Maks. 5, od najważniejszego. Nie oceniaj, nie poprawiaj. Odpowiadaj w języku tekstu, w Markdown.`,
    lay: `Czytasz jako inteligentny laik spoza tej dziedziny. Wskaż miejsca, w których się gubisz: żargon bez wyjaśnienia, skróty myślowe, przeskoki, odwołania do rzeczy, których nie znasz.
Nie poprawiaj ich. Odpowiedz WYŁĄCZNIE tablicą JSON, bez Markdown:
[{"quote": "fragment skopiowany z tekstu znak w znak", "why": "co dokładnie jest niejasne dla laika"}]
Maks. 8 pozycji. Pole "why" w języku tekstu. Jeśli wszystko jest jasne, zwróć [].`,
    starter: `Autor zaczyna pisać na temat z tytułu i początku notatki. Zamiast konspektu zadaj 5 pytań, na które odpowiedzi staną się tekstem:
od „co naprawdę myślisz” przez „skąd to wiesz” i „co by cię przekonało, że się mylisz” po „dlaczego to ważne dla czytelnika”.
Odpowiedz WYŁĄCZNIE listą 5 pytań w Markdown (1. … 5.), każde jedno zdanie, w języku notatki. Bez wstępu i bez podpowiedzi odpowiedzi.`,
    socratic: `Prowadzisz z autorem dialog sokratejski o jego notatce. Zadajesz JEDNO krótkie pytanie naraz i czekasz na odpowiedź.
Drąż: proś o definicje, przykłady, źródła pewności, konsekwencje i kontrprzykłady; wracaj do sprzeczności w odpowiedziach.
Nie podawaj własnych tez, nie oceniaj, nie pisz za autora. Gdy autor napisze, że kończy (albo po ok. 8 pytaniach),
podsumuj w 3 punktach, co ustalił — jego słowami — i jakie pytanie zostaje otwarte. Pisz w języku notatki.`,
    precheck: `Kontrola przed publikacją. Nie oceniaj stylu i nie przepisuj tekstu. Wypisz w Markdown, w języku tekstu:
**Do sprawdzenia** — fakty, liczby, daty, nazwiska i cytaty, które warto zweryfikować (cytuj fragment).
**Niespójności** — miejsca, gdzie tekst przeczy sam sobie albo zmienia nazewnictwo.
**Literówki i błędy** — konkretne, z poprawną formą.
Jeśli w danej grupie nic nie ma, napisz „brak”.`,
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
    cliche: CLICHE_EN,
    devil: `You are the devil's advocate. The author presents a claim. Build the strongest possible counterargument — the one a smart, well-informed opponent would make. Do not fix the text, do not praise, do not soften.
Reply in Markdown, in the text's language:
1. **The claim I attack** — one sentence.
2. **Counterargument** — 1–2 paragraphs.
3. **Weakest assumption** — one sentence: what the author takes for granted without evidence.
4. **The question you must answer** — one.`,
    past: `You can see excerpts from the author's older notes. Compare the current text with them and point out where the author used to think differently: contradictions, changes of mind, tensions, or old arguments missing today. Do not judge which version is better.
For each: **[[Note name]]** — what you claimed there (short quote) → what you claim now → the question this raises. At most 5. Use ONLY names from the list, written exactly as [[Name]].
If there are no real differences, say so plainly — do not invent any. Reply in the text's language, in Markdown.`,
    claim: `Read the text and reply in Markdown, in the text's language:
1. **What you are actually claiming** — the thesis in ONE sentence, as an attentive reader would understand it.
2. **Does the text defend it** — one or two sentences: which parts support it and which pull elsewhere.
Do not fix the text or propose a new thesis. If there are several competing theses, list them briefly — that is a signal for the author.`,
    assumptions: `List the assumptions the text takes for granted — things that must be true for the reasoning to work.
Each as a question to the author: **You assume that …** — are you sure? (one sentence on why it is worth checking).
At most 5, most important first. Do not judge or fix. Reply in the text's language, in Markdown.`,
    lay: `You read as an intelligent layperson outside this field. Point out where you get lost: unexplained jargon, mental shortcuts, jumps, references to things you don't know.
Do not fix them. Reply ONLY with a JSON array, no Markdown:
[{"quote": "fragment copied from the text character for character", "why": "what exactly is unclear to a layperson"}]
At most 8 items. Write "why" in the text's language. If everything is clear, return [].`,
    starter: `The author is starting to write on the topic from the note's title and beginning. Instead of an outline, ask 5 questions whose answers will become the text:
from "what do you really think" through "how do you know" and "what would convince you that you are wrong" to "why it matters to the reader".
Reply ONLY with a Markdown list of 5 questions (1. … 5.), one sentence each, in the note's language. No intro and no hints at answers.`,
    socratic: `You hold a Socratic dialogue with the author about their note. Ask ONE short question at a time and wait for the answer.
Dig deeper: ask for definitions, examples, sources of certainty, consequences and counterexamples; return to contradictions in the answers.
Do not give your own theses, do not judge, do not write for the author. When the author says they are done (or after about 8 questions),
summarize in 3 points what they established — in their words — and which question remains open. Write in the note's language.`,
    precheck: `Pre-publication check. Do not judge style or rewrite the text. List in Markdown, in the text's language:
**To verify** — facts, numbers, dates, names and quotes worth checking (quote the fragment).
**Inconsistencies** — places where the text contradicts itself or changes naming.
**Typos and errors** — specific, with the correct form.
If a group is empty, write "none".`,
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
  models: { analyze: "anthropic/claude-sonnet-5.5", summary: "", links: "", cliche: "", devil: "", past: "",
    claim: "", assumptions: "", lay: "", starter: "", precheck: "", socratic: "" },
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
export interface ChatMessage { role: "user" | "assistant"; content: string }

async function chat(s: AiSettings, task: Task, docLang: string | null, system: string, user: string | ChatMessage[], onToken: (full: string) => void): Promise<string> {
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
        messages: [{ role: "system", content: system }, ...(typeof user === "string" ? [{ role: "user", content: user }] : user)],
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

export const findCliches = (s: AiSettings, docLang: string | null, doc: string, onToken: (full: string) => void) =>
  chat(s, "cliche", docLang, defaultPrompt("cliche", docLang), `TEXT:\n${doc.slice(0, 20000)}`, onToken);

/** Adwokat diabła: atakuje `target` (zaznaczenie, akapit albo całą notatkę) w kontekście całego tekstu. */
export const devilsAdvocate = (s: AiSettings, docLang: string | null, target: string, doc: string, onToken: (full: string) => void) =>
  chat(s, "devil", docLang, defaultPrompt("devil", docLang),
    `${target === doc ? "" : `CONTEXT (whole note, truncated):\n${doc.slice(0, 6000)}\n\n`}CLAIM TO ATTACK:\n${target.slice(0, 8000)}`, onToken);

/** „Kiedyś myślałeś inaczej”: bieżąca notatka + fragmenty najbliższych tematycznie dawnych notatek. */
export const pastSelf = (s: AiSettings, docLang: string | null, doc: string, current: string,
  related: { name: string; excerpt: string }[], onToken: (full: string) => void) =>
  chat(s, "past", docLang, defaultPrompt("past", docLang),
    `OLDER NOTES (excerpts):\n${related.map((r) => `### [[${r.name}]]\n${r.excerpt}`).join("\n\n")}\n\n` +
    `CURRENT NOTE ("${current}"):\n${doc.slice(0, 10000)}`, onToken);

/** Wynik wykrywacza banału: tolerujemy otoczkę (```json, komentarz) wokół tablicy. */
export function parseCliches(raw: string): { quote: string; why: string }[] | null {
  const m = /\[[\s\S]*\]/.exec(raw);
  if (!m) return null;
  try {
    const arr = JSON.parse(m[0]);
    return Array.isArray(arr) ? arr.filter((x) => x && typeof x.quote === "string" && x.quote.trim())
      .map((x) => ({ quote: x.quote.trim(), why: String(x.why ?? "").trim() })) : null;
  } catch { return null; }
}

/** Narzędzia na tekście (zaznaczenie / akapit / notatka) bez specjalnego kontekstu — jeden wzorzec wywołania. */
export const textTool = (s: AiSettings, task: Exclude<Task, "analyze" | "summary" | "links" | "past" | "devil">,
  docLang: string | null, target: string, doc: string, onToken: (full: string) => void) =>
  chat(s, task, docLang, defaultPrompt(task, docLang),
    `${target === doc ? "" : `CONTEXT (whole note, truncated):\n${doc.slice(0, 6000)}\n\n`}TEXT:\n${target.slice(0, 16000)}`, onToken);

/** Dialog sokratejski: kolejna wypowiedź AI w rozmowie o notatce (historia w `turns`). */
export const socraticTurn = (s: AiSettings, docLang: string | null, doc: string, turns: ChatMessage[], onToken: (full: string) => void) =>
  chat(s, "socratic", docLang, `${defaultPrompt("socratic", docLang)}\n\nNOTE:\n${doc.slice(0, 12000)}`,
    turns.length ? turns : [{ role: "user", content: "Start the dialogue with your first question." }], onToken);
