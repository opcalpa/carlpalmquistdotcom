// NOLL-DRIFT extraktions-bas: recolora baseBalds grå baddräkt -> magenta LOKALT
// (ren pixel-op, ingen generering) => byte-identisk kropp med baseBald. Kör mot Chrome 9004.
import fs from 'node:fs';
const PORT=9004;
const SRC='/Users/calpa/Developer/carlpalmquistdotcom/atelje-v2/bodies/baseBald.png';
const OUT='/Users/calpa/Developer/carlpalmquistdotcom/atelje-v2/bodies/baseMag-canonical.png';
const src="data:image/png;base64,"+fs.readFileSync(SRC).toString('base64');

const nt=await fetch(`http://localhost:${PORT}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());
const ws=new WebSocket(nt.webSocketDebuggerUrl); let mid=0; const pending=new Map();
const send=(m,p={})=>new Promise((res,rej)=>{const i=++mid;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.rej(new Error(m.error.message)):p.res(m.result);}});
await new Promise(r=>ws.addEventListener('open',r));
await send('Runtime.enable'); await new Promise(r=>setTimeout(r,500));
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;};

await ev(`(async function(){
  function load(src){return new Promise(function(res){var im=new Image();im.onload=function(){res(im)};im.src=src;});}
  var IM=await load(${JSON.stringify(src)});
  var W=IM.naturalWidth,H=IM.naturalHeight;
  var c=document.createElement('canvas');c.width=W;c.height=H;var x=c.getContext('2d');x.drawImage(IM,0,0);
  var id=x.getImageData(0,0,W,H),d=id.data,n=0;
  // grå baddräkt = låg mättnad + mellan-luminans; recolora -> magenta, behåll skuggning via luminans
  for(var i=0;i<d.length;i+=4){
    var r=d[i],g=d[i+1],b=d[i+2];
    var mx=Math.max(r,g,b),mn=Math.min(r,g,b),lum=(r+g+b)/3;
    // grå = låg mättnad (mx-mn liten); huden är rosaare (större spridning) => exkluderas
    var grey=(mx-mn)<34 && lum>92 && lum<242;
    if(grey){
      // magenta-ton skalad med lokal luminans (0..1) för att behålla veck/skugga
      var t=Math.max(0,Math.min(1,(lum-92)/(242-92)));
      d[i]=Math.round(120+135*t);   // R 120..255
      d[i+1]=Math.round(6+30*t);    // G lågt
      d[i+2]=Math.round(80+95*t);   // B 80..175
      n++;
    }
  }
  x.putImageData(id,0,0);
  window.__O=c.toDataURL('image/png'); window.__n=n; return 'ok';
})()`);
const n=await ev('window.__n');
const url=await ev('window.__O');
fs.writeFileSync(OUT, Buffer.from(url.split(',')[1],'base64'));
console.log('recolor-local →', OUT, '('+n+' px magenta)');
ws.close();
