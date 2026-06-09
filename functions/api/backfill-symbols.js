// Concept Forge — engångs/återanvändbar backfill av temade reel-symboler för redan sparade gallery-poster.
//   GET /api/backfill-symbols?token=...            -> backfilla alla poster som saknar symboler
//   GET /api/backfill-symbols?token=...&dry=1      -> rapportera bara vad som skulle göras
//   GET /api/backfill-symbols?token=...&id=<id>    -> bara en post
//
// Körs server-side med env-nycklarna → ingen per-IP-spärr (till skillnad från publika /api/concept).
// Skälet finns: tidigare forges sparades utan symboler (lazy-gen + symbolPrompts persistades aldrig),
// så reel-vyn visade A/K/Q/J/10 istället för produktionslika ikoner. Detta fyller i dem i efterhand.

const TOKEN = "forge-bf-9x7k2qm4"; // obfuskerad gate; Pages Functions-källa serveras aldrig till klient

const INDEX_KEY = "forge:index";
const RES_KEY = (id) => "forge:res:" + id;

const nsId = (env) => env.KV_NAMESPACE_ID || env.KV_NAMSPACE_ID;
const kvOk = (env) => env.CF_ACCOUNT_ID && nsId(env) && env.CF_API_TOKEN;
const kvBase = (env) => `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/storage/kv/namespaces/${nsId(env)}`;
const kvAuth = (env) => ({ Authorization: `Bearer ${env.CF_API_TOKEN}` });

async function kvGet(env, key) {
  const r = await fetch(`${kvBase(env)}/values/${encodeURIComponent(key)}`, { headers: kvAuth(env) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`kv get ${r.status}`);
  return await r.text();
}
async function kvPut(env, key, value) {
  const r = await fetch(`${kvBase(env)}/values/${encodeURIComponent(key)}`, { method: "PUT", headers: kvAuth(env), body: value });
  if (!r.ok) throw new Error(`kv put ${r.status}: ${(await r.text()).slice(0, 200)}`);
}
const readIndex = async (env) => { try { return JSON.parse((await kvGet(env, INDEX_KEY)) || "[]"); } catch { return []; } };

function abToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}
// Hämtar en URL → data-URI så ikonen aldrig löper ut (samma mönster som gallery.js).
async function inline(url) {
  if (!url || url.startsWith("data:")) return url || null;
  try {
    const r = await fetch(url);
    if (!r.ok) return url;
    const ct = r.headers.get("content-type") || "image/jpeg";
    return `data:${ct};base64,` + abToBase64(await r.arrayBuffer());
  } catch { return url; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Claude: ge 3 konkreta HÖG-symboler för temat (samma regler som concept.js symbol-schemat).
const SYM_SYSTEM = `Du designar slot-symboler för spelstudion Hacksaw Gaming. Givet ett tema, returnera de 3 tematiska HÖG-symbolerna som berättar spelets story (konkreta FÖREMÅL eller karaktärsemblem, ALDRIG A/K/Q/J/10 — dem renderar UI:t själv).
Svara med ENBART giltig JSON, inga kodblock:
{"symbols":[{"label":"1-2 ord, t.ex. 'Fox Mask'","prompt":"engelsk prompt för EN ensam ikon (rävmask, katana, dryckeshorn osv), inget rutnät, ingen UI, ingen text/bokstäver, isolerad mot mörk bakgrund"}, ... 3 st]}
Håll varje prompt kort och fokuserad på ETT motiv.`;

function extractJson(text) {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("no json");
  return JSON.parse(text.slice(s, e + 1));
}
async function symbolPrompts(theme, apiKey) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 600, temperature: 1, system: SYM_SYSTEM, messages: [{ role: "user", content: `Tema: ${theme}\n\nENBART JSON.` }] }),
    });
    if (!res.ok) { if ([429, 500, 502, 503, 529].includes(res.status) && attempt < 2) { await sleep(700 * (attempt + 1)); continue; } throw new Error(`anthropic ${res.status}`); }
    const data = await res.json();
    const j = extractJson(data.content[0].text);
    const syms = Array.isArray(j.symbols) ? j.symbols.slice(0, 3) : [];
    if (syms.length) return syms;
  }
  return [];
}

// Flux schnell-ikon, samma isolerade wrapper + svart-frame-retry som symbols.js.
function iconPrompt(p) {
  const base = String(p || "slot symbol").slice(0, 240);
  return `${base}. Single centered video-game slot symbol icon, one subject only, bold comic graphic-novel style, thick black ink linework, halftone shading, vibrant high-contrast colors, glossy game-ready emblem, isolated on a plain dark background, no grid, no UI, no buttons, no text, no letters, no numbers, no real brands, no copyrighted characters`.slice(0, 720);
}
async function fluxIcon(prompt, falKey) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch("https://fal.run/fal-ai/flux/schnell", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Key ${falKey}` },
      body: JSON.stringify({ prompt: iconPrompt(prompt), image_size: "square", num_images: 1, num_inference_steps: 4, seed: Math.floor(Math.random() * 1e9) }),
    });
    if (!res.ok) throw new Error(`fal ${res.status}`);
    const d = await res.json();
    const url = d.images && d.images[0] && d.images[0].url;
    if (!url) throw new Error("fal: no url");
    try { const len = (await (await fetch(url, { cache: "no-store" })).arrayBuffer()).byteLength; if (len >= 14000) return url; }
    catch { return url; }
  }
  return null;
}

// Soundtrack-reparation: Google Lyria 2 på fal är synkron (url direkt) → idealt för server-side backfill.
async function falMusic(prompt, falKey) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("https://fal.run/fal-ai/lyria2", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Key ${falKey}` },
        body: JSON.stringify({ prompt: String(prompt).slice(0, 1000), negative_prompt: "low quality, distorted, muddy mix, vocals" }),
      });
      if (!res.ok) throw new Error(`fal lyria ${res.status}: ${(await res.text()).slice(0, 120)}`);
      const d = await res.json();
      const url = d.audio && d.audio.url;
      if (!url) throw new Error("fal lyria: no url in " + JSON.stringify(d).slice(0, 120));
      return url;
    } catch (e) { lastErr = e; await sleep(800); }
  }
  throw lastErr;
}

// Reparerar EN gallery-post: fyller bara det som saknas (symboler / TL;DR / soundtrack). Idempotent.
async function backfillOne(env, id, dry) {
  const raw = await kvGet(env, RES_KEY(id));
  if (!raw) return { id, status: "not_found" };
  const entry = JSON.parse(raw);
  const st = entry.state || {};
  st.versions = st.versions || {}; st.idx = st.idx || {};
  const v = st.versions;
  const cur = (k) => { const a = v[k] || []; const i = st.idx[k] || 0; return a[i] || a[0] || null; };
  const fixed = [];

  // 1) Temade reel-symboler (Claude-prompts → Flux schnell)
  const hasSym = Array.isArray(v.symbols) && Array.isArray(v.symbols[0]) && v.symbols[0].length;
  if (!hasSym) {
    const prompts = await symbolPrompts(entry.theme, env.ANTHROPIC_API_KEY || env.ANTROPHIC_API_KEY);
    if (prompts.length && dry) fixed.push("symbols?");
    else if (prompts.length) {
      const urls = await Promise.allSettled(prompts.map((p) => fluxIcon(p.prompt || p.label, env.FLUX_API_KEY)));
      const syms = [];
      for (let i = 0; i < prompts.length; i++) { const u = urls[i].status === "fulfilled" ? urls[i].value : null; if (u) syms.push({ label: prompts[i].label || `Symbol ${i + 1}`, url: await inline(u) }); }
      if (syms.length) { st.symbolPrompts = prompts; v.symbols = [syms]; st.idx.symbols = 0; fixed.push("symbols"); }
    }
  }

  // 2) TL;DR (featureIntro) — syntetisera ur mekaniken (ingen LLM), samma logik som klientens fallback
  if (!(Array.isArray(st.featureIntro) && st.featureIntro.length)) {
    const mech = cur("mechanic") || {}; const m = mech.mechanic || {}, ma = mech.math || {}; const cards = [];
    if (m.signature_feature || m.base_game) cards.push(m.signature_feature || m.base_game);
    if (m.bonus_round) cards.push(m.bonus_round);
    if (ma.suggested_max_win) { const w = String(ma.suggested_max_win); cards.push("MAX WIN " + w + (/x/i.test(w) ? "" : "x")); }
    if (cards.length && dry) fixed.push("tldr?");
    else if (cards.length) { st.featureIntro = cards; fixed.push("tldr"); }
  }

  // 3) Soundtrack — fal Lyria 2 (synkron) om spåret saknas
  if (!((cur("soundtrack") || {}).url)) {
    const prompt = ((cur("music") || {}).soundtrack_prompt || entry.theme || "").trim();
    if (prompt && dry) fixed.push("soundtrack?");
    else if (prompt) {
      try { const u = await falMusic(prompt, env.FLUX_API_KEY); v.soundtrack = [{ url: await inline(u), engine: "Google Lyria 2 (fal.ai)" }]; st.idx.soundtrack = 0; fixed.push("soundtrack"); }
      catch (e) { fixed.push("soundtrack_failed:" + String(e && e.message || e).slice(0, 100)); }
    }
  }

  if (!fixed.length) return { id, theme: entry.theme, status: "complete" };
  if (dry) return { id, theme: entry.theme, status: "would_fix", fixed };
  entry.state = st;
  await kvPut(env, RES_KEY(id), JSON.stringify(entry));
  return { id, theme: entry.theme, status: "fixed", fixed };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const u = new URL(request.url);
  if (u.searchParams.get("token") !== TOKEN) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!kvOk(env)) return Response.json({ error: "kv_not_configured" });
  if (!(env.ANTHROPIC_API_KEY || env.ANTROPHIC_API_KEY)) return Response.json({ error: "no_anthropic_key" });
  if (!env.FLUX_API_KEY) return Response.json({ error: "no_flux_key" });

  const dry = !!u.searchParams.get("dry");
  const oneId = u.searchParams.get("id");
  try {
    if (oneId) return Response.json(await backfillOne(env, oneId, dry));
    const idx = await readIndex(env);
    const results = [];
    // Sekventiellt: snällt mot rate limits och håller minnet lågt (base64-ikoner).
    for (const m of idx) results.push(await backfillOne(env, m.id, dry));
    const summary = results.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
    return Response.json({ dry, total: results.length, summary, results });
  } catch (e) {
    return Response.json({ error: String(e).slice(0, 250) });
  }
}
