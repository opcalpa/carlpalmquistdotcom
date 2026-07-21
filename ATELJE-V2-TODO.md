# Modeateljén v2 — NÄSTA (handoff efter clear 2026-07-21)

Spelet är LIVE på `carlpalmquist.com/atelje2` (deploy via `git push origin main` → CF Pages).
Kod: `src/pages/atelje2/index.astro` (JS+HTML) + `public/atelje2.css` (CSS — **måste vara extern fil, Astro droppar regler ur inline `<style>`**).
Garderob: `public/garderob-v2/` (21 chroma-plagg + `manifest.json` m. category/z/defaultColor) + docka `doll.png`.
Pipeline-verktyg: `atelje-v2/tools/{kontext,chromakey2,recolor-chroma,composite-on-doll,birefnet}.mjs`. Full spec: `ATELJE-V2-SPEC.md`.
Verifiera UI via CDP mot Chrome **9004** / dev **5004** (mobil 390×844 + desktop 1400×900). Sista commit: `891339f`.

## 3 PUNKTER ATT GÖRA (i ordning)

### 1. Recolor-fix (REGRESSION — högst prio)
Att byta färg på plagg blev "ett konstigt halv-opacitets-lager ovanpå" → rosa blir smutsig-rosa ovanpå baskfärg. v1 var starkt & rent.
- Fix i `recolor(im,color,pat,fg,...)` i index.astro: **desaturera plagget till neutral ljus bas INNAN multiply** (tar bort bas-färg-kontaminering → ren stark hue). T.ex. `x.filter='grayscale(1) brightness(1.12)'; x.drawImage(im,0,0); x.filter='none';` sen multiply-färg, sen `destination-in` för formen. Verifiera: recolora skater/maxi till rosa/blått → ska bli STARKT & rent, inte muddigt.

### 2. Mönster-storlek + täthet (två +/− per markerat plagg)
Bredvid mönstren: **+/− för DIMENSIONER** (motiv-storlek) och **+/− för TÄTHET** (fler linjer/hjärtan/prickar, ALLTID symmetriska avstånd).
- Lägg `patSize` + `patDens` (default 1) i worn-state `{id,color,pat,fg,adj,patSize,patDens}` (skapas i roller-onclick + i loadLook-restore + captureThumb-clone följer med automatiskt).
- Bygg om `PAT` (i index.astro) till **grid-baserat**: motiv-mönster (prickar/stjärnor/hjärtan/blommor) ritar ett `g×g`-rutnät där `g=Math.max(1,Math.round(2*patDens))`, motiv-radie `= (T/g)*frac*patSize` → symmetriskt. Linje-mönster (breton/rutor/gingham): antal linjer `= f(patDens)`, tjocklek `= f(patSize)`.
- `patCanvas(pat,color,fg,size,dens)` + `recolor(...,psize,pdens)`: tile-scale `sc = W/440 * psize` (större = större mönster). Uppdatera `applyOne` att skicka `st.patSize,st.patDens`.
- UI i `renderStyle`: under mönster-raden, två rader "Storlek −/＋" och "Täthet −/＋" (steg 0.15, clamp ~0.4–2.2) som re-renderar plagget live. Diskret v2-stil (rosa pills).

### 3. Billigare generering via Cowork + Gemini/Nano Banana (spara fal-credits)
Calles idé: Cowork genererar via hans Gemini/Nano-Banana-konto, loop mellan Code↔Cowork, bilder i DELAD MAPP.
- Sätt upp **fil-baserat kö-protokoll** (en hjärna = filsystemet): Code skriver request (prompt + `atelje-v2/bodies/baseChroma.png`-referens) till delad mapp → Cowork genererar → sparar PNG dit → Code kör `chromakey2.mjs` + verifierar (subagent) → skriver feedback → Cowork regenererar. Loop tills rent.
- **MÅSTE TESTA FÖRST:** överlever den GRÖNA kroppen Nano Banana? följer den "add garment, keep pose"? (chroma-keyen är modelloberoende, men bara om grönt bevaras). Om ja → hela pipelinen funkar utan Flux-credits.
- Väntande plagg för denna kanal: **croptopp + ballerina i vitt**, **leggings** (svart-tight vägrade Flux — testa Gemini el. hud-docka), + **dock-roster** (flera dockor m. inbakade frisyrer).

## Blockerat annars
fal.ai-SALDO SLUT (`fal.ai/dashboard/billing`) → ingen Flux Kontext-gen förrän påfyllt. Därav punkt 3.
