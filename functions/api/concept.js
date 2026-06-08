// Concept Forge — Cloudflare Pages Function
// POST /api/concept  { theme: string }  ->  { concept JSON, image_url }
//
// Genererar ett komplett slot-spelkoncept i Hacksaw-stil (namn, art direction, mekanik,
// musik/ljud-brief, marknads-hooks) + en moodboard-bild. Nyckeln (OPENAI_API_KEY) ligger
// som Cloudflare-secret, aldrig i klienten. Om nyckel saknas eller API:t strular faller den
// tillbaka på ett kurerat exempel så att demon alltid funkar.

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
  "image_prompt": "en engelsk prompt för key-art moodboard: graphic-novel slot key visual, ingen text, inga riktiga varumärken/IP, dramatisk komposition"
}
Skriv art, mechanic, music och hooks på engelska (branschspråk). names och logline får gärna ha glimten i ögat.`;

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
  image_url: null,
};

async function generateConcept(theme, apiKey) {
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
  return concept;
}

async function generateImage(prompt, apiKey) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt: prompt.slice(0, 3900),
      n: 1,
      size: "1024x1024",
      quality: "standard",
    }),
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

  const apiKey = env.OPENAI_API_KEY;

  // Ingen nyckel → kurerat exempel (demo överlever alltid).
  if (!apiKey) {
    return Response.json({ ...FALLBACK, theme, note: "no_api_key" });
  }

  try {
    const concept = await generateConcept(theme, apiKey);
    // Bilden får misslyckas utan att fälla konceptet.
    try {
      concept.image_url = await generateImage(concept.image_prompt || theme, apiKey);
    } catch (e) {
      concept.image_url = null;
      concept.image_error = String(e).slice(0, 200);
    }
    return Response.json(concept);
  } catch (e) {
    // Hårt fel → fall tillbaka men behåll temat så demon flyter.
    return Response.json({ ...FALLBACK, theme, note: "fallback", error: String(e).slice(0, 200) });
  }
}
