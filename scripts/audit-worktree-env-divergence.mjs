#!/usr/bin/env node
// audit-worktree-env-divergence.mjs — SD-LEO-INFRA-TIER-GATE-FLAG-001 (FR-5).
//
// WHAT THIS MEASURES, AND WHY IT IS NOT "worktrees missing the flag".
// A worktree .env is a point-in-time COPY: both provisioning paths copy it guarded by
// !existsSync(dst), so it is written once and never refreshed. Env resolution then walks
// UP from cwd to the first .env — so a worktree with NO .env inherits the shared root and
// is SAFE. Absence is not the hazard; a STALE COPY that DISAGREES with the root is.
//
// After SD-LEO-INFRA-TIER-GATE-FLAG-001, a worktree .env merely lacking
// LEO_MIGRATION_TIER_GATE is also safe: the gate reads the DB flag and fails closed. So
// checking for "missing the flag" would pin a pre-change fact rather than a live defect.
// What this reports instead is DISAGREEMENT with the shared root, in either direction,
// for any tracked env-carried control — because that divergence is the standing mechanism,
// and it will recur for the next variable someone puts in .env.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * The MAIN repo root — never `__dirname/..`.
 *
 * This check ships inside the repo it audits, so it is routinely executed FROM a worktree,
 * where `__dirname/..` is the worktree root: `.worktrees/` does not exist there and `.env`
 * is the local copy rather than the shared root. Measured on the first run: it reported
 * "✅ no divergence across 0 scanned" — comparing the worktree against itself and calling
 * it clean. A checker that resolves the wrong root cannot see the thing it exists to find,
 * and reports green while doing it.
 *
 * `git rev-parse --git-common-dir` resolves to the MAIN .git directory from any worktree,
 * so its parent is the main working tree.
 */
export function resolveMainRepoRoot(startDir = __dirname) {
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: startDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    if (common) return path.dirname(common);
  } catch { /* fall through */ }
  return path.resolve(startDir, '..');
}

const REPO_ROOT = resolveMainRepoRoot();

/**
 * Controls whose value must not diverge between the shared root and any worktree copy.
 *
 * NEVER add a secret-bearing key: divergent VALUES are printed, so tracking a credential
 * would leak it to stdout and into --json.
 *
 * LEO_MIGRATION_TIER_GATE_FORCE_ON is tracked and LEO_MIGRATION_TIER_GATE is kept for the
 * deprecation window. The FORCE_ON one matters more: it is the only remaining env var that
 * can still alter gate behaviour from a per-worktree .env. It is strengthen-only so a
 * divergence cannot open the gate — but a worktree silently forcing the gate ON while the
 * fleet reads the DB flag is still two representations, which is what this check is for.
 */
export const TRACKED_KEYS = Object.freeze([
  'LEO_MIGRATION_TIER_GATE',
  'LEO_MIGRATION_TIER_GATE_FORCE_ON'
]);

/** Parse `KEY=value` for the tracked keys only. Returns a Map; absent keys are simply not set. */
export function readEnvKeys(file, keys = TRACKED_KEYS) {
  const out = new Map();
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return out;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    if (!keys.includes(m[1])) continue;
    out.set(m[1], m[2].trim().replace(/^["']|["']$/g, ''));
  }
  return out;
}

/**
 * Compare each worktree .env against the root for the tracked keys.
 * ABSENT in a worktree is NOT a divergence — the ancestor walk reaches the root.
 * A PRESENT-but-different value IS.
 */
export function findDivergences(rootEnvPath, worktreeDirs) {
  const rootVals = readEnvKeys(rootEnvPath);
  const offenders = [];
  let scanned = 0;
  for (const dir of worktreeDirs) {
    const envPath = path.join(dir, '.env');
    if (!existsSync(envPath)) continue; // no local copy => inherits the root => safe
    scanned += 1;
    const vals = readEnvKeys(envPath);
    for (const key of TRACKED_KEYS) {
      if (!vals.has(key)) continue; // absent => inherits => safe
      const local = vals.get(key);
      const root = rootVals.get(key);
      if (local !== root) {
        offenders.push({ worktree: path.basename(dir), key, local, root: root ?? '(unset at root)' });
      }
    }
  }
  return { offenders, scanned };
}

function listWorktrees(repoRoot) {
  const base = path.join(repoRoot, '.worktrees');
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .map((n) => path.join(base, n))
    .filter((p) => {
      try { return statSync(p).isDirectory(); } catch { return false; }
    });
}

function main() {
  const json = process.argv.includes('--json');
  const rootEnv = path.join(REPO_ROOT, '.env');
  const dirs = listWorktrees(REPO_ROOT);
  const { offenders, scanned } = findDivergences(rootEnv, dirs);

  // A clean verdict over ZERO compared files is not evidence of health — it is evidence
  // the scan found nothing to look at. Both arms matter, and the second was learned the
  // hard way: the FIRST version only flagged `dirs.length > 0 && scanned === 0`, so when
  // the root resolved to a worktree (no .worktrees/ inside it) `dirs.length` was 0, the
  // guard stayed silent, and the run printed a green "0 scanned". Missing the CONTAINER
  // is a louder failure than finding it empty, so it must fail too.
  const noContainer = !existsSync(path.join(REPO_ROOT, '.worktrees'));
  const vacuous = noContainer || (dirs.length > 0 && scanned === 0);

  if (json) {
    console.log(JSON.stringify({ scanned, worktrees: dirs.length, offenders, vacuous }, null, 2));
  } else {
    console.log(`Worktree env divergence — root=${REPO_ROOT}`);
    console.log(`   ${dirs.length} worktree(s), ${scanned} with a local .env, keys: ${TRACKED_KEYS.join(', ')}`);
    if (noContainer) {
      console.log(`❌ VACUOUS: no .worktrees/ directory under the resolved root — the scan had nothing to look at. Resolved root may be wrong (are you inside a worktree?).`);
    } else if (vacuous) {
      console.log('❌ VACUOUS: worktrees exist but none carries a local .env — nothing was actually compared.');
    } else if (offenders.length === 0) {
      console.log(`✅ No divergence across ${scanned} scanned .env file(s).`);
    } else {
      console.log(`❌ ${offenders.length} divergence(s) — each of these reads a DIFFERENT value than the shared root:`);
      for (const o of offenders) {
        console.log(`   • ${o.worktree}: ${o.key}="${o.local}" (root="${o.root}")`);
      }
      console.log('\nRemediation: delete the stale .env in each worktree above. This is self-healing —');
      console.log('env resolution then walks up to the shared root, and the next worktree resolution');
      console.log('re-copies a current file.');
    }
  }

  // process.exitCode, NEVER process.exit(). On Windows, exiting while an open handle is
  // still closing aborts the process ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)")
  // and the shell then observes 127 REGARDLESS of the argument — in BOTH branches, so the
  // check silently cannot gate. Measured 5/5 on SD-LEO-INFRA-RELEASED-MID-PHASE-001.
  process.exitCode = offenders.length > 0 || vacuous ? 1 : 0;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
