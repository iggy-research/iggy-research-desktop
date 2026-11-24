import { t, Key } from "./i18n";
// Kroje dołączone do aplikacji (wszystkie na licencji SIL OFL 1.1)
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/jetbrains-mono/400-italic.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-sans/400-italic.css";
import "@fontsource/ibm-plex-serif/400.css";
import "@fontsource/ibm-plex-serif/700.css";
import "@fontsource/ibm-plex-serif/400-italic.css";
import "@fontsource/eb-garamond/400.css";
import "@fontsource/eb-garamond/700.css";
import "@fontsource/eb-garamond/400-italic.css";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/400-italic.css";

export interface Appearance {
  bodyFont: string;     // klucz z BODY_FONTS albo "custom"
  bodyCustom: string;   // nazwa czcionki systemowej
  headingFont: string;  // klucz z HEADING_FONTS albo "custom"
  headingCustom: string;
  fontSize: number;     // px
}

export const DEFAULT_APPEARANCE: Appearance = {
  bodyFont: "plex-mono", bodyCustom: "", headingFont: "instrument", headingCustom: "", fontSize: 17,
};

const MONO = "ui-monospace, Menlo, monospace", SERIF = "Georgia, serif", SANS = "system-ui, sans-serif";

export const BODY_FONTS: Record<string, { label: string; css: string }> = {
  "plex-mono": { label: "font.plexMono", css: `"IBM Plex Mono", ${MONO}` },
  "jetbrains": { label: "JetBrains Mono", css: `"JetBrains Mono", ${MONO}` },
  "plex-sans": { label: "IBM Plex Sans", css: `"IBM Plex Sans", ${SANS}` },
  "plex-serif": { label: "IBM Plex Serif", css: `"IBM Plex Serif", ${SERIF}` },
  "garamond": { label: "font.garamond", css: `"EB Garamond", ${SERIF}` },
  "system-sans": { label: "font.systemSans", css: SANS },
  "system-serif": { label: "font.systemSerif", css: `"Iowan Old Style", "Palatino Linotype", Palatino, ${SERIF}` },
};

export const HEADING_FONTS: Record<string, { label: string; css: string; bold: boolean }> = {
  "instrument": { label: "font.instrument", css: `"Instrument Serif", ${SERIF}`, bold: false },
  "cormorant": { label: "font.cormorant", css: `"Cormorant Garamond", ${SERIF}`, bold: false },
  "garamond": { label: "EB Garamond", css: `"EB Garamond", ${SERIF}`, bold: false },
  "plex-serif": { label: "IBM Plex Serif", css: `"IBM Plex Serif", ${SERIF}`, bold: true },
  "plex-sans": { label: "IBM Plex Sans", css: `"IBM Plex Sans", ${SANS}`, bold: true },
  "body": { label: "font.sameAsBody", css: "var(--font-body)", bold: true },
};

const quote = (name: string) => `"${name.replace(/["\\]/g, "")}"`;

export function applyAppearance(a: Appearance) {
  const root = document.documentElement.style;
  const body = a.bodyFont === "custom" && a.bodyCustom.trim()
    ? `${quote(a.bodyCustom.trim())}, ${SANS}` : (BODY_FONTS[a.bodyFont] ?? BODY_FONTS["plex-mono"]).css;
  const h = a.headingFont === "custom" && a.headingCustom.trim()
    ? { css: `${quote(a.headingCustom.trim())}, ${SERIF}`, bold: false }
    : HEADING_FONTS[a.headingFont] ?? HEADING_FONTS.instrument;
  root.setProperty("--font-body", body);
  root.setProperty("--serif-display", h.css);
  root.setProperty("--heading-weight", h.bold ? "700" : "400");
  root.setProperty("--font-size", `${a.fontSize}px`);
}

/** Etykieta czcionki: klucz i18n („font.…”) albo nazwa własna kroju. */
const label = (l: string) => (l.startsWith("font.") ? t(l as Key) : l);
/** Wypełnia <select> opcjami i dopisuje „Własna…”. */
export function fillSelect(sel: HTMLSelectElement, fonts: Record<string, { label: string }>) {
  sel.innerHTML = Object.entries(fonts).map(([k, f]) => `<option value="${k}">${label(f.label)}</option>`).join("")
    + `<option value="custom">${t("font.custom")}</option>`;
}
