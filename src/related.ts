/**
 * Wybór dawnych notatek do porównania („Kiedyś myślałeś inaczej”) — lokalnie, bez wysyłania całej biblioteki.
 * Prosty ranking: wspólne „treściwe” słowa (≥ 5 liter) ważone rzadkością w bibliotece (jak TF-IDF).
 * Z każdej wybranej notatki bierzemy najtrafniejsze akapity.
 */
const words = (text: string) =>
  (text.toLowerCase().replace(/```[\s\S]*?```|\[\[|\]\]|https?:\/\/\S+/g, " ").match(/\p{L}{5,}/gu) ?? []);

export interface Related { name: string; path: string; excerpt: string; score: number }

export function relatedNotes(current: string, notes: { name: string; path: string; text: string }[], opts = { top: 8, chars: 1600 }): Related[] {
  const df = new Map<string, number>();
  const bags = notes.map((n) => {
    const set = new Set(words(n.text));
    set.forEach((w) => df.set(w, (df.get(w) ?? 0) + 1));
    return set;
  });
  const idf = (w: string) => Math.log((notes.length + 1) / ((df.get(w) ?? 0) + 1));
  const query = new Set(words(current));
  const scoreText = (set: Set<string>) => { let s = 0; set.forEach((w) => { if (query.has(w)) s += idf(w); }); return s; };
  return notes
    .map((n, i) => ({ n, score: scoreText(bags[i]) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.top)
    .map(({ n, score }) => {
      // najtrafniejsze akapity, w kolejności z notatki
      const paras = n.text.split(/\n\s*\n/).map((p, i) => ({ p: p.trim(), i, s: scoreText(new Set(words(p))) })).filter((x) => x.p);
      const best = [...paras].sort((a, b) => b.s - a.s);
      const chosen: typeof paras = [];
      let len = 0;
      for (const x of best) { if (len + x.p.length > opts.chars && chosen.length) break; chosen.push(x); len += x.p.length; }
      const excerpt = chosen.sort((a, b) => a.i - b.i).map((x) => x.p).join("\n\n").slice(0, opts.chars);
      return { name: n.name, path: n.path, excerpt, score };
    });
}

/**
 * Notatki z „innych dziedzin” do szukania nieoczywistych połączeń: najmniej wspólnych słów z bieżącą notatką,
 * ale niepuste. Bierzemy tytuł i początek, żeby zmieścić wiele notatek w jednym zapytaniu.
 */
export function distantNotes(current: string, notes: { name: string; path: string; text: string }[], top = 30, chars = 400) {
  const q = new Set(words(current));
  return notes
    .map((n) => { const w = words(n.text); return { n, overlap: w.filter((x) => q.has(x)).length / Math.max(1, w.length), size: w.length }; })
    .filter((x) => x.size >= 30 && x.overlap < 0.15) // ten sam temat to nie „inna dziedzina”
    .sort((a, b) => a.overlap - b.overlap)
    .slice(0, top)
    .map(({ n }) => ({ name: n.name, path: n.path, excerpt: n.text.replace(/^#.*\n/, "").trim().slice(0, chars), score: 0 }));
}
