/*
 * Welcome notes in English (written on first launch when the interface language is English).
 * Same structure as the Polish ones in welcome.ts: linked with [[ ]] so the intro shows how the second brain works.
 */

import { FORMATTING_NOTE_EN } from "./welcome-formatting";

const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

export const WELCOME_FILE_EN = "Welcome.md";

export const WELCOME_NOTES_EN: Record<string, string> = {
  "Welcome.md": `![[Iggy Research.svg|112]]

# Iggy *Research*

A blank page.
A blinking cursor.
And that one thought that has been on your mind since morning.

==This place is for it.==

---

**Iggy Research** is an editor that gets out of the way. No ribbons, no panels, no notifications. Just the text you write, and a quiet editor beside you who reads it with you.

This document is an ordinary file on your disk. You can change it, rewrite it or delete it. Before you do, click on any line. You'll see plain Markdown underneath, and the formatting comes back by itself when the cursor leaves the line.

## Where to start

Each of these links leads to another note. ${mod}+click to open it:

- [[Focus]]: how to write without distractions
- [[AI editor]]: who reads your paragraphs and what it will ask you
- [[Second brain]]: how notes connect into a network of thoughts
- [[Formatting]]: every way to format text, with examples to copy

> [!tip] Try it now
> Press **${mod}+Shift+F** and write any sentence below. Everything else will dim.

## Where the name comes from

Iggy is Ignacy, my son. His name comes from the Latin *ignis*, fire. Hence the flame in the icon, and the one wish I have for this app: that ideas catch fire in it.

*Rafał Gawlik*

---

Your turn. Write your first sentence here:

`,

  "Focus.md": `# Focus

Writing and editing are two different activities. This editor helps you keep them apart. #writing

## Focus

**${mod}+Shift+F** dims everything except the paragraph you are writing. Press it again and only the current *sentence* stays lit. A third press turns the mode off.

Try it on this paragraph. Click anywhere inside, turn Focus on and move the cursor up and down with the arrow keys. The light will follow you.

## Typewriter

**${mod}+Shift+T** keeps the line you are writing in the middle of the screen. The text scrolls up like paper in a typewriter, and your eyes stay in one place.

## Quiet

- The top bar almost disappears and comes back when you hover over it.
- **☰** hides the library, **AI** hides the editor panel.
- **${mod}+P** shows the finished text in a serif font, as if printed.
- **◐** switches between light and dark.
- **Live** (${mod}+Shift+M) switches between live formatting and raw Markdown.

## Peace of mind about saving

The dot next to the file name shows the state:

| Dot | Meaning |
|:---:|:--------|
| 🔴 | the file isn't on disk yet |
| 🟡 | there are unsaved changes |
| 🟢 | everything is saved |

A file saved at least once saves itself after every change. You don't have to remember ${mod}+S.

← Back to [[Welcome]] · Next: [[AI editor]]
`,

  "AI editor.md": `# AI editor

Imagine an editor sitting next to you who reads every paragraph as soon as you put down a full stop. They don't interrupt. They wait until you pause. #ai

## How to invite them

1. Click **⚙** in the top bar.
2. Paste a key from openrouter.ai/keys.
3. Pick a model from the list — the default Claude Sonnet 5.5 works best. Search covers the whole OpenRouter catalog, and every model shows its price and context window. Pin favorites with ☆.

Prefer to work offline? Turn on **Ollama** or **LM Studio** in settings. Your text then never leaves the computer, and no OpenRouter key is needed.

From now on, after every pause in writing or when you move to a new paragraph, notes appear in the right panel: correctness, clarity and consistency. By default the editor only *points out* problems and explains why — you fix them yourself. You can switch to “before → after” suggestions in settings.

## Your editor, your rules

You can rewrite the prompt in settings completely. A few ideas:

- “Check whether the argument is logical.”
- “Simplify it so a child would understand.”
- “Point out a stronger first sentence.”
- “Translate into Polish and assess the style.”

## The whole note

Above the notes there are buttons:

- **Summarize** — the note's thesis in one sentence, key points and questions that push the thought further.
- **Links** — which of your notes connect to this one and where to link them. Click a name to open it.
- **Clichés** — sentences that sound like average internet text. They get underlined, never rewritten: you rewrite them your way or keep them on purpose.
- **Counter** — devil's advocate. Select a passage (or stay in a paragraph) and get the strongest counterargument, the weakest assumption and the question you must answer.
- **Before** — “you used to think otherwise”: compares the note with your older notes on the same topic and shows contradictions and changes of mind.

Under **More** there is a Socratic dialogue, an assumption test, “what are you actually claiming?”, a lay reader, starter questions, a pre-publication check, non-obvious connections and resurfacing old notes.

AI doesn't write for you here — it asks, points out and reminds. The text stays yours.

Each task can have its own model in settings: e.g. a fast Haiku for live review and a stronger Opus for summaries.

**${mod}+Shift+L** re-runs the review of the current paragraph, and **${mod}+Shift+A** hides the panel when you want to write alone.

> [!note] Privacy
> Only the reviewed paragraph and part of the document as context go to OpenRouter (for whole-note tools — the whole note and the names of your other notes). With a local model nothing leaves your computer. Your key stays on your computer.

← Back to [[Welcome]] · Next: [[Second brain]]
`,

  "Second brain.md": `# Second brain

A single note is a thought. Notes linked together are *knowledge*. #pkm

## Links

Put the name of any note in double brackets: [[Welcome]]. That's already a link. ${mod}+click or ${mod}+Enter opens it.

A link to a note that doesn't exist yet looks different: [[My first thought]]. Click it and the note is created. That's how the network grows: first the link, then the content.

- Typing \`[[\` shows a list of existing notes.
- [[Focus|Your own link text]] goes after a vertical bar.

## Library

**☰** (${mod}+Shift+E) opens the list of all notes in the folder. At its bottom are **backlinks** — the notes that lead to the one you're reading. Open the library now: you'll see that [[Welcome]] links to this note.

- **${mod}+Shift+N**: new note
- **${mod}+Shift+O**: search notes
- **F2** or a click on the file name: rename
- **📁** in the library: choose another notes folder

## Tags

#idea, #project/book, #to-read. Short labels that group notes beyond links.

← Back to [[Welcome]] · Next: [[Formatting]]
`,

  "Formatting.md": FORMATTING_NOTE_EN,
};
