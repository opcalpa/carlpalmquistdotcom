// Kalibrera kanoniska mål-rutor per kategori från befintliga garderob-v2-plagg.
// Mäter varje plaggs alfa-bbox (via canvas på 9004), tar median(centerX, top, width) per kategori.
// Skriver atelje-v2/garment-boxes.json. Kör en gång (och om garderoben ändras).
import fs from 'node:fs';
const REPO='/Users/calpa/Developer/carlpalmquistdotcom';
const PORT=9004;
const mf=JSON.parse(fs.readFileSync(REPO+'/public/garderob-v2/manifest.json','utf8'));
const b64=p=>'data:image/png;base64,'+fs.readFileSync(p).toString('base64');
const items=mf.garments.map(g=>({id:g.id,category:g.category,data:b64(REPO+'/public/garderob-v2/'+g.id+'.png')}));

const nt=await fetch(`http://localhost:${PORT}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());
const ws=new WebSocket(nt.webSocketDebuggerUrl);let mid=0;const pm=new Map();
const send=(m,p={})=>new Promise((res,rej)=>{const i=++mid;pm.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pm.has(m.id)){const p=pm.get(m.id);pm.delete(m.id);m.error?p.rej(new Error(m.error.message)):p.res(m.result);}});
await new Promise(r=>ws.addEventListener('open',r));await send('Runtime.enable');await new Promise(r=>setTimeout(r,300));

const r=await send('Runtime.evaluate',{returnByValue:true,awaitPromise:true,expression:`(async function(){
  var items=${JSON.stringify(items)};
  function L(s){return new Promise(res=>{var i=new Image();i.onload=()=>res(i);i.src=s;});}
  var out=[];
  for(var k=0;k<items.length;k++){var im=await L(items[k].data);
    var W=im.naturalWidth,H=im.naturalHeight;var c=document.createElement('canvas');c.width=W;c.height=H;var x=c.getContext('2d');x.drawImage(im,0,0);
    var d=x.getImageData(0,0,W,H).data,x0=W,y0=H,x1=0,y1=0;
    for(var yy=0;yy<H;yy++)for(var xx=0;xx<W;xx++){if(d[(yy*W+xx)*4+3]>40){if(xx<x0)x0=xx;if(xx>x1)x1=xx;if(yy<y0)y0=yy;if(yy>y1)y1=yy;}}
    out.push({id:items[k].id,category:items[k].category,W:W,H:H,x0:x0,y0:y0,x1:x1,y1:y1});
  }
  return out;
})()`});
ws.close();
const boxes=r.result.value;
const med=a=>{a=a.slice().sort((p,q)=>p-q);var n=a.length;return n%2?a[(n-1)/2]:Math.round((a[n/2-1]+a[n/2])/2);};
// filtrera degenererade bboxar (tomma/trasiga PNG:er) — logga dem
const bad=boxes.filter(b=>b.x1<=b.x0||b.y1<=b.y0);
if(bad.length)console.log('⚠️ degenererade (uteslutna):',bad.map(b=>b.id+' ['+b.category+']').join(', '),'\n');
const good=boxes.filter(b=>b.x1>b.x0&&b.y1>b.y0);
const byCat={};
good.forEach(b=>{(byCat[b.category]=byCat[b.category]||[]).push(b);});
const canon={W:752,H:1392,categories:{}};
console.log('kategori     n   centerX  top    width   (median, px @752×1392)');
Object.keys(byCat).sort().forEach(cat=>{
  const arr=byCat[cat];
  const cx=med(arr.map(b=>(b.x0+b.x1)/2));
  const top=med(arr.map(b=>b.y0));
  const w=med(arr.map(b=>b.x1-b.x0));
  canon.categories[cat]={centerX:cx,top:top,width:w};
  console.log(cat.padEnd(12),String(arr.length).padStart(2),String(cx).padStart(8),String(top).padStart(6),String(w).padStart(7));
});
fs.writeFileSync(REPO+'/atelje-v2/garment-boxes.json',JSON.stringify(canon,null,2)+'\n');
console.log('\n✓ skrivet: atelje-v2/garment-boxes.json');
