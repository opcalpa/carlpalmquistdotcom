// Bygg CHROMA-kropp: recolora HELA baseBald-figuren -> flat grön (behåll luminans för form).
// Figur = allt som ej är mörk bakgrund. Kör mot Chrome 9004.
import fs from 'node:fs';
const PORT=9004;
const SRC='/Users/calpa/Developer/carlpalmquistdotcom/atelje-v2/bodies/baseBald.png';
const OUT='/Users/calpa/Developer/carlpalmquistdotcom/atelje-v2/bodies/baseChroma.png';
const src="data:image/png;base64,"+fs.readFileSync(SRC).toString('base64');
const nt=await fetch(`http://localhost:${PORT}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());
const ws=new WebSocket(nt.webSocketDebuggerUrl);let mid=0;const pm=new Map();
const send=(m,p={})=>new Promise((res,rej)=>{const i=++mid;pm.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pm.has(m.id)){const p=pm.get(m.id);pm.delete(m.id);m.error?p.rej(new Error(m.error.message)):p.res(m.result);}});
await new Promise(r=>ws.addEventListener('open',r));await send('Runtime.enable');await new Promise(r=>setTimeout(r,400));
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;};
await ev(`(async function(){function L(s){return new Promise(r=>{var i=new Image();i.onload=()=>r(i);i.src=s;});}
var IM=await L(${JSON.stringify(src)});var W=IM.naturalWidth,H=IM.naturalHeight;
var c=document.createElement('canvas');c.width=W;c.height=H;var x=c.getContext('2d');x.drawImage(IM,0,0);
var id=x.getImageData(0,0,W,H),d=id.data,bg=[d[0],d[1],d[2]],n=0;
for(var i=0;i<d.length;i+=4){var r=d[i],g=d[i+1],b=d[i+2];
  var isbg=(Math.abs(r-bg[0])+Math.abs(g-bg[1])+Math.abs(b-bg[2]))<45;   // mörk bakgrund lämnas
  if(!isbg){var lum=(r+g+b)/3;var t=Math.max(0,Math.min(1,lum/255));      // figur -> grön m. luminans-form
    d[i]=Math.round(20+40*t); d[i+1]=Math.round(120+135*t); d[i+2]=Math.round(20+40*t); n++;}
}
x.putImageData(id,0,0);window.__O=c.toDataURL('image/png');window.__n=n;return 'ok';})()`);
const url=await ev('window.__O');fs.writeFileSync(OUT,Buffer.from(url.split(',')[1],'base64'));console.log('chroma →',OUT,(await ev('window.__n'))+'px grön');ws.close();
