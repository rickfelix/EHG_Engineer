import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const P = 'scripts/harness/spine-verify-first-run.mjs';
const orig = readFileSync(P, 'utf8');
const GUARDED = `await insertGuarded(supabase, 'ventures', ventureRow, {
      classification: CLASSIFICATION.FIXTURE,
      source: 'scripts/harness/spine-verify-first-run.mjs',
    }).select('id, name').single()`;
const MUT = [
  ['S1  revert to the bare unguarded insert (the pre-SD state)',
   GUARDED, "await supabase.from('ventures').insert(ventureRow).select('id, name').single()"],
  ['S2  remove the injection seam (row always built internally)',
   '    const ventureRow = buildVentureRow\n      ? buildVentureRow(runId)\n      : ', '    const ventureRow = false\n      ? buildVentureRow(runId)\n      : '],
];
let survivors = [];
for (const [name, from, to] of MUT) {
  if (!orig.includes(from)) { console.log(`INVALID   ${name}`); survivors.push(name); continue; }
  writeFileSync(P, orig.replace(from, to));
  let killed = false, out = '';
  try { out = execSync('npx vitest run tests/unit/harness/spine-verify-first-run-guard.test.js --reporter=dot 2>&1', { encoding: 'utf8' }); }
  catch (e) { killed = true; out = String(e.stdout || ''); }
  const m = out.match(/Tests\s+(\d+) failed \| (\d+) passed/) || out.match(/Tests\s+(\d+) failed/);
  console.log(`${killed ? 'KILLED  ' : 'SURVIVED'}  ${name}${m ? `  (${m[1]} failed)` : ''}`);
  if (!killed) survivors.push(name);
}
writeFileSync(P, orig);
console.log(survivors.length ? `\n${survivors.length} SURVIVED` : `\nALL ${MUT.length} KILLED`);
