#!/usr/bin/env node
/**
 * Jammed git index detector — scheduled host (SD-LEO-INFRA-JAMMED-GIT-INDEX-001)
 *
 * STRICTLY OBSERVATIONAL. It stats the index lock and never opens, acquires, writes or removes it.
 * A detector that acquired the lock to test it could, if killed mid-write, leave exactly the orphan
 * lock that IS the incident.
 *
 * Hosted here rather than in GitHub Actions on purpose: the gauge-runner GHA cron runs on
 * ubuntu-latest against a FRESH checkout and can never observe the local shared tree.
 *
 * Usage: node scripts/cron/index-jam-detector.mjs --repo <path> [--json] [--dwell-ms N]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { stampLastFired } from '../../lib/periodic-liveness/stamp-last-fired.js';
import {
  VERDICT, DEFAULT_DWELL_MS, classifyIndexHealth, lockIdentityOf, exitCodeFor, formatVerdict,
  applyPersistenceDegradation,
} from '../../lib/git/index-jam-detector.js';

const PROCESS_KEY = 'standard_loop:index-jam-detector';

/**
 * State lives beside the OBSERVED repo, never relative to process.cwd().
 *
 * Because persistence IS the signal, a state path that moves with cwd means the counter never
 * accumulates and the detector silently never fires. Measured: same repo, same held lock, two
 * different cwds — one tick reported JAMMED, the next reported HEALTHY mid-jam. Windows Task
 * Scheduler defaults "Start in" to %SystemRoot%\system32, so a scheduled run would have used a
 * different state file from every manual run. That is the single likeliest route to a detector
 * that is green forever during a real outage.
 */
export function stateFileFor(repoPath) {
  return path.join(repoPath, '.claude', 'index-jam-detector-state.json');
}

/**
 * Resolve the git dir. TR-3: `.git` as a DIRECTORY means a main root; as a FILE it is a worktree
 * gitdir pointer. There are 17 worktrees — probing the wrong one, or globbing across all of them,
 * is how a detector becomes noisy.
 */
export function resolveGitDir(repoPath) {
  const dotGit = path.join(repoPath, '.git');
  const st = fs.statSync(dotGit); // throws if absent — caller maps to UNAVAILABLE
  if (st.isDirectory()) return { gitDir: dotGit, kind: 'main_root' };
  const pointer = fs.readFileSync(dotGit, 'utf8').trim();
  const m = pointer.match(/^gitdir:\s*(.+)$/);
  if (!m) throw new Error(`.git file is not a gitdir pointer: ${pointer.slice(0, 60)}`);
  const gitDir = path.resolve(repoPath, m[1]);
  // The pointer target MUST exist and be a directory. A PRUNED worktree leaves a .git file
  // pointing at a removed worktrees/<name>, so statting <gitDir>/index.lock returns ENOENT — which
  // the caller would read as "successful observation, lock absent" and report HEALTHY FOREVER,
  // indistinguishable from a genuinely healthy tree. A prunable worktree is an ordinary git state
  // and there are 17 of them. This also bounds a relative pointer (e.g. `gitdir: ../../elsewhere`)
  // to something that is actually a git dir rather than any directory the path resolves to.
  const st2 = fs.statSync(gitDir); // throws -> UNAVAILABLE, which is the honest verdict
  if (!st2.isDirectory()) throw new Error(`gitdir pointer target is not a directory: ${gitDir}`);
  return { gitDir, kind: 'worktree' };
}

/**
 * Read-only observation. TR-5: THROWS when given no path — never falls back to process.cwd(),
 * because a caller that forgets the argument would silently observe the REAL shared index.
 */
export function observeIndexLock(repoPath) {
  if (!repoPath || typeof repoPath !== 'string') {
    throw new Error('observeIndexLock requires an explicit repo path — refusing to default to cwd');
  }
  let lockPath;
  try {
    lockPath = path.join(resolveGitDir(repoPath).gitDir, 'index.lock');
  } catch (err) {
    return { lockPresent: false, lockIdentity: null, error: `cannot resolve git dir: ${err.message}` };
  }
  try {
    const st = fs.statSync(lockPath);
    return { lockPresent: true, lockIdentity: lockIdentityOf(st), lockPath };
  } catch (err) {
    // ENOENT is a SUCCESSFUL observation that the lock is absent — not an error, and it is the
    // only path that resets the persistence counter. Anything else is UNAVAILABLE, which
    // preserves prior state so a transient blip mid-jam cannot restart the clock.
    if (err.code === 'ENOENT') return { lockPresent: false, lockIdentity: null, lockPath };
    return { lockPresent: false, lockIdentity: null, error: `${err.code || 'ESTAT'}: ${err.message}` };
  }
}

/**
 * Cross-tick state store, injected at the IO boundary (TR-7) so the verdict stays pure. A cron tick
 * is a fresh process, so this cannot live in memory. Deliberately NOT a findings sink — the
 * detector's OUTPUT is the verdict and its exit code; this file is only carry-over.
 */
export function loadState(repoPath, file = stateFileFor(repoPath)) {
  try {
    const all = JSON.parse(fs.readFileSync(file, 'utf8'));
    return all[repoPath] || undefined;
  } catch { return undefined; }
}

export function saveState(repoPath, nextState, file = stateFileFor(repoPath)) {
  let all = {};
  try { all = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run */ }
  all[repoPath] = nextState;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(all, null, 2));
    return true;
  } catch (err) {
    console.error(`[index-jam-detector] could not persist state: ${err.message}`);
    return false;
  }
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  // No env fallback: observeIndexLock refuses a default path precisely so a forgetful caller
  // cannot silently observe the shared index, and CLAUDE_PROJECT_DIR names the shared root in a
  // shared-root session — an env default would reintroduce what the throw exists to prevent.
  const repoPath = arg('--repo', null);
  if (!repoPath) {
    console.error('[index-jam-detector] --repo <path> is required (no cwd fallback by design)');
    process.exit(2);
  }
  const dwellMs = Number(arg('--dwell-ms', DEFAULT_DWELL_MS));
  const nowMs = Date.now();

  const observation = observeIndexLock(repoPath);
  const prior = loadState(repoPath);
  let result = classifyIndexHealth(observation, nowMs, prior, { dwellMs });

  // If carry-over state cannot be persisted, the counter cannot survive to the next tick and the
  // detector would report HEALTHY forever. Measured: with <repo>/.claude unwritable and a real
  // lock held continuously, exit 0 on 4 of 4 ticks. Readers key on the EXIT CODE per the shape
  // contract, so a stderr line is not the contract — the verdict itself must degrade. Note the
  // triggering scenario is CORRELATED: disk-full can both orphan an index.lock and block the write.
  result = applyPersistenceDegradation(result, saveState(repoPath, result.nextState));

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ repoPath, observedAt: new Date(nowMs).toISOString(), ...result }, null, 2));
  } else {
    console.log(formatVerdict(repoPath, result));
  }

  // Own liveness, so this detector is not itself an unwatched one. Non-fatal, matching
  // gauge-runner.mjs:517-519.
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    try { await stampLastFired(createClient(url, key), PROCESS_KEY); }
    catch (err) { console.error(`[index-jam-detector] stampLastFired failed (non-fatal): ${err.message}`); }
  }

  // Set exitCode and RETURN — do not call process.exit() here. The supabase client created for
  // stampLastFired still holds an open handle, and exiting mid-teardown trips a libuv assertion
  // (UV_HANDLE_CLOSING) that produced exit 127 instead of 0/1. A scheduler cannot act on an
  // exit code that reports "command not found" for a healthy tree, so this is load-bearing for
  // FR-2 AC-2. Letting the event loop drain yields the intended code.
  process.exitCode = exitCodeFor(result.verdict);
}

// Only run when invoked directly, so the exported seams stay importable by tests.
if (process.argv[1] && process.argv[1].endsWith('index-jam-detector.mjs')) {
  main().catch((err) => {
    console.error(`[index-jam-detector] ${err.stack || err.message}`);
    process.exitCode = 1;
  });
}

export { VERDICT, PROCESS_KEY };
