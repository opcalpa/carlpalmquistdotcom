// Concept Forge — SFX-endpoint (fas 2a, snabb)
// POST /api/audio  { sfx: [{label, prompt}] }  ->  { sfx: [{label, url}] }
//
// Korta SFX via ElevenLabs Sound Generation (funkar på gratis-tier). Soundtracket hanteras
// separat i /api/soundtrack (Suno, async). Allt icke-fällande.

function abToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}

async function elevenSfx(prompt, apiKey) {
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
    body: JSON.stringify({ text: prompt.slice(0, 450), duration_seconds: 3, prompt_influence: 0.45 }),
  });
  if (!res.ok) throw new Error(`elevenlabs sfx ${res.status}: ${(await res.text()).slice(0, 180)}`);
  const buf = await res.arrayBuffer();
  return "data:audio/mpeg;base64," + abToBase64(buf);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const elevenKey = env.ELEVENLABS_API_KEY;
  let body = {};
  try { body = await request.json(); } catch {}
  const sfxIn = Array.isArray(body.sfx) ? body.sfx.slice(0, 3) : [];

  if (!elevenKey) return Response.json({ sfx: [], note: "no_eleven_key" });

  const results = await Promise.allSettled(
    sfxIn.map((s) => elevenSfx(s.prompt || s.label || "slot sound effect", elevenKey))
  );
  const sfx = sfxIn
    .map((s, i) => ({ label: s.label || `SFX ${i + 1}`, url: results[i].status === "fulfilled" ? results[i].value : null }))
    .filter((x) => x.url);

  const errors = results.filter((r) => r.status === "rejected").map((r) => String(r.reason).slice(0, 160));
  return Response.json(errors.length ? { sfx, errors } : { sfx });
}
