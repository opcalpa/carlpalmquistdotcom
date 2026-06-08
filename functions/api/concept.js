// Concept Forge — Cloudflare Pages Function
// POST /api/concept  { theme: string }  ->  { concept JSON, image_url, sfx_url }
//
// Multi-model pipeline, rätt modell per steg:
//   • Claude (claude-sonnet-4-6) skriver konceptet
//   • Flux 1.1 Pro (fal.ai) målar moodboarden, dall-e-3 som reserv
//   • ElevenLabs genererar ett bonus-trigger-ljud
// Nycklar ligger som Cloudflare-secrets, aldrig i klienten. Allt degraderar mjukt: saknad
// nyckel eller API-strul fäller aldrig hela svaret, och utan text-nyckel visas ett kurerat
// exempel så demon alltid funkar.

const SYSTEM_PROMPT = `Du är en senior game concept director på en slot-studio i världsklass, i samma anda som Hacksaw Gaming.

Husstil att alltid följa:
- Bold, graphic-novel-estetik. Clean linework, starka färgpaletter, dark humor. Allt från gritty western till neondränkt cyberpunk. Street art / urban / popkulturell attityd.
- Mobile-first, vertikalt spel. Hög volatilitet och stora max-win-multiplar är typiskt.
- Signaturmekaniker att utgå från eller variera: xNudge wilds, Sticky Multipliers, instant-win-loop, free spins med eskalerande bonus.
- Musik och ljud är en IDENTITETSPELARE, inte en eftertanke: custom soundtrack som intensifieras i bonusrundor, släpps som riktig musik. Var specifik om genre, instrumentering, BPM och hur ljudbilden skiftar mellan base game och bonus.
- Ton: självsäker, lekfull, lite respektlös. Aldrig generisk.

Du får ett TEMA. Svara med ETT spelkoncept som STRIKT JSON, inga kommentarer, exakt dessa fält:
{
  "names": [3-5 korta, slagkraftiga spelnamn-kandidater, gärna ordvitsar],
  "logline": "en mening som säljer fantasin",
  "art": { "style": "", "palette": "", "hero_characters": "", "mood": "" },
  "mechanic": { "base_game": "", "signature_feature": "", "bonus_round": "" },
  "math": { "volatility": "", "suggested_max_win": "" },
  "music": { "genre": "", "instrumentation": "", "base_vs_bonus": "", "bpm": "", "reference_vibe": "" },
  "hooks": [3 korta TikTok/social-vinklar för lansering],
  "image_prompt": "en engelsk prompt för key-art moodboard: graphic-novel slot key visual, ingen text, inga riktiga varumärken/IP, dramatisk komposition",
  "sfx_prompt": "en kort engelsk prompt för ett bonus-trigger-ljud: punchy slot win/bonus stinger som matchar temat"
}
Skriv art, mechanic, music, hooks och prompts på engelska (branschspråk). names och logline får gärna ha glimten i ögat.`;

const FALLBACK = {
  demo: true,
  theme: "neon yakuza synthwave heist",
  names: ["Neon Oyabun", "Saint Tokyo", "88 Blades", "Chrome Dragon"],
  logline: "Rob the syndicate's vault under a bleeding neon skyline — if the Blood Moon spins your way.",
  art: {
    style: "Bold graphic-novel linework, cel-shaded, heavy ink shadows",
    palette: "Hot magenta, electric cyan, chrome silver, deep midnight blue, blood red accents",
    hero_characters: "A tattooed oyabun in a chrome kimono, a masked getaway driver, a neon koi guardian",
    mood: "Rain-slick Tokyo backstreets, glowing signage, tension and swagger",
  },
  mechanic: {
    base_game: "5x5 grid, cluster pays with xNudge wilds that push full reels",
    signature_feature: "Sticky Multiplier blades that lock and climb x2 → x88",
    bonus_round: "'Blood Moon Heist' free spins: every vault cracked raises the global multiplier",
  },
  math: { volatility: "High", suggested_max_win: "15,000x" },
  music: {
    genre: "Dark synthwave with taiko percussion",
    instrumentation: "Analog bass synth, shamisen plucks, 808s, cinematic taiko in the bonus",
    base_vs_bonus: "Brooding pulse in base game; full drop with driving taiko + arpeggios when Blood Moon triggers",
    bpm: "Base 92 BPM, bonus 110 BPM",
    reference_vibe: "Kavinsky meets a Kurosawa duel — release-worthy as a standalone track",
  },
  hooks: [
    "POV: the Blood Moon hits and every blade on screen starts climbing",
    "We made the soundtrack first and built the game around the drop",
    "15,000x or nothing — the syndicate doesn't do small wins",
  ],
  image_prompt:
    "Graphic-novel key art, neon yakuza synthwave heist, rain-slick Tokyo backstreet at night, tattooed crime boss in a chrome kimono, glowing magenta and cyan signage, bold ink linework, cinematic dramatic composition, slot game key visual, no text, no real brands",
  sfx_prompt: "Punchy slot bonus-trigger stinger, neon synthwave, rising tension into an impactful win chime",
  image_url: null,
  sfx_url: null,
};

function extractJson(text) {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("no json in response");
  return JSON.parse(text.slice(s, e + 1));
}

function abToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

// ---- Text: Claude (prefill "{" tvingar rent JSON) ----
async function generateConceptClaude(theme, apiKey) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      temperature: 1,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: `Tema: ${theme}` },
        { role: "assistant", content: "{" },
      ],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const concept = extractJson("{" + data.content[0].text);
  concept.theme = theme;
  concept.engine = "Claude (claude-sonnet-4-6)";
  return concept;
}

// ---- Text: OpenAI fallback ----
async function generateConceptOpenAI(theme, apiKey) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.95,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Tema: ${theme}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`openai chat ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const concept = JSON.parse(data.choices[0].message.content);
  concept.theme = theme;
  concept.engine = "OpenAI (gpt-4o)";
  return concept;
}

// ---- Bild: Flux 1.1 Pro via fal.ai (synkront) ----
async function fluxImage(prompt, falKey) {
  const res = await fetch("https://fal.run/fal-ai/flux-pro/v1.1", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${falKey}` },
    body: JSON.stringify({ prompt: prompt.slice(0, 1800), image_size: "square_hd", num_images: 1 }),
  });
  if (!res.ok) throw new Error(`fal ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const url = data.images && data.images[0] && data.images[0].url;
  if (!url) throw new Error("fal: no image url");
  return url;
}

// ---- Bild: dall-e-3 fallback ----
async function dalleImage(prompt, apiKey) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "dall-e-3", prompt: prompt.slice(0, 3900), n: 1, size: "1024x1024", quality: "standard" }),
  });
  if (!res.ok) throw new Error(`openai image ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.data[0].url;
}

// ---- Ljud: ElevenLabs SFX -> data-URI ----
async function elevenSfx(prompt, apiKey) {
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
    body: JSON.stringify({ text: prompt.slice(0, 450), duration_seconds: 4, prompt_influence: 0.4 }),
  });
  if (!res.ok) throw new Error(`elevenlabs ${res.status}: ${await res.text()}`);
  const buf = await res.arrayBuffer();
  return "data:audio/mpeg;base64," + abToBase64(buf);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let theme = "";
  try {
    const body = await request.json();
    theme = (body.theme || "").toString().trim().slice(0, 160);
  } catch {}
  if (!theme) theme = FALLBACK.theme;

  // Tolerant mot felstavad secret (ANTROPHIC_API_KEY).
  const anthropicKey = env.ANTHROPIC_API_KEY || env.ANTROPHIC_API_KEY;
  const openaiKey = env.OPENAI_API_KEY;
  const falKey = env.FLUX_API_KEY;
  const elevenKey = env.ELEVENLABS_API_KEY;

  if (!anthropicKey && !openaiKey) {
    return Response.json({ ...FALLBACK, theme, note: "no_api_key" });
  }

  try {
    const concept = anthropicKey
      ? await generateConceptClaude(theme, anthropicKey)
      : await generateConceptOpenAI(theme, openaiKey);

    const imgPrompt = concept.image_prompt || theme;
    const sfxPrompt = concept.sfx_prompt || `${theme} slot bonus-trigger stinger, punchy win chime`;

    // Bild + ljud parallellt, var för sig icke-fällande.
    const [img, sfx] = await Promise.allSettled([
      (async () => {
        if (falKey) {
          try { return { url: await fluxImage(imgPrompt, falKey), engine: "Flux 1.1 Pro (fal.ai)" }; } catch (e) {}
        }
        if (openaiKey) return { url: await dalleImage(imgPrompt, openaiKey), engine: "dall-e-3" };
        return null;
      })(),
      (async () => (elevenKey ? await elevenSfx(sfxPrompt, elevenKey) : null))(),
    ]);

    if (img.status === "fulfilled" && img.value) {
      concept.image_url = img.value.url;
      concept.engine_image = img.value.engine;
    } else {
      concept.image_url = null;
    }
    concept.sfx_url = sfx.status === "fulfilled" ? sfx.value : null;
    if (concept.sfx_url) concept.engine_audio = "ElevenLabs";

    return Response.json(concept);
  } catch (e) {
    return Response.json({ ...FALLBACK, theme, note: "fallback", error: String(e).slice(0, 200) });
  }
}
