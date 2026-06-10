// Concept Forge — Cloudflare Pages Function
// POST /api/concept  { theme: string }  ->  concept JSON (incl. sfx[] + soundtrack_prompt) + image_url
//
// Snabb fas 1: Claude skriver konceptet, Flux 1.1 Pro (fal.ai) målar moodboarden (dall-e-3 reserv).
// Ljudet (mini-soundtrack + SFX) genereras i ett separat anrop /api/audio så första paint blir snabb.
// Nycklar ligger som Cloudflare-secrets. Allt degraderar mjukt; utan text-nyckel visas ett kurerat exempel.

const SYSTEM_PROMPT = `Du är en senior game concept director på en slot-studio i världsklass, i samma anda som Hacksaw Gaming.

Husstil att alltid följa:
- Bold graphic-novel-estetik med tjock handritad linework. Stilen ligger på EN av två poler (välj en och håll den konsekvent): (a) mörkt/gritty/neon/manga (skräck, western, cyberpunk) eller (b) färgglatt cartoon (lekfullt, arkad, mytiskt). Dark humour, street-art/popkulturell attityd.
- En stor illustrerad maskot/karaktär står vid sidan av hjulen (signatur-komposition). Låg-symboler = A/K/Q/J/10 reskinnade efter temat; hög-symboler = 3-4 tematiska emblem som berättar storyn.
- Mobile-first, vertikalt spel. Hög volatilitet; headline-max-win runt 10 000x är typiskt. Ge spelet ETT lekfullt pun-namngivet signature-feature och en "EPIC BONUS"-känsla.
- Signaturmekaniker att utgå från eller variera (Hacksaws EGNA — aldrig Nolimit Citys xNudge/xWays/xBomb): DuelReels (VS-symbol expanderar en hel rulle till wild med multiplikator x2-x100), FeatureSpins, Bonus Buy, Hackways (egen ways-motor), Flash Frames (sticky vinst-ramar som avslöjar nya symboler i en cascade), expanderande multiplikator-wilds, free spins med eskalerande bonus.
- Musik och ljud: ALLT instrumentalt, tema-matchat, lagom energiskt eller avslappnat beroende på det visuella ("Cartoon Network-nivå" men aldrig störigt). Lekfulla, attention-grabbing klassiska mobilspel-SFX (pling, swish) för snurr och vinst. Soundtracket intensifieras i bonus. Var specifik om genre, instrumentering, BPM och hur ljudbilden skiftar mellan base game och bonus.
- Ton: självsäker, lekfull, lite respektlös. Aldrig generisk.

Du får ett TEMA. Svara med ENBART giltig JSON enligt schemat. Ingen text före eller efter, inga kodblock-markörer.
{
  "names": [3-5 korta, slagkraftiga spelnamn-kandidater, gärna ordvitsar],
  "logline": "en mening som säljer fantasin",
  "feature_name": "lekfullt, punnigt namn på spelets signature-feature i Hacksaw-anda (t.ex. Flash Frames, Sun Rays, DuelReels)",
  "art": { "style": "", "palette": "", "hero_characters": "", "mood": "" },
  "mechanic": { "grid": "rutnät, t.ex. 6x5 eller 7x7", "type": "EXAKT en av: ways / cluster pays / cascade-tumble / paylines", "base_game": "", "signature_feature": "vad feature_name gör mekaniskt", "bonus_round": "", "bonus_buy": "pris att köpa bonusen i x insats, t.ex. 100x" },
  "math": { "volatility": "Low / Medium / High / Very High", "rtp": "t.ex. 96.0%", "suggested_max_win": "t.ex. 10,000x" },
  "music": { "genre": "", "instrumentation": "", "base_vs_bonus": "", "bpm": "", "reference_vibe": "" },
  "feature_intro": ["3 korta one-liners i Hacksaws onboarding-kort-stil: index 0 = kärnmekanik, index 1 = bonus, index 2 = 'MAX WIN [tal]x ...'"],
  "hooks": [3 korta TikTok/social-vinklar för lansering],
  "image_prompt": "engelsk prompt för key-art i graphic-novel-stil, slot key visual, ingen text, inga riktiga varumärken/IP. KOMPOSITION (viktig, Hacksaw-stil): placera huvudkaraktären i HÖGRA tredjedelen, helkropp, dynamisk pose, vänd inåt mot mitten; rik atmosfärisk miljö med djup; håll MITTEN-VÄNSTER lugnare, mörkare och mindre detaljrik (där läggs ett spel-rutnät som overlay) och lämna luft upptill för en titel",
  "motion_prompt": "engelsk prompt för en subtil, loopande idle-animation SKRÄDDARSYDD för key-art:ens karaktär och miljö (image-to-video): vad huvudkaraktären gör PÅ STÄLLET (t.ex. gungar lätt, andas, ändrar min en aning, vinkar, litet dansryck, vingar/cape fladdrar) plus vad i bakgrunden som rör sig (tyg/hår/löv i vinden, moln, fåglar, regn, glimr, gnistor). Karaktären stannar på samma plats och behåller sin identitet, ingen kamerarörelse, seamless loop. Var konkret om DENNA bilds motiv",
  "soundtrack_prompt": "engelsk prompt för ett ~25 sek instrumentalt base-game-soundtrack som matchar musik-briefen, ange genre/instrument/tempo/känsla",
  "sfx": [
    { "label": "Reel spin", "prompt": "engelsk prompt för ett kort spin/reel-ljud i temats stil" },
    { "label": "Bonus trigger", "prompt": "engelsk prompt för ett bonus-trigger-stinger" },
    { "label": "Big win", "prompt": "engelsk prompt för ett big win-jubel-ljud" }
  ],
  "symbols": [
    3 st temats HÖG-symboler (de berättar storyn) — varje { "label": "1-2 ord, t.ex. 'Fox Mask'", "prompt": "engelsk prompt för EN ensam ikon (rävmask, katana, dryck osv), inget rutnät, ingen UI, ingen text/bokstäver, isolerad mot mörk bakgrund" }
  ]
}
Symbolerna ska vara konkreta FÖREMÅL/karaktärsemblem (inte A/K/Q/J/10 — dem renderar UI:t själv). Håll varje symbol-prompt kort och fokuserad på ETT motiv.
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
    "Graphic-novel slot key art, neon yakuza synthwave heist: a tattooed crime boss in a chrome kimono stands full-body on the RIGHT side in a dynamic pose, facing left toward the center; rain-slick Tokyo backstreet with glowing magenta and cyan signage and deep atmospheric perspective; the center-left is calmer and darker to leave room for a reel-grid overlay, headroom at the top; bold ink linework, cinematic, no text, no real brands",
  motion_prompt:
    "The oyabun shifts his weight and breathes slowly, his chrome kimono and the hanging neon banners ripple in a faint breeze, light rain streaks fall, puddle reflections shimmer, distant signage flickers and a few embers drift upward; he stays in the same spot in his exact pose and identity, no camera move, seamless loop",
  soundtrack_prompt:
    "25-second instrumental dark synthwave with taiko percussion, brooding analog bass and shamisen plucks, cinematic and tense, slot base-game loop, 92 BPM",
  sfx: [
    { label: "Reel spin", prompt: "Short synthwave slot reel spin whoosh, neon, crisp" },
    { label: "Bonus trigger", prompt: "Punchy bonus-trigger stinger, rising taiko hit into a chime" },
    { label: "Big win", prompt: "Triumphant big-win flourish, synth arpeggio and impact" },
  ],
  symbols: [
    { label: "Oyabun", prompt: "tattooed crime boss in a chrome kimono, bust portrait emblem" },
    { label: "Neon Koi", prompt: "glowing neon koi fish guardian, electric cyan" },
    { label: "Chrome Blade", prompt: "crossed chrome katana blades, magenta glint" },
  ],
  image_url: null,
};

// --- Per-IP rate limit (bara på publika domänen; preview/lokalt obegränsat) ---
const RL_CAP = 10, RL_WINDOW = 86400;   // 10 nya forges per IP per dygn (höjt för team-demo / delad kontors-IP)
const rlNs = (env) => env.KV_NAMESPACE_ID || env.KV_NAMSPACE_ID;
const rlReady = (env) => env.CF_ACCOUNT_ID && rlNs(env) && env.CF_API_TOKEN;
const rlBase = (env) => `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/storage/kv/namespaces/${rlNs(env)}`;
async function rlGet(env, key) {
  try { const r = await fetch(`${rlBase(env)}/values/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` } }); if (!r.ok) return null; return await r.text(); } catch { return null; }
}
async function rlPut(env, key, val, ttl) {
  try { await fetch(`${rlBase(env)}/values/${encodeURIComponent(key)}?expiration_ttl=${ttl}`, { method: "PUT", headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` }, body: val }); } catch {}
}

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
          max_tokens: 4000,
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

  // Rate limit: bara på publika domänen (hostname-koll), så preview/lokalt är obegränsat för Carl.
  const host = (() => { try { return new URL(request.url).hostname; } catch { return ""; } })();
  const limited = (host === "carlpalmquist.com" || host === "www.carlpalmquist.com") && rlReady(env);
  let rlKey = null, rlCount = 0;
  if (limited) {
    const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for") || "unknown";
    rlKey = "forge:rl:" + ip;
    const raw = await rlGet(env, rlKey);
    rlCount = raw ? (parseInt(raw, 10) || 0) : 0;
    if (rlCount >= RL_CAP) return Response.json({ note: "limit", limit: true, cap: RL_CAP, remaining: 0 });
  }

  try {
    const concept = anthropicKey
      ? await generateConceptClaude(theme, anthropicKey)
      : await generateConceptOpenAI(theme, openaiKey);

    // Räkna upp först när en forge faktiskt lyckats (misslyckade räknas ej).
    if (limited && rlKey) {
      await rlPut(env, rlKey, String(rlCount + 1), RL_WINDOW);
      concept.rate = { remaining: Math.max(0, RL_CAP - (rlCount + 1)), cap: RL_CAP };
    }

    // Bilden genereras separat via /api/image så texten kan visas direkt (progressive loading).
    return Response.json(concept);
  } catch (e) {
    // Nyckel finns men genereringen föll även efter retries → ärligt fel, inte ett orelaterat exempel.
    return Response.json({ note: "error", error: String(e).slice(0, 200) });
  }
}
