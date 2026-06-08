// Concept Forge — Cloudflare Pages Function
// POST /api/concept  { theme: string }  ->  concept JSON (incl. sfx[] + soundtrack_prompt) + image_url
//
// Snabb fas 1: Claude skriver konceptet, Flux 1.1 Pro (fal.ai) målar moodboarden (dall-e-3 reserv).
// Ljudet (mini-soundtrack + SFX) genereras i ett separat anrop /api/audio så första paint blir snabb.
// Nycklar ligger som Cloudflare-secrets. Allt degraderar mjukt; utan text-nyckel visas ett kurerat exempel.

const SYSTEM_PROMPT = `Du är en senior game concept director på en slot-studio i världsklass, i samma anda som Hacksaw Gaming.

Husstil att alltid följa:
- Bold, graphic-novel-estetik. Clean linework, starka färgpaletter, dark humor. Allt från gritty western till neondränkt cyberpunk. Street art / urban / popkulturell attityd.
- Mobile-first, vertikalt spel. Hög volatilitet och stora max-win-multiplar är typiskt.
- Signaturmekaniker att utgå från eller variera: xNudge wilds, Sticky Multipliers, instant-win-loop, free spins med eskalerande bonus.
- Musik och ljud är en IDENTITETSPELARE: custom soundtrack som intensifieras i bonusrundor, släpps som riktig musik. Var specifik om genre, instrumentering, BPM och hur ljudbilden skiftar mellan base game och bonus.
- Ton: självsäker, lekfull, lite respektlös. Aldrig generisk.

Du får ett TEMA. Svara med ENBART giltig JSON enligt schemat. Ingen text före eller efter, inga kodblock-markörer.
{
  "names": [3-5 korta, slagkraftiga spelnamn-kandidater, gärna ordvitsar],
  "logline": "en mening som säljer fantasin",
  "art": { "style": "", "palette": "", "hero_characters": "", "mood": "" },
  "mechanic": { "base_game": "", "signature_feature": "", "bonus_round": "" },
  "math": { "volatility": "", "suggested_max_win": "" },
  "music": { "genre": "", "instrumentation": "", "base_vs_bonus": "", "bpm": "", "reference_vibe": "" },
  "hooks": [3 korta TikTok/social-vinklar för lansering],
  "image_prompt": "engelsk prompt för key-art moodboard: graphic-novel slot key visual, ingen text, inga riktiga varumärken/IP, dramatisk komposition",
  "soundtrack_prompt": "engelsk prompt för ett ~25 sek instrumentalt base-game-soundtrack som matchar musik-briefen, ange genre/instrument/tempo/känsla",
  "sfx": [
    { "label": "Reel spin", "prompt": "engelsk prompt för ett kort spin/reel-ljud i temats stil" },
    { "label": "Bonus trigger", "prompt": "engelsk prompt för ett bonus-trigger-stinger" },
    { "label": "Big win", "prompt": "engelsk prompt för ett big win-jubel-ljud" }
  ]
}
Skriv art, mechanic, music, hooks och alla prompts på engelska (branschspråk). names och logline får gärna ha glimten i ögat.`;

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
  soundtrack_prompt:
    "25-second instrumental dark synthwave with taiko percussion, brooding analog bass and shamisen plucks, cinematic and tense, slot base-game loop, 92 BPM",
  sfx: [
    { label: "Reel spin", prompt: "Short synthwave slot reel spin whoosh, neon, crisp" },
    { label: "Bonus trigger", prompt: "Punchy bonus-trigger stinger, rising taiko hit into a chime" },
    { label: "Big win", prompt: "Triumphant big-win flourish, synth arpeggio and impact" },
  ],
  image_url: null,
};

function extractJson(text) {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("no json in response");
  return JSON.parse(text.slice(s, e + 1));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Claude med retry — överbelastning/timeout/parse-strul är transient, så vi försöker om.
async function generateConceptClaude(theme, apiKey) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1800,
          temperature: 1,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: `Tema: ${theme}\n\nSvara med ENBART giltig JSON enligt schemat. Ingen text före eller efter, inga kodblock-markörer.` }],
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        if ([429, 500, 502, 503, 529].includes(res.status) && attempt < 2) { lastErr = new Error(`anthropic ${res.status}`); await sleep(700 * (attempt + 1)); continue; }
        throw new Error(`anthropic ${res.status}: ${body}`);
      }
      const data = await res.json();
      const concept = extractJson(data.content[0].text);
      concept.theme = theme;
      concept.engine = "Claude (claude-sonnet-4-6)";
      return concept;
    } catch (e) {
      lastErr = e;
      if (attempt < 2) { await sleep(700 * (attempt + 1)); continue; }
      throw e;
    }
  }
  throw lastErr;
}

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

export async function onRequestPost(context) {
  const { request, env } = context;
  let theme = "";
  try {
    const body = await request.json();
    theme = (body.theme || "").toString().trim().slice(0, 160);
  } catch {}
  if (!theme) theme = FALLBACK.theme;

  const anthropicKey = env.ANTHROPIC_API_KEY || env.ANTROPHIC_API_KEY;
  const openaiKey = env.OPENAI_API_KEY;
  const falKey = env.FLUX_API_KEY;

  if (!anthropicKey && !openaiKey) {
    return Response.json({ ...FALLBACK, theme, note: "no_api_key" });
  }

  try {
    const concept = anthropicKey
      ? await generateConceptClaude(theme, anthropicKey)
      : await generateConceptOpenAI(theme, openaiKey);

    const imgPrompt = concept.image_prompt || theme;
    let imageErr = "";
    if (falKey) {
      try { concept.image_url = await fluxImage(imgPrompt, falKey); concept.engine_image = "Flux 1.1 Pro (fal.ai)"; }
      catch (e) { imageErr = "flux: " + String(e).slice(0, 300); }
    }
    if (!concept.image_url && openaiKey) {
      try { concept.image_url = await dalleImage(imgPrompt, openaiKey); concept.engine_image = "dall-e-3"; }
      catch (e) { imageErr += " || dalle: " + String(e).slice(0, 300); }
    }
    if (!concept.image_url) { concept.image_url = null; concept.image_error = imageErr || "no image provider"; }

    return Response.json(concept);
  } catch (e) {
    // Nyckel finns men genereringen föll även efter retries → ärligt fel, inte ett orelaterat exempel.
    return Response.json({ note: "error", error: String(e).slice(0, 200) });
  }
}
