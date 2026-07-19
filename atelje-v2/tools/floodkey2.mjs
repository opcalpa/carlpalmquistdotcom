// FLOOD-KEY v2 (bas-medveten): align shot->bas, sen floda negativa rummet =
// {mörk bg} ELLER {~oförändrat mot bas} från kanten. Ej-nått = plagget SOLIDT.
// Robust: plagg-över-magenta/skinn ger stor bas-skillnad => solitt; öppning=oförändrat => flodas.
// Args: base shot out [tol=60] [cvX0 cvX1 cvY0 cvY1]
import fs from 'node:fs';
const PORT=9004;
const [,,BASE,SHOT,OUT,TOL='60',cvX0,cvX1,cvY0,cvY1,ocX0,ocX1,ocY0,ocY1]=process.argv;
const CV = cvX0!==undefined ? [+cvX0,+cvX1,+cvY0,+cvY1] : null;
const OC = ocX0!==undefined ? [+ocX0,+ocX1,+ocY0,+ocY1] : null;
const b64=p=>"data:image/png;base64,"+fs.readFileSync(p).toString('base64');
const base=b64(BASE), shot=b64(SHOT);
const nt=await fetch(`http://localhost:${PORT}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());
const ws=new WebSocket(nt.webSocketDebuggerUrl);let mid=0;const pm=new Map();
const send=(m,p={})=>new Promise((res,rej)=>{const i=++mid;pm.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pm.has(m.id)){const p=pm.get(m.id);pm.delete(m.id);m.error?p.rej(new Error(m.error.message)):p.res(m.result);}});
await new Promise(r=>ws.addEventListener('open',r));await send('Runtime.enable');await new Promise(r=>setTimeout(r,400));
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;};
await ev(`(async function(){
  function L(s){return new Promise(r=>{var i=new Image();i.onload=()=>r(i);i.src=s;});}
  var BASE=await L(${JSON.stringify(base)}),SHOT=await L(${JSON.stringify(shot)});
  var W=BASE.naturalWidth,H=BASE.naturalHeight,N=W*H,TOL=${TOL};
  function dat(im,tf){var c=document.createElement('canvas');c.width=W;c.height=H;var x=c.getContext('2d');if(tf){x.setTransform(tf[0],0,0,tf[0],tf[1],tf[2]);}x.drawImage(im,0,0);x.setTransform(1,0,0,1,0,0);return x.getImageData(0,0,W,H).data;}
  var bd=dat(BASE);
  // align shot->bas via ankare (bg=hörn, fg-diff>60)
  function anchors(d){var bg=[d[0],d[1],d[2]];var fg=i=>(Math.abs(d[i]-bg[0])+Math.abs(d[i+1]-bg[1])+Math.abs(d[i+2]-bg[2]))>60;
    var cx0=(W*0.35)|0,cx1=(W*0.65)|0,hT=0,fB=H-1;
    for(var y=0;y<H;y++){var h=false;for(var x=cx0;x<cx1;x++){if(fg((y*W+x)*4)){h=true;break;}}if(h){hT=y;break;}}
    for(var y2=H-1;y2>=0;y2--){var h2=false;for(var x2=cx0;x2<cx1;x2++){if(fg((y2*W+x2)*4)){h2=true;break;}}if(h2){fB=y2;break;}}
    var yb=(hT+(fB-hT)*0.22)|0,lo=W,hi=0;for(var x3=0;x3<W;x3++){if(fg((yb*W+x3)*4)){if(x3<lo)lo=x3;if(x3>hi)hi=x3;}}
    return {hT:hT,ht:fB-hT,cx:(lo+hi)/2};}
  var sdraw=dat(SHOT),aB=anchors(bd),aS=anchors(sdraw);
  var s=aB.ht/aS.ht,dx=aB.cx-aS.cx*s,dy=aB.hT-aS.hT*s;
  var sd=dat(SHOT,[s,dx,dy]);
  // negativa rummet: mörk bg ELLER ~oförändrat mot bas
  function neg(i){var lum=(sd[i]+sd[i+1]+sd[i+2])/3,mx=Math.max(sd[i],sd[i+1],sd[i+2]),mn=Math.min(sd[i],sd[i+1],sd[i+2]);
    if(sd[i+3]===0)return true;
    if(lum<95&&(mx-mn)<26)return true;                                          // mörk bg
    var diff=Math.abs(sd[i]-bd[i])+Math.abs(sd[i+1]-bd[i+1])+Math.abs(sd[i+2]-bd[i+2]);
    return diff<TOL;                                                            // oförändrat mot bas
  }
  var reached=new Uint8Array(N),st=[];
  for(var xx=0;xx<W;xx++){[xx,(H-1)*W+xx].forEach(function(p){if(neg(p*4)&&!reached[p]){reached[p]=1;st.push(p);}});}
  for(var yy=0;yy<H;yy++){[yy*W,yy*W+W-1].forEach(function(p){if(neg(p*4)&&!reached[p]){reached[p]=1;st.push(p);}});}
  // + seeda från VISIBEL magenta (basen syns => öppning, även inkapslad): magenta finns aldrig i ett plagg
  for(var ps=0;ps<N;ps++){var is=ps*4;if(reached[ps])continue;var rr=sd[is],gg=sd[is+1],bb=sd[is+2];
    if(rr>135&&gg<105&&bb>50&&bb<210&&(rr-gg)>60){reached[ps]=1;st.push(ps);}}
  // + seeda från öppnings-bandet (känd mitt-kolumn): alla NEGATIVA pixlar där => hela öppningen (magenta+skinn) flodas
  ${OC?`(function(){var X0=(W*${OC[0]})|0,X1=(W*${OC[1]})|0,Y0=(H*${OC[2]})|0,Y1=(H*${OC[3]})|0;
    for(var y=Y0;y<Y1;y++)for(var x=X0;x<X1;x++){var pp=y*W+x;if(!reached[pp]&&neg(pp*4)){reached[pp]=1;st.push(pp);}}})();`:''}
  while(st.length){var q=st.pop();var nb=[q-1,q+1,q-W,q+W];for(var k=0;k<4;k++){var nn=nb[k];if(nn>=0&&nn<N&&!reached[nn]&&neg(nn*4)){reached[nn]=1;st.push(nn);}}}
  // plagg = ej nått = solid; färg tas från (aligned) shot
  var out=document.createElement('canvas');out.width=W;out.height=H;var ox=out.getContext('2d');
  var od=ox.getImageData(0,0,W,H),o=od.data,keep=0;
  for(var p2=0;p2<N;p2++){var i=p2*4;if(reached[p2]){o[i+3]=0;}else{o[i]=sd[i];o[i+1]=sd[i+1];o[i+2]=sd[i+2];o[i+3]=255;keep++;}}
  ${CV?`(function(){var X0=(W*${CV[0]})|0,X1=(W*${CV[1]})|0,Y0=(H*${CV[2]})|0,Y1=(H*${CV[3]})|0;for(var y=0;y<H;y++)for(var x=0;x<W;x++){if(x<X0||x>=X1||y<Y0||y>=Y1)o[(y*W+x)*4+3]=0;}})();`:''}
  var a2=new Uint8ClampedArray(o);for(var y3=1;y3<H-1;y3++)for(var x3=1;x3<W-1;x3++){var i3=(y3*W+x3)*4;if(a2[i3+3]===0)continue;var tn=0;for(var oy=-1;oy<=1;oy++)for(var oxx=-1;oxx<=1;oxx++){if(a2[((y3+oy)*W+(x3+oxx))*4+3]===0)tn++;}if(tn>=3)o[i3+3]=0;}
  (function(){var op=new Uint8Array(N);for(var p=0;p<N;p++)op[p]=o[p*4+3]>0?1:0;var sn=new Uint8Array(N),s2=[];for(var ss=0;ss<N;ss++){if(!op[ss]||sn[ss])continue;var comp=[ss];sn[ss]=1;s2.length=0;s2.push(ss);while(s2.length){var q2=s2.pop();var nb2=[q2-1,q2+1,q2-W,q2+W];for(var k2=0;k2<4;k2++){var m2=nb2[k2];if(m2>=0&&m2<N&&op[m2]&&!sn[m2]){sn[m2]=1;s2.push(m2);comp.push(m2);}}}if(comp.length<300)for(var c3=0;c3<comp.length;c3++)o[comp[c3]*4+3]=0;}})();
  ox.putImageData(od,0,0);window.__O=out.toDataURL('image/png');window.__k=keep;
  var chk=document.createElement('canvas');chk.width=W;chk.height=H;var cc=chk.getContext('2d');var sq=24;for(var yq=0;yq<H;yq+=sq)for(var xq=0;xq<W;xq+=sq){cc.fillStyle=((xq/sq+yq/sq)&1)?'#cfcfcf':'#8f8f8f';cc.fillRect(xq,yq,sq,sq);}cc.drawImage(out,0,0);window.__chk=chk.toDataURL('image/png');
  return 'ok';
})()`);
console.log('flood-key2 behållna:',await ev('window.__k'));
for(const [suf,g] of [['',"__O"],['-chk',"__chk"]]){const url=await ev('window.'+g);const p=OUT.replace(/\.png$/,suf+'.png');fs.writeFileSync(p,Buffer.from(url.split(',')[1],'base64'));console.log('→',p);}
ws.close();
