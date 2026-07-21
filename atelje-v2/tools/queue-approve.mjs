// queue-approve: flytta ett granskat lager till garderoben + skriv manifest-rad. Kör EFTER mänsklig CLEAN-dom.
// Användning: node queue-approve.mjs <id>
import fs from 'node:fs';
const Q='/Users/calpa/PA/atelje-gen-queue';
const REPO='/Users/calpa/Developer/carlpalmquistdotcom';
const id=process.argv[2];
if(!id){console.error('användning: queue-approve.mjs <id>');process.exit(1);}
const reqPath=`${Q}/requests/${id}.json`;
const job=JSON.parse(fs.readFileSync(reqPath,'utf8'));
const staged=`${Q}/staging/${id}.png`;
if(!fs.existsSync(staged)){console.error('saknar staging/'+id+'.png — kör queue-process först');process.exit(1);}

// 1) kopiera lager till garderoben
const dest=`${REPO}/public/garderob-v2/${id}.png`;
fs.copyFileSync(staged,dest);

// 2) manifest: lägg till eller uppdatera raden (id är nyckel)
const mfPath=`${REPO}/public/garderob-v2/manifest.json`;
const mf=JSON.parse(fs.readFileSync(mfPath,'utf8'));
const entry={id:job.id,category:job.category,z:job.z,label:job.label,file:`/garderob-v2/${id}.png`,defaultColor:job.defaultColor};
const ix=mf.garments.findIndex(g=>g.id===id);
if(ix>=0)mf.garments[ix]=entry; else mf.garments.push(entry);
fs.writeFileSync(mfPath,JSON.stringify(mf,null,1)+'\n');

job.status='approved';fs.writeFileSync(reqPath,JSON.stringify(job,null,2)+'\n');
console.log('✓ godkänt:',id);
console.log('  → '+dest);
console.log('  → manifest '+(ix>=0?'uppdaterad':'utökad')+' (z='+job.z+', '+job.category+', '+job.defaultColor+')');
console.log('  Ladda om /atelje2 för att se plagget. Verifiera i appen.');
