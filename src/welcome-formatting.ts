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

Link do strony: [strona Iggy Research](https://iggy-research.com)

Link do notatki: [[Witaj]] · z własnym tekstem: [[Drugi mózg|moja sieć notatek]] · do nagłówka: [[Skupienie#Focus]]

Link do notatki, której jeszcze nie ma: [[Notatka z przyszłości]] (przerywane podkreślenie; ${mod}+klik ją utworzy)

Jak to zapisać:

${F}markdown
[strona Iggy Research](https://iggy-research.com)
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

/** The “Formatting” welcome note in English. */
export const FORMATTING_NOTE_EN = `# Formatting

This page shows everything the editor can do. Every example has a **How to write it** block underneath with the raw Markdown: copy it, or click the example to see the markup in place. #markdown

> [!tip] Live preview
> Markup disappears when the cursor leaves the line. **${mod}+Shift+M** switches between the formatted view and raw text, and **${mod}+P** shows the finished document.

---

## Headings

# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6

How to write it:

${F}markdown
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6
${F}

The # signs must be followed by a space. Headings 1–3 are set in a classic typeface you can change in settings (⚙).

---

## Emphasis

**Bold** · *italic* · ***bold italic*** · ~~strikethrough~~ · ==highlight== · \`inline code\` · **bold with *italic* inside**

How to write it:

${F}markdown
**Bold**
*italic*
***bold italic***
~~strikethrough~~
==highlight==
\`inline code\`
**bold with *italic* inside**
${F}

Instead of asterisks you can use underscores: \`__bold__\` and \`_italic_\`.

---

## Paragraphs and line breaks

Separate paragraphs with an empty line. A single Enter in the middle of a paragraph
doesn't start a new paragraph, it just moves to a new line in the editor.

This text is already a new paragraph.

How to write it:

${F}markdown
First paragraph.

Second paragraph, after an empty line.
${F}

---

## Lists

- Fruit
  - Apples
  - Pears
    - Williams
- Vegetables

1. First step
2. Second step
   1. Sub-step
3. Third step

How to write it:

${F}markdown
- Fruit
  - Apples
  - Pears
    - Williams
- Vegetables

1. First step
2. Second step
   1. Sub-step
3. Third step
${F}

Indenting (Tab or two spaces) makes a sub-list. Instead of \`-\` you can write \`*\` or \`+\`.

---

## Tasks

- [x] Buy a notebook
- [x] Pick a font
- [ ] Write the first chapter
  - [ ] Draft
  - [ ] Edit

How to write it:

${F}markdown
- [x] Buy a notebook
- [ ] Write the first chapter
  - [ ] Draft
${F}

Click a checkbox to tick a task off. The editor changes \`[ ]\` to \`[x]\` for you.

---

## Links

A link to a website: [the Iggy Research website](https://iggy-research.com)

A link to a note: [[Welcome]] · with your own text: [[Second brain|my network of notes]] · to a heading: [[Focus#Focus]]

A link to a note that doesn't exist yet: [[A note from the future]] (dashed underline; ${mod}+click creates it)

How to write it:

${F}markdown
[the Iggy Research website](https://iggy-research.com)
[[Welcome]]
[[Second brain|my network of notes]]
[[Focus#Focus]]
${F}

Open links with **${mod}+click** or **${mod}+Enter**. Typing \`[[\` shows a list of notes.

---

## Tags

#idea · #project/book · #to-read

How to write it:

${F}markdown
#idea #project/book #to-read
${F}

A tag starts with # without a space. A slash makes a nested tag.

---

## Quotes

> Writing is thinking on paper.
> — William Zinsser

> A quote can have
>> a nested quote inside.

How to write it:

${F}markdown
> Writing is thinking on paper.
> — William Zinsser

> A quote can have
>> a nested quote inside.
${F}

---

## Callouts

A callout is a highlighted box with an icon and a color. Type its kind in square brackets.

> [!note] Note
> A plain side remark.

> [!info] Info
> Something worth knowing.

> [!tip] Tip
> A small trick that makes work easier.

> [!success] Success
> It worked!

> [!question] Question
> What if…?

> [!warning] Warning
> Think twice.

> [!danger] Danger
> This cannot be undone.

> [!bug] Bug
> Something doesn't work here.

> [!example] Example
> What it looks like in practice.

> [!quote] Quote
> A highlighted statement.

> [!abstract]
> Without a title the box shows the kind's name.

How to write it:

${F}markdown
> [!warning] Warning
> The callout's content on the following lines.

> [!tip]
> Without a title the kind's name appears.
${F}

Available kinds: note, abstract (summary, tldr), info, todo, tip (hint, important), success (check, done), question (help, faq), warning (caution, attention), failure (fail, missing), danger (error), bug, example and quote (cite).

---

## Tables

| Book | Author | Year | Rating |
|:-----|:-------|:----:|-------:|
| *Solaris* | Stanisław Lem | 1961 | ★★★★★ |
| *Middlemarch* | George Eliot | 1871 | ★★★★☆ |
| *The Doll* | Bolesław Prus | 1890 | ★★★★☆ |

How to write it:

${F}markdown
| Book | Author | Year | Rating |
|:-----|:-------|:----:|-------:|
| *Solaris* | Stanisław Lem | 1961 | ★★★★★ |
| *Middlemarch* | George Eliot | 1871 | ★★★★☆ |
${F}

Colons in the second row set alignment: \`:---\` left, \`:---:\` center, \`---:\` right. Click the table to edit it.

---

## Code

Short code in a sentence: \`npm run tauri dev\`.

A code block with syntax highlighting:

${F}python
def fibonacci(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
${F}

How to write it:

${F}\`markdown
${F}python
def fibonacci(n):
    ...
${F}
${F}\`

A block opens and closes with three \` characters. After the opening, type the language: python, js, rust, sql, bash, css…

---

## Math

Inline math: $E = mc^2$, and the area of a circle is $\\pi r^2$.

A display formula:

$$
\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}
$$

$$
\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}
$$

How to write it:

${F}latex
Inline math: $E = mc^2$

$$
\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}
$$
${F}

Formulas are written in LaTeX. There can be no space after the opening $ or before the closing one, so “costs $5 and $10” won't turn into a formula.

---

## Footnotes

Nicolaus Copernicus published the heliocentric theory in 1543[^copernicus]. Footnotes number themselves[^numbering].

[^copernicus]: In “On the Revolutions of the Heavenly Spheres”.
[^numbering]: The numbers follow the order of references in the text, not their names.

How to write it:

${F}markdown
Text with a reference[^copernicus].

[^copernicus]: The footnote's content, anywhere in the document.
${F}

Hover over the number to see the content. In preview (${mod}+P) footnotes are collected at the bottom of the page.

---

## Images, video and audio

![[School of Athens.jpg|420]]

*Raphael, “The School of Athens” (1509–1511), Raphael Rooms in the Vatican. Plato points up, to the world of ideas, and Aristotle gestures down, to the world of experience. Two ways of thinking that have argued over the same question for two and a half thousand years: how do we know what we know?*

How to write it:

${F}markdown
![[School of Athens.jpg|420]]
![[Iggy Research.svg|96]]
![[holiday.mp4]]
![[interview.mp3]]
![image description](images/photo.jpg)
![](https://example.com/image.png)
${F}

The number after the bar is the width in pixels (\`|300\` or \`|300x200\`). The easiest way is to **drag a file** into the editor or **paste an image** (${mod}+V). It lands in the Attachments folder. Supported: PNG, JPG, GIF, WebP, SVG, MP4, WebM, MOV, MP3, WAV, OGG, M4A and PDF.

---

## Comments

This text is always visible. %%And this one is a note to yourself: visible only in the editor, it disappears in preview and export.%%

How to write it:

${F}markdown
%%A comment visible only in the editor.%%
${F}

---

## Horizontal rule

Three dashes on their own line draw a horizontal line, like the one below.

---

How to write it:

${F}markdown
---
${F}

---

## Special characters

When you want to type a character that normally formats text, put a backslash before it: \\*this is not italic\\*, \\# this is not a heading.

How to write it:

${F}markdown
\\*this is not italic\\*
\\# this is not a heading
${F}

---

← Back to [[Welcome]]
`;
