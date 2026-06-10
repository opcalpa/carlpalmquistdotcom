// Concept Forge — symbol-ikoner till det kodade reel-gridet (Nivå 2)
// POST /api/symbols  { symbols: [{label, prompt}] }  ->  { symbols: [{label, url}] }
//
// Flux 1.1 Pro (fal.ai) genererar ENSKILDA temats hög-symboler parallellt. Enskilda ikoner triggar
// varken gambling- eller våldsfiltret (till skillnad från en hel slot-skärm → svart). UI:t bygger
// rutnätet i HTML/CSS och droppar in dessa ikoner = stabil struktur, varierat skinn varje gång.
// Allt icke-fällande: en symbol som faller bort hoppas bara över.

// Wrappar konceptets korta motiv-prompt till en ren, isolerad ikon (inget rutnät, ingen UI, ingen text).
function iconPrompt(p) {
  const base = String(p || "slot symbol").slice(0, 240);
  return `${base}. Single centered video-game slot symbol icon, one subject only, bold comic graphic-novel style, thick black ink linework, halftone shading, vibrant high-contrast colors, glossy game-ready emblem, isolated on a plain dark background, no grid, no UI, no buttons, no text, no letters, no numbers, no real brands, no copyrighted characters`.slice(0, 720);
}

// Symbol-ikonerna går via Flux schnell (fal.ai) — ~10x billigare än flux-pro och fullt nog för små
// cell-ikoner (key-arten behåller flux-pro där kvaliteten syns). Black-frame-retry behålls: safety kan
// returnera en liten helt svart bild; en riktig ikon är större. Vi detekterar via faktiska bytes.
async function fluxIcon(prompt, falKey) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch("https://fal.run/fal-ai/flux/schnell", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Key ${falKey}` },
      body: JSON.stringify({ prompt: iconPrompt(prompt), image_size: "square", num_images: 1, num_inference_steps: 4, seed: Math.floor(Math.random() * 1e9) }),
    });
    if (!res.ok) throw new Error(`fal ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const d = await res.json();
    const url = d.images && d.images[0] && d.images[0].url;
    if (!url) throw new Error("fal: no url");
    try {
      const len = (await (await fetch(url, { cache: "no-store" })).arrayBuffer()).byteLength;
      if (len >= 14000) return url;   // riktig ikon (schnell-bilder är mindre än flux-pro)
      // annars svart safety-frame → ny seed
    } catch (e) { return url; }       // kunde ej verifiera → anta ok
  }
  return null;                        // alla försök svarta → hoppas över
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const falKey = env.FLUX_API_KEY;
  let body = {};
  try { body = await request.json(); } catch {}
  const symsIn = Array.isArray(body.symbols) ? body.symbols.slice(0, 3) : [];

  if (!falKey) return Response.json({ symbols: [], note: "no_flux_key" });
  if (!symsIn.length) return Response.json({ symbols: [] });

  const results = await Promise.allSettled(
    symsIn.map((s) => fluxIcon(s.prompt || s.label || "slot symbol icon", falKey))
  );
  const symbols = symsIn
    .map((s, i) => ({ label: s.label || `Symbol ${i + 1}`, url: results[i].status === "fulfilled" ? results[i].value : null }))
    .filter((x) => x.url);

  const errors = results.filter((r) => r.status === "rejected").map((r) => String(r.reason).slice(0, 160));
  const creditsOut = errors.some(isCreditsErr);
  const out = { symbols, engine: "Flux schnell (fal.ai)" };
  if (errors.length) out.errors = errors;
  if (creditsOut) { out.creditsOut = true; out.feature = "symbols"; }
  return Response.json(out);
}
const isCreditsErr = (t) => /\b(40[26])\b|exhaust\w*|insufficient|quota|credit balance|out of credits|top ?up|payment required|billing|not enough|balance/i.test(String(t || ""));
