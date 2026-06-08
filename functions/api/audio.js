// Concept Forge — ljud-endpoint (fas 2)
// POST /api/audio  { soundtrack_prompt: string, sfx: [{label, prompt}] }
//   -> { soundtrack_url, soundtrack_engine, sfx: [{label, url}] }
//
// Mini-soundtrack: fal Stable Audio (samma fal-nyckel som Flux, redan finansierad), med
// ElevenLabs Music som reserv. SFX: ElevenLabs Sound Generation (funkar på gratis-tier).
// Allt parallellt, var för sig icke-fällande. Carls ES-edge i kod.

function abToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

// fal Stable Audio -> hostad URL
async function falMusic(prompt, falKey, seconds = 25) {
  const res = await fetch("https://fal.run/fal-ai/stable-audio", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${falKey}` },
    body: JSON.stringify({ prompt: prompt.slice(0, 1000), seconds_total: seconds }),
  });
  if (!res.ok) throw new Error(`fal audio ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const url = data.audio_file && data.audio_file.url;
  if (!url) throw new Error("fal audio: no url");
  return url;
}

// ElevenLabs Music (reserv, kräver betald plan) -> data-URI
async function elevenMusic(prompt, apiKey, ms = 25000) {
  const res = await fetch("https://api.elevenlabs.io/v1/music", {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
    body: JSON.stringify({ prompt: prompt.slice(0, 700), music_length_ms: ms }),
  });
  if (!res.ok) throw new Error(`eleven music ${res.status}: ${await res.text()}`);
  const buf = await res.arrayBuffer();
  return "data:audio/mpeg;base64," + abToBase64(buf);
}

// ElevenLabs SFX -> data-URI
async function elevenSfx(prompt, apiKey) {
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
    body: JSON.stringify({ text: prompt.slice(0, 450), duration_seconds: 3, prompt_influence: 0.45 }),
  });
  if (!res.ok) throw new Error(`elevenlabs sfx ${res.status}: ${await res.text()}`);
  const buf = await res.arrayBuffer();
  return "data:audio/mpeg;base64," + abToBase64(buf);
}

async function makeSoundtrack(prompt, falKey, elevenKey) {
  let err = "";
  if (falKey) {
    try { return { url: await falMusic(prompt, falKey), engine: "Stable Audio (fal.ai)" }; }
    catch (e) { err += "fal: " + String(e).slice(0, 250); }
  }
  if (elevenKey) {
    try { return { url: await elevenMusic(prompt, elevenKey), engine: "ElevenLabs Music" }; }
    catch (e) { err += " || eleven: " + String(e).slice(0, 250); }
  }
  return { url: null, engine: null, error: err || "no music provider" };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const elevenKey = env.ELEVENLABS_API_KEY;
  const falKey = env.FLUX_API_KEY;

  let body = {};
  try { body = await request.json(); } catch {}
  const soundtrackPrompt = (body.soundtrack_prompt || "").toString();
  const sfxIn = Array.isArray(body.sfx) ? body.sfx.slice(0, 3) : [];

  const [music, ...sfxResults] = await Promise.allSettled([
    soundtrackPrompt ? makeSoundtrack(soundtrackPrompt, falKey, elevenKey) : Promise.resolve({ url: null, engine: null }),
    ...sfxIn.map((s) => (elevenKey ? elevenSfx(s.prompt || s.label || "slot sound effect", elevenKey) : Promise.reject(new Error("no eleven key")))),
  ]);

  const m = music.status === "fulfilled" ? music.value : { url: null, engine: null, error: String(music.reason).slice(0, 250) };
  const sfx = sfxIn
    .map((s, i) => ({
      label: s.label || `SFX ${i + 1}`,
      url: sfxResults[i] && sfxResults[i].status === "fulfilled" ? sfxResults[i].value : null,
    }))
    .filter((x) => x.url);

  return Response.json({
    soundtrack_url: m.url,
    soundtrack_engine: m.engine,
    music_error: m.url ? undefined : m.error,
    sfx,
  });
}
