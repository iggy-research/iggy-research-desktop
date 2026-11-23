import { RangeSetBuilder, StateEffect } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, keymap } from "@codemirror/view";
import { autocompletion, startCompletion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { LINK_RE, linkTarget } from "./vault";

/** Wyślij po zmianie listy notatek, żeby odświeżyć kolory linków. */
export const refreshLinks = StateEffect.define<null>();

export interface WikiHooks {
  names(): string[];                 // nazwy notatek do podpowiedzi
  exists(target: string): boolean;   // czy notatka istnieje (inny kolor dla nieistniejących)
  open(target: string): void;        // otwórz lub utwórz notatkę
}

function inCode(view: EditorView, pos: number) {
  for (let n: any = syntaxTree(view.state).resolveInner(pos, 1); n; n = n.parent)
    if (/^(FencedCode|CodeBlock|InlineCode|CodeText)$/.test(n.name)) return true;
  return false;
}

/** Zwraca cel linku [[...]] pod pozycją, jeśli jest. */
function linkAt(view: EditorView, pos: number): string | null {
  const line = view.state.doc.lineAt(pos);
  for (const m of line.text.matchAll(LINK_RE)) {
    const a = line.from + m.index!, z = a + m[0].length;
    if (pos >= a && pos <= z) return linkTarget(m[1]);
  }
  return null;
}

export function wikilinks(h: WikiHooks) {
  const mark = (ok: boolean) => Decoration.mark({ class: ok ? "cm-wikilink" : "cm-wikilink cm-wikilink-missing" });
  const bracket = Decoration.mark({ class: "cm-wikilink-bracket" });

  const highlighter = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(v: EditorView) { this.decorations = this.build(v); }
    update(u: ViewUpdate) {
      const refresh = u.transactions.some((tr) => tr.effects.some((e) => e.is(refreshLinks)));
      if (u.docChanged || u.viewportChanged || refresh) this.decorations = this.build(u.view);
    }
    build(v: EditorView) {
      const b = new RangeSetBuilder<Decoration>();
      for (const { from, to } of v.visibleRanges) {
        const text = v.state.doc.sliceString(from, to);
        for (const m of text.matchAll(LINK_RE)) {
          const a = from + m.index!, z = a + m[0].length;
          if (inCode(v, a)) continue; // [[ ]] w przykładzie kodu to nie link
          b.add(a, a + 2, bracket);
          b.add(a + 2, z - 2, mark(h.exists(linkTarget(m[1]))));
          b.add(z - 2, z, bracket);
        }
      }
      return b.finish();
    }
  }, { decorations: (p) => p.decorations });

  // Ctrl/⌘ + klik otwiera link (zwykły klik ustawia kursor, żeby dało się link edytować)
  const clicks = EditorView.domEventHandlers({
    mousedown(e, view) {
      if (!(e.metaKey || e.ctrlKey)) return false;
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
      const target = pos != null ? linkAt(view, pos) : null;
      if (!target) return false;
      e.preventDefault();
      h.open(target);
      return true;
    },
  });

  // Ctrl/⌘ + Enter, gdy kursor stoi w linku
  const keys = keymap.of([{
    key: "Mod-Enter",
    run: (view) => {
      const target = linkAt(view, view.state.selection.main.head);
      if (!target) return false;
      h.open(target);
      return true;
    },
  }]);

  // Po wpisaniu "[[" podpowiada nazwy notatek
  const complete = (ctx: CompletionContext): CompletionResult | null => {
    const m = ctx.matchBefore(/\[\[[^\[\]\n|#]*/);
    if (!m) return null;
    const after = ctx.state.sliceDoc(ctx.pos, ctx.pos + 2);
    return {
      from: m.from + 2,
      options: h.names().map((name) => ({
        label: name,
        type: "text",
        apply: after === "]]" ? name : name + "]]",
      })),
      validFor: /^[^\[\]\n|#]*$/,
    };
  };

  // Automatyczne domknięcie: wpisanie "[[" wstawia "]]" za kursorem
  const autoClose = EditorView.inputHandler.of((view, from, to, text) => {
    if (text !== "[" || view.state.sliceDoc(from - 1, from) !== "[") return false;
    if (view.state.sliceDoc(to, to + 2) === "]]") return false;
    view.dispatch({ changes: { from, to, insert: "[]]" }, selection: { anchor: from + 1 } });
    startCompletion(view);
    return true;
  });

  return [highlighter, clicks, keys, autoClose, autocompletion({ override: [complete], icons: false })];
}
