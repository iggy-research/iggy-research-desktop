# Bugi / TODO

## Do sprawdzenia

- [x] **Wyrównać ikony w toolbarze.** Zrobione: wszystkie ikony paska (☰, gwiazdka, RSS, publikacja, historia, synchronizacja, motyw, pomoc, ustawienia) to SVG 16–17 px z linią 1,7. Pomiar obrysów (headless Chromium, font 12px):
  ☰ 9×10, ★ (SVG) 9.2×8.7, napisy wys. 9, ⚙ (SVG) 9×10 — ale **◐ tylko 6×6** i **? 7×9**,
  przez co prawa strona wygląda na mniejszą. Pomysł: zamienić ◐ i ? na SVG ~9–10 px
  z linią ~0.9 px (jak gwiazdka i ⚙). Sprawdzić też w oknie Tauri (inne fonty).
