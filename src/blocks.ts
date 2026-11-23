import { EditorState, StateField, Range } from "@codemirror/state";
import { EditorView, Decoration, DecorationSet, WidgetType } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import katex from "katex";
import { marked } from "marked";

/*
 * Bloki wielolinijkowe w podglądzie na żywo: tabele i wzory $$…$$.
 * Zastępują całe linie, więc CodeMirror wymaga, żeby pochodziły z StateField, a nie z ViewPlugin.
 * Gdy kursor wejdzie w blok, widać jego surowy Markdown.
 */

export const renderMath = (tex: string, display: boolean) => {
  try { return katex.renderToString(tex, { displayMode: display, throwOnError: false, output: "html" }); }
  catch (e: any) { return `<span class="math-error">${String(e?.message ?? e)}</span>`; }
};

/** Markdown tabeli -> HTML. */
export function renderTable(src: string): string {
  const rows = src.trim().split("\n").map((r) => r.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim()));
  if (rows.length < 2) return "";
  const align = rows[1].map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : "left"));
  const cell = (tag: string, c: string, i: number) =>
    `<${tag} style="text-align:${align[i] ?? "left"}">${marked.parseInline(c.replace(/\\\|/g, "|"))}</${tag}>`;
  const head = `<tr>${rows[0].map((c, i) => cell("th", c, i)).join("")}</tr>`;
  const body = rows.slice(2).map((r) => `<tr>${r.map((c, i) => cell("td", c, i)).join("")}</tr>`).join("");
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

class HtmlBlockWidget extends WidgetType {
  constructor(readonly html: string, readonly cls: string, readonly pos: number) { super(); }
  eq(o: HtmlBlockWidget) { return o.html === this.html && o.pos === this.pos; }
  toDOM(view: EditorView) {
    const div = document.createElement("div");
    div.className = this.cls;
    div.innerHTML = this.html;
    // kliknięcie przenosi kursor do bloku, więc pokazuje się surowy Markdown do edycji
    div.onmousedown = (e) => { e.preventDefault(); view.dispatch({ selection: { anchor: this.pos } }); view.focus(); };
    return div;
  }
  ignoreEvent() { return false; }
}

function touchesSelection(state: EditorState, from: number, to: number) {
  return state.selection.ranges.some((r) => r.to >= from && r.from <= to);
}

function build(state: EditorState): DecorationSet {
  const out: Range<Decoration>[] = [];
  const doc = state.doc;
  const code: [number, number][] = [];

  syntaxTree(state).iterate({
    enter: (n) => {
      if (n.name === "FencedCode" || n.name === "CodeBlock") { code.push([n.from, n.to]); return false; }
      if (n.name === "Table") {
        const from = doc.lineAt(n.from).from, to = doc.lineAt(n.to).to;
        if (!touchesSelection(state, from, to)) {
          const html = renderTable(doc.sliceString(from, to));
          if (html) out.push(Decoration.replace({ widget: new HtmlBlockWidget(html, "cm-lp-table", from), block: true }).range(from, to));
        }
        return false;
      }
    },
  });

  // $$ … $$ w osobnych liniach (albo w jednej: $$x$$)
  const text = doc.toString();
  for (const m of text.matchAll(/^\$\$([\s\S]+?)\$\$[ \t]*$/gm)) {
    const from = m.index!, to = from + m[0].length;
    if (code.some(([a, z]) => from >= a && from < z)) continue;
    if (touchesSelection(state, from, to)) continue;
    out.push(Decoration.replace({
      widget: new HtmlBlockWidget(renderMath(m[1].trim(), true), "cm-lp-mathblock", from), block: true,
    }).range(from, to));
  }
  return Decoration.set(out, true);
}

export const blockPreview = StateField.define<DecorationSet>({
  create: build,
  update: (deco, tr) => (tr.docChanged || tr.selection || syntaxTree(tr.startState) !== syntaxTree(tr.state) ? build(tr.state) : deco),
  provide: (f) => EditorView.decorations.from(f),
});
