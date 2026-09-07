import { findUnguardedWrites } from '../scripts/lint/fixture-producer-guard-lint.mjs';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
const walk = (d, o = []) => { let n=[]; try{n=readdirSync(d)}catch{return o}
  for (const x of n){ if(x==='node_modules'||x.startsWith('.'))continue; const f=join(d,x);
  let s; try{s=statSync(f)}catch{continue}; if(s.isDirectory())walk(f,o);
  else if(/\.(mjs|js|cjs|ts|tsx|mts)$/.test(x))o.push(f)} return o };
for (const root of ['tests/e2e','tests/ddl','tests/unit']) {
  const rows = [];
  for (const f of walk(root)) { const w = findUnguardedWrites(readFileSync(f,'utf8')); if (w.length) rows.push([f.split(sep).join('/'), w.length]); }
  console.log('\n### ' + root + ': ' + rows.reduce((a,b)=>a+b[1],0) + ' findings in ' + rows.length + ' files');
  for (const [f,n] of rows.sort((a,b)=>b[1]-a[1])) console.log('   ' + String(n).padStart(3) + '  ' + f);
}
