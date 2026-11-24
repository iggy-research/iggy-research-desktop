/**
 * Publikacja notatki: blog Iggy (serwer Django), eksport (Markdown, HTML, statyczna strona z RSS)
 * i integracje (WordPress, Ghost; do Substacka kopiujemy HTML, bo nie ma API).
 */
import { marked } from "marked";
import { readFile, writeTextFile, writeFile, mkdir } from "@tauri-apps/plugin-fs";
import { fetch as httpFetch } from "@tauri-apps/plugin-http";
import { LINK_RE, linkTarget, join } from "./vault";
import { kindOf, parseEmbed } from "./media";
import { CODE_RE } from "./livepreview";
import type { Account } from "./sync";

// ---------- Wspólne ----------

const EMBED_WIKI = /!\[\[([^\[\]\n]+?)\]\]/g;
const EMBED_MD = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const isRemote = (ref: string) => /^(https?:|data:)/i.test(ref);

export interface NoteMeta { title: string; tags: string[]; body: string }

/** Tytuł z pierwszego nagłówka # (albo z nazwy pliku) i tagi #… z treści. */
export function noteMeta(md: string, fallbackTitle: string): NoteMeta {
  const h1 = /^#[ \t]+(.+)$/m.exec(md);
  const noCode = md.replace(CODE_RE, "");
  const tags = [...new Set([...noCode.matchAll(/(?:^|[\s(])#([\p{L}\p{N}_\/-]*[\p{L}_\/-][\p{L}\p{N}_\/-]*)/gmu)].map((m) => m[1]))];
  return { title: h1?.[1].trim() || fallbackTitle, tags, body: md };
}

export function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/ł/g, "l").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "wpis";
}

/** Lokalne pliki osadzone w notatce: ![[obraz.png]] i ![opis](ścieżka). */
export function embedRefs(md: string): string[] {
  const refs = new Set<string>();
  for (const m of md.matchAll(EMBED_WIKI)) { const e = parseEmbed(m[1]); if (kindOf(e.ref)) refs.add(e.ref); }
  for (const m of md.matchAll(EMBED_MD)) if (!isRemote(m[2]) && kindOf(m[2])) refs.add(m[2]);
  return [...refs];
}

/** Podmienia osadzenia na adresy (po wysłaniu albo skopiowaniu plików). */
export function rewriteEmbeds(md: string, urls: Map<string, string>): string {
  return md
    .replace(EMBED_WIKI, (all, inner: string) => {
      const e = parseEmbed(inner), url = urls.get(e.ref);
      if (!url) return all;
      const k = kindOf(e.ref);
      if (k === "video") return `<video src="${url}" controls preload="metadata"></video>`;
      if (k === "audio") return `<audio src="${url}" controls preload="metadata"></audio>`;
      if (k === "pdf") return `[${e.ref.split("/").pop()}](${url})`;
      return `![${e.alt || ""}](${url})`;
    })
    .replace(EMBED_MD, (all, alt: string, ref: string) => (urls.has(ref) ? `![${alt}](${urls.get(ref)})` : all));
}

/** Markdown → HTML do eksportu i integracji. [[linki]] przez `link` (null = zwykły tekst). */
export function toHtml(md: string, link: (target: string) => string | null): string {
  const code: string[] = [];
  const src = md.replace(CODE_RE, (m) => `IGGYCODE${code.push(m) - 1}Q`)
    .replace(/^#[ \t]+.+\n?/, "") // tytuł idzie osobno
    .replace(/%%[\s\S]*?%%/g, "")
    .replace(/==([^=\n]+)==/g, "<mark>$1</mark>")
    .replace(LINK_RE, (_, inner: string) => {
      const target = linkTarget(inner), label = inner.split("|")[1]?.trim() || inner.split("|")[0].trim();
      const url = link(target);
      return url ? `[${label}](${url})` : label;
    })
    .replace(/^> \[!(\w+)\][ \t]*(.*)$/gm, (_, type: string, title: string) => `> **${title || type[0].toUpperCase() + type.slice(1)}**`)
    .replace(/IGGYCODE(\d+)Q/g, (_, i: string) => code[+i]);
  return marked.parse(src) as string;
}

async function uploadAll(refs: string[], resolve: (ref: string) => string | null, upload: (bytes: Uint8Array, name: string) => Promise<string>) {
  const urls = new Map<string, string>();
  for (const ref of refs) {
    const path = resolve(ref);
    if (!path) continue;
    try { urls.set(ref, await upload(await readFile(path), ref.split(/[\\/]/).pop()!)); }
    catch (e) { console.warn("upload", ref, e); }
  }
  return urls;
}

const mimeOf = (name: string) => {
  const ext = name.split(".").pop()!.toLowerCase();
  return ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
    mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", pdf: "application/pdf" } as Record<string, string>)[ext] ?? "application/octet-stream";
};
const blobOf = (bytes: Uint8Array, name: string) => new Blob([bytes as BlobPart], { type: mimeOf(name) });

// ---------- Blog Iggy ----------

export interface IggyPost { id: number; slug: string; title: string; visibility: "private" | "unlisted" | "public"; kind: "post" | "garden"; url: string }
export interface IggyPublishInput {
  title: string; slug: string; kind: "post" | "garden"; visibility: IggyPost["visibility"]; tags: string[];
  md: string; source: string; resolve: (ref: string) => string | null;
}

async function iggy<T>(acc: Account, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${acc.server}/api/${path}`, {
    ...init, headers: { Authorization: `Token ${acc.token}`, ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...init.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? (Object.entries(body).map(([k, v]) => `${k}: ${v}`).join(" · ") || `${res.status}`));
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const findIggyPost = async (acc: Account, source: string) =>
  (await iggy<IggyPost[]>(acc, `posts?source=${encodeURIComponent(source)}`))[0] ?? null;

export async function publishIggy(acc: Account, input: IggyPublishInput, existing: IggyPost | null): Promise<IggyPost> {
  const urls = await uploadAll(embedRefs(input.md), input.resolve, async (bytes, name) => {
    const fd = new FormData();
    fd.append("file", blobOf(bytes, name), name);
    return (await iggy<{ url: string }>(acc, "media", { method: "POST", body: fd })).url;
  });
  const body = JSON.stringify({
    title: input.title, slug: input.slug, kind: input.kind, visibility: input.visibility, tags: input.tags,
    content_md: rewriteEmbeds(input.md, urls), source: input.source,
  });
  return existing
    ? iggy<IggyPost>(acc, `posts/${existing.id}`, { method: "PATCH", body })
    : iggy<IggyPost>(acc, "posts", { method: "POST", body });
}

export const unpublishIggy = (acc: Account, post: IggyPost) =>
  iggy<IggyPost>(acc, `posts/${post.id}`, { method: "PATCH", body: JSON.stringify({ visibility: "private" }) });

// ---------- WordPress (REST API + hasło aplikacji) ----------

export interface WpConfig { url: string; user: string; appPassword: string }

export async function publishWordPress(cfg: WpConfig, title: string, md: string, resolve: (r: string) => string | null, status: "draft" | "publish") {
  const base = cfg.url.replace(/\/+$/, "");
  const auth = `Basic ${btoa(unescape(encodeURIComponent(`${cfg.user}:${cfg.appPassword.replace(/\s+/g, "")}`)))}`;
  const urls = await uploadAll(embedRefs(md), resolve, async (bytes, name) => {
    const res = await httpFetch(`${base}/wp-json/wp/v2/media`, {
      method: "POST", body: blobOf(bytes, name),
      headers: { Authorization: auth, "Content-Type": mimeOf(name), "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}"` },
    });
    if (!res.ok) throw new Error(`WordPress media ${res.status}`);
    return (await res.json()).source_url;
  });
  const res = await httpFetch(`${base}/wp-json/wp/v2/posts`, {
    method: "POST", headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ title, status, content: toHtml(rewriteEmbeds(md, urls), () => null) }),
  });
  if (!res.ok) throw new Error(`WordPress ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).link as string;
}

// ---------- Ghost (Admin API) ----------

export interface GhostConfig { url: string; adminKey: string } // klucz „id:secret” z Integrations → Custom

const b64url = (b: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof b === "string" ? new TextEncoder().encode(b) : b instanceof Uint8Array ? b : new Uint8Array(b);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
async function ghostToken(adminKey: string) {
  const [id, secret] = adminKey.split(":");
  if (!id || !secret) throw new Error("Klucz Ghost ma postać id:secret.");
  const key = await crypto.subtle.importKey("raw", Uint8Array.from(secret.match(/../g)!.map((h) => parseInt(h, 16))),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT", kid: id }));
  const body = b64url(JSON.stringify({ iat: now, exp: now + 300, aud: "/admin/" }));
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

export async function publishGhost(cfg: GhostConfig, title: string, tags: string[], md: string, resolve: (r: string) => string | null, status: "draft" | "published") {
  const base = cfg.url.replace(/\/+$/, "");
  const auth = async () => `Ghost ${await ghostToken(cfg.adminKey)}`;
  const urls = await uploadAll(embedRefs(md), resolve, async (bytes, name) => {
    const fd = new FormData();
    fd.append("file", blobOf(bytes, name), name);
    const res = await httpFetch(`${base}/ghost/api/admin/images/upload/`, { method: "POST", body: fd, headers: { Authorization: await auth() } });
    if (!res.ok) throw new Error(`Ghost image ${res.status}`);
    return (await res.json()).images[0].url;
  });
  const res = await httpFetch(`${base}/ghost/api/admin/posts/?source=html`, {
    method: "POST", headers: { Authorization: await auth(), "Content-Type": "application/json" },
    body: JSON.stringify({ posts: [{ title, status, tags: tags.map((name) => ({ name })), html: toHtml(rewriteEmbeds(md, urls), () => null) }] }),
  });
  if (!res.ok) throw new Error(`Ghost ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).posts[0].url as string;
}

// ---------- Substack: HTML do schowka ----------

export async function copyHtml(title: string, md: string) {
  const html = `<h1>${escapeXml(title)}</h1>${toHtml(md, () => null)}`;
  await navigator.clipboard.write([new ClipboardItem({
    "text/html": new Blob([html], { type: "text/html" }),
    "text/plain": new Blob([md], { type: "text/plain" }),
  })]);
}

// ---------- Eksport ----------

const escapeXml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]!));

const PAGE_CSS = `body{max-width:680px;margin:40px auto;padding:0 20px;font:17px/1.65 Georgia,serif;color:#1a1a1a;background:#f7f7f5}
h1,h2,h3{font-weight:400;line-height:1.15}h1{font-size:2.4rem}a{color:#1a7fc0}img,video{max-width:100%;height:auto}
pre{background:#efefec;padding:12px;overflow-x:auto}blockquote{border-left:3px solid #ddd;margin:1em 0;padding:.1em 1em;color:#555}
nav{font-size:.9rem;margin-bottom:2rem}time{color:#888;font-size:.85rem}
@media(prefers-color-scheme:dark){body{background:#1b1c1e;color:#d8d8d6}pre{background:#222326}a{color:#36b0f0}}`;

const page = (title: string, body: string, home = "index.html", siteTitle = "") => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeXml(title)}</title><link rel="alternate" type="application/rss+xml" href="feed.xml"><style>${PAGE_CSS}</style></head>
<body><nav><a href="${home}">${escapeXml(siteTitle || "←")}</a></nav><h1>${escapeXml(title)}</h1>${body}</body></html>`;

export interface ExportNote { path: string; rel: string; name: string; text: string; mtime?: Date }

/** Jedna notatka jako .md z obrazkami skopiowanymi obok (do folderu `outDir`). */
export async function exportMarkdown(note: ExportNote, outDir: string, resolve: (ref: string) => string | null) {
  const urls = await copyAssets(embedRefs(note.text), resolve, outDir);
  await writeTextFile(join(outDir, `${note.name}.md`), rewriteEmbeds(note.text, urls).replace(LINK_RE, (_, inner: string) => inner.split("|")[1]?.trim() || inner.split("|")[0].trim()));
}

async function copyAssets(refs: string[], resolve: (ref: string) => string | null, outDir: string, prefix = "assets") {
  const urls = new Map<string, string>();
  if (!refs.length) return urls;
  await mkdir(join(outDir, prefix), { recursive: true }).catch(() => {});
  for (const ref of refs) {
    const p = resolve(ref);
    if (!p) continue;
    const name = ref.split(/[\\/]/).pop()!;
    try { await writeFile(join(outDir, prefix, name), await readFile(p)); urls.set(ref, `${prefix}/${encodeURIComponent(name)}`); }
    catch (e) { console.warn("kopia", ref, e); }
  }
  return urls;
}

/** Jedna notatka jako samodzielny plik HTML. */
export async function exportHtml(note: ExportNote, outDir: string, resolve: (ref: string) => string | null) {
  const urls = await copyAssets(embedRefs(note.text), resolve, outDir);
  const meta = noteMeta(note.text, note.name);
  await writeTextFile(join(outDir, `${slugify(note.name)}.html`), page(meta.title, toHtml(rewriteEmbeds(note.text, urls), () => null)));
}

/**
 * Statyczna strona z całej biblioteki: strona na notatkę, [[linki]] między nimi, spis treści i RSS.
 * `siteUrl` (opcjonalny) trafia do RSS jako adres bazowy.
 */
export async function exportSite(notes: ExportNote[], outDir: string, opts: { title: string; siteUrl: string; resolveFor: (note: ExportNote) => (ref: string) => string | null }) {
  await mkdir(outDir, { recursive: true }).catch(() => {});
  const byName = new Map(notes.map((n) => [n.name.toLowerCase(), `${slugify(n.name)}.html`]));
  const items: { title: string; file: string; date: Date; excerpt: string; html: string }[] = [];
  for (const n of notes) {
    const urls = await copyAssets(embedRefs(n.text), opts.resolveFor(n), outDir);
    const meta = noteMeta(n.text, n.name);
    const html = toHtml(rewriteEmbeds(n.text, urls), (target) => byName.get(target.toLowerCase()) ?? null);
    const file = byName.get(n.name.toLowerCase())!;
    await writeTextFile(join(outDir, file), page(meta.title, html, "index.html", opts.title));
    const excerpt = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
    items.push({ title: meta.title, file, date: n.mtime ?? new Date(), excerpt, html });
  }
  items.sort((a, b) => b.date.getTime() - a.date.getTime());
  const list = items.map((i) => `<p><a href="${i.file}">${escapeXml(i.title)}</a><br><time>${i.date.toLocaleDateString()}</time></p>`).join("\n");
  await writeTextFile(join(outDir, "index.html"), page(opts.title, list, "index.html", opts.title));
  const base = opts.siteUrl.replace(/\/+$/, "");
  const rss = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel><title>${escapeXml(opts.title)}</title><link>${escapeXml(base || ".")}/</link><description>${escapeXml(opts.title)}</description>
${items.slice(0, 50).map((i) => `<item><title>${escapeXml(i.title)}</title><link>${escapeXml(`${base}/${i.file}`)}</link><guid>${escapeXml(`${base}/${i.file}`)}</guid><pubDate>${i.date.toUTCString()}</pubDate><description>${escapeXml(i.html)}</description></item>`).join("\n")}
</channel></rss>`;
  await writeTextFile(join(outDir, "feed.xml"), rss);
  return items.length;
}
