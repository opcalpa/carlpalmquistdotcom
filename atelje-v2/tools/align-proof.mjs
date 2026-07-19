// DRIFT-LÅS-BEVIS: registrera driftade Kontext-outputs mot kanonisk baseBald,
// byt ansikte som lager, sätt SAMMA t-shirt på två olika dockor. Kör mot Chrome 9004.
import fs from 'node:fs';
const PORT=9004;
const CANON='/Users/calpa/Developer/carlpalmquistdotcom/atelje-v2/bodies/baseBald.png';
const TSHIRT='/Users/calpa/Developer/carlpalmquistdotcom/atelje-v2/proof/tshirt-extracted.png';
const W='/private/tmp/claude-501/-Users-calpa-Developer-PA/aaddbd11-061f-480f-b221-a21f6d290001/scratchpad/atelje-v2-drift';
const b64=p=>"data:image/png;base64,"+fs.readFileSync(p).toString('base64');
const canon=b64(CANON), tshirt=b64(TSHIRT), fA=b64(W+'/faceA-full.png'), fB=b64(W+'/faceB-full.png');

const nt=await fetch(`http://localhost:${PORT}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());
const ws=new WebSocket(nt.webSocketDebuggerUrl); let mid=0; const pending=new Map();
const send=(m,p={})=>new Promise((res,rej)=>{const i=++mid;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.rej(new Error(m.error.message)):p.res(m.result);}});
await new Promise(r=>ws.addEventListener('open',r));
await send('Runtime.enable'); await new Promise(r=>setTimeout(r,500));
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;};

await ev(`(async function(){
  function load(src){return new Promise(function(res){var im=new Image();im.onload=function(){res(im)};im.src=src;});}
  var CANON=await load(${JSON.stringify(canon)});
  var FA=await load(${JSON.stringify(fA)});
  var FB=await load(${JSON.stringify(fB)});
  var TS=await load(${JSON.stringify(tshirt)});
  var W=CANON.naturalWidth, H=CANON.naturalHeight;
  function ctxOf(im){var c=document.createElement('canvas');c.width=W;c.height=H;var x=c.getContext('2d');x.drawImage(im,0,0,W,H);return x;}
  function dataOf(im){return ctxOf(im).getImageData(0,0,W,H);}

  // --- mät kropps-ankare: bg = hörnfärg; fg = allt som skiljer sig >60 i summa ---
  function anchors(id){
    var d=id.data, bg=[d[0],d[1],d[2]];
    function fg(i){return (Math.abs(d[i]-bg[0])+Math.abs(d[i+1]-bg[1])+Math.abs(d[i+2]-bg[2]))>60;}
    var cx0=Math.floor(W*0.35), cx1=Math.floor(W*0.65);
    // huvudtopp: första rad uppifrån med fg i mitten
    var headTop=0;
    for(var y=0;y<H;y++){var hit=false;for(var x=cx0;x<cx1;x++){if(fg((y*W+x)*4)){hit=true;break;}}if(hit){headTop=y;break;}}
    // fotbotten: sista rad med fg i mitten
    var footBot=H-1;
    for(var y2=H-1;y2>=0;y2--){var hit2=false;for(var x2=cx0;x2<cx1;x2++){if(fg((y2*W+x2)*4)){hit2=true;break;}}if(hit2){footBot=y2;break;}}
    // mitt-x på axelhöjd (headTop + 22% av kroppshöjd)
    var yb=Math.floor(headTop+(footBot-headTop)*0.22), lo=W,hi=0;
    for(var x3=0;x3<W;x3++){if(fg((yb*W+x3)*4)){if(x3<lo)lo=x3;if(x3>hi)hi=x3;}}
    var cxMid=(lo+hi)/2;
    return {headTop:headTop, footBot:footBot, height:(footBot-headTop), cx:cxMid};
  }
  var aC=anchors(dataOf(CANON));
  window.__anch=JSON.stringify({canon:aC, A:anchors(dataOf(FA)), B:anchors(dataOf(FB))});

  // --- registrera en driftad bild mot canon (skala+translatera så ankare matchar) ---
  function register(im){
    var a=anchors(dataOf(im));
    var s=aC.height/a.height;                    // skala så kroppshöjden matchar
    var c=document.createElement('canvas');c.width=W;c.height=H;var x=c.getContext('2d');
    // placera så att a.headTop->aC.headTop och a.cx->aC.cx efter skalning
    var dx=aC.cx - a.cx*s, dy=aC.headTop - a.headTop*s;
    x.setTransform(s,0,0,s,dx,dy);
    x.drawImage(im,0,0);
    x.setTransform(1,0,0,1,0,0);
    return c;
  }
  var regA=register(FA), regB=register(FB);

  // --- bygg docka = canonical kropp + ansikts-ellips från registrerad variant (fjädrad) ---
  function makeDoll(regCanvas){
    var c=document.createElement('canvas');c.width=W;c.height=H;var x=c.getContext('2d');
    x.drawImage(CANON,0,0);                       // KANONISK kropp (byte-identisk för alla)
    // ansikts-ellips: centrum ~ (0.50W, headTop+0.09H-ish), radie täcker ögon/näsa/mun/kinder/bryn
    var fcx=W*0.50, fcy=aC.headTop+H*0.105, rx=W*0.135, ry=H*0.085;
    var mask=document.createElement('canvas');mask.width=W;mask.height=H;var mx=mask.getContext('2d');
    var g=mx.createRadialGradient(fcx,fcy,Math.min(rx,ry)*0.45,fcx,fcy,Math.max(rx,ry));
    g.addColorStop(0,'rgba(0,0,0,1)');g.addColorStop(0.72,'rgba(0,0,0,1)');g.addColorStop(1,'rgba(0,0,0,0)');
    mx.save();mx.translate(fcx,fcy);mx.scale(rx/Math.max(rx,ry),ry/Math.max(rx,ry));mx.translate(-fcx,-fcy);
    mx.fillStyle=g;mx.beginPath();mx.arc(fcx,fcy,Math.max(rx,ry),0,7);mx.fill();mx.restore();
    // ansikte = registrerad variant maskad med ellipsen
    var face=document.createElement('canvas');face.width=W;face.height=H;var fxx=face.getContext('2d');
    fxx.drawImage(regCanvas,0,0);
    fxx.globalCompositeOperation='destination-in';fxx.drawImage(mask,0,0);
    x.drawImage(face,0,0);                         // lägg ansikte över kanoniska huvudet
    return c;
  }
  var dollA=makeDoll(regA), dollB=makeDoll(regB);

  // --- klä på SAMMA t-shirt (1:1, samma offset på båda => rättvist fit-test) ---
  function dress(dollCanvas){
    var c=document.createElement('canvas');c.width=W;c.height=H;var x=c.getContext('2d');
    x.drawImage(dollCanvas,0,0); x.drawImage(TS,0,0,W,H); return c;
  }
  var dressA=dress(dollA), dressB=dress(dollB);

  // --- kontaktark: [baldA|baldB]  och  [dressA|dressB] ---
  function strip(cs){
    var g=8, cw=Math.floor(W*0.5), ch=Math.floor(H*0.5);
    var c=document.createElement('canvas');c.width=cw*cs.length+g*(cs.length-1);c.height=ch;
    var x=c.getContext('2d');x.fillStyle='#1a1a1a';x.fillRect(0,0,c.width,c.height);
    cs.forEach(function(cc,i){x.drawImage(cc,i*(cw+g),0,cw,ch);});
    return c.toDataURL('image/png');
  }
  window.__dollA=dollA.toDataURL('image/png');
  window.__dollB=dollB.toDataURL('image/png');
  window.__faces=strip([dollA,dollB]);
  window.__dressed=strip([dressA,dressB]);
  return 'ok';
})()`);

const anch=await ev('window.__anch');
console.log('ANKARE:', anch);
for(const [k,g] of [['dollA','__dollA'],['dollB','__dollB'],['faces-side','__faces'],['dressed-side','__dressed']]){
  const url=await ev('window.'+g);
  fs.writeFileSync(W+'/'+k+'.png', Buffer.from(url.split(',')[1],'base64'));
  console.log('→', k+'.png');
}
ws.close();
