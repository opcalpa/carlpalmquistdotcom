// Concept Forge — re-rolla moodboard-bilden
// POST /api/image  { prompt }  ->  { url, engine }
// Flux 1.1 Pro (fal.ai) primär, dall-e-3 reserv. Ny bild varje gång (stokastiskt).

async function fluxImage(prompt, falKey) {
  // Flux safety-filter returnerar ibland en HELT SVART bild (~10-20KB) när en prompt triggar.
  // En riktig bild är >100KB. Vi detekterar den lilla svarta framen via Content-Length och regenererar.
  let lastUrl = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch("https://fal.run/fal-ai/flux-pro/v1.1", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Key ${falKey}` },
      body: JSON.stringify({ prompt: prompt.slice(0, 1800), image_size: "square_hd", num_images: 1, seed: Math.floor(Math.random() * 1e9) }),
    });
    if (!res.ok) throw new Error(`fal ${res.status}`);
    const d = await res.json();
    const url = d.images && d.images[0] && d.images[0].url;
    if (!url) throw new Error("fal: no url");
    try {
      const len = (await (await fetch(url, { cache: "no-store" })).arrayBuffer()).byteLength;   // faktiska bytes
      if (len >= 30000) return url;   // riktig bild
      // annars: safety-svart frame → försök igen med ny seed, returnera ALDRIG en svart url
    } catch (e) { return url; }   // kunde ej verifiera → anta ok
  }
  return null;   // alla försök blev svarta → signalera blockerad (klienten hoppar över, ingen svart ruta)
}

async function dalleImage(prompt, apiKey) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "dall-e-3", prompt: prompt.slice(0, 3900), n: 1, size: "1024x1024", quality: "standard" }),
  });
  if (!res.ok) throw new Error(`openai image ${res.status}`);
  const d = await res.json();
  return d.data[0].url;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body = {};
  try { body = await request.json(); } catch {}
  const prompt = (body.prompt || "").toString();
  if (!prompt) return Response.json({ error: "no prompt" });
  const falKey = env.FLUX_API_KEY;
  const openaiKey = env.OPENAI_API_KEY;
  if (falKey) { try { const u = await fluxImage(prompt, falKey); if (u) return Response.json({ url: u, engine: "Flux 1.1 Pro (fal.ai)" }); } catch (e) {} }
  if (openaiKey) { try { return Response.json({ url: await dalleImage(prompt, openaiKey), engine: "dall-e-3" }); } catch (e) {} }
  return Response.json({ error: "image blocked or failed — try a less edgy theme or re-roll" });
}
