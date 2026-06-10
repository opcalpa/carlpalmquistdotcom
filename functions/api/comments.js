// Concept Forge — kommentarer/chatt (Reddit-likt, två scopes) i samma Cloudflare KV som galleriet/rösterna.
//   GET    /api/comments?scope=<conceptId|global>          -> { list: [{id,handle,body,ts,votes,voted}] }
//   POST   /api/comments {scope, handle, body}             -> lägg till (rate-limit + längdtak + filter) -> { comment } | { error }
//   POST   /api/comments?vote=<commentId>&scope=...        -> togglar IP-röst -> { id, votes, voted }
//   DELETE /api/comments?id=<commentId>&scope=...&token=   -> Carl-only radering (token-gate som backfill-symbols.js)
//
// Direkt-post: kommentaren syns direkt. Skydd: IP-rate-limit, längdtak, kontrolltecken bort, litet ordfilter,
// och HTML escapas på klienten vid rendering. KV via REST → samma datalager lokalt och live.

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
async function kvPut(env, key, value, ttl) {
  const u = `${kvBase(env)}/values/${encodeURIComponent(key)}` + (ttl ? `?expiration_ttl=${ttl}` : "");
  const r = await fetch(u, { method: "PUT", headers: kvAuth(env), body: value });
  if (!r.ok) throw new Error(`kv put ${r.status}`);
}
async function kvDel(env, key) {
  await fetch(`${kvBase(env)}/values/${encodeURIComponent(key)}`, { method: "DELETE", headers: kvAuth(env) });
}
const clientIp = (request) => request.headers.get("cf-connecting-ip") || (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";

const ADMIN_TOKEN = "forge-mod-7x4k2qm9";   // token-gate för radering (sätts i klientens localStorage av Carl)
const CAP = 200;          // max kommentarer per scope (äldsta trillar av)
const RL_MAX = 6;         // max nya kommentarer per IP per fönster
const RL_WINDOW = 600;    // 10 min
const BODY_MAX = 280, HANDLE_MAX = 24;

const cmtKey = (scope) => `forge:cmt:${scope}`;
const votedSetKey = (scope, ip) => `forge:cmtvoted:${scope}:${ip}`;
const rlKey = (ip) => `forge:cmtrl:${ip}`;

// scope = "global" eller ett konceptid (forge-id:n är [a-z0-9]); sanera hårt.
const cleanScope = (s) => {
  const v = (s || "").toString().slice(0, 64).replace(/[^a-zA-Z0-9_:-]/g, "");
  return v || "global";
};
const readList = async (env, scope) => { try { return JSON.parse((await kvGet(env, cmtKey(scope))) || "[]"); } catch { return []; } };
const readVotedSet = async (env, scope, ip) => { try { return JSON.parse((await kvGet(env, votedSetKey(scope, ip))) || "[]"); } catch { return []; } };

// Litet ordfilter — basal sållning, inte hård moderering (Carl kan radera). Håll snäv för få falska träffar.
const BLOCK = /\b(fuck|shit|cunt|nigger|faggot|retard|kike|spic)\b/i;
const sanitize = (s, max) => (s || "").toString().replace(/[\x00-\x1F\x7F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!kvOk(env)) return Response.json({ list: [] });
  const scope = cleanScope(new URL(request.url).searchParams.get("scope"));
  const ip = clientIp(request);
  try {
    const [list, voted] = await Promise.all([readList(env, scope), readVotedSet(env, scope, ip)]);
    const vset = new Set(voted);
    return Response.json({ list: list.map((c) => ({ ...c, voted: vset.has(c.id) })) });
  } catch (e) {
    return Response.json({ list: [], error: String(e).slice(0, 200) });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!kvOk(env)) return Response.json({ error: "kv_not_configured" });
  const url = new URL(request.url);
  const scope = cleanScope(url.searchParams.get("scope"));
  const ip = clientIp(request);

  // ---- Upvote-toggle: POST ?vote=<commentId> ----
  const voteId = url.searchParams.get("vote");
  if (voteId) {
    try {
      const list = await readList(env, scope);
      const c = list.find((x) => x.id === voteId);
      if (!c) return Response.json({ error: "unknown comment" }, { status: 404 });
      const voted = await readVotedSet(env, scope, ip);
      const has = voted.includes(voteId);
      let nextVoted, votes = c.votes || 0;
      if (has) { nextVoted = voted.filter((x) => x !== voteId); votes = Math.max(0, votes - 1); }
      else { nextVoted = [...voted, voteId]; votes = votes + 1; }
      c.votes = votes;
      await Promise.all([
        kvPut(env, cmtKey(scope), JSON.stringify(list)),
        kvPut(env, votedSetKey(scope, ip), JSON.stringify(nextVoted)),
      ]);
      return Response.json({ id: voteId, votes, voted: !has });
    } catch (e) {
      return Response.json({ error: String(e).slice(0, 200) });
    }
  }

  // ---- Ny kommentar ----
  let body = {};
  try { body = await request.json(); } catch {}
  const text = sanitize(body.body, BODY_MAX);
  const handle = sanitize(body.handle, HANDLE_MAX) || "anon";
  if (!text) return Response.json({ error: "empty" }, { status: 400 });
  if (BLOCK.test(text) || BLOCK.test(handle)) return Response.json({ error: "blocked" }, { status: 400 });
  try {
    // rate limit per IP
    const rlRaw = await kvGet(env, rlKey(ip));
    const rlCount = rlRaw ? parseInt(rlRaw, 10) || 0 : 0;
    if (rlCount >= RL_MAX) return Response.json({ error: "rate_limited", retryAfter: RL_WINDOW }, { status: 429 });

    const list = await readList(env, scope);
    const comment = { id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), handle, body: text, ts: Date.now(), votes: 0 };
    list.unshift(comment);
    if (list.length > CAP) list.length = CAP;
    await kvPut(env, cmtKey(scope), JSON.stringify(list));
    await kvPut(env, rlKey(ip), String(rlCount + 1), RL_WINDOW);
    return Response.json({ comment });
  } catch (e) {
    return Response.json({ error: String(e).slice(0, 200) });
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  if (!kvOk(env)) return Response.json({ error: "kv_not_configured" });
  const url = new URL(request.url);
  if (url.searchParams.get("token") !== ADMIN_TOKEN) return Response.json({ error: "forbidden" }, { status: 403 });
  const scope = cleanScope(url.searchParams.get("scope"));
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "missing id" }, { status: 400 });
  try {
    const list = (await readList(env, scope)).filter((c) => c.id !== id);
    await kvPut(env, cmtKey(scope), JSON.stringify(list));
    return Response.json({ ok: true, id });
  } catch (e) {
    return Response.json({ error: String(e).slice(0, 200) });
  }
}
