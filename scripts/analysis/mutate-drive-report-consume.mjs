#!/usr/bin/env node
/**
 * Mutation harness for the drive-report consumer.
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-C.
 *
 * COMMITTED, NOT SCRATCH, so a reviewer can re-run the evidence instead of taking a kill count on
 * trust. No mutation harness existed in this repo, which means every prior KILLED claim was a
 * manual assertion.
 *
 * ─── THIS HARNESS WAS DANGEROUS AND A SECURITY REVIEW SAID SO ──────────────────────────────────
 * Two defects, both fixed here, both worth naming because the harness rewrites SOURCE FILES THE
 * COORDINATOR EXECUTES EVERY 15 MINUTES:
 *   1. NO SIGNAL HANDLER. Ctrl-C during any vitest run skipped the `finally` and LEFT A MUTANT ON
 *      DISK — including one that flips quiescentSkip to true and one that converts the fail-soft
 *      catch into a rethrow. Now restored on SIGINT/SIGTERM/uncaught, and the handlers are removed
 *      afterwards so repeated runs cannot stack listeners.
 *   2. ROOT WAS process.cwd(). The invitation to "re-run the evidence" from the MAIN checkout would
 *      have mutated the live scripts rather than a worktree copy. ROOT is now anchored to this
 *      file's own location, so the harness can only ever edit the tree it ships in.
 *
 * THREE FALSE-VERDICT GUARDS, each for something that has actually happened:
 *   - ABORT IF THE BYTES DID NOT CHANGE. A pattern that fails to match runs the UNMUTATED file,
 *     reports "tests passed", and is indistinguishable from a survivor. Hence single-line patterns.
 *   - node --check EVERY MUTANT. A syntax error fails the suite for the wrong reason, and a kill
 *     for the wrong reason is not a kill.
 *   - VERIFY THE RESTORE at the end, so a half-restored tree cannot poison later work.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

// Anchored to THIS FILE, never to cwd — see defect 2 above.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CORE = path.join(ROOT, 'scripts/coordinator-drive-report-consume.mjs');
const TICK = path.join(ROOT, 'scripts/coordinator-quiet-tick.mjs');
const TESTS = 'tests/unit/drive-loop tests/unit/coordinator/quiet-tick-loop-parity.test.js';

/** [file, name, from, to] — SINGLE-LINE patterns only (this repo mixes CRLF and LF). */
const MUTANTS = [
  [CORE, 'M1  actor -> module-name constant',
   '          metadata: { actor_session: sessionId },',
   '          metadata: { actor_session: \'drive-report-consumer\' },'],

  [CORE, 'M1b actor -> hard-coded uuid LITERAL (a uuid-shape regex does NOT kill this)',
   '          metadata: { actor_session: sessionId },',
   '          metadata: { actor_session: \'6f1c0f6e-0000-4000-8000-000000000000\' },'],

  [CORE, 'M1c identity precedence inverted — BELIEVED seat beats EXECUTING seat',
   '  if (typeof fromEnv === \'string\' && fromEnv.trim()) return fromEnv.trim();',
   '  if (false && typeof fromEnv === \'string\' && fromEnv.trim()) return fromEnv.trim();'],

  [CORE, 'M2  lane reverts to the HYPHEN vocabulary the producer CHECK rejects',
   'export const COORDINATOR_LANE = \'coordinator\';',
   'export const COORDINATOR_LANE = \'coordinator-lane\';'],

  [CORE, 'M3  coordinator-seat check made vacuously true (any seat may write)',
   '  return Boolean(sessionId) && Boolean(coordinatorId) && sessionId === coordinatorId;',
   '  return true;'],

  [CORE, 'M4  ignoreDuplicates:false — a re-run REWRITES the original consumed_at',
   '        }, { onConflict: \'report_id,lane\', ignoreDuplicates: true }),',
   '        }, { onConflict: \'report_id,lane\', ignoreDuplicates: false }),'],

  [CORE, 'M5  READ FAILURE reported as success — the exact defect that sank version 1',
   '      return { status: \'failed\', reason: `read: ${readErr.message}` };',
   '      return { status: \'ok\' };'],

  [CORE, 'M6  WRITE FAILURE reported as success',
   '      return { status: \'failed\', reason: `write: ${writeErr.message}`, reportId: row.id };',
   '      return { status: \'ok\', reportId: row.id };'],

  [CORE, 'M7  breadcrumb never cleared — a stale failure marker accumulates forever',
   '    if (fsImpl.existsSync(file)) { fsImpl.rmSync(file); return \'cleared\'; }',
   '    if (false && fsImpl.existsSync(file)) { fsImpl.rmSync(file); return \'cleared\'; }'],

  [TICK, 'M8  quiescentSkip flipped to true (silent exactly when it matters most)',
   '{ key: \'drive-report-consume\', script: \'coordinator-drive-report-consume.mjs\', args: [\'scripts/coordinator-drive-report-consume.mjs\'], quiescentSkip: false }',
   '{ key: \'drive-report-consume\', script: \'coordinator-drive-report-consume.mjs\', args: [\'scripts/coordinator-drive-report-consume.mjs\'], quiescentSkip: true }'],
];

const originals = new Map();
for (const [file] of MUTANTS) if (!originals.has(file)) originals.set(file, fs.readFileSync(file, 'utf8'));
const restoreAll = () => { for (const [f, o] of originals) fs.writeFileSync(f, o); };

// DEFECT 1 FIX: a mutant must never survive an interrupt.
const onSignal = (sig) => { console.error(`\n[mutate] ${sig} — restoring sources before exit`); restoreAll(); process.exit(130); };
const sigint = () => onSignal('SIGINT');
const sigterm = () => onSignal('SIGTERM');
const onUncaught = (e) => { console.error(`[mutate] uncaught (${e && e.message}) — restoring`); restoreAll(); process.exit(1); };
process.on('SIGINT', sigint);
process.on('SIGTERM', sigterm);
process.on('uncaughtException', onUncaught);

const results = [];
try {
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
} finally {
  restoreAll();
  process.off('SIGINT', sigint);
  process.off('SIGTERM', sigterm);
  process.off('uncaughtException', onUncaught);
}

for (const [f, o] of originals) {
  if (fs.readFileSync(f, 'utf8') !== o) { console.error(`*** ${f} NOT RESTORED ***`); process.exit(4); }
}
const survivors = results.filter((r) => !r[1]);
console.log(`\n${results.length - survivors.length}/${results.length} killed; all files restored intact (verified).`);
survivors.forEach((s) => console.log('  SURVIVOR: ' + s[0]));
process.exitCode = survivors.length ? 1 : 0;
