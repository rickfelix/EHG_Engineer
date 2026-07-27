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
