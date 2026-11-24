/*
 * Notatki powitalne. Przy pierwszym uruchomieniu trafiają na dysk do katalogu
 * „Iggy Research” w Dokumentach i są ze sobą połączone przez [[ ]], więc intro
 * od razu pokazuje, jak działa drugi mózg.
 */

import LOGO_SVG from "../icon.svg?raw";
import { FORMATTING_NOTE } from "./welcome-formatting";
import ATHENS_URL from "./assets/szkola-atenska.jpg?url";
import { WELCOME_NOTES_EN, WELCOME_FILE_EN } from "./welcome-en";

const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

export const WELCOME_FILE = "Witaj.md";

/** Pliki pomocnicze notatek powitalnych (ścieżka względem katalogu): tekst albo adres pliku binarnego. */
export const WELCOME_ASSETS: Record<string, string | { url: string }> = {
  "Załączniki/Iggy Research.svg": LOGO_SVG,
  // Rafael, „Szkoła Ateńska” (1509–1511), fragment: Platon i Arystoteles. Domena publiczna (Wikimedia Commons).
  "Załączniki/Szkoła Ateńska.jpg": { url: ATHENS_URL },
};

export const WELCOME_NOTES: Record<string, string> = {
  "Witaj.md": `![[Iggy Research.svg|112]]

# Iggy *Research*

Pusta strona.
Migający kursor.
I ta jedna myśl, która od rana chodzi Ci po głowie.

==To miejsce jest dla niej.==

---

**Iggy Research** to edytor, który schodzi z drogi. Nie ma tu wstążek, paneli ani powiadomień. Jest tylko tekst, który piszesz, i cichy redaktor obok, który czyta go razem z Tobą.

Ten dokument jest zwykłym plikiem na Twoim dysku. Możesz go zmienić, przepisać albo usunąć. Zanim to zrobisz, kliknij w dowolną linię. Zobaczysz, że pod spodem jest prosty Markdown, a formatowanie pojawia się samo, gdy kursor wychodzi z linii.

## Od czego zacząć

Każdy z tych linków prowadzi do innej notatki. ${mod}+klik, żeby ją otworzyć:

- [[Skupienie]]: jak pisać bez rozpraszania się
- [[Redaktor AI]]: kto czyta Twoje akapity i co Ci podpowie
- [[Drugi mózg]]: jak notatki łączą się w sieć myśli
- [[Formatowanie]]: wszystkie sposoby formatowania tekstu, z przykładami do skopiowania

> [!tip] Spróbuj teraz
> Naciśnij **${mod}+Shift+F** i napisz dowolne zdanie poniżej. Wszystko poza nim przygaśnie.

## Skąd ta nazwa

Iggy to Ignacy, mój syn. Jego imię pochodzi od łacińskiego *ignis*, czyli ogień. Stąd płomień w ikonie i jedyne życzenie, jakie mam dla tej aplikacji: żeby pomysły się w niej paliły.

*Rafał Gawlik*

---

Twoja kolej. Napisz tu pierwsze zdanie:

`,

  "Skupienie.md": `# Skupienie

Pisanie i redagowanie to dwie różne czynności. Ten edytor pomaga je rozdzielić. #pisanie

## Focus

**${mod}+Shift+F** przyciemnia wszystko poza akapitem, który piszesz. Naciśnij drugi raz, a zostanie tylko bieżące *zdanie*. Trzecie naciśnięcie wyłącza tryb.

Spróbuj na tym akapicie. Kliknij gdziekolwiek w środku, włącz Focus i przesuń kursor strzałkami w górę i w dół. Światło pójdzie za Tobą.

## Typewriter

**${mod}+Shift+T** trzyma linię, w której piszesz, na środku ekranu. Tekst przesuwa się w górę jak kartka w maszynie do pisania, a Twój wzrok zostaje w jednym miejscu.

## Cisza

- Górny pasek prawie znika i wraca po najechaniu myszą.
- **☰** chowa bibliotekę, **AI** chowa panel redaktora.
- **${mod}+P** pokazuje gotowy tekst w czcionce szeryfowej, jak do druku.
- **◐** przełącza motyw jasny i ciemny.
- **Live** (${mod}+Shift+M) przełącza między formatowaniem na żywo a surowym Markdownem.

## Spokój o zapis

Kropka obok nazwy pliku pokazuje stan:

| Kropka | Znaczenie |
|:------:|:----------|
| 🔴 | pliku jeszcze nie ma na dysku |
| 🟡 | są niezapisane zmiany |
| 🟢 | wszystko zapisane |

Plik zapisany choć raz zapisuje się sam po każdej zmianie. Nie musisz pamiętać o ${mod}+S.

← Wróć do [[Witaj]] · Dalej: [[Redaktor AI]]
`,

  "Redaktor AI.md": `# Redaktor AI

Wyobraź sobie redaktora, który siedzi obok i czyta każdy akapit, gdy tylko postawisz kropkę. Nie przerywa. Czeka, aż zrobisz pauzę. #ai

## Jak go zaprosić

1. Kliknij **⚙** na górnym pasku.
2. Wklej klucz z openrouter.ai/keys.
3. Wybierz model z listy — domyślny Claude Sonnet 5.5 sprawdza się najlepiej. Wyszukiwarka przeszukuje cały katalog OpenRoutera, a przy każdym modelu widać cenę i okno kontekstu. Gwiazdką ☆ przypinasz ulubione.

Wolisz pracować offline? Włącz w ustawieniach **Ollamę** albo **LM Studio**. Wtedy tekst nie opuszcza komputera, a klucz OpenRouter nie jest potrzebny.

Od teraz po każdej przerwie w pisaniu albo przejściu do nowego akapitu w prawym panelu pojawią się uwagi: poprawność, jasność i spójność. Domyślnie redaktor tylko *wskazuje* problemy i mówi dlaczego — poprawiasz sam. Propozycje „przed → po” włączysz w ustawieniach.

## Twój redaktor, Twoje zasady

Prompt w ustawieniach możesz zmienić całkowicie. Kilka pomysłów:

- „Sprawdź, czy argumentacja jest logiczna.”
- „Uprość tak, żeby zrozumiało dziecko.”
- „Wskaż, gdzie pierwsze zdanie jest za słabe.”
- „Przetłumacz na angielski i oceń styl.”

## Cała notatka

Nad uwagami są przyciski:

- **Podsumuj** — teza notatki w jednym zdaniu, kluczowe punkty i pytania, które popchną myśl dalej.
- **Linki** — które z Twoich notatek łączą się z tą i gdzie wstawić do nich link. Kliknij nazwę, żeby ją otworzyć.

- **Banały** — zdania, które brzmią jak przeciętny tekst z internetu. Podkreśla je w tekście, ale nie poprawia: przepiszesz je po swojemu albo zostawisz świadomie.
- **Kontra** — adwokat diabła. Zaznacz fragment (albo stań w akapicie) i dostaniesz najmocniejszy kontrargument, najsłabsze założenie i pytanie, na które musisz odpowiedzieć.
- **Dawniej** — „kiedyś myślałeś inaczej”: porównuje notatkę z Twoimi dawnymi notatkami na ten sam temat i pokazuje sprzeczności oraz zmiany zdania.

W menu **Więcej** znajdziesz dialog sokratejski, test założeń, „co tu właściwie twierdzisz?”, czytelnika-amatora, pytania na start, kontrolę przed publikacją, nieoczywiste połączenia i wskrzeszanie dawnych notatek.

AI nie pisze tu za Ciebie — pyta, wskazuje i przypomina. Tekst zostaje Twój.

Każde z tych zadań może mieć w ustawieniach własny model: np. szybki Haiku do analizy na bieżąco, a mocniejszy Opus do podsumowań.

**${mod}+Shift+L** wymusza ponowną analizę bieżącego akapitu, a **${mod}+Shift+A** chowa panel, gdy chcesz pisać w samotności.

> [!note] Prywatność
> Do OpenRoutera trafia tylko analizowany akapit i fragment dokumentu jako kontekst (przy narzędziach dla całej notatki — cała notatka i nazwy pozostałych notatek). Z modelem lokalnym nic nie wychodzi z komputera. Klucz zostaje na Twoim komputerze.

← Wróć do [[Witaj]] · Dalej: [[Drugi mózg]]
`,

  "Drugi mózg.md": `# Drugi mózg

Pojedyncza notatka to myśl. Notatki połączone ze sobą to *wiedza*. #pkm

## Linki

Weź nazwę dowolnej notatki w podwójne nawiasy: [[Witaj]]. To już jest link. ${mod}+klik albo ${mod}+Enter go otwiera.

Link do notatki, której jeszcze nie ma, wygląda inaczej: [[Moja pierwsza myśl]]. Kliknij go, a notatka powstanie. Tak rośnie sieć: najpierw link, potem treść.

- Po wpisaniu \`[[\` pojawi się lista istniejących notatek.
- [[Skupienie|Własny tekst linku]] piszesz po kresce pionowej.

## Biblioteka

**☰** (${mod}+Shift+E) otwiera listę wszystkich notatek w katalogu. Na jej dole są **linki zwrotne**, czyli notatki, które prowadzą do tej, którą właśnie czytasz. Otwórz bibliotekę teraz: zobaczysz, że do tej notatki linkuje [[Witaj]].

- **${mod}+Shift+N**: nowa notatka
- **${mod}+Shift+O**: szukaj notatek
- **F2** albo kliknięcie nazwy pliku: zmiana nazwy
- **📁** w bibliotece: wybór innego katalogu z notatkami

## Tagi

#pomysł, #projekt/książka, #do-przeczytania. Krótkie etykiety, które grupują notatki ponad linkami.

← Wróć do [[Witaj]] · Dalej: [[Formatowanie]]
`,

  "Formatowanie.md": FORMATTING_NOTE,
};

const WELCOME_ASSETS_EN: Record<string, string | { url: string }> = {
  "Attachments/Iggy Research.svg": LOGO_SVG,
  // Raphael, “The School of Athens” (1509–1511), detail: Plato and Aristotle. Public domain (Wikimedia Commons).
  "Attachments/School of Athens.jpg": { url: ATHENS_URL },
};

/** Zestaw notatek powitalnych dla języka interfejsu (polski albo angielski). */
export function welcomeSet(lang: string) {
  return lang === "pl"
    ? { file: WELCOME_FILE, notes: WELCOME_NOTES, assets: WELCOME_ASSETS }
    : { file: WELCOME_FILE_EN, notes: WELCOME_NOTES_EN, assets: WELCOME_ASSETS_EN };
}
