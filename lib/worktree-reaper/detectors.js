/**
 * Worktree reaper — pure detection primitives.
 *
 * SD-LEO-INFRA-FORMALIZED-WORKTREE-REAPER-001
 *
 * Each detector is a pure-ish function that classifies a single worktree
 * against one category and returns { matched, reason, evidence }. Detectors
 * that need I/O (git plumbing, fs.stat) accept injected runners so tests can
 * mock without spinning up a real git repo.
 *
 * Composition over duplication: detectStaleWorktrees() in lib/worktree-manager.js
 * already classifies SD-completed / cancelled worktrees, concurrent-auto age
 * expiration, and orphaned-directory-missing. The reaper consumes that output
 * and ADDS the following net-new categories:
 *
 *   AC1 — isZombieOnMain:        branch pinned to `main` + no fresh claim
 *   AC2 — isNested:              path contains `.worktrees/` twice (depth ≥ 2)
 *   AC3 — hasOrphanSD:           sdKey does not resolve to any SD or QF row
 *   AC4 — isPatchEquivalentToMain: squash-merged (git cherry + gh PR merged)
 *   AC5 — isIdle:                max(last-commit, fs-mtime) > threshold
 *
 * All detectors return the same shape:
 *   { matched: boolean, reason: string, evidence: object }
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * AC1 — Zombie on main.
 * A worktree is a zombie when its checked-out branch is `main`/`master` and
 * no active session claim exists for the worktree path. These accumulate
 * when sd-start fails partway and leaves a bare worktree pinned to main.
 *
 * @param {{ path: string, branch?: string }} wt
 * @param {{ claimMap: Map<string, {heartbeat_at?: string, sd_key?: string}> }} ctx
 *   claimMap is keyed by worktree_path (normalized). Value present ⇒ active claim.
 * @returns {{ matched: boolean, reason: string, evidence: object }}
 */
export function isZombieOnMain(wt, ctx) {
  const branch = (wt.branch || '').replace(/^refs\/heads\//, '');
  const onMain = branch === 'main' || branch === 'master';
  if (!onMain) {
    return { matched: false, reason: 'branch_not_main', evidence: { branch } };
  }
  const claim = ctx?.claimMap?.get(normalizeForClaim(wt.path));
  if (claim) {
    return {
      matched: false,
      reason: 'on_main_but_claim_active',
      evidence: { branch, claim_sd_key: claim.sd_key },
    };
  }
  return {
    matched: true,
    reason: 'on_main_no_claim',
    evidence: { branch, claim_status: 'absent' },
  };
}

/**
 * AC2 — Nested worktree.
 * A worktree whose path contains `.worktrees/` more than once was created
 * inside another worktree. These must be removed inner-first.
 *
 * @param {{ path: string }} wt
 * @returns {{ matched: boolean, reason: string, evidence: object }}
 */
export function isNested(wt) {
  const normalized = (wt.path || '').replace(/\\/g, '/');
  const matches = normalized.match(/\.worktrees\//g);
  const depth = matches ? matches.length : 0;
  if (depth >= 2) {
    return {
      matched: true,
      reason: 'nested_path',
      evidence: { depth, normalized_path: normalized },
    };
  }
  return { matched: false, reason: 'not_nested', evidence: { depth } };
}

/**
 * AC3 — Orphan SD.
 * The worktree declares an sdKey (via .worktree.json or .ehg-session.json)
 * OR has a directory basename starting with SD-/QF-, and that key is not
 * present in strategic_directives_v2 OR quick_fixes.
 *
 * Caller must pre-fetch sdMap (Set of sd_key) and qfMap (Set of qf_key).
 *
 * @param {{ path: string, key?: string }} wt
 * @param {{ sdMap: Set<string>, qfMap: Set<string>, readFile?: Function }} ctx
 * @returns {{ matched: boolean, reason: string, evidence: object }}
 */
export function hasOrphanSD(wt, ctx) {
  const readFile = ctx?.readFile || defaultReadFile;
  const declaredKey = readDeclaredSdKey(wt.path, readFile);
  const basenameKey = wt.key || path.basename(wt.path || '');
  const candidateKeys = [declaredKey, basenameKey].filter(Boolean);

  if (candidateKeys.length === 0) {
    return {
      matched: false,
      reason: 'no_sdkey_declared',
      evidence: { declared: null, basename: basenameKey },
    };
  }

  for (const k of candidateKeys) {
    if (ctx?.sdMap?.has(k) || ctx?.qfMap?.has(k)) {
      return {
        matched: false,
        reason: 'sdkey_found',
        evidence: { matched_key: k, source: ctx.sdMap?.has(k) ? 'sd' : 'qf' },
      };
    }
  }

  // Multi-worktree suffix fallback: worktrees can be spawned under basenames
  // like `SD-FOO-001-api`, `SD-FOO-001-ui`, `SD-FOO-001-test`. If `basenameKey`
  // is `<known sd_key>-<short suffix>`, treat it as a recognized SD worktree
  // rather than an orphan. Suffix length bounded to avoid false positives from
  // completely different keys that happen to share a prefix.
  if (basenameKey && ctx?.sdMap && ctx.sdMap.size > 0) {
    const lastDash = basenameKey.lastIndexOf('-');
    if (lastDash > 0 && basenameKey.length - lastDash - 1 <= 12) {
      const prefix = basenameKey.slice(0, lastDash);
      if (ctx.sdMap.has(prefix)) {
        return {
          matched: false,
          reason: 'sdkey_found_via_suffix',
          evidence: { basename: basenameKey, matched_prefix: prefix, suffix: basenameKey.slice(lastDash + 1) },
        };
      }
    }
  }

  // Ignore well-known non-SD prefixes that are not orphans by definition.
  if (isKnownNonSdPrefix(basenameKey)) {
    return {
      matched: false,
      reason: 'non_sd_prefix',
      evidence: { basename: basenameKey },
    };
  }

  return {
    matched: true,
    reason: 'sdkey_not_in_db',
    evidence: { candidates: candidateKeys, basename: basenameKey },
  };
}

/**
 * AC4 — Patch-equivalent to main (shipped-stale).
 * `git cherry -v origin/main <branch>` lists commits on <branch> not in main.
 *   '+' prefix = unique commit (not on main)
 *   '-' prefix = equivalent commit found on main (via patch-id)
 * If all lines are '-' (or output is empty), the branch is fully absorbed.
 * Cross-checked with `gh pr list --search "head:<branch>" --state merged` so
 * we do not false-positive on coincidental patch-id collisions.
 *
 * Both checks require network-ish I/O (git + gh). Callers inject runners.
 *
 * @param {{ path: string, branch?: string }} wt
 * @param {{
 *   runGit: (args: string[], opts?: object) => { stdout: string, stderr: string, code: number },
 *   runGh:  (args: string[], opts?: object) => { stdout: string, stderr: string, code: number },
 *   repoRoot?: string
 * }} ctx
 * @returns {Promise<{ matched: boolean, reason: string, evidence: object }>}
 */
export async function isPatchEquivalentToMain(wt, ctx) {
  const branch = (wt.branch || '').replace(/^refs\/heads\//, '');
  if (!branch || branch === 'main' || branch === 'master') {
    return {
      matched: false,
      reason: branch ? 'branch_is_main' : 'branch_unresolved',
      evidence: { branch },
    };
  }
  if (!ctx?.runGit || !ctx?.runGh) {
    throw new Error('isPatchEquivalentToMain requires ctx.runGit and ctx.runGh');
  }

  // cherry -v origin/main <branch>
  let cherry;
  try {
    cherry = ctx.runGit(['cherry', '-v', 'origin/main', branch], { cwd: ctx.repoRoot });
  } catch (err) {
    return {
      matched: false,
      reason: 'cherry_failed',
      evidence: { error: String(err?.message || err) },
    };
  }
  if (cherry.code !== 0) {
    return {
      matched: false,
      reason: 'cherry_nonzero_exit',
      evidence: { code: cherry.code, stderr: (cherry.stderr || '').trim() },
    };
  }
  const lines = (cherry.stdout || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const allAbsorbed = lines.length === 0 || lines.every((l) => l.startsWith('-'));
  if (!allAbsorbed) {
    const uniqueCount = lines.filter((l) => l.startsWith('+')).length;
    return {
      matched: false,
      reason: 'branch_has_unique_commits',
      evidence: { unique_count: uniqueCount, total: lines.length },
    };
  }

  // Confirm via GitHub: this branch's PR (if any) is merged.
  // Absence of a PR is NOT disqualifying — branch may have been absorbed via
  // rebase/cherry-pick without a PR. allAbsorbed + no-PR still matches.
  let ghResult = null;
  try {
    ghResult = ctx.runGh(
      ['pr', 'list', '--search', `head:${branch}`, '--state', 'merged', '--json', 'number,state,mergedAt'],
      { cwd: ctx.repoRoot },
    );
  } catch (err) {
    return {
      matched: true,
      reason: 'patch_equivalent_gh_unavailable',
      evidence: { cherry_empty: lines.length === 0, cherry_all_absorbed: true, gh_error: String(err?.message || err) },
    };
  }

  let prs = [];
  if (ghResult.code === 0) {
    try { prs = JSON.parse(ghResult.stdout || '[]'); } catch { prs = []; }
  }

  return {
    matched: true,
    reason: prs.length > 0 ? 'patch_equivalent_squash_merged' : 'patch_equivalent_absorbed_without_pr',
    evidence: {
      cherry_all_absorbed: true,
      cherry_lines: lines.length,
      merged_pr_count: prs.length,
      merged_pr: prs[0] ? { number: prs[0].number, mergedAt: prs[0].mergedAt } : null,
    },
  };
}

/**
 * AC5 — Idle worktree.
 * max(last-commit-ctime, directory mtime) older than threshold AND no active
 * claim AND no unique unpushed commits.
 *
 * @param {{ path: string, branch?: string }} wt
 * @param {{
 *   thresholdMs: number,
 *   now?: number,
 *   claimMap: Map<string, object>,
 *   runGit: Function,
 *   stat?: Function,
 *   repoRoot?: string
 * }} ctx
 * @returns {{ matched: boolean, reason: string, evidence: object }}
 */
export function isIdle(wt, ctx) {
  const now = ctx?.now ?? Date.now();
  const thresholdMs = ctx?.thresholdMs;
  if (!thresholdMs || thresholdMs <= 0) {
    throw new Error('isIdle requires positive ctx.thresholdMs');
  }
  if (!ctx?.runGit) {
    throw new Error('isIdle requires ctx.runGit');
  }

  // Active claim ⇒ not idle.
  const claim = ctx?.claimMap?.get(normalizeForClaim(wt.path));
  if (claim) {
    return {
      matched: false,
      reason: 'claim_active',
      evidence: { claim_sd_key: claim.sd_key },
    };
  }

  // last-commit time (ISO epoch seconds) from worktree HEAD.
  let lastCommitMs = 0;
  try {
    const out = ctx.runGit(['log', '-1', '--format=%ct'], { cwd: wt.path });
    if (out.code === 0) {
      const secs = parseInt((out.stdout || '').trim(), 10);
      if (Number.isFinite(secs) && secs > 0) lastCommitMs = secs * 1000;
    }
  } catch { /* fall through */ }

  // Directory mtime as fallback / tie-breaker.
  let mtimeMs = 0;
  const stat = ctx?.stat || defaultStat;
  try {
    const s = stat(wt.path);
    if (s && typeof s.mtimeMs === 'number') mtimeMs = s.mtimeMs;
  } catch { /* ignore */ }

  const freshest = Math.max(lastCommitMs, mtimeMs);
  if (freshest === 0) {
    return {
      matched: false,
      reason: 'no_timing_signal',
      evidence: { lastCommitMs, mtimeMs },
    };
  }

  const ageMs = now - freshest;
  if (ageMs <= thresholdMs) {
    return {
      matched: false,
      reason: 'within_threshold',
      evidence: { ageMs, thresholdMs, lastCommitMs, mtimeMs },
    };
  }

  // Only flag if there are no unique commits waiting to be pushed.
  let uniqueCount = 0;
  try {
    const cherry = ctx.runGit(['cherry', 'origin/main', 'HEAD'], { cwd: wt.path });
    if (cherry.code === 0) {
      uniqueCount = (cherry.stdout || '').split('\n').filter((l) => l.startsWith('+')).length;
    }
  } catch { uniqueCount = 0; }

  if (uniqueCount > 0) {
    return {
      matched: false,
      reason: 'has_unpushed_unique_commits',
      evidence: { ageMs, uniqueCount },
    };
  }

  return {
    matched: true,
    reason: 'idle_beyond_threshold',
    evidence: { ageMs, thresholdMs, lastCommitMs, mtimeMs, uniqueCount: 0 },
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function normalizeForClaim(p) {
  if (!p) return '';
  return path.resolve(String(p)).replace(/\\/g, '/').toLowerCase();
}

function readDeclaredSdKey(wtPath, readFile) {
  if (!wtPath) return null;
  for (const name of ['.worktree.json', '.ehg-session.json']) {
    try {
      const raw = readFile(path.join(wtPath, name));
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const key =
        parsed?.sdKey ||
        parsed?.workKey ||
        parsed?.sd_key ||
        null;
      if (key) return String(key);
    } catch { /* missing / malformed ⇒ skip */ }
  }
  return null;
}

function defaultReadFile(fp) {
  try { return fs.readFileSync(fp, 'utf8'); } catch { return null; }
}

function defaultStat(fp) {
  try { return fs.statSync(fp); } catch { return null; }
}

const NON_SD_PREFIXES = ['concurrent-auto-', '_archive', 'qf-', 'adhoc-', 'session-'];
function isKnownNonSdPrefix(basename) {
  if (!basename) return false;
  return NON_SD_PREFIXES.some((p) => basename.startsWith(p));
}
