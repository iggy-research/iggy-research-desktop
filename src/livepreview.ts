import { EditorState, Range } from "@codemirror/state";
import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { blockPreview, renderMath } from "./blocks";
import { embedHtml, kindOf, parseEmbed } from "./media";

/*
 * Podgląd na żywo: znaczniki Markdown są ukryte, a tekst sformatowany.
 * W liniach, w których stoi kursor (albo zaznaczenie), widać surowy Markdown do edycji.
 */

const hide = Decoration.replace({});

class BulletWidget extends WidgetType {
  toDOM() { const s = document.createElement("span"); s.className = "cm-lp-bullet"; s.textContent = "•"; return s; }
  eq() { return true; }
}
class HrWidget extends WidgetType {
  toDOM() { const s = document.createElement("span"); s.className = "cm-lp-hr"; return s; }
  eq() { return true; }
}
class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly pos: number) { super(); }
  eq(o: CheckboxWidget) { return o.checked === this.checked && o.pos === this.pos; }
  toDOM(view: EditorView) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "cm-lp-check";
    box.checked = this.checked;
    box.onmousedown = (e) => {
      e.preventDefault();
      view.dispatch({ changes: { from: this.pos + 1, to: this.pos + 2, insert: this.checked ? " " : "x" } });
    };
    return box;
  }
  ignoreEvent() { return false; }
}
class CalloutTitleWidget extends WidgetType {
  constructor(readonly type: string) { super(); }
  eq(o: CalloutTitleWidget) { return o.type === this.type; }
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-lp-callout-icon";
    s.textContent = CALLOUT_ICONS[this.type] ?? "ℹ";
    return s;
  }
}

class MediaWidget extends WidgetType {
  constructor(readonly html: string, readonly pos: number) { super(); }
  eq(o: MediaWidget) { return o.html === this.html && o.pos === this.pos; }
  toDOM(view: EditorView) {
    const div = document.createElement("span");
    div.className = "cm-lp-media";
    div.innerHTML = this.html;
    // klik w obraz przenosi kursor do kodu osadzenia; kontrolki wideo i audio działają normalnie
    div.onmousedown = (e) => {
      if ((e.target as HTMLElement).closest("video, audio, iframe")) return;
      e.preventDefault();
      view.dispatch({ selection: { anchor: this.pos } });
      view.focus();
    };
    return div;
  }
  // Zdarzenia w odtwarzaczach obsługuje przeglądarka, a CodeMirror ich nie widzi,
  // więc klik w „play” nie przesuwa kursora i nie zamienia odtwarzacza w tekst.
  ignoreEvent(e: Event) {
    if ((e.target as HTMLElement).closest?.("video, audio, iframe")) return true;
    return e.type !== "mousedown";
  }
}

class MathWidget extends WidgetType {
  constructor(readonly tex: string) { super(); }
  eq(o: MathWidget) { return o.tex === this.tex; }
  toDOM() { const s = document.createElement("span"); s.className = "cm-lp-math"; s.innerHTML = renderMath(this.tex, false); return s; }
}
class FootnoteRefWidget extends WidgetType {
  constructor(readonly label: string, readonly note: string) { super(); }
  eq(o: FootnoteRefWidget) { return o.label === this.label && o.note === this.note; }
  toDOM() {
    const s = document.createElement("sup");
    s.className = "cm-lp-fnref";
    s.textContent = this.label;
    s.title = this.note || "Brak treści przypisu";
    return s;
  }
}

/** Przypisy w kolejności pierwszego odwołania: id -> { numer, treść }. */
/** Bloki kodu (```…```) i kod w linii (`…`). Składnia w nich to przykład, a nie formatowanie. */
export const CODE_RE = /^(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1[ \t]*$|`[^`\n]+`/gm;

export function footnotes(raw: string) {
  const text = raw.replace(CODE_RE, "");
  const defs = new Map<string, string>();
  for (const m of text.matchAll(/^\[\^([^\]\s]+)\]:[ \t]*(.*)$/gm)) defs.set(m[1], m[2]);
  const order = new Map<string, number>();
  for (const m of text.matchAll(/\[\^([^\]\s]+)\](?!:)/g)) if (!order.has(m[1])) order.set(m[1], order.size + 1);
  return { defs, order };
}

const CALLOUT_ICONS: Record<string, string> = {
  note: "✎", info: "ℹ", tip: "💡", hint: "💡", important: "❗", success: "✓", check: "✓", done: "✓",
  question: "?", help: "?", faq: "?", warning: "⚠", caution: "⚠", attention: "⚠",
  failure: "✗", fail: "✗", missing: "✗", danger: "⚡", error: "⚡", bug: "🐞", example: "☰", quote: "❝", cite: "❝",
  abstract: "≡", summary: "≡", tldr: "≡", todo: "☐",
};
export const calloutColor = (type: string) => {
  if (["warning", "caution", "attention"].includes(type)) return "orange";
  if (["failure", "fail", "missing", "danger", "error", "bug"].includes(type)) return "red";
  if (["success", "check", "done"].includes(type)) return "green";
  if (["question", "help", "faq"].includes(type)) return "yellow";
  if (["example"].includes(type)) return "purple";
  if (["quote", "cite"].includes(type)) return "gray";
  if (["tip", "hint", "important", "abstract", "summary", "tldr"].includes(type)) return "cyan";
  return "blue";
};

/** Numery linii, na których jest kursor lub zaznaczenie. */
function activeLines(state: EditorState): Set<number> {
  const set = new Set<number>();
  for (const r of state.selection.ranges) {
    const a = state.doc.lineAt(r.from).number, z = state.doc.lineAt(r.to).number;
    for (let i = a; i <= z; i++) set.add(i);
  }
  return set;
}

function build(view: EditorView): DecorationSet {
  const { state } = view, doc = state.doc;
  const active = activeLines(state);
  const isActive = (from: number, to = from) => {
    const a = doc.lineAt(from).number, z = doc.lineAt(to).number;
    for (let i = a; i <= z; i++) if (active.has(i)) return true;
    return false;
  };
  const out: Range<Decoration>[] = [];
  const line = (pos: number, cls: string, attrs?: Record<string, string>) =>
    out.push(Decoration.line({ class: cls, attributes: attrs }).range(doc.lineAt(pos).from));
  const codeRanges: [number, number][] = [];
  const fn = footnotes(doc.toString());

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from, to,
      enter: (node) => {
        const n = node.name;

        const h = /^ATXHeading(\d)$/.exec(n);
        if (h) {
          line(node.from, `cm-lp-h cm-lp-h${h[1]}`);
          return;
        }
        if (n === "HeaderMark") {
          if (node.node.parent?.name.startsWith("ATXHeading") && !isActive(node.from)) {
            const end = Math.min(node.to + 1, doc.lineAt(node.from).to); // znacznik + spacja
            out.push(hide.range(node.from, end));
          }
          return;
        }
        if (n === "EmphasisMark" || n === "StrikethroughMark") {
          if (!isActive(node.from)) out.push(hide.range(node.from, node.to));
          return;
        }
        if (n === "InlineCode") {
          codeRanges.push([node.from, node.to]);
          out.push(Decoration.mark({ class: "cm-lp-code" }).range(node.from, node.to));
          if (!isActive(node.from)) {
            const c = node.node;
            for (let ch = c.firstChild; ch; ch = ch.nextSibling)
              if (ch.name === "CodeMark") out.push(hide.range(ch.from, ch.to));
          }
          return false;
        }
        if (n === "FencedCode" || n === "CodeBlock") {
          codeRanges.push([node.from, node.to]);
          const first = doc.lineAt(node.from).number, last = doc.lineAt(node.to).number;
          for (let i = first; i <= last; i++) {
            const cls = ["cm-lp-codeblock", i === first ? "cm-lp-codeblock-first" : "", i === last ? "cm-lp-codeblock-last" : ""].join(" ");
            out.push(Decoration.line({ class: cls }).range(doc.line(i).from));
          }
          return false;
        }
        if (n === "Image") {
          const src = doc.sliceString(node.from, node.to);
          const m = /^!\[([^\]]*)\]\(\s*<?([^)>\s]+)>?(?:\s+"[^"]*")?\s*\)$/.exec(src);
          if (m && kindOf(m[2]) && !isActive(node.from, node.to)) {
            const alt = m[1].split("|");
            const size = /^(\d+)(?:x(\d+))?$/.exec(alt[1]?.trim() ?? ""); // ![opis|300](obraz.png)
            out.push(Decoration.replace({
              widget: new MediaWidget(embedHtml(m[2], { alt: alt[0], width: size?.[1], height: size?.[2] }), node.from),
            }).range(node.from, node.to));
          }
          return false;
        }
        if (n === "Link") {
          // "[!note]" w pierwszej linii cytatu to callout, nie link
          if (/^\[!\w+\]/.test(doc.sliceString(node.from, node.to)) && node.node.parent?.parent?.name === "Blockquote") return false;
          if (doc.sliceString(node.from, node.from + 2) === "[^") return false; // przypis
          out.push(Decoration.mark({ class: "cm-lp-link" }).range(node.from, node.to));
          if (!isActive(node.from, node.to)) {
            const marks: number[] = [];
            for (let ch = node.node.firstChild; ch; ch = ch.nextSibling) if (ch.name === "LinkMark") marks.push(ch.from);
            // [tekst](url): ukryj "[" i wszystko od "]" do końca
            if (marks.length >= 2) {
              out.push(hide.range(marks[0], marks[0] + 1));
              out.push(hide.range(marks[1], node.to));
            }
          }
          return false;
        }
        if (n === "LinkReference") return false; // np. definicja przypisu "[^1]: …"
        if (n === "Blockquote") {
          const text = doc.sliceString(node.from, node.to);
          const m = /^>\s*\[!(\w+)\][+-]?\s*(.*)/.exec(text);
          const first = doc.lineAt(node.from).number, last = doc.lineAt(node.to).number;
          if (m) {
            const type = m[1].toLowerCase();
            for (let i = first; i <= last; i++) {
              const cls = ["cm-lp-callout", i === first ? "cm-lp-callout-title" : "", i === last ? "cm-lp-callout-last" : ""].join(" ");
              out.push(Decoration.line({ class: cls, attributes: { "data-callout": calloutColor(type) } }).range(doc.line(i).from));
            }
            if (!isActive(node.from)) {
              const l = doc.lineAt(node.from);
              const markEnd = l.from + l.text.indexOf("]") + 1;
              const after = l.text.slice(markEnd - l.from).match(/^[+-]?\s*/)![0].length;
              out.push(Decoration.replace({ widget: new CalloutTitleWidget(type) }).range(l.from, markEnd + after));
              if (!m[2].trim()) {
                // brak własnego tytułu -> pokaż nazwę typu
                out.push(Decoration.widget({ widget: new class extends WidgetType {
                  toDOM() { const s = document.createElement("span"); s.textContent = type[0].toUpperCase() + type.slice(1); return s; }
                }, side: 1 }).range(l.to));
              }
            }
          } else {
            for (let i = first; i <= last; i++) out.push(Decoration.line({ class: "cm-lp-quote" }).range(doc.line(i).from));
          }
          return;
        }
        if (n === "QuoteMark") {
          if (!isActive(node.from)) {
            const l = doc.lineAt(node.from);
            const end = node.to < l.to && doc.sliceString(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
            // pierwszą linię calloutu ukrywa już widżet tytułu
            if (!(l.from === node.from && /^>\s*\[!\w+\]/.test(l.text))) out.push(hide.range(node.from, end));
          }
          return;
        }
        if (n === "ListMark") {
          const parent = node.node.parent?.parent?.name;
          const task = node.node.nextSibling?.name === "Task";
          if (parent === "BulletList" && !isActive(node.from)) {
            if (task) out.push(hide.range(node.from, Math.min(node.to + 1, doc.lineAt(node.from).to)));
            else out.push(Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to));
          }
          return;
        }
        if (n === "TaskMarker") {
          const checked = /x/i.test(doc.sliceString(node.from, node.to));
          if (checked) line(node.from, "cm-lp-task-done");
          if (!isActive(node.from)) out.push(Decoration.replace({ widget: new CheckboxWidget(checked, node.from) }).range(node.from, node.to));
          return;
        }
        if (n === "HorizontalRule") {
          if (!isActive(node.from)) out.push(Decoration.replace({ widget: new HrWidget() }).range(node.from, node.to));
          return;
        }
      },
    });

    // Składnia spoza CommonMark: ==zaznaczenie==, #tag, %%komentarz%%, [[link]]
    const text = doc.sliceString(from, to);
    const inCode = (a: number) => codeRanges.some(([x, y]) => a >= x && a < y);
    const inline = (re: RegExp, fn: (a: number, z: number, m: RegExpMatchArray) => void) => {
      for (const m of text.matchAll(re)) { const a = from + m.index!; if (!inCode(a)) fn(a, a + m[0].length, m); }
    };
    inline(/==([^=\n]+)==/g, (a, z) => {
      out.push(Decoration.mark({ class: "cm-lp-highlight" }).range(a, z));
      if (!isActive(a)) { out.push(hide.range(a, a + 2)); out.push(hide.range(z - 2, z)); }
    });
    inline(/(^|[\s(])#([\p{L}\p{N}_\/-]*[\p{L}_\/-][\p{L}\p{N}_\/-]*)/gmu, (a, z, m) => {
      const start = a + m[1].length;
      if (doc.lineAt(start).text.match(/^#+\s/) && doc.lineAt(start).from === start) return; // to nagłówek
      out.push(Decoration.mark({ class: "cm-lp-tag" }).range(start, z));
    });
    // $wzór$ (bez spacji tuż po otwarciu i przed zamknięciem, więc „$5 i $10” nie są wzorem)
    inline(/(?<![\\$])\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\$)/g, (a, z, m) => {
      if (isActive(a)) out.push(Decoration.mark({ class: "cm-lp-math-src" }).range(a, z));
      else out.push(Decoration.replace({ widget: new MathWidget(m[1]) }).range(a, z));
    });
    // Przypisy: [^1] -> indeks górny, [^1]: treść -> wyróżniona definicja
    inline(/\[\^([^\]\s]+)\](:?)/g, (a, z, m) => {
      if (m[2]) {
        if (doc.lineAt(a).from !== a) return;
        line(a, "cm-lp-fndef");
        if (!isActive(a)) out.push(Decoration.replace({ widget: new FootnoteRefWidget(String(fn.order.get(m[1]) ?? m[1]), "") }).range(a, z));
        return;
      }
      if (!isActive(a)) out.push(Decoration.replace({ widget: new FootnoteRefWidget(String(fn.order.get(m[1]) ?? "?"), fn.defs.get(m[1]) ?? "") }).range(a, z));
    });
    inline(/%%[\s\S]*?%%/g, (a, z) => out.push(Decoration.mark({ class: "cm-lp-comment" }).range(a, z)));
    inline(/\[\[[^\[\]\n]+?\]\]/g, (a, z, m) => {
      if (isActive(a)) return;
      const embed = m.index! > 0 && text[m.index! - 1] === "!";
      if (embed) {
        // ![[obraz.png|300]] -> obraz, wideo albo audio
        const e = parseEmbed(m[0].slice(2, -2));
        if (kindOf(e.ref)) {
          out.push(Decoration.replace({ widget: new MediaWidget(embedHtml(e.ref, e), a - 1) }).range(a - 1, z));
          return;
        }
        out.push(hide.range(a - 1, a));
      }
      const pipe = m[0].indexOf("|");
      out.push(hide.range(a, pipe > 0 ? a + pipe + 1 : a + 2)); // [[ lub [[cel|
      out.push(hide.range(z - 2, z));
    });
  }
  return Decoration.set(out, true);
}

export const livePreview = [
  ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(v: EditorView) { this.decorations = build(v); }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state))
        this.decorations = build(u.view);
    }
  }, { decorations: (p) => p.decorations }),
  blockPreview,
  EditorView.editorAttributes.of({ class: "cm-livepreview" }),
];
