import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const P = 'scripts/anon-write-contract-probe.mjs';
const orig = readFileSync(P, 'utf8');
const MUT = [
  ['M1  remove the fold (restore print-only)',
   'const boundCode = boundExitCode(bound);', 'const boundCode = EXIT.OK;'],
  ['M2  drop rlsInForce conjunct (equality alone / inert RLS)',
   'else if (definerIgnoresCallerVisibility && rlsInForce)', 'else if (definerIgnoresCallerVisibility)'],
  ['M3  drop the basis check (re-inline blind)',
   "else if (!definerFnBasis) verdict = 'DIVERGED';", 'else if (false) verdict = null;'],
  ['M4  drop equality conjunct (owner-change blind)',
   'else if (definerIgnoresCallerVisibility && rlsInForce)', 'else if (rlsInForce)'],
  ['M5  UNREADABLE reported as a pass',
   "if (unreadable || !Number.isInteger(anonViaDefiner)) verdict = 'UNREADABLE';", "if (false) verdict = 'UNREADABLE';"],
  ['M6  errored measurement folds to OK (consumer end)',
   'if (bound?.errored) return EXIT.PROBE_INCONCLUSIVE;', 'if (bound?.errored) return EXIT.OK;'],
  ['M7  bare proname instead of ::regprocedure',
   'where p.oid = to_regprocedure($1)', "where p.proname = 'fn_anon_ingress_prior_hour_count'"],
  // Found by the SECURITY / TESTING reviews after the first harness passed clean.
  ['M8  vacuity gate hoisted back ABOVE the basis check (quiet-hour blindness)',
   "else if (!definerFnBasis) verdict = 'DIVERGED';        // row-independent: no row count makes a re-inline benign\n  else if (definer.n <= 1) verdict = 'VACUOUS';",
   "else if (definer.n <= 1) verdict = 'VACUOUS';\n  else if (!definerFnBasis) verdict = 'DIVERGED';"],
  ['M9  definer count read as OWNER instead of anon (reset role hoisted)',
   "  await q('savepoint sp_definer');", "  await q('reset role');\n  await q('savepoint sp_definer');"],
  ['M10 errored flag dropped at its PRODUCTION site',
   'bound = { applicable: false, errored: true,', 'bound = { applicable: false,'],
  ['M11 VACUOUS and UNREADABLE ordering swapped',
   "if (unreadable || !Number.isInteger(anonViaDefiner)) verdict = 'UNREADABLE';\n  else if (!definerFnBasis) verdict = 'DIVERGED';        // row-independent: no row count makes a re-inline benign\n  else if (definer.n <= 1) verdict = 'VACUOUS';",
   "if (definer.n <= 1) verdict = 'VACUOUS';\n  else if (unreadable || !Number.isInteger(anonViaDefiner)) verdict = 'UNREADABLE';\n  else if (!definerFnBasis) verdict = 'DIVERGED';"],
];
let survivors = [];
for (const [name, from, to] of MUT) {
  if (!orig.includes(from)) { console.log(`INVALID   ${name} — anchor not found`); survivors.push(name); continue; }
  writeFileSync(P, orig.replace(from, to));
  let killed = false, out = '';
  try { out = execSync('npx vitest run tests/unit/anon-write-contract-probe-fr3.test.js --reporter=dot 2>&1', { encoding: 'utf8' }); }
  catch (e) { killed = true; out = String(e.stdout || ''); }
  const m = out.match(/Tests\s+(\d+) failed \| (\d+) passed/);
  console.log(`${killed ? 'KILLED  ' : 'SURVIVED'}  ${name}${m ? `  (${m[1]} failed)` : ''}`);
  if (!killed) survivors.push(name);
}
writeFileSync(P, orig);
console.log(survivors.length ? `\n${survivors.length} SURVIVED` : '\nALL 11 MUTATIONS KILLED');
