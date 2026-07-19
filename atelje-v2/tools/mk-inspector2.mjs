import fs from 'node:fs';
const W='/private/tmp/claude-501/-Users-calpa-Developer-PA/aaddbd11-061f-480f-b221-a21f6d290001/scratchpad/atelje-v2-drift';
const d=p=>"data:image/png;base64,"+fs.readFileSync(p).toString('base64');
const L={doll:d(W+'/dollA.png'),tshirt:d(W+'/tshirt-flood.png'),pants:d(W+'/pants-flood.png'),jacket:d(W+'/jacket-clean2.png'),hair:d(W+'/hair-clean2.png')};
const html=`<!doctype html><html><head><meta charset="utf8"><title>Ateljé v2 — rena lager</title><style>
body{margin:0;background:#141414;color:#e8e8e8;font:15px/1.5 -apple-system,Segoe UI,sans-serif}
header{padding:14px 20px;border-bottom:1px solid #2a2a2a} h1{margin:0;font-size:17px}.sub{color:#9a9a9a;font-size:13px;margin-top:3px}
.wrap{display:flex;gap:24px;padding:20px;flex-wrap:wrap}.panel{background:#1c1c1c;border:1px solid #2a2a2a;border-radius:10px;padding:14px}
.stage{position:relative;width:400px;height:740px;border-radius:8px;overflow:hidden}.stage.dark{background:#333}
.stage.chk{background-image:conic-gradient(#bbb 90deg,#8f8f8f 0 180deg,#bbb 0 270deg,#8f8f8f 0);background-size:28px 28px}
.stage img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
label.tog{display:flex;align-items:center;gap:8px;padding:6px 2px;cursor:pointer}.controls{min-width:240px}h3{margin:14px 0 6px;font-size:14px;color:#bbb}
.hint{font-size:12.5px;color:#9a9a9a;margin:10px 0;padding:10px;background:#161616;border-left:3px solid #4a7;border-radius:4px}</style></head><body>
<header><h1>Ateljé v2 — rena lager (flood-key + skin-kill + fraktions-despeckle)</h1>
<div class="sub">Varje lager ska ENBART addera sitt: inga opacitetshål, inga kropps/ansikts-ghosts, ingen ryggdel. Kryssa i Schack för hård granskning.</div></header>
<div class="wrap"><div class="panel controls"><h3>Lager</h3>
<label class="tog"><input type=checkbox id=Ltshirt> 👕 T-shirt</label>
<label class="tog"><input type=checkbox id=Lpants> 👖 Byxor</label>
<label class="tog"><input type=checkbox id=Ljacket checked> 🧥 Dunjacka (öppen)</label>
<label class="tog"><input type=checkbox id=Lhair checked> 💇 Hår</label>
<h3>Vy</h3><label class="tog"><input type=checkbox id=bg> Schack-bakgrund</label>
<h3>Zoom</h3><input type=range id=zoom min=1 max=3 step=0.1 value=1 style="width:100%">
<div class="hint">Test: släck ett plagg → underlaget ska vara oförändrat. Tänd → adderar bara sitt. Byxor: följer benen (pose-lås). Jacka: öppning visar underlaget, ingen ryggdel/ben-ghost. Hår: täcker hjässan, inga ansikts-fragment.</div></div>
<div class="panel"><div class="stage dark" id="stage">
<img src="${L.doll}" style="z-index:1"><img src="${L.tshirt}" id=Itshirt style="z-index:2;display:none">
<img src="${L.pants}" id=Ipants style="z-index:3;display:none"><img src="${L.jacket}" id=Ijacket style="z-index:4">
<img src="${L.hair}" id=Ihair style="z-index:5"></div></div></div>
<script>const $=i=>document.getElementById(i);['tshirt','pants','jacket','hair'].forEach(k=>$('L'+k).onchange=e=>$('I'+k).style.display=e.target.checked?'block':'none');
$('bg').onchange=e=>{$('stage').classList.toggle('chk',e.target.checked);$('stage').classList.toggle('dark',!e.target.checked);};
$('zoom').oninput=e=>$('stage').style.transform='scale('+e.target.value+')';</script></body></html>`;
fs.writeFileSync(W+'/inspector.html',html);console.log('✓ inspector ombyggd,',(html.length/1024/1024).toFixed(1),'MB');
