// Concept Forge — regenerera EN sektion (per-komponent re-roll)
// POST /api/section  { theme, section, concept }  ->  { ...just that section's fields }
//   section ∈ title | art | mechanic | music | hooks
// Claude (med retry) ger ett nytt, tydligt annorlunda alternativ för bara den sektionen,
// i samma husstil. Audio/bild har egna endpoints (/api/soundtrack, /api/audio, /api/image).

const HOUSE = `Du är senior game concept director på en slot-studio i Hacksaw-anda: bold graphic-novel-estetik, dark humor, allt från gritty western till neondränkt cyberpunk, mobile-first, hög volatilitet, signaturmekaniker (xNudge wilds, Sticky Multipliers, instant-win, eskalerande free spins), och musik/ljud som identitetspelare. Ton: självsäker, lekfull, lite respektlös. Aldrig generisk. Engelska på art/mechanic/music/hooks och alla prompts.`;

const SPEC = {
  title: `{"names":[3-5 korta nya slagkraftiga spelnamn, gärna ordvitsar],"logline":"en ny mening som säljer fantasin"}`,
  art: `{"art":{"style":"","palette":"","hero_characters":"","mood":""}}`,
  mechanic: `{"mechanic":{"base_game":"","signature_feature":"","bonus_round":""},"math":{"volatility":"","suggested_max_win":""}}`,
  music: `{"music":{"genre":"","instrumentation":"","base_vs_bonus":"","bpm":"","reference_vibe":""},"soundtrack_prompt":"engelsk ~25s instrumental prompt som matchar","sfx":[{"label":"Reel spin","prompt":""},{"label":"Bonus trigger","prompt":""},{"label":"Big win","prompt":""}]}`,
  hooks: `{"hooks":[3 nya korta TikTok/social-hooks]}`,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function extractJson(t) { const s = t.indexOf("{"), e = t.lastIndexOf("}"); if (s === -1 || e === -1) throw new Error("no json"); return JSON.parse(t.slice(s, e + 1)); }

async function claude(system, user, apiKey) {
  let lastErr;
  for (let a = 0; a < 3; a++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1200, temperature: 1, system, messages: [{ role: "user", content: user }] }),
      });
      if (!res.ok) { const b = await res.text(); if ([429, 500, 502, 503, 529].includes(res.status) && a < 2) { lastErr = new Error(`anthropic ${res.status}`); await sleep(700 * (a + 1)); continue; } throw new Error(`anthropic ${res.status}: ${b}`); }
      const data = await res.json();
      return extractJson(data.content[0].text);
    } catch (e) { lastErr = e; if (a < 2) { await sleep(700 * (a + 1)); continue; } throw e; }
  }
  throw lastErr;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const apiKey = env.ANTHROPIC_API_KEY || env.ANTROPHIC_API_KEY;
  let body = {};
  try { body = await request.json(); } catch {}
  const theme = (body.theme || "").toString().slice(0, 160);
  const section = (body.section || "").toString();
  if (!SPEC[section]) return Response.json({ error: "bad section" }, { status: 400 });
  if (!apiKey) return Response.json({ error: "no_api_key" });

  // Trimma kontexten (ingen media) för koherens men liten payload.
  const c = body.concept || {};
  const ctx = { names: c.names, logline: c.logline, art: c.art, mechanic: c.mechanic, music: c.music, hooks: c.hooks };
  const user = `Tema: ${theme}\n\nNuvarande koncept (för stil och koherens):\n${JSON.stringify(ctx).slice(0, 2500)}\n\nGenerera ett NYTT, tydligt annorlunda alternativ för ENBART avsnittet "${section}". Behåll husstilen och temat. Returnera ENBART giltig JSON enligt: ${SPEC[section]}\nIngen text före eller efter, inga kodblock-markörer.`;

  try {
    return Response.json(await claude(HOUSE, user, apiKey));
  } catch (e) {
    return Response.json({ error: String(e).slice(0, 200) });
  }
}
