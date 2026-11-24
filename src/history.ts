/**
 * Lokalna historia wersji: przy zapisie kopia notatki trafia do `.iggy/history/<ścieżka>/<data>.md`
 * obok biblioteki (albo obok pliku spoza biblioteki). Najwyżej jedna kopia na 5 minut, ostatnie 100.
 */
import { readDir, readTextFile, writeTextFile, mkdir, exists, remove } from "@tauri-apps/plugin-fs";
import { join } from "./vault";

const EVERY_MS = 5 * 60 * 1000;
const KEEP = 100;

export interface Snapshot { path: string; date: Date }

const stampOf = (d: Date) => d.toISOString().replace(/[:.]/g, "-");
const dateOf = (name: string) => {
  const m = /^(\d{4}-\d\d-\d\d)T(\d\d)-(\d\d)-(\d\d)-(\d{3})Z\.md$/.exec(name);
  return m ? new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`) : null;
};
const dirFor = (base: string, rel: string) => join(base, ".iggy", "history", ...rel.split("/"));

export async function listSnapshots(base: string, rel: string): Promise<Snapshot[]> {
  const dir = dirFor(base, rel);
  if (!(await exists(dir))) return [];
  const out: Snapshot[] = [];
  for (const e of await readDir(dir)) {
    const date = !e.isDirectory && dateOf(e.name);
    if (date) out.push({ path: join(dir, e.name), date });
  }
  return out.sort((a, b) => b.date.getTime() - a.date.getTime());
}

/** Zapisuje kopię, jeśli ostatnia jest starsza niż 5 minut albo `force` (np. przed przywróceniem). */
export async function snapshot(base: string, rel: string, text: string, force = false) {
  if (!text.trim()) return;
  const list = await listSnapshots(base, rel);
  const last = list[0];
  if (!force && last && Date.now() - last.date.getTime() < EVERY_MS) return;
  if (last && (await readTextFile(last.path).catch(() => null)) === text) return;
  const dir = dirFor(base, rel);
  await mkdir(dir, { recursive: true }).catch(() => {});
  await writeTextFile(join(dir, `${stampOf(new Date())}.md`), text);
  for (const old of list.slice(KEEP - 1)) await remove(old.path).catch(() => {});
}

export const readSnapshot = (s: Snapshot) => readTextFile(s.path);
