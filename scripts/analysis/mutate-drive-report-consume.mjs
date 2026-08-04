#!/usr/bin/env node
/**
 * Mutation harness for the drive-report consumer.
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-C.
 *
 * COMMITTED, NOT SCRATCH, so a reviewer can re-run the evidence instead of taking "8/8 killed" on
 * trust. No mutation harness exists in this repo, which means every prior "KILLED" claim was a
 * manual assertion.
 *
 * THREE GUARDS, EACH FOR A FALSE VERDICT THAT HAS ACTUALLY HAPPENED:
 *  1. ABORT IF THE BYTES DID NOT CHANGE. A pattern that fails to match produces a run of the
 *     UNMUTATED file, reports "tests passed", and is indistinguishable from a survivor. This has
 *     bitten before via CRLF/LF mismatch on a multi-line pattern — hence single-line patterns only.
 *  2. node --check EVERY MUTANT. A syntactically broken file fails the suite for the wrong reason,
 *     and a kill for the wrong reason is not a kill.
 *  3. VERIFY THE RESTORE. A harness that leaves a mutant on disk poisons everything after it.
 *
 * Usage: node scripts/analysis/mutate-drive-report-consume.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const CORE = path.join(ROOT, 'scripts/coordinator-drive-report-consume.mjs');
const TICK = path.join(ROOT, 'scripts/coordinator-quiet-tick.mjs');
const TESTS = 'tests/unit/drive-loop tests/unit/coordinator/quiet-tick-loop-parity.test.js';

/** [file, name, from, to] — SINGLE-LINE patterns only. */
const MUTANTS = [
  [CORE, 'M1  actor -> module-name constant',
   'const merged = { ...receipts, [lane]: { actor: sessionId, at:',
   'const merged = { ...receipts, [lane]: { actor: \'drive-report-consumer\', at:'],

  [CORE, 'M1b actor -> hard-coded uuid LITERAL (a uuid-shape regex does NOT kill this)',
   'const merged = { ...receipts, [lane]: { actor: sessionId, at:',
   'const merged = { ...receipts, [lane]: { actor: \'6f1c0f6e-0000-4000-8000-000000000000\', at:'],

  [CORE, 'M1c precedence inverted — the BELIEVED seat beats the EXECUTING seat',
   '  if (typeof fromEnv === \'string\' && fromEnv.trim()) return fromEnv.trim();',
   '  if (false && typeof fromEnv === \'string\' && fromEnv.trim()) return fromEnv.trim();'],

  [CORE, 'M2  success path returns TRUTHY (insurance only — inert in this host)',
   '    logger.log(`[drive-report-consume] stamped lane \'${lane}\' on report ${row.id} as ${sessionId}`);',
   '    logger.log(`[drive-report-consume] stamped`); return { acted: true };'],

  [CORE, 'M3  lane key INLINED instead of imported from the shared contract',
   '  const lane = DRIVE_REPORT_LANES.COORDINATOR;',
   '  const lane = \'coordinator\';'],

  [CORE, 'M4  conditional .is() predicate removed (concurrent write gets clobbered)',
   '        .is(`consumption_receipts->${lane}`, null)',
   '        .eq(\'id\', row.id)'],

  [CORE, 'M5  fail-soft catch turned into a rethrow',
   '    logger.error(`[drive-report-consume] unexpected failure (${e && e.message}) — no-op`);',
   '    throw e;'],

  [CORE, 'M6  idempotency short-circuit removed (re-stamps an existing receipt)',
   '    if (receipts[lane]) {',
   '    if (false && receipts[lane]) {'],

  [TICK, 'M7  quiescentSkip flipped to true (silent exactly when it matters most)',
   '{ key: \'drive-report-consume\', script: \'coordinator-drive-report-consume.mjs\', args: [\'scripts/coordinator-drive-report-consume.mjs\'], quiescentSkip: false }',
   '{ key: \'drive-report-consume\', script: \'coordinator-drive-report-consume.mjs\', args: [\'scripts/coordinator-drive-report-consume.mjs\'], quiescentSkip: true }'],
];

const originals = new Map();
for (const [file] of MUTANTS) if (!originals.has(file)) originals.set(file, fs.readFileSync(file, 'utf8'));

const restoreAll = () => { for (const [f, o] of originals) fs.writeFileSync(f, o); };
const results = [];

for (const [file, name, from, to] of MUTANTS) {
  const original = originals.get(file);
  const mutated = original.replace(from, to);
  if (mutated === original) {
    console.error(`ABORT — "${name}" DID NOT APPLY (pattern not found in ${path.basename(file)}).`);
    console.error('        A no-op mutation reports "tests passed" and is indistinguishable from a survivor.');
    restoreAll();
    process.exit(2);
  }
  fs.writeFileSync(file, mutated);
  try {
    execSync(`node --check "${file}"`, { stdio: 'pipe' });
  } catch {
    console.error(`ABORT — "${name}" produced a SYNTACTICALLY INVALID file; a parse error reads like a kill.`);
    restoreAll();
    process.exit(3);
  }

  let killed, detail;
  try {
    execSync(`npx vitest run ${TESTS}`, { cwd: ROOT, stdio: 'pipe', timeout: 300000 });
    killed = false; detail = 'SURVIVED — suite still green';
  } catch (e) {
    const out = (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '');
    const m = out.match(/Tests\s+(\d+) failed/);
    killed = true; detail = m ? `killed by ${m[1]} failing assertion(s)` : 'killed';
  } finally {
    fs.writeFileSync(file, original);
  }
  results.push([name, killed]);
  console.log(`${killed ? 'KILLED  ' : 'SURVIVED'}  ${name} — ${detail}`);
}

for (const [f, o] of originals) {
  if (fs.readFileSync(f, 'utf8') !== o) { console.error(`*** ${f} NOT RESTORED ***`); process.exit(4); }
}
const survivors = results.filter((r) => !r[1]);
console.log(`\n${results.length - survivors.length}/${results.length} killed; all files restored intact.`);
survivors.forEach((s) => console.log('  SURVIVOR: ' + s[0]));
process.exit(survivors.length ? 1 : 0);
