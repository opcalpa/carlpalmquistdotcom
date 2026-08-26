# Astro-fällor i det här repot

Saker som kostat tid och som inte syns i felmeddelanden. Håll listan kort — bara sådant
som faktiskt bränt oss.

---

## `<style>` når aldrig JS-renderat innehåll (scoped styles)

**Symptom:** sidan har rätt bakgrund och rätt typsnitt, men allt innehåll är oformaterat.
Det ser ut som en trasig CSS-regel, inte som ett systemfel — och det är just därför det är
lömskt.

**Orsak:** Astro skriver om varje selektor i en `<style>`-tagg till
`.row[data-astro-cid-xxxx]` och sätter attributet **bara på element som finns i
`.astro`-mallen**. En sida som bygger sitt innehåll i klienten med `innerHTML` får aldrig
attributet på de elementen, så noll regler träffar dem. Det statiska skalet (`body`,
en inloggningsgrind) ser rätt ut, vilket döljer felet.

**Fix:** helsides-`.astro` som ritar sitt eget innehåll i klienten ska ha
`<style is:global>`.

**Verifiera i BYGGET, inte i källan** — källan ser likadan ut i båda fallen:

```sh
npx astro build
CSS=$(grep -o '/_astro/[^"]*\.css' dist/v/<sida>/index.html | head -1)
grep -o '\.row{' "dist$CSS"          # ska ge en träff (oscopad)
grep -c 'data-astro-cid' "dist$CSS"  # ska vara 0
```

**Drabbade sidor (ritar innehåll i klienten):** `/v/fest40`, `/v/maria`.

*Hittad 2026-08-26. `/v/fest40` låg live helt oformaterad sedan lanseringen —
ingen märkte det, för grinden framför såg rätt ut.*
