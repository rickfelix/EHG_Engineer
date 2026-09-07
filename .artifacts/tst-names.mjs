import { isFixtureVenture } from '../lib/governance/fixture-exclusion.mjs';
import { findUnguardedWrites } from '../scripts/lint/fixture-producer-guard-lint.mjs';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walkAll = (dir, out = []) => {
  let n = []; try { n = readdirSync(dir); } catch { return out; }
  for (const x of n) { if (x === 'node_modules' || x.startsWith('.')) continue;
    const f = join(dir, x); let s; try { s = statSync(f); } catch { continue; }
    if (s.isDirectory()) walkAll(f, out); else if (/\.(mjs|js|cjs|ts|tsx|mts)$/.test(x)) out.push(f); }
  return out;
};

// 1. Extension-filter impact: what the lint sees today (js/mjs/cjs) vs all source exts
let cur = 0, all = 0, curFiles = 0, allFiles = 0;
for (const root of ['tests/e2e', 'tests/ddl', 'tests/unit']) {
  for (const f of walkAll(root)) {
    const src = readFileSync(f, 'utf8');
    const w = findUnguardedWrites(src);
    if (!w.length) continue;
    const isLintVisibleExt = /\.(mjs|js|cjs)$/.test(f);
    all += w.length; allFiles++;
    if (isLintVisibleExt) { cur += w.length; curFiles++; }
  }
}
console.log('=== FR-1 extension-filter impact (tests/e2e + tests/ddl + tests/unit) ===');
console.log(`  lint's CURRENT walk() ext filter /\.(mjs|js|cjs)$/  -> ${cur} findings in ${curFiles} files`);
console.log(`  widened to include .ts/.tsx/.mts                    -> ${all} findings in ${allFiles} files`);
console.log(`  INVISIBLE without widening the ext filter           -> ${all - cur} findings in ${allFiles - curFiles} files`);

// 2. Do the actual inserted names trip canonical?
console.log('\n=== FR-3 feasibility: do e2e venture names trip the canonical discriminant? ===');
const nameRe = /name:\s*(`[^`]*`|'[^']*'|"[^"]*")/g;
let trips = 0, notrips = 0; const samples = [];
for (const f of walkAll('tests/e2e')) {
  const src = readFileSync(f, 'utf8');
  if (!findUnguardedWrites(src).length) continue;
  let m;
  while ((m = nameRe.exec(src)) !== null) {
    let lit = m[1].slice(1, -1);
    if (!/venture|company|ceo|agent/i.test(lit) && !lit.includes('${')) continue;
    const concrete = lit.replace(/\$\{Date\.now\(\)\}/g, '1788000000000').replace(/\$\{[^}]*\}/g, 'abc123');
    const t = isFixtureVenture({ name: concrete });
    if (t) trips++; else { notrips++; if (samples.length < 10) samples.push(concrete); }
  }
}
console.log(`  name literals that TRIP canonical (FIXTURE assert would pass): ${trips}`);
console.log(`  name literals that do NOT trip  (insertGuarded would THROW):   ${notrips}`);
console.log('  sample non-tripping names EXEC would have to rename or flag:');
for (const s of samples) console.log(`    ${JSON.stringify(s)}`);
