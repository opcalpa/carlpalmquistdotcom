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
//   POST /api/fest40?slug=calle40&kind=edit    {pw,name,id,text}              -> ändra radens text
//   POST /api/fest40?slug=calle40&kind=del     {pw,name,id}                   -> ta bort rad
//   POST /api/fest40?slug=calle40&kind=rdel    {pw,name,id}                   -> ta bort recept
//   POST .. kind=badd|bedit|bstat|bdel         budget  {label,est} / {id,..}  -> budgetposter
//   POST .. kind=padd|pedit|pdel               program {time,text} / {id,..}  -> programpunkter
//   POST .. kind=gadd|gedit|gdel               gäster  {guestName,household,barn} -> gästlistan
//   POST .. kind=dadd|dedit|ddel               underlag{title,body}           -> fria underlag
//   POST .. kind=ringred|rsteps                recept  {id,text}              -> ingredienser/utförande
//   POST .. kind=shopadd|shopedit|shoptoggle|shopdel   inköpslistan (artikel+antal+tagg)
//   POST .. kind=shopfrom                      {id?}                          -> hämta in utvalda rätter
//   POST .. kind=cook                          {n}                            -> vi lagar för N personer
//   POST .. kind=rserv                         {id,n}                         -> receptets egna portioner
//   POST .. kind=rport                         {id,n}                         -> hur många VI lagar av rätten
//   POST .. kind=rtitle                        {id,title}                     -> döp om rätten
//   POST .. kind=rhave                         {id,line}                      -> "har hemma" på/av
// FULL PARITET (2026-08-27): allt Calle kan redigera i pappen går att redigera här. Sidan är
// ett delat planeringsverktyg som ersätter ett Google Sheet, inte en avbockningsvy.
//
// GRAVSTENAR (ev.deleted): en radering kan inte uttryckas som "raden saknas", för det betyder
// också "raden är ny i pappen och inte publicerad än". Utan gravsten kommer varje rad familjen
// tar bort tillbaka som ett spöke vid nästa synk. Gravstenen bevaras tills pappen bevisat att
// den tagit emot raderingen (raden saknas i inkommande PUT), sedan städas den bort av sig själv.
//   PUT  /api/fest40?slug=calle40              {admin,event}                  -> seeda/spegla från pappen
//
// Lösenord: event.gate === false => öppen sida (obfuskerad slug är skyddet). Annars event.pw || FEST40_PW.

const nsId = (env) => env.KV_NAMESPACE_ID || env.KV_NAMSPACE_ID;
const kvOk = (env) => env.CF_ACCOUNT_ID && nsId(env) && env.CF_API_TOKEN;
// KV_API_BASE finns BARA för lokal testning: pekas den mot en stub körs hela testsviten utan
// att röra kontots KV-kvot (1 000 skrivningar/dygn, och den tog slut 2026-08-27 mitt i ett bygge).
// Osatt — som i drift — går allt till Cloudflare precis som förut.
const kvApi = (env) => env.KV_API_BASE || "https://api.cloudflare.com/client/v4";
const kvBase = (env) => `${kvApi(env)}/accounts/${env.CF_ACCOUNT_ID}/storage/kv/namespaces/${nsId(env)}`;
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
// Budget/program/gäster/underlag. BODY_MAX är generös med flit — underlagen bär
// menyresonemang och transport-research, alltså prosa, inte en etikett.
const LABEL_MAX = 70, TIME_MAX = 8, HOUSE_MAX = 60, BODY_MAX = 4000, EST_MAX = 9999999;
const ITEM_MAX = 70, QTY_MAX = 20, SHOP_CAP = 400, STEPS_MAX = 6000;
// Enheter vi vågar plocka ut som "antal". Allt annat blir en del av varunamnet — hellre en
// klumpig rad man kan redigera än en varusträng som tappat halva sitt namn.
const ENHETER = ["g","kg","hg","dl","cl","ml","l","msk","tsk","krm","st","pkt","paket","burk","burkar","påse","påsar","klyfta","klyftor","knippe","näve","port","skiva","skivor"];
// ── Portionsskalning ──────────────────────────────────────────────────────────
// Receptet är skrivet för N personer, festen lagar för M. Mängderna räknas om med M/N, och
// det är de OMRÄKNADE mängderna som hamnar på inköpslistan — annars handlar man för fyra
// när man ska laga till fyrtio. Samma funktion finns i sidan för visningen; ändras den här
// måste den ändras där (skalaQty i index.astro).
function talAv(s) {
  const t = String(s).trim();
  let m = t.match(/^(\d+(?:[.,]\d+)?)\s+(\d+)\/(\d+)/);              // "1 1/2"
  if (m) return { v: parseFloat(m[1].replace(",", ".")) + Number(m[2]) / Number(m[3]), len: m[0].length };
  m = t.match(/^(\d+)\/(\d+)/);                                        // "1/2"
  if (m) return { v: Number(m[1]) / Number(m[2]), len: m[0].length };
  m = t.match(/^(\d+(?:[.,]\d+)?)/);
  return m ? { v: parseFloat(m[1].replace(",", ".")), len: m[0].length } : null;
}
// Runda till något man kan handla efter. Ingen vill läsa "483,33 g nötfärs" i en butik.
function rundaMangd(v) {
  if (!isFinite(v) || v <= 0) return "0";
  if (v >= 100) return String(Math.round(v / 10) * 10);
  if (v >= 10) return String(Math.round(v));
  if (v >= 1) return String(Math.round(v * 2) / 2).replace(".", ",");
  return String(Math.round(v * 10) / 10).replace(".", ",");
}
// EN mängd, alltid som decimaltal. Beslut 2026-08-27 (Calle): inga bråk och inga intervall i
// resultatet. "1/2 dl" blir "0,5 dl", och "2–3 dl" blir "3 dl" — i en butik är ett spann inget
// man kan handla efter, och för en fest är det övre talet det som räcker. Vi normaliserar även
// när ingen skalning sker (faktor 1), så texten aldrig visar ett format man inte kan räkna med.
// Receptets EGEN text rörs inte — den ligger kvar rå bakom ✎.
function skalaQty(qty, f) {
  const t = String(qty || "").trim();
  if (!t) return t;
  const n = talAv(t);
  if (!n) return t;
  let v = n.v;
  let rest = t.slice(n.len);
  const r = rest.match(/^\s*[-–]\s*(\d+(?:[.,]\d+)?(?:\s+\d+\/\d+)?|\s*\d+\/\d+)/);
  if (r) {                                   // intervall: ta det övre talet och släng spannet
    const ovre = talAv(r[1].trim());
    if (ovre) v = ovre.v;
    rest = rest.slice(r[0].length);
  }
  return (rundaMangd(v * (f || 1)) + rest).replace(/\s+/g, " ").trim();
}
// Hur mycket receptet ska skalas. Saknas receptets egna portioner går det inte att räkna om —
// då lämnas mängderna som de står, hellre än att gissa.
// Två tal per rätt: vad receptet är SKRIVET för (servings) och hur många VI lagar av just den
// här rätten (portions). portions ärver festens tal om ingen satt ett eget — man lagar sällan
// olika mycket av varje rätt, men ibland: en efterrätt kan räcka till fler än en huvudrätt.
const lagarAv = (ev, r) => Number(r && r.portions) || Number(ev.info && ev.info.cook) || 0;
const skalfaktor = (ev, r) => {
  const lagar = lagarAv(ev, r);
  const bas = Number(r && r.servings) || 0;
  return (lagar > 0 && bas > 0) ? lagar / bas : 1;
};
// Nyckeln för "har hemma". Rå radtext, normaliserad — redigeras raden tappar den bara sin
// markering, vilket är ofarligt (varan kommer tillbaka på listan och kan markeras igen).
const haveKey = (rad) => String(rad || "").toLowerCase().replace(/\s+/g, " ").trim();

// "400 g kantareller" → { qty: "400 g", item: "kantareller" }. Medvetet enkel: familjen kan
// redigera båda fälten efteråt, så en missad delning kostar ett klick, inte en felaktig lista.
function delaIngrediens(rad) {
  const t = sanitize(rad, ITEM_MAX + QTY_MAX).replace(/^[-*•]\s*/, "");
  // talAv förstår även "1 1/2" och "1/2". Med en ren siffer-regex här blev "1 1/2 dl vatten"
  // till mängden "1" och varan "1/2 dl vatten" — och skalningen räknade sedan på fel tal.
  const n = talAv(t);
  if (!n) return { qty: "", item: t.slice(0, ITEM_MAX) };
  let tal = t.slice(0, n.len);
  let rest = t.slice(n.len).trim();
  const rng = rest.match(/^[-–]\s*(\d+(?:[.,]\d+)?)\s*/);     // "2-3 dl"
  if (rng) { tal = tal + "-" + rng[1]; rest = rest.slice(rng[0].length).trim(); }
  if (!rest) return { qty: "", item: t.slice(0, ITEM_MAX) };   // bara en siffra: låt den vara varan
  // Enheten räknas bara som enhet om något följer efter den. "3 ägg" har ingen enhet — ägg ÄR
  // varan — medan "2 dl grädde" har det. Utan det villkoret blev "3 ägg" en rad utan antal.
  const um = rest.match(/^([A-Za-zÅÄÖåäö]{1,7})\.?\s+(.+)$/);
  if (um && ENHETER.includes(um[1].toLowerCase())) {
    return { qty: (tal + " " + um[1].toLowerCase()).slice(0, QTY_MAX), item: um[2].trim().slice(0, ITEM_MAX) };
  }
  return { qty: tal.slice(0, QTY_MAX), item: rest.slice(0, ITEM_MAX) };
}
const BUDGET_STATUS = ["ej_bokad", "offert", "bokad", "betald"];   // samma kedja som pappen
const GUEST_STATUS = ["ja", "nej", "väntar", "ej_bjuden"];
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
const K_EVENT = (s) => `event:${s}`, K_LOG = (s) => `event:${s}:log`;
const failKey = (s, i) => `event:${s}:fail:${i}`;
const RL_MAX = 200, RL_WINDOW = 600;      // max 200 skrivningar per klient / 10 min (familj som bockar av)
const FAIL_MAX = 20, FAIL_WINDOW = 600;
// SKRIVBUDGET (2026-08-27). Gratisnivån ger 1 000 KV-SKRIVNINGAR per dygn, och ett enda
// knapptryck kostade tre: eventet, ändringsloggen och en rate-limit-räknare. Tre personer som
// planerar en festhelg slog därför i taket efter ~330 tryck — och då svarar sidan 429 och
// SLUTAR SPARA mitt i planeringen. Loggen och räknaren bor numera inuti eventet, som ändå
// läses och skrivs. Ett tryck = EN skrivning. Läsningar (100 000/dygn) är inte flaskhalsen.
// Klienten identifieras med en kort hash av IP:n, inte IP:n i klartext — det räcker för att
// skilja klienter åt utan att lägga en personuppgift i lagret.
const ipHash = (ip) => { let h = 2166136261; for (let i = 0; i < ip.length; i++) { h ^= ip.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); };
// Eventet kan komma från tiden då loggen låg i en egen nyckel. Läs över den en gång; nästa
// skrivning lägger den på plats inuti eventet och den gamla nyckeln blir bara liggande.
async function lasEvent(env, slug) {
  const ev = await readJson(env, K_EVENT(slug), null);
  if (ev && !Array.isArray(ev.log)) ev.log = await readJson(env, K_LOG(slug), []);
  return ev;
}

const sanitize = (s, max) => (s || "").toString().replace(/[\x00-\x1F\x7F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
// Underlagen är prosa — radbrytningarna ÄR innehållet (menyresonemang, transportlistor).
// sanitize() plattar allt whitespace till mellanslag och hade tvättat bort styckena.
const sanitizeMulti = (s, max) => (s || "").toString().replace(/\r\n?/g, "\n")
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ").replace(/[ \t]+/g, " ")
  .replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
const slugOf = (u) => { const s = (u.searchParams.get("slug") || "").toLowerCase(); return SLUG_RE.test(s) ? s : null; };
const mkId = () => "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
// "2 400 kr" är hur folk skriver belopp. Number() ger NaN på det, alltså tyst 0 kr i budgeten.
const kronor = (v) => Math.max(0, Math.min(EST_MAX, Math.round(Number(String(v == null ? "" : v).replace(/[^0-9.]/g, "")) || 0)));
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
// recipeInstructions kan vara en sträng, en lista strängar, HowToStep-objekt eller
// HowToSection med nästlade steg. Platta ut allt till rena rader.
function plattaSteg(x) {
  if (!x) return [];
  if (typeof x === "string") return x.split(/\n+/).map((t) => t.trim()).filter(Boolean);
  if (Array.isArray(x)) return x.flatMap(plattaSteg);
  if (typeof x === "object") {
    if (Array.isArray(x.itemListElement)) return plattaSteg(x.itemListElement);
    const t = x.text || x.name || "";
    return t ? [String(t).replace(/\s+/g, " ").trim()] : [];
  }
  return [];
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
  let title = "", ingredients = [], steps = [];
  if (rec) {
    title = typeof rec.name === "string" ? rec.name : "";
    const ing = rec.recipeIngredient || rec.ingredients || [];
    ingredients = (Array.isArray(ing) ? ing : [ing]).map((x) => String(x || "")).filter(Boolean);
    steps = plattaSteg(rec.recipeInstructions);
    let im = rec.image;
    if (Array.isArray(im)) im = im[0];
    if (im && typeof im === "object") im = im.url || im.contentUrl || "";
    if (typeof im === "string" && im) image = im;
  }
  if (!title) title = (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || "").trim();
  if (image && !/^https?:\/\//i.test(image)) { try { image = new URL(image, url).href; } catch { image = ""; } }
  return { title, ingredients, image, steps };
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
  const ev = await lasEvent(env, slug);
  if (!ev) return Response.json({ error: "not_found" }, { status: 404 });
  if (!gateOk(ev, env, u.searchParams.get("pw"))) {
    if (pub) {
      const fails = parseInt((await kvGet(env, failKey(slug, ip)).catch(() => null)) || "0", 10) || 0;
      await kvPut(env, failKey(slug, ip), String(fails + 1), FAIL_WINDOW).catch(() => {});
    }
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const changelog = Array.isArray(ev.log) ? ev.log : [];
  const { pw, log, rl, ...safe } = ev;      // koden, loggen och rate-limit-hinkarna stannar här
  return Response.json({ event: safe, changelog });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const u = new URL(request.url);
  if (!kvOk(env)) return Response.json({ error: "kv_not_configured" }, { status: 500 });
  const slug = slugOf(u);
  if (!slug) return Response.json({ error: "bad_slug" }, { status: 400 });
  let body = {}; try { body = await request.json(); } catch {}
  const ev = await lasEvent(env, slug);
  if (!ev) return Response.json({ error: "not_found" }, { status: 404 });
  if (!gateOk(ev, env, body.pw)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const ip = clientIp(request);
  const ts = Date.now();
  // Rate-limit-hinken låg förut i en egen KV-nyckel med TTL. Nu i eventet, med tiden i hinken
  // som TTL-ersättare: en hink som inte rörts på RL_WINDOW sekunder börjar om från noll.
  ev.rl = (ev.rl && typeof ev.rl === "object") ? ev.rl : {};
  const rlk = ipHash(ip);
  const hink = ev.rl[rlk];
  const rl = (hink && hink.t > ts - RL_WINDOW * 1000) ? (hink.n || 0) : 0;
  if (isPublicHost(u) && rl >= RL_MAX) return Response.json({ error: "rate_limited" }, { status: 429 });

  const kind = u.searchParams.get("kind");
  const by = sanitize(body.name, NAME_MAX) || "Någon";
  let log = Array.isArray(ev.log) ? ev.log : [];
  const note = (text) => log.push({ id: mkId(), by, ts, text: sanitize(text, 160) });

  ev.plan = Array.isArray(ev.plan) ? ev.plan : [];
  ev.guests = Array.isArray(ev.guests) ? ev.guests : [];
  ev.recipes = Array.isArray(ev.recipes) ? ev.recipes : [];
  ev.budget = Array.isArray(ev.budget) ? ev.budget : [];
  ev.program = Array.isArray(ev.program) ? ev.program : [];
  ev.docs = Array.isArray(ev.docs) ? ev.docs : [];
  ev.shop = Array.isArray(ev.shop) ? ev.shop : [];
  ev.deleted = Array.isArray(ev.deleted) ? ev.deleted : [];
  const tomb = (kind, id, title) => {
    if (!ev.deleted.some((d) => d.id === id)) ev.deleted.push({ id, kind, by, ts });
    if (ev.deleted.length > 200) ev.deleted.splice(0, ev.deleted.length - 200);
  };

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
    const item = { id: mkId(), text, done: false, due: sanitize(body.due, 12) || "", category, tag: sanitize(body.tag, TAG_MAX), fromGuest: true, by };
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
    const st = GUEST_STATUS.includes(body.status) ? body.status : "väntar";
    g.status = st;
    note(`satte ${g.name} till ${st}`);
  } else if (kind === "edit") {
    const it = ev.plan.find((p) => p.id === body.id);
    if (!it) return Response.json({ error: "not_found_item" }, { status: 404 });
    const text = sanitize(body.text, TEXT_MAX);
    if (!text) return Response.json({ error: "empty" }, { status: 400 });
    const before = it.text;
    it.text = text;
    note(`ändrade ”${before}” till ”${text}”`);
  } else if (kind === "del") {
    const i = ev.plan.findIndex((p) => p.id === body.id);
    if (i === -1) return Response.json({ error: "not_found_item" }, { status: 404 });
    const [gone] = ev.plan.splice(i, 1);
    tomb("plan", gone.id);
    note(`tog bort ”${gone.text}”`);
  } else if (kind === "rdel") {
    const i = ev.recipes.findIndex((r) => r.id === body.id);
    if (i === -1) return Response.json({ error: "not_found_recipe" }, { status: 404 });
    const [gone] = ev.recipes.splice(i, 1);
    tomb("recipe", gone.id);
    note(`tog bort receptet ”${gone.title}”`);
  } else if (kind === "recipe") {
    // Gästförslag. ID SÄTTS HÄR, VID SKRIVNINGEN — pappen slår upp rader på id, och en post
    // utan id ger en knapp som ser rätt ut men är död, helt utan felmeddelande. Bet 2026-08-26.
    let title = sanitize(body.title, TITLE_MAX);
    let url = sanitize(body.url, URL_MAX);
    // Sidan har numera EN ruta för både namn och länk. Klistras en länk in i namnfältet ska
    // den behandlas som en länk — inte sparas som en rätt vid namn "https://…".
    if (!url && /^https?:\/\/\S+$/i.test(title)) { url = title.slice(0, URL_MAX); title = ""; }
    let ingredients = (Array.isArray(body.ingredients) ? body.ingredients : String(body.ingredients || "").split("\n"))
      .map((x) => sanitize(x, ING_MAX)).filter(Boolean).slice(0, ING_LINES);
    let image = "", linkFailed = false, got_steps = [];
    if (url && /^https?:\/\//i.test(url)) {
      try {
        const got = await fetchRecipeFromUrl(url);
        if (got) {
          if (!title) title = sanitize(got.title, TITLE_MAX);
          if (!ingredients.length) ingredients = got.ingredients.map((x) => sanitize(x, ING_MAX)).filter(Boolean).slice(0, ING_LINES);
          got_steps = (got.steps || []).map((x) => sanitize(x, 400)).filter(Boolean).slice(0, 40);
          image = got.image || "";
        } else linkFailed = true;
      } catch { linkFailed = true; }   // nätfel/död länk — skiljs från "gav ingenting alls"
    }
    // Skilj på "du skrev ingenting" och "länken gick inte att läsa". Utan den skillnaden får
    // en gäst som klistrat in en trasig länk felet "empty", vilket inte betyder något för hen.
    if (!title) return Response.json({ error: linkFailed ? "link_unreadable" : "empty" }, { status: 400 });
    ev.recipes.push({ id: mkId(), slug: "", title, image, servings: 0, status: "forslag",
      source: url, ingredients, steps: (got_steps || []), fromGuest: true, by });
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
  // ───────── Full paritet med pappen (2026-08-27) ─────────
  // Budget, program, gästlista och underlag. Alla nya rader får sitt id HÄR, vid skrivningen
  // (CLAUDE.md §5): en post utan id ger i pappen en knapp som ser rätt ut men är död, tyst.
  // Alla nya rader märks fromGuest:true så nästa PUT från pappen inte hinner radera dem
  // innan de hämtats hem — samma skydd som receptförslagen har.
  } else if (kind === "badd") {
    const label = sanitize(body.label, LABEL_MAX);
    if (!label) return Response.json({ error: "empty" }, { status: 400 });
    ev.budget.push({ id: mkId(), label, est: kronor(body.est), status: "ej_bokad", fromGuest: true, by });
    note(`la till budgetposten ”${label}”`);
  } else if (kind === "bedit") {
    const b = ev.budget.find((x) => x.id === body.id);
    if (!b) return Response.json({ error: "not_found_budget" }, { status: 404 });
    if (body.label != null) {
      const label = sanitize(body.label, LABEL_MAX);
      if (!label) return Response.json({ error: "empty" }, { status: 400 });
      if (label !== b.label) note(`döpte om ”${b.label}” till ”${label}”`);
      b.label = label;
    }
    if (body.est != null && body.est !== "") {
      const est = kronor(body.est);
      if (est !== b.est) note(`satte ”${b.label}” till ${est} kr`);
      b.est = est;
    }
  } else if (kind === "bstat") {
    const b = ev.budget.find((x) => x.id === body.id);
    if (!b) return Response.json({ error: "not_found_budget" }, { status: 404 });
    const i = BUDGET_STATUS.indexOf(b.status);
    b.status = BUDGET_STATUS[(i + 1) % BUDGET_STATUS.length];   // okänd status (i = -1) landar på "ej_bokad"
    note(`satte ”${b.label}” till ${b.status.replace("_", " ")}`);
  } else if (kind === "bdel") {
    const i = ev.budget.findIndex((x) => x.id === body.id);
    if (i === -1) return Response.json({ error: "not_found_budget" }, { status: 404 });
    const [gone] = ev.budget.splice(i, 1);
    tomb("budget", gone.id);
    note(`tog bort budgetposten ”${gone.label}”`);
  } else if (kind === "padd") {
    const text = sanitize(body.text, TEXT_MAX);
    if (!text) return Response.json({ error: "empty" }, { status: 400 });
    ev.program.push({ id: mkId(), time: sanitize(body.time, TIME_MAX) || "—", text, fromGuest: true, by });
    note(`la till ”${text}” i programmet`);
  } else if (kind === "pedit") {
    const it = ev.program.find((x) => x.id === body.id);
    if (!it) return Response.json({ error: "not_found_program" }, { status: 404 });
    if (body.text != null) {
      const text = sanitize(body.text, TEXT_MAX);
      if (!text) return Response.json({ error: "empty" }, { status: 400 });
      if (text !== it.text) note(`ändrade programpunkten ”${it.text}” till ”${text}”`);
      it.text = text;
    }
    if (body.time != null) {
      const time = sanitize(body.time, TIME_MAX) || "—";
      if (time !== it.time) note(`flyttade ”${it.text}” till ${time}`);
      it.time = time;
    }
  } else if (kind === "pdel") {
    const i = ev.program.findIndex((x) => x.id === body.id);
    if (i === -1) return Response.json({ error: "not_found_program" }, { status: 404 });
    const [gone] = ev.program.splice(i, 1);
    tomb("program", gone.id);
    note(`tog bort ”${gone.text}” ur programmet`);
  } else if (kind === "gadd") {
    // guestName, INTE name: body.name är avsändaren (loggas som `by`). Delade de fält fick
    // varje ny gäst namnet på den som la in hen. Bet under testet 2026-08-27.
    const name = sanitize(body.guestName, NAME_MAX);
    if (!name) return Response.json({ error: "empty" }, { status: 400 });
    // "väntar", inte pappens "ej_bjuden": lägger familjen till någon HÄR är hen bjuden,
    // det som saknas är svaret.
    ev.guests.push({ id: mkId(), name, household: sanitize(body.household, HOUSE_MAX) || "Övriga",
      barn: !!body.barn, status: "väntar", note: "", fromGuest: true, by });
    note(`la till gästen ${name}`);
  } else if (kind === "gedit") {
    const g = ev.guests.find((x) => x.id === body.id);
    if (!g) return Response.json({ error: "not_found_guest" }, { status: 404 });
    if (body.guestName != null) {
      const name = sanitize(body.guestName, NAME_MAX);   // se noten vid gadd
      if (!name) return Response.json({ error: "empty" }, { status: 400 });
      if (name !== g.name) note(`ändrade ${g.name} till ${name}`);
      g.name = name;
    }
    if (body.household != null) {
      const h = sanitize(body.household, HOUSE_MAX) || "Övriga";
      if (h !== g.household) note(`flyttade ${g.name} till ${h}`);
      g.household = h;
    }
    if (body.barn != null) { g.barn = !!body.barn; note(`markerade ${g.name} som ${g.barn ? "barn" : "vuxen"}`); }
  } else if (kind === "gdel") {
    const i = ev.guests.findIndex((x) => x.id === body.id);
    if (i === -1) return Response.json({ error: "not_found_guest" }, { status: 404 });
    const [gone] = ev.guests.splice(i, 1);
    tomb("guest", gone.id);
    note(`tog bort gästen ${gone.name}`);
  } else if (kind === "dadd") {
    const title = sanitize(body.title, TITLE_MAX);
    if (!title) return Response.json({ error: "empty" }, { status: 400 });
    ev.docs.push({ id: mkId(), title, body: sanitizeMulti(body.body, BODY_MAX), fromGuest: true, by });
    note(`la till underlaget ”${title}”`);
  } else if (kind === "dedit") {
    const d = ev.docs.find((x) => x.id === body.id);
    if (!d) return Response.json({ error: "not_found_doc" }, { status: 404 });
    if (body.title != null) {
      const title = sanitize(body.title, TITLE_MAX);
      if (!title) return Response.json({ error: "empty" }, { status: 400 });
      if (title !== d.title) note(`döpte om underlaget ”${d.title}” till ”${title}”`);
      d.title = title;
    }
    // Tom textkropp är ett giltigt värde här (till skillnad från en titel) — man ska kunna
    // tömma ett underlag utan att behöva radera det.
    if (body.body != null) { d.body = sanitizeMulti(body.body, BODY_MAX); note(`skrev i ”${d.title}”`); }
  } else if (kind === "ddel") {
    const i = ev.docs.findIndex((x) => x.id === body.id);
    if (i === -1) return Response.json({ error: "not_found_doc" }, { status: 404 });
    const [gone] = ev.docs.splice(i, 1);
    tomb("doc", gone.id);
    note(`tog bort underlaget ”${gone.title}”`);
  // ───────── Recepten: ingredienser och utförande ─────────
  } else if (kind === "ringred" || kind === "rsteps") {
    const r = ev.recipes.find((x) => x.id === body.id);
    if (!r) return Response.json({ error: "not_found_recipe" }, { status: 404 });
    const rader = sanitizeMulti(body.text, kind === "rsteps" ? STEPS_MAX : BODY_MAX)
      .split("\n").map((x) => x.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
      .filter(Boolean).slice(0, kind === "rsteps" ? 40 : ING_LINES);
    if (kind === "ringred") { r.ingredients = rader.map((x) => x.slice(0, ING_MAX)); note(`skrev ingredienser till ”${r.title}”`); }
    else { r.steps = rader.map((x) => x.slice(0, 400)); note(`skrev utförande till ”${r.title}”`); }
    // En rätt vars innehåll någon skrivit för hand får inte skrivas över av registret vid
    // nästa Publicera. Märket säger åt pappen att raden ÄR redigerad här.
    r.edited = true;

  // ───────── Inköpslistan ─────────
  // Raderna MATERIALISERAS (till skillnad från pappens härledda lista): det är hela poängen
  // med "överför utvalda rätter". En härledd rad går inte att redigera, och familjen har salt
  // och olja hemma — de ska kunna ändra eller stryka en rad utan att röra receptet.
  } else if (kind === "shopadd") {
    const item = sanitize(body.item, ITEM_MAX);
    if (!item) return Response.json({ error: "empty" }, { status: 400 });
    if (ev.shop.length >= SHOP_CAP) return Response.json({ error: "full" }, { status: 400 });
    ev.shop.push({ id: mkId(), item, qty: sanitize(body.qty, QTY_MAX), tag: sanitize(body.tag, TAG_MAX),
      done: false, fromGuest: true, by });
    note(`la till ”${item}” på inköpslistan`);
  } else if (kind === "shopedit") {
    const r = ev.shop.find((x) => x.id === body.id);
    if (!r) return Response.json({ error: "not_found_shop" }, { status: 404 });
    if (body.item != null) {
      const item = sanitize(body.item, ITEM_MAX);
      if (!item) return Response.json({ error: "empty" }, { status: 400 });
      if (item !== r.item) note(`ändrade ”${r.item}” till ”${item}”`);
      r.item = item;
    }
    if (body.qty != null) r.qty = sanitize(body.qty, QTY_MAX);
    if (body.tag != null) r.tag = sanitize(body.tag, TAG_MAX);
  } else if (kind === "shoptoggle") {
    const r = ev.shop.find((x) => x.id === body.id);
    if (!r) return Response.json({ error: "not_found_shop" }, { status: 404 });
    r.done = !r.done;
    note(`${r.done ? "bockade av" : "ångrade"} ”${r.item}”`);
  } else if (kind === "shopdel") {
    const i = ev.shop.findIndex((x) => x.id === body.id);
    if (i === -1) return Response.json({ error: "not_found_shop" }, { status: 404 });
    const [gone] = ev.shop.splice(i, 1);
    tomb("shop", gone.id);
    note(`tog bort ”${gone.item}” från inköpslistan`);
  } else if (kind === "cook") {
    // Ett tal för hela festen: hur många vi lagar för. Receptsektionen styr det, och det slår
    // igenom på varje rätts mängder och därmed på inköpslistan.
    const n = Math.max(0, Math.min(999, Math.round(Number(body.n) || 0)));
    ev.info = ev.info || {};
    ev.info.cook = n;
    note(n ? `satte antalet till ${n} personer` : `tog bort antalet personer`);
  } else if (kind === "rserv") {
    const r = ev.recipes.find((x) => x.id === body.id);
    if (!r) return Response.json({ error: "not_found_recipe" }, { status: 404 });
    r.servings = Math.max(0, Math.min(999, Math.round(Number(body.n) || 0)));
    note(`satte ”${r.title}” till ${r.servings || "okänt antal"} portioner`);
  } else if (kind === "rport") {
    const r = ev.recipes.find((x) => x.id === body.id);
    if (!r) return Response.json({ error: "not_found_recipe" }, { status: 404 });
    const n = Math.max(0, Math.min(999, Math.round(Number(body.n) || 0)));
    // 0 = "följ festens tal igen". Det är vägen tillbaka från ett eget värde.
    r.portions = n;
    note(n ? `lagar ${n} portioner av ”${r.title}”` : `lät ”${r.title}” följa festens antal`);
  } else if (kind === "rtitle") {
    const r = ev.recipes.find((x) => x.id === body.id);
    if (!r) return Response.json({ error: "not_found_recipe" }, { status: 404 });
    const t = sanitize(body.title, TITLE_MAX);
    if (!t) return Response.json({ error: "empty" }, { status: 400 });
    const forut = r.title;
    r.title = t;
    // Inköpsraderna är taggade med rättens NAMN. Byter namnet måste taggarna följa med,
    // annars pekar de på en rätt som inte finns och hämtningen skulle lägga in allt igen.
    for (const x of ev.shop) if (x.fromRecipe === r.id || x.tag === forut) x.tag = sanitize(t, TAG_MAX);
    note(`döpte om ”${forut}” till ”${t}”`);
  } else if (kind === "rhave") {
    // Grönt = vi har det hemma. Markerade rader hoppas över när listan hämtas in.
    const r = ev.recipes.find((x) => x.id === body.id);
    if (!r) return Response.json({ error: "not_found_recipe" }, { status: 404 });
    const rad = sanitize(body.line, ING_MAX);
    if (!rad) return Response.json({ error: "empty" }, { status: 400 });
    r.have = Array.isArray(r.have) ? r.have : [];
    const k = haveKey(rad);
    const i = r.have.findIndex((x) => haveKey(x) === k);
    if (i === -1) {
      r.have.push(rad);
      // Ligger varan redan på inköpslistan från den här rätten ska den bort direkt — annars
      // hade "vi har det hemma" bara gällt nästa hämtning, vilket känns trasigt.
      const { item } = delaIngrediens(rad);
      if (item) ev.shop = ev.shop.filter((x) => !(x.fromRecipe === r.id && x.item.toLowerCase() === item.toLowerCase()));
      note(`markerade ”${rad}” som hemma (${r.title})`);
    } else {
      r.have.splice(i, 1);
      note(`avmarkerade ”${rad}” (${r.title})`);
    }
  } else if (kind === "shopfrom") {
    // Hämta in ingredienserna från de UTVALDA rätterna (eller en enskild, om id skickas med).
    // Varje rad taggas med rättens namn, så man ser i butiken vad den hör till.
    // Idempotent: en vara som redan finns med samma tagg läggs inte till igen, annars hade
    // varje tryck dubblerat listan. Raderar man en rad medvetet kommer den däremot tillbaka
    // vid nästa hämtning — det är en hämtning, inte en synk.
    const valda = ev.recipes.filter((r) => body.id ? r.id === body.id : r.status !== "forslag");
    if (!valda.length) return Response.json({ error: "inga_utvalda" }, { status: 400 });
    let nya = 0, hoppade = 0;
    for (const r of valda) {
      const tag = sanitize(r.title, TAG_MAX);
      const f = skalfaktor(ev, r);
      const have = new Set((r.have || []).map(haveKey));
      for (const rad of (r.ingredients || [])) {
        if (have.has(haveKey(rad))) { hoppade++; continue; }   // grönmarkerad = har hemma
        const { qty: rå, item } = delaIngrediens(rad);
        const qty = skalaQty(rå, f);
        if (!item) continue;
        const finns = ev.shop.some((x) => x.tag === tag && x.item.toLowerCase() === item.toLowerCase());
        if (finns) continue;
        if (ev.shop.length >= SHOP_CAP) break;
        ev.shop.push({ id: mkId(), item, qty, tag, done: false, fromRecipe: r.id, fromGuest: true, by });
        nya++;
      }
    }
    note(nya ? `hämtade in ${nya} varor från ${valda.length} rätt${valda.length > 1 ? "er" : ""}${hoppade ? ` (${hoppade} fanns hemma)` : ""}`
             : `hämtade in inköpslistan (inget nytt${hoppade ? `, ${hoppade} fanns hemma` : ""})`);
  } else {
    return Response.json({ error: "bad_kind" }, { status: 400 });
  }

  ev.updatedAt = ts;
  if (log.length > LOG_CAP) log.splice(0, log.length - LOG_CAP);
  ev.log = log;
  ev.rl[rlk] = { n: rl + 1, t: ts };
  // Städa hinkar som gjort sitt, annars växer objektet för varje besökare som någonsin varit här.
  for (const k of Object.keys(ev.rl)) if (!(ev.rl[k].t > ts - RL_WINDOW * 1000)) delete ev.rl[k];
  // ← EN skrivning, inte tre. Går den ändå fel (kontots dygnskvot tog slut 2026-08-27) ska
  // svaret säga det rakt ut, inte lämna en 500 som sidan tolkar som "något gick fel".
  try {
    await kvPut(env, K_EVENT(slug), JSON.stringify(ev));
  } catch (e) {
    const full = /\b429\b/.test(String(e && e.message));
    return Response.json({ error: full ? "kv_full" : "kv_error" }, { status: full ? 503 : 500 });
  }
  const { pw, log: _l, rl: _r, ...safe } = ev;
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
  // Ändringsloggen och rate-limit-hinkarna hör till SIDAN, inte till pappens strukturspegling.
  // Sedan de flyttade in i eventet hade varje Publicera annars raderat hela historiken.
  // Antalet personer sätts på SIDAN. Skickar pappen ett info-block utan cook hade speglingen
  // annars nollställt det och alla mängder hoppat tillbaka.
  // Pappen skickar alltid ett tal, ofta 0 innan den hunnit hämta hem sidans värde. 0 betyder
  // "jag vet inte", inte "sätt till noll" — utan detta hoppade alla mängder tillbaka till
  // oskalade så fort Calle tryckte Publicera. Nollställning sker på sidan, inte via speglingen.
  if (prev && prev.info && Number(prev.info.cook) > 0 && !(Number(ev.info && ev.info.cook) > 0)) {
    ev.info = Object.assign({}, ev.info, { cook: Number(prev.info.cook) });
  }
  if (prev && Array.isArray(prev.log)) ev.log = prev.log;
  if (prev && prev.rl) ev.rl = prev.rl;
  // PUT ERSÄTTER HELA EVENTET. Rader som familjen skapat HÄR och pappen ännu inte hämtat hem
  // skulle därför raderas tyst av nästa push. Behåll dem tills pappen skickar tillbaka dem.
  // Gäller alla listor sedan sidan fick full paritet (2026-08-27), inte bara recepten:
  // en budgetpost mamma la in är precis lika lätt att tappa som ett receptförslag.
  // fromGuest-märket lever bara tills pappen skickat tillbaka raden — då vinner den inkommande.
  const LISTOR = ["plan", "guests", "budget", "program", "docs", "recipes", "shop"];
  for (const k of LISTOR) {
    if (!prev || !Array.isArray(prev[k])) continue;
    const kommer = new Set((ev[k] || []).map((x) => x && x.id));
    const kvar = prev[k].filter((x) => x && x.fromGuest && !kommer.has(x.id));
    if (kvar.length) ev[k] = (ev[k] || []).concat(kvar);
  }
  // Gravstenar: behåll bara dem pappen ÄNNU INTE hunnit ta emot. Kommer id:t tillbaka i
  // pushen lever raden kvar hos pappen → raderingen är inte behandlad → gravstenen står kvar.
  // Saknas id:t har pappen tagit bort raden också → gravstenen har gjort sitt och städas bort.
  if (prev && Array.isArray(prev.deleted) && prev.deleted.length) {
    const finnsKvar = new Set(LISTOR.flatMap((k) => (ev[k] || []).map((x) => x && x.id)));
    const kvar = prev.deleted.filter((d) => finnsKvar.has(d.id));
    ev.deleted = (Array.isArray(ev.deleted) ? ev.deleted : []).concat(
      kvar.filter((d) => !(ev.deleted || []).some((x) => x.id === d.id)));
    // Raden som gravstenen gäller får inte smygas tillbaka in av pushen.
    const dead = new Set(ev.deleted.map((d) => d.id));
    for (const k of LISTOR) if (Array.isArray(ev[k])) ev[k] = ev[k].filter((x) => !dead.has(x && x.id));
  }
  await kvPut(env, K_EVENT(slug), JSON.stringify(ev));
  return Response.json({ ok: true, slug, items: (ev.plan || []).length, guests: (ev.guests || []).length });
}
