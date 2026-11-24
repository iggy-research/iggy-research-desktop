/** Wybór modelu w ustawieniach: wyszukiwarka, zakładki (polecane / ulubione / ostatnie / lokalne / wszystkie), ceny. */
import { t } from "./i18n";
import { catalog, formatContext, formatPrice, modelInfo, ModelInfo, RECOMMENDED_KEYS, LOCAL_PROVIDERS } from "./models";

type Tab = "recommended" | "fav" | "recent" | "local" | "all";
const TABS: [Tab, Parameters<typeof t>[0]][] = [
  ["recommended", "mp.tabRecommended"], ["fav", "mp.tabFav"], ["recent", "mp.tabRecent"], ["local", "mp.tabLocal"], ["all", "mp.tabAll"],
];
const LIMIT = 150;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export interface PickerDeps {
  favorites: Set<string>;
  recent: () => string[];
  saveFavorites: () => void;
  refresh: () => Promise<void>;
}

export function createModelPicker(root: HTMLElement, deps: PickerDeps) {
  root.innerHTML = `
    <div class="mp-bar">
      <input type="search" class="mp-search" placeholder="${t("mp.search")}" autocomplete="off" />
      <button type="button" class="mp-refresh" title="${t("mp.refreshHint")}">${t("mp.refresh")}</button>
    </div>
    <div class="mp-tabs">${TABS.map(([tb, l]) => `<button type="button" data-tab="${tb}">${t(l)}</button>`).join("")}</div>
    <ul class="mp-list"></ul>
    <div class="mp-custom">
      <input type="text" placeholder="${t("mp.customPh")}" autocomplete="off" />
      <button type="button">${t("mp.use")}</button>
    </div>
    <div class="mp-status"></div>`;
  const search = root.querySelector<HTMLInputElement>(".mp-search")!;
  const list = root.querySelector<HTMLUListElement>(".mp-list")!;
  const custom = root.querySelector<HTMLInputElement>(".mp-custom input")!;
  const status = root.querySelector<HTMLElement>(".mp-status")!;
  let tab: Tab = "recommended";
  let current = "";
  let inheritLabel: string | null = null;
  let onPick: (key: string) => void = () => {};

  const pick = (key: string) => { root.hidden = true; onPick(key); };

  function source(): ModelInfo[] {
    const all = [...catalog.models.values()];
    const q = search.value.trim().toLowerCase();
    if (q) {
      const words = q.split(/\s+/);
      return all
        .filter((m) => words.every((w) => `${m.name} ${m.vendor} ${m.id}`.toLowerCase().includes(w)))
        .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    }
    switch (tab) {
      case "recommended": return all.filter((m) => RECOMMENDED_KEYS.has(m.key));
      case "fav": return [...deps.favorites].map(modelInfo);
      case "recent": return deps.recent().map(modelInfo);
      case "local": return all.filter((m) => m.provider !== "openrouter");
      case "all": return all.sort((a, b) => a.vendor.localeCompare(b.vendor) || a.name.localeCompare(b.name));
    }
  }
  const rank = (m: ModelInfo) => (deps.favorites.has(m.key) ? 0 : RECOMMENDED_KEYS.has(m.key) ? 1 : 2);

  function empty(): string {
    if (search.value.trim()) return t("mp.noMatch");
    return {
      recommended: "", all: t("mp.emptyAll"), fav: t("mp.emptyFav"), recent: t("mp.emptyRecent"), local: t("mp.emptyLocal"),
    }[tab];
  }

  function render() {
    root.querySelectorAll<HTMLButtonElement>(".mp-tabs button").forEach((b) =>
      b.classList.toggle("active", !search.value.trim() && b.dataset.tab === tab));
    const items = source();
    const rows: string[] = [];
    if (inheritLabel && !search.value.trim()) {
      rows.push(`<li data-key="" class="${current === "" ? "selected" : ""}"><span class="mp-star-gap"></span>
        <div class="mp-main"><span class="mp-name">${esc(inheritLabel)}</span></div></li>`);
    }
    for (const m of items.slice(0, LIMIT)) {
      const fav = deps.favorites.has(m.key);
      const meta = [formatPrice(m), m.context ? t("mp.context", { ctx: formatContext(m.context) }) : "", m.note ? t(m.note) : ""].filter(Boolean).join(" · ");
      rows.push(`<li data-key="${esc(m.key)}" class="${m.key === current ? "selected" : ""}">
        <button type="button" class="mp-star${fav ? " on" : ""}" title="${t(fav ? "fav.remove" : "fav.add")}">${fav ? "★" : "☆"}</button>
        <div class="mp-main"><span class="mp-name">${esc(m.name)}</span> <span class="mp-vendor">${esc(m.vendor)}</span>
        <div class="mp-meta">${esc(meta)}</div></div></li>`);
    }
    if (items.length > LIMIT) rows.push(`<li class="mp-more">${esc(t("mp.more", { n: items.length - LIMIT }))}</li>`);
    if (!items.length && empty()) rows.push(`<li class="mp-more">${esc(empty())}</li>`);
    list.innerHTML = rows.join("");
    const parts = [`OpenRouter: ${catalog.status.openrouter ?? t("mp.loading")}`];
    for (const [p, { label }] of Object.entries(LOCAL_PROVIDERS)) {
      const st = catalog.status[p as keyof typeof catalog.status];
      if (st) parts.push(`${label}: ${st}`);
    }
    status.textContent = parts.join(" · ");
  }

  list.addEventListener("click", (e) => {
    const li = (e.target as HTMLElement).closest("li");
    if (!li || li.dataset.key === undefined) return;
    const key = li.dataset.key;
    if ((e.target as HTMLElement).closest(".mp-star")) {
      deps.favorites.has(key) ? deps.favorites.delete(key) : deps.favorites.add(key);
      deps.saveFavorites();
      render();
      return;
    }
    pick(key);
  });
  root.querySelectorAll<HTMLButtonElement>(".mp-tabs button").forEach((b) =>
    (b.onclick = () => { tab = b.dataset.tab as Tab; search.value = ""; render(); }));
  search.oninput = render;
  const useCustom = () => { const v = custom.value.trim(); if (v) pick(v); };
  root.querySelector<HTMLButtonElement>(".mp-custom button")!.onclick = useCustom;
  // Enter w polach wewnątrz <form method="dialog"> zamknąłby całe ustawienia
  root.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.target === custom) useCustom();
      else if (e.target === search) { const first = list.querySelector<HTMLLIElement>("li[data-key]"); if (first) pick(first.dataset.key!); }
    } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); root.hidden = true; }
  });
  const refreshBtn = root.querySelector<HTMLButtonElement>(".mp-refresh")!;
  refreshBtn.onclick = async () => {
    refreshBtn.disabled = true; status.textContent = t("mp.refreshing");
    try { await deps.refresh(); } finally { refreshBtn.disabled = false; render(); }
  };

  return {
    /** Otwiera wybór pod elementem `anchor`. `inherit` = etykieta opcji „jak w innym zadaniu” (klucz ""). */
    open(anchor: HTMLElement, key: string, inherit: string | null, cb: (key: string) => void) {
      if (!root.hidden && root.previousElementSibling === anchor) { root.hidden = true; return; }
      anchor.after(root);
      current = key; inheritLabel = inherit; onPick = cb;
      search.value = ""; custom.value = "";
      tab = !RECOMMENDED_KEYS.has(key) && deps.favorites.has(key) ? "fav"
        : key && !RECOMMENDED_KEYS.has(key) && catalog.models.get(key)?.provider !== "openrouter" ? "local" : "recommended";
      root.hidden = false;
      render();
      search.focus();
    },
    close() { root.hidden = true; },
    /** Po zmianie języka interfejsu: odśwież stałe napisy. */
    rebuild() {
      search.placeholder = t("mp.search");
      refreshBtn.textContent = t("mp.refresh"); refreshBtn.title = t("mp.refreshHint");
      root.querySelectorAll<HTMLButtonElement>(".mp-tabs button").forEach((b, i) => (b.textContent = t(TABS[i][1])));
      custom.placeholder = t("mp.customPh");
      root.querySelector<HTMLButtonElement>(".mp-custom button")!.textContent = t("mp.use");
      if (!root.hidden) render();
    },
    render,
  };
}
