// LÅST PLAGG-RECEPT: align(snäpp plagg-shot till bas) -> diff -> openCenter-mask -> kant-erode.
// Args: base garmentShot out threshold [ocX0 ocX1 ocY0 ocY1]  (openCenter-band i frame-andelar; utelämna för stängda plagg)
// Kör mot Chrome 9004.
import fs from 'node:fs';
const PORT=9004;
const [,,BASE,SHOT,OUT,T='85',ocX0,ocX1,ocY0,ocY1,cvX0,cvX1,cvY0,cvY1]=process.argv;
const OC = ocX0!==undefined ? [+ocX0,+ocX1,+ocY0,+ocY1] : null;
const CV = cvX0!==undefined ? [+cvX0,+cvX1,+cvY0,+cvY1] : null;
const b64=p=>"data:image/png;base64,"+fs.readFileSync(p).toString('base64');
const base=b64(BASE), shot=b64(SHOT);

const nt=await fetch(`http://localhost:${PORT}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());
const ws=new WebSocket(nt.webSocketDebuggerUrl); let mid=0; const pending=new Map();
const send=(m,p={})=>new Promise((res,rej)=>{const i=++mid;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.rej(new Error(m.error.message)):p.res(m.result);}});
await new Promise(r=>ws.addEventListener('open',r));
await send('Runtime.enable'); await new Promise(r=>setTimeout(r,500));
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;};

await ev(`(async function(){
  function load(src){return new Promise(function(res){var im=new Image();im.onload=function(){res(im)};im.src=src;});}
  var BASE=await load(${JSON.stringify(base)}), SHOT=await load(${JSON.stringify(shot)});
  var W=BASE.naturalWidth,H=BASE.naturalHeight;
  function ctx(im,tf){var c=document.createElement('canvas');c.width=W;c.height=H;var x=c.getContext('2d');if(tf)x.setTransform(tf[0],0,0,tf[0],tf[1],tf[2]);x.drawImage(im,0,0);return x;}
  function idata(x){return x.getContext?x.getImageData(0,0,W,H):x;}
  // --- ankare (bg=hörn, fg-diff>60) ---
  function anchors(d){
    var bg=[d[0],d[1],d[2]];
    var fg=i=>(Math.abs(d[i]-bg[0])+Math.abs(d[i+1]-bg[1])+Math.abs(d[i+2]-bg[2]))>60;
    var cx0=(W*0.35)|0,cx1=(W*0.65)|0,hT=0,fB=H-1;
    for(var y=0;y<H;y++){for(var x=cx0;x<cx1;x++){if(fg((y*W+x)*4)){hT=y;y=H;break;}}}
    for(var y2=H-1;y2>=0;y2--){var h=false;for(var x2=cx0;x2<cx1;x2++){if(fg((y2*W+x2)*4)){h=true;break;}}if(h){fB=y2;break;}}
    var yb=(hT+(fB-hT)*0.22)|0,lo=W,hi=0;
    for(var x3=0;x3<W;x3++){if(fg((yb*W+x3)*4)){if(x3<lo)lo=x3;if(x3>hi)hi=x3;}}
    return {hT:hT,fB:fB,ht:fB-hT,cx:(lo+hi)/2};
  }
  var baseCtx=document.createElement('canvas');baseCtx.width=W;baseCtx.height=H;baseCtx.getContext('2d').drawImage(BASE,0,0);
  var bd=baseCtx.getContext('2d').getImageData(0,0,W,H).data;
  var shotRaw=document.createElement('canvas');shotRaw.width=W;shotRaw.height=H;shotRaw.getContext('2d').drawImage(SHOT,0,0);
  var sd0=shotRaw.getContext('2d').getImageData(0,0,W,H).data;
  var aB=anchors(bd), aS=anchors(sd0);
  // --- align shot -> base (skala+translatera) ---
  var s=aB.ht/aS.ht, dx=aB.cx-aS.cx*s, dy=aB.hT-aS.hT*s;
  var alc=document.createElement('canvas');alc.width=W;alc.height=H;var ax=alc.getContext('2d');
  ax.setTransform(s,0,0,s,dx,dy);ax.drawImage(SHOT,0,0);ax.setTransform(1,0,0,1,0,0);
  var sd=ax.getImageData(0,0,W,H).data;
  window.__align=JSON.stringify({base:aB,shot:aS,s:+s.toFixed(4),dx:Math.round(dx),dy:Math.round(dy)});
  // --- diff -> plagg ---
  var out=document.createElement('canvas');out.width=W;out.height=H;var ox=out.getContext('2d');
  var od=ox.getImageData(0,0,W,H),d=od.data,T=${T},keep=0;
  for(var i=0;i<d.length;i+=4){
    var dist=Math.abs(bd[i]-sd[i])+Math.abs(bd[i+1]-sd[i+1])+Math.abs(bd[i+2]-sd[i+2]);
    var r=sd[i],g=sd[i+1],b=sd[i+2];
    var magenta=(r>140 && g<95 && b>55 && b<205 && (r-g)>70);  // bas-magenta bleed => aldrig ett plagg
    if(dist>T && sd[i+3]>0 && !magenta){d[i]=r;d[i+1]=g;d[i+2]=b;d[i+3]=255;keep++;}
    else d[i+3]=0;
  }
  // --- covers-mask (POSITIV): behåll bara plagg-regionen -> dödar skalle/ben-konturer utanför ---
  ${CV?`(function(){var X0=(W*${CV[0]})|0,X1=(W*${CV[1]})|0,Y0=(H*${CV[2]})|0,Y1=(H*${CV[3]})|0;
    for(var y=0;y<H;y++)for(var x=0;x<W;x++){if(x<X0||x>=X1||y<Y0||y>=Y1)d[(y*W+x)*4+3]=0;}})();`:''}
  // --- openCenter-mask: nolla mittstrimman (öppna plagg) ---
  ${OC?`(function(){var x0=(W*${OC[0]})|0,x1=(W*${OC[1]})|0,y0=(H*${OC[2]})|0,y1=(H*${OC[3]})|0;
    for(var y=y0;y<y1;y++)for(var x=x0;x<x1;x++){d[(y*W+x)*4+3]=0;}})();`:''}
  // --- 2x uniform 1px-erode: rakar tunna kant-fransar (skinn+halo) oavsett färg ---
  for(var pass=0;pass<2;pass++){
    var a2=new Uint8ClampedArray(d);
    for(var y=1;y<H-1;y++)for(var x=1;x<W-1;x++){var i2=(y*W+x)*4;if(a2[i2+3]===0)continue;
      var tn=0;for(var oy=-1;oy<=1;oy++)for(var ox2=-1;ox2<=1;ox2++){if(a2[((y+oy)*W+(x+ox2))*4+3]===0)tn++;}
      if(tn>=3)d[i2+3]=0;                          // kant-pixel (>=3 transparenta grannar) bort
    }
  }
  // --- despeckle: släpp sammanhängande öar < 300px (spökfragment) ---
  (function(){var Wn=W,Hn=H,N=Wn*Hn,op=new Uint8Array(N);
    for(var p=0;p<N;p++)op[p]=d[p*4+3]>0?1:0;
    var seen=new Uint8Array(N),st=[];
    for(var s=0;s<N;s++){if(!op[s]||seen[s])continue;var comp=[s];seen[s]=1;st.length=0;st.push(s);
      while(st.length){var q=st.pop();var nb=[q-1,q+1,q-Wn,q+Wn];for(var k=0;k<4;k++){var nn=nb[k];if(nn>=0&&nn<N&&op[nn]&&!seen[nn]){seen[nn]=1;st.push(nn);comp.push(nn);}}}
      if(comp.length<300){for(var c2=0;c2<comp.length;c2++)d[comp[c2]*4+3]=0;}}
  })();
  ox.putImageData(od,0,0);
  window.__O=out.toDataURL('image/png');window.__keep=keep;
  // inspektion på schack
  var chk=document.createElement('canvas');chk.width=W;chk.height=H;var cc=chk.getContext('2d');var sq=24;
  for(var yy=0;yy<H;yy+=sq)for(var xx=0;xx<W;xx+=sq){cc.fillStyle=((xx/sq+yy/sq)&1)?'#cfcfcf':'#8f8f8f';cc.fillRect(xx,yy,sq,sq);}
  cc.drawImage(out,0,0);window.__chk=chk.toDataURL('image/png');
  return 'ok';
})()`);
console.log('ALIGN:',await ev('window.__align'));
console.log('behållna:',await ev('window.__keep'));
for(const [suf,g] of [['',"__O"],['-chk',"__chk"]]){
  const url=await ev('window.'+g);
  const p=OUT.replace(/\.png$/,suf+'.png');
  fs.writeFileSync(p, Buffer.from(url.split(',')[1],'base64'));
  console.log('→',p);
}
ws.close();
