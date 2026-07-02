// Marias flytt — lösenordsgatad backend (kalkyl-baslinje + resonemang + familjechatt) i samma KV som Forge.
// ⚠️ ALL känslig data (belopp, resonemang, chatt) ligger i KV — ALDRIG i denna PUBLIKA repo-källa.
// Lösenordsgate: env.MARIA_PW || "1441" (1441 är bara en fartgupp; obfuskerad URL + data-i-KV är skyddet).
//   GET  /api/maria?pw=&kind=state                          -> { baseline, reasoning, chat }   (401 vid fel pw)
//   POST /api/maria?kind=chat   {pw,name,message,suggestion} -> { chat }   (IP-rate-limitad)
//   PUT  /api/maria             {pw,admin,data,reasoning}    -> seeda/uppdatera baslinjen (admin-token)

const nsId = (env) => env.KV_NAMESPACE_ID || env.KV_NAMSPACE_ID;
const kvOk = (env) => env.CF_ACCOUNT_ID && nsId(env) && env.CF_API_TOKEN;
const kvBase = (env) => `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/storage/kv/namespaces/${nsId(env)}`;
const kvAuth = (env) => ({ Authorization: `Bearer ${env.CF_API_TOKEN}` });
async function kvGet(env, key) {
  const r = await fetch(`${kvBase(env)}/values/${encodeURIComponent(key)}`, { headers: kvAuth(env) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("kv get " + r.status);
  return await r.text();
}
async function kvPut(env, key, value, ttl) {
  const u = `${kvBase(env)}/values/${encodeURIComponent(key)}` + (ttl ? `?expiration_ttl=${ttl}` : "");
  const r = await fetch(u, { method: "PUT", headers: kvAuth(env), body: value });
  if (!r.ok) throw new Error("kv put " + r.status);
}
const clientIp = (req) => req.headers.get("cf-connecting-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";

const PW = (env) => env.MARIA_PW || "1441";
const ADMIN = "maria-admin-3f9q7x";     // hindrar bara oavsiktlig överskrivning av baslinjen; ej en hemlighet
const K_BASE = "maria:baseline", K_REASON = "maria:reasoning", K_CHAT = "maria:chat";
const CHAT_CAP = 500, BODY_MAX = 1500, NAME_MAX = 40, RL_MAX = 30, RL_WINDOW = 600;
const rlKey = (i) => `maria:rl:${i}`;
const sanitize = (s, max) => (s || "").toString().replace(/[\x00-\x1F\x7F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const readJson = async (env, k, def) => { try { const v = await kvGet(env, k); return v == null ? def : JSON.parse(v); } catch { return def; } };

const FAIL_MAX = 20, FAIL_WINDOW = 600;  // brute-force-broms: max 20 felgissningar per IP / 10 min
const failKey = (ip) => `maria:fail:${ip}`;

export async function onRequestGet(context) {
  const { request, env } = context;
  const u = new URL(request.url);
  const ip = clientIp(request);
  if (!kvOk(env)) return Response.json({ error: "kv_not_configured" }, { status: 500 });
  // Brute-force-broms bara på publika carlpalmquist.com (som Forge-rate-limiten); dev/preview obegränsat.
  const isPublic = /(^|\.)carlpalmquist\.com$/i.test(u.hostname);
  if (isPublic) {
    const fails = parseInt((await kvGet(env, failKey(ip)).catch(() => null)) || "0", 10) || 0;
    if (fails >= FAIL_MAX) return Response.json({ error: "rate_limited" }, { status: 429 });
  }
  if ((u.searchParams.get("pw") || "") !== PW(env)) {
    if (isPublic) {
      const fails = parseInt((await kvGet(env, failKey(ip)).catch(() => null)) || "0", 10) || 0;
      await kvPut(env, failKey(ip), String(fails + 1), FAIL_WINDOW).catch(() => {});
    }
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const [baseline, reasoning, chat] = await Promise.all([
      readJson(env, K_BASE, null), readJson(env, K_REASON, null), readJson(env, K_CHAT, []),
    ]);
    return Response.json({ baseline, reasoning, chat });
  } catch (e) { return Response.json({ error: String(e).slice(0, 200) }, { status: 500 }); }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const u = new URL(request.url);
  if (!kvOk(env)) return Response.json({ error: "kv_not_configured" }, { status: 500 });
  let body = {}; try { body = await request.json(); } catch {}
  if ((body.pw || "") !== PW(env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (u.searchParams.get("kind") !== "chat") return Response.json({ error: "bad kind" }, { status: 400 });
  const name = sanitize(body.name, NAME_MAX) || "Anonym";
  const message = sanitize(body.message, BODY_MAX);
  if (!message) return Response.json({ error: "empty" }, { status: 400 });
  const ip = clientIp(request);
  try {
    const rl = parseInt((await kvGet(env, rlKey(ip))) || "0", 10) || 0;
    if (rl >= RL_MAX) return Response.json({ error: "rate_limited" }, { status: 429 });
    const chat = await readJson(env, K_CHAT, []);
    chat.push({ id: "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, message, ts: Date.now(), suggestion: !!body.suggestion });
    if (chat.length > CHAT_CAP) chat.splice(0, chat.length - CHAT_CAP);
    await kvPut(env, K_CHAT, JSON.stringify(chat));
    await kvPut(env, rlKey(ip), String(rl + 1), RL_WINDOW);
    return Response.json({ chat });
  } catch (e) { return Response.json({ error: String(e).slice(0, 200) }, { status: 500 }); }
}

export async function onRequestPut(context) {
  const { request, env } = context;
  if (!kvOk(env)) return Response.json({ error: "kv_not_configured" }, { status: 500 });
  let body = {}; try { body = await request.json(); } catch {}
  if ((body.pw || "") !== PW(env) || body.admin !== ADMIN) return Response.json({ error: "forbidden" }, { status: 403 });
  try {
    if (body.data) await kvPut(env, K_BASE, JSON.stringify(body.data));
    if (body.reasoning) await kvPut(env, K_REASON, JSON.stringify(body.reasoning));
    if (body.resetChat) await kvPut(env, K_CHAT, "[]");
    return Response.json({ ok: true });
  } catch (e) { return Response.json({ error: String(e).slice(0, 200) }, { status: 500 }); }
}
