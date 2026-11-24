/**
 * Synchronizacja biblioteki z serwerem Iggy (Django, katalog server/). Offline-first: pliki na dysku są
 * źródłem prawdy, serwer tylko pośredniczy między urządzeniami.
 *
 * Cykl: pobierz zmiany od ostatniego `seq` → zapisz je lokalnie → wyślij lokalne zmiany (hash ≠ ostatnio
 * zsynchronizowany). Konflikt (plik zmieniony tu i na innym urządzeniu): wersja z serwera trafia do pliku,
 * a lokalna do kopii „<nazwa> (konflikt <data>).md”, która wysyła się jak nowa notatka. Nic nie ginie.
 */
import { readTextFile, writeTextFile, remove, exists, mkdir } from "@tauri-apps/plugin-fs";
import type { Store } from "@tauri-apps/plugin-store";
import { E2EKeys, decrypt, deriveKeys, encrypt, importKeys, makeCheck, newSalt, noteId, sha256, verifyCheck } from "./crypto";
import { join } from "./vault";
import { t } from "./i18n";

export interface Account { server: string; token: string; username: string; email: string }
interface FileState { key: string; version: number; hash: string }
interface SyncState { seq: number; root: string; e2e: boolean; files: Record<string, FileState> } // files: rel -> stan

export interface SyncDeps {
  store: () => Store;
  root: () => string | null;
  notes: () => { path: string; rel: string }[];
  /** plik zmieniony przez synchronizację (do odświeżenia edytora i biblioteki) */
  changed: (paths: string[]) => Promise<void>;
  /** Czy notatka (ścieżka względna) ma być synchronizowana — wybór użytkownika: foldery i pojedyncze notatki. */
  included: (rel: string) => boolean;
  status: (msg: string, error?: boolean) => void;
  device: string;
}

export class Sync {
  account: Account | null = null;
  private keys: E2EKeys | null = null;
  private running: Promise<void> | null = null;
  private timer: number | undefined;

  constructor(private d: SyncDeps) {}

  async init() {
    this.account = (await this.d.store().get<Account>("syncAccount")) ?? null;
    const raw = await this.d.store().get<string>("syncKey");
    if (raw) this.keys = await importKeys(raw);
  }

  // ---------- HTTP ----------
  private async api<T = any>(path: string, init: RequestInit = {}, acc = this.account): Promise<T> {
    if (!acc) throw new Error(t("sync.notLogged"));
    const res = await fetch(`${acc.server.replace(/\/+$/, "")}/api/${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(acc.token ? { Authorization: `Token ${acc.token}` } : {}), ...init.headers },
    });
    if (res.status === 401 && acc.token) { await this.logout(false); throw new Error(t("sync.sessionExpired")); }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = body.detail ?? Object.values(body).flat().join(" ") ?? res.statusText;
      throw new Error(`${res.status}: ${msg || res.statusText}`);
    }
    return res.status === 204 ? (undefined as T) : res.json();
  }

  /** Logowanie bez haseł, krok 1: serwer wysyła 6-cyfrowy kod na e-mail. */
  async requestCode(server: string, email: string, lang: string) {
    const acc: Account = { server: server.trim().replace(/\/+$/, ""), token: "", username: "", email };
    await this.api("auth/code", { method: "POST", body: JSON.stringify({ email, lang }) }, acc);
  }

  /** Krok 2: kod → token. Konto powstaje przy pierwszym logowaniu. */
  async login(server: string, email: string, code: string) {
    const acc: Account = { server: server.trim().replace(/\/+$/, ""), token: "", username: "", email };
    const data = await this.api("auth/verify", { method: "POST", body: JSON.stringify({ email, code }) }, acc);
    this.account = { ...acc, token: data.token, username: data.user.username, email: data.user.email };
    await this.d.store().set("syncAccount", this.account);
    await this.d.store().set("syncState", null); // nowe konto = pełna synchronizacja od zera
  }

  /** Logowanie przez przeglądarkę (Google / Apple): jednorazowy kod z linku + verifier znany tylko aplikacji. */
  async redeemHandoff(server: string, code: string, verifier: string) {
    const acc: Account = { server: server.trim().replace(/\/+$/, ""), token: "", username: "", email: "" };
    const data = await this.api("auth/handoff/redeem", { method: "POST", body: JSON.stringify({ code, verifier }) }, acc);
    this.account = { ...acc, token: data.token, username: data.user.username, email: data.user.email };
    await this.d.store().set("syncAccount", this.account);
    await this.d.store().set("syncState", null);
  }

  /** Jakie metody logowania oferuje serwer (przyciski Google / Apple tylko, gdy skonfigurowane). */
  async providers(server: string): Promise<{ google: string | null; apple: string | null }> {
    const res = await fetch(`${server.replace(/\/+$/, "")}/api/auth/providers`);
    return res.ok ? res.json() : { google: null, apple: null };
  }

  async logout(callServer = true) {
    if (callServer) await this.api("auth/logout", { method: "POST" }).catch(() => {});
    this.account = null; this.keys = null;
    clearInterval(this.timer);
    await this.d.store().set("syncAccount", null);
    await this.d.store().set("syncKey", null);
    await this.d.store().set("syncState", null);
  }

  /** Ustawienia aplikacji między urządzeniami (bez klucza API). */
  pushSettings = (data: object) => this.account ? this.api("sync/settings", { method: "PUT", body: JSON.stringify(data) }).catch(() => {}) : Promise.resolve();
  pullSettings = () => this.api<Record<string, any>>("sync/settings");
  /** Wersje notatki zapisane na serwerze (najnowsza pierwsza). */
  versions = async (rel: string) => {
    const key = this.keys ? await noteId(this.keys, rel) : rel;
    const { versions } = await this.api<{ versions: any[] }>(`sync/versions?key=${encodeURIComponent(key)}`);
    return Promise.all(versions.map(async (v) => ({
      ...v, content: v.encrypted && this.keys && v.content ? await decrypt(this.keys, v.content) : v.content,
    })));
  };

  // ---------- Szyfrowanie ----------
  async serverState() { return this.api<{ seq: number; e2e: { salt: string; check: string } | null; notes: number }>("sync/state"); }

  /** Włącza E2E na koncie (kasuje jawne kopie na serwerze) albo odblokowuje je na tym urządzeniu. */
  async unlock(passphrase: string) {
    const st = await this.serverState();
    if (st.e2e) {
      const k = await deriveKeys(passphrase, st.e2e.salt);
      if (!(await verifyCheck(k, st.e2e.check))) throw new Error(t("sync.badPassphrase"));
      this.keys = k;
    } else {
      const salt = newSalt();
      const k = await deriveKeys(passphrase, salt);
      await this.api("sync/e2e", { method: "PUT", body: JSON.stringify({ salt, check: await makeCheck(k) }) });
      this.keys = k;
    }
    await this.d.store().set("syncKey", this.keys.raw);
    await this.d.store().set("syncState", null); // wyślij wszystko od nowa, zaszyfrowane
  }

  async disableE2E() {
    await this.api("sync/e2e", { method: "DELETE" });
    this.keys = null;
    await this.d.store().set("syncKey", null);
    await this.d.store().set("syncState", null);
  }
  get e2eUnlocked() { return !!this.keys; }

  // ---------- Synchronizacja ----------
  /** Po poszerzeniu zakresu: pobierz wszystko od początku (wersje, które już mamy, zostaną pominięte). */
  async rewind() {
    const state = await this.d.store().get<SyncState>("syncState");
    if (state) { state.seq = 0; await this.d.store().set("syncState", state); }
  }

  /** Synchronizacja co kilka minut i chwilę po zapisie (jeśli zalogowano). */
  startAuto(everyMs = 120_000) {
    clearInterval(this.timer);
    if (this.account) this.timer = window.setInterval(() => this.sync().catch(() => {}), everyMs);
  }
  private soon: number | undefined;
  afterSave() { clearTimeout(this.soon); if (this.account) this.soon = window.setTimeout(() => this.sync().catch(() => {}), 3000); }

  sync(): Promise<void> {
    if (!this.running) this.running = this.syncOnce().finally(() => { this.running = null; });
    return this.running;
  }

  private async syncOnce() {
    const root = this.d.root();
    if (!this.account) return;
    if (!root) { this.d.status(t("sync.noRoot"), true); return; }
    this.d.status(t("sync.running"));
    try {
      const st = await this.serverState();
      if (st.e2e && !this.keys) { this.d.status(t("sync.needPassphrase"), true); return; }
      if (!st.e2e && this.keys) { this.keys = null; await this.d.store().set("syncKey", null); }
      let state = (await this.d.store().get<SyncState>("syncState")) ?? null;
      if (!state || state.root !== root || state.e2e !== !!st.e2e) state = { seq: 0, root, e2e: !!st.e2e, files: {} };
      const touched: string[] = [];

      // 1. Pobierz zmiany z serwera
      for (;;) {
        const ch = await this.api<{ seq: number; more: boolean; notes: any[] }>(`sync/changes?since=${state.seq}`);
        for (const n of ch.notes) await this.applyRemote(root, state, n, touched);
        state.seq = ch.seq;
        if (!ch.more) break;
      }

      // lista plików musi już zawierać to, co właśnie pobraliśmy — inaczej nowe pliki wyglądałyby na usunięte
      if (touched.length) { await this.d.changed(touched); touched.length = 0; }

      // 2. Wyślij lokalne zmiany
      const local = new Map(this.d.notes().filter((n) => !n.rel.startsWith(".") && this.d.included(n.rel)).map((n) => [n.rel, n.path]));
      const changes: any[] = [], pending: Record<string, { hash: string; key: string }> = {};
      for (const [rel, path] of local) {
        let text: string;
        try { text = await readTextFile(path); } catch { continue; }
        const hash = await sha256(text);
        const prev = state.files[rel];
        if (prev?.hash === hash) continue;
        const key = prev?.key ?? (this.keys ? await noteId(this.keys, rel) : rel);
        pending[key] = { hash, key };
        changes.push({ ...(await this.wire(key, rel, text)), base_version: prev?.version ?? 0, rel });
      }
      for (const [rel, prev] of Object.entries(state.files)) {
        // wyłączona z synchronizacji: nie wysyłamy usunięcia (plik zostaje na dysku i na serwerze bez zmian)
        if (!this.d.included(rel)) continue;
        if (local.has(rel) || (await exists(join(root, ...rel.split("/"))))) continue; // usunięte = nie ma na dysku
        changes.push({ ...(await this.wire(prev.key, rel, "")), deleted: true, base_version: prev.version, rel });
        pending[prev.key] = { hash: "", key: prev.key };
      }
      for (let i = 0; i < changes.length; i += 100) {
        const batch = changes.slice(i, i + 100);
        const res = await this.api<{ seq: number; results: any[] }>("sync/push", {
          method: "POST", body: JSON.stringify({ device: this.d.device, changes: batch.map(({ rel, ...c }) => c) }),
        });
        for (const r of res.results) {
          const c = batch.find((x) => x.key === r.key)!;
          if (r.status === "ok") {
            if (c.deleted) delete state.files[c.rel];
            else state.files[c.rel] = { key: r.key, version: r.version, hash: pending[r.key].hash };
          } else if (r.status === "conflict") {
            await this.applyRemote(root, state, r.server, touched, true);
          } else {
            throw new Error(r.error ?? r.status);
          }
        }
      }
      await this.d.store().set("syncState", state);
      if (touched.length) await this.d.changed(touched);
      this.d.status(t("sync.done", { time: new Date().toLocaleTimeString() }));
    } catch (e: any) {
      this.d.status(t("sync.failed", { err: e?.message ?? e }), true);
      throw e;
    }
  }

  private async wire(key: string, rel: string, text: string) {
    return this.keys
      ? { key, path: await encrypt(this.keys, rel), content: text ? await encrypt(this.keys, text) : "", encrypted: true }
      : { key, path: rel, content: text, encrypted: false };
  }

  /** Zapisuje notatkę z serwera na dysk; gdy lokalny plik też się zmienił, zachowuje go jako kopię konfliktu. */
  private async applyRemote(root: string, state: SyncState, n: any, touched: string[], conflict = false) {
    const rel: string = n.encrypted ? await decrypt(this.keys!, n.path) : n.path;
    if (!isSafeRel(rel) || !this.d.included(rel)) return; // poza wybranym zakresem — nie zapisujemy na dysku
    const content: string = n.deleted ? "" : n.encrypted && n.content ? await decrypt(this.keys!, n.content) : n.content;
    const path = join(root, ...rel.split("/"));
    const prev = state.files[rel];
    // echo własnego wysłania (albo starsza wersja) — już to mamy
    if (!conflict && prev && prev.key === n.key && prev.version >= n.version) return;
    let localText: string | null = null;
    if (await exists(path)) { try { localText = await readTextFile(path); } catch { /* */ } }
    const localHash = localText === null ? null : await sha256(localText);
    const localChanged = localText !== null && (conflict || (prev ? prev.hash !== localHash : true));
    if (localChanged && localText !== content && !(n.deleted && localText === "")) {
      if (n.deleted) {
        // usunięta gdzie indziej, zmieniona tutaj: zostawiamy plik, wyśle się jako nowa wersja
        state.files[rel] = { key: n.key, version: n.version, hash: "" };
        return;
      }
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ").replace(":", "-");
      const copy = rel.replace(/(\.md|\.markdown)?$/i, (ext) => ` (${t("sync.conflict")} ${stamp})${ext || ".md"}`);
      await writeFileSafe(join(root, ...copy.split("/")), localText!);
      touched.push(join(root, ...copy.split("/")));
    }
    if (n.deleted) {
      if (localText !== null) await remove(path).catch(() => {});
      delete state.files[rel];
    } else {
      await writeFileSafe(path, content);
      state.files[rel] = { key: n.key, version: n.version, hash: await sha256(content) };
    }
    touched.push(path);
  }
}

/** Nie pozwalamy serwerowi pisać poza katalogiem biblioteki. */
const isSafeRel = (rel: string) => !!rel && !rel.startsWith("/") && !/^[a-z]:/i.test(rel) && !rel.split(/[\\/]/).some((p) => p === ".." || p === "");

async function writeFileSafe(path: string, text: string) {
  const dir = path.slice(0, Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")));
  if (dir && !(await exists(dir))) await mkdir(dir, { recursive: true });
  await writeTextFile(path, text);
}
