# Modeateljén v2 — NÄSTA (uppdaterad 2026-07-21)

Spelet är LIVE på `carlpalmquist.com/atelje2` (deploy via `git push origin main` → CF Pages).
Kod: `src/pages/atelje2/index.astro` (JS+HTML) + `public/atelje2.css` (CSS — **måste vara extern fil, Astro droppar regler ur inline `<style>`**).
Garderob: `public/garderob-v2/` (21 chroma-plagg + `manifest.json` m. category/z/defaultColor) + docka `doll.png`.
Pipeline-verktyg: `atelje-v2/tools/{kontext,chromakey2,recolor-chroma,composite-on-doll,birefnet}.mjs`. Full spec: `ATELJE-V2-SPEC.md`.
Verifiera UI via CDP mot Chrome **9004** / dev **5004** (mobil 390×844 + desktop 1400×900).

## ✅ KLART 2026-07-21 (punkt 1 & 2 — verifierade i browsern)

### 1. Recolor-fix (REGRESSION) — KLAR
`recolor()` i index.astro desaturerar nu plagget (`filter='grayscale(1) brightness(1.12)'`) INNAN
multiply → bas-färg-kontamineringen borta, ren stark hue som v1. **Numeriskt bevis** (jeans→rosa):
gammal recolor gav `[44,29,89]` (blå-dominant mudd), ny ger `[91,32,44]` (röd-dominant, rätt rosa).

### 2. Mönster-storlek + täthet — KLAR
- `patSize`/`patDens` (default 1) i worn-state (roller-onclick + bakåtkomp-normalisering i renderStyle).
- `PAT` ombyggt grid-baserat: motiv (prickar/stjärnor/hjärtan/blommor) = `g×g`-rutnät, `g=round(2·patDens)`;
  linjer (breton/rutor/gingham) = antal styrt av täthet. `recolor(...,psize,pdens)` med tile-scale `W/440·psize`.
- UI: två rosa +/−-pill-rader (Storlek / Täthet) under mönstren, steg 0.15, clamp 0.4–2.2, live-render.
  CSS `.patsteps/.steprow/.stepb` i `public/atelje2.css`. HTML-behållare `#patsteps`.

## 🟡 PUNKT 3 — Code-sidan KLAR, väntar Cowork-generering

Fil-kö-protokollet är byggt och **rör-testat end-to-end** (jacket-on-chroma som stand-in →
ren extraktion, 0% grön-läckage, 0% hål). Väntar bara på att Cowork faktiskt genererar bilderna.

**Delad mapp:** `~/PA/atelje-gen-queue/` (README = kontraktet). Verktyg i `atelje-v2/tools/`:
- `queue-new.mjs <id> <cat> "<label>" "<eng>" [#färg] [z]` → skriver `requests/<id>.json` (prompt+z+färg).
- `queue-process.mjs <id>` → grön-key (chromakey2) + mät grön-överlevnad/hål/läckage → `feedback/<id>.md`. **Auto-godkänner ALDRIG.**
- `queue-approve.mjs <id>` → efter mänsklig CLEAN-dom: kopiera till `garderob-v2/` + manifest-rad.

**Kö nu (4 pending):** `green-survival-test` (kör FÖRST — avgör om grönt överlever Nano Banana),
`croptop` (vit), `ballerina` (vit, shoes z12), `leggings` (svart z10).

**Cowork-loop:** läs `requests/<id>.json` → generera med `reference/baseChroma.png` som bild-input +
`prompt`-fältet → spara `incoming/<id>.png`, sätt status="generated" → be Code köra `queue-process`.

**Make-or-break kvarstår:** överlever den GRÖNA kroppen Nano Banana? `queue-process` rapporterar
grön-överlevnad i råbilden. Grönt kvar → kanalen funkar, kör resten. Grönt omfärgat → fall tillbaka
på hud-docka / vänta på fal-påfyllning (`fal.ai/dashboard/billing`).

## Ej blockerat längre
Recolor + mönster krävde inga credits och är klara. Bara nya PLAGG kräver generering (nu via
Cowork-kanalen ovan i st.f. Flux). `dock-roster` (flera dockor m. inbakade frisyrer) = separat spår.
