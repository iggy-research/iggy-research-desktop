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
import { analyzeParagraph, summarizeNote, suggestLinks, AiSettings, DEFAULT_SETTINGS, migrateSettings, missingConfig, modelFor, setOnModelUsed, Task, TASK_LIST, taskLabel, defaultPrompt, isDefaultPrompt } from "./ai";
import { t, setUiLang, applyI18n, uiLang, UI_LANGS } from "./i18n";
import { detectLanguage, DOC_LANGS } from "./lang";
import { Sync } from "./sync";
import { listSnapshots, readSnapshot, snapshot } from "./history";
import { invoke } from "@tauri-apps/api/core";
import { stat } from "@tauri-apps/plugin-fs";
import * as pub from "./publish";
import { Vault, Note, LINK_RE, linkTarget, join as joinPath } from "./vault";
import { wikilinks, refreshLinks } from "./wikilinks";
import { calloutColor, footnotes, CODE_RE } from "./livepreview";
import { renderMath } from "./blocks";
import { WELCOME_NOTES, WELCOME_FILE, WELCOME_ASSETS } from "./welcome";
import { Appearance, DEFAULT_APPEARANCE, BODY_FONTS, HEADING_FONTS, applyAppearance, fillSelect } from "./appearance";
import { documentDir, homeDir } from "@tauri-apps/api/path";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { EditorView } from "@codemirror/view";
import { loadCatalog, modelInfo, formatPrice, CatalogCache } from "./models";
import { createModelPicker } from "./modelpicker";
import { setMediaResolver, embedHtml, kindOf, parseEmbed, mediaUrl } from "./media";

const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T;

let store: Store;
let settings: AiSettings = { ...DEFAULT_SETTINGS };
let appearance: Appearance = { ...DEFAULT_APPEARANCE };
let autosave = true;
let filePath: string | null = null;
let draftName = "dokument.md"; // nazwa dla jeszcze niezapisanego pliku
let dirty = false;
let favorites = new Set<string>(); // ścieżki ulubionych plików
let langPrefs = { ui: "auto", doc: "auto" }; // język interfejsu i dokumentu ("auto" = system / wykrywanie)
let detectedLang: string | null = null;
const docLang = () => (langPrefs.doc === "auto" ? detectedLang : langPrefs.doc);
let modelFavorites = new Set<string>(); // klucze ulubionych modeli
let modelRecent: string[] = []; // ostatnio używane modele, najnowszy pierwszy
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
  if (analyzed.has(text)) { $("#ai-title").textContent = taskLabel("analyze"); cur.innerHTML = renderAi(analyzed.get(text)!); return; }
  const missing = missingConfig(settings, "analyze");
  if (missing) { cur.textContent = missing; return; }
  $("#ai-title").textContent = taskLabel("analyze");
  status.textContent = `${t("ai.analyzing")} · ${modelInfo(modelFor(settings, "analyze")).name}`;
  cur.classList.remove("ai-empty");
  try {
    const result = await analyzeParagraph(settings, docLang(), text, editor.getContent(), (partial) => {
      cur.innerHTML = renderAi(partial);
    });
    analyzed.set(text, result);
    pushHistory(text, result);
    status.textContent = "";
  } catch (e: any) {
    if (e?.name === "AbortError") return;
    status.textContent = t("ai.error");
    cur.textContent = String(e?.message ?? e);
  }
}

/** Podsumowanie albo sugestie linków dla całej notatki — na żądanie, nie w trakcie pisania. */
async function runNoteTask(task: Exclude<Task, "analyze">) {
  ui.ai = true; apply();
  const cur = $("#ai-current"), status = $("#ai-status");
  const doc = editor.getContent().trim();
  $("#ai-title").textContent = taskLabel(task);
  cur.classList.remove("ai-empty");
  if (doc.length < 40) { cur.textContent = t("ai.tooShort"); return; }
  const missing = missingConfig(settings, task);
  if (missing) { cur.textContent = missing; return; }
  if (task === "links" && !vault.notes.length) { cur.textContent = t("ai.needLibrary"); return; }
  status.textContent = `${t(task === "summary" ? "ai.summarizing" : "ai.linking")} · ${modelInfo(modelFor(settings, task)).name}`;
  cur.textContent = "";
  const onToken = (partial: string) => { cur.innerHTML = renderAi(partial); };
  try {
    const result = task === "summary"
      ? await summarizeNote(settings, docLang(), doc, onToken)
      : await suggestLinks(settings, docLang(), doc, currentNoteName(), vault.notes.map((n) => n.name), onToken);
    pushHistory(`${taskLabel(task)}: ${currentNoteName()}`, result);
    status.textContent = "";
  } catch (e: any) {
    if (e?.name === "AbortError") return;
    status.textContent = t("ai.error");
    cur.textContent = String(e?.message ?? e);
  }
}
const currentNoteName = () => (filePath ?? draftName).split(/[\\/]/).pop()!.replace(/\.(md|markdown)$/i, "");

/** Markdown z odpowiedzi AI; [[Notatka]] staje się klikalnym linkiem. */
function renderAi(md: string): string {
  return (marked.parse(md) as string).replace(/\[\[([^\[\]<>\n]+?)\]\]/g, (_, inner) =>
    `<a class="ai-link" data-link="${inner.replace(/"/g, "&quot;")}">${inner.split("|").pop()}</a>`);
}
$("#ai-summary").onclick = () => runNoteTask("summary");
$("#ai-links").onclick = () => runNoteTask("links");
$("#ai-panel").addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest<HTMLElement>("a.ai-link");
  if (a) { e.preventDefault(); openLink(linkTarget(a.dataset.link!)); }
});

function pushHistory(text: string, result: string) {
  const li = document.createElement("li");
  li.innerHTML = `<blockquote>${escapeHtml(text.slice(0, 140))}${text.length > 140 ? "…" : ""}</blockquote>${renderAi(result)}`;
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
  $("#stats").textContent = t("stats", { words, chars: text.length, min: Math.max(1, Math.round(words / 200)) });
  scheduleLangDetect(text);
}
// Język dokumentu: wykrywany chwilę po zmianie; ustawia też język sprawdzania pisowni w edytorze
let langTimer: number | undefined;
function scheduleLangDetect(text: string) {
  clearTimeout(langTimer);
  langTimer = window.setTimeout(() => {
    detectedLang = detectLanguage(text);
    editor.setSpellLang(docLang() ?? uiLang());
  }, 600);
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
  star.title = t(fav ? "fav.remove" : "fav.add");
  dot.title = t(`dot.${state}`);
  getCurrentWindow().setTitle(`${name}${dirty ? t("file.edited") : ""} — Iggy Research`).catch(() => {});
}

// ---------- Files ----------
const mdFilter = [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }];
let saveTimer: number | undefined;
// Autozapis (włączany w ustawieniach): plik, który już jest na dysku, zapisuje się sam chwilę po zmianie.
// Nowa notatka nadal wymaga pierwszego Ctrl+S, a pliku usuniętego z dysku nie odtwarzamy.
function scheduleAutosave() {
  clearTimeout(saveTimer);
  if (!autosave || !filePath) return;
  const p = filePath;
  saveTimer = window.setTimeout(async () => {
    if (p === filePath && dirty && (await exists(p))) await saveFile();
  }, AUTOSAVE_IDLE_MS);
}
const AUTOSAVE_IDLE_MS = 1500; // zapis po chwili bezczynności, nie po każdym znaku
/** Przed przejściem do innego pliku: zapisz bieżący. Zwraca false, gdy użytkownik anulował. */
async function leaveCurrent(): Promise<boolean> {
  clearTimeout(saveTimer);
  if (!dirty) return true;
  if (filePath && autosave && (await exists(filePath))) { await saveFile(); return true; }
  if (!filePath && !editor.getContent().trim()) return true;
  const keep = await ask(t("ask.unsavedOpen"), {
    title: "Iggy Research", kind: "warning", okLabel: t("ask.save"), cancelLabel: t("ask.discard"),
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
  const h = historyTarget(filePath);
  snapshot(h.base, h.rel, text).catch((e) => console.warn("historia:", e));
  sync.afterSave();
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
  const dir = vault.root ? joinPath(vault.root, t("lib.attachments")) : filePath ? dirOf(filePath) : null;
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
const NO_DIR = () => t("media.noDir");

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
    if (!dir) { mediaError(NO_DIR()); return; }
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
    mediaError(t("media.addFail", { err: e?.message ?? e }));
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
          if (!dir) { mediaError(NO_DIR()); return; }
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
          mediaError(t("media.pasteFail", { err: err?.message ?? err }));
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
  let base = t("lib.newNote"), i = 1;
  while (vault.resolve(base)) base = `${t("lib.newNote")} ${++i}`;
  await leaveCurrent();
  const note = await vault.create(base);
  await openPath(note.path);
  startRename();
}

function renderLibrary() {
  $("#lib-root").textContent = vault.root ? fileName(vault.root) : t("lib.noRoot");
  const tree = $("#lib-tree");
  tree.innerHTML = "";
  if (!vault.root) {
    tree.innerHTML = `<li class="empty">${t("lib.pickHint")}</li>`;
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
  const dirs = [...groups.keys()].sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b, uiLang())));
  for (const dir of dirs) {
    if (dir || favNotes.length || dirs.length > 1) tree.append(header(dir || fileName(vault.root)));
    const list = groups.get(dir)!;
    list.sort((a, b) => Number(favorites.has(b.path)) - Number(favorites.has(a.path)) || welcomeRank(a) - welcomeRank(b) || a.name.localeCompare(b.name, uiLang()));
    for (const n of list) tree.append(item(n));
  }
  if (!notes.length) tree.innerHTML = `<li class="empty">${t(q ? "lib.noMatch" : "lib.noFiles")}</li>`;
  renderBacklinks();
}

function renderBacklinks() {
  const ul = $("#backlinks");
  ul.innerHTML = "";
  const name = filePath ? fileName(filePath).replace(/\.(md|markdown|txt)$/i, "") : null;
  const links = name ? vault.backlinks(name, filePath) : [];
  if (!links.length) { ul.innerHTML = `<li class="empty">${t("lib.noBacklinks")}</li>`; return; }
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
nameEl.title = t("file.renameHint");
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
          if (await exists(target)) throw new Error(t("rename.exists", { name: next }));
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
        $("#ai-current").textContent = t("rename.fail", { err: e?.message ?? e });
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
  $('[data-cmd="focus"]').textContent = t(`focus.${ui.focus}`);
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
  history: () => { openHistory(); },
  publish: () => { openPublish(); },
  sync: () => { openSync(); },
};
document.querySelectorAll<HTMLButtonElement>("[data-cmd]").forEach((b) => (b.onclick = () => cmds[b.dataset.cmd!]()));

window.addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;
  const k = e.key.toLowerCase();
  const map: Record<string, () => void> = e.shiftKey
    ? { u: () => openPublish(), d: toggleFavorite, m: cmds.live, e: cmds.library, n: newNote, o: () => { ui.library = true; apply(); ($("#lib-filter") as HTMLInputElement).focus(); }, f: cmds.focus, t: cmds.typewriter, a: cmds.ai, s: () => saveFile(true), l: () => { const p = paragraphAt(editor.view.state.doc, editor.view.state.selection.main.head); if (p) { analyzed.delete(p.text.trim()); runAnalysis(p); } } }
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

// ---------- Modele ----------
async function refreshCatalog(localUrls = settings.localUrls, local = settings.local, force = false) {
  const fresh = await loadCatalog((await store.get<CatalogCache>("modelCatalog")) ?? null, localUrls, local, force);
  if (fresh) await store.set("modelCatalog", fresh);
}
setOnModelUsed((key) => {
  modelRecent = [key, ...modelRecent.filter((k) => k !== key)].slice(0, 8);
  store.set("modelRecent", modelRecent);
});
const picker = createModelPicker($("#model-picker"), {
  favorites: modelFavorites,
  recent: () => modelRecent,
  saveFavorites: () => store.set("modelFavorites", [...modelFavorites]),
  refresh: () => {
    const f = ($("#settings-dialog") as HTMLDialogElement).querySelector("form")!;
    return refreshCatalog(
      { ollama: f.ollamaUrl.value.trim(), lmstudio: f.lmstudioUrl.value.trim() },
      { ollama: f.localOllama.checked, lmstudio: f.localLmstudio.checked }, true);
  },
});

// ---------- Synchronizacja ----------
const sync = new Sync({
  store: () => store,
  root: () => vault.root,
  notes: () => vault.notes,
  device: navigator.platform || "desktop",
  status: (msg, error) => { const el = $("#sync-status"); el.textContent = `☁ ${msg}`; el.classList.toggle("error", !!error); },
  changed: async (paths) => {
    await refreshVault();
    // otwarty plik zmienił się na innym urządzeniu: wczytaj go, o ile nie ma tu niezapisanych zmian
    if (filePath && paths.includes(filePath) && !dirty) {
      try { editor.setContent(await readTextFile(filePath)); setDirty(false); updateStats(); } catch { /* usunięty */ }
    }
  },
});
/** Ustawienia, które jadą między urządzeniami (klucz API zostaje lokalnie). */
const syncedSettings = () => ({
  ai: { models: settings.models, prompt: settings.prompt, debounceMs: settings.debounceMs, autoAnalyze: settings.autoAnalyze },
  appearance, language: langPrefs, autosave, modelFavorites: [...modelFavorites],
});
async function applySyncedSettings(r: Record<string, any>) {
  if (!r || !r.ai) return;
  settings = migrateSettings({ ...settings, ...r.ai, apiKey: settings.apiKey, local: settings.local, localUrls: settings.localUrls });
  if (r.appearance) { appearance = { ...DEFAULT_APPEARANCE, ...r.appearance }; applyAppearance(appearance); store.set("appearance", appearance); }
  if (r.language) { langPrefs = { ...langPrefs, ...r.language }; store.set("language", langPrefs); applyLanguage(); }
  if (typeof r.autosave === "boolean") { autosave = r.autosave; store.set("autosave", autosave); }
  for (const k of r.modelFavorites ?? []) modelFavorites.add(k);
  store.set("modelFavorites", [...modelFavorites]);
  await store.set("settings", settings);
}

function openSync() {
  const dlg = $("#sync-dialog") as HTMLDialogElement;
  const f = dlg.querySelector("form")!;
  const msg = $("#sync-msg"), gitMsg = $("#git-msg");
  const show = async () => {
    const acc = sync.account;
    $("#sync-out").hidden = !!acc; $("#sync-in").hidden = !acc;
    msg.textContent = "";
    if (!acc) return;
    $("#sync-who").textContent = t("sync.who", { user: acc.username, server: acc.server });
    const unlockBtn = $("#sync-unlock"), offBtn = $("#sync-e2e-off"), state = $("#sync-e2e-state");
    try {
      const st = await sync.serverState();
      state.textContent = t(!st.e2e ? "sync.e2eOffState" : sync.e2eUnlocked ? "sync.e2eOnState" : "sync.e2eLocked");
      unlockBtn.textContent = t(st.e2e ? "sync.unlock" : "sync.enable");
      unlockBtn.hidden = !!st.e2e && sync.e2eUnlocked;
      (f.passphrase as HTMLInputElement).hidden = unlockBtn.hidden;
      offBtn.hidden = !st.e2e;
    } catch (e: any) { msg.textContent = String(e?.message ?? e); }
  };
  const run = async (fn: () => Promise<unknown>) => {
    dlg.querySelectorAll("button").forEach((b) => (b.disabled = true));
    try { await fn(); } catch (e: any) { msg.textContent = String(e?.message ?? e); }
    finally { dlg.querySelectorAll("button").forEach((b) => (b.disabled = false)); }
  };
  (f.server as HTMLInputElement).value = sync.account?.server ?? ((f.server as HTMLInputElement).value || "");
  (f.gitRemote as HTMLInputElement).value = gitRemote;
  const login = (register: boolean) => run(async () => {
    const server = f.server.value.trim(), email = f.email.value.trim(), password = f.password.value;
    if (register && $("#sync-username-row").hidden) { $("#sync-username-row").hidden = false; f.username.focus(); return; }
    if (!server || !email || !password) { msg.textContent = t("sync.fillFields"); return; }
    if (register && !f.username.value.trim()) { msg.textContent = t("sync.needUsername"); return; }
    await sync.login(server, email, password, register, f.username.value.trim());
    f.password.value = "";
    const remote = await sync.pullSettings().catch(() => null);
    if (remote && Object.keys(remote).length) await applySyncedSettings(remote);
    else await sync.pushSettings(syncedSettings());
    sync.startAuto();
    await show();
    await sync.sync().catch(() => {});
  });
  $("#sync-login").onclick = () => login(false);
  $("#sync-register").onclick = () => login(true);
  $("#sync-now").onclick = () => run(() => sync.sync());
  $("#sync-logout").onclick = () => run(async () => { await sync.logout(); $("#sync-status").textContent = ""; await show(); });
  $("#sync-unlock").onclick = () => run(async () => {
    const pass = (f.passphrase as HTMLInputElement).value;
    if (pass.length < 8) { msg.textContent = t("sync.passphrase") + ": min. 8"; return; }
    const st = await sync.serverState();
    if (!st.e2e && !(await ask(t("sync.e2eOnConfirm"), { title: "Iggy Research", kind: "warning" }))) return;
    await sync.unlock(pass);
    (f.passphrase as HTMLInputElement).value = "";
    await show();
    await sync.sync();
  });
  $("#sync-e2e-off").onclick = () => run(async () => {
    if (!(await ask(t("sync.e2eOffConfirm"), { title: "Iggy Research", kind: "warning" }))) return;
    await sync.disableE2E();
    await show();
    await sync.sync();
  });
  $("#git-sync").onclick = () => run(async () => {
    if (!vault.root) { gitMsg.textContent = t("sync.noRoot"); return; }
    gitRemote = (f.gitRemote as HTMLInputElement).value.trim();
    store.set("gitRemote", gitRemote);
    if (dirty && filePath) await saveFile();
    gitMsg.textContent = t("sync.gitRunning");
    try {
      gitMsg.textContent = await invoke<string>("git_sync", {
        root: vault.root, remote: gitRemote || null, message: `Iggy: ${new Date().toLocaleString()}`,
      });
      await refreshVault();
    } catch (e: any) { gitMsg.textContent = String(e); }
  });
  show();
  dlg.showModal();
}
let gitRemote = "";

// ---------- Publikacja ----------
/** Rozwiązywanie osadzeń względem dowolnej notatki (jak podgląd, ale nie tylko dla otwartego pliku). */
const resolveFor = (notePath: string) => (raw: string): string | null => {
  let ref = raw;
  try { ref = decodeURI(raw); } catch { /* */ }
  if (isAbsolute(ref)) return ref;
  const asset = vault.resolveAsset(ref);
  if (asset) return asset.path;
  return joinPath(dirOf(notePath), ...ref.split(/[\\/]/));
};
let publishCfg = { wp: { url: "", user: "", appPassword: "" }, ghost: { url: "", adminKey: "" }, site: { title: "", url: "" } };

async function openPublish() {
  const dlg = $("#publish-dialog") as HTMLDialogElement;
  const f = dlg.querySelector("form")!;
  const msg = $("#pub-msg");
  msg.textContent = "";
  const tabs = dlg.querySelectorAll<HTMLButtonElement>("[data-pub]");
  const showTab = (name: string) => {
    tabs.forEach((b) => b.classList.toggle("active", b.dataset.pub === name));
    dlg.querySelectorAll<HTMLElement>("[data-pub-pane]").forEach((p) => (p.hidden = p.dataset.pubPane !== name));
  };
  tabs.forEach((b) => (b.onclick = () => showTab(b.dataset.pub!)));
  showTab(sync.account ? "iggy" : "export");
  dlg.showModal();
  if (dirty && filePath) await saveFile();
  if (!filePath) { msg.textContent = t("pub.needSaved"); return; }
  const path = filePath, text = editor.getContent();
  const target = historyTarget(path);
  const name = fileName(path).replace(/\.(md|markdown|txt)$/i, "");
  const meta = pub.noteMeta(text, name);
  $("#pub-note").textContent = target.rel;
  const resolve = resolveFor(path);
  const run = async (fn: () => Promise<string | void>) => {
    dlg.querySelectorAll<HTMLButtonElement>("button").forEach((b) => (b.disabled = true));
    msg.textContent = t("pub.working");
    try { msg.textContent = (await fn()) ?? ""; } catch (e: any) { msg.textContent = String(e?.message ?? e); }
    finally { dlg.querySelectorAll<HTMLButtonElement>("button").forEach((b) => (b.disabled = false)); }
  };
  const linkMsg = (key: "pub.published" | "pub.sent", url: string) => t(key, { url });

  // Blog Iggy
  const acc = sync.account;
  $("#pub-iggy-login").hidden = !!acc;
  $("#pub-iggy-form").hidden = !acc;
  let existing: pub.IggyPost | null = null;
  const btn = $("#pub-iggy"), off = $("#pub-iggy-off");
  $("#pub-tags").textContent = meta.tags.length ? t("pub.tags", { tags: meta.tags.map((x) => "#" + x).join(" ") }) : "";
  const fill = () => {
    (f.pubTitle as HTMLInputElement).value = existing?.title ?? meta.title;
    (f.pubSlug as HTMLInputElement).value = existing?.slug ?? pub.slugify(meta.title);
    (f.pubKind as HTMLSelectElement).value = existing?.kind ?? "post";
    (f.pubVisibility as HTMLSelectElement).value = existing && existing.visibility !== "private" ? existing.visibility : "public";
    btn.textContent = t(existing ? "pub.update" : "pub.publish");
    off.hidden = !existing || existing.visibility === "private";
  };
  fill();
  if (acc) {
    existing = await pub.findIggyPost(acc, target.rel).catch(() => null);
    fill();
    if (existing && existing.visibility !== "private") msg.textContent = linkMsg("pub.published", existing.url);
    btn.onclick = () => run(async () => {
      const title = f.pubTitle.value.trim(), slug = pub.slugify(f.pubSlug.value || title);
      const kind = f.pubKind.value as "post" | "garden";
      existing = await pub.publishIggy(acc, {
        // notatka w ogrodzie ma tytuł = nazwa pliku, żeby [[linki]] innych notatek do niej trafiały
        title: kind === "garden" && !f.pubTitle.value.trim() ? name : title || name, slug, kind,
        visibility: f.pubVisibility.value, tags: meta.tags, md: editor.getContent(), source: target.rel, resolve,
      }, existing);
      fill();
      return existing.visibility === "private" ? t("pub.unpublished") : linkMsg("pub.published", existing.url);
    });
    off.onclick = () => run(async () => {
      if (!existing) return;
      existing = await pub.unpublishIggy(acc, existing);
      fill();
      return t("pub.unpublished");
    });
  }

  // Eksport
  const note = { path, rel: target.rel, name, text };
  const pickDir = () => open({ directory: true, multiple: false, defaultPath: vault.root ?? undefined }) as Promise<string | null>;
  $("#exp-md").onclick = () => run(async () => {
    const dir = await pickDir(); if (!dir) return "";
    await pub.exportMarkdown(note, dir, resolve); return t("pub.exported", { dir });
  });
  $("#exp-html").onclick = () => run(async () => {
    const dir = await pickDir(); if (!dir) return "";
    await pub.exportHtml(note, dir, resolve); return t("pub.exported", { dir });
  });
  (f.siteTitle as HTMLInputElement).value = publishCfg.site.title || (vault.root ? fileName(vault.root) : "");
  (f.siteUrl as HTMLInputElement).value = publishCfg.site.url;
  $("#exp-site").onclick = () => run(async () => {
    if (!vault.root) return t("sync.noRoot");
    const dir = await pickDir(); if (!dir) return "";
    publishCfg.site = { title: f.siteTitle.value.trim(), url: f.siteUrl.value.trim() };
    store.set("publishCfg", publishCfg);
    const notes: pub.ExportNote[] = [];
    for (const n of vault.notes) {
      try { notes.push({ ...n, text: await readTextFile(n.path), mtime: (await stat(n.path)).mtime ?? undefined }); } catch { /* */ }
    }
    const count = await pub.exportSite(notes, dir, { title: publishCfg.site.title || "Iggy", siteUrl: publishCfg.site.url, resolveFor: (n) => resolveFor(n.path) });
    return t("pub.exportedSite", { n: count, dir });
  });

  // WordPress i Ghost
  (f.wpUrl as HTMLInputElement).value = publishCfg.wp.url; (f.wpUser as HTMLInputElement).value = publishCfg.wp.user;
  (f.wpPass as HTMLInputElement).value = publishCfg.wp.appPassword;
  (f.ghostUrl as HTMLInputElement).value = publishCfg.ghost.url; (f.ghostKey as HTMLInputElement).value = publishCfg.ghost.adminKey;
  $("#pub-wp").onclick = () => run(async () => {
    publishCfg.wp = { url: f.wpUrl.value.trim(), user: f.wpUser.value.trim(), appPassword: f.wpPass.value };
    if (!publishCfg.wp.url || !publishCfg.wp.user || !publishCfg.wp.appPassword) return t("pub.fill");
    store.set("publishCfg", publishCfg);
    return linkMsg("pub.sent", await pub.publishWordPress(publishCfg.wp, meta.title, text, resolve, f.wpStatus.value));
  });
  $("#pub-ghost").onclick = () => run(async () => {
    publishCfg.ghost = { url: f.ghostUrl.value.trim(), adminKey: f.ghostKey.value.trim() };
    if (!publishCfg.ghost.url || !publishCfg.ghost.adminKey) return t("pub.fill");
    store.set("publishCfg", publishCfg);
    return linkMsg("pub.sent", await pub.publishGhost(publishCfg.ghost, meta.title, meta.tags, text, resolve, f.ghostStatus.value));
  });
  $("#pub-copy").onclick = () => run(async () => { await pub.copyHtml(meta.title, text); return t("pub.copied"); });
}

// ---------- Historia wersji ----------
/** Gdzie trzymać historię pliku: w bibliotece, jeśli do niej należy, inaczej obok pliku. */
function historyTarget(path: string) {
  const rel = vault.root && path.startsWith(vault.root) ? path.slice(vault.root.length).replace(/^[\\/]+/, "").replace(/\\/g, "/") : null;
  return rel ? { base: vault.root!, rel, inVault: true } : { base: dirOf(path), rel: fileName(path), inVault: false };
}

async function openHistory() {
  const dlg = $("#history-dialog") as HTMLDialogElement;
  const list = $("#hist-list"), preview = $("#hist-preview"), restore = $("#hist-restore") as HTMLButtonElement;
  list.innerHTML = ""; preview.textContent = t("hist.pick"); restore.disabled = true;
  dlg.showModal();
  if (!filePath) { preview.textContent = t("hist.unsaved"); $("#hist-file").textContent = ""; return; }
  const target = historyTarget(filePath);
  $("#hist-file").textContent = target.rel;
  type Item = { label: string; sub: string; date: Date; load: () => Promise<string> };
  const items: Item[] = [];
  for (const snap of await listSnapshots(target.base, target.rel).catch(() => [])) {
    items.push({ label: snap.date.toLocaleString(), sub: t("hist.local"), date: snap.date, load: () => readSnapshot(snap) });
  }
  if (sync.account && target.inVault) {
    try {
      for (const v of await sync.versions(target.rel)) {
        if (v.current) continue;
        items.push({
          label: new Date(v.created_at).toLocaleString(),
          sub: t("hist.server", { v: v.version, device: v.device ? ` · ${v.device}` : "" }) + (v.deleted ? ` ${t("hist.deleted")}` : ""),
          date: new Date(v.created_at), load: async () => v.content,
        });
      }
    } catch { /* offline albo notatki nie ma jeszcze na serwerze */ }
  }
  items.sort((a, b) => b.date.getTime() - a.date.getTime());
  if (!items.length) { preview.textContent = t("hist.empty"); return; }
  let chosen: string | null = null;
  for (const it of items) {
    const li = document.createElement("li");
    li.innerHTML = `${escapeHtml(it.label)}<small>${escapeHtml(it.sub)}</small>`;
    li.onclick = async () => {
      list.querySelectorAll("li").forEach((x) => x.classList.toggle("selected", x === li));
      chosen = await it.load();
      preview.textContent = chosen;
      restore.disabled = false;
    };
    list.append(li);
  }
  restore.onclick = async () => {
    if (chosen === null || !filePath) return;
    await snapshot(target.base, target.rel, editor.getContent(), true); // bieżąca treść też trafia do historii
    editor.setContent(chosen);
    setDirty(true);
    await saveFile();
    updateStats();
    dlg.close();
  };
}

// ---------- Settings ----------
function openSettings() {
  const dlg = $("#settings-dialog") as HTMLDialogElement;
  const f = dlg.querySelector("form")!;
  // Wygląd: zmiany widać od razu, „Anuluj” przywraca poprzednie
  const before = { ...appearance };
  const bodySel = f.bodyFont as HTMLSelectElement, headSel = f.headingFont as HTMLSelectElement;
  const bodyCustom = f.bodyCustom as HTMLInputElement, headCustom = f.headingCustom as HTMLInputElement;
  const size = f.fontSize as HTMLInputElement;
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
    $("#font-size-label").textContent = t("set.fontSize", { size: size.value });
    applyAppearance(readAppearance());
  };
  [bodySel, headSel, bodyCustom, headCustom, size].forEach((el) => (el.oninput = preview));
  preview();

  (f.apiKey as HTMLInputElement).value = settings.apiKey;
  // Modele: wersja robocza, zapisywana dopiero po „Zapisz”
  const draftModels = { ...settings.models };
  const rows = $("#task-models");
  const renderRows = () => {
    picker.close();
    rows.after($("#model-picker")); // picker bywa wewnątrz listy wierszy — wyjmij go, zanim ją wyczyścimy
    rows.innerHTML = "";
    for (const task of TASK_LIST) {
      const label = taskLabel(task);
      const key = draftModels[task];
      const m = modelInfo(key || draftModels.analyze);
      const row = document.createElement("div");
      row.className = "task-row";
      row.innerHTML = `<span>${label}</span><button type="button"></button>`;
      const btn = row.querySelector("button")!;
      btn.innerHTML = `${escapeHtml(key ? m.name : t("task.inheritNamed", { name: m.name }))} <small>· ${escapeHtml(m.vendor)} · ${escapeHtml(formatPrice(m))}</small>`;
      btn.title = m.key;
      btn.onclick = () => picker.open(row, key, task === "analyze" ? null : t("task.inherit"), (k) => {
        draftModels[task] = k || (task === "analyze" ? draftModels.analyze : "");
        renderRows();
      });
      rows.append(row);
    }
  };
  // Modele lokalne: zmiana przełącznika albo adresu od razu odświeża listę
  const localOllama = f.localOllama as HTMLInputElement, localLm = f.localLmstudio as HTMLInputElement;
  const ollamaUrl = f.ollamaUrl as HTMLInputElement, lmUrl = f.lmstudioUrl as HTMLInputElement;
  localOllama.checked = settings.local.ollama; localLm.checked = settings.local.lmstudio;
  ollamaUrl.value = settings.localUrls.ollama; lmUrl.value = settings.localUrls.lmstudio;
  const readLocal = () => ({
    local: { ollama: localOllama.checked, lmstudio: localLm.checked },
    localUrls: { ollama: ollamaUrl.value.trim(), lmstudio: lmUrl.value.trim() },
  });
  let localTimer: number | undefined;
  const reloadLocal = () => {
    clearTimeout(localTimer);
    localTimer = window.setTimeout(async () => {
      const l = readLocal();
      await refreshCatalog(l.localUrls, l.local, false);
      picker.render(); renderRows();
    }, 400);
  };
  [localOllama, localLm, ollamaUrl, lmUrl].forEach((el) => (el.oninput = reloadLocal));
  renderRows();
  (f.debounceMs as HTMLInputElement).value = String(settings.debounceMs);
  // Pusty prompt = domyślny w języku dokumentu; pokazujemy go, żeby było co edytować
  (f.prompt as HTMLTextAreaElement).value = settings.prompt || defaultPrompt("analyze", docLang());
  // Język
  const uiSel = f.uiLang as HTMLSelectElement, docSel = f.docLang as HTMLSelectElement;
  uiSel.innerHTML = `<option value="auto">${t("set.uiLangAuto")}</option>` +
    Object.entries(UI_LANGS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
  docSel.innerHTML = `<option value="auto">${t("set.docLangAuto")}</option>` +
    Object.entries(DOC_LANGS).map(([k, v]) => `<option value="${k}">${v.native}</option>`).join("");
  uiSel.value = langPrefs.ui; docSel.value = langPrefs.doc;
  $("#doc-lang-detected").textContent = detectedLang ? `(${t("set.docLangDetected", { lang: DOC_LANGS[detectedLang].native })})` : "";
  (f.autoAnalyze as HTMLInputElement).checked = settings.autoAnalyze;
  (f.autosave as HTMLInputElement).checked = autosave;
  dlg.onclose = async () => {
    picker.close();
    if (dlg.returnValue !== "save") {
      applyAppearance(before);
      refreshCatalog(settings.localUrls, settings.local, false); // cofnij podgląd modeli lokalnych
      return;
    }
    appearance = readAppearance();
    applyAppearance(appearance);
    store.set("appearance", appearance);
    settings = {
      apiKey: f.apiKey.value.trim(),
      models: { ...draftModels, analyze: draftModels.analyze || DEFAULT_SETTINGS.models.analyze },
      ...readLocal(),
      debounceMs: Number(f.debounceMs.value) || DEFAULT_SETTINGS.debounceMs,
      prompt: isDefaultPrompt(f.prompt.value) ? "" : f.prompt.value.trim(),
      autoAnalyze: f.autoAnalyze.checked,
    };
    autosave = (f.autosave as HTMLInputElement).checked;
    store.set("autosave", autosave);
    if (autosave && dirty) scheduleAutosave(); else if (!autosave) clearTimeout(saveTimer);
    analyzed.clear();
    const uiChanged = uiSel.value !== langPrefs.ui;
    langPrefs = { ui: uiSel.value, doc: docSel.value };
    store.set("language", langPrefs);
    editor.setSpellLang(docLang() ?? uiLang());
    if (uiChanged) applyLanguage();
    await store.set("settings", settings);
    await store.save();
    sync.pushSettings(syncedSettings());
  };
  dlg.showModal();
}

// ---------- Język ----------
/** Ustawia język interfejsu i odświeża wszystko, co ma tekst. */
function applyLanguage() {
  setUiLang(langPrefs.ui);
  applyI18n();
  nameEl.title = t("file.renameHint");
  apply();
  setDirty(dirty);
  renderLibrary();
  updateStats();
  if ($("#ai-current").classList.contains("ai-empty")) $("#ai-current").textContent = t("ai.empty");
  picker.rebuild();
}

// ---------- Init ----------
(async () => {
  store = await load("settings.json", { autoSave: true, defaults: {} });
  await sync.init();
  gitRemote = (await store.get<string>("gitRemote")) ?? "";
  publishCfg = { ...publishCfg, ...((await store.get<typeof publishCfg>("publishCfg")) ?? {}) };
  settings = migrateSettings(await store.get("settings"));
  langPrefs = { ...langPrefs, ...((await store.get<typeof langPrefs>("language")) ?? {}) };
  applyLanguage();
  for (const k of (await store.get<string[]>("modelFavorites")) ?? []) modelFavorites.add(k);
  modelRecent = (await store.get<string[]>("modelRecent")) ?? [];
  refreshCatalog(); // w tle: lista modeli z OpenRoutera (cache 24 h) i modele lokalne
  welcomeDir = (await store.get<string>("welcomeDir")) ?? null;
  autosave = (await store.get<boolean>("autosave")) ?? true;
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
  if (sync.account) { sync.startAuto(); sync.sync().catch(() => {}); }
  const missing = missingConfig(settings, "analyze");
  if (missing) $("#ai-current").textContent = missing;
  // Pierwsze uruchomienie: otwórz notatki powitalne
  if (!(await store.get<boolean>("welcomeNotes"))) {
    store.set("welcomeNotes", true);
    await openWelcome();
  }
})();

// Zamknięcie okna: autozapis zapisuje bez pytania, w pozostałych przypadkach pytamy o niezapisane zmiany
getCurrentWindow().onCloseRequested(async (e) => {
  clearTimeout(saveTimer);
  if (!dirty) return;
  e.preventDefault();
  try {
    if (filePath && autosave && (await exists(filePath))) await saveFile();
    else if (filePath || editor.getContent().trim()) {
      const keep = await ask(t("ask.unsavedClose"), {
        title: "Iggy Research", kind: "warning", okLabel: t("ask.save"), cancelLabel: t("ask.closeNoSave"),
      });
      if (keep) { await saveFile(); if (dirty) return; } // anulowane okno „Zapisz jako” = zostajemy
    }
  } catch (err) { console.error(err); }
  await getCurrentWindow().destroy();
});
