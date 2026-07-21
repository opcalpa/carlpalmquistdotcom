// queue-new: skapa ett gen-jobb i den delade kön (Code→Cowork).
// Användning: node queue-new.mjs <id> <category> "<Svensk label>" "<eng plaggbeskrivning>" [#defaultColor] [z]
import fs from 'node:fs';
const Q='/Users/calpa/PA/atelje-gen-queue';
const REPO='/Users/calpa/Developer/carlpalmquistdotcom';
const Z={outer:30,sweatshirt:26,shirt:24,tshirt:22,tank:20,dress:15,bottom:10,shoes:5};
const [,,id,cat,label,eng,color,zArg]=process.argv;
if(!id||!cat||!label||!eng){console.error('användning: queue-new.mjs <id> <category> "<Svensk label>" "<eng plaggbeskrivning>" [#defaultColor] [z]');process.exit(1);}
if(!(cat in Z)){console.error('okänd kategori:',cat,'— giltiga:',Object.keys(Z).join(', '));process.exit(1);}
// säkerställ referenskropp i kön
const ref=Q+'/reference/baseChroma.png';
if(!fs.existsSync(ref))fs.copyFileSync(REPO+'/atelje-v2/bodies/baseChroma.png',ref);
const prompt=`Edit the cartoon paper-doll figure: add ${eng}, front view only. `+
  `KEEP the figure's bright green skin/body exactly as is (even under white or light fabric). `+
  `Front-facing surfaces only — no back panel, no rear collar/waistband. `+
  `Same pose, same scale, same plain background.`;
const job={
  id, category:cat, z:zArg?+zArg:Z[cat], label,
  defaultColor:color||'#ffffff',
  model:'gemini / nano-banana (Cowork)',
  reference:'reference/baseChroma.png',
  prompt,
  status:'pending',       // pending → generated → processed → approved
  notes:''
};
const out=`${Q}/requests/${id}.json`;
fs.writeFileSync(out,JSON.stringify(job,null,2)+'\n');
console.log('✓ jobb skapat:',out);
console.log('  z='+job.z+'  färg='+job.defaultColor);
console.log('  Cowork: läs prompt, generera på reference/baseChroma.png → incoming/'+id+'.png');
