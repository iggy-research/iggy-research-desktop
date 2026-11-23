export interface AiSettings {
  apiKey: string;
  model: string;
  prompt: string;
  debounceMs: number;
  autoAnalyze: boolean;
}

export const DEFAULT_PROMPT = `Jesteś redaktorem. Przeanalizuj podany akapit (w kontekście całego tekstu) pod kątem:
- poprawności językowej (gramatyka, interpunkcja, literówki),
- jasności i zwięzłości (zbędne słowa, strona bierna, powtórzenia),
- spójności z resztą tekstu.
Odpowiedz krótko w Markdown: najpierw jedna linia oceny, potem maks. 5 punktów z konkretnymi poprawkami ("przed → po"). Odpowiadaj w języku akapitu.`;

export const DEFAULT_SETTINGS: AiSettings = {
  apiKey: "",
  model: "anthropic/claude-sonnet-4.5",
  prompt: DEFAULT_PROMPT,
  debounceMs: 1500,
  autoAnalyze: true,
};

let controller: AbortController | null = null;

/** Strumieniuje analizę akapitu z OpenRouter. Poprzednie żądanie jest przerywane. */
export async function analyzeParagraph(
  s: AiSettings,
  paragraph: string,
  context: string,
  onToken: (full: string) => void,
): Promise<string> {
  controller?.abort();
  controller = new AbortController();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${s.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/rafalgawlik/iggy-research",
      "X-Title": "Iggy Research",
    },
    body: JSON.stringify({
      model: s.model,
      stream: true,
      messages: [
        { role: "system", content: s.prompt },
        { role: "user", content: `KONTEKST (cały dokument, skrócony):\n${context.slice(0, 6000)}\n\nAKAPIT DO ANALIZY:\n${paragraph}` },
      ],
    }),
  });
  if (!res.ok || !res.body) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") return out;
      try {
        const delta = JSON.parse(data).choices?.[0]?.delta?.content;
        if (delta) { out += delta; onToken(out); }
      } catch { /* komentarze SSE / niepełne fragmenty */ }
    }
  }
  return out;
}
