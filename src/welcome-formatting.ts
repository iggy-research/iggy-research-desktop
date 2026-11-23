/*
 * Notatka „Formatowanie”: pełny przegląd składni. Każda sekcja pokazuje efekt,
 * a pod nim surowy Markdown w bloku kodu, żeby można go było skopiować.
 */

const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
const F = "```"; // płotek bloku kodu, żeby nie mylić go z końcem szablonu

export const FORMATTING_NOTE = `# Formatowanie

Ta strona pokazuje wszystko, co potrafi edytor. Każdy przykład ma pod spodem blok **Jak to zapisać** z surowym Markdownem: skopiuj go albo kliknij w przykład, żeby zobaczyć znaczniki na miejscu. #markdown

> [!tip] Podgląd na żywo
> Znaczniki znikają, gdy kursor opuszcza linię. **${mod}+Shift+M** przełącza między widokiem sformatowanym a surowym tekstem, a **${mod}+P** pokazuje gotowy dokument.

---

## Nagłówki

# Nagłówek 1
## Nagłówek 2
### Nagłówek 3
#### Nagłówek 4
##### Nagłówek 5
###### Nagłówek 6

Jak to zapisać:

${F}markdown
# Nagłówek 1
## Nagłówek 2
### Nagłówek 3
#### Nagłówek 4
##### Nagłówek 5
###### Nagłówek 6
${F}

Po znakach # musi być spacja. Nagłówki 1–3 są złożone krojem klasycznym, który zmienisz w ustawieniach (⚙).

---

## Wyróżnienia

**Pogrubienie** · *kursywa* · ***pogrubiona kursywa*** · ~~przekreślenie~~ · ==zaznaczenie== · \`kod w linii\` · **pogrubienie z *kursywą* w środku**

Jak to zapisać:

${F}markdown
**Pogrubienie**
*kursywa*
***pogrubiona kursywa***
~~przekreślenie~~
==zaznaczenie==
\`kod w linii\`
**pogrubienie z *kursywą* w środku**
${F}

Zamiast gwiazdek możesz używać podkreślników: \`__pogrubienie__\` i \`_kursywa_\`.

---

## Akapity i podziały

Akapity oddzielasz pustą linią. Pojedynczy Enter w środku akapitu
nie zaczyna nowego akapitu, tylko przechodzi do nowej linii w edytorze.

Ten tekst to już nowy akapit.

Jak to zapisać:

${F}markdown
Pierwszy akapit.

Drugi akapit, po pustej linii.
${F}

---

## Listy

- Owoce
  - Jabłka
  - Gruszki
    - Klapsy
- Warzywa

1. Pierwszy krok
2. Drugi krok
   1. Podkrok
3. Trzeci krok

Jak to zapisać:

${F}markdown
- Owoce
  - Jabłka
  - Gruszki
    - Klapsy
- Warzywa

1. Pierwszy krok
2. Drugi krok
   1. Podkrok
3. Trzeci krok
${F}

Wcięcie (Tab albo dwie spacje) tworzy podlistę. Zamiast \`-\` można pisać \`*\` albo \`+\`.

---

## Zadania

- [x] Kupić notes
- [x] Wybrać czcionkę
- [ ] Napisać pierwszy rozdział
  - [ ] Szkic
  - [ ] Redakcja

Jak to zapisać:

${F}markdown
- [x] Kupić notes
- [ ] Napisać pierwszy rozdział
  - [ ] Szkic
${F}

Kliknij pole wyboru, żeby odhaczyć zadanie. Edytor sam zmieni \`[ ]\` na \`[x]\`.

---

## Linki

Link do strony: [repozytorium Iggy Research](https://github.com/rafalgawlik/iggy-research)

Link do notatki: [[Witaj]] · z własnym tekstem: [[Drugi mózg|moja sieć notatek]] · do nagłówka: [[Skupienie#Focus]]

Link do notatki, której jeszcze nie ma: [[Notatka z przyszłości]] (przerywane podkreślenie; ${mod}+klik ją utworzy)

Jak to zapisać:

${F}markdown
[repozytorium Iggy Research](https://github.com/rafalgawlik/iggy-research)
[[Witaj]]
[[Drugi mózg|moja sieć notatek]]
[[Skupienie#Focus]]
${F}

Linki otwierasz przez **${mod}+klik** albo **${mod}+Enter**. Po wpisaniu \`[[\` pojawi się lista notatek.

---

## Tagi

#pomysł · #projekt/książka · #do-przeczytania

Jak to zapisać:

${F}markdown
#pomysł #projekt/książka #do-przeczytania
${F}

Tag zaczyna się od # bez spacji. Ukośnik tworzy tag zagnieżdżony.

---

## Cytaty

> Pisanie to myślenie na papierze.
> — William Zinsser

> Cytat może mieć
>> zagnieżdżony cytat w środku.

Jak to zapisać:

${F}markdown
> Pisanie to myślenie na papierze.
> — William Zinsser

> Cytat może mieć
>> zagnieżdżony cytat w środku.
${F}

---

## Callouty

Callout to wyróżniona ramka z ikoną i kolorem. Typ wpisujesz w nawiasach kwadratowych.

> [!note] Notatka
> Zwykła uwaga na marginesie.

> [!info] Informacja
> Coś, co warto wiedzieć.

> [!tip] Wskazówka
> Mały trik, który ułatwia pracę.

> [!success] Sukces
> Udało się!

> [!question] Pytanie
> Co by było, gdyby…?

> [!warning] Uwaga
> Zastanów się dwa razy.

> [!danger] Niebezpieczeństwo
> Tego nie da się cofnąć.

> [!bug] Błąd
> Tu coś nie działa.

> [!example] Przykład
> Jak to wygląda w praktyce.

> [!quote] Cytat
> Wyróżniona wypowiedź.

> [!abstract]
> Bez tytułu w ramce pojawia się nazwa typu.

Jak to zapisać:

${F}markdown
> [!warning] Uwaga
> Treść calloutu w kolejnych liniach.

> [!tip]
> Bez tytułu pojawi się nazwa typu.
${F}

Dostępne typy: note, abstract (summary, tldr), info, todo, tip (hint, important), success (check, done), question (help, faq), warning (caution, attention), failure (fail, missing), danger (error), bug, example i quote (cite).

---

## Tabele

| Książka | Autor | Rok | Ocena |
|:--------|:------|:---:|------:|
| *Lalka* | Bolesław Prus | 1890 | ★★★★★ |
| *Solaris* | Stanisław Lem | 1961 | ★★★★☆ |
| *Ferdydurke* | Witold Gombrowicz | 1937 | ★★★★☆ |

Jak to zapisać:

${F}markdown
| Książka | Autor | Rok | Ocena |
|:--------|:------|:---:|------:|
| *Lalka* | Bolesław Prus | 1890 | ★★★★★ |
| *Solaris* | Stanisław Lem | 1961 | ★★★★☆ |
${F}

Dwukropki w drugim wierszu ustawiają wyrównanie: \`:---\` do lewej, \`:---:\` do środka, \`---:\` do prawej. Kliknij w tabelę, żeby ją edytować.

---

## Kod

Krótki kod w zdaniu: \`npm run tauri dev\`.

Blok kodu z podświetlaniem składni:

${F}python
def fibonacci(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
${F}

Jak to zapisać:

${F}\`markdown
${F}python
def fibonacci(n):
    ...
${F}
${F}\`

Blok otwierają i zamykają trzy znaki \`. Po otwarciu wpisz język: python, js, rust, sql, bash, css…

---

## Wzory matematyczne

Wzór w linii: $E = mc^2$, a pole koła to $\\pi r^2$.

Wzór w bloku:

$$
\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}
$$

$$
\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}
$$

Jak to zapisać:

${F}latex
Wzór w linii: $E = mc^2$

$$
\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}
$$
${F}

Wzory piszesz w LaTeX-u. Po otwierającym $ i przed zamykającym nie może być spacji, więc „kosztuje $5 i $10” nie zamieni się we wzór.

---

## Przypisy

Mikołaj Kopernik ogłosił teorię heliocentryczną w 1543 roku[^kopernik]. Przypisy numerują się same[^numeracja].

[^kopernik]: W dziele „O obrotach sfer niebieskich”.
[^numeracja]: Kolejność numerów wynika z kolejności odwołań w tekście, a nie z nazw.

Jak to zapisać:

${F}markdown
Tekst z odwołaniem[^kopernik].

[^kopernik]: Treść przypisu, w dowolnym miejscu dokumentu.
${F}

Najedź na numer, żeby zobaczyć treść. W podglądzie (${mod}+P) przypisy zbierają się na dole strony.

---

## Obrazy, wideo i dźwięk

![[Szkoła Ateńska.jpg|420]]

*Rafael, „Szkoła Ateńska” (1509–1511), Stanze Rafaela w Watykanie. Platon wskazuje w górę, na świat idei, a Arystoteles dłonią w dół, na świat doświadczenia. Dwa sposoby myślenia, które od dwóch i pół tysiąca lat spierają się o to samo pytanie: skąd wiemy to, co wiemy?*

Jak to zapisać:

${F}markdown
![[Szkoła Ateńska.jpg|420]]
![[Iggy Research.svg|96]]
![[wakacje.mp4]]
![[wywiad.mp3]]
![opis obrazka](obrazy/zdjęcie.jpg)
![](https://example.com/obraz.png)
${F}

Liczba po kresce to szerokość w pikselach (\`|300\` albo \`|300x200\`). Najprościej jest **przeciągnąć plik** do edytora albo **wkleić obrazek** (${mod}+V). Trafi wtedy do folderu Załączniki. Obsługiwane są PNG, JPG, GIF, WebP, SVG, MP4, WebM, MOV, MP3, WAV, OGG, M4A i PDF.

---

## Komentarze

Ten tekst widać zawsze. %%A ten jest notatką dla siebie: widać go tylko w edytorze, w podglądzie i eksporcie znika.%%

Jak to zapisać:

${F}markdown
%%Komentarz widoczny tylko w edytorze.%%
${F}

---

## Linia pozioma

Trzy myślniki w osobnej linii rysują poziomą kreskę, taką jak ta poniżej.

---

Jak to zapisać:

${F}markdown
---
${F}

---

## Znaki specjalne

Gdy chcesz napisać znak, który normalnie formatuje tekst, poprzedź go ukośnikiem: \\*to nie jest kursywa\\*, \\# to nie jest nagłówek.

Jak to zapisać:

${F}markdown
\\*to nie jest kursywa\\*
\\# to nie jest nagłówek
${F}

---

← Wróć do [[Witaj]]
`;
