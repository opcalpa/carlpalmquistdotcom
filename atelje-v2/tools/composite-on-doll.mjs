// Komposita ett plagg-lager på den inbakade-frisyr-dockan. Args: garment.png out.png. Kör mot Chrome 9004.
import fs from 'node:fs';
const PORT=9004;
const DOLL='/private/tmp/claude-501/-Users-calpa-Developer-PA/aaddbd11-061f-480f-b221-a21f6d290001/scratchpad/atelje-v2-drift/hair-on-doll.png';
const [,,GAR,OUT]=process.argv;
const b=p=>"data:image/png;base64,"+fs.readFileSync(p).toString('base64');
const doll=b(DOLL), gar=b(GAR);
const nt=await fetch(`http://localhost:${PORT}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());
const ws=new WebSocket(nt.webSocketDebuggerUrl);let mid=0;const pm=new Map();
const send=(m,p={})=>new Promise((res,rej)=>{const i=++mid;pm.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pm.has(m.id)){const p=pm.get(m.id);pm.delete(m.id);m.error?p.rej(new Error(m.error.message)):p.res(m.result);}});
await new Promise(r=>ws.addEventListener('open',r));await send('Runtime.enable');await new Promise(r=>setTimeout(r,400));
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;};
await ev(`(async function(){function L(s){return new Promise(r=>{var i=new Image();i.onload=()=>r(i);i.src=s;});}
var D=await L(${JSON.stringify(doll)}),G=await L(${JSON.stringify(gar)});var W=D.naturalWidth,H=D.naturalHeight;
var c=document.createElement('canvas');c.width=W;c.height=H;var x=c.getContext('2d');x.drawImage(D,0,0);x.drawImage(G,0,0,W,H);
window.__o=c.toDataURL('image/png');return 'ok';})()`);
const u=await ev('window.__o');fs.writeFileSync(OUT,Buffer.from(u.split(',')[1],'base64'));console.log('composite →',OUT);ws.close();
