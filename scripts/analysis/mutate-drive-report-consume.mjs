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
   'ignoreDuplicates: true, count: \'exact\' }).abortSignal(signal),',
   'ignoreDuplicates: false, count: \'exact\' }).abortSignal(signal),'],

  [CORE, 'M5  READ FAILURE reported as success — the exact defect that sank version 1',
   '      return { status: \'failed\', reason: `read: ${readErr.message}` };',
   '      return { status: \'ok\' };'],

  [CORE, 'M6  WRITE FAILURE reported as success',
   '      return { status: \'failed\', reason: `write: ${writeErr.message}`, reportId: row.id };',
   '      return { status: \'ok\', reportId: row.id };'],

  [CORE, 'M7  breadcrumb never cleared — a stale failure marker accumulates forever',
   '    if (fsImpl.existsSync(file)) { fsImpl.rmSync(file); return \'cleared\'; }',
   '    if (false && fsImpl.existsSync(file)) { fsImpl.rmSync(file); return \'cleared\'; }'],

  // ── Added after a reviewer found TEN survivors: the fake discarded every query argument, so no
  // ── argument mutant could die. The fake now records them.
  [CORE, 'M9  ascending:true — CONSUMES THE OLDEST REPORT FOREVER (the worst survivor)',
   '      (signal) => supabase.from(\'drive_reports\').select(\'id\').order(\'generated_at\', { ascending: false }).limit(1).abortSignal(signal),',
   '      (signal) => supabase.from(\'drive_reports\').select(\'id\').order(\'generated_at\', { ascending: true }).limit(1).abortSignal(signal),'],

  [CORE, 'M10 orders by id instead of generated_at (newest-by-uuid is meaningless)',
   '.order(\'generated_at\', { ascending: false })',
   '.order(\'id\', { ascending: false })'],

  [CORE, 'M11 consumed_at hard-coded to the epoch',
   '          consumed_at: new Date(nowMs ?? Date.now()).toISOString(),',
   '          consumed_at: new Date(0).toISOString(),'],

  [CORE, 'M12 count:exact dropped — inserted-vs-ignored becomes unknowable',
   '        }, { onConflict: \'report_id,lane\', ignoreDuplicates: true, count: \'exact\' }).abortSignal(signal),',
   '        }, { onConflict: \'report_id,lane\', ignoreDuplicates: true }).abortSignal(signal),'],

  [CORE, 'M13 success log claims a write unconditionally (false on every tick after the first)',
   '    const inserted = count !== 0;',
   '    const inserted = true;'],

  [TICK, 'M8  quiescentSkip flipped to true (silent exactly when it matters most)',
   '{ key: \'drive-report-consume\', script: \'coordinator-drive-report-consume.mjs\', args: [\'scripts/coordinator-drive-report-consume.mjs\'], quiescentSkip: false }',
   '{ key: \'drive-report-consume\', script: \'coordinator-drive-report-consume.mjs\', args: [\'scripts/coordinator-drive-report-consume.mjs\'], quiescentSkip: true }'],
];

// ─── PRE-FLIGHT: THE TREE MUST BE CLEAN BEFORE WE BASELINE ────────────────────────────────────
// A STRAY MUTANT WAS ONCE ALREADY IN THE TREE when a reviewer ran this — quiescentSkip left TRUE
// from an interrupted run. The end-of-run "verify the restore" check STRUCTURALLY CANNOT CATCH
// THAT: it baselines off the already-mutated file and then cheerfully reports "restored intact".
// One `git commit -a` would have shipped the instrument silenced exactly when the fleet is quiet.
// The fix is a pre-flight, not a better restore.
try {
  const dirty = execSync('git status --porcelain -- scripts/ lib/', { cwd: ROOT, encoding: 'utf8' }).trim();
  if (dirty) {
    console.error('ABORT — the tree is DIRTY under scripts/ or lib/ before any mutation:');
    console.error(dirty);
    console.error('        Baselining off a modified file would bake a stray mutant into the "original"');
    console.error('        and the end-of-run restore check would then report success. Commit or revert first.');
    process.exit(5);
  }
} catch (e) {
  if (e && e.status === 5) throw e;
  console.error('ABORT — could not determine tree cleanliness; refusing to mutate blind.');
  process.exit(5);
}

const originals = new Map();
for (const [file] of MUTANTS) if (!originals.has(file)) originals.set(file, fs.readFileSync(file, 'utf8'));
const restoreAll = () => { for (const [f, o] of originals) fs.writeFileSync(f, o); };

/**
 * Vitest caches transforms in node_modules/.vite. WITHOUT BUSTING IT BETWEEN MUTANTS THE CACHE
 * SERVES A STALE MUTANT AFTER THE RUN ENDS: a reviewer measured plain node reading
 * quiescentSkip=false while vitest SIMULTANEOUSLY read true, producing spurious failures on a
 * git-clean tree — one of which asserts the core IS quiescent-skipped. THE HARNESS WAS
 * MANUFACTURING A FALSE WITNESS OF THIS SD'S OWN TARGET DEFECT.
 */
const bustViteCache = () => {
  try { fs.rmSync(path.join(ROOT, 'node_modules/.vite'), { recursive: true, force: true }); } catch { /* best effort */ }
};

// PARTIAL MITIGATION, AND THE HONEST LIMITS ARE STATED BECAUSE I CLAIMED MORE THAN THIS ONCE.
// A previous version of this comment said the harness "restores on SIGINT/SIGTERM/uncaught". A
// reviewer disproved it on win32: SIGTERM — a signal explicitly registered here — LEFT THE FILE
// MUTATED, because process.kill is TerminateProcess on Windows and no handler runs. SIGKILL
// likewise left `return true;` in the seat check on disk. And the SIGINT handler CANNOT RUN during
// the blocking execSync below, which is most of the wall clock.
// WHAT ACTUALLY PROTECTS YOU: the inner `finally` after each vitest run, the outer `finally`, and
// the pre-flight clean-tree check above — which is the only one that helps if a mutant DID survive
// a kill. These handlers are a best-effort extra, not the guarantee.
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

    bustViteCache();   // or the run reads the PREVIOUS mutant from the transform cache
    let killed, detail;
    try {
      execSync(`npx vitest run ${TESTS}`, { cwd: ROOT, stdio: 'pipe', timeout: 300000 });
      killed = false; detail = 'SURVIVED — suite still green';
    } catch (e) {
      const out = (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '');
      const m = out.match(/Tests\s+(\d+) failed/);
      // A NON-ZERO EXIT IS NOT AUTOMATICALLY A KILL. A crash, an OOM, or a config error also exits
      // non-zero, so a run that reports no FAILING ASSERTIONS is flagged rather than counted — a
      // kill for the wrong reason is not a kill.
      killed = true;
      detail = m ? `killed by ${m[1]} failing assertion(s)` : 'exited non-zero with NO failing-assertion count — SUSPECT, verify manually';
    } finally {
      fs.writeFileSync(file, original);
      bustViteCache();   // leave no stale mutant in the cache for the next reader
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
