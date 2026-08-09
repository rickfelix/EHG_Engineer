import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const P = 'scripts/anon-write-contract-probe.mjs';
const orig = readFileSync(P, 'utf8');
const MUT = [
  ['X1 drop errored flag in probeTable catch (main-level inconclusive)',
   'bound = { applicable: false, errored: true, note:', 'bound = { applicable: false, note:'],
  ['X2 vacuity threshold widened to swallow every hazard',
   'else if (definer.n <= 1) verdict', 'else if (definer.n <= 1000) verdict'],
  ['X3 VACUOUS checked BEFORE UNREADABLE (order inversion)',
   "if (unreadable || !Number.isInteger(anonViaDefiner)) verdict = 'UNREADABLE';\n  else if (definer.n <= 1) verdict = 'VACUOUS';",
   "if (definer.n <= 1) verdict = 'VACUOUS';\n  else if (unreadable || !Number.isInteger(anonViaDefiner)) verdict = 'UNREADABLE';"],
  ['X4 equality loosened to >= (over-count blind)',
   'anonViaDefiner === definer.n', 'anonViaDefiner >= definer.n'],
  ['X5 rlsInForce loosened to <= (equal counts pass)',
   'asAnon.n < definer.n', 'asAnon.n <= definer.n'],
  ['X6 DIVERGED folds to OK (verdict computed, never fails)',
   "if (bound.verdict === 'DIVERGED') return EXIT.CONTRACT_CHANGED;", "if (false) return EXIT.CONTRACT_CHANGED;"],
  ['X7 nested savepoint rollback removed (recovery gone)',
   "await q('rollback to savepoint sp_definer');", "/* removed */;"],
  ['X8 definer measured OUTSIDE the anon window (reset role moved up)',
   "  await q('savepoint sp_definer');", "  await q('reset role'); await q('savepoint sp_definer');"],
];
let surv = [];
for (const [name, from, to] of MUT) {
  if (!orig.includes(from)) { console.log(`INVALID ${name} — anchor not found`); surv.push(name+' (INVALID)'); continue; }
  writeFileSync(P, orig.replace(from, to));
  let killed = false, out = '';
  try { out = execSync('npx vitest run tests/unit/anon-write-contract-probe-fr3.test.js tests/unit/anon-write-contract-probe.test.js --reporter=dot 2>&1', { encoding: 'utf8' }); }
  catch (e) { killed = true; out = String(e.stdout || ''); }
  const m = out.match(/Tests\s+(\d+) failed \| (\d+) passed/);
  console.log(`${killed ? 'KILLED  ' : 'SURVIVED'}  ${name}${m ? `  (${m[1]} failed)` : ''}`);
  if (!killed) surv.push(name);
}
writeFileSync(P, orig);
console.log(surv.length ? `\nSURVIVORS (${surv.length}): ` + surv.join(' | ') : '\nALL INDEPENDENT MUTATIONS KILLED');
