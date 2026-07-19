// STEG 1-de-risk: bevisa POSE-LÅS. Ge baseB till Flux Kontext + "klä på t-shirt, behåll pose" → hamnar plagget rätt på kroppen?
import { readFileSync, writeFileSync } from "node:fs";
const REPO="/Users/calpa/Developer/carlpalmquistdotcom";
const S="/private/tmp/claude-501/-Users-calpa-Developer-PA/d1800907-4c24-4f40-ba91-1e450c6e4cde/scratchpad";
const KEY=readFileSync(REPO+"/.dev.vars","utf8").split("\n").find(l=>l.startsWith("FLUX_API_KEY=")).split("=").slice(1).join("=").trim();
const baseB="data:image/png;base64,"+readFileSync(S+"/basebody/baseB.png").toString("base64");

async function fal(url,body){
  const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Key "+KEY},body:JSON.stringify(body)});
  const txt=await r.text(); let j; try{j=JSON.parse(txt);}catch(e){j={raw:txt};}
  return {status:r.status, j};
}

// prova några Kontext-endpoints tills en svarar med bild
const endpoints=[
  "https://fal.run/fal-ai/flux-pro/kontext",
  "https://fal.run/fal-ai/flux-pro/kontext/max",
  "https://fal.run/fal-ai/flux-kontext/dev",
];
const prompt="Add a plain white short-sleeve cotton t-shirt garment onto this cartoon paper-doll toy figure, fitting naturally over the torso and upper arms. Keep the exact same pose, proportions, outline and dark background completely unchanged — only add the white t-shirt on top.";

let done=false;
for(const ep of endpoints){
  console.log("prövar", ep);
  const {status,j}=await fal(ep,{prompt, image_url:baseB, guidance_scale:3.5, num_images:1, output_format:"png"});
  if(j&&j.images&&j.images[0]&&j.images[0].url){
    const buf=Buffer.from(await(await fetch(j.images[0].url)).arrayBuffer());
    writeFileSync(S+"/basebody/poselock-tshirt.png",buf);
    console.log("✓ FUNKADE via",ep,"("+(buf.length/1024|0)+"kb) → poselock-tshirt.png");
    done=true; break;
  } else {
    console.log("  status",status,"svar:",JSON.stringify(j).slice(0,200));
  }
}
if(!done)console.log("INGEN Kontext-endpoint funkade — provar img2img i nästa steg");
