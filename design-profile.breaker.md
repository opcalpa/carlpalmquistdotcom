# Design Profile — Breakout (white-label L&D demo)

> Fristående produkt-identitet för `/breakout/`-demon. INTE carlpalmquist.com:s eller Forges look.
> Känsla: **premium & energisk, ljust.** Tänk Mentimeter/Kahoot — fast dyrare och lugnare i smaken.
> White-label: kunden byter `--brand`, allt annat är produktens ram.

## Tone
Energisk men vuxen. Lekfull i mikro-interaktioner (svar, poäng, leaderboard), stram i layout och typografi. Aldrig barnslig, aldrig "AI-template".

## Color roles
- **Surface:** `--surface: #ffffff` (kort), `--bg: #f5f6f8` (sidbakgrund, aningen kall grå).
- **Ink:** `--ink: #0f1420` (rubriker), `--ink-2: #5a6172` (brödtext/muted), `--line: #e7e9ee` (hårfina linjer).
- **Brand (konfigurerbar, default violett):** `--brand: #6d5efc`. Används SPARSAMT och skarpt: primärknappar, aktivt läge, leaderboard-barer, accenter. Aldrig som stora fält.
- **Brand-tint:** `--brand-soft` (brand @ ~10% på vitt) för valda/aktiva bakgrunder.
- **Semantik:** `--good: #12b76a`, `--bad: #f04438`. Endast för rätt/fel-feedback.
- Kontrast: brödtext ≥ 4.5:1 mot surface. `--brand-ink` (text på brand) räknas per luminans (vit på mörk brand, mörk på ljus brand).

## Typography
- **Display (rubriker, siffror):** "Bricolage Grotesque" (Google Fonts, variable). Karaktärsfull, modern-premium. Vikt 600–700.
- **Body/UI:** "Figtree" (Google Fonts). Ren, vänlig, energisk. Vikt 400/500/600.
- Undvik Inter/Roboto/Arial som default.
- Skala (few steps): 12 / 13 / 15 (body) / 18 / 22 / 28 / 40 (display). Line-height 1.5 body, 1.1 display.

## Spacing & shape
- 4px-bas: 4, 8, 12, 16, 24, 32, 48, 64. Inga godtyckliga px.
- Radie: kort 20px, knappar/inputs 12px, pills 999px.
- Skuggor: mjuka, lagrade, låg opacitet — `0 1px 2px rgba(16,20,32,.04), 0 8px 24px rgba(16,20,32,.06)`. Aldrig hårda svarta.

## Components
- **Kort:** vit surface, 1px `--line`, mjuk skugga, 20px radie, 24px padding.
- **Primärknapp:** brand-fylld, `--brand-ink`, 12px radie, 600, hover lyfter (translateY -1px) + fördjupad skugga.
- **Sekundärknapp (ghost):** vit, 1px line, ink; hover → brand-line.
- **Svarsknapp (guest):** stor, vänsterställd, vit, line; hover brand-line + lyft; vald = brand-ring; rätt = good-tint; fel = bad-tint. Bokstavsbricka (A/B/C/D) i brand-soft.
- **Leaderboard-rad:** vit, plats-siffra, namn, poäng; #1 guld-accent; "jag/mitt lag" = brand-ring.
- **Bar:** brand-fylld, brand-soft-spår, mjuk animation på bredd.

## Motion (subtilt, meningsfullt)
- Kort/knappar: 150ms ease på hover-lyft + skugga.
- Svar valt: liten scale-puls. Rätt svar: grön puls; fel: diskret shake.
- Poäng/leaderboard: bredd/opacitet-transition, ingen gimmick.
- En mjuk load-reveal (fade+rise) på huvudkortet per vy.
- Respektera `prefers-reduced-motion`.

## Hard rules
- Allt via CSS-variabler; inga hårdkodade hex inline i markup.
- `--brand` är enda färg som ändras av kund; rör aldrig ink/surface/line per kund.
- Varje interaktivt element: hover + focus-visible + disabled. Focus-ring i brand.
- Empty states och "väntar"-lägen är designade, inte eftertankar.
