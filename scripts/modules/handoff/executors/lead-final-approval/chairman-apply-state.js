/**
 * SD-LEO-INFRA-CHAIRMAN-APPLY-FLAG-001 — migration apply-state, reused not rebuilt.
 *
 * Invokes scripts/verify-migration-apply-state.mjs and returns its per-file classification.
 * That module is left COMPLETELY UNCHANGED by this SD, which is the point: it already folds
 * the migration corpus chronologically, resolves live pg_catalog state in bulk, and applies a
 * disposition ledger whose own comments document a CI false-pass inversion it exists to
 * prevent. Re-implementing that inside a gate would duplicate carefully-reasoned safety code
 * and any divergence between the copies would be silent — the exact defect class this SD fixes.
 *
 * NOT inherited: .github/workflows/migration-deploy-drift-guard.yml greps the classifier's
 * INFRA_ERROR marker and converts it to exit 0. That fail-open lives in the workflow, not in
 * the script, so invoking the script directly does not pick it up — and every failure path
 * below returns an `error`, which the calling gate treats as BLOCK.
 *
 * @module lead-final-approval/chairman-apply-state
 */

import { execFileSync } from 'child_process';
import path from 'path';
import { ENGINEER_ROOT } from '../../../../../lib/repo-paths.js';
import { branchBelongsToSd, loadKeySet } from '../../../../../lib/git/branch-owner.js';

/**
 * Classify every migration file as APPLIED | PARTIAL | NOT_APPLIED | NO_DDL.
 *
 * @returns {Promise<{ files: Array<{file: string, status: string, missing?: string[]}>, error: string|null }>}
 *   `error` non-null means the state could NOT be determined. Callers must treat that as a
 *   block, never as a pass.
 */
export async function classifyMigrationApplyState() {
  try {
    const script = path.join(ENGINEER_ROOT, 'scripts', 'verify-migration-apply-state.mjs');
    const raw = execFileSync(process.execPath, [script, '--json'], {
      cwd: ENGINEER_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024, // ~460KB today across 1324 files; headroom for growth
      timeout: 120_000
    });

    // stdout is NOT clean JSON. dotenvx prints a banner first, and that banner itself contains
    // the substring "{ override: true }" — so a naive raw.indexOf('{') lands INSIDE the banner
    // and the parse fails (confirmed empirically, 2026-07-27). Anchor on the first line whose
    // column 0 is '{'.
    const lines = raw.split(/\r?\n/);
    const start = lines.findIndex((l) => l.startsWith('{'));
    if (start === -1) {
      return { files: [], error: 'classifier produced no JSON object on stdout' };
    }

    const parsed = JSON.parse(lines.slice(start).join('\n'));
    if (!Array.isArray(parsed.files)) {
      return { files: [], error: 'classifier output contained no files[] array' };
    }
    return { files: parsed.files, error: null };
  } catch (e) {
    // Non-zero exit, timeout, unreadable output or malformed JSON all land here and all mean
    // the same thing: we do not know. Fail closed.
    return { files: [], error: e.message };
  }
}

/**
 * SD-LEO-INFRA-COMPLETED-UNAPPLIED-MIGRATION-001 (FR-1/TR-2): find migration-path files in the
 * SD's own merged PR, as an ADDITIONAL ownership source alongside declared[]/sdKeyOwnsFile().
 *
 * Mirrors PR_MERGE_VERIFICATION's Scan C (gh pr list --state merged --search <sdKey>, then
 * branch-owner-filtered) exactly in approach -- deliberately a small, standalone reimplementation
 * rather than an import, because Scan C itself is ~450 lines of inline logic inside
 * createPRMergeVerificationGate's validator with no extractable helper (measured: TESTING
 * sub-agent prospective review, LEAD-phase). Reusing the SAME gh-CLI shape (not the same code)
 * avoids a second independent notion of "the SD's PR" while avoiding an unscoped refactor.
 *
 * @param {string} sdKey
 * @param {Array<{githubRepo: string}>} reposWithPaths - from computeReposForSD(sd) (caller-owned;
 *   this module deliberately does not import gates.js, to avoid a circular import).
 * @returns {Promise<{files: string[], error: string|null}>} `error` non-null means
 *   could-not-determine -- callers must NOT treat this the same as "found nothing".
 */
export async function findMergedPrFileList(sdKey, reposWithPaths) {
  if (!sdKey || !Array.isArray(reposWithPaths) || reposWithPaths.length === 0) {
    return { files: [], error: null };
  }
  const keySet = await loadKeySet().catch(() => null);
  const SCAN_LIMIT = 100;
  let anyFailed = false;
  for (const { githubRepo: repo } of reposWithPaths) {
    try {
      const listRaw = execFileSync(
        'gh',
        ['pr', 'list', '--repo', repo, '--state', 'merged', '--search', sdKey, '--json', 'number,headRefName', '--limit', String(SCAN_LIMIT)],
        { encoding: 'utf8', timeout: 30000 }
      );
      const prs = JSON.parse(listRaw || '[]');
      const matching = prs.filter((pr) => branchBelongsToSd(pr.headRefName, sdKey, keySet).belongs);
      for (const pr of matching) {
        try {
          const filesRaw = execFileSync(
            'gh',
            ['pr', 'view', String(pr.number), '--repo', repo, '--json', 'files'],
            { encoding: 'utf8', timeout: 30000 }
          );
          const parsed = JSON.parse(filesRaw || '{}');
          const files = Array.isArray(parsed.files) ? parsed.files.map((f) => f.path).filter(Boolean) : [];
          return { files, error: null };
        } catch (_e) {
          anyFailed = true;
        }
      }
    } catch (_e) {
      anyFailed = true;
    }
  }
  if (anyFailed) {
    return { files: [], error: 'PR file-list lookup failed for at least one repo (gh CLI error)' };
  }
  return { files: [], error: null };
}
