import { t } from "./i18n";
import { readDir, readTextFile, writeTextFile, exists, mkdir } from "@tauri-apps/plugin-fs";
import { kindOf } from "./media";

/** Notatka w katalogu (vault). `name` to nazwa pliku bez rozszerzenia, po niej działają linki [[ ]]. */
export interface Note { path: string; rel: string; name: string; }

const MD = /\.(md|markdown)$/i;
const SKIP = /^(\.|node_modules$)/; // ukryte katalogi (np. .git) i node_modules

export const LINK_RE = /\[\[([^\[\]\n]+?)\]\]/g;

/** "Notatka#Nagłówek|alias" -> "Notatka" */
export const linkTarget = (inner: string) => inner.split("|")[0].split("#")[0].trim();

const sep = (root: string) => (root.includes("\\") && !root.includes("/") ? "\\" : "/");
export const join = (root: string, ...parts: string[]) => [root.replace(/[\\/]+$/, ""), ...parts].join(sep(root));

export class Vault {
  root: string | null = null;
  notes: Note[] = [];
  /** Obrazy, wideo, audio i PDF-y w katalogu (name = nazwa z rozszerzeniem). */
  assets: Note[] = [];
  private contents = new Map<string, string>(); // path -> tekst (do linków zwrotnych)

  private scanning: Promise<void> | null = null;
  private rescan = false;

  /**
   * Skanuje katalog. Wywołania w trakcie trwającego skanu nie startują równoległego
   * (który dopisywałby notatki drugi raz), tylko zlecają jeden kolejny skan po nim.
   */
  scan(): Promise<void> {
    if (this.scanning) { this.rescan = true; return this.scanning; }
    this.scanning = (async () => {
      do {
        this.rescan = false;
        await this.scanOnce();
      } while (this.rescan);
    })().finally(() => { this.scanning = null; });
    return this.scanning;
  }

  private async scanOnce(): Promise<void> {
    const notes: Note[] = [], assets: Note[] = [];
    const contents = new Map<string, string>();
    const root = this.root;
    if (root) {
      const walk = async (dir: string, rel: string) => {
        let entries;
        try { entries = await readDir(dir); } catch { return; }
        for (const e of entries) {
          if (SKIP.test(e.name)) continue;
          const path = join(dir, e.name), r = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory) await walk(path, r);
          else if (MD.test(e.name)) notes.push({ path, rel: r, name: e.name.replace(MD, "") });
          else if (kindOf(e.name)) assets.push({ path, rel: r, name: e.name });
        }
      };
      await walk(root, "");
      notes.sort((a, b) => a.rel.localeCompare(b.rel, "pl"));
      await Promise.all(notes.map(async (n) => {
        try { contents.set(n.path, await readTextFile(n.path)); } catch { /* nieczytelny plik */ }
      }));
    }
    // podmieniamy całość naraz, więc lista nigdy nie jest w połowie zbudowana
    this.notes = notes;
    this.assets = assets;
    this.contents = contents;
  }

  /** Aktualizuje treść jednej notatki w indeksie bez pełnego skanowania. */
  updateContent(path: string, text: string) { if (this.contents.has(path)) this.contents.set(path, text); }

  resolve(target: string): Note | undefined {
    const t = target.toLowerCase();
    return this.notes.find((n) => n.name.toLowerCase() === t)
      ?? this.notes.find((n) => n.rel.toLowerCase().replace(MD, "") === t);
  }

  /** Załącznik po nazwie pliku ("kot.png") albo ścieżce względnej ("Załączniki/kot.png"). */
  resolveAsset(ref: string): Note | undefined {
    const t = ref.toLowerCase();
    return this.assets.find((a) => a.rel.toLowerCase() === t) ?? this.assets.find((a) => a.name.toLowerCase() === t);
  }

  /** Notatki, które zawierają [[name]]. */
  backlinks(name: string, exceptPath?: string | null): { note: Note; snippet: string }[] {
    const t = name.toLowerCase(), out: { note: Note; snippet: string }[] = [];
    for (const n of this.notes) {
      if (n.path === exceptPath) continue;
      const text = this.contents.get(n.path) ?? "";
      for (const m of text.matchAll(LINK_RE)) {
        if (linkTarget(m[1]).toLowerCase() !== t) continue;
        const a = text.lastIndexOf("\n", m.index!) + 1;
        const zRaw = text.indexOf("\n", m.index!);
        out.push({ note: n, snippet: text.slice(a, zRaw < 0 ? undefined : zRaw).trim().slice(0, 160) });
        break;
      }
    }
    return out;
  }

  /** Tworzy notatkę "<root>/<name>.md" (z podkatalogami, jeśli nazwa zawiera "/"). */
  async create(name: string): Promise<Note> {
    if (!this.root) throw new Error(t("lib.pickFirst"));
    const parts = name.split("/").map((p) => p.trim().replace(/[\\:*?"<>|]/g, "-")).filter(Boolean);
    const file = parts.pop()! + ".md";
    const dir = parts.length ? join(this.root, ...parts) : this.root;
    if (parts.length) await mkdir(dir, { recursive: true });
    const path = join(dir, file);
    if (!(await exists(path))) await writeTextFile(path, `# ${file.replace(MD, "")}\n\n`);
    await this.scan();
    return this.notes.find((n) => n.path === path)!;
  }
}
