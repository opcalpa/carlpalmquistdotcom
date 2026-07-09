// Fält-pappen — mobil inkorg/utkorg för Calles lokala PA-app ("pappen"), samma KV som Forge/Maria.
// Mobilen (PWA på /falt) lämnar anteckningar i falt:inbox; pappen hämtar hem + ackar dem när den
// är vaken, och pushar läsunderlag till falt:feed. ⚠️ Repo-källan är PUBLIK — lösenordet ligger
// ALDRIG här utan i env.FALT_PW (Pages-env) eller KV-nyckeln falt:pw (seedas lokalt via REST).
//   GET  /api/falt?pw=&kind=state             -> { inbox, feed }        (PWA:ns inkorgs-vy)
//   GET  /api/falt?pw=&kind=pull              -> { items }              (pappen hämtar kön)
//   GET  /api/falt?pw=&kind=mirror            -> { mirror }             (läs-spegel: To Do/Listor/Agera-snapshot)
//   GET  /api/falt?pw=&kind=quiz              -> { quiz }               (frågebank för 🎲 Spel-fliken)
//   POST /api/falt?kind=quiz  {pw,quiz}       -> { ok, bytes }          (pappen pushar frågebanken)
//   POST /api/falt?kind=note  {pw,text}       -> { ok, item }           (mobilen antecknar; IP-rate-limitad)
//   POST /api/falt?kind=ack   {pw,ids}        -> { ok, left }           (pappen kvitterar hämtat)
//   POST /api/falt?kind=push  {pw,title,md}   -> { ok, feed }           (pappen pushar läsunderlag)
//   POST /api/falt?kind=mirror {pw,mirror}    -> { ok, bytes }          (pappen pushar spegel-snapshot)

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
const readJson = async (env, k, def) => { try { const v = await kvGet(env, k); return v == null ? def : JSON.parse(v); } catch { return def; } };

const K_IN = "falt:inbox", K_FEED = "falt:feed", K_PW = "falt:pw", K_MIR = "falt:mirror", K_QUIZ = "falt:quiz";
const MIR_MAX = 4_000_000;   // spegel-snapshot (To Do/Listor/Agera) — rejält tilltaget, KV tål 25 MB
const QUIZ_MAX = 1_000_000;  // frågebanken (🎲 Spel-fliken) — text-JSON, 1 MB räcker långt
const IN_CAP = 200, FEED_CAP = 20, TEXT_MAX = 20000, TITLE_MAX = 120, MD_MAX = 60000;
const RL_MAX = 60, RL_WINDOW = 600;              // max 60 anteckningar per IP / 10 min
const rlKey = (ip) => `falt:rl:${ip}`;
const FAIL_MAX = 20, FAIL_WINDOW = 600;          // brute-force-broms som Maria-sidan
const failKey = (ip) => `falt:fail:${ip}`;
const mkId = () => "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Lösenordet är en riktig hemlighet (personliga anteckningar): env vinner, annars KV, annars stängt.
const getPw = async (env) => env.FALT_PW || (await kvGet(env, K_PW).catch(() => null));

async function checkPw(env, request, given) {
  const pw = await getPw(env);
  if (!pw) return { ok: false, res: Response.json({ error: "not_configured" }, { status: 503 }) };
  const ip = clientIp(request);
  const isPublic = /(^|\.)carlpalmquist\.com$/i.test(new URL(request.url).hostname);
  if (isPublic) {
    const fails = parseInt((await kvGet(env, failKey(ip)).catch(() => null)) || "0", 10) || 0;
    if (fails >= FAIL_MAX) return { ok: false, res: Response.json({ error: "rate_limited" }, { status: 429 }) };
  }
  if ((given || "") !== pw) {
    if (isPublic) {
      const fails = parseInt((await kvGet(env, failKey(ip)).catch(() => null)) || "0", 10) || 0;
      await kvPut(env, failKey(ip), String(fails + 1), FAIL_WINDOW).catch(() => {});
    }
    return { ok: false, res: Response.json({ error: "unauthorized" }, { status: 401 }) };
  }
  return { ok: true };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const u = new URL(request.url);
  if (!kvOk(env)) return Response.json({ error: "kv_not_configured" }, { status: 500 });
  const auth = await checkPw(env, request, u.searchParams.get("pw"));
  if (!auth.ok) return auth.res;
  try {
    const kind = u.searchParams.get("kind") || "state";
    if (kind === "pull") return Response.json({ items: await readJson(env, K_IN, []) });
    if (kind === "mirror") return Response.json({ mirror: await readJson(env, K_MIR, null) });
    if (kind === "quiz") return Response.json({ quiz: await readJson(env, K_QUIZ, null) });
    const [inbox, feed] = await Promise.all([readJson(env, K_IN, []), readJson(env, K_FEED, [])]);
    return Response.json({ inbox, feed });
  } catch (e) { return Response.json({ error: String(e).slice(0, 200) }, { status: 500 }); }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const u = new URL(request.url);
  if (!kvOk(env)) return Response.json({ error: "kv_not_configured" }, { status: 500 });
  let body = {}; try { body = await request.json(); } catch {}
  const auth = await checkPw(env, request, body.pw);
  if (!auth.ok) return auth.res;
  const kind = u.searchParams.get("kind");
  try {
    if (kind === "note") {
      const ip = clientIp(request);
      const rl = parseInt((await kvGet(env, rlKey(ip)).catch(() => null)) || "0", 10) || 0;
      if (rl >= RL_MAX) return Response.json({ error: "rate_limited" }, { status: 429 });
      // Radbrytningar bevaras (anteckningar!) — bara kontrolltecken utöver \n tvättas bort.
      const text = (body.text || "").toString().replace(/[\x00-\x09\x0B-\x1F\x7F]/g, " ").trim().slice(0, TEXT_MAX);
      if (!text) return Response.json({ error: "empty" }, { status: 400 });
      const inbox = await readJson(env, K_IN, []);
      const item = { id: mkId(), text, at: new Date().toISOString() };
      inbox.push(item);
      if (inbox.length > IN_CAP) inbox.splice(0, inbox.length - IN_CAP);
      await kvPut(env, K_IN, JSON.stringify(inbox));
      await kvPut(env, rlKey(ip), String(rl + 1), RL_WINDOW);
      return Response.json({ ok: true, item, count: inbox.length });
    }
    if (kind === "ack") {
      const ids = new Set(Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === "string") : []);
      if (!ids.size) return Response.json({ error: "no_ids" }, { status: 400 });
      const inbox = await readJson(env, K_IN, []);
      const left = inbox.filter((it) => !ids.has(it.id));
      await kvPut(env, K_IN, JSON.stringify(left));
      return Response.json({ ok: true, left: left.length });
    }
    if (kind === "push") {
      const title = (body.title || "").toString().replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, TITLE_MAX);
      const md = (body.md || "").toString().replace(/[\x00-\x09\x0B-\x1F\x7F]/g, " ").slice(0, MD_MAX);
      if (!title || !md.trim()) return Response.json({ error: "empty" }, { status: 400 });
      let feed = await readJson(env, K_FEED, []);
      feed = feed.filter((d) => d.title !== title);          // samma titel ersätter (t.ex. "Idag")
      feed.unshift({ id: mkId(), title, md, at: new Date().toISOString() });
      if (feed.length > FEED_CAP) feed.length = FEED_CAP;
      await kvPut(env, K_FEED, JSON.stringify(feed));
      return Response.json({ ok: true, feed: feed.map((d) => ({ id: d.id, title: d.title, at: d.at })) });
    }
    if (kind === "mirror") {
      if (!body.mirror || typeof body.mirror !== "object") return Response.json({ error: "no_mirror" }, { status: 400 });
      const raw = JSON.stringify(body.mirror);
      if (raw.length > MIR_MAX) return Response.json({ error: "too_big" }, { status: 413 });
      await kvPut(env, K_MIR, raw);
      return Response.json({ ok: true, bytes: raw.length });
    }
    if (kind === "quiz") {
      if (!body.quiz || typeof body.quiz !== "object") return Response.json({ error: "no_quiz" }, { status: 400 });
      const raw = JSON.stringify(body.quiz);
      if (raw.length > QUIZ_MAX) return Response.json({ error: "too_big" }, { status: 413 });
      await kvPut(env, K_QUIZ, raw);
      return Response.json({ ok: true, bytes: raw.length });
    }
    return Response.json({ error: "bad kind" }, { status: 400 });
  } catch (e) { return Response.json({ error: String(e).slice(0, 200) }, { status: 500 }); }
}
