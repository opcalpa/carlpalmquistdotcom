// AI Eval Lab — eval-spec CRUD (Cloudflare Pages Function)
//   GET    /api/lab/evals               -> { list: [{id, name, target, created, updated, runs, lastTotal}] }
//   GET    /api/lab/evals?id=...         -> hela spec-objektet
//   GET    /api/lab/evals?results=...    -> { results: [...] } för en eval (körhistorik)
//   POST   /api/lab/evals  {spec}        -> sparar/uppdaterar en eval-spec -> { id }
//   DELETE /api/lab/evals?id=...         -> tar bort en eval + dess resultat
//   DELETE /api/lab/evals?all=1          -> tömmer alla
//
// Designprincip (transparent ställning, ej no-code-svartlåda): UI:t skapar en RIKTIG spec-fil
// som du kan inspektera och redigera rått. Storen är sanningskälla; motorn (run.js) skriver
// resultat hit, UI:t läser. Samma KV-mönster som forge-galleriet (delat local + live).

const INDEX_KEY = "lab:evals:index";
const SPEC_KEY = (id) => "lab:eval:" + id;
const RESULTS_KEY = (id) => "lab:results:" + id;
const CAP = 100;            // max antal evals
const RESULTS_CAP = 50;     // max sparade körningar per eval

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

const readIndex = async (env) => { try { return JSON.parse((await kvGet(env, INDEX_KEY)) || "[]"); } catch { return []; } };
const slug = (s) => String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "eval";

// Validera/normalisera en inkommande spec så storen aldrig får skräp. Returnerar {spec} eller kastar.
function normalizeSpec(raw) {
  if (!raw || typeof raw !== "object") throw new Error("spec saknas");
  const name = String(raw.name || "").trim();
  if (!name) throw new Error("namn krävs");
  const rubric = Array.isArray(raw.rubric) ? raw.rubric
    .map((c) => ({ criterion: String(c.criterion || "").trim(), desc: String(c.desc || "").trim(), weight: Number(c.weight) || 0 }))
    .filter((c) => c.criterion) : [];
  if (!rubric.length) throw new Error("minst ett kriterium krävs");
  // Normalisera vikterna så de summerar till 1 (gör viktad total meningsfull oavsett inmatning).
  const sum = rubric.reduce((a, c) => a + (c.weight > 0 ? c.weight : 0), 0);
  if (sum > 0) rubric.forEach((c) => { c.weight = +(Math.max(0, c.weight) / sum).toFixed(4); });
  else rubric.forEach((c) => { c.weight = +(1 / rubric.length).toFixed(4); });
  const scale = {
    min: Number.isFinite(+raw?.scale?.min) ? +raw.scale.min : 1,
    max: Number.isFinite(+raw?.scale?.max) ? +raw.scale.max : 5,
  };
  const golden = Array.isArray(raw.golden) ? raw.golden
    .map((g) => ({ input: String(g.input || "").trim(), expectedMin: Number(g.expectedMin) }))
    .filter((g) => g.input) : [];
  return {
    id: slug(raw.id || name),
    name,
    target: String(raw.target || "concept").trim(),       // vilken Forge-output evalen dömer
    judge: { model: String(raw?.judge?.model || "claude-sonnet-4-6") },
    rubric,
    scale,
    threshold: Number.isFinite(+raw.threshold) ? +raw.threshold : +((scale.min + scale.max) / 2).toFixed(2),
    golden,
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!kvOk(env)) return Response.json({ list: [], note: "kv_not_configured" });
  const u = new URL(request.url);
  const id = u.searchParams.get("id");
  const resultsId = u.searchParams.get("results");
  try {
    if (resultsId) {
      const v = await kvGet(env, RESULTS_KEY(resultsId));
      return Response.json({ results: v ? JSON.parse(v) : [] });
    }
    if (id) {
      const v = await kvGet(env, SPEC_KEY(id));
      return v ? new Response(v, { headers: { "content-type": "application/json" } }) : Response.json({ error: "not found" }, { status: 404 });
    }
    return Response.json({ list: await readIndex(env) });
  } catch (e) {
    return Response.json({ list: [], error: String(e).slice(0, 200) });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!kvOk(env)) return Response.json({ error: "kv_not_configured" }, { status: 400 });
  let body = {};
  try { body = await request.json(); } catch {}
  let spec;
  try { spec = normalizeSpec(body.spec || body); } catch (e) { return Response.json({ error: String(e.message || e) }, { status: 400 }); }
  try {
    const now = Date.now();
    let idx = await readIndex(env);
    const prev = idx.find((m) => m.id === spec.id);
    const created = (prev && prev.created) || now;
    await kvPut(env, SPEC_KEY(spec.id), JSON.stringify({ ...spec, created, updated: now }));
    idx = idx.filter((m) => m.id !== spec.id);
    idx.unshift({
      id: spec.id, name: spec.name, target: spec.target, criteria: spec.rubric.length,
      created, updated: now, runs: (prev && prev.runs) || 0, lastTotal: (prev && prev.lastTotal) ?? null,
    });
    while (idx.length > CAP) { const o = idx.pop(); await kvDel(env, SPEC_KEY(o.id)); await kvDel(env, RESULTS_KEY(o.id)); }
    await kvPut(env, INDEX_KEY, JSON.stringify(idx));
    return Response.json({ id: spec.id, spec: { ...spec, created, updated: now } });
  } catch (e) {
    return Response.json({ error: String(e).slice(0, 250) }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  if (!kvOk(env)) return Response.json({ ok: false });
  const u = new URL(request.url);
  try {
    if (u.searchParams.get("all")) {
      const idx = await readIndex(env);
      for (const m of idx) { await kvDel(env, SPEC_KEY(m.id)); await kvDel(env, RESULTS_KEY(m.id)); }
      await kvPut(env, INDEX_KEY, "[]");
      return Response.json({ ok: true });
    }
    const id = u.searchParams.get("id");
    if (id) {
      const idx = (await readIndex(env)).filter((m) => m.id !== id);
      await kvDel(env, SPEC_KEY(id));
      await kvDel(env, RESULTS_KEY(id));
      await kvPut(env, INDEX_KEY, JSON.stringify(idx));
      return Response.json({ ok: true });
    }
    return Response.json({ ok: false });
  } catch (e) {
    return Response.json({ ok: false, error: String(e).slice(0, 200) });
  }
}

// Delade helpers för run.js (samma KV-lager).
export const LAB = { INDEX_KEY, SPEC_KEY, RESULTS_KEY, RESULTS_CAP, nsId, kvOk, kvBase, kvAuth, kvGet, kvPut, readIndex };
