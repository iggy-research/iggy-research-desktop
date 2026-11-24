import { t } from "./i18n";
import { convertFileSrc } from "@tauri-apps/api/core";

/*
 * Osadzanie mediów: ![[plik.png]], ![[plik.mp4|400]], ![opis](ścieżka.jpg).
 * Pliki lokalne idą przez protokół asset Tauri (convertFileSrc), adresy http(s) bez zmian.
 */

export type MediaKind = "image" | "video" | "audio" | "pdf" | "unsupported";

const IMAGE = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "ico"];
const VIDEO = ["mp4", "webm", "mov", "m4v", "ogv"];
const AUDIO = ["mp3", "wav", "ogg", "oga", "m4a", "flac", "aac", "opus"];
// Formaty, których silniki przeglądarek nie odtwarzają. Pokazujemy dla nich kartę z informacją.
const UNSUPPORTED = ["avi", "mkv", "wmv", "flv", "mpg", "mpeg", "3gp", "heic", "tif", "tiff", "wma"];

export const MEDIA_EXT = [...IMAGE, ...VIDEO, ...AUDIO, "pdf", ...UNSUPPORTED];

export const extOf = (p: string) => (/\.([a-z0-9]+)(?:[?#].*)?$/i.exec(p)?.[1] ?? "").toLowerCase();
export function kindOf(p: string): MediaKind | null {
  const e = extOf(p);
  if (IMAGE.includes(e)) return "image";
  if (VIDEO.includes(e)) return "video";
  if (AUDIO.includes(e)) return "audio";
  if (e === "pdf") return "pdf";
  if (UNSUPPORTED.includes(e)) return "unsupported";
  return null;
}

/** Zamienia odwołanie z dokumentu na ścieżkę pliku albo URL. Ustawiane z main.ts. */
export type MediaResolver = (ref: string) => string | null;
let resolver: MediaResolver = () => null;
export const setMediaResolver = (r: MediaResolver) => { resolver = r; };

export function mediaUrl(ref: string): string | null {
  if (/^(https?:|data:|blob:)/i.test(ref)) return ref;
  const path = resolver(ref);
  return path ? convertFileSrc(path) : null;
}

/** "obraz.png|300" albo "obraz.png|300x200" -> { ref, width, height } */
export function parseEmbed(inner: string) {
  const [ref, opt = ""] = inner.split("|").map((s) => s.trim());
  const size = /^(\d+)(?:x(\d+))?$/.exec(opt);
  return { ref, width: size?.[1], height: size?.[2], alt: size ? "" : opt };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/** HTML osadzenia, wspólny dla edytora (widżet) i podglądu. */
export function embedHtml(ref: string, opts: { width?: string; height?: string; alt?: string } = {}): string {
  const kind = kindOf(ref);
  const name = esc(decodeURIComponent(ref.split(/[\\/]/).pop() ?? ref));
  const url = mediaUrl(ref);
  if (!kind) return "";
  if (!url) return `<span class="media-missing">⚠ ${t("media.missing", { name })}</span>`;
  const size = `${opts.width ? ` width="${esc(opts.width)}"` : ""}${opts.height ? ` height="${esc(opts.height)}"` : ""}`;
  switch (kind) {
    case "image": return `<img src="${esc(url)}" alt="${esc(opts.alt || name)}"${size} loading="lazy">`;
    case "video": return `<video src="${esc(url)}" controls preload="metadata"${size}></video>`;
    case "audio": return `<div class="media-audio"><span>♪ ${name}</span><audio src="${esc(url)}" controls preload="metadata"></audio></div>`;
    case "pdf": return `<iframe class="media-pdf" src="${esc(url)}"${size}></iframe>`;
    case "unsupported":
      return `<span class="media-unsupported">🎞 ${name}<small>${t("media.unsupported", { ext: extOf(ref) })}</small></span>`;
  }
}
