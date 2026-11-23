import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/700.css";
import "@fontsource/ibm-plex-mono/400-italic.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "katex/dist/katex.min.css";
import "./style.css";
import { marked } from "marked";
import { open, save, ask } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, writeFile, copyFile, rename, exists, mkdir } from "@tauri-apps/plugin-fs";
import { load, Store } from "@tauri-apps/plugin-store";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createEditor, paragraphAt, Paragraph, FocusMode } from "./editor";
import { analyzeParagraph, AiSettings, DEFAULT_SETTINGS } from "./ai";
import { Vault, Note, LINK_RE, linkTarget, join as joinPath } from "./vault";
import { wikilinks, refreshLinks } from "./wikilinks";
import { calloutColor, footnotes, CODE_RE } from "./livepreview";
import { renderMath } from "./blocks";
import { WELCOME_NOTES, WELCOME_FILE, WELCOME_ASSETS } from "./welcome";
import { Appearance, DEFAULT_APPEARANCE, BODY_FONTS, HEADING_FONTS, applyAppearance, fillSelect } from "./appearance";
import { documentDir, homeDir } from "@tauri-apps/api/path";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { EditorView } from "@codemirror/view";
import { setMediaResolver, embedHtml, kindOf, parseEmbed, mediaUrl } from "./media";

const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T;

let store: Store;
let settings: AiSettings = { ...DEFAULT_SETTINGS };
let appearance: Appearance = { ...DEFAULT_APPEARANCE };
let filePath: string | null = null;
let draftName = "dokument.md"; // nazwa dla jeszcze niezapisanego pliku
let dirty = false;
let favorites = new Set<string>(); // ścieżki ulubionych plików
const vault = new Vault();
const ui = { library: false, live: true, focus: "off" as FocusMode, typewriter: false, preview: false, ai: true, dark: matchMedia("(prefers-color-scheme: dark)").matches };

// ---------- AI ----------
const analyzed = new Map<string, string>(); // tekst akapitu -> wynik
let timer: number | undefined;
let lastPara: Paragraph | null = null;

function scheduleAnalysis(p: Paragraph | null, immediate = false) {
  clearTimeout(timer);
  if (!p || !settings.autoAnalyze || !ui.ai) return;
  timer = window.setTimeout(() => runAnalysis(p), immediate ? 0 : settings.debounceMs);
}

async function runAnalysis(p: Paragraph) {
  const text = p.text.trim();
  if (text.length < 40 || /^(#|```|\|)/.test(text)) return; // pomijamy nagłówki, kod, tabele, krótkie
  const cur = $("#ai-current"), status = $("#ai-status");
  if (analyzed.has(text)) { cur.innerHTML = marked.parse(analyzed.get(text)!) as string; return; }
  if (!settings.apiKey) { cur.textContent = "Dodaj klucz OpenRouter w ustawieniach (⚙)."; return; }
  status.textContent = "analizuję…";
  cur.classList.remove("ai-empty");
  try {
    const result = await analyzeParagraph(settings, text, editor.getContent(), (partial) => {
      cur.innerHTML = marked.parse(partial) as string;
    });
    analyzed.set(text, result);
    pushHistory(text, result);
    status.textContent = "";
  } catch (e: any) {
    if (e?.name === "AbortError") return;
    status.textContent = "błąd";
    cur.textContent = String(e?.message ?? e);
  }
}

function pushHistory(text: string, result: string) {
  const li = document.createElement("li");
  li.innerHTML = `<blockquote>${escapeHtml(text.slice(0, 140))}${text.length > 140 ? "…" : ""}</blockquote>${marked.parse(result)}`;
  $("#ai-history").prepend(li);
}
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

// ---------- Editor ----------
const editor = createEditor($("#editor"), (view, u) => {
  const p = paragraphAt(view.state.doc, view.state.selection.main.head);
  if (u.docChanged) {
    setDirty(true);
    scheduleAutosave();
    updateStats();
    if (ui.preview) renderPreview();
    scheduleAnalysis(p);
  } else if (lastPara && (!p || p.from !== lastPara.from)) {
    // kursor opuścił akapit -> analizuj od razu ten, który właśnie skończono
    const prev = paragraphAt(view.state.doc, Math.min(lastPara.from, view.state.doc.length));
    if (prev && !analyzed.has(prev.text.trim())) scheduleAnalysis(prev, true);
  }
  lastPara = p;
}, [mediaDrop(), wikilinks({
  names: () => vault.notes.map((n) => n.name),
  exists: (t) => !!vault.resolve(t) || !!vault.resolveAsset(t),
  open: (t) => openLink(t),
})]);

function updateStats() {
  const text = editor.getContent();
  const words = (text.match(/[\p{L}\p{N}'’-]+/gu) ?? []).length;
  $("#stats").textContent = `${words} słów · ${text.length} znaków · ${Math.max(1, Math.round(words / 200))} min czytania`;
}

function renderPreview() {
  // Kod odkładamy na bok, żeby przykłady składni w nim nie zamieniły się w formatowanie
  const code: string[] = [];
  const src = editor.getContent().replace(CODE_RE, (m) => `IGGYCODE${code.push(m) - 1}Q`);
  // ![[obraz.png|300]] -> obraz/wideo/audio, [[Notatka|alias]] -> klikalny link
  const md = src.replace(/(!?)\[\[([^\[\]\n]+?)\]\]/g, (all, bang: string, inner: string) => {
    if (bang) {
      const e = parseEmbed(inner);
      if (kindOf(e.ref)) return embedHtml(e.ref, e);
    }
    return all;
  }).replace(LINK_RE, (_, inner: string) => {
    const target = linkTarget(inner), label = inner.split("|")[1]?.trim() || inner.split("|")[0].trim();
    const cls = vault.resolve(target) ? "wikilink" : "wikilink missing";
    return `<a href="#" class="${cls}" data-target="${escapeHtml(target)}">${escapeHtml(label)}</a>`;
  });
  // Przypisy: [^id] -> indeks górny z kotwicą, definicje trafiają na koniec dokumentu
  const fn = footnotes(md);
  const withNotes = md
    .replace(/^\[\^([^\]\s]+)\]:[ \t]*.*$/gm, "")
    .replace(/\[\^([^\]\s]+)\]/g, (_, id: string) => {
      const n = fn.order.get(id) ?? "?";
      return `<sup class="fnref"><a href="#fn-${n}" title="${escapeHtml(fn.defs.get(id) ?? "")}">${n}</a></sup>`;
    })
    // Wzory: najpierw bloki $$…$$, potem $…$ w linii
    .replace(/^\$\$([\s\S]+?)\$\$[ \t]*$/gm, (_, tex: string) => `\n<div class="math-block">${renderMath(tex.trim(), true)}</div>\n`)
    .replace(/(?<![\\$])\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\$)/g, (_, tex: string) => renderMath(tex, false));
  const notes = [...fn.order].map(([id, n]) =>
    `<li id="fn-${n}">${marked.parseInline(fn.defs.get(id) ?? "")}</li>`).join("");
  const extra = (withNotes + (notes ? `\n\n<section class="footnotes"><hr><ol>${notes}</ol></section>\n` : ""))
    .replace(/%%[\s\S]*?%%/g, "")                                   // komentarze
    .replace(/==([^=\n]+)==/g, "<mark>$1</mark>")                    // zaznaczenia
    .replace(/(^|[\s(])#([\p{L}\p{N}_\/-]*[\p{L}_\/-][\p{L}\p{N}_\/-]*)/gmu, '$1<span class="tag">#$2</span>')
    .replace(/IGGYCODE(\d+)Q/g, (_, i: string) => code[+i]);
  const root = $("#preview");
  root.innerHTML = marked.parse(extra) as string;
  // ![opis](ścieżka): lokalne ścieżki na adresy asset, a pliki wideo/audio na odtwarzacze
  root.querySelectorAll("img").forEach((img) => {
    const ref = img.getAttribute("src") ?? "";
    if (/^(https?:|data:|blob:|asset:)/i.test(ref)) return;
    const kind = kindOf(ref);
    if (kind && kind !== "image") { img.outerHTML = embedHtml(ref); return; }
    const url = mediaUrl(ref);
    if (url) img.src = url;
  });
  // > [!typ] Tytuł  ->  callout
  root.querySelectorAll("blockquote").forEach((bq) => {
    const p = bq.querySelector("p");
    const m = p && /^\[!(\w+)\][+-]?\s*([^\n]*)\n?/.exec(p.innerHTML);
    if (!p || !m) return;
    const type = m[1].toLowerCase();
    p.innerHTML = p.innerHTML.slice(m[0].length);
    if (!p.innerHTML.trim()) p.remove();
    bq.className = "callout";
    bq.dataset.callout = calloutColor(type);
    const title = document.createElement("div");
    title.className = "callout-title";
    title.textContent = m[2] || type[0].toUpperCase() + type.slice(1);
    bq.prepend(title);
  });
}
$("#preview").addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a.wikilink");
  if (!a) return;
  e.preventDefault();
  openLink(a.dataset.target!);
});

function setDirty(d: boolean) {
  dirty = d;
  const name = filePath ? filePath.split(/[\\/]/).pop()! : draftName;
  $("#filename").textContent = name;
  // Kropka stanu: czerwona = brak pliku na dysku, żółta = niezapisane zmiany, zielona = zapisane
  const dot = $("#save-dot");
  const state = !filePath ? "new" : dirty ? "dirty" : "saved";
  dot.className = state;
  const star = $("#fav-star");
  const fav = !!filePath && favorites.has(filePath);
  star.classList.toggle("on", fav);
  star.hidden = !filePath;
  star.title = fav ? "Usuń z ulubionych" : "Dodaj do ulubionych";
  dot.title = { new: "Plik nie istnieje na dysku (Ctrl+S, aby zapisać)", dirty: "Niezapisane zmiany", saved: "Wszystkie zmiany zapisane" }[state];
  getCurrentWindow().setTitle(`${name}${dirty ? " — edytowany" : ""} — Iggy Research`).catch(() => {});
}

// ---------- Files ----------
const mdFilter = [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }];
let saveTimer: number | undefined;
// Zapisany już plik zapisuje się sam chwilę po każdej zmianie
function scheduleAutosave() {
  clearTimeout(saveTimer);
  if (filePath) saveTimer = window.setTimeout(() => saveFile(), 800);
}
/** Przed przejściem do innego pliku: zapisz bieżący. Zwraca false, gdy użytkownik anulował. */
async function leaveCurrent(): Promise<boolean> {
  clearTimeout(saveTimer);
  if (!dirty) return true;
  if (filePath) { await saveFile(); return true; }
  if (!editor.getContent().trim()) return true;
  const keep = await ask("Bieżący tekst nie jest zapisany. Zapisać go przed otwarciem innego pliku?", {
    title: "Iggy Research", kind: "warning", okLabel: "Zapisz", cancelLabel: "Odrzuć",
  });
  if (keep) await saveFile();
  return true;
}
async function openPath(p: string, reload = false) {
  if (p === filePath && !reload) { editor.view.focus(); return; }
  await leaveCurrent();
  editor.setContent(await readTextFile(p));
  filePath = p;
  analyzed.clear();
  setDirty(false);
  store.set("lastFile", filePath);
  updateStats();
  if (ui.preview) renderPreview();
  renderLibrary();
  editor.view.focus();
}
async function openFile() {
  const p = await open({ multiple: false, filters: mdFilter, defaultPath: vault.root ?? undefined });
  if (typeof p === "string") await openPath(p);
}
/** Otwiera notatkę z linku [[target]], a gdy jej nie ma, tworzy ją w katalogu biblioteki. */
async function openLink(target: string) {
  let note: Note | undefined = vault.resolve(target);
  if (!note) {
    if (!vault.root) { await pickRoot(); if (!vault.root) return; }
    await leaveCurrent();
    note = await vault.create(target);
    editor.view.dispatch({ effects: refreshLinks.of(null) });
  }
  await openPath(note.path);
}
async function saveFile(as = false) {
  if (!filePath || as) {
    const p = await save({ filters: mdFilter, defaultPath: draftName });
    if (!p) return;
    filePath = p;
  }
  const text = editor.getContent();
  await writeTextFile(filePath, text);
  setDirty(false);
  store.set("lastFile", filePath);
  if (vault.notes.some((n) => n.path === filePath)) {
    vault.updateContent(filePath, text);
  } else if (vault.root && filePath.startsWith(vault.root)) {
    await vault.scan(); // nowy plik w bibliotece
    renderLibrary();
  }
}
async function newFile() {
  await leaveCurrent();
  filePath = null; draftName = "dokument.md"; editor.setContent(""); analyzed.clear(); setDirty(false);
  renderLibrary();
}

// ---------- Media ----------
const dirOf = (p: string) => p.slice(0, Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\")));
const isAbsolute = (p: string) => /^(\/|[a-z]:[\\/]|\\\\)/i.test(p);

// ![[kot.png]] szuka pliku w całej bibliotece, ![](obrazy/kot.png) względem bieżącej notatki
setMediaResolver((raw) => {
  let ref = raw;
  try { ref = decodeURI(raw); } catch { /* zostaw jak jest */ }
  if (isAbsolute(ref)) return ref;
  const asset = vault.resolveAsset(ref);
  if (asset) return asset.path;
  const base = filePath ? dirOf(filePath) : vault.root;
  return base ? joinPath(base, ...ref.split(/[\\/]/)) : null;
});

/** Katalog na wklejone i przeciągnięte pliki: „Załączniki” w bibliotece albo obok bieżącej notatki. */
async function attachmentsDir(): Promise<string | null> {
  const dir = vault.root ? joinPath(vault.root, "Załączniki") : filePath ? dirOf(filePath) : null;
  if (dir) await mkdir(dir, { recursive: true });
  return dir;
}
async function uniquePath(dir: string, name: string) {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : "";
  let p = joinPath(dir, name), i = 1;
  while (await exists(p)) p = joinPath(dir, `${base} ${++i}${ext}`);
  return p;
}
const baseName = (p: string) => p.split(/[\\/]/).pop()!;
function insertEmbeds(names: string[], pos?: number) {
  const view = editor.view;
  const at = pos ?? view.state.selection.main.head;
  const line = view.state.doc.lineAt(at);
  const text = names.map((n) => `![[${n}]]`).join("\n");
  // osadzenie w osobnej linii, żeby nie rozrywać zdania
  const where = line.text.trim() ? line.to : at;
  const insert = (line.text.trim() ? "\n" : "") + text + "\n";
  view.dispatch({ changes: { from: where, insert }, selection: { anchor: where + insert.length } });
  view.focus();
}
function mediaError(msg: string) {
  ui.ai = true; apply();
  $("#ai-current").textContent = msg;
}
const NO_DIR = "Zapisz najpierw notatkę albo wybierz katalog biblioteki (ikona folderu obok plusa), żeby było gdzie zapisać plik.";

// Przeciąganie plików z menedżera plików: media kopiujemy do załączników, notatki .md otwieramy
let dropPos: number | undefined;
getCurrentWebview().onDragDropEvent(async (ev) => {
  const p = ev.payload;
  if (p.type === "over" || p.type === "enter") {
    const r = window.devicePixelRatio || 1;
    dropPos = editor.view.posAtCoords({ x: p.position.x / r, y: p.position.y / r }) ?? undefined;
    return;
  }
  if (p.type !== "drop") return;
  const media = p.paths.filter((x) => kindOf(x));
  if (!media.length) {
    const md = p.paths.find((x) => /\.(md|markdown|txt)$/i.test(x));
    if (md) openPath(md);
    return;
  }
  try {
    const dir = await attachmentsDir();
    if (!dir) { mediaError(NO_DIR); return; }
    const names: string[] = [];
    for (const src of media) {
      // plik już leży w bibliotece -> nie kopiujemy drugi raz
      const inVault = !!vault.root && src.startsWith(vault.root);
      const target = inVault ? src : await uniquePath(dir, baseName(src));
      if (!inVault) await copyFile(src, target);
      names.push(baseName(target));
    }
    await refreshVault();
    insertEmbeds(names, dropPos);
  } catch (e: any) {
    mediaError(`Nie udało się dodać pliku: ${e?.message ?? e}`);
  }
}).catch(() => {});

// Wklejanie obrazka ze schowka (np. zrzutu ekranu)
function mediaDrop() {
  return EditorView.domEventHandlers({
    paste(e) {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (!files.length) return false;
      e.preventDefault();
      (async () => {
        try {
          const dir = await attachmentsDir();
          if (!dir) { mediaError(NO_DIR); return; }
          const names: string[] = [];
          for (const f of files) {
            const stamp = new Date().toISOString().slice(0, 19).replace("T", " ").replace(/:/g, "");
            const ext = f.type.split("/")[1].replace("jpeg", "jpg").replace("svg+xml", "svg");
            const target = await uniquePath(dir, `Wklejony obraz ${stamp}.${ext}`);
            await writeFile(target, new Uint8Array(await f.arrayBuffer()));
            names.push(baseName(target));
          }
          await refreshVault();
          insertEmbeds(names);
        } catch (err: any) {
          mediaError(`Nie udało się wkleić obrazka: ${err?.message ?? err}`);
        }
      })();
      return true;
    },
  });
}

// ---------- Ulubione ----------
function toggleFavorite() {
  if (!filePath) return;
  if (favorites.has(filePath)) favorites.delete(filePath);
  else favorites.add(filePath);
  store.set("favorites", [...favorites]);
  setDirty(dirty);
  renderLibrary();
}
$("#fav-star").onclick = toggleFavorite;

// ---------- Biblioteka ----------
const fileName = (p: string) => p.split(/[\\/]/).pop()!;
async function pickRoot() {
  const dir = await open({ directory: true, multiple: false, defaultPath: vault.root ?? undefined });
  if (typeof dir !== "string") return;
  vault.root = dir;
  store.set("rootDir", dir);
  await refreshVault();
}
async function refreshVault() {
  await vault.scan();
  renderLibrary();
  editor.view.dispatch({ effects: refreshLinks.of(null) });
}
async function newNote() {
  if (!vault.root) { await pickRoot(); if (!vault.root) return; }
  let base = "Nowa notatka", i = 1;
  while (vault.resolve(base)) base = `Nowa notatka ${++i}`;
  await leaveCurrent();
  const note = await vault.create(base);
  await openPath(note.path);
  startRename();
}

function renderLibrary() {
  $("#lib-root").textContent = vault.root ? fileName(vault.root) : "Brak katalogu";
  const tree = $("#lib-tree");
  tree.innerHTML = "";
  if (!vault.root) {
    tree.innerHTML = `<li class="empty">Wybierz katalog z notatkami (ikona folderu obok plusa), żeby przeglądać pliki i łączyć je przez [[ ]].</li>`;
    renderBacklinks();
    return;
  }
  const q = ($("#lib-filter") as HTMLInputElement).value.trim().toLowerCase();
  const notes = q ? vault.notes.filter((n) => n.rel.toLowerCase().includes(q)) : vault.notes;
  const item = (n: Note, label = n.name) => {
    const li = document.createElement("li");
    li.textContent = label;
    li.title = n.rel;
    li.classList.toggle("active", n.path === filePath);
    li.classList.toggle("fav", favorites.has(n.path));
    li.onclick = () => openPath(n.path);
    return li;
  };
  const header = (text: string, cls = "dir") => {
    const d = document.createElement("li");
    d.className = cls;
    d.textContent = text;
    return d;
  };

  // Ulubione: osobna sekcja na samej górze
  const favNotes = notes.filter((n) => favorites.has(n.path));
  if (favNotes.length) {
    tree.append(header("★ Ulubione", "dir dir-fav"));
    for (const n of favNotes) tree.append(item(n));
  }

  // Katalogi w kolejności alfabetycznej, a w każdym ulubione przed resztą
  const groups = new Map<string, Note[]>();
  for (const n of notes) {
    const dir = n.rel.includes("/") ? n.rel.slice(0, n.rel.lastIndexOf("/")) : "";
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir)!.push(n);
  }
  const dirs = [...groups.keys()].sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b, "pl")));
  for (const dir of dirs) {
    if (dir || favNotes.length || dirs.length > 1) tree.append(header(dir || fileName(vault.root)));
    const list = groups.get(dir)!;
    list.sort((a, b) => Number(favorites.has(b.path)) - Number(favorites.has(a.path)) || welcomeRank(a) - welcomeRank(b) || a.name.localeCompare(b.name, "pl"));
    for (const n of list) tree.append(item(n));
  }
  if (!notes.length) tree.innerHTML = `<li class="empty">${q ? "Nic nie pasuje." : "Brak plików .md w tym katalogu."}</li>`;
  renderBacklinks();
}

function renderBacklinks() {
  const ul = $("#backlinks");
  ul.innerHTML = "";
  const name = filePath ? fileName(filePath).replace(/\.(md|markdown|txt)$/i, "") : null;
  const links = name ? vault.backlinks(name, filePath) : [];
  if (!links.length) { ul.innerHTML = `<li class="empty">Żadna notatka nie linkuje tutaj.</li>`; return; }
  for (const { note, snippet } of links) {
    const li = document.createElement("li");
    li.innerHTML = `${escapeHtml(note.name)}<small>${escapeHtml(snippet)}</small>`;
    li.onclick = () => openPath(note.path);
    ul.append(li);
  }
}

$("#lib-pick").onclick = pickRoot;
$("#lib-new").onclick = newNote;
$("#lib-filter").addEventListener("input", renderLibrary);
$("#lib-filter").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { (document.querySelector("#lib-tree li:not(.dir):not(.empty)") as HTMLElement | null)?.click(); }
  if (e.key === "Escape") { (e.target as HTMLInputElement).value = ""; renderLibrary(); editor.view.focus(); }
});
// Pliki mogły się zmienić poza aplikacją, więc odświeżamy po powrocie do okna
window.addEventListener("focus", () => { if (vault.root) refreshVault(); });

// ---------- Rename ----------
// Kliknięcie nazwy pliku na pasku zamienia ją w pole edycji. Enter zatwierdza, Esc anuluje.
// Zapisany plik jest od razu przemianowywany na dysku, niezapisany dostaje nazwę do okna zapisu.
const nameEl = $("#filename");
nameEl.title = "Kliknij, aby zmienić nazwę (F2)";
function startRename() {
  const current = filePath ? filePath.split(/[\\/]/).pop()! : draftName;
  const input = document.createElement("input");
  input.id = "filename-input";
  input.value = current;
  nameEl.replaceWith(input);
  input.focus();
  input.setSelectionRange(0, current.replace(/\.(md|markdown|txt)$/i, "").length);
  let done = false;
  const finish = async (commit: boolean) => {
    if (done) return; done = true;
    let next = input.value.trim().replace(/[\\/]/g, "-");
    input.replaceWith(nameEl);
    if (commit && next && next !== current) {
      if (!/\.(md|markdown|txt)$/i.test(next)) next += ".md";
      try {
        if (filePath) {
          const target = filePath.slice(0, filePath.length - current.length) + next;
          if (await exists(target)) throw new Error(`Plik „${next}” już istnieje.`);
          await rename(filePath, target);
          if (favorites.delete(filePath)) { favorites.add(target); store.set("favorites", [...favorites]); }
          filePath = target;
          store.set("lastFile", filePath);
          await refreshVault();
        } else {
          draftName = next;
        }
      } catch (e: any) {
        $("#ai-status").textContent = "";
        $("#ai-current").textContent = `Nie udało się zmienić nazwy: ${e?.message ?? e}`;
      }
    }
    setDirty(dirty);
    editor.view.focus();
  };
  input.onkeydown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); finish(true); }
    if (e.key === "Escape") { e.preventDefault(); finish(false); }
    e.stopPropagation();
  };
  input.onblur = () => finish(true);
}
nameEl.onclick = startRename;
window.addEventListener("keydown", (e) => { if (e.key === "F1") { e.preventDefault(); openWelcome(); } });
window.addEventListener("keydown", (e) => { if (e.key === "F2") { e.preventDefault(); startRename(); } });

// ---------- UI toggles ----------
function apply() {
  editor.setFocus(ui.focus);
  editor.setTypewriter(ui.typewriter);
  editor.setLive(ui.live);
  document.documentElement.dataset.theme = ui.dark ? "dark" : "light";
  $("#preview").hidden = !ui.preview;
  $("#editor").hidden = ui.preview;
  $("#ai-panel").hidden = !ui.ai;
  $("#library").hidden = !ui.library;
  if (ui.preview) renderPreview();
  document.querySelectorAll<HTMLButtonElement>("[data-cmd]").forEach((b) => {
    const k = b.dataset.cmd as keyof typeof ui;
    if (k in ui) b.classList.toggle("on", k === "focus" ? ui.focus !== "off" : !!ui[k]);
  });
  $('[data-cmd="focus"]').textContent = { off: "Focus", paragraph: "Focus: akapit", sentence: "Focus: zdanie" }[ui.focus];
  store?.set("ui", ui);
}
const toggle = (k: "typewriter" | "preview" | "ai" | "library" | "live") => { ui[k] = !ui[k]; apply(); if (!ui.preview) editor.view.focus(); };

const cmds: Record<string, () => void> = {
  focus: () => {
    const order: FocusMode[] = ["off", "paragraph", "sentence"];
    ui.focus = order[(order.indexOf(ui.focus) + 1) % order.length];
    apply(); editor.view.focus();
  },
  typewriter: () => toggle("typewriter"),
  preview: () => toggle("preview"),
  ai: () => toggle("ai"),
  library: () => toggle("library"),
  live: () => toggle("live"),
  theme: () => { ui.dark = !ui.dark; apply(); },
  settings: openSettings,
  help: () => { openWelcome(); },
};
document.querySelectorAll<HTMLButtonElement>("[data-cmd]").forEach((b) => (b.onclick = () => cmds[b.dataset.cmd!]()));

window.addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;
  const k = e.key.toLowerCase();
  const map: Record<string, () => void> = e.shiftKey
    ? { d: toggleFavorite, m: cmds.live, e: cmds.library, n: newNote, o: () => { ui.library = true; apply(); ($("#lib-filter") as HTMLInputElement).focus(); }, f: cmds.focus, t: cmds.typewriter, a: cmds.ai, s: () => saveFile(true), l: () => { const p = paragraphAt(editor.view.state.doc, editor.view.state.selection.main.head); if (p) { analyzed.delete(p.text.trim()); runAnalysis(p); } } }
    : { s: () => saveFile(), o: openFile, n: newFile, p: cmds.preview, ",": openSettings };
  if (map[k]) { e.preventDefault(); map[k](); }
});

// ---------- Notatki powitalne ----------
// Przy pierwszym uruchomieniu w Dokumentach powstaje katalog „Iggy Research” z notatkami
// połączonymi przez [[ ]]. Intro jest zwykłym plikiem, który można edytować albo usunąć.
// W katalogu powitalnym notatki idą w kolejności czytania (Witaj → … → Formatowanie), nie alfabetycznie
const WELCOME_ORDER = Object.keys(WELCOME_NOTES);
let welcomeDir: string | null = null;
function welcomeRank(n: Note): number {
  if (!welcomeDir || n.path !== joinPath(welcomeDir, n.rel) || n.rel.includes("/")) return WELCOME_ORDER.length;
  const i = WELCOME_ORDER.indexOf(n.rel);
  return i < 0 ? WELCOME_ORDER.length : i;
}

async function openWelcome() {
  let dir = (await store.get<string>("welcomeDir")) ?? null;
  if (!dir) {
    let base: string;
    try { base = await documentDir(); } catch { base = await homeDir(); }
    dir = joinPath(base, "Iggy Research");
    store.set("welcomeDir", dir);
  }
  welcomeDir = dir;
  await mkdir(dir, { recursive: true });
  // brakujące notatki odtwarzamy, istniejących (być może zmienionych) nie ruszamy
  for (const [rel, text] of Object.entries(WELCOME_ASSETS)) {
    const p = joinPath(dir, ...rel.split("/"));
    await mkdir(dirOf(p), { recursive: true });
    if (await exists(p)) continue;
    if (typeof text === "string") await writeTextFile(p, text);
    else await writeFile(p, new Uint8Array(await (await fetch(text.url)).arrayBuffer()));
  }
  for (const [name, text] of Object.entries(WELCOME_NOTES)) {
    const p = joinPath(dir, name);
    if (!(await exists(p))) await writeTextFile(p, text);
  }
  if (!vault.root) { vault.root = dir; store.set("rootDir", dir); }
  await refreshVault();
  await openPath(joinPath(dir, WELCOME_FILE), true);
}

// ---------- Settings ----------
function openSettings() {
  const dlg = $("#settings-dialog") as HTMLDialogElement;
  const f = dlg.querySelector("form")!;
  // Wygląd: zmiany widać od razu, „Anuluj” przywraca poprzednie
  const before = { ...appearance };
  const bodySel = f.bodyFont as HTMLSelectElement, headSel = f.headingFont as HTMLSelectElement;
  const bodyCustom = f.bodyCustom as HTMLInputElement, headCustom = f.headingCustom as HTMLInputElement;
  const size = f.fontSize as HTMLInputElement, sizeOut = f.fontSizeOut as HTMLOutputElement;
  fillSelect(bodySel, BODY_FONTS);
  fillSelect(headSel, HEADING_FONTS);
  bodySel.value = appearance.bodyFont; headSel.value = appearance.headingFont;
  bodyCustom.value = appearance.bodyCustom; headCustom.value = appearance.headingCustom;
  size.value = String(appearance.fontSize);
  const readAppearance = (): Appearance => ({
    bodyFont: bodySel.value, bodyCustom: bodyCustom.value,
    headingFont: headSel.value, headingCustom: headCustom.value,
    fontSize: Number(size.value),
  });
  const preview = () => {
    bodyCustom.hidden = bodySel.value !== "custom";
    headCustom.hidden = headSel.value !== "custom";
    sizeOut.value = size.value;
    applyAppearance(readAppearance());
  };
  [bodySel, headSel, bodyCustom, headCustom, size].forEach((el) => (el.oninput = preview));
  preview();

  (f.apiKey as HTMLInputElement).value = settings.apiKey;
  (f.model as HTMLInputElement).value = settings.model;
  (f.debounceMs as HTMLInputElement).value = String(settings.debounceMs);
  (f.prompt as HTMLTextAreaElement).value = settings.prompt;
  (f.autoAnalyze as HTMLInputElement).checked = settings.autoAnalyze;
  dlg.onclose = async () => {
    if (dlg.returnValue !== "save") { applyAppearance(before); return; }
    appearance = readAppearance();
    applyAppearance(appearance);
    store.set("appearance", appearance);
    settings = {
      apiKey: f.apiKey.value.trim(),
      model: f.model.value.trim() || DEFAULT_SETTINGS.model,
      debounceMs: Number(f.debounceMs.value) || DEFAULT_SETTINGS.debounceMs,
      prompt: f.prompt.value.trim() || DEFAULT_SETTINGS.prompt,
      autoAnalyze: f.autoAnalyze.checked,
    };
    analyzed.clear();
    await store.set("settings", settings);
    await store.save();
  };
  dlg.showModal();
}

// ---------- Init ----------
(async () => {
  store = await load("settings.json", { autoSave: true, defaults: {} });
  settings = { ...DEFAULT_SETTINGS, ...((await store.get<AiSettings>("settings")) ?? {}) };
  welcomeDir = (await store.get<string>("welcomeDir")) ?? null;
  appearance = { ...DEFAULT_APPEARANCE, ...((await store.get<Appearance>("appearance")) ?? {}) };
  applyAppearance(appearance);
  Object.assign(ui, (await store.get("ui")) ?? {});
  if (typeof ui.focus !== "string") ui.focus = ui.focus ? "paragraph" : "off"; // stary format ustawień
  favorites = new Set((await store.get<string[]>("favorites")) ?? []);
  vault.root = (await store.get<string>("rootDir")) ?? null;
  await vault.scan();
  const last = await store.get<string>("lastFile");
  if (last) {
    try { editor.setContent(await readTextFile(last)); filePath = last; } catch { /* plik zniknął */ }
  }
  setDirty(false);
  apply();
  renderLibrary();
  editor.view.dispatch({ effects: refreshLinks.of(null) });
  updateStats();
  editor.view.focus();
  if (!settings.apiKey) $("#ai-current").textContent = "Dodaj klucz OpenRouter w ustawieniach (⚙), aby włączyć analizę.";
  // Pierwsze uruchomienie: otwórz notatki powitalne
  if (!(await store.get<boolean>("welcomeNotes"))) {
    store.set("welcomeNotes", true);
    await openWelcome();
  }
})();

window.addEventListener("beforeunload", (e) => { if (dirty) e.preventDefault(); });
