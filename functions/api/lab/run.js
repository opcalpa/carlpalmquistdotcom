// AI Eval Lab — motorn (Cloudflare Pages Function)
//   POST /api/lab/run  { evalId, input, label? }     -> kör evalen mot ETT inmatat exempel
//   POST /api/lab/run  { evalId, mode: "golden" }    -> domar-validering mot spec.golden
//
// Detta är den handbyggda motorn. Den är AVSIKTLIGT läsbar — fyra konkreta steg du kan följa:
//   1) bygg domar-prompten ur rubriken + skalan + chain-of-thought-instruktionen + inputen
//   2) anropa Claude som domare (raw fetch, samma mönster som concept.js)
//   3) parsa strukturerat svar (poäng + motivering per kriterium)
//   4) räkna viktad total, spara ett resultat-record
// Domaren ÄR bara så bra som rubriken: golden-läget jämför domarens poäng med dina förväntningar
// (agreement) så du kan validera domaren innan du litar på den.

// --- Prissättning (claude-sonnet-4-6, USD per 1M tokens). Verifiera mot aktuell prislista. ---
const PRICING = { "claude-sonnet-4-6": { in: 3.0, out: 15.0 } };
const costUsd = (model, usage) => {
  const p = PRICING[model] || PRICING["claude-sonnet-4-6"];
  const i = (usage && usage.input_tokens) || 0, o = (usage && usage.output_tokens) || 0;
  return +(((i / 1e6) * p.in) + ((o / 1e6) * p.out)).toFixed(6);
};

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
const SPEC_KEY = (id) => "lab:eval:" + id;
const RESULTS_KEY = (id) => "lab:results:" + id;
const INDEX_KEY = "lab:evals:index";
const RESULTS_CAP = 50;

function extractJson(text) {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("inget json i domarens svar");
  return JSON.parse(text.slice(s, e + 1));
}

// STEG 1 — bygg domar-prompten. Det här är artefakten UI:t visar dig: exakt vad domaren ser.
function buildJudgePrompt(spec, input) {
  const crit = spec.rubric.map((c, i) =>
    `${i + 1}. "${c.criterion}" (vikt ${c.weight}) — ${c.desc || "bedöm detta kriterium"}`).join("\n");
  const keys = spec.rubric.map((c) => `"${c.criterion}": <heltal ${spec.scale.min}-${spec.scale.max}>`).join(", ");
  return `Du är en sträng, rättvis utvärderare. Betygsätt nedanstående ${spec.target} mot rubriken.

RUBRIK (kriterier att betygsätta):
${crit}

SKALA: ${spec.scale.min}–${spec.scale.max} (heltal). ${spec.scale.min} = mycket svagt, ${spec.scale.max} = utmärkt.

INSTRUKTION: Resonera kort steg för steg (chain-of-thought) för VARJE kriterium innan du sätter siffran. Var konsekvent och hård men rättvis — luta inte mot mitten.

Svara med ENBART giltig JSON, inga kodblock-markörer, inget annat:
{ "scores": { ${keys} }, "reasoning": "<1-3 meningar samlad motivering>" }

${spec.target.toUpperCase()} ATT BEDÖMA:
"""
${String(input).slice(0, 12000)}
"""`;
}

// STEG 2 — anropa Claude som domare. Icke-streamande: domar-svaret är litet, och vi vill ha usage för kostnad.
async function callJudge(model, prompt, apiKey) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 1500, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  return { text, usage: data.usage || {} };
}

// STEG 3 + 4 — parsa, räkna viktad total, bygg ett resultat-record.
function scoreFromJudge(spec, judged, usage, model, t0, now) {
  const scores = (judged && judged.scores) || {};
  let total = 0; const perCriterion = {};
  for (const c of spec.rubric) {
    let s = Number(scores[c.criterion]);
    if (!Number.isFinite(s)) s = spec.scale.min;
    s = Math.max(spec.scale.min, Math.min(spec.scale.max, s));
    perCriterion[c.criterion] = s;
    total += s * c.weight;
  }
  total = +total.toFixed(2);
  return {
    total, passed: total >= spec.threshold,
    scores: perCriterion, reasoning: String((judged && judged.reasoning) || "").slice(0, 800),
    model, cost: costUsd(model, usage), tokens: { in: usage.input_tokens || 0, out: usage.output_tokens || 0 },
    latencyMs: now - t0, ts: now,
  };
}

async function runOne(spec, input, apiKey, now) {
  const model = spec.judge.model || "claude-sonnet-4-6";
  const prompt = buildJudgePrompt(spec, input);
  const t0 = now;
  const { text, usage } = await callJudge(model, prompt, apiKey);
  const judged = extractJson(text);
  const res = scoreFromJudge(spec, judged, usage, model, t0, Date.now());
  return { res, prompt };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const apiKey = env.ANTHROPIC_API_KEY || env.ANTROPHIC_API_KEY;
  if (!apiKey) return Response.json({ error: "no_api_key" }, { status: 400 });
  if (!kvOk(env)) return Response.json({ error: "kv_not_configured" }, { status: 400 });

  let body = {};
  try { body = await request.json(); } catch {}
  const evalId = String(body.evalId || "").trim();
  if (!evalId) return Response.json({ error: "evalId saknas" }, { status: 400 });

  let spec;
  try { spec = JSON.parse((await kvGet(env, SPEC_KEY(evalId))) || "null"); } catch { spec = null; }
  if (!spec) return Response.json({ error: "eval hittades ej" }, { status: 404 });

  try {
    // --- Domar-validering: kör hela golden-setet, mät hur väl domaren håller med dina förväntningar ---
    if (body.mode === "golden") {
      if (!spec.golden || !spec.golden.length) return Response.json({ error: "inga golden-exempel i specen" }, { status: 400 });
      const rows = [];
      for (const g of spec.golden) {
        const { res } = await runOne(spec, g.input, apiKey, Date.now());
        const agree = Number.isFinite(+g.expectedMin) ? (res.total >= +g.expectedMin) : null;
        rows.push({ input: g.input.slice(0, 200), expectedMin: g.expectedMin, total: res.total, agree, reasoning: res.reasoning });
      }
      const scored = rows.filter((r) => r.agree !== null);
      const agreement = scored.length ? +(scored.filter((r) => r.agree).length / scored.length).toFixed(2) : null;
      return Response.json({ mode: "golden", agreement, count: scored.length, rows });
    }

    // --- Enskild körning mot ETT inmatat exempel ---
    const input = String(body.input || "").trim();
    if (!input) return Response.json({ error: "input saknas" }, { status: 400 });
    const { res, prompt } = await runOne(spec, input, apiKey, Date.now());
    const record = { ...res, input: input.slice(0, 1500), label: String(body.label || "").slice(0, 80) || null };

    // Spara i körhistoriken (capped) + uppdatera index-snabbfakta.
    let results = [];
    try { results = JSON.parse((await kvGet(env, RESULTS_KEY(evalId))) || "[]"); } catch {}
    results.unshift(record);
    while (results.length > RESULTS_CAP) results.pop();
    await kvPut(env, RESULTS_KEY(evalId), JSON.stringify(results));
    try {
      const idx = JSON.parse((await kvGet(env, INDEX_KEY)) || "[]");
      const row = idx.find((m) => m.id === evalId);
      if (row) { row.runs = (row.runs || 0) + 1; row.lastTotal = res.total; await kvPut(env, INDEX_KEY, JSON.stringify(idx)); }
    } catch {}

    return Response.json({ result: record, assembledPrompt: prompt });
  } catch (e) {
    return Response.json({ error: String(e).slice(0, 250) }, { status: 500 });
  }
}
