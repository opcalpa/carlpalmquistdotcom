// Concept Forge — upvotes (en röst per IP, togglbar) lagrade i samma Cloudflare KV som galleriet.
//   POST /api/vote {id}        -> togglar IP:ns röst på konceptet -> { id, votes, voted }
//   GET  /api/vote?id=...      -> { id, votes, voted } för anropande IP (för delade-länk-besök)
//
// Röstantalet lever på index-posten (forge:index) så galleriet kan sorteras på "Top" senare.
// Per-IP-spärr = en markörnyckel forge:voter:<id>:<ip>. KV via REST → samma datalager lokalt och live.

const INDEX_KEY = "forge:index";
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
  if (!r.ok) throw new Error(`kv put ${r.status}`);
}
async function kvDel(env, key) {
  await fetch(`${kvBase(env)}/values/${encodeURIComponent(key)}`, { method: "DELETE", headers: kvAuth(env) });
}
const readIndex = async (env) => { try { return JSON.parse((await kvGet(env, INDEX_KEY)) || "[]"); } catch { return []; } };
const clientIp = (request) => request.headers.get("cf-connecting-ip") || (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
const voterKey = (id, ip) => `forge:voter:${id}:${ip}`;

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!kvOk(env)) return Response.json({ error: "kv_not_configured" });
  let body = {};
  try { body = await request.json(); } catch {}
  const id = body && body.id;
  if (!id) return Response.json({ error: "missing id" }, { status: 400 });
  const ip = clientIp(request);
  try {
    const vkey = voterKey(id, ip);
    const already = await kvGet(env, vkey);
    const idx = await readIndex(env);
    const entry = idx.find((m) => m.id === id);
    if (!entry) return Response.json({ error: "unknown id" }, { status: 404 });
    let votes = entry.votes || 0;
    let voted;
    if (already) { await kvDel(env, vkey); votes = Math.max(0, votes - 1); voted = false; }
    else { await kvPut(env, vkey, "1"); votes = votes + 1; voted = true; }
    entry.votes = votes;
    await kvPut(env, INDEX_KEY, JSON.stringify(idx));
    return Response.json({ id, votes, voted });
  } catch (e) {
    return Response.json({ error: String(e).slice(0, 200) });
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!kvOk(env)) return Response.json({ votes: 0, voted: false });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "missing id" }, { status: 400 });
  const ip = clientIp(request);
  try {
    const entry = (await readIndex(env)).find((m) => m.id === id);
    const voted = !!(await kvGet(env, voterKey(id, ip)));
    return Response.json({ id, votes: entry ? entry.votes || 0 : 0, voted });
  } catch (e) {
    return Response.json({ votes: 0, voted: false, error: String(e).slice(0, 200) });
  }
}
