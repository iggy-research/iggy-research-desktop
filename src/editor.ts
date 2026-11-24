import { EditorState, Compartment, RangeSetBuilder, Text, Extension, Transaction } from "@codemirror/state";
import {
  EditorView, keymap, Decoration, DecorationSet, ViewPlugin, ViewUpdate, drawSelection,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { livePreview } from "./livepreview";

export interface Paragraph { from: number; to: number; text: string; }

/** Akapit = ciąg niepustych linii otaczający pozycję. */
export function paragraphAt(doc: Text, pos: number): Paragraph | null {
  let line = doc.lineAt(pos);
  if (!line.text.trim()) return null;
  let first = line.number, last = line.number;
  while (first > 1 && doc.line(first - 1).text.trim()) first--;
  while (last < doc.lines && doc.line(last + 1).text.trim()) last++;
  const from = doc.line(first).from, to = doc.line(last).to;
  return { from, to, text: doc.sliceString(from, to) };
}

// --- Focus mode ---
// Każda linia dostaje stałą klasę, a bieżący akapit klasę "active". Dzięki temu
// CodeMirror tylko przełącza atrybut na istniejącym elemencie i CSS może płynnie
// animować kolor. W trybie zdania dodatkowo wygaszamy pozostałe zdania akapitu.
export type FocusMode = "off" | "paragraph" | "sentence";
const lineDim = Decoration.line({ class: "cm-fl" });
const lineActive = Decoration.line({ class: "cm-fl cm-fl-active" });
const sentDim = Decoration.mark({ class: "cm-sent-dim" });

function sentenceBounds(text: string, offset: number): [number, number] {
  const re = /[^.!?…]*(?:[.!?…]+["'”»)]*\s*|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && m[0].length) {
    const a = m.index, z = a + m[0].length;
    if (offset >= a && offset <= z) return [a, z];
  }
  return [0, text.length];
}

const focusPlugin = (mode: FocusMode) => ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(v: EditorView) { this.decorations = this.build(v); }
  update(u: ViewUpdate) {
    if (u.docChanged || u.selectionSet || u.viewportChanged) this.decorations = this.build(u.view);
  }
  build(v: EditorView) {
    const b = new RangeSetBuilder<Decoration>();
    const doc = v.state.doc, head = v.state.selection.main.head;
    const p = paragraphAt(doc, head);
    let sent: [number, number] | null = null;
    if (p && mode === "sentence") {
      const [a, z] = sentenceBounds(p.text, head - p.from);
      sent = [p.from + a, p.from + z];
    }
    for (const { from, to } of v.visibleRanges) {
      for (let pos = from; pos <= to;) {
        const line = doc.lineAt(pos);
        const active = p ? line.from >= p.from && line.to <= p.to : line.number === doc.lineAt(head).number;
        b.add(line.from, line.from, active ? lineActive : lineDim);
        if (active && sent) {
          if (line.from < sent[0]) b.add(line.from, Math.min(line.to, sent[0]), sentDim);
          if (line.to > sent[1]) b.add(Math.max(line.from, sent[1]), line.to, sentDim);
        }
        pos = line.to + 1;
      }
    }
    return b.finish();
  }
}, { decorations: (p) => p.decorations });

// --- Typewriter: kursor zawsze w połowie wysokości ---
const typewriterPlugin = ViewPlugin.fromClass(class {
  update(u: ViewUpdate) {
    if (!(u.docChanged || u.selectionSet)) return;
    const view = u.view;
    requestAnimationFrame(() => {
      view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: "center" }) });
    });
  }
});
const typewriterTheme = EditorView.theme({ ".cm-content": { paddingTop: "45vh", paddingBottom: "45vh" } });

const mdHighlight = HighlightStyle.define([
  // Rozmiary nagłówków ustawiają klasy linii (.cm-lp-h1…), tutaj tylko grubość
  { tag: [t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6], fontWeight: "700" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: [t.processingInstruction, t.meta], color: "var(--muted)" }, // znaczniki #, *, >
  { tag: [t.link, t.url], color: "var(--accent)" },
  { tag: t.monospace, fontFamily: "inherit", color: "var(--code)" },
  { tag: t.quote, color: "var(--muted)" },
]);

export interface EditorHandle {
  view: EditorView;
  setFocus(mode: FocusMode): void;
  setTypewriter(on: boolean): void;
  setLive(on: boolean): void;
  /** Język tekstu dla sprawdzania pisowni (atrybut lang). */
  setSpellLang(lang: string): void;
  setContent(text: string): void;
  getContent(): string;
}

export function createEditor(
  parent: HTMLElement,
  onChange: (view: EditorView, u: ViewUpdate) => void,
  extra: Extension = [],
): EditorHandle {
  const focusC = new Compartment(), twC = new Compartment(), liveC = new Compartment(), langC = new Compartment();
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: "",
      extensions: [
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        syntaxHighlighting(mdHighlight),
        focusC.of([]),
        twC.of([]),
        liveC.of(livePreview),
        EditorView.updateListener.of((u) => { if (u.docChanged || u.selectionSet) onChange(u.view, u); }),
        EditorView.contentAttributes.of({ spellcheck: "true", autocorrect: "off" }),
        langC.of([]),
        extra,
      ],
    }),
  });
  return {
    view,
    setFocus: (mode) => {
      view.dispatch({ effects: focusC.reconfigure(mode === "off" ? [] :
        [focusPlugin(mode), EditorView.editorAttributes.of({ class: "cm-focusmode" })]) });
    },
    setSpellLang: (lang) => view.dispatch({ effects: langC.reconfigure(EditorView.contentAttributes.of({ lang })) }),
    setLive: (on) => view.dispatch({ effects: liveC.reconfigure(on ? livePreview : []) }),
    setTypewriter: (on) => view.dispatch({ effects: twC.reconfigure(on ? [typewriterPlugin, typewriterTheme] : []) }),
    // Wczytanie innego pliku nie trafia do historii, więc Ctrl+Z nie cofnie do poprzedniej notatki
    setContent: (text) => view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
      selection: { anchor: 0 },
      annotations: Transaction.addToHistory.of(false),
    }),
    getContent: () => view.state.doc.toString(),
  };
}
