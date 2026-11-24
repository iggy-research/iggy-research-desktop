/**
 * Szyfrowanie end-to-end notatek (WebCrypto). Z hasła i soli (PBKDF2-SHA-256, 310 000 iteracji) powstają
 * dwa klucze: AES-GCM do treści i HMAC-SHA-256 do identyfikatora notatki (żeby serwer nie znał ścieżek).
 * Hasło nie opuszcza urządzenia; serwer dostaje tylko sól i zaszyfrowany tekst kontrolny.
 */

const ITER = 310_000;
const CHECK = "iggy-research-e2e-ok";
const enc = new TextEncoder(), dec = new TextDecoder();

export interface E2EKeys { aes: CryptoKey; hmac: CryptoKey; raw: string }

const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const newSalt = () => b64(crypto.getRandomValues(new Uint8Array(16)));

export async function deriveKeys(passphrase: string, salt: string): Promise<E2EKeys> {
  const base = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unb64(salt), iterations: ITER }, base, 512);
  return importKeys(b64(bits));
}

/** Klucze z zapisanej postaci (zapamiętanej na tym urządzeniu, żeby nie pytać o hasło przy każdym starcie). */
export async function importKeys(raw: string): Promise<E2EKeys> {
  const bytes = unb64(raw);
  const aes = await crypto.subtle.importKey("raw", bytes.slice(0, 32), "AES-GCM", false, ["encrypt", "decrypt"]);
  const hmac = await crypto.subtle.importKey("raw", bytes.slice(32), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return { aes, hmac, raw };
}

export async function encrypt(k: E2EKeys, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k.aes, enc.encode(text));
  return `v1.${b64(iv)}.${b64(ct)}`;
}

export async function decrypt(k: E2EKeys, payload: string): Promise<string> {
  const [v, iv, ct] = payload.split(".");
  if (v !== "v1" || !iv || !ct) throw new Error("Nieznany format szyfrogramu.");
  return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, k.aes, unb64(ct)));
}

/** Stały identyfikator notatki zależny od ścieżki, nieczytelny dla serwera. */
export async function noteId(k: E2EKeys, rel: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", k.hmac, enc.encode(rel));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const makeCheck = (k: E2EKeys) => encrypt(k, CHECK);
export async function verifyCheck(k: E2EKeys, check: string): Promise<boolean> {
  try { return (await decrypt(k, check)) === CHECK; } catch { return false; }
}

export async function sha256(text: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
