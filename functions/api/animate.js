// Concept Forge — animera key art till en kort attract-loop (Veo 3 Fast image-to-video via fal queue)
//   POST /api/animate { imageUrl, prompt }  -> { requestId, engine }
//   GET  /api/animate?id=...                -> { status: 'processing'|'done'|'failed', url? }
//
// Veo 3 Fast valdes över Luma Ray 2 för att Luma struntade i "no pan" och panorerade ändå (kameran
// gled åt höger). Veo respekterar låst kamera, särskilt via negative_prompt nedan (verifierat på
// Dough-Jo-bilden). generate_audio:false → Veos egna ljud av (vi har eget soundtrack + billigare).
// Veo har INGEN loop-param (Lumas loop:true var sömlös) → klippet loopar inte skarvfritt; <video loop>
// får en liten skarv var 8:e sek. fal-nyckeln (FLUX_API_KEY) återanvänds; requests-endpoint = app-prefix.

const MODEL = "fal-ai/veo3/fast/image-to-video";
const QUEUE_REQ = "https://queue.fal.run/fal-ai/veo3/requests";
// Stoppar Veos enda återstående felläge: att den ändå försöker röra kameran/utsnittet.
const NEG = "camera pan, panning, camera zoom, push-in, pull-out, dolly, tracking shot, crane, camera rotation, parallax, any camera movement, reframing, crop change, scale change, cut, scene change, morphing, warping, extra limbs, text, watermark, subtitles";
const isCreditsErr = (t) => /\b(40[26])\b|exhaust\w*|insufficient|quota|credit balance|out of credits|top ?up|payment required|billing|not enough|balance/i.test(String(t || ""));

export async function onRequestPost(context) {
  const { request, env } = context;
  const falKey = env.FLUX_API_KEY;
  if (!falKey) return Response.json({ error: "no fal key" });
  let body = {};
  try { body = await request.json(); } catch {}
  const imageUrl = (body.imageUrl || "").toString();
  const prompt = (body.prompt || "subtle ambient cinematic loop, gentle motion, no camera cut, seamless").toString().slice(0, 1000);
  if (!imageUrl) return Response.json({ error: "missing imageUrl" }, { status: 400 });
  try {
    const r = await fetch(`https://queue.fal.run/${MODEL}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Key ${falKey}` },
      body: JSON.stringify({ prompt, image_url: imageUrl, negative_prompt: NEG, duration: "8s", resolution: "720p", aspect_ratio: "auto", generate_audio: false }),
    });
    if (!r.ok) { const m = `fal submit ${r.status}: ${(await r.text()).slice(0, 160)}`; return Response.json(isCreditsErr(m) ? { error: m, creditsOut: true, feature: "animation" } : { error: m }); }
    const d = await r.json();
    if (!d.request_id) return Response.json({ error: "no request_id " + JSON.stringify(d).slice(0, 160) });
    return Response.json({ requestId: d.request_id, engine: "Veo 3 Fast (fal.ai)" });
  } catch (e) { return Response.json({ error: String(e).slice(0, 200) }); }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const falKey = env.FLUX_API_KEY;
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !falKey) return Response.json({ status: "failed", error: "missing id or key" });
  try {
    const s = await fetch(`${QUEUE_REQ}/${encodeURIComponent(id)}/status`, { headers: { Authorization: `Key ${falKey}` } });
    if (!s.ok) return Response.json({ status: "failed", error: `status ${s.status}` });
    const sd = await s.json();
    if (sd.status === "COMPLETED") {
      const r = await fetch(`${QUEUE_REQ}/${encodeURIComponent(id)}`, { headers: { Authorization: `Key ${falKey}` } });
      const rd = await r.json();
      const url = rd.video && rd.video.url;
      return url ? Response.json({ status: "done", url }) : Response.json({ status: "failed", error: "no video url" });
    }
    if (sd.status === "ERROR" || sd.status === "FAILED") return Response.json({ status: "failed", error: sd.status });
    return Response.json({ status: "processing" });
  } catch (e) { return Response.json({ status: "failed", error: String(e).slice(0, 200) }); }
}
