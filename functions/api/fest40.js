// Eventplanering — publik, valfritt kodgatad delningssida. Samma KV som Forge/Maria.
// ⚠️ ALL eventdata (gästnamn, noteringar) ligger i KV — ALDRIG i denna PUBLIKA repo-källa.
//
// DATADRIVET (beslut 2026-08-26): denna endpoint vet ingenting om "Calle 40". Den serverar ett
// EVENT-objekt ur KV per slug, så nästa fest/middag/bröllop är ett nytt KV-objekt, inte ett nytt bygge.
//   GET  /api/fest40?slug=calle40&pw=          -> { event, changelog }        (401 vid fel kod)
//   POST /api/fest40?slug=calle40&kind=toggle  {pw,name,id}                   -> bocka av/på
//   POST /api/fest40?slug=calle40&kind=add     {pw,name,text,category,tag,due}-> ny rad
//   POST /api/fest40?slug=calle40&kind=tag     {pw,name,id,tag}               -> sätt/ändra tagg
//   POST /api/fest40?slug=calle40&kind=guest   {pw,name,id,status}            -> gäststatus
//   POST /api/fest40?slug=calle40&kind=recipe  {pw,name,title,url,ingredients}-> föreslå recept
//   POST /api/fest40?slug=calle40&kind=rstar   {pw,name,id}                   -> förslag <-> utvald
//   POST /api/fest40?slug=calle40&kind=rimage  {pw,name,id,image}             -> sätt/byt bild
//   PUT  /api/fest40?slug=calle40              {admin,event}                  -> seeda/spegla från pappen
//
// Lösenord: event.gate === false => öppen sida (obfuskerad slug är skyddet). Annars event.pw || FEST40_PW.

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

const ADMIN = "fest-admin-9c4m2v";        // hindrar oavsiktlig överskrivning från pappen; ej en hemlighet
const LOG_CAP = 300, NAME_MAX = 40, TEXT_MAX = 120, TAG_MAX = 40;
const TITLE_MAX = 90, URL_MAX = 400, ING_MAX = 60, ING_LINES = 40;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
const K_EVENT = (s) => `event:${s}`, K_LOG = (s) => `event:${s}:log`;
const rlKey = (s, i) => `event:${s}:rl:${i}`, failKey = (s, i) => `event:${s}:fail:${i}`;
const RL_MAX = 200, RL_WINDOW = 600;      // max 200 skrivningar per IP / 10 min (familj som bockar av)
const FAIL_MAX = 20, FAIL_WINDOW = 600;

const sanitize = (s, max) => (s || "").toString().replace(/[\x00-\x1F\x7F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const slugOf = (u) => { const s = (u.searchParams.get("slug") || "").toLowerCase(); return SLUG_RE.test(s) ? s : null; };
const mkId = () => "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const isPublicHost = (u) => /(^|\.)carlpalmquist\.com$/i.test(u.hostname);
// Kodgrind per event: gate:false => öppen. Annars eventets egen kod, annars env-default.
const gateOk = (ev, env, pw) => (ev && ev.gate === false) ? true : (String(pw || "") === String((ev && ev.pw) || env.FEST40_PW || "4029"));

// Minimal recept-extraktor för Workern: JSON-LD (schema.org/Recipe) + og:image som reserv.
// Speglar pappens extractRecipeFromHtml men bara det delningssidan behöver — titel,
// ingredienser och bild. Utförandet läser man på originalsidan, så steg hämtas inte.
function pickRecipeNode(node) {
  if (!node || typeof node !== "object") return null;
  const t = node["@type"];
  const isRecipe = Array.isArray(t) ? t.includes("Recipe") : t === "Recipe";
  if (isRecipe) return node;
  for (const k of ["@graph", "itemListElement"]) {
    if (Array.isArray(node[k])) { for (const c of node[k]) { const f = pickRecipeNode(c); if (f) return f; } }
  }
  return null;
}
function metaContent(html, prop) {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, "i"));
  if (!m) return "";
  const c = m[0].match(/content=["']([^"']*)["']/i);
  return c ? c[1].trim() : "";
}
async function fetchRecipeFromUrl(url) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; fest40)" }, redirect: "follow" });
  if (!r.ok) return null;
  const html = (await r.text()).slice(0, 600000);
  let rec = null;
  const blocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const b of blocks) {
    const raw = b.replace(/^[\s\S]*?>/, "").replace(/<\/script>$/i, "");
    let data; try { data = JSON.parse(raw); } catch { continue; }
    for (const cand of (Array.isArray(data) ? data : [data])) { const f = pickRecipeNode(cand); if (f) { rec = f; break; } }
    if (rec) break;
  }
  let image = metaContent(html, "og:image") || "";
  let title = "", ingredients = [];
  if (rec) {
    title = typeof rec.name === "string" ? rec.name : "";
    const ing = rec.recipeIngredient || rec.ingredients || [];
    ingredients = (Array.isArray(ing) ? ing : [ing]).map((x) => String(x || "")).filter(Boolean);
    let im = rec.image;
    if (Array.isArray(im)) im = im[0];
    if (im && typeof im === "object") im = im.url || im.contentUrl || "";
    if (typeof im === "string" && im) image = im;
  }
  if (!title) title = (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || "").trim();
  if (image && !/^https?:\/\//i.test(image)) { try { image = new URL(image, url).href; } catch { image = ""; } }
  return { title, ingredients, image };
}
// Bild: direkt bildlänk används rakt av, annars hämtas sidans og:image.
async function resolveImage(candidate) {
  const v = String(candidate || "").trim();
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) return "";
  if (/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(v)) return v;
  try {
    const r = await fetch(v, { headers: { "User-Agent": "Mozilla/5.0 (compatible; fest40)" }, redirect: "follow" });
    if (!r.ok) return "";
    let im = metaContent((await r.text()).slice(0, 400000), "og:image");
    if (im && !/^https?:\/\//i.test(im)) { try { im = new URL(im, v).href; } catch { im = ""; } }
    return im || "";
  } catch { return ""; }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const u = new URL(request.url);
  if (!kvOk(env)) return Response.json({ error: "kv_not_configured" }, { status: 500 });
  const slug = slugOf(u);
  if (!slug) return Response.json({ error: "bad_slug" }, { status: 400 });
  const ip = clientIp(request);
  const pub = isPublicHost(u);
  if (pub) {
    const fails = parseInt((await kvGet(env, failKey(slug, ip)).catch(() => null)) || "0", 10) || 0;
    if (fails >= FAIL_MAX) return Response.json({ error: "rate_limited" }, { status: 429 });
  }
  const ev = await readJson(env, K_EVENT(slug), null);
  if (!ev) return Response.json({ error: "not_found" }, { status: 404 });
  if (!gateOk(ev, env, u.searchParams.get("pw"))) {
    if (pub) {
      const fails = parseInt((await kvGet(env, failKey(slug, ip)).catch(() => null)) || "0", 10) || 0;
      await kvPut(env, failKey(slug, ip), String(fails + 1), FAIL_WINDOW).catch(() => {});
    }
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const changelog = await readJson(env, K_LOG(slug), []);
  const { pw, ...safe } = ev;               // skicka aldrig ut koden till klienten
  return Response.json({ event: safe, changelog });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const u = new URL(request.url);
  if (!kvOk(env)) return Response.json({ error: "kv_not_configured" }, { status: 500 });
  const slug = slugOf(u);
  if (!slug) return Response.json({ error: "bad_slug" }, { status: 400 });
  let body = {}; try { body = await request.json(); } catch {}
  const ev = await readJson(env, K_EVENT(slug), null);
  if (!ev) return Response.json({ error: "not_found" }, { status: 404 });
  if (!gateOk(ev, env, body.pw)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const ip = clientIp(request);
  const rl = parseInt((await kvGet(env, rlKey(slug, ip)).catch(() => null)) || "0", 10) || 0;
  if (isPublicHost(u) && rl >= RL_MAX) return Response.json({ error: "rate_limited" }, { status: 429 });

  const kind = u.searchParams.get("kind");
  const by = sanitize(body.name, NAME_MAX) || "Någon";
  const ts = Date.now();
  let log = await readJson(env, K_LOG(slug), []);
  const note = (text) => log.push({ id: mkId(), by, ts, text: sanitize(text, 160) });

  ev.plan = Array.isArray(ev.plan) ? ev.plan : [];
  ev.guests = Array.isArray(ev.guests) ? ev.guests : [];
  ev.recipes = Array.isArray(ev.recipes) ? ev.recipes : [];

  if (kind === "toggle") {
    const it = ev.plan.find((p) => p.id === body.id);
    if (!it) return Response.json({ error: "not_found_item" }, { status: 404 });
    it.done = !it.done;
    note(`${it.done ? "bockade av" : "ångrade"} ”${it.text}”`);
  } else if (kind === "add") {
    const text = sanitize(body.text, TEXT_MAX);
    if (!text) return Response.json({ error: "empty" }, { status: 400 });
    const cats = (ev.categories && ev.categories.length) ? ev.categories : ["Inhandling", "Fixa"];
    const category = cats.includes(body.category) ? body.category : cats[0];
    const item = { id: mkId(), text, done: false, due: sanitize(body.due, 12) || "", category, tag: sanitize(body.tag, TAG_MAX) };
    ev.plan.push(item);
    note(`la till ”${text}”`);
  } else if (kind === "tag") {
    const it = ev.plan.find((p) => p.id === body.id);
    if (!it) return Response.json({ error: "not_found_item" }, { status: 404 });
    it.tag = sanitize(body.tag, TAG_MAX);
    note(`taggade ”${it.text}” som ${it.tag || "(ingen)"}`);
  } else if (kind === "guest") {
    const g = ev.guests.find((x) => x.id === body.id);
    if (!g) return Response.json({ error: "not_found_guest" }, { status: 404 });
    const st = ["ja", "nej", "väntar"].includes(body.status) ? body.status : "väntar";
    g.status = st;
    note(`satte ${g.name} till ${st}`);
  } else if (kind === "recipe") {
    // Gästförslag. ID SÄTTS HÄR, VID SKRIVNINGEN — pappen slår upp rader på id, och en post
    // utan id ger en knapp som ser rätt ut men är död, helt utan felmeddelande. Bet 2026-08-26.
    let title = sanitize(body.title, TITLE_MAX);
    const url = sanitize(body.url, URL_MAX);
    let ingredients = (Array.isArray(body.ingredients) ? body.ingredients : String(body.ingredients || "").split("\n"))
      .map((x) => sanitize(x, ING_MAX)).filter(Boolean).slice(0, ING_LINES);
    let image = "", linkFailed = false;
    if (url && /^https?:\/\//i.test(url)) {
      try {
        const got = await fetchRecipeFromUrl(url);
        if (got) {
          if (!title) title = sanitize(got.title, TITLE_MAX);
          if (!ingredients.length) ingredients = got.ingredients.map((x) => sanitize(x, ING_MAX)).filter(Boolean).slice(0, ING_LINES);
          image = got.image || "";
        } else linkFailed = true;
      } catch { linkFailed = true; }   // nätfel/död länk — skiljs från "gav ingenting alls"
    }
    // Skilj på "du skrev ingenting" och "länken gick inte att läsa". Utan den skillnaden får
    // en gäst som klistrat in en trasig länk felet "empty", vilket inte betyder något för hen.
    if (!title) return Response.json({ error: linkFailed ? "link_unreadable" : "empty" }, { status: 400 });
    ev.recipes.push({ id: mkId(), slug: "", title, image, servings: 0, status: "forslag",
      source: url, ingredients, fromGuest: true, by });
    note(`föreslog receptet ”${title}”`);
  } else if (kind === "rstar") {
    const r = ev.recipes.find((x) => x.id === body.id);
    if (!r) return Response.json({ error: "not_found_recipe" }, { status: 404 });
    r.status = r.status === "forslag" ? "utvald" : "forslag";
    note(`${r.status === "utvald" ? "valde ut" : "flyttade tillbaka"} ”${r.title}”`);
  } else if (kind === "rimage") {
    const r = ev.recipes.find((x) => x.id === body.id);
    if (!r) return Response.json({ error: "not_found_recipe" }, { status: 404 });
    const raw = sanitize(body.image, URL_MAX);
    if (!raw) { r.image = ""; note(`tog bort bilden på ”${r.title}”`); }
    else {
      const im = await resolveImage(raw);
      if (!im) return Response.json({ error: "no_image" }, { status: 422 });
      r.image = im;
      note(`satte bild på ”${r.title}”`);
    }
  } else {
    return Response.json({ error: "bad_kind" }, { status: 400 });
  }

  ev.updatedAt = ts;
  if (log.length > LOG_CAP) log.splice(0, log.length - LOG_CAP);
  await kvPut(env, K_EVENT(slug), JSON.stringify(ev));
  await kvPut(env, K_LOG(slug), JSON.stringify(log));
  await kvPut(env, rlKey(slug, ip), String(rl + 1), RL_WINDOW);
  const { pw, ...safe } = ev;
  return Response.json({ event: safe, changelog: log });
}

// Spegling från pappen (#/fest40 är sanningskällan för struktur/seed).
export async function onRequestPut(context) {
  const { request, env } = context;
  const u = new URL(request.url);
  if (!kvOk(env)) return Response.json({ error: "kv_not_configured" }, { status: 500 });
  const slug = slugOf(u);
  if (!slug) return Response.json({ error: "bad_slug" }, { status: 400 });
  let body = {}; try { body = await request.json(); } catch {}
  if (body.admin !== ADMIN) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!body.event || typeof body.event !== "object") return Response.json({ error: "no_event" }, { status: 400 });
  const prev = await readJson(env, K_EVENT(slug), null);
  // Bevara koden om pappen inte skickar med den (den bor bara i KV).
  const ev = Object.assign({}, body.event, { updatedAt: Date.now() });
  if (!ev.pw && prev && prev.pw) ev.pw = prev.pw;
  // PUT ERSÄTTER HELA EVENTET. Gästernas receptförslag som pappen ännu inte hämtat hem skulle
  // därför raderas tyst av nästa push. Behåll dem tills pappen skickar tillbaka dem uppslagna.
  if (prev && Array.isArray(prev.recipes)) {
    const kommer = new Set((ev.recipes || []).map((r) => r.id));
    const kvar = prev.recipes.filter((r) => r && r.fromGuest && !kommer.has(r.id));
    if (kvar.length) ev.recipes = (ev.recipes || []).concat(kvar);
  }
  await kvPut(env, K_EVENT(slug), JSON.stringify(ev));
  return Response.json({ ok: true, slug, items: (ev.plan || []).length, guests: (ev.guests || []).length });
}
