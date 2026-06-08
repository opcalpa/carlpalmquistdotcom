// Concept Forge — delat gallery (server-lagring i Cloudflare KV via REST-API)
//   GET    /api/gallery            -> { list: [{id, theme, ts, thumb}] }
//   GET    /api/gallery?id=...     -> hela entryn { id, theme, concept, audio }
//   POST   /api/gallery  {theme, concept, audio} -> sparar (media inlinas) -> { id }
//   DELETE /api/gallery?id=...     -> tar bort en
//   DELETE /api/gallery?all=1      -> tömmer
//
// KV nås via Cloudflares REST-API (CF_ACCOUNT_ID, KV_NAMESPACE_ID, CF_API_TOKEN som secrets),
// så local wrangler och live carlpalmquist.com läser/skriver SAMMA datalager. Bild och soundtrack
// bäddas in som base64 vid sparning så innehållet aldrig löper ut. SFX är redan data-URIs.

const INDEX_KEY = "forge:index";
const RES_KEY = (id) => "forge:res:" + id;
const CAP = 60;

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
async function kvDel(env, key) {
  await fetch(`${kvBase(env)}/values/${encodeURIComponent(key)}`, { method: "DELETE", headers: kvAuth(env) });
}

function abToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}

// Hämtar en URL och returnerar en data-URI så innehållet består. Redan-data-URI eller fel → oförändrat.
async function inline(url) {
  if (!url || url.startsWith("data:")) return url || null;
  try {
    const r = await fetch(url);
    if (!r.ok) return url;
    const ct = r.headers.get("content-type") || "application/octet-stream";
    return `data:${ct};base64,` + abToBase64(await r.arrayBuffer());
  } catch { return url; }
}

const normalize = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
const readIndex = async (env) => { try { return JSON.parse((await kvGet(env, INDEX_KEY)) || "[]"); } catch { return []; } };

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!kvOk(env)) return Response.json({ list: [], note: "kv_not_configured" });
  const id = new URL(request.url).searchParams.get("id");
  try {
    if (id) {
      const v = await kvGet(env, RES_KEY(id));
      return v ? new Response(v, { headers: { "content-type": "application/json" } }) : Response.json({ error: "not found" }, { status: 404 });
    }
    return Response.json({ list: await readIndex(env) });
  } catch (e) {
    return Response.json({ list: [], error: String(e).slice(0, 200) });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!kvOk(env)) return Response.json({ error: "kv_not_configured" });
  let body = {};
  try { body = await request.json(); } catch {}
  const { theme, state } = body;
  if (!theme || !state) return Response.json({ error: "missing theme/state" }, { status: 400 });

  try {
    const v = state.versions || {};
    const imgArr = Array.isArray(v.image) ? v.image : [];
    // Tumnagel från originalurl INNAN inlining (annars blir det en jätte-data-URI i indexet).
    const curImg = imgArr[(state.idx && state.idx.image) || 0] || imgArr[0] || {};
    const thumb = curImg.url && !String(curImg.url).startsWith("data:") ? curImg.url : "";
    // Inline all media över alla versioner så inget löper ut (redan-inlinade hoppas över).
    for (const im of imgArr) { if (im && im.url) im.url = await inline(im.url); }
    if (Array.isArray(v.soundtrack)) for (const so of v.soundtrack) { if (so && so.url) so.url = await inline(so.url); }

    const ts = Date.now();
    const id = body.id || ("e" + Date.now() + Math.floor(Math.random() * 1000));
    const key = normalize(theme);
    await kvPut(env, RES_KEY(id), JSON.stringify({ id, theme, key, ts, state }));

    let idx = await readIndex(env);
    idx = idx.filter((m) => m.id !== id);           // uppdatering: ta bort gammal post för samma id
    idx.unshift({ id, theme, key, ts, thumb });
    while (idx.length > CAP) { const o = idx.pop(); await kvDel(env, RES_KEY(o.id)); }
    await kvPut(env, INDEX_KEY, JSON.stringify(idx));
    return Response.json({ id });
  } catch (e) {
    return Response.json({ error: String(e).slice(0, 250) });
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  if (!kvOk(env)) return Response.json({ ok: false });
  const u = new URL(request.url);
  try {
    if (u.searchParams.get("all")) {
      const idx = await readIndex(env);
      for (const m of idx) await kvDel(env, RES_KEY(m.id));
      await kvPut(env, INDEX_KEY, "[]");
      return Response.json({ ok: true });
    }
    const id = u.searchParams.get("id");
    if (id) {
      const idx = (await readIndex(env)).filter((m) => m.id !== id);
      await kvDel(env, RES_KEY(id));
      await kvPut(env, INDEX_KEY, JSON.stringify(idx));
      return Response.json({ ok: true });
    }
    return Response.json({ ok: false });
  } catch (e) {
    return Response.json({ ok: false, error: String(e).slice(0, 200) });
  }
}
