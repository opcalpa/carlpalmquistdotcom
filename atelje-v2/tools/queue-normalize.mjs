// queue-normalize: skala/positionera ett extraherat plagg till kategorins kanoniska mål-ruta.
// Gör placeringen oberoende av hur generatorn ramade in figuren (löser Geminis om-inramning).
// Användning: node queue-normalize.mjs <staging.png> <category>   (skriver över in-filen + -chk)
import fs from 'node:fs';
const REPO='/Users/calpa/Developer/carlpalmquistdotcom';
const PORT=9004;
const [,,IN,CAT]=process.argv;
if(!IN||!CAT){console.error('användning: queue-normalize.mjs <staging.png> <category>');process.exit(1);}
const boxes=JSON.parse(fs.readFileSync(REPO+'/atelje-v2/garment-boxes.json','utf8'));
const tgt=boxes.categories[CAT];
if(!tgt){console.error('ingen kanon-ruta för kategori:',CAT,'— kör calib-garments.mjs?');process.exit(1);}
const CW=boxes.W,CH=boxes.H;
const b64=p=>'data:image/png;base64,'+fs.readFileSync(p).toString('base64');
const src=b64(IN);

const nt=await fetch(`http://localhost:${PORT}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());
const ws=new WebSocket(nt.webSocketDebuggerUrl);let mid=0;const pm=new Map();
const send=(m,p={})=>new Promise((res,rej)=>{const i=++mid;pm.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pm.has(m.id)){const p=pm.get(m.id);pm.delete(m.id);m.error?p.rej(new Error(m.error.message)):p.res(m.result);}});
await new Promise(r=>ws.addEventListener('open',r));await send('Runtime.enable');await new Promise(r=>setTimeout(r,300));

const r=await send('Runtime.evaluate',{returnByValue:true,awaitPromise:true,expression:`(async function(){
  function L(s){return new Promise(res=>{var i=new Image();i.onload=()=>res(i);i.src=s;});}
  var im=await L(${JSON.stringify(src)});var W=im.naturalWidth,H=im.naturalHeight;
  var m=document.createElement('canvas');m.width=W;m.height=H;var mx=m.getContext('2d');mx.drawImage(im,0,0);
  var d=mx.getImageData(0,0,W,H).data,x0=W,y0=H,x1=0,y1=0;
  for(var yy=0;yy<H;yy++)for(var xx=0;xx<W;xx++){if(d[(yy*W+xx)*4+3]>40){if(xx<x0)x0=xx;if(xx>x1)x1=xx;if(yy<y0)y0=yy;if(yy>y1)y1=yy;}}
  if(x1<=x0||y1<=y0)return {err:'tomt lager — inget att normalisera'};
  var bw=x1-x0,bcx=(x0+x1)/2;
  var T=${JSON.stringify(tgt)},CW=${CW},CH=${CH};
  var s=T.width/bw;                                  // skala så bredden matchar kanon
  var tx=T.centerX-bcx*s, ty=T.top-y0*s;             // axel-linje→T.top, mitt→T.centerX
  var c=document.createElement('canvas');c.width=CW;c.height=CH;var x=c.getContext('2d');
  x.imageSmoothingQuality='high';x.setTransform(s,0,0,s,tx,ty);x.drawImage(im,0,0);x.setTransform(1,0,0,1,0,0);
  window.__O=c.toDataURL('image/png');
  // rutig granskningsbild
  var chk=document.createElement('canvas');chk.width=CW;chk.height=CH;var cc=chk.getContext('2d');var sq=24;
  for(var yq=0;yq<CH;yq+=sq)for(var xq=0;xq<CW;xq+=sq){cc.fillStyle=((xq/sq+yq/sq)&1)?'#cfcfcf':'#8f8f8f';cc.fillRect(xq,yq,sq,sq);}
  cc.drawImage(c,0,0);window.__chk=chk.toDataURL('image/png');
  return {scale:+s.toFixed(3),srcBox:[x0,y0,x1,y1],placed:{centerX:T.centerX,top:T.top,width:T.width}};
})()`});
const info=r.result.value;
if(info&&info.err){console.error('✗',info.err);ws.close();process.exit(1);}
const O=(await send('Runtime.evaluate',{returnByValue:true,expression:'window.__O'})).result.value;
const chk=(await send('Runtime.evaluate',{returnByValue:true,expression:'window.__chk'})).result.value;
ws.close();
fs.writeFileSync(IN,Buffer.from(O.split(',')[1],'base64'));
fs.writeFileSync(IN.replace(/\.png$/,'-chk.png'),Buffer.from(chk.split(',')[1],'base64'));
console.log('✓ normaliserad ['+CAT+']  scale='+info.scale+'  → centerX='+info.placed.centerX+' top='+info.placed.top+' width='+info.placed.width);
