// Generisk Flux Kontext-helper: redigera en bild via prompt (pose bevaras). Barn-säkert språk ("cartoon paper-doll toy figure").
import { readFileSync, writeFileSync } from "node:fs";
const REPO="/Users/calpa/Developer/carlpalmquistdotcom";
const S="/private/tmp/claude-501/-Users-calpa-Developer-PA/d1800907-4c24-4f40-ba91-1e450c6e4cde/scratchpad";
const KEY=readFileSync(REPO+"/.dev.vars","utf8").split("\n").find(l=>l.startsWith("FLUX_API_KEY=")).split("=").slice(1).join("=").trim();
const inPath=process.argv[2], outPath=process.argv[3], prompt=process.argv[4];
const img="data:image/png;base64,"+readFileSync(inPath).toString("base64");
const r=await fetch("https://fal.run/fal-ai/flux-pro/kontext",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Key "+KEY},
  body:JSON.stringify({prompt, image_url:img, guidance_scale:3.5, num_images:1, output_format:"png"})});
const j=await r.json();
if(j&&j.images&&j.images[0]&&j.images[0].url){
  const buf=Buffer.from(await(await fetch(j.images[0].url)).arrayBuffer());
  writeFileSync(outPath,buf);
  console.log("✓",outPath,"("+(buf.length/1024|0)+"kb)"+(buf.length<20000?"  ⚠️ LITEN = ev. filter-block":""));
}else{ console.log("FEL status",r.status,JSON.stringify(j).slice(0,220)); }
