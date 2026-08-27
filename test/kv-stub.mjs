// Lokal stand-in för Cloudflares KV REST-API. Startas med `node test/kv-stub.mjs` och pekas in
// med `wrangler pages dev --binding KV_API_BASE=http://127.0.0.1:8790`.
//
// VARFÖR: gratisnivån ger 1 000 KV-SKRIVNINGAR per dygn för hela kontot. En full testomgång mot
// fest40 gör ~70, så några omgångar räcker för att slå i taket — och då slutar den SKARPA sidan
// spara för familjen. 2026-08-27 hände precis det. Testerna ska aldrig kunna göra det igen.
// Ingen persistens mellan körningar: allt bor i minnet, vilket också gör varje körning ren.
import http from "node:http";

const store = new Map();
const PORT = Number(process.env.KV_STUB_PORT) || 8790;

const send = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};

http.createServer((req, res) => {
  // .../namespaces/<ns>/values/<key>  — nyckeln är procent-kodad av anroparen
  const m = req.url.match(/\/namespaces\/([^/]+)\/values\/([^?]+)/);
  if (!m) return send(res, 404, { success: false, errors: [{ message: "okänd väg" }] });
  const key = m[1] + "|" + decodeURIComponent(m[2]);

  if (req.method === "GET") {
    if (!store.has(key)) return send(res, 404, { success: false, errors: [{ code: 10009 }] });
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end(store.get(key));
  }
  if (req.method === "PUT") {
    let data = "";
    req.on("data", (c) => (data += c));
    // expiration_ttl ignoreras: inget test väntar ut en TTL, och fest40 bär numera sin egen
    // tidsstämpel i rate-limit-hinken i stället för att luta sig mot KV:s utgång.
    req.on("end", () => { store.set(key, data); send(res, 200, { success: true, result: null }); });
    return;
  }
  if (req.method === "DELETE") { store.delete(key); return send(res, 200, { success: true }); }
  send(res, 405, { success: false });
}).listen(PORT, "127.0.0.1", () => console.log(`KV-stub på http://127.0.0.1:${PORT} (i minnet, ingen kvot)`));
