#!/usr/bin/env node
/**
 * SD-FDBK-ENH-SCOPE-REPLACE-WORKTREE-001 FR-5 — reparse regression guard.
 *
 * A REGRESSION GUARD, NOT AN ACCEPTANCE CRITERION. The SD was sourced with acceptance
 * `reparse_point_worktrees / total_worktrees == 0`. Measured at LEAD: it was ALREADY 0, so as
 * acceptance it is a permanent vacuous green that no work can move. It still has real value
 * catching a REINTRODUCTION, which is what this is for.
 *
 * THE JUNCTION PATH IS NOT DEAD CODE, so this can genuinely fire. lib/worktree-provision.js
 * junctions deliberately at <=1 active session, WORKTREE_ISOLATION_MODE=never, or <3GB free — and
 * ALSO as an isolate_failed_fallback when npm install exceeds its 180s wall-clock timeout, whose
 * probability RISES with fleet concurrency. Junctions can therefore appear at BOTH ENDS of the
 * concurrency curve.
 *
 * THREE DISCIPLINES, each earned the hard way during this SD:
 *
 * 1. TR-1 — the DENOMINATOR is defined instrument-independently and RECURSIVELY. LEAD published it
 *    wrong twice (13, then 19; authoritative was 17 = 1 main + 16 linked): once by counting
 *    "worktrees that have a node_modules" and calling it total_worktrees, once by missing the
 *    nested .worktrees/qf/ layout. Single-level enumeration is not enough.
 *
 * 2. TR-1 — the population is VOLATILE. Reapers remove worktrees continuously, so a count without
 *    a timestamp manufactures contradictions between two readers who were both right.
 *
 * 3. TR-2 — 0/0 IS A FAILURE TO MEASURE, never a pass. A detector that reports zero is
 *    indistinguishable from one that is blind, which is why --self-test exists and why an empty
 *    denominator exits non-zero.
 *
 * Usage:
 *   node scripts/audit/worktree-reparse-audit.mjs              # audit, human output
 *   node scripts/audit/worktree-reparse-audit.mjs --json       # machine-readable
 *   node scripts/audit/worktree-reparse-audit.mjs --self-test  # NEGATIVE CONTROL: prove it fires
 *
 * Exit: 0 clean · 1 reparse point found · 2 failure to measure (empty denominator) · 3 self-test failed
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Pure: is this path a reparse point (junction/symlink)?
 * lstat, never stat — stat follows the link and would report the TARGET's type.
 */
export function isReparsePoint(p, fsImpl = fs) {
  try {
    return fsImpl.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Pure: classify an audit result. Exported so the 0/0 rule is pinned rather than asserted in prose.
 * @param {{total:number, reparse:string[]}} counts
 */
export function classifyAudit({ total, reparse }) {
  const found = (reparse || []).length;
  if (!Number.isFinite(total) || total <= 0) {
    return { verdict: 'FAILED_TO_MEASURE', exitCode: 2, reason: 'empty denominator — 0/0 is not a pass' };
  }
  if (found > 0) return { verdict: 'REGRESSION', exitCode: 1, reason: `${found} of ${total} worktree node_modules are reparse points` };
  return { verdict: 'CLEAN', exitCode: 0, reason: `0 of ${total} worktree node_modules are reparse points` };
}

/** Recursively collect directories that contain a `.git` entry — the instrument-independent population. */
export function collectWorktrees(rootDir, fsImpl = fs, depth = 0) {
  const out = [];
  if (depth > 3) return out;
  let entries;
  try {
    entries = fsImpl.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const full = path.join(rootDir, e.name);
    let hasGit = false;
    try { hasGit = !!fsImpl.lstatSync(path.join(full, '.git')); } catch { hasGit = false; }
    if (hasGit) out.push(full);
    else out.push(...collectWorktrees(full, fsImpl, depth + 1));
  }
  return out;
}

/** NEGATIVE CONTROL. A zero from a blind detector reads exactly like a zero from a clean tree. */
function selfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reparse-selftest-'));
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'reparse-target-'));
  const link = path.join(dir, 'node_modules');
  try {
    fs.symlinkSync(target, link, 'junction');
  } catch (err) {
    console.error(`SELF-TEST INCONCLUSIVE: could not create a junction (${err.message}). Treating as FAILURE — an unproven detector must not certify a zero.`);
    return 3;
  }
  const fired = isReparsePoint(link);
  console.log(`  self-test: deliberate junction detected = ${fired}`);
  try { fs.unlinkSync(link); } catch { /* best-effort */ }
  if (!fired) {
    console.error('SELF-TEST FAILED: the detector did not fire on a real junction. Every zero it reports is meaningless.');
    return 3;
  }
  console.log('  self-test PASSED — the detector demonstrably fires, so a zero below is informative.');
  return 0;
}

function main() {
  const json = process.argv.includes('--json');
  const selfOnly = process.argv.includes('--self-test');
  const repoRoot = process.cwd();
  const worktreesDir = path.join(repoRoot, '.worktrees');

  if (!json) console.log('\nWORKTREE REPARSE AUDIT (FR-5 regression guard)\n');
  const selfCode = selfTest();
  if (selfCode !== 0) process.exit(selfCode);
  if (selfOnly) process.exit(0);

  const worktrees = collectWorktrees(worktreesDir);
  const reparse = worktrees.filter((w) => isReparsePoint(path.join(w, 'node_modules')));
  const measuredAt = new Date().toISOString();
  const result = classifyAudit({ total: worktrees.length, reparse });

  if (json) {
    console.log(JSON.stringify({ measured_at: measuredAt, total_worktrees: worktrees.length, reparse_points: reparse, ...result }, null, 2));
  } else {
    console.log(`\n  measured_at: ${measuredAt}   <- the population is VOLATILE; a count without this manufactures contradictions`);
    console.log(`  total_worktrees: ${worktrees.length}  (recursive, dirs containing .git)`);
    console.log(`  reparse_points:  ${reparse.length}`);
    for (const r of reparse) console.log(`    ! ${r}`);
    console.log(`\n  ${result.verdict}: ${result.reason}\n`);
  }
  process.exit(result.exitCode);
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;
if (isMain) main();
