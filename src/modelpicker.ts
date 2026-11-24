/** Wybór modelu w ustawieniach: wyszukiwarka, zakładki (polecane / ulubione / ostatnie / lokalne / wszystkie), ceny. */
import { catalog, formatContext, formatPrice, modelInfo, ModelInfo, RECOMMENDED_KEYS, LOCAL_PROVIDERS } from "./models";

type Tab = "recommended" | "fav" | "recent" | "local" | "all";
const TABS: [Tab, string][] = [
  ["recommended", "Polecane"], ["fav", "★ Ulubione"], ["recent", "Ostatnie"], ["local", "Lokalne"], ["all", "Wszystkie"],
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
      <input type="search" class="mp-search" placeholder="Szukaj: nazwa, dostawca albo ID…" autocomplete="off" />
      <button type="button" class="mp-refresh" title="Pobierz listę modeli od nowa">Odśwież</button>
    </div>
    <div class="mp-tabs">${TABS.map(([t, l]) => `<button type="button" data-tab="${t}">${l}</button>`).join("")}</div>
    <ul class="mp-list"></ul>
    <div class="mp-custom">
      <input type="text" placeholder="Własne ID: vendor/model albo ollama:nazwa" autocomplete="off" />
      <button type="button">Użyj</button>
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
    if (search.value.trim()) return "Nic nie pasuje. Możesz wpisać ID ręcznie poniżej.";
    return {
      recommended: "", all: "Lista jeszcze się nie wczytała.",
      fav: "Brak ulubionych — kliknij ☆ przy modelu, żeby go tu przypiąć.",
      recent: "Tu pojawią się modele, których faktycznie użyłeś.",
      local: "Włącz Ollamę albo LM Studio w sekcji „Modele lokalne” poniżej i uruchom serwer.",
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
      const meta = [formatPrice(m), m.context ? `${formatContext(m.context)} kontekstu` : "", m.note ?? ""].filter(Boolean).join(" · ");
      rows.push(`<li data-key="${esc(m.key)}" class="${m.key === current ? "selected" : ""}">
        <button type="button" class="mp-star${fav ? " on" : ""}" title="${fav ? "Usuń z ulubionych" : "Dodaj do ulubionych"}">${fav ? "★" : "☆"}</button>
        <div class="mp-main"><span class="mp-name">${esc(m.name)}</span> <span class="mp-vendor">${esc(m.vendor)}</span>
        <div class="mp-meta">${esc(meta)}</div></div></li>`);
    }
    if (items.length > LIMIT) rows.push(`<li class="mp-more">…i ${items.length - LIMIT} więcej — zawęź wyszukiwanie</li>`);
    if (!items.length && empty()) rows.push(`<li class="mp-more">${esc(empty())}</li>`);
    list.innerHTML = rows.join("");
    const parts = [`OpenRouter: ${catalog.status.openrouter ?? "wczytywanie…"}`];
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
    refreshBtn.disabled = true; status.textContent = "Pobieram listę…";
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
    render,
  };
}
