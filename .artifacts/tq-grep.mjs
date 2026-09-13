import fs from 'fs';
const d=JSON.parse(fs.readFileSync('C:/Users/rickf/AppData/Local/Temp/claude/C--Users-rickf-Projects--EHG-EHG-Engineer/689a1237-33b7-406f-9772-668958b289d6/scratchpad/prd-fresh.json','utf8'))[0];
const pats = process.argv.slice(2).map(s=>new RegExp(s,'i'));
function walk(node, path){
  if (node===null||node===undefined) return;
  if (typeof node==='string'){
    for (const p of pats) if (p.test(node)) {
      // print surrounding window
      const m = node.match(p);
      const i = node.indexOf(m[0]);
      console.log(`\n### ${path}  [/${p.source}/]`);
      console.log('   ...'+node.slice(Math.max(0,i-260), i+320).replace(/\s+/g,' ')+'...');
      break;
    }
    return;
  }
  if (Array.isArray(node)) { node.forEach((v,i)=>walk(v, `${path}[${i}]`)); return; }
  if (typeof node==='object') { for (const [k,v] of Object.entries(node)) walk(v, `${path}.${k}`); }
}
for (const k of ['metadata','content']) walk(d[k], k);
