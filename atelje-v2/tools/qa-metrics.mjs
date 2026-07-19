// OBJEKTIVA MÄTVÄRDEN för en extraherad plagg-PNG (tar mitt tyckande ur banan).
// Args: garment.png [ocX0 ocX1 ocY0 ocY1] [cvX0 cvX1 cvY0 cvY1]
//   OC = öppnings-band (skinn-läckage);  CV = covers-bbox (plagg-region f. stray/hål/densitet)
// Skriver metrics-JSON + PASS/FAIL. Kör mot Chrome 9004.
import fs from 'node:fs';
const PORT=9004;
const [,,GAR,ocX0,ocX1,ocY0,ocY1,cvX0,cvX1,cvY0,cvY1]=process.argv;
const OC = ocX0!==undefined ? [+ocX0,+ocX1,+ocY0,+ocY1] : null;
const CV = cvX0!==undefined ? [+cvX0,+cvX1,+cvY0,+cvY1] : null;
const gar="data:image/png;base64,"+fs.readFileSync(GAR).toString('base64');
const nt=await fetch(`http://localhost:${PORT}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());
const ws=new WebSocket(nt.webSocketDebuggerUrl);let mid=0;const pm=new Map();
const send=(m,p={})=>new Promise((res,rej)=>{const i=++mid;pm.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pm.has(m.id)){const p=pm.get(m.id);pm.delete(m.id);m.error?p.rej(new Error(m.error.message)):p.res(m.result);}});
await new Promise(r=>ws.addEventListener('open',r));await send('Runtime.enable');await new Promise(r=>setTimeout(r,400));
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;};
const M=await ev(`(async function(){
  function L(s){return new Promise(r=>{var i=new Image();i.onload=()=>r(i);i.src=s;});}
  var IM=await L(${JSON.stringify(gar)});var W=IM.naturalWidth,H=IM.naturalHeight;
  var c=document.createElement('canvas');c.width=W;c.height=H;var x=c.getContext('2d');x.drawImage(IM,0,0);
  var d=x.getImageData(0,0,W,H).data,N=W*H;
  var kept=0,magenta=0,skinOpen=0,fringe=0,stray=0;
  var oc=${OC?JSON.stringify(OC):'null'};
  var cv=${CV?JSON.stringify(CV):'null'};
  var ox0=oc?(W*oc[0])|0:0,ox1=oc?(W*oc[1])|0:0,oy0=oc?(H*oc[2])|0:0,oy1=oc?(H*oc[3])|0:0;
  var cx0=cv?(W*cv[0])|0:0,cx1=cv?(W*cv[1])|0:W,cy0=cv?(H*cv[2])|0:0,cy1=cv?(H*cv[3])|0:H;
  var op=new Uint8Array(N); // kept-mask f. komponenter
  for(var p=0;p<N;p++){var i=p*4;if(d[i+3]===0)continue;kept++;op[p]=1;
    var r=d[i],g=d[i+1],b=d[i+2];
    if(r>140&&g<95&&b>55&&b<205&&(r-g)>70)magenta++;
    var y=(p/W)|0,xx=p%W;
    if(oc&&xx>=ox0&&xx<ox1&&y>=oy0&&y<oy1){ if(r>195&&r>g&&g>b&&(r-b)>12&&(r-b)<90)skinOpen++; }
    if(cv&&(xx<cx0||xx>=cx1||y<cy0||y>=cy1))stray++;  // behållet UTANFÖR plagg-regionen
  }
  // frans: kept-pixlar med >=3 transparenta grannar / kept
  for(var y2=1;y2<H-1;y2++)for(var x2=1;x2<W-1;x2++){var pp=y2*W+x2;if(!op[pp])continue;
    var tn=0;for(var oy=-1;oy<=1;oy++)for(var oxx=-1;oxx<=1;oxx++){if(!op[(y2+oy)*W+(x2+oxx)])tn++;}
    if(tn>=3)fringe++;}
  // komponenter (BFS) -> antal öar < 300px = spökfragment
  var seen=new Uint8Array(N),ghosts=0,big=0,stack=[];
  for(var s=0;s<N;s++){if(!op[s]||seen[s])continue;var sz=0;stack.length=0;stack.push(s);seen[s]=1;
    while(stack.length){var q=stack.pop();sz++;var qy=(q/W)|0,qx=q%W;
      var nb=[q-1,q+1,q-W,q+W];for(var k=0;k<4;k++){var nn=nb[k];if(nn>=0&&nn<N&&op[nn]&&!seen[nn]){seen[nn]=1;stack.push(nn);}}}
    if(sz<300)ghosts++;else big++;}
  // interiorHoles: transparent inkapslad (ej border-ansluten) -> panel-dropout
  var vis=new Uint8Array(N),bstack=[];
  for(var e=0;e<W;e++){[e, (H-1)*W+e].forEach(function(t){if(!op[t]&&!vis[t]){vis[t]=1;bstack.push(t);}});}
  for(var e2=0;e2<H;e2++){[e2*W, e2*W+W-1].forEach(function(t){if(!op[t]&&!vis[t]){vis[t]=1;bstack.push(t);}});}
  while(bstack.length){var q2=bstack.pop();var nb2=[q2-1,q2+1,q2-W,q2+W];for(var k2=0;k2<4;k2++){var nn2=nb2[k2];if(nn2>=0&&nn2<N&&!op[nn2]&&!vis[nn2]){vis[nn2]=1;bstack.push(nn2);}}}
  // hål räknas EJ i öppnings-bandet (avsiktlig transparens) och EJ utanför covers
  var holes=0;for(var h=0;h<N;h++){if(op[h]||vis[h])continue;
    var hy=(h/W)|0,hx=h%W;
    if(oc&&hx>=ox0&&hx<ox1&&hy>=oy0&&hy<oy1)continue;       // öppning = ej hål
    if(cv&&(hx<cx0||hx>=cx1||hy<cy0||hy>=cy1))continue;      // utanför plagg = ej hål
    holes++;}
  // muddyInteriorCells: rutnät över covers; inre celler med halvdensitet (0.20..0.72) = spök/dropout
  var muddy=0,cellsChecked=0;
  if(cv){var GR=12,GC=8,cw=(cx1-cx0)/GC,ch=(cy1-cy0)/GR,dens=[];
    for(var gr=0;gr<GR;gr++){dens[gr]=[];for(var gc=0;gc<GC;gc++){var kk=0,tt=0;
      for(var yy=(cy0+gr*ch)|0;yy<(cy0+(gr+1)*ch)&&yy<H;yy++)for(var xx2=(cx0+gc*cw)|0;xx2<(cx0+(gc+1)*cw)&&xx2<W;xx2++){tt++;if(op[yy*W+xx2])kk++;}
      dens[gr][gc]=tt?kk/tt:0;}}
    for(var gr2=1;gr2<GR-1;gr2++)for(var gc2=1;gc2<GC-1;gc2++){
      // inre cell = grannceller till vä/hö båda har substans (undvik silhuett-kant)
      var self=dens[gr2][gc2], L=dens[gr2][gc2-1], R=dens[gr2][gc2+1];
      if(L>0.5 && R>0.5){cellsChecked++; if(self>=0.20 && self<=0.72)muddy++;}}}
  return {W:W,H:H,kept:kept,magenta:magenta,skinInOpening:skinOpen,fringePx:fringe,fringeRatio:+(fringe/kept).toFixed(3),ghostFragments:ghosts,mainMasses:big,strayOutsideCovers:stray,interiorHoles:holes,muddyInteriorCells:muddy,cellsChecked:cellsChecked};
})()`);
ws.close();
// trösklar
const T={magenta:40,skinInOpening:80,fringeRatio:0.06,ghostFragments:6,strayOutsideCovers:400,interiorHoles:600,muddyInteriorCells:4};
const pass = M.magenta<=T.magenta && M.skinInOpening<=T.skinInOpening && M.fringeRatio<=T.fringeRatio
  && M.ghostFragments<=T.ghostFragments && M.strayOutsideCovers<=T.strayOutsideCovers
  && M.interiorHoles<=T.interiorHoles && M.muddyInteriorCells<=T.muddyInteriorCells;
const chk=(ok)=>ok?'PASS':'FAIL';
console.log(JSON.stringify(M,null,0));
console.log('--- GRIND ---');
console.log(`magenta            ${M.magenta}\t${chk(M.magenta<=T.magenta)}  (≤${T.magenta})`);
console.log(`skinInOpening      ${M.skinInOpening}\t${chk(M.skinInOpening<=T.skinInOpening)}  (≤${T.skinInOpening})`);
console.log(`fringeRatio        ${M.fringeRatio}\t${chk(M.fringeRatio<=T.fringeRatio)}  (≤${T.fringeRatio})`);
console.log(`ghostFragments     ${M.ghostFragments}\t${chk(M.ghostFragments<=T.ghostFragments)}  (≤${T.ghostFragments})`);
console.log(`strayOutsideCovers ${M.strayOutsideCovers}\t${chk(M.strayOutsideCovers<=T.strayOutsideCovers)}  (≤${T.strayOutsideCovers})  [skalle/ben-konturer]`);
console.log(`interiorHoles      ${M.interiorHoles}\t${chk(M.interiorHoles<=T.interiorHoles)}  (≤${T.interiorHoles})  [panel-dropout]`);
console.log(`muddyInteriorCells ${M.muddyInteriorCells}\t${chk(M.muddyInteriorCells<=T.muddyInteriorCells)}  (≤${T.muddyInteriorCells})  [spök-ärm/opacitet, av ${M.cellsChecked} inre]`);
console.log(`==> ${pass?'✅ PASS':'❌ FAIL'}`);
