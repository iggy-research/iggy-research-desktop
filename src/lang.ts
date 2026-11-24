/** Wykrywanie języka dokumentu (bez sieci): znaki diakrytyczne + najczęstsze słowa. */

export const DOC_LANGS: Record<string, { pl: string; en: string; native: string }> = {
  pl: { pl: "polski", en: "Polish", native: "polski" },
  en: { pl: "angielski", en: "English", native: "English" },
  de: { pl: "niemiecki", en: "German", native: "Deutsch" },
  fr: { pl: "francuski", en: "French", native: "français" },
  es: { pl: "hiszpański", en: "Spanish", native: "español" },
  it: { pl: "włoski", en: "Italian", native: "italiano" },
  pt: { pl: "portugalski", en: "Portuguese", native: "português" },
  cs: { pl: "czeski", en: "Czech", native: "čeština" },
  uk: { pl: "ukraiński", en: "Ukrainian", native: "українська" },
};

const STOPWORDS: Record<string, string[]> = {
  pl: ["i", "w", "nie", "się", "na", "że", "to", "jest", "z", "do", "jak", "co", "ale", "o", "tak", "przez", "jego", "czy", "który", "być"],
  en: ["the", "and", "of", "to", "is", "in", "that", "it", "for", "with", "as", "was", "on", "are", "this", "be", "not", "you", "have", "but"],
  de: ["der", "die", "und", "das", "ist", "nicht", "ich", "sie", "zu", "den", "mit", "es", "ein", "auch", "auf", "dem", "eine", "sich", "von", "wir"],
  fr: ["le", "la", "et", "les", "des", "est", "un", "une", "que", "dans", "pas", "pour", "qui", "en", "du", "sur", "il", "au", "avec", "ce"],
  es: ["el", "la", "que", "y", "los", "en", "del", "las", "un", "por", "con", "una", "para", "es", "se", "no", "lo", "como", "más", "pero"],
  it: ["il", "che", "di", "la", "e", "è", "per", "non", "un", "una", "del", "della", "sono", "con", "si", "le", "gli", "come", "anche", "ma"],
  pt: ["o", "que", "de", "e", "do", "da", "em", "não", "um", "uma", "para", "os", "com", "se", "no", "na", "por", "mais", "as", "é"],
  cs: ["a", "se", "je", "v", "na", "že", "to", "s", "z", "do", "jak", "ale", "o", "tak", "jsou", "by", "byl", "který", "také", "není"],
};
const CHARS: Record<string, RegExp> = {
  pl: /[ąęłńśźż]/g, cs: /[ěřůčšž]/g, de: /[äöüß]/g, fr: /[àâçèêëîïôœùû]/g, es: /[ñ¿¡]/g, pt: /[ãõç]/g,
};

/** Zwraca kod języka (pl, en…) albo null, gdy tekstu jest za mało. */
export function detectLanguage(text: string): string | null {
  // bez bloków kodu, linków i znaczników
  const clean = text.replace(/```[\s\S]*?```|`[^`]*`|\[\[[^\]]*\]\]|https?:\/\/\S+|[#>*_~\-|=[\]()!]/g, " ").toLowerCase();
  if (/[а-яіїєґ]/.test(clean) && (clean.match(/[а-яіїєґ]/g)!.length > 20)) return "uk";
  const words = clean.match(/\p{L}+/gu) ?? [];
  if (words.length < 8) return null;
  const sample = words.slice(0, 2000);
  const score: Record<string, number> = {};
  for (const [lang, list] of Object.entries(STOPWORDS)) {
    const set = new Set(list);
    score[lang] = sample.filter((w) => set.has(w)).length / sample.length;
  }
  for (const [lang, re] of Object.entries(CHARS)) {
    score[lang] += ((clean.match(re)?.length ?? 0) / sample.length) * 0.5;
  }
  const [best, val] = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  return val > 0.04 ? best : null;
}
