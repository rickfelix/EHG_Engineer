#!/usr/bin/env node
/**
 * migration-ledger-phantom-audit — count schema_migrations_applied success=true rows that are
 * genuinely PHANTOM: the migration_path never resolved to a real file (never tracked, never
 * deleted, not present anywhere else under a different root), excluding rows dispositioned in
 * docs/audits/migration-ledger-phantom-dispositions.json.
 *
 * QF-20260903-622: five rows were found asserting a successful apply for a path that never
 * existed. A wider sweep over the full ledger (this script) found 13 more of the identical
 * shape -- all recorded under a worktree-absolute path whose feature branch was never merged
 * to main, so the migration file itself never landed here even though the DDL genuinely ran at
 * apply time. The SAME sweep also surfaced shapes that LOOK like phantoms under a naive
 * current-tree-only check but are NOT defects, and must not be reported:
 *   - DELETED-AFTER-APPLY: the file WAS tracked in git, the migration genuinely ran, and it was
 *     later removed as part of ordinary cleanup. `git log --diff-filter=D` on HEAD finds the
 *     removal commit. This is normal history, not a phantom.
 *   - MOVED (same basename): the ledger recorded a different root (e.g. supabase/migrations/)
 *     than the file's CURRENT root (e.g. database/migrations/) -- same basename, present
 *     elsewhere in the tree. A stale root reference, not a fabrication.
 *   - RENAMED (different basename): a same-day rename (e.g. 20260719_x.sql ->
 *     20260719a_x.sql) changes the basename entirely, so it passes both cheap checks above and
 *     still looks phantom. Three such rows (QF-20260903-622's SD-LEO-INFRA-PLAN-OF-RECORD-
 *     REMAINDER-VIEW-001 group) required manually tracing the rename commit and are
 *     dispositioned as RENAMED_LEDGER_ROW rather than auto-detected -- this script does not
 *     attempt `git log --follow` per-candidate (too slow across this repo's many worktree refs
 *     to run routinely); a future rename shows up as an undispositioned false-flag here and
 *     needs the same one-time manual trace, not a code change.
 * The ticket's own verification standard names the deleted/moved exclusions explicitly ("not
 * stale references to moved or removed files"), so a row only counts as auto-detected-phantom
 * when it is NOT currently tracked, NEVER appears in HEAD's delete history, and is NOT present
 * anywhere else in the tree under the same basename -- any row already recorded in the
 * dispositions ledger (phantom OR the rarer renamed/other non-defect case) is suppressed
 * regardless of how it was diagnosed.
 *
 * FAIL-CLOSED ledger read (opposite of migration-disposition-ledger.mjs's FAIL OPEN): a
 * corrupt/missing dispositions file excludes NOTHING, so every already-known phantom would
 * re-report as undispositioned rather than silently passing -- the safe direction for a "must
 * read zero" gate.
 *
 * Usage: node scripts/audit/migration-ledger-phantom-audit.mjs
 * Exit 0 + "0 undispositioned phantom ledger row(s)" when clean; exit 1 + the offending rows
 * otherwise. The delete-history check only runs on the (small) subset that already failed the
 * cheap current-tracked check, scoped to HEAD only (not --all) -- this repo carries many
 * worktree/feature-branch refs, and --all made this check ~4x slower for no benefit: the
 * ticket's own standard is "never deleted", i.e. history reachable from the current branch.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { listApplied, normalizeMigrationPath, isTrackedMigrationPath } from '../../lib/migration-audit-reader.js';

const DISPOSITIONS_PATH = path.join('docs', 'audits', 'migration-ledger-phantom-dispositions.json');

function loadDispositions() {
  try {
    const raw = fs.readFileSync(DISPOSITIONS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {}; // absent/unreadable/malformed — FAIL CLOSED (excludes nothing).
  }
}

function basenameOf(normalizedPath) {
  return normalizedPath.replace(/^.*\//, '');
}

function presentElsewhere(basename) {
  try {
    return execSync(`git ls-files -- "**/${basename}"`, { encoding: 'utf8' }).trim().length > 0;
  } catch {
    return false;
  }
}

function everDeletedOnHead(basename) {
  try {
    return execSync(`git log HEAD --diff-filter=D --oneline -- "**/${basename}"`, { encoding: 'utf8' }).trim().length > 0;
  } catch {
    return false;
  }
}

/** True iff this row is a genuine phantom per the ticket's standard (see file header). */
function isGenuinePhantom(row) {
  if (!row.migration_path) return false;
  if (isTrackedMigrationPath(row.migration_path)) return false;
  const basename = basenameOf(normalizeMigrationPath(row.migration_path));
  if (!basename) return false;
  if (presentElsewhere(basename)) return false; // moved to a different root
  if (everDeletedOnHead(basename)) return false; // legitimately removed after applying
  return true;
}

async function main() {
  const dispositions = loadDispositions();
  const rows = await listApplied({ success: true, limit: 1000 });

  const phantoms = rows.filter(isGenuinePhantom);
  const undispositioned = phantoms.filter((r) => !dispositions[r.id]);

  if (undispositioned.length > 0) {
    console.error(`${undispositioned.length} undispositioned phantom ledger row(s):`);
    for (const r of undispositioned) {
      console.error(`  id=${r.id} migration_path=${r.migration_path} applied_at=${r.applied_at}`);
    }
    console.error(`Disposition via ${DISPOSITIONS_PATH} (see QF-20260903-622 entries for the format) or investigate as a new write-path guard gap.`);
    process.exitCode = 1;
    return;
  }

  console.log(`0 undispositioned phantom ledger row(s) (${phantoms.length} known-phantom, all dispositioned).`);
}

main().catch((e) => { console.error('ERROR', e.message); process.exitCode = 1; });
