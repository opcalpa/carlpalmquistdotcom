# Nivå 2 — riktig HTML/CSS spel-UI-mockup (build-plan, redo att starta)

> Skriven 2026-06-09 ~01:30 inför /clear. Nästa session: börja bygga direkt härifrån.
> Repo: /Users/calpa/Developer/carlpalmquistdotcom · branch `concept-forge` · preview: https://concept-forge.carlpalmquistdotcom.pages.dev/forge

## Varför vi bygger detta (bevisad slutsats)
AI-genererad hel-screenshot (Flux) kan INTE ge ett pålitligt reel-grid. Moment 22, testat och bevisat:
- Ber man om scenen → snygg poster, men bara strösslade bokstäver (lone K på elefant), inget rutnät.
- Ber man om explicit slot-UI ("reel grid, SPIN button, balance") → Flux läser det som **gambling** → returnerar HELT SVART (13KB, ljusstyrka 0.0). Bevisat 2/2 på snällt tema.
- Flux är en fryst API-modell → mer träningsdata/prompt-tweaks löser det INTE.

## Lösningen
Bygg slot-UI:t som **kod**, låt AI göra bara delarna den är bra på.
- **HTML/CSS = rutnät (5-7 rader), SPIN-knapp, HUD, titel, volatilitets-mätare.** Knivskarpt, alltid på plats, blockas aldrig (ingen "bild" att flagga).
- **Flux genererar bara enskilda SYMBOLER** (rävmask, katana-ikon, dryck osv) + ev. karaktär/bakgrund. Enskilda symbol-ikoner triggar varken gambling- eller våldsfilter.
- **A/K/Q/J/10 = ren CSS** (stylade text-tiles i temats färg) → sparar gen-anrop, alltid läsbart.
- Resultat: perfekt, on-tema, reskinbart reel-grid VARJE gång. = den starkaste intervju-artefakten (Hacksaws "stabil struktur + varierat skinn", bokstavligt).

## Byggsteg
1. **Concept-schema (concept.js SYSTEM_PROMPT):** lägg till `symbols`: 4-6 korta engelska prompts för temats high-pay-symboler (1 ikon var, "single centered slot symbol icon, flat, bold comic style, no text, no gambling UI"). Återanvänd mönstret från `sfx`-arrayen.
2. **Endpoint:** ny `functions/api/symbols.js` (kopiera mönster från `audio.js`): POST `{symbols:[{label,prompt}]}` → `{symbols:[{label,url}]}`, genererar via Flux parallellt (Promise.allSettled). Återanvänd black-retry-logiken från `image.js` (men symboler blockas sällan). Inlina ej (returnera urls, klienten/gallery hanterar).
3. **Frontend `renderGameMockup()` (forge.astro):** bygg DOM:
   - Yttre ram i `state` art.palette (CSS-vars från paletten).
   - Titel (state-namnet) + ⚡feature-namn-badge + liten volatilitets-mätare (av math.volatility).
   - **Rutnät:** CSS grid 6×5 (30 celler). Fyll mest med CSS-letter-tiles (A/K/Q/J/10) + strö in genererade symbol-bilder. Slumpa placering (men deterministiskt via index, ej Math.random om det körs i workflow — här är det browser, så Math.random är ok).
   - HUD-bar: ☰ meny, gul BUY BONUS, saldo, bet-steppers, stor rund SPIN-knapp, autoplay-ikon.
4. **Koppla in i flip:** 'game'-läget renderar `renderGameMockup()` (DOM) istället för `<img>`. Behåll Mood (key art) + Loop (Ray 2). Dvs renderImage: om mode==='game' → injicera mockup-HTML, ej img.
5. **Generering:** i `generateFresh` lägg ett jobb som hämtar symbols (parallellt med bild/sfx/soundtrack), spara i `state.versions` (ny `symbols`-array eller på art-versionen). Mockupen byggs när symbolerna landat.
6. **Persist/gallery:** spara symbol-urls i state (inlina i gallery.js som image/gameview för att överleva).
7. **Bonus (nivå 2.5):** SPIN-knappen tumlar symbolerna + spelar ElevenLabs-SFX = den "faux-interaktiva" mockupen.

## Nuläge på Forge (allt deployat, fungerar)
Pipeline: vibe → Claude (koncept-brief m. RTP/grid/bonus-buy/feature-namn/3-korts-intro) → Flux (key art + game-view-bild) → Ray 2 (attract-loop, Mood/Game/Loop-flip, ▶) → Suno V5 (soundtrack, autoplay, more/less-reshape, fal Lyria reserv) → ElevenLabs (SFX). Progressiv inladdning. Vänte-musik (public/hold-music.mp3) under loading. Try-chips shuffle. **/api/image returnerar ALDRIG svart** (retry + error), misslyckad game-reroll rensar svart + flippar till Mood. Game-bilden funkar (scen-baserad, poster-ish) men ger inte riktigt rutnät → därför nivå 2.

Design-DNA (matar prompten): /Users/calpa/Developer/carlpalmquistdotcom/HACKSAW-DESIGN-DNA.md
Inspo-skärmdumpar: /Users/calpa/Developer/carlpalmquistdotcom/HackSaw Inspo
Deploy: CF_PAGES_TOKEN i .dev.vars → push branch + POST pages/projects/carlpalmquistdotcom/deployments branch=concept-forge.
KONTEXT: Carl intervjuar AI-Specialist hos Hacksaw (via Novare) — intervju 2026-06-09 kl 11:00. Forge = demo + produkt-tes.
