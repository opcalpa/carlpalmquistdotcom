// Test fal birefnet (bakgrundsborttagning) med FLUX_API_KEY. Args: in out
import { readFileSync, writeFileSync } from "node:fs";
const REPO="/Users/calpa/Developer/carlpalmquistdotcom";
const KEY=readFileSync(REPO+"/.dev.vars","utf8").split("\n").find(l=>l.startsWith("FLUX_API_KEY=")).split("=").slice(1).join("=").trim();
const [,,IN,OUT]=process.argv;
const img="data:image/png;base64,"+readFileSync(IN).toString("base64");
const r=await fetch("https://fal.run/fal-ai/birefnet/v2",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Key "+KEY},
  body:JSON.stringify({image_url:img, model:"General Use (Heavy)", operating_resolution:"1024x1024", output_format:"png"})});
const j=await r.json();
const url=j?.image?.url || j?.images?.[0]?.url;
if(url){const buf=Buffer.from(await(await fetch(url)).arrayBuffer());writeFileSync(OUT,buf);console.log("✓",OUT,(buf.length/1024|0)+"kb");}
else console.log("FEL",r.status,JSON.stringify(j).slice(0,300));
