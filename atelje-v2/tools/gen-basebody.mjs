// Steg 0: generera BASKROPPS-kandidater (skallig, låst pose, 9:16) för Modeateljé-v2. Rå-bilder för att välja stil/pose.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const REPO="/Users/calpa/Developer/carlpalmquistdotcom";
const S="/private/tmp/claude-501/-Users-calpa-Developer-PA/d1800907-4c24-4f40-ba91-1e450c6e4cde/scratchpad";
const KEY=readFileSync(REPO+"/.dev.vars","utf8").split("\n").find(l=>l.startsWith("FLUX_API_KEY=")).split("=").slice(1).join("=").trim();
mkdirSync(S+"/basebody",{recursive:true});

const STYLE="Soft storybook cartoon illustration in the exact gentle painted style of a children's paper doll, clean soft outlines. ";
const POSE="Full body of a young girl standing straight, facing directly forward (perfect front view), symmetric neutral pose. Arms relaxed and held slightly away from the body (about 15 degrees out from the sides), hands open with palms toward the thighs, fingers relaxed. Legs together and straight, feet flat and bare, toes forward. ";
const HEAD="She is COMPLETELY BALD — smooth head, no hair at all — with a soft friendly neutral face, looking straight ahead. ";
const BASE="She wears only a simple plain light-grey seamless sleeveless leotard/bodysuit (so clothes can be layered on top later). ";
const FRAME="The WHOLE body from the top of the head to the feet is fully visible and centered in a tall 9:16 vertical frame with a small even margin all around. Solid plain very dark background. Even soft lighting, no strong shadows. Consistent clean proportions.";

const items=[
  {id:"baseA", seed:9101, extra:""},
  {id:"baseB", seed:9102, extra:""},
  {id:"baseC", seed:9103, extra:"Arms held a little further out (about 25 degrees) for clearer separation from the torso. "},
  {id:"baseD", seed:9104, extra:"Slightly younger child proportions. "},
];
async function fal(u,b){for(let a=0;a<4;a++){try{const r=await fetch(u,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Key "+KEY},body:JSON.stringify(b)});const j=await r.json();if(j&&j.images)return j;}catch(e){}await new Promise(r=>setTimeout(r,2000));}return{};}
for(const it of items){
  const prompt=STYLE+POSE+HEAD+BASE+it.extra+FRAME;
  const g=await fal("https://fal.run/fal-ai/flux-pro/v1.1",{prompt,image_size:"portrait_16_9",num_images:1,seed:it.seed,output_format:"png"});
  const url=(g.images||[{}])[0].url; if(!url){console.log("gen-fel "+it.id);continue;}
  const buf=Buffer.from(await(await fetch(url)).arrayBuffer());
  writeFileSync(S+"/basebody/"+it.id+".png",buf);
  console.log("rå "+it.id+" ("+(buf.length/1024|0)+"kb)");
}
console.log("BASEBODY-DONE");
