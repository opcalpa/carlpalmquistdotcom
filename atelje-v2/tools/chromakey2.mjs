// GRÖN CHROMA-KEY v2: align shot->chroma-bas (fixar hand/passform) + FEATHERAD matte (mjuk kant, ingen frans).
// alpha = ramp på "greenness" => anti-aliasad kant. + despill + despeckle.
// Args: base(chroma) shot out
import fs from 'node:fs';
const PORT=9004;
const [,,BASE,SHOT,OUT]=process.argv;
const b64=p=>"data:image/png;base64,"+fs.readFileSync(p).toString('base64');
const base=b64(BASE), shot=b64(SHOT);
const nt=await fetch(`http://localhost:${PORT}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());
const ws=new WebSocket(nt.webSocketDebuggerUrl);let mid=0;const pm=new Map();
const send=(m,p={})=>new Promise((res,rej)=>{const i=++mid;pm.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pm.has(m.id)){const p=pm.get(m.id);pm.delete(m.id);m.error?p.rej(new Error(m.error.message)):p.res(m.result);}});
await new Promise(r=>ws.addEventListener('open',r));await send('Runtime.enable');await new Promise(r=>setTimeout(r,400));
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;};
await ev(`(async function(){function L(s){return new Promise(r=>{var i=new Image();i.onload=()=>r(i);i.src=s;});}
var BASE=await L(${JSON.stringify(base)}),SHOT=await L(${JSON.stringify(shot)});
var W=BASE.naturalWidth,H=BASE.naturalHeight,N=W*H;
function dat(im,tf){var c=document.createElement('canvas');c.width=W;c.height=H;var x=c.getContext('2d');if(tf)x.setTransform(tf[0],0,0,tf[0],tf[1],tf[2]);x.drawImage(im,0,0);x.setTransform(1,0,0,1,0,0);return x.getImageData(0,0,W,H).data;}
var bd=dat(BASE);
// align shot->bas via ankare (fg = ej mörk bg)
function anchors(d){var bg=[d[0],d[1],d[2]];var fg=i=>(Math.abs(d[i]-bg[0])+Math.abs(d[i+1]-bg[1])+Math.abs(d[i+2]-bg[2]))>60;
  var cx0=(W*0.35)|0,cx1=(W*0.65)|0,hT=0,fB=H-1;
  for(var y=0;y<H;y++){var h=false;for(var x=cx0;x<cx1;x++){if(fg((y*W+x)*4)){h=true;break;}}if(h){hT=y;break;}}
  for(var y2=H-1;y2>=0;y2--){var h2=false;for(var x2=cx0;x2<cx1;x2++){if(fg((y2*W+x2)*4)){h2=true;break;}}if(h2){fB=y2;break;}}
  var yb=(hT+(fB-hT)*0.22)|0,lo=W,hi=0;for(var x3=0;x3<W;x3++){if(fg((yb*W+x3)*4)){if(x3<lo)lo=x3;if(x3>hi)hi=x3;}}
  return {hT:hT,ht:fB-hT,cx:(lo+hi)/2};}
var sdraw=dat(SHOT),aB=anchors(bd),aS=anchors(sdraw);
var s=aB.ht/aS.ht,dx=aB.cx-aS.cx*s,dy=aB.hT-aS.hT*s;
var d=dat(SHOT,[s,dx,dy]);   // aligned shot
window.__align=JSON.stringify({s:+s.toFixed(4),dx:Math.round(dx),dy:Math.round(dy)});
var out=document.createElement('canvas');out.width=W;out.height=H;var ox=out.getContext('2d');var od=ox.getImageData(0,0,W,H),o=od.data;
for(var p=0;p<N;p++){var i=p*4;var r=d[i],g=d[i+1],b=d[i+2];var lum=(r+g+b)/3,mx=Math.max(r,g,b),mn=Math.min(r,g,b);
  // (mörk bakgrund tas bort SENARE via border-flood, så svart plagg överlever)
  if(d[i+3]===0){o[i+3]=0;continue;}
  // FEATHER: greenness = g - max(r,b); ramp 12..38 => alpha 255..0
  var greenness=g-Math.max(r,b);
  var a;
  if(greenness>=38)a=0; else if(greenness<=12)a=255; else a=Math.round(255*(38-greenness)/(38-12));
  o[i]=r;o[i+1]=g;o[i+2]=b;o[i+3]=a;
}
// BORDER-FLOOD MÖRKT = bakgrund: ta bort mörk-neutralt som NÅR kanten; inkapslat svart (plagg) behålls
(function(){var dark=i=>{var r=o[i],g=o[i+1],b=o[i+2];var l=(r+g+b)/3,mx=Math.max(r,g,b),mn=Math.min(r,g,b);return l<72&&(mx-mn)<30;};
  var reach=new Uint8Array(N),st=[];
  for(var x=0;x<W;x++){[x,(H-1)*W+x].forEach(t=>{if(o[t*4+3]>0&&dark(t*4)&&!reach[t]){reach[t]=1;st.push(t);}});}
  for(var y=0;y<H;y++){[y*W,y*W+W-1].forEach(t=>{if(o[t*4+3]>0&&dark(t*4)&&!reach[t]){reach[t]=1;st.push(t);}});}
  while(st.length){var q=st.pop();var nb=[q-1,q+1,q-W,q+W];for(var k=0;k<4;k++){var nn=nb[k];if(nn>=0&&nn<N&&!reach[nn]&&o[nn*4+3]>0&&dark(nn*4)){reach[nn]=1;st.push(nn);}}}
  for(var p=0;p<N;p++)if(reach[p])o[p*4+3]=0;
})();
// despill: dämpa grön-tint i kvarvarande pixlar
for(var p2=0;p2<N;p2++){var i2=p2*4;if(o[i2+3]===0)continue;var lim=(o[i2]+o[i2+2])/2+8;if(o[i2+1]>lim)o[i2+1]=lim;}
// fraktions-despeckle (>=8% av största, på alpha>40)
var op=new Uint8Array(N);for(var p3=0;p3<N;p3++)op[p3]=o[p3*4+3]>40?1:0;var sn=new Uint8Array(N),st=[],comps=[];
for(var q=0;q<N;q++){if(!op[q]||sn[q])continue;var comp=[q];sn[q]=1;st.length=0;st.push(q);while(st.length){var u=st.pop();var nb=[u-1,u+1,u-W,u+W];for(var k=0;k<4;k++){var nn=nb[k];if(nn>=0&&nn<N&&op[nn]&&!sn[nn]){sn[nn]=1;st.push(nn);comp.push(nn);}}}comps.push(comp);}
var mxs=0;comps.forEach(c=>{if(c.length>mxs)mxs=c.length;});var floor=Math.max(300,mxs*0.08);
comps.forEach(c=>{if(c.length<floor)for(var j=0;j<c.length;j++)o[c[j]*4+3]=0;});
// FYLL INKAPSLADE MIKROHÅL: transparenta pixlar som EJ når kanten (omringade av tyg) => fyll m. grannfärg
(function(){var opq=new Uint8Array(N);for(var p=0;p<N;p++)opq[p]=o[p*4+3]>128?1:0;
  var reach=new Uint8Array(N),bs=[];
  for(var x2=0;x2<W;x2++){[x2,(H-1)*W+x2].forEach(t=>{if(!opq[t]&&!reach[t]){reach[t]=1;bs.push(t);}});}
  for(var y2=0;y2<H;y2++){[y2*W,y2*W+W-1].forEach(t=>{if(!opq[t]&&!reach[t]){reach[t]=1;bs.push(t);}});}
  while(bs.length){var q2=bs.pop();var nb2=[q2-1,q2+1,q2-W,q2+W];for(var k2=0;k2<4;k2++){var m2=nb2[k2];if(m2>=0&&m2<N&&!opq[m2]&&!reach[m2]){reach[m2]=1;bs.push(m2);}}}
  for(var h=0;h<N;h++){if(opq[h]||reach[h])continue;   // inkapslat hål
    var i=h*4;var hx=h%W,hy=(h/W)|0,rr=0,gg=0,bb=0,cnt=0;
    for(var oy=-2;oy<=2;oy++)for(var ox2=-2;ox2<=2;ox2++){var xx=hx+ox2,yy=hy+oy;if(xx<0||xx>=W||yy<0||yy>=H)continue;var nn=yy*W+xx;if(opq[nn]){rr+=o[nn*4];gg+=o[nn*4+1];bb+=o[nn*4+2];cnt++;}}
    if(cnt){o[i]=rr/cnt|0;o[i+1]=gg/cnt|0;o[i+2]=bb/cnt|0;o[i+3]=255;}}
})();
ox.putImageData(od,0,0);window.__O=out.toDataURL('image/png');
var chk=document.createElement('canvas');chk.width=W;chk.height=H;var cc=chk.getContext('2d');var sq=24;for(var yq=0;yq<H;yq+=sq)for(var xq=0;xq<W;xq+=sq){cc.fillStyle=((xq/sq+yq/sq)&1)?'#cfcfcf':'#8f8f8f';cc.fillRect(xq,yq,sq,sq);}cc.drawImage(out,0,0);window.__chk=chk.toDataURL('image/png');
return 'ok';})()`);
console.log('align:',await ev('window.__align'));
for(const [suf,g] of [['',"__O"],['-chk',"__chk"]]){const url=await ev('window.'+g);const p=OUT.replace(/\.png$/,suf+'.png');fs.writeFileSync(p,Buffer.from(url.split(',')[1],'base64'));console.log('→',p);}
ws.close();
