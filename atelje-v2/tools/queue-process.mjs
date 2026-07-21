// queue-process: grön-keya en inkommen Cowork-bild + mät kvalitet, skriv feedback. Godkänner ALDRIG.
// Användning: node queue-process.mjs <id>
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const Q='/Users/calpa/PA/atelje-gen-queue';
const REPO='/Users/calpa/Developer/carlpalmquistdotcom';
const PORT=9004;
const id=process.argv[2];
if(!id){console.error('användning: queue-process.mjs <id>');process.exit(1);}
const reqPath=`${Q}/requests/${id}.json`;
if(!fs.existsSync(reqPath)){console.error('saknar request:',reqPath);process.exit(1);}
const job=JSON.parse(fs.readFileSync(reqPath,'utf8'));
const shot=`${Q}/incoming/${id}.png`;
if(!fs.existsSync(shot)){console.error('saknar incoming/'+id+'.png — Cowork har inte genererat än');process.exit(1);}
const base=`${REPO}/atelje-v2/bodies/baseChroma.png`;
const outPng=`${Q}/staging/${id}.png`;

// 1) grön-key via kanonisk chromakey2 (öppnar egen flik på 9004, skriver out + -chk)
console.log('→ grön-key (chromakey2)…');
execFileSync('node',[`${REPO}/atelje-v2/tools/chromakey2.mjs`,base,shot,outPng],{stdio:'inherit'});

// 2) mät grön-överlevnad (råbild) + läckage/hål (keyad utdata) via canvas på 9004
const b64=p=>'data:image/png;base64,'+fs.readFileSync(p).toString('base64');
const nt=await fetch(`http://localhost:${PORT}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());
const ws=new WebSocket(nt.webSocketDebuggerUrl);let mid=0;const pm=new Map();
const send=(m,p={})=>new Promise((res,rej)=>{const i=++mid;pm.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pm.has(m.id)){const p=pm.get(m.id);pm.delete(m.id);m.error?p.rej(new Error(m.error.message)):p.res(m.result);}});
await new Promise(r=>ws.addEventListener('open',r));await send('Runtime.enable');await new Promise(r=>setTimeout(r,300));
const metrics=await send('Runtime.evaluate',{returnByValue:true,awaitPromise:true,expression:`(async function(){
  function L(s){return new Promise(r=>{var i=new Image();i.onload=()=>r(i);i.src=s;});}
  function px(im){var c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;var x=c.getContext('2d');x.drawImage(im,0,0);return {d:x.getImageData(0,0,c.width,c.height).data,W:c.width,H:c.height};}
  var raw=px(await L(${JSON.stringify(b64(shot))}));
  var out=px(await L(${JSON.stringify(b64(outPng))}));
  // grön-överlevnad i råbilden: andel pixlar med tydligt grönt (g-max(r,b)>40) av alla
  var rd=raw.d,green=0,tot=raw.W*raw.H;
  for(var p=0;p<rd.length;p+=4){if((rd[p+1]-Math.max(rd[p],rd[p+2]))>40)green++;}
  var greenSurvival=+(100*green/tot).toFixed(1);
  // keyad utdata: opak-täckning + residual-grönt (läckage) + inkapslade hål
  var od=out.d,W=out.W,H=out.H,N=W*H,opq=0,resid=0;
  for(var q=0;q<N;q++){var a=od[q*4+3];if(a>128){opq++;if((od[q*4+1]-Math.max(od[q*4],od[q*4+2]))>30)resid++;}}
  var opaqueFrac=+(100*opq/N).toFixed(1);
  var residualGreen=+(100*resid/Math.max(1,opq)).toFixed(2);
  // inkapslade hål: transparenta pixlar som ej når kanten, inuti opak massa
  var isO=new Uint8Array(N);for(var i=0;i<N;i++)isO[i]=od[i*4+3]>128?1:0;
  var reach=new Uint8Array(N),st=[];
  for(var x=0;x<W;x++){[x,(H-1)*W+x].forEach(t=>{if(!isO[t]&&!reach[t]){reach[t]=1;st.push(t);}});}
  for(var y=0;y<H;y++){[y*W,y*W+W-1].forEach(t=>{if(!isO[t]&&!reach[t]){reach[t]=1;st.push(t);}});}
  while(st.length){var u=st.pop();var nb=[u-1,u+1,u-W,u+W];for(var k=0;k<4;k++){var n=nb[k];if(n>=0&&n<N&&!isO[n]&&!reach[n]){reach[n]=1;st.push(n);}}}
  var holes=0;for(var h=0;h<N;h++)if(!isO[h]&&!reach[h])holes++;
  var holeFrac=+(100*holes/N).toFixed(2);
  return {greenSurvival,opaqueFrac,residualGreen,holeFrac,W,H};
})()`});
ws.close();
const m=metrics.result.value;

// 3) verdict-utkast (rådgivande — människa/kritiker dömer)
const survOK=m.greenSurvival>=8;            // grönt tydligt kvar i råbilden
const leakOK=m.residualGreen<=0.5;          // ~inget grönt läckte in i lagret
const holeOK=m.holeFrac<=0.15;              // ~inga inkapslade hål
const verdict = !survOK ? 'FAIL-CHANNEL (grönt överlevde ej generatorn)'
  : (leakOK&&holeOK) ? 'CLEAN-CANDIDATE (kräver Calle/kritiker-öga på -chk)'
  : 'MINOR (grön-key behöver justeras eller re-prompt)';

const fb=`# feedback: ${id}

**verdict (utkast, ej facit):** ${verdict}

## mätvärden
- grön-överlevnad (råbild): **${m.greenSurvival}%**  ${survOK?'✅':'❌ (för lågt — grönt omfärgades)'}
- opak-täckning (lager): ${m.opaqueFrac}%
- residual-grönt i lagret: **${m.residualGreen}%**  ${leakOK?'✅':'⚠️ grönt läckte in'}
- inkapslade hål: **${m.holeFrac}%**  ${holeOK?'✅':'⚠️ genomskinliga hål i tyget'}
- storlek: ${m.W}×${m.H}

## granska
Öppna \`staging/${id}-chk.png\` (rutig bakgrund). Leta: gröna kanter, hål i tyget,
ben-/kropps-spöken, bakpanel som sticker ut.

## nästa
${verdict.startsWith('CLEAN')
  ? `- Om Calle/kritiker säger CLEAN: \`node atelje-v2/tools/queue-approve.mjs ${id}\``
  : verdict.startsWith('FAIL')
  ? `- Nano Banana bevarar inte grönt → chroma-kanalen fungerar ej. Fall tillbaka på hud-docka eller vänta på fal-credits. Logga utfallet här.`
  : `- Re-prompta i Cowork: förstärk "keep the bright green skin EXACTLY, do not recolor the body", spara ny incoming/${id}.png, kör queue-process igen.`}
`;
fs.writeFileSync(`${Q}/feedback/${id}.md`,fb);
job.status='processed';fs.writeFileSync(reqPath,JSON.stringify(job,null,2)+'\n');
console.log('\n'+fb);
console.log('✓ feedback skriven: feedback/'+id+'.md  ·  granska staging/'+id+'-chk.png');
