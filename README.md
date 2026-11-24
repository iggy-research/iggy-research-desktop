# Iggy Research

Minimalistyczny edytor Markdown skupiony na pisaniu, z analizą akapitów na żywo przez OpenRouter.

Część ekosystemu Iggy Research — pozostałe repozytoria (serwer `iggy-research-api`, strona `iggy-research-web`,
wdrożenie `iggy-research-deploy`, filozofia i roadmapa `iggy-research-docs`) leżą obok w tym samym katalogu.

**Stos:** Tauri 2 (Rust, natywny WebView: WebKitGTK na Linuksie, WKWebView na macOS) + Vite + TypeScript + CodeMirror 6.
Binarka ma ok. 10 MB, a nie ok. 150 MB jak w Electronie.

## Funkcje
- Jedna kolumna tekstu (68 znaków), monospace, interfejs pojawia się dopiero po najechaniu
- **Focus mode** (Ctrl/⌘+Shift+F): wszystko poza bieżącym akapitem jest przyciemnione
- **Typewriter mode** (Ctrl/⌘+Shift+T): bieżąca linia zawsze na środku ekranu
- Podgląd Markdown (Ctrl/⌘+P), motyw jasny i ciemny, licznik słów i czasu czytania
- Pliki: Ctrl/⌘+N / O / S, Shift+S („zapisz jako”); ostatni plik otwiera się przy starcie
- **AI**: po przerwie w pisaniu (domyślnie 1,5 s) albo gdy kursor opuści akapit, ten akapit
  trafia do OpenRoutera razem z kontekstem dokumentu. Odpowiedź jest strumieniowana do panelu bocznego.
  Wyniki są cache'owane per treść akapitu. Ctrl/⌘+Shift+L wymusza ponowną analizę.
  Klucz, model i prompt ustawiasz w ⚙ (zapisywane w `settings.json` w katalogu danych aplikacji).

## Wymagania
- Node 20+, Rust (`curl https://sh.rustup.rs -sSf | sh`)
- Linux (Ubuntu/Debian):
  `sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev`
- macOS: `xcode-select --install`

## Uruchomienie
```sh
npm install
npx tauri icon icon.png   # jednorazowo: wygeneruj ikony z dowolnego PNG 1024×1024
npm run tauri dev
```

## Budowanie
```sh
npm run tauri build        # Linux: .deb, .rpm, .AppImage   macOS: .app, .dmg
```
Każdą platformę buduje się na niej samej. Żeby mieć obie z jednej maszyny, użyj GitHub Actions
(`tauri-apps/tauri-action`) z macierzą `ubuntu-22.04` i `macos-latest`. Dla uniwersalnej binarki na Maca:
`npm run tauri build -- --target universal-apple-darwin`.
