import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const P = 'lib/governance/fixture-producer-guard.mjs';
const orig = readFileSync(P, 'utf8');
const MUT = [
  ['M1  guard stops owning the write (identity seam reopens)',
   'return supabase.from(table).insert(row);', 'return supabase.from(table).insert({ ...row });'],
  ['M2  negative assert removed (DELIBERATELY_REAL always ok)',
   '    return tripsCanonical\n      ? {\n        ok: false,', '    return false\n      ? {\n        ok: false,'],
  ['M3  sanctioned closed-set check removed (force flag)',
   '  if (!named) {', '  if (false) {'],
  ['M4  sanctioned trips-canonical half removed',
   '  if (!tripsCanonical) {\n    return {\n      ok: false,\n      tripsCanonical,\n      reason: \'declared SANCTIONED_PERMANENT and is in the sanctioned set,', '  if (false) {\n    return {\n      ok: false,\n      tripsCanonical,\n      reason: \'declared SANCTIONED_PERMANENT and is in the sanctioned set,'],
  ['M5  opt-out emits only on FAILURE (spreading opt-out invisible)',
   '    console.error(notice);',
   '    if (!verdict.ok) console.error(notice);'],
  ['M5b unconditional stderr removed (a silencing logger hides the opt-out)',
   '    console.error(notice);', '    void notice;'],
  ['M6  opt-out emits for FIXTURE too (destroys the signal)',
   "  if (classification !== CLASSIFICATION.FIXTURE) {", '  if (true) {'],
  ['M7  blank reason accepted',
   '    if (!reason || !String(reason).trim()) {', '    if (false) {'],
  ['M7b whitespace-only reason accepted (allowlist uses trim, guard must too)',
   '    if (!reason || !String(reason).trim()) {', '    if (!reason) {'],
  ['M8  FIXTURE branch no longer requires tripping canonical',
   '    return tripsCanonical\n      ? { ok: true, reason: null, tripsCanonical }', '    return true\n      ? { ok: true, reason: null, tripsCanonical }'],
  ['M9  bind to the WATCHER instead of canonical',
   "import { isFixtureVenture } from './fixture-exclusion.mjs';", "import { isFixtureVenture } from '../eva/chairman-decision-watcher.js';"],
  ['M10 unsupported table silently allowed',
   '  if (!SUPPORTED_TABLES.has(table)) {', '  if (false) {'],
  ['M11 source no longer required',
   '  if (!source) {', '  if (false) {'],
];
let survivors = [];
try {
for (const [name, from, to] of MUT) {
  if (!orig.includes(from)) { console.log(`INVALID   ${name}`); survivors.push(name); continue; }
  writeFileSync(P, orig.replace(from, to));
  let killed = false, out = '';
  try { out = execSync('npx vitest run tests/unit/governance/fixture-producer-guard.test.js --reporter=dot 2>&1', { encoding: 'utf8' }); }
  catch (e) { killed = true; out = String(e.stdout || ''); }
  const m = out.match(/Tests\s+(\d+) failed \| (\d+) passed/);
  console.log(`${killed ? 'KILLED  ' : 'SURVIVED'}  ${name}${m ? `  (${m[1]} failed)` : ''}`);
  if (!killed) survivors.push(name);
}
} finally {
  // RESTORE ON ANY EXIT. Without this a crash or Ctrl-C leaves the guard MUTATED in the tree —
  // e.g. with its sanctioned-set check deleted — and the next run would test a weakened module.
  writeFileSync(P, orig);
}
console.log(survivors.length ? `\n${survivors.length} SURVIVED` : `\nALL ${MUT.length} MUTATIONS KILLED`);
