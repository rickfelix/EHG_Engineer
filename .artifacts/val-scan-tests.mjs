import fs from 'fs';
import { execSync } from 'child_process';
// Files under tests/ that actually INSERT into ventures
const files = execSync(`git grep -l -E "from\(['\\"]ventures['\\"]\)|INSERT INTO (public\.)?ventures" -- tests/`, {encoding:'utf8', maxBuffer:1e8})
  .trim().split('\n').filter(f => /\.(ts|js|cjs|mjs|tsx)$/.test(f));
const inserters = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const hasJsInsert = /from\(\s*['"]ventures['"]\s*\)[\s\S]{0,200}?\.insert\(/.test(src);
  const hasSqlInsert = /INSERT\s+INTO\s+(public\.)?ventures\b/i.test(src);
  if (!hasJsInsert && !hasSqlInsert) continue;
  // does an is_demo appear anywhere as part of an insert payload / column list?
  const setsDemo = /is_demo\s*:/.test(src) || /INSERT\s+INTO\s+(public\.)?ventures\s*\([^)]*is_demo/i.test(src);
  inserters.push({ f, setsDemo, kind: f.includes('/e2e/')?'e2e': f.includes('/integration/')?'integration': f.includes('/ddl/')?'ddl': f.includes('/unit/')?'unit':'other' });
}
const yes = inserters.filter(i=>i.setsDemo);
console.log(`TOTAL test files that INSERT into ventures: ${inserters.length}`);
console.log(`  SET is_demo anywhere in file: ${yes.length}`);
console.log(`  DO NOT set is_demo:           ${inserters.length - yes.length}`);
console.log('\n--- files that DO set is_demo ---');
for (const i of yes) console.log(`  [${i.kind}] ${i.f}`);
console.log('\n--- by kind (omitters) ---');
const byKind = {};
for (const i of inserters.filter(x=>!x.setsDemo)) byKind[i.kind]=(byKind[i.kind]||0)+1;
console.log(JSON.stringify(byKind));
console.log('\n--- omitter sample (first 25) ---');
for (const i of inserters.filter(x=>!x.setsDemo).slice(0,25)) console.log(`  [${i.kind}] ${i.f}`);
