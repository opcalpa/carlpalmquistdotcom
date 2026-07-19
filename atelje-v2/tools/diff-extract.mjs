// Extrahera plagg via DIFF: behåll pixlar där plagg-på-kropp skiljer sig mkt från baskroppen (= plagget). Kör i 9004.
import fs from 'node:fs';
const PORT=9004;
const S='/private/tmp/claude-501/-Users-calpa-Developer-PA/d1800907-4c24-4f40-ba91-1e450c6e4cde/scratchpad';
const basePath=process.argv[2], garPath=process.argv[3], outPath=process.argv[4], T=+(process.argv[5]||90);
const baseB64="data:image/png;base64,"+fs.readFileSync(basePath).toString('base64');
const garB64="data:image/png;base64,"+fs.readFileSync(garPath).toString('base64');
const nt=await fetch(`http://localhost:${PORT}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());
const ws=new WebSocket(nt.webSocketDebuggerUrl); let mid=0; const pending=new Map();
const send=(m,p={})=>new Promise((res,rej)=>{const i=++mid;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.rej(new Error(m.error.message)):p.res(m.result);}});
await new Promise(r=>ws.addEventListener('open',r));
await send('Runtime.enable'); await new Promise(r=>setTimeout(r,600));
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;};
await ev(`(async function(){
  function load(src){return new Promise(function(res){var im=new Image();im.onload=function(){res(im)};im.src=src;});}
  var A=await load(${JSON.stringify(baseB64)}), B=await load(${JSON.stringify(garB64)});
  var W=B.naturalWidth,H=B.naturalHeight;
  function data(im){var c=document.createElement('canvas');c.width=W;c.height=H;var x=c.getContext('2d');x.drawImage(im,0,0,W,H);return x.getImageData(0,0,W,H).data;}
  var a=data(A), b=data(B);
  var out=document.createElement('canvas');out.width=W;out.height=H;var ox=out.getContext('2d');var od=ox.getImageData(0,0,W,H),d=od.data,rem=0,keep=0;
  var T=${T};
  for(var i=0;i<d.length;i+=4){
    var dist=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);
    if(dist>T){ d[i]=b[i];d[i+1]=b[i+1];d[i+2]=b[i+2];d[i+3]=255; keep++; }
    else { d[i+3]=0; rem++; }
  }
  ox.putImageData(od,0,0);
  window.__O=out.toDataURL('image/png'); window.__stat=keep+' behållna / '+rem+' bort'; return 'ok';
})()`);
const url=await ev('window.__O'), stat=await ev('window.__stat');
fs.writeFileSync(outPath, Buffer.from(url.split(',')[1],'base64'));
console.log('diff-extract →', outPath, '('+stat+')'); ws.close();
