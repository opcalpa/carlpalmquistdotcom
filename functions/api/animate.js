// Concept Forge — animera key art till en kort attract-loop (Luma Ray 2 image-to-video via fal queue)
//   POST /api/animate { imageUrl, prompt }  -> { requestId, engine }
//   GET  /api/animate?id=...                -> { status: 'processing'|'done'|'failed', url? }
//
// Ray 2 är async (video tar ~60-120s), så klienten pollar GET tills status=done. loop:true blandar
// start/slut sömlöst. fal-nyckeln (FLUX_API_KEY) återanvänds. Requests-endpoint använder app-prefixet.

const MODEL = "fal-ai/luma-dream-machine/ray-2/image-to-video";
const QUEUE_REQ = "https://queue.fal.run/fal-ai/luma-dream-machine/requests";

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
      body: JSON.stringify({ prompt, image_url: imageUrl, loop: true, resolution: "720p", duration: "5s" }),
    });
    if (!r.ok) return Response.json({ error: `fal submit ${r.status}: ${(await r.text()).slice(0, 160)}` });
    const d = await r.json();
    if (!d.request_id) return Response.json({ error: "no request_id " + JSON.stringify(d).slice(0, 160) });
    return Response.json({ requestId: d.request_id, engine: "Luma Ray 2 (fal.ai)" });
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
