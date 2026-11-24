/**
 * Czytnik RSS/Atom: źródła jako materiał do notatek. Kanały pobieramy przez wtyczkę HTTP Tauri
 * (bez ograniczeń CORS), treść wpisów oczyszczamy przed pokazaniem.
 */
import { fetch as httpFetch } from "@tauri-apps/plugin-http";

export interface Feed { url: string; title: string; site?: string }
export interface Item { id: string; feed: string; title: string; link: string; date: Date | null; author: string; html: string }

const text = (el: Element | null | undefined) => el?.textContent?.trim() ?? "";
const child = (el: Element, ...names: string[]) => {
  for (const n of names) {
    const found = [...el.children].find((c) => c.localName === n || c.nodeName === n);
    if (found) return found;
  }
  return null;
};

async function get(url: string) {
  const res = await httpFetch(url, { headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8" } });
  if (!res.ok) throw new Error(`${res.status}`);
  return { body: await res.text(), type: res.headers.get("content-type") ?? "", url: res.url || url };
}

/** Parsuje RSS 2.0, RSS 1.0 (RDF) i Atom. */
export function parseFeed(xml: string, feedUrl: string): { title: string; site: string; items: Item[] } | null {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) return null;
  const root = doc.documentElement;
  const abs = (href: string) => { try { return new URL(href, feedUrl).href; } catch { return href; } };
  if (root.localName === "feed") {
    const items = [...root.children].filter((c) => c.localName === "entry").map((e): Item => {
      const linkEl = [...e.children].find((c) => c.localName === "link" && (c.getAttribute("rel") ?? "alternate") === "alternate")
        ?? child(e, "link");
      const link = abs(linkEl?.getAttribute("href") ?? "");
      return {
        id: text(child(e, "id")) || link, feed: feedUrl, title: text(child(e, "title")), link,
        date: parseDate(text(child(e, "published", "updated"))),
        author: text(child(child(e, "author") ?? e, "name")),
        html: text(child(e, "content")) || text(child(e, "summary")),
      };
    });
    const site = [...root.children].find((c) => c.localName === "link" && c.getAttribute("rel") !== "self")?.getAttribute("href") ?? "";
    return { title: text(child(root, "title")), site: abs(site), items };
  }
  const channel = root.querySelector("channel");
  if (!channel) return null;
  const nodes = [...doc.getElementsByTagName("item")];
  const items = nodes.map((e): Item => {
    const link = abs(text(child(e, "link")) || text(child(e, "guid")));
    return {
      id: text(child(e, "guid")) || link, feed: feedUrl, title: text(child(e, "title")), link,
      date: parseDate(text(child(e, "pubDate", "dc:date", "date"))),
      author: text(child(e, "dc:creator", "creator", "author")),
      html: text(child(e, "content:encoded", "encoded")) || text(child(e, "description")),
    };
  });
  return { title: text(child(channel, "title")), site: abs(text(child(channel, "link"))), items };
}

const parseDate = (s: string) => { const d = s ? new Date(s) : null; return d && !isNaN(d.getTime()) ? d : null; };

/** Adres kanału albo strony: dla strony HTML szukamy <link rel="alternate" type="application/rss+xml">. */
export async function discover(url: string): Promise<Feed> {
  const u = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const r = await get(u);
  const parsed = parseFeed(r.body, r.url);
  if (parsed) return { url: r.url, title: parsed.title || new URL(r.url).hostname, site: parsed.site };
  const html = new DOMParser().parseFromString(r.body, "text/html");
  const link = html.querySelector('link[rel="alternate"][type="application/rss+xml"], link[rel="alternate"][type="application/atom+xml"]');
  const href = link?.getAttribute("href");
  if (!href) throw new Error("not-found");
  const feedUrl = new URL(href, r.url).href;
  const f = await get(feedUrl);
  const p = parseFeed(f.body, feedUrl);
  if (!p) throw new Error("not-found");
  return { url: feedUrl, title: p.title || html.title || new URL(feedUrl).hostname, site: p.site || r.url };
}

export async function fetchFeed(feed: Feed): Promise<Item[]> {
  const r = await get(feed.url);
  return parseFeed(r.body, feed.url)?.items ?? [];
}

/** Bezpieczny HTML wpisu: bez skryptów, ramek, stylów i atrybutów zdarzeń; linki i obrazy absolutne. */
export function sanitize(html: string, base: string): string {
  const doc = fragment(html);
  doc.querySelectorAll("script,style,iframe,object,embed,form,input,button,link,meta,noscript,svg").forEach((n) => n.remove());
  doc.querySelectorAll("*").forEach((el) => {
    for (const a of [...el.attributes]) {
      const name = a.name.toLowerCase();
      if (name.startsWith("on") || name === "style" || name === "class" || name === "id" || name === "srcset") el.removeAttribute(a.name);
      else if ((name === "href" || name === "src") && /^\s*javascript:/i.test(a.value)) el.removeAttribute(a.name);
      else if (name === "href" || name === "src") { try { el.setAttribute(name, new URL(a.value, base).href); } catch { el.removeAttribute(a.name); } }
    }
    if (el.tagName === "A") el.setAttribute("data-external", "1");
  });
  return root(doc).innerHTML;
}

const fragment = (html: string) => new DOMParser().parseFromString(`<!doctype html><html><body><div id="iggy-root">${html}</div></body></html>`, "text/html");
const root = (doc: Document) => doc.getElementById("iggy-root") ?? doc.body;

/** Prosta konwersja HTML → Markdown na potrzeby notatki ze źródła (cytat do dalszej pracy). */
export function htmlToMarkdown(html: string): string {
  const doc = fragment(html);
  const walk = (n: Node): string => {
    if (n.nodeType === Node.TEXT_NODE) return (n.textContent ?? "").replace(/\s+/g, " ");
    if (n.nodeType !== Node.ELEMENT_NODE) return "";
    const el = n as Element, inner = () => [...el.childNodes].map(walk).join("");
    switch (el.tagName) {
      case "H1": case "H2": case "H3": case "H4": return `\n\n${"#".repeat(Math.min(+el.tagName[1] + 1, 6))} ${inner().trim()}\n\n`;
      case "P": case "DIV": case "SECTION": return `\n\n${inner().trim()}\n\n`;
      case "BR": return "\n";
      case "STRONG": case "B": return `**${inner()}**`;
      case "EM": case "I": return `*${inner()}*`;
      case "CODE": return `\`${inner()}\``;
      case "PRE": return `\n\n\`\`\`\n${el.textContent ?? ""}\n\`\`\`\n\n`;
      case "A": { const href = el.getAttribute("href"); const t = inner(); return href ? `[${t}](${href})` : t; }
      case "IMG": { const src = el.getAttribute("src"); return src ? `![${el.getAttribute("alt") ?? ""}](${src})` : ""; }
      case "LI": return `\n- ${inner().trim()}`;
      case "UL": case "OL": return `\n${inner()}\n`;
      case "BLOCKQUOTE": return `\n\n${inner().trim().split("\n").map((l) => `> ${l}`).join("\n")}\n\n`;
      default: return inner();
    }
  };
  return walk(root(doc)).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
