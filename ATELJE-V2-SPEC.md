# Modeateljén v2 — nod-baserad påklädnings-motor (spec)

Målet: bygga bort dagens whack-a-mole (ryggdelar ovanpå, ärmar som pekar fel, manuellt bredd/höjd-pillande) genom EN princip:
**allt (dockor + plagg) genereras mot EN låst baskropp i EN låst pose, och placeras via ett universellt nod-skelett.**

## Kärnprincip
1. **En kanonisk baskropp** (skallig, neutral, låst pose, 9:16). Alla dockor = denna kropp med utbytt ansikte. Alla plagg genereras **pose-låsta** mot den (img2img/ControlNet/Kontext) → rätt skala + armvinkel from början.
2. **Nod-skelett** (punkter + ben/riktning), universellt eftersom alla delar samma kropp.
3. **Plagg-mallar** deklarerar vilka noder de spänner över + täckyta + flaggor → auto-fit + rätt z-ordning.
4. **Hår = eget topplager** (dockan är skallig). Lagerordning: kropp → underplagg → ytterplagg → hår → accessoarer.
5. **Front-only:** plagg genereras påklädda (baksidan fysiskt skymd) + `openCenter`-flagga för öppna plagg (transparent mitt) + suddgummi som reserv för finliret.

## Nod-skelett (mäts på vald baskropp; värden = andel av 9:16-ramen, TBD)
```json
{
  "frame": { "aspect": "9:16", "ref_px": [1080, 1920] },
  "nodes": {
    "crown":      [0.50, 0.03],
    "hairline":   [0.50, 0.07],
    "faceCenter": [0.50, 0.11],
    "chin":       [0.50, 0.17],
    "neckTop":    [0.50, 0.18],
    "neckBase":   [0.50, 0.22],
    "shoulderL":  [0.40, 0.24], "shoulderR": [0.60, 0.24],
    "elbowL":     [0.35, 0.36], "elbowR":    [0.65, 0.36],
    "wristL":     [0.32, 0.48], "wristR":    [0.68, 0.48],
    "chest":      [0.50, 0.30],
    "waist":      [0.50, 0.40],
    "hipL":       [0.44, 0.47], "hipR":      [0.56, 0.47],
    "kneeL":      [0.46, 0.66], "kneeR":     [0.54, 0.66],
    "ankleL":     [0.47, 0.86], "ankleR":    [0.53, 0.86],
    "toeL":       [0.47, 0.92], "toeR":      [0.53, 0.92]
  },
  "bones": [
    ["shoulderL","elbowL"], ["elbowL","wristL"],
    ["shoulderR","elbowR"], ["elbowR","wristR"],
    ["neckBase","waist"], ["waist","hipL"], ["waist","hipR"],
    ["hipL","kneeL"], ["kneeL","ankleL"], ["ankleL","toeL"],
    ["hipR","kneeR"], ["kneeR","ankleR"], ["ankleR","toeR"]
  ],
  "faceBox":  [0.42, 0.05, 0.58, 0.19],
  "hairRegion":[0.34, 0.00, 0.66, 0.22]
}
```
Bonen ger **riktning** — det är den som löser "ärm pekar inåt fast armen pekar utåt": ärmen genereras/fitas längs `shoulder→elbow→wrist`-benet.

## Plagg-mallar (per typ)
Fält: `anchors` (noder plagget hängs på), `covers` (region), `sleeve` (följer arm-benet), `openCenter` (transparent mitt), `z` (lager), `sub` (deldelar t.ex. luva).

```json
{
  "tshirt":    { "anchors":["shoulderL","shoulderR","neckBase","waist"], "covers":"torso", "sleeve":"short", "openCenter":false, "z":4 },
  "hoodie":    { "anchors":["shoulderL","shoulderR","neckBase","waist"], "covers":"torso", "sleeve":"long",  "openCenter":false, "z":4,
                 "sub":{ "hood":{ "anchors":["neckBase","crown"], "z":-3, "mode":"behindHead" } } },
  "downjacket":{ "anchors":["shoulderL","shoulderR","neckBase","kneeL","kneeR"], "covers":"torsoToKnee", "sleeve":"long", "openCenter":true, "z":5 },
  "blazer":    { "anchors":["shoulderL","shoulderR","neckBase","hipL","hipR"], "covers":"torsoToHip", "sleeve":"long", "openCenter":true, "z":5 },
  "skirt":     { "anchors":["hipL","hipR","kneeL","kneeR"], "covers":"hipToKnee", "sleeve":"none", "openCenter":false, "z":2 },
  "pants":     { "anchors":["hipL","hipR","ankleL","ankleR"], "covers":"hipToAnkle", "sleeve":"none", "z":2 },
  "boots":     { "anchors":["kneeL","ankleL","toeL","kneeR","ankleR","toeR"], "covers":"calfToFoot", "z":6 },
  "ballerina": { "anchors":["ankleL","toeL","ankleR","toeR"], "covers":"foot", "z":6 },
  "hair":      { "anchors":["crown","hairline","faceCenter"], "covers":"hairRegion", "z":20 }
}
```
`openCenter:true` → motorn lämnar mittstrimman (mellan front-panelerna) transparent → underplagg syns, ingen ryggdel. Löser öppna rockar *by design*.

## Genererings-recept (per plagg)
1. Init = baskroppen (pose-lås via img2img/ControlNet-pose/Flux Kontext).
2. Prompt: "*[plagg], worn on the figure, front view, pure white fabric, the open front/neckline reveals only the plain background behind it, only front-facing surfaces, no back panel, no rear collar*".
3. Extrahera plagget (skymd baksida + nyckel). Sudd-reserv för kanter.
4. Ärvda noder → auto-fit; deklarera mall enligt ovan.

## Steg-plan (grindar)
- **0** Spec + baskropp ✅(spec) / välj baskropp
- **1** Pose-lås-bevis: t-shirt + öppen dunjacka + stövlar + skallig docka + 1 frisyr → *fitar auto? hår över krage?*
- **2** Extraktions-recept (skymd + nyckel + sudd)
- **3** Skala dockor (en kropp, utbytta ansikten, skalliga) + frisyr-bibliotek
- **4** Skala garderob (pose-låst)
- **5** Ny motor (nod-fit ersätter axel-ankare)
- **6** Polish-loop (QA på flera dockor + sudd-finlir)

Varje grind = stopp-möjlighet innan vi bränner tid på nästa steg. Suddgummit (v1) är reserv genom hela resan.

---

## NULÄGE 2026-07-19 — steg 1–2 BEVISADE, redo att skala

**Bevisat end-to-end** (se `atelje-v2/proof/v2-layer-demo.png` — docka påklädd v2-plagg, auto-fit utan justering, öppen jacka utan ryggdel, hår över krage):
- ✅ Pose-lås: Flux Kontext lägger plagg på baskroppen med perfekt fit.
- ✅ Extraktion: diff mot baskropp ger transparent plagg-lager; öppna plagg → transparent mitt (ingen ryggdel) automatiskt.
- ✅ Lager 1:1: plagg genererade på samma baskropp ligger i samma ram → ingen fit-matematik för samma kropp.
- ✅ Hår som topplager (diff docka-med-hår vs skallig docka → hår-lager).

**Durabla filer (i repot, överlever clear):**
- `atelje-v2/bodies/` — **baseB-canonical.png** (VALD baskropp), baseExtract-magenta.png (för extraktion), baseBald.png (docka-kropp), baseA/C/D (ratade).
- `atelje-v2/proof/` — extraherade plagg (tshirt/jacket/boots/hair), demo, exempel-plagg-på-kropp.
- `atelje-v2/tools/` — `kontext.mjs` (Flux Kontext-edit), `diff-extract.mjs` (diff-extraktion), `gen-basebody.mjs`, `gen-poselock-test.mjs`. **OBS: sökvägen `S=...scratchpad` i varje verktyg måste bytas till nya sessionens scratchpad.**

**Pipeline per plagg (verifierad):**
1. `node kontext.mjs <baseExtract.png> <ut.png> "<prompt>"` — lägg plagg på magenta-baskroppen.
2. `node diff-extract.mjs <baseExtract.png> <plagg-på-kropp.png> <ut.png> <tröskel~70-90>` — extrahera.
3. Maska till plaggets nod-region (rensar artefakter). Lager 1:1 på dockan.

**KRITISKA LÄRDOMAR:**
- **Innehållsfilter (Kontext):** "dress this girl / bodysuit / magenta / dress" → SVART blockerad bild. Använd "**add [garment] onto this cartoon paper-doll toy figure, keep exact pose**". Håll språket plagg-additivt, aldrig kropps-/barn-fokuserat.
- **Prompta plagg som "white fabric"** → recolor funkar + skarp diff-kontrast (jackan kom beige = låg kontrast → bleka stövlar).
- **Kontext-DRIFT:** varje edit driver kroppen någon pixel → baseB/baseExtract/baseBald är ~samma men ej pixel-identiska. **Steg 3 måste lösa detta** (inpaint-only-edit el. fixerad referens) så alla 10 dockor + garderoben delar EXAKT kropp.

## GRIND 3.1 GRÖN 2026-07-19 — baskropps-låset LÖST (drift knäckt)

**Bevisat** (se `atelje-v2/proof/drift-lock-dressed.png` + `drift-lock-faces.png`):
- Genererade 2 olika ansikten via Kontext på `baseBald` (grön/fräknig vs blå/flinande).
- Mätte kropps-ankare (huvudtopp / mittlinje / kroppshöjd) på canon + båda → **drift här ≈ 0** (headTop identisk 53px, cx <1px isär, height identisk 1338). Kontext är MYCKET stabilare för ansiktsbyte än befarat.
- **Princip som dödar drift:** kroppen är EN fil (`baseBald`), regenereras ALDRIG. Ansikte + hår + plagg är LAGER mot den. Ansikte läggs som fjädrad ellips (centrum ~0.50W, headTop+0.105H; radie 0.135W×0.085H) → ren söm, hudton matchar (samma bas).
- **Align-primitiv byggd som försäkring:** `align-proof.mjs` → `anchors(imgData)` (headTop/footBot/height/cx via bg-diff>60) + `register(img)` (skala+translatera driftad output tillbaka till canon-ramen). Nära-identitet nu, men essentiell om ett framtida plagg driftar mer.
- **SAMMA extraherade t-shirt satt på båda dockorna → identiskt fit** (delar byte-identisk kropp). Spärren är knäckt: ett plagg fitar alla dockor utan pillande.
- Öppet finlir: extraherad t-shirt har svag ljus kant-halo (höj tröskel/sudda kanter i extraktionen).

**Nya durabla filer:** `atelje-v2/proof/drift-lock-{dressed,faces}.png`, `atelje-v2/proof/face{A,B}-full.png`, `atelje-v2/tools/align-proof.mjs`.

**⚠️ GIT:** `atelje-v2/` + `ATELJE-V2-SPEC.md` är fortf. UNTRACKED (`??`) i carlpalmquistdotcom. Överlever clear men ej checkout/städning. Commit lokalt (utan push — WIP-kroppar ska ej till publika sajten) väntar på Calles ok.

**NÄSTA (steg 3, forts. — GATEA med Calle innan Kontext-credits bränns):**
1. ~~Lös baskropps-låset~~ ✅ KLAR (grind 3.1).
2. Definiera dock-rostern (hur många, vilka ansikts-/hår-varianter — Calle väljer) → regenerera dockor (en kropp, utbytta ansikten via ellips-lager, skalliga) + frisyr-bibliotek.
3. Regenerera garderob pose-låst (vitt tyg) mot `baseBald`/`baseExtract`.
4. Bygg nod-fit-motor + plagg-mallar i spelet (ersätt axel-ankare). Mät in noderna på `baseBald` (JSON ovan = PLACEHOLDER).
