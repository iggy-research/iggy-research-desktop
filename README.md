# Iggy Research — desktop app

[![CI](https://github.com/iggy-research/iggy-research-desktop/actions/workflows/ci.yml/badge.svg)](https://github.com/iggy-research/iggy-research-desktop/actions/workflows/ci.yml)

A focused Markdown editor with an AI editor that asks questions instead of writing for you.
Notes link into a second brain, and a finished thought goes to your blog, newsletter and RSS — without switching tools.

Part of the Iggy Research ecosystem — see [iggy-research.com](https://iggy-research.com) and the
[manifesto](https://github.com/iggy-research/iggy-research-docs/blob/main/PHILOSOPHY.md).

**Stack:** Tauri 2 (Rust, native WebView: WebKitGTK on Linux, WKWebView on macOS) + Vite + TypeScript + CodeMirror 6.
The binary is around 10 MB, not ~150 MB as with Electron.

## Download

Builds for macOS (Apple Silicon and Intel) and Linux (`.AppImage`, `.deb`, `.rpm`) are on the
[Releases](https://github.com/iggy-research/iggy-research-desktop/releases) page.
The macOS app is not notarized yet — on first launch right-click it and choose **Open**.

## Features

- **Writing:** one text column, live Markdown preview, focus mode (paragraph / sentence), typewriter mode,
  dark and light themes, autosave, version history (⟲).
- **AI editor (OpenRouter or local models via Ollama / LM Studio):** paragraph review while you write,
  note summary, link suggestions, cliché detector, devil's advocate and “you used to think otherwise”.
  The AI asks and points out — it doesn't write your text. Each task can use its own model.
- **Second brain:** a library of Markdown files, `[[links]]`, backlinks, embedded images, video, audio and PDFs.
- **Sync (☁):** across devices through iggy-research.com, offline-first, with optional end-to-end encryption;
  you choose which folders and notes sync. Or sync through Git or a cloud folder.
- **Publishing (↗):** every top-level folder becomes a blog at `iggy-research.com/@you/<folder>/<note>`,
  with a newsletter and RSS. Export to Markdown, HTML or a static site; publish to WordPress or Ghost.
- **RSS reader (≋):** save articles as notes with a quote and room for your own thoughts.
- Interface in English and Polish; spell checking in the document's language.

## Development

Requirements:
- Node 20+ and Rust (`curl https://sh.rustup.rs -sSf | sh`)
- Linux (Ubuntu/Debian): `sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev`
- macOS: `xcode-select --install`

```sh
npm install
npm run tauri dev      # run with hot reload
npm run tauri build    # Linux: .deb, .rpm, .AppImage   macOS: .app, .dmg
```

## Releases

CI (`.github/workflows/ci.yml`) typechecks, builds the frontend and checks the Rust code on every push.
To publish a version, bump `version` in `src-tauri/tauri.conf.json` and `package.json`, then push a tag:

```sh
git tag v0.2.0 && git push origin v0.2.0
```

`.github/workflows/release.yml` builds macOS (Apple Silicon and Intel) and Linux packages and creates a draft release;
publish it on GitHub. To sign and notarize the macOS app, add the `APPLE_*` secrets listed in the workflow.

## License

[AGPL-3.0](LICENSE). The client is open source so anyone can verify how end-to-end encryption works
and what the app sends to the server.
