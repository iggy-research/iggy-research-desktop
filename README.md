# Iggy Research — desktop app

[![CI](https://github.com/iggy-research/iggy-research-desktop/actions/workflows/ci.yml/badge.svg)](https://github.com/iggy-research/iggy-research-desktop/actions/workflows/ci.yml)

A focused Markdown editor with an AI editor that **asks questions instead of writing for you**.
Notes link into a second brain, and a finished thought goes to your blog, newsletter and RSS — without switching tools.

Part of the Iggy Research ecosystem — [iggy-research.com](https://iggy-research.com) ·
[manifesto](https://github.com/iggy-research/iggy-research-docs/blob/main/PHILOSOPHY.md) ·
[roadmap](https://github.com/iggy-research/iggy-research-docs/blob/main/ROADMAP.md)

**Stack:** Tauri 2 (Rust, native WebView: WKWebView on macOS, WebKitGTK on Linux) + Vite + TypeScript + CodeMirror 6.
The app is around 10 MB, not ~150 MB as with Electron.

## Contents

- [Download and install](#download-and-install)
- [Writing](#writing)
- [AI editor](#ai-editor)
- [Second brain](#second-brain)
- [Sync and accounts](#sync-and-accounts)
- [Publishing](#publishing)
- [RSS reader](#rss-reader)
- [Settings](#settings)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Privacy and data](#privacy-and-data)
- [Development](#development)
- [Project structure](#project-structure)
- [Releases](#releases)
- [License](#license)

## Download and install

Builds are on the [Releases](https://github.com/iggy-research/iggy-research-desktop/releases) page:

| System | File |
|---|---|
| macOS, Apple Silicon (M1 and newer) | `Iggy.Research_<version>_aarch64.dmg` |
| macOS, Intel | `Iggy.Research_<version>_x64.dmg` |
| Linux, any distribution | `Iggy.Research_<version>_amd64.AppImage` (make executable and run) |
| Ubuntu, Debian | `Iggy.Research_<version>_amd64.deb` |
| Fedora, openSUSE | `Iggy.Research-<version>-1.x86_64.rpm` |

**macOS:** the app is not notarized yet. On first launch right-click it in Applications and choose **Open**,
then confirm. After that it opens normally.

On first launch the app creates an `Iggy Research` folder in your Documents with linked welcome notes
(in English or Polish, following the interface language). They are ordinary files — edit or delete them.

## Writing

- **One text column**, live Markdown: markup disappears when the cursor leaves the line (**Live**, ⌘/Ctrl+Shift+M
  switches to raw Markdown). Headings, emphasis, lists, tasks, tables, code with syntax highlighting, math (LaTeX),
  footnotes, callouts (`> [!tip]`), comments (`%% … %%`), images, video, audio and PDFs.
- **Focus mode** (⌘/Ctrl+Shift+F): dims everything except the current paragraph; press again for the current sentence.
- **Typewriter mode** (⌘/Ctrl+Shift+T): the current line stays in the middle of the screen.
- **Preview** (⌘/Ctrl+P): the finished document in a serif typeface.
- **Autosave**: a file saved once saves itself 1.5 s after you stop typing and when you switch files or close the
  window (can be turned off). The dot next to the file name shows the state: red — not on disk yet, yellow — unsaved, green — saved.
- **Version history** (⟲): local snapshots in `.iggy/history` (at most one per 5 minutes, last 100) plus server versions
  when sync is on; preview and restore any of them.
- **Drag and drop or paste** images and files — they are copied to the library's `Attachments` folder.
- Light and dark themes, configurable body and heading fonts and text size, word count and reading time.

## AI editor

The AI reads with you, but **the text stays yours**: it asks, points out and reminds — it doesn't write paragraphs for you.
Models come from [OpenRouter](https://openrouter.ai) (your own key) or run **locally** with Ollama or LM Studio.
Every task can use its own model (e.g. a fast one for live review, a stronger one for summaries).

**While you write**
- **Paragraph review** — after a pause or when you leave a paragraph: correctness, clarity, consistency.
  By default it only *points out* problems and explains why; “before → after” suggestions can be turned on in settings.
  ⌘/Ctrl+Shift+L re-runs it; the prompt is fully editable.

**Buttons in the AI panel**
| Tool | What it does |
|---|---|
| Summarize | The note's thesis in one sentence, key points, questions that push the thought further |
| Links | Which of your notes connect to this one and where to link them |
| Clichés | Sentences that sound like average internet text — underlined in the editor, never rewritten |
| Counter | Devil's advocate for the selection, paragraph or note: counterargument, weakest assumption, the question you must answer |
| Before | “You used to think otherwise” — contradictions with your older notes on the same topic |

**More ▾**
| Tool | What it does |
|---|---|
| Voice note | Record your thoughts (up to 10 min); an audio model writes them down as loose bullets in your words |
| Conversation with readers | Readers' replies to the published post → threads, questions, disagreement, topics for the next note |
| Socratic dialogue | One question at a time, digging into your answers; save the conversation as a note |
| Non-obvious connections | The same mechanism in your notes from completely different fields |
| Resurface notes | Notes untouched for 60+ days that fit what you are working on now |
| Your claim? | The text's thesis in one sentence and whether the text defends it |
| Assumption test | What the text takes for granted, as questions |
| Lay reader | Places where someone outside the field gets lost — underlined, not fixed |
| Starter questions | Instead of an outline: 5 questions whose answers become the text |
| Pre-publication check | Facts and quotes to verify, inconsistencies, typos |

AI replies in the language of the document (detected offline for 9 languages). Tools that compare notes pick the
relevant ones **locally** and send only excerpts, never the whole library.

## Second brain

- **Library** (☰, ⌘/Ctrl+Shift+E): every Markdown file in the chosen folder, with search (⌘/Ctrl+Shift+O),
  favorites (⌘/Ctrl+Shift+D), new note (⌘/Ctrl+Shift+N) and rename (F2 or click the file name).
- **`[[Links]]`** between notes: autocomplete after `[[`, `[[Note|alias]]`, `[[Note#Heading]]`; ⌘/Ctrl+click or
  ⌘/Ctrl+Enter opens a link, and a link to a missing note creates it.
- **Backlinks** at the bottom of the library; `#tags` and nested `#tags/like/this`.
- **Embeds**: `![[image.png|300]]`, `![[talk.mp3]]`, `![[paper.pdf]]`.

## Sync and accounts

Open **☁** to sign in to iggy-research.com — **no passwords**: enter your email and type the 6-digit code you receive,
or continue with **Google / Apple** in the browser (the app is signed in automatically via an `iggyresearch://` link).
The account is created on first sign-in.

- **Offline-first**: files on disk are the source of truth; sync runs every 2 minutes and shortly after saving.
- **Conflicts**: if a note changed on two devices, the server version stays and yours is kept as
  `Name (conflict <date>).md` — nothing is lost.
- **What to sync**: choose folders and individual notes; excluded ones stay on this computer only.
  “Remove server copies of excluded notes” deletes them (and their history) from the server without touching files on any device.
- **Attachments** (images, PDFs, audio, video up to 25 MB) sync too.
- **End-to-end encryption** (optional): content, file names and attachments are encrypted on your device
  (AES-GCM, key derived from your passphrase with PBKDF2); the server only stores ciphertext. The passphrase can't be recovered.
- **Settings** (except your API key) sync between devices.
- **Without an Iggy account**: sync through **Git** (commit, pull --rebase, push to your own remote) or keep the
  library in iCloud Drive / Dropbox / Google Drive. A self-hosted server can be set under ☁ → *Custom server (advanced)*.

## Publishing

Open **↗** (⌘/Ctrl+Shift+U):

- **Iggy blog** — every top-level folder of your library is a blog: `Essays/2026/Writing.md` →
  `iggy-research.com/@you/essays/writing`. Subfolders only organize, they don't change the address.
  Choose a **post** (dated, in RSS and the newsletter) or a **digital garden** note (listed, with backlinks);
  visibility **public**, **link only** or **private**. Images are uploaded with the post, `[[links]]` between
  published notes keep working, and you can **email the post to subscribers** or **publish the whole folder** at once.
- **Export** — a single note as Markdown (with images) or HTML, or the whole library as a **static site** with
  working links, a table of contents and an RSS feed (ready for GitHub Pages, Netlify or your own server).
- **WordPress** (application password) and **Ghost** (Admin API key) — publish as a draft or live.
- **Substack** — copies the note as formatted text for its editor (Substack has no publishing API).

Each blog gets its own address, newsletter, RSS/Atom feed and optional custom domain — manage them at
iggy-research.com/app. Readers can reply privately under any post; use **Conversation with readers** to work with the replies.

## RSS reader

**≋** opens a reader for blogs, newsletters and journals. Add a feed or just a site address (the feed is discovered
automatically). Read articles in the app, open them in the browser, or **save one as a note** in `Sources/`
with the article quoted and a *My thoughts* section for your own notes.

## Settings

**⚙** (⌘/Ctrl+,):

- **Language** — interface (English / Polish) and the document language for spell checking and AI replies (or auto-detect).
- **Appearance** — body and heading fonts (or any installed font), text size.
- **Files** — autosave on/off.
- **Privacy** — anonymous usage stats, **off by default** (see below).
- **AI editor** — OpenRouter key; a model per task with search, prices, context window, favorites and recently used;
  review delay, paragraph review mode, editable prompt, automatic review on/off.
- **Local models** — Ollama (`http://localhost:11434`) and LM Studio (`http://localhost:1234`, enable CORS in its server settings).

## Keyboard shortcuts

⌘ on macOS, Ctrl on Linux and Windows.

| Shortcut | Action |
|---|---|
| ⌘N / ⌘O / ⌘S | New file / open / save |
| ⌘⇧S | Save as |
| ⌘P | Preview |
| ⌘, | Settings |
| ⌘⇧F | Focus mode (paragraph → sentence → off) |
| ⌘⇧T | Typewriter mode |
| ⌘⇧M | Live preview on/off |
| ⌘⇧A | AI panel on/off |
| ⌘⇧L | Review the current paragraph again |
| ⌘⇧U | Publish |
| ⌘⇧E | Library |
| ⌘⇧N | New note in the library |
| ⌘⇧O | Search notes |
| ⌘⇧D | Add / remove favorite |
| ⌘Enter / ⌘click | Open the link under the cursor |
| F1 | Welcome notes |
| F2 | Rename the file |

## Privacy and data

- Notes are plain Markdown files in a folder you choose; settings live in the app's data folder (`settings.json`).
- **AI**: only the reviewed paragraph and part of the document as context go to OpenRouter (whole-note tools send
  the note and, for comparisons, excerpts of a few notes picked locally). With a local model nothing leaves your computer.
  Your OpenRouter key never leaves the device and is not synced.
- **Sync** sends only what you choose; with E2E encryption the server sees ciphertext only.
- **Usage stats** are off by default. When you turn them on, the app sends once a day only counts of features used,
  the app version, the OS and a random install ID — never note contents, file names or account data.
- The client is open source so anyone can verify all of the above.

## Development

Requirements:
- Node 20+ and Rust (`curl https://sh.rustup.rs -sSf | sh`, or `brew install rustup` on macOS)
- Linux (Ubuntu/Debian): `sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev`
- macOS: Xcode Command Line Tools (`xcode-select --install`)

```sh
npm install
npm run tauri dev      # run with hot reload
npm run tauri build    # Linux: .deb, .rpm, .AppImage   macOS: .app, .dmg
npx tsc --noEmit       # typecheck
```

For a local server to test sync and publishing, run the whole stack from
[iggy-research-deploy](https://github.com/iggy-research/iggy-research-deploy) (`http://localhost:8080`) and set it
under ☁ → *Custom server (advanced)*.

## Project structure

| Path | Purpose |
|---|---|
| `src/main.ts` | App shell: toolbar, dialogs, library, wiring of all features |
| `src/editor.ts`, `livepreview.ts`, `blocks.ts`, `wikilinks.ts` | CodeMirror editor, live Markdown, tables and math, `[[links]]` |
| `src/vault.ts`, `media.ts`, `history.ts` | Library scanning, attachments, local version history |
| `src/ai.ts`, `models.ts`, `modelpicker.ts` | AI tasks and prompts, model catalog (OpenRouter, Ollama, LM Studio), model picker |
| `src/related.ts`, `cliches.ts`, `audio.ts` | Local note selection, editor underlines, voice recording → WAV |
| `src/sync.ts`, `crypto.ts` | Offline-first sync of notes and attachments, end-to-end encryption |
| `src/publish.ts`, `rss.ts` | Publishing, export and integrations; RSS/Atom reader |
| `src/i18n.ts`, `lang.ts` | Interface translations (EN/PL), document language detection |
| `src/welcome*.ts` | Welcome notes (EN/PL) |
| `src/telemetry.ts` | Opt-in anonymous usage stats |
| `src-tauri/` | Rust shell: plugins (fs, dialog, store, http, opener, deep link), Git sync command, bundle config |

## Releases

CI (`.github/workflows/ci.yml`) typechecks, builds the frontend and checks the Rust code on every push.
To publish a version, bump `version` in `src-tauri/tauri.conf.json` and `package.json`, then push a tag:

```sh
git tag v0.2.0 && git push origin v0.2.0
```

`.github/workflows/release.yml` builds macOS (Apple Silicon and Intel) and Linux packages and creates a draft release;
publish it on GitHub. To sign and notarize the macOS app, add the `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
`APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` and `APPLE_TEAM_ID` repository secrets — without them the app is signed ad hoc.

## License

[AGPL-3.0](LICENSE). The client is open source so anyone can verify how end-to-end encryption works
and what the app sends to the server.
