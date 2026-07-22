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
  var im=await L(${JSON.stringify(src)});var W=im.naturalWidth,H=im.naturalHeight,N=W*H;
  var m=document.createElement('canvas');m.width=W;m.height=H;var mx=m.getContext('2d');mx.drawImage(im,0,0);
  var imgd=mx.getImageData(0,0,W,H),d=imgd.data;
  var CAT=${JSON.stringify(CAT)};
  // --- STÄDNING 0 (endast skor): skor genereras ljusa → droppa mörka pixlar (tar bort mörk
  //     leg-gap-skugga som hänger ihop med skorna och annars förstör deras bbox/placering) ---
  if(CAT==='shoes'){for(var p=0;p<N;p++){if(d[p*4+3]>40&&(d[p*4]+d[p*4+1]+d[p*4+2])/3<90)d[p*4+3]=0;}}
  // --- STÄDNING 0.4: floda bakgrund (transparent + MÖRKT) från kanterna, stoppa vid ljust tyg ---
  //     tar bort instängd mörk bg-residu i konkava kurvor (t.ex. midjan) som öppnar sig mot ytterkanten.
  //     knappar/detaljer inne i ljust tyg (ej kopplade till kanten) bevaras.
  (function(){var reach=new Uint8Array(N),st=[];
    var isBg=i=>d[i+3]<=40||(d[i]+d[i+1]+d[i+2])/3<75;
    for(var x=0;x<W;x++){[x,(H-1)*W+x].forEach(function(t){if(!reach[t]&&isBg(t*4)){reach[t]=1;st.push(t);}});}
    for(var y=0;y<H;y++){[y*W,y*W+W-1].forEach(function(t){if(!reach[t]&&isBg(t*4)){reach[t]=1;st.push(t);}});}
    while(st.length){var q=st.pop();var nb=[q-1,q+1,q-W,q+W];for(var k=0;k<4;k++){var nn=nb[k];if(nn>=0&&nn<N&&!reach[nn]&&isBg(nn*4)){reach[nn]=1;st.push(nn);}}}
    for(var p=0;p<N;p++)if(reach[p]&&d[p*4+3]>40)d[p*4+3]=0;})();
  // --- STÄDNING 1: droppa mörka tunna vertikala skugg-strimmor (leg-gap-skugga som keyats in) ---
  // Identifieras på FORM+FÄRG (tunn+hög+mörk), ej storlek → skor/toppar/flerdelade plagg behålls.
  var op=new Uint8Array(N);for(var p=0;p<N;p++)op[p]=d[p*4+3]>40?1:0;
  var lab=new Int32Array(N).fill(-1),comps=[],st=[];
  for(var q=0;q<N;q++){if(!op[q]||lab[q]>=0)continue;var ci=comps.length,area=0,sl=0,bx0=W,by0=H,bx1=0,by1=0;lab[q]=ci;st.length=0;st.push(q);
    while(st.length){var u=st.pop();area++;sl+=(d[u*4]+d[u*4+1]+d[u*4+2])/3;var ux=u%W,uy=(u/W)|0;if(ux<bx0)bx0=ux;if(ux>bx1)bx1=ux;if(uy<by0)by0=uy;if(uy>by1)by1=uy;
      var nb=[u-1,u+1,u-W,u+W];for(var k=0;k<4;k++){var nn=nb[k];if(nn>=0&&nn<N&&op[nn]&&lab[nn]<0){lab[nn]=ci;st.push(nn);}}}
    comps.push({i:ci,area:area,w:bx1-bx0+1,h:by1-by0+1,by0:by0,by1:by1,lum:sl/area});}
  var main=comps.reduce((a,b)=>b.area>a.area?b:a,comps[0]);
  comps.forEach(c=>{var aw=c.area/c.h;
    var streak=(aw<24)&&(c.h>140)&&(c.h>2.5*aw)&&(c.lum<95);   // tunn+hög+mörk skugg-strimma (flarande bas via medelbredd)
    var darkStray=(c.lum<70)&&(c.area<main.area*0.5);          // ljus-bas → lös mörk komponent = skräp (kontur sitter fast i ljus kropp)
    var belowMain=(c!==main)&&(c.by0>main.by1-3)&&(c.area<main.area*0.5); // frånkopplad del UNDER plagget = stativ-stång/skugg-stray
    if(streak||darkStray||belowMain)for(var p=0;p<N;p++)if(lab[p]===c.i)d[p*4+3]=0;});
  // --- STÄDNING 1.2: ta bort tunna mörka linjer som EJ omges av ljust tyg (leg-gap-skugga kopplad till plagget) ---
  (function(){var K=10,rm=[];
    for(var y=0;y<H;y++)for(var x=0;x<W;x++){var i=(y*W+x)*4;if(d[i+3]<=40)continue;if((d[i]+d[i+1]+d[i+2])/3>=70)continue;
      var lL=false,lR=false;
      for(var k=1;k<=K&&!lL;k++){var xl=x-k;if(xl<0)break;var il=(y*W+xl)*4;if(d[il+3]>40&&(d[il]+d[il+1]+d[il+2])/3>110)lL=true;}
      for(var k2=1;k2<=K&&!lR;k2++){var xr=x+k2;if(xr>=W)break;var ir=(y*W+xr)*4;if(d[ir+3]>40&&(d[ir]+d[ir+1]+d[ir+2])/3>110)lR=true;}
      if(!lL&&!lR)rm.push(i);}
    for(var r=0;r<rm.length;r++)d[rm[r]+3]=0;
  })();
  // --- STÄDNING 1.5: HÅRDGÖR ALFA → solid silhuett (efter strimm-städning, så tunna strimmor ej breddas) ---
  for(var p4=0;p4<N;p4++){d[p4*4+3]=d[p4*4+3]>=25?255:0;}
  // fyll INKAPSLADE hål (transparent som ej når kanten = omringat av tyg) → helt solitt plagg
  (function(){var opq=new Uint8Array(N);for(var p=0;p<N;p++)opq[p]=d[p*4+3]>0?1:0;
    var reach=new Uint8Array(N),bs=[];
    for(var x=0;x<W;x++){[x,(H-1)*W+x].forEach(function(t){if(!opq[t]&&!reach[t]){reach[t]=1;bs.push(t);}});}
    for(var y=0;y<H;y++){[y*W,y*W+W-1].forEach(function(t){if(!opq[t]&&!reach[t]){reach[t]=1;bs.push(t);}});}
    while(bs.length){var q=bs.pop();var nb=[q-1,q+1,q-W,q+W];for(var k=0;k<4;k++){var m2=nb[k];if(m2>=0&&m2<N&&!opq[m2]&&!reach[m2]){reach[m2]=1;bs.push(m2);}}}
    for(var h=0;h<N;h++){if(opq[h]||reach[h])continue;var i=h*4;var hx=h%W,hy=(h/W)|0,rr=0,gg=0,bb=0,cnt=0;
      for(var oy=-2;oy<=2;oy++)for(var ox2=-2;ox2<=2;ox2++){var xx=hx+ox2,yy=hy+oy;if(xx<0||xx>=W||yy<0||yy>=H)continue;var nn=yy*W+xx;if(d[nn*4+3]>0){rr+=d[nn*4];gg+=d[nn*4+1];bb+=d[nn*4+2];cnt++;}}
      d[i+3]=255;if(cnt){d[i]=rr/cnt|0;d[i+1]=gg/cnt|0;d[i+2]=bb/cnt|0;}}
  })();
  // --- STÄDNING 2: shava 1px kant (tar bort mörk feather-frans runt hals/axlar) ---
  var a2=new Uint8Array(N);for(var p2=0;p2<N;p2++)a2[p2]=d[p2*4+3]>40?1:0;
  for(var p3=0;p3<N;p3++){if(!a2[p3])continue;var px=p3%W,py=(p3/W)|0;
    if(px===0||py===0||px===W-1||py===H-1||!a2[p3-1]||!a2[p3+1]||!a2[p3-W]||!a2[p3+W])d[p3*4+3]=0;}
  mx.putImageData(imgd,0,0);
  var x0=W,y0=H,x1=0,y1=0;
  for(var yy=0;yy<H;yy++)for(var xx=0;xx<W;xx++){if(d[(yy*W+xx)*4+3]>40){if(xx<x0)x0=xx;if(xx>x1)x1=xx;if(yy<y0)y0=yy;if(yy>y1)y1=yy;}}
  if(x1<=x0||y1<=y0)return {err:'tomt lager — inget att normalisera'};
  var bw=x1-x0,bcx=(x0+x1)/2;
  var T=${JSON.stringify(tgt)},CW=${CW},CH=${CH};
  var s=T.width/bw;                                  // skala så bredden matchar kanon
  var tx=T.centerX-bcx*s, ty=T.top-y0*s;             // axel-linje→T.top, mitt→T.centerX
  var c=document.createElement('canvas');c.width=CW;c.height=CH;var x=c.getContext('2d');
  x.imageSmoothingQuality='high';x.setTransform(s,0,0,s,tx,ty);x.drawImage(m,0,0);x.setTransform(1,0,0,1,0,0);
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
