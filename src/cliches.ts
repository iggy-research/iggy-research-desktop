/** Podkreślenia banałów w edytorze (wynik wykrywacza banału). Zakresy przesuwają się razem z edycją tekstu. */
import { StateEffect, StateField, RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";

export interface Cliche { from: number; to: number; why: string }

export const setCliches = StateEffect.define<Cliche[]>();

export const clicheField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setCliches)) continue;
      const b = new RangeSetBuilder<Decoration>();
      for (const c of [...e.value].sort((a, z) => a.from - z.from)) {
        b.add(c.from, c.to, Decoration.mark({ class: "cm-cliche", attributes: { title: c.why } }));
      }
      deco = b.finish();
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Pozycja cytatu w dokumencie: najpierw dokładnie, potem z luźnymi odstępami i cudzysłowami. */
export function locate(doc: string, quote: string): { from: number; to: number } | null {
  const exact = doc.indexOf(quote);
  if (exact >= 0) return { from: exact, to: exact + quote.length };
  const pattern = quote.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+").replace(/["„”“'’‘]/g, "[\"„”“'’‘]").replace(/[-–—]/g, "[-–—]");
  try {
    const m = new RegExp(pattern, "i").exec(doc);
    return m ? { from: m.index, to: m.index + m[0].length } : null;
  } catch { return null; }
}
