# Hacksaw Design DNA — levande kunskapsbas för Concept Forge

> Matas av firsthand-demotestning + deep research. Varje spel vi spelar lägger till vokabulär här.
> De starkaste insikterna folkas in i /Users/calpa/Developer/carlpalmquistdotcom/functions/api/concept.js SYSTEM_PROMPT.
> Senast uppdaterad: 2026-06-08 (7 spel studerade firsthand).

## Kärntesen (firsthand-bevisad)
Hacksaws varumärke är INTE ett utseende. Det är ett **produktifierat, reskinbart system + en attityd** klädd i vilt varierande skinn.
- **Stabil struktur:** rutnät (cluster/cascade/ways dominerar), HUD (Buy Bonus, meny, saldo/win, bet-steppers, rund spinn-knapp, autoplay, H-logga uppe till höger), juicy win-presentation, mobil-först vertikalt.
- **Attityd:** irreverent, karaktärsledd, street-kultur, dark humour, lekfullt.
- **Varierande skinn:** konststilen spänner mellan två poler (se nedan).

## Det viktigaste mönstret: en reskinbar onboarding-pipeline
Tre spel (Wildwood Curse, Army of Ares, Superstar Sevens) delar EXAKT samma flow, bara omfärgat per tema:
1. **"HACKSAW GAMING PRESENTS [TITEL]"-splash** med graffiti/shard-logga + en horisontell loading-bar (film-affisch-känsla).
2. **Tre-korts feature-intro-karusell**, rigid mall: kort 1 = kärnmekanik, kort 2 = bonus/feature, kort 3 = **ALLTID "MAX WIN 10 000x"**. Plus guld-sunburst **"EPIC / HACKSAW EPIC BONUS"-badge** uppe till höger, en **5-bars VOLATILITY-mätare** (oftast maxad), och **"CLICK TO CONTINUE"** nederst.
Detta är en stark produkt-insikt: de har systematiserat onboarding till en mall som reskins per titel (crimson skräck, gyllene celestial, navy neon). Bra intervju-poäng: "ni har productifierat även intro-flödet, inte bara spelmotorn."

## De två polerna
- **Mörk/gritty/neon/manga:** Toshi Ways Club (hacker/CRT-manga), The Wildwood Curse (slasher-halftone, blodrött), Army of Ares (stormig krigs-comic-ink), Chaos Crew, Wanted Dead or a Wild. **Calles neon-yakuza-key-art ligger HÄR.**
- **Färgglad cartoon:** Le Football Fan (hooligan-cartoon), Sun Princess (strålande anime), Superstar Sevens (retro-arkad/Vegas-neon), Rise of Fortuna (pastell-mytisk, lutar ljust), RIP City.

## Återkommande layout-konventioner
- **Maskot/karaktär vid sidan av hjulen:** Rise of Fortunas sittande gudinna, Sun Princess anime-gudinna med trollstav, Army of Ares krigare (flankerad av arméer), Le Football Fans tvättbjörn. "Karaktär står bredvid rullarna" är en signatur-komposition.
- **Symbol-logik:** universella låg-symboler är **A/K/Q/J/10-brickor reskinnade per tema** (blod-droppande, ristad sten, cartoon-bevel). Hög-symboler är 3-4 **tematiska emblem som berättar temat** (ficklampa/kassettband/kniv/giftflaska; flamma/morgonstjärna/sköld-svärd/yxa; krona/diamant/flammande-7; lyra/hjul/nyckel/vete).
- **Max-win-ankare:** "10 000x" är rubrik-numret över flera titlar, en konsekvent marknadsförings-hook.
- **Per-titel pun-namngivna features:** Sun Rays + Sticky Wild Multipliers, Cursed Cluster + Triple Threat, Cascade Counter + Electric Trio + Max Voltage, Flash Frames + Swap Symbols. Varje spel får egna lekfulla feature-namn.
- **Jackpot-stege-UI** (Rise of Fortuna): ristad sten-tavla med fasta tiers MINI/MAJOR/MEGA/MAX WIN.
- **Top-of-reels "win x multiplier"-readout** (Superstar Sevens "0.00 x1") som surfar cascade-multiplikatorn ovanför hjulen.

## Hacksaws EGNA mekaniker (aldrig Nolimits xNudge/xWays/xBomb)
DuelReels (VS-symbol expanderar rulle till wild, x2-x100), FeatureSpins, Bonus Buy, Hackways (egen ways-motor), Flash Frames (sticky vinst-ramar + cascade), expanderande multiplikator-wilds, free spins med eskalerande bonus. Per-titel-features ovan byggs ovanpå dessa.

## Ljud-identitet (firsthand + research)
- **Allt instrumentalt.** Lagom energiskt ELLER avslappnat beroende på det visuella, alltid tema-matchat.
- **Lekfulla, attention-grabbing klassiska mobilspel-SFX:** pling, swish osv. för snurr/vinst.
- "Cartoon Network-nivå" på musiken, **väldigt typisk för visuellt/tema men aldrig direkt störig.**
- Mönster: **vågat/starkt tema, men ljudet hålls igenkännbart och bekvämt.** CasinoBeats brons Game Music 2020.

## Rörelse-/effekt-vokabulär (för att animera statisk key art till video)
Lager och pacing, det som faktiskt rör sig i deras spel:
- **Bakgrund (långsam loop):** parallax-drift av dimma/stormmoln/ljus-bloom, mjuk 2-4s loop, svag vinjett-puls.
- **Karaktär-idle (subtil):** andning, cape/hår som vajar, gnist-partiklar från trollstav, blink, vapen-glint.
- **Symbol-nivå (snabb, loopande):** flammor flimrar, blixtar bågar, blod rinner på bokstäver, ficklampe-stråle flimrar, ädelstens-glint.
- **Anticipation (build 1-2s):** glödande scatter/wild-puls med stigande strålar, kant-ljus, slow-mo, svag kamera-push-in.
- **Vinst (skarp, punchy):** Flash Frame (1-2 bildrutors full-screen-flash), symbol-pop, partikel-burst (mynt/gnistor), multiplikator-räknare som rullar upp, cascade-tumble.
- **Bonus/big-win (cinematisk):** kamera-push-in mot hjälte-silhuett, expanderande sunburst, full-screen-takeover, eskalerande glow + screen shake.
- **Pacing:** idle = långsam loop; anticipation = 1-2s build m. slow-mo; vinst = 0.3-0.5s punch + 1s firande; bonus = 2-3s cinematisk kamera. Komposit-ordning: bakgrund-drift → maskot-idle → symbol-glint → förgrunds-partiklar/flash vid event.

## Spel-loggbok (firsthand)
- **Toshi Ways Club** (mörk): manga + halftone, cream/svart/orange, hacker/CRT-grepp, Hackways 729, Flash Frames, Swap Symbols, vol 5/5, 10 000x.
- **Le Football Fan** (ljus): knallfärgad cartoon, lila/rosa solnedgång, hooligan/ultras-tema, tvättbjörns-maskot, 6x5, vuvuzela/scarf/öl/S-tickets-symboler.
- **Rise of Fortuna** (ljus-lutande mytisk): Greco-romersk, lavendel/guld, jackpot-stege (MAX £20 000), sittande gudinna, lyra/hjul/nyckel/vete-symboler.
- **The Wildwood Curse** (mörk): slasher-skräck, blodrött halftone, "presents"-splash + 3-korts-intro, Cursed Cluster + 4-wild + haunted multipliers, ficklampa/kassett/kniv/flaska-symboler, vol 5/5, 10 000x.
- **Sun Princess** (ljus): strålande anime, guld/teal/ädelstenar, Sun Rays + Sticky Wild Multipliers, 7x7 tumble, anime-gudinna med stav, 10 000x.
- **Army of Ares** (mörk): grekisk krigs-comic, charcoal/brons, krigar-maskot + flankerande arméer, sten-runor + flamma/morgonstjärna/sköld-symboler, ways m. tomma celler.
- **Superstar Sevens** (ljus): retro-arkad/Vegas-neon, navy/orange/magenta, Cascade Counter + Electric Trio + Max Voltage, flammande 7, top "win x mult"-readout, 5x4 cascade, 10 000x.

## Att testa härnäst (för full bredd)
- [ ] Wanted Dead or a Wild — se DuelReels live
- [ ] Ett scratchcard/instant-win — den andra produktkategorin (ej slot)
- [ ] Ett Pocketz-spel — deras mest extrema mobil-först
- [ ] En faktisk vinst/bonus-runda live — se Flash Frames/cascade/big-win i rörelse
