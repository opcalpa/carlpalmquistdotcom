// GRÖN CHROMA-KEY: ta bort grön-dominant (kropp) + mörk bg. Kvar = plagget SOLIDT.
// Ingen hud finns => inga skinn-ghosts möjliga. + green-despill på kant-pixlar.
// Args: shot out [despeckle=300]
import fs from 'node:fs';
const PORT=9004;
const [,,SHOT,OUT]=process.argv;
const shot="data:image/png;base64,"+fs.readFileSync(SHOT).toString('base64');
const nt=await fetch(`http://localhost:${PORT}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());
const ws=new WebSocket(nt.webSocketDebuggerUrl);let mid=0;const pm=new Map();
const send=(m,p={})=>new Promise((res,rej)=>{const i=++mid;pm.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pm.has(m.id)){const p=pm.get(m.id);pm.delete(m.id);m.error?p.rej(new Error(m.error.message)):p.res(m.result);}});
await new Promise(r=>ws.addEventListener('open',r));await send('Runtime.enable');await new Promise(r=>setTimeout(r,400));
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;};
await ev(`(async function(){function L(s){return new Promise(r=>{var i=new Image();i.onload=()=>r(i);i.src=s;});}
var IM=await L(${JSON.stringify(shot)});var W=IM.naturalWidth,H=IM.naturalHeight,N=W*H;
var c=document.createElement('canvas');c.width=W;c.height=H;var x=c.getContext('2d');x.drawImage(IM,0,0);
var id=x.getImageData(0,0,W,H),d=id.data;
function isGreen(i){var r=d[i],g=d[i+1],b=d[i+2];return g>85 && g-r>22 && g-b>22;}       // kropps-grön
function isBg(i){var r=d[i],g=d[i+1],b=d[i+2];var mx=Math.max(r,g,b),mn=Math.min(r,g,b);return (r+g+b)/3<70 && (mx-mn)<28;} // mörk bg
// 1) ta bort grön + bg
var keep=0;for(var p=0;p<N;p++){var i=p*4;if(isGreen(i)||isBg(i)){d[i+3]=0;}else{d[i+3]=255;keep++;}}
// 2) green-despill: dämpa grön-tint i kvarvarande kant-pixlar (g > medel av r,b => klamp)
for(var p2=0;p2<N;p2++){var i2=p2*4;if(d[i2+3]===0)continue;var r=d[i2],g=d[i2+1],b=d[i2+2];var lim=(r+b)/2+8;if(g>lim){d[i2+1]=lim;}}
// 3) 1px erode (kant-frans)
var a2=new Uint8ClampedArray(d);for(var y=1;y<H-1;y++)for(var xx=1;xx<W-1;xx++){var i3=(y*W+xx)*4;if(a2[i3+3]===0)continue;var tn=0;for(var oy=-1;oy<=1;oy++)for(var ox=-1;ox<=1;ox++){if(a2[((y+oy)*W+(xx+ox))*4+3]===0)tn++;}if(tn>=3)d[i3+3]=0;}
// 4) fraktions-despeckle (behåll massor >=8% av största)
var op=new Uint8Array(N);for(var p3=0;p3<N;p3++)op[p3]=d[p3*4+3]>0?1:0;var sn=new Uint8Array(N),st=[],comps=[];
for(var s=0;s<N;s++){if(!op[s]||sn[s])continue;var comp=[s];sn[s]=1;st.length=0;st.push(s);while(st.length){var q=st.pop();var nb=[q-1,q+1,q-W,q+W];for(var k=0;k<4;k++){var nn=nb[k];if(nn>=0&&nn<N&&op[nn]&&!sn[nn]){sn[nn]=1;st.push(nn);comp.push(nn);}}}comps.push(comp);}
var mxs=0;comps.forEach(c2=>{if(c2.length>mxs)mxs=c2.length;});var floor=Math.max(300,mxs*0.08);
comps.forEach(c2=>{if(c2.length<floor)for(var j=0;j<c2.length;j++)d[c2[j]*4+3]=0;});
x.putImageData(id,0,0);window.__O=c.toDataURL('image/png');window.__k=keep;
var chk=document.createElement('canvas');chk.width=W;chk.height=H;var cc=chk.getContext('2d');var sq=24;for(var yq=0;yq<H;yq+=sq)for(var xq=0;xq<W;xq+=sq){cc.fillStyle=((xq/sq+yq/sq)&1)?'#cfcfcf':'#8f8f8f';cc.fillRect(xq,yq,sq,sq);}cc.drawImage(c,0,0);window.__chk=chk.toDataURL('image/png');
return 'ok';})()`);
console.log('chroma-key behållna:',await ev('window.__k'));
for(const [suf,g] of [['',"__O"],['-chk',"__chk"]]){const url=await ev('window.'+g);const p=OUT.replace(/\.png$/,suf+'.png');fs.writeFileSync(p,Buffer.from(url.split(',')[1],'base64'));console.log('→',p);}
ws.close();
