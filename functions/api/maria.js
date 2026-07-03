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
const K_BASE = "maria:baseline", K_REASON = "maria:reasoning", K_CHAT = "maria:chat", K_OV = "maria:overrides", K_LOG = "maria:changelog";
const LOG_CAP = 300;   // append-only publik ändringslogg (vem ändrade vad, när) — visas som feed på sidan

// Delat "override-lager": besökare (t.ex. Fredrik) kan spara nya värden för ALLA utan att röra
// baslinjen (originalet spåras alltid). Bara vitlistade fält får överskridas. Värden clampas.
const OV_FIELDS = new Set([
  "karlpers.totalpris", "karlpers.agarandelPct", "karlpers.maklararvode", "karlpers.anskaffning1975", "karlpers.forbattringar",
  "grimvagen.varde", "grimvagen.lan", "grimvagen.anskaffning", "grimvagen.forbattringar", "grimvagen.maklararvodePct",
  "vettershaga.tomt", "vettershaga.lagfartPct", "vettershaga.avlopp", "vettershaga.brunn", "vettershaga.el",
  "vettershaga.byggsats", "vettershaga.grund", "vettershaga.montage", "vettershaga.installation", "vettershaga.malning",
  "vettershaga.kringkostnad", "vettershaga.buffertPct",
  "privatekonomi.fondsparande", "privatekonomi.pensionNetto", "privatekonomi.lonNetto", "privatekonomi.frejgatanHyra", "privatekonomi.driftVettershagaMan",
  "nyahuset.lan", "nyahuset.rantaPct", "nyahuset.amorteringPct",
]);
const RLOV_MAX = 60, RLOV_WINDOW = 600;   // max 60 spar-anrop per IP / 10 min
const rlovKey = (i) => `maria:rlov:${i}`;
const getPath = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
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
    const [baseline, reasoning, chat, overrides, changelog] = await Promise.all([
      readJson(env, K_BASE, null), readJson(env, K_REASON, null), readJson(env, K_CHAT, []), readJson(env, K_OV, {}), readJson(env, K_LOG, []),
    ]);
    return Response.json({ baseline, reasoning, chat, overrides, changelog });
  } catch (e) { return Response.json({ error: String(e).slice(0, 200) }, { status: 500 }); }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const u = new URL(request.url);
  if (!kvOk(env)) return Response.json({ error: "kv_not_configured" }, { status: 500 });
  let body = {}; try { body = await request.json(); } catch {}
  if ((body.pw || "") !== PW(env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const kind = u.searchParams.get("kind");

  // Delat spara-lager: sätt nya värden för alla (attribuerat) eller återställ ett fält till original.
  if (kind === "override") {
    const ip = clientIp(request);
    const rlov = parseInt((await kvGet(env, rlovKey(ip))) || "0", 10) || 0;
    if (rlov >= RLOV_MAX) return Response.json({ error: "rate_limited" }, { status: 429 });
    const baseline = await readJson(env, K_BASE, null);
    if (!baseline) return Response.json({ error: "no_baseline" }, { status: 400 });
    const overrides = await readJson(env, K_OV, {});
    let changelog = await readJson(env, K_LOG, []);
    const by = sanitize(body.name, NAME_MAX) || "Någon";
    const note = sanitize(body.note, 300);
    const ts = Date.now();
    const events = [];
    const mkId = () => "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    if (body.clearPath) {                                     // återställ ett fält till original
      const p = body.clearPath;
      if (overrides[p]) {
        events.push({ id: mkId(), path: p, from: Number(overrides[p].v), to: Number(getPath(baseline, p)), by, ts, note: note || undefined, action: "revert" });
        delete overrides[p];
      }
    } else if (Array.isArray(body.changes) && body.changes.length) {
      for (const ch of body.changes) {
        const p = ch && ch.path;
        if (!OV_FIELDS.has(p)) continue;                      // bara vitlistade fält
        let v = Number(ch.value);
        if (!isFinite(v)) continue;
        v = Math.max(0, Math.min(v, /Pct$/.test(p) ? 100 : 1e9));
        const base = Number(getPath(baseline, p));
        const prev = overrides[p] ? Number(overrides[p].v) : base;
        if (v === prev) continue;                             // ingen faktisk ändring
        if (v === base) { delete overrides[p]; events.push({ id: mkId(), path: p, from: prev, to: v, by, ts, note: note || undefined, action: "revert" }); }
        else { overrides[p] = { v, by, ts, note: note || undefined }; events.push({ id: mkId(), path: p, from: prev, to: v, by, ts, note: note || undefined, action: "set" }); }
      }
    } else {
      return Response.json({ error: "bad_override" }, { status: 400 });
    }
    if (events.length) {
      changelog = changelog.concat(events);
      if (changelog.length > LOG_CAP) changelog.splice(0, changelog.length - LOG_CAP);
      await kvPut(env, K_LOG, JSON.stringify(changelog));
    }
    await kvPut(env, K_OV, JSON.stringify(overrides));
    await kvPut(env, rlovKey(ip), String(rlov + 1), RLOV_WINDOW);
    return Response.json({ overrides, changelog });
  }

  if (kind !== "chat") return Response.json({ error: "bad kind" }, { status: 400 });
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
    if (body.resetLog) await kvPut(env, K_LOG, "[]");           // töm publik ändringslogg
    if (body.resetOverrides) await kvPut(env, K_OV, "{}");      // nollställ alla sparade override-värden
    return Response.json({ ok: true });
  } catch (e) { return Response.json({ error: String(e).slice(0, 200) }, { status: 500 }); }
}
