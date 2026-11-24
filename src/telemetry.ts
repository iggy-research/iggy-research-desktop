/**
 * Anonimowe statystyki użycia — tylko za zgodą (domyślnie wyłączone).
 * Liczymy, ile razy użyto funkcji (np. „Banały”, publikacja), nigdy treści notatek, nazw plików ani konta.
 * Raz dziennie wysyłamy sumy z losowym identyfikatorem instalacji; serwer przechowuje tylko dzienne liczniki.
 */
import type { Store } from "@tauri-apps/plugin-store";
import { getVersion } from "@tauri-apps/api/app";

export type Feature =
  | "app.open" | "ai.analyze" | "ai.summary" | "ai.links" | "ai.cliche" | "ai.devil" | "ai.past"
  | "publish.iggy" | "publish.export" | "publish.wordpress" | "publish.ghost" | "publish.substack"
  | "sync.run" | "sync.git" | "rss.read" | "rss.save" | "history.restore" | "note.new";

const today = () => new Date().toISOString().slice(0, 10);
const osName = () => (/Mac/.test(navigator.platform) ? "macos" : /Linux/.test(navigator.platform) ? "linux" : /Win/.test(navigator.platform) ? "windows" : "other");

export class Telemetry {
  enabled = false;
  private counts: Record<string, number> = {};
  private timer: number | undefined;

  constructor(private store: () => Store, private server: string) {}

  async init() {
    this.enabled = (await this.store().get<boolean>("telemetry")) ?? false;
    this.counts = (await this.store().get<Record<string, number>>("telemetryCounts")) ?? {};
    this.timer = window.setInterval(() => this.flush().catch(() => {}), 3600_000);
    this.flush().catch(() => {});
  }

  async setEnabled(on: boolean) {
    this.enabled = on;
    await this.store().set("telemetry", on);
    if (!on) { this.counts = {}; await this.store().set("telemetryCounts", {}); }
  }

  track(f: Feature) {
    if (!this.enabled) return;
    this.counts[f] = (this.counts[f] ?? 0) + 1;
    this.store().set("telemetryCounts", this.counts);
  }

  /** Raz dziennie: wysyła sumy z poprzednich dni i zeruje liczniki. */
  async flush() {
    if (!this.enabled || !Object.keys(this.counts).length) return;
    if ((await this.store().get<string>("telemetrySent")) === today()) return;
    let install = await this.store().get<string>("telemetryInstall");
    if (!install) {
      install = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
      await this.store().set("telemetryInstall", install);
    }
    const res = await fetch(`${this.server}/api/public/telemetry`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ install, version: await getVersion(), os: osName(), counts: this.counts }),
    });
    if (!res.ok) return;
    this.counts = {};
    await this.store().set("telemetryCounts", {});
    await this.store().set("telemetrySent", today());
  }
}
