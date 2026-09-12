import fs from 'fs';
const p = JSON.parse(fs.readFileSync('.artifacts/tst-prd-full.json','utf8'));
const sizes = {};
for (const [k,v] of Object.entries(p)) sizes[k] = v==null?0:JSON.stringify(v).length;
console.log(Object.entries(sizes).filter(([,v])=>v>50).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}=${v}`).join('\n'));
