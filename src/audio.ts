/**
 * Notatka głosowa: nagranie z mikrofonu → WAV mono 16 kHz (PCM 16-bit) → base64 dla modelu z wejściem audio.
 * Konwertujemy lokalnie, bo WebView nagrywa w różnych formatach (AAC na macOS, Opus na Linuksie).
 */

export class Recorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  started = 0;

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream);
    this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.start();
    this.started = Date.now();
  }

  /** Kończy nagrywanie i zwraca WAV w base64. */
  async stop(): Promise<string> {
    const rec = this.rec!;
    const done = new Promise<void>((ok) => (rec.onstop = () => ok()));
    rec.stop();
    await done;
    this.stream?.getTracks().forEach((t) => t.stop());
    const blob = new Blob(this.chunks, { type: rec.mimeType });
    return toWavBase64(await blob.arrayBuffer());
  }

  cancel() {
    try { this.rec?.stop(); } catch { /* */ }
    this.stream?.getTracks().forEach((t) => t.stop());
  }
}

export async function toWavBase64(encoded: ArrayBuffer, rate = 16000): Promise<string> {
  const decoded = await new AudioContext().decodeAudioData(encoded);
  const frames = Math.ceil(decoded.duration * rate);
  const off = new OfflineAudioContext(1, frames, rate); // mono, 16 kHz
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const pcm = (await off.startRendering()).getChannelData(0);
  return bytesToBase64(encodeWav(pcm, rate));
}

export function encodeWav(samples: Float32Array, rate: number): Uint8Array {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
