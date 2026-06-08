// Concept Forge — soundtrack-endpoint (fas 2b)
//   POST /api/soundtrack  { prompt }            -> starta Suno-jobb     -> { taskId, engine }
//   POST /api/soundtrack  { prompt, engine:fal} -> fal Stable Audio     -> { url, engine }
//   GET  /api/soundtrack?taskId=...             -> Suno-status          -> { status, url }
//
// Suno (via sunoapi.org) är primär, instrumental V5. Den är asynkron, så klienten pollar GET
// tills status=done. fal Stable Audio är direkt-fallback. Nycklar som Cloudflare-secrets.

const SUNO_FAIL = ["CREATE_TASK_FAILED", "GENERATE_AUDIO_FAILED", "CALLBACK_EXCEPTION", "SENSITIVE_WORD_ERROR"];

async function sunoStart(prompt, key) {
  const res = await fetch("https://api.sunoapi.org/api/v1/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      customMode: false,
      instrumental: true,
      model: "V5",
      prompt: prompt.slice(0, 480),
      callBackUrl: "https://httpstat.us/200",
    }),
  });
  if (!res.ok) throw new Error(`suno start ${res.status}: ${await res.text()}`);
  const d = await res.json();
  const taskId = d.data && (d.data.taskId || d.data.task_id);
  if (!taskId) throw new Error("suno: no taskId " + JSON.stringify(d).slice(0, 180));
  return taskId;
}

async function sunoStatus(taskId, key) {
  const res = await fetch("https://api.sunoapi.org/api/v1/generate/record-info?taskId=" + encodeURIComponent(taskId), {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`suno status ${res.status}`);
  const d = await res.json();
  const data = d.data || {};
  const arr = (data.response && data.response.sunoData) || [];
  const first = arr[0] || {};
  const url = first.audioUrl || first.streamAudioUrl || null;
  if (url) return { status: "done", url };          // ljud finns = klart (även om callback strulat)
  if (SUNO_FAIL.includes(data.status)) return { status: "failed", error: data.status };
  return { status: "processing" };
}

// Google Lyria 2 på fal — markant bättre instrumental än stable-audio, pålitligare endpoint.
async function falMusic(prompt, falKey) {
  const res = await fetch("https://fal.run/fal-ai/lyria2", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${falKey}` },
    body: JSON.stringify({ prompt: prompt.slice(0, 1000), negative_prompt: "low quality, distorted, muddy mix, vocals" }),
  });
  if (!res.ok) throw new Error(`fal lyria ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const d = await res.json();
  const url = d.audio && d.audio.url;
  if (!url) throw new Error("fal lyria: no url");
  return url;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const sunoKey = env.SUNOAPI_API_KEY || env.SUNO_API_KEY;
  const falKey = env.FLUX_API_KEY;
  let body = {};
  try { body = await request.json(); } catch {}
  const prompt = (body.prompt || "").toString();

  if (body.engine === "fal") {
    if (!falKey) return Response.json({ error: "no fal key" });
    try { return Response.json({ url: await falMusic(prompt, falKey), engine: "Lyria 2 (fal.ai)" }); }
    catch (e) { return Response.json({ error: String(e).slice(0, 250) }); }
  }

  if (!sunoKey) return Response.json({ error: "no suno key" });
  try { return Response.json({ taskId: await sunoStart(prompt, sunoKey), engine: "Suno V5" }); }
  catch (e) { return Response.json({ error: String(e).slice(0, 300) }); }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const sunoKey = env.SUNOAPI_API_KEY || env.SUNO_API_KEY;
  const taskId = new URL(request.url).searchParams.get("taskId");
  if (!taskId || !sunoKey) return Response.json({ status: "failed", error: "missing taskId or key" });
  try { return Response.json(await sunoStatus(taskId, sunoKey)); }
  catch (e) { return Response.json({ status: "failed", error: String(e).slice(0, 250) }); }
}
