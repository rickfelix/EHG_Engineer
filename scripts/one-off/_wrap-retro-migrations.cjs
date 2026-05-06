#!/usr/bin/env node
/**
 * Wrap retrospective migration files in BEGIN;/COMMIT; for the Layer 4.3 CI grep contract.
 *
 * Original bulk-edit script: SD-LEO-INFRA-BULK-ADD-BEGIN-001 (PR #3562).
 * Single-file mode added: SD-LEO-INFRA-SINGLE-FILE-MODE-001 (this SD), so the
 * pre-commit guard from SD-LEO-INFRA-PRE-COMMIT-GUARD-001 (PR #3564) can point
 * developers at an actionable per-file command.
 *
 * Modes:
 *   node _wrap-retro-migrations.cjs                    → bulk mode: hard-coded list of 17 files
 *   node _wrap-retro-migrations.cjs <path>             → single-file mode (pass any number of paths)
 *   node _wrap-retro-migrations.cjs --help             → print usage and exit 0
 *
 * Per-file paths must:
 *   - end in .sql
 *   - resolve under database/migrations/
 *
 * Why:  Layer 4.3 retrospective-quality-gates CI workflow greps every
 *       database/migrations/*retrospective*.sql for line-leading BEGIN; / COMMIT;.
 * What: Idempotently inserts BEGIN; after each file's leading comment header
 *       and appends COMMIT; at the bottom, plus a one-line audit comment.
 *
 * Pre-flight guard: skips files containing CREATE INDEX CONCURRENTLY (cannot run
 * inside a transaction). Logs the exclusion with reason.
 *
 * Idempotency: re-run is a no-op once each file has ^BEGIN; and ^COMMIT;.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const MIG_DIR = path.join(ROOT, 'database', 'migrations');

const BULK_FILES = [
  '20251015_add_retrospective_quality_score_constraint.sql',
  '20251015_add_retrospective_quality_score_constraint_fixed.sql',
  '20251015_add_retrospective_quality_score_constraint_part2.sql',
  '20251204_add_protocol_improvements_to_retrospectives.sql',
  '20251210_retrospective_self_improvement_system.sql',
  '20251228_audit_retrospective_schema.sql',
  '20260101_standardize_retrospective_arrays.sql',
  '20260119_add_coverage_metrics_to_retrospectives.sql',
  '20260123_retrospective_auto_archive_trigger.sql',
  '20260130_add_metadata_to_retrospectives.sql',
  '20260131_retrospective_idempotency.sql',
  '20260201_add_future_enhancements_to_retrospectives.sql',
  '20260211_fix_retrospective_optional_complete.sql',
  '20260211_fix_template_retrospective_optional.sql',
  'fix_retrospectives_retro_type_constraint.sql',
  'fix-retrospectives-constraint.sql',
  'leo_protocol_enforcement_002_retrospective_quality.sql',
];

const AUDIT_COMMENT = `-- 2026-05-05 (SD-LEO-INFRA-BULK-ADD-BEGIN-001): added BEGIN;/COMMIT; for Layer 4.3 CI grep contract. Migration was already applied to production; transaction wrapping affects file-structure validation only, not runtime.`;

function printUsage() {
  console.log('Usage:');
  console.log('  node scripts/one-off/_wrap-retro-migrations.cjs                  # bulk mode (17 historical files)');
  console.log('  node scripts/one-off/_wrap-retro-migrations.cjs <path> [<path>]  # single-file mode (one or more paths)');
  console.log('  node scripts/one-off/_wrap-retro-migrations.cjs --help           # show this message');
  console.log('');
  console.log('Per-file paths must end in .sql and resolve under database/migrations/.');
}

/**
 * Wrap a single migration file in place.
 * Returns one of: 'modified', 'skipped', 'excluded', 'error'.
 */
function processFile(displayName, fullPath) {
  try {
    if (!fs.existsSync(fullPath)) {
      console.error(`[ERROR] missing: ${displayName}`);
      return 'error';
    }

    const original = fs.readFileSync(fullPath, 'utf8');

    // CONCURRENTLY pre-flight
    if (/CREATE\s+INDEX\s+CONCURRENTLY/i.test(original)) {
      console.log(`[EXCLUDED] ${displayName} — contains CREATE INDEX CONCURRENTLY (cannot run inside transaction)`);
      return 'excluded';
    }

    // Idempotency: skip if BOTH BEGIN; and COMMIT; are already present at line-start
    const hasBegin = /^BEGIN;\s*$/m.test(original);
    const hasCommit = /^COMMIT;\s*$/m.test(original);
    if (hasBegin && hasCommit) {
      console.log(`[SKIP] ${displayName} — already wrapped`);
      return 'skipped';
    }

    // Find insertion point for BEGIN;: after leading comment block (lines starting with --)
    const lines = original.split(/\r?\n/);
    let insertIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed === '' || trimmed.startsWith('--')) {
        insertIdx = i + 1;
      } else {
        break;
      }
    }

    const headerLines = lines.slice(0, insertIdx);
    const bodyLines = lines.slice(insertIdx);

    // Trim trailing blank lines from body
    while (bodyLines.length && bodyLines[bodyLines.length - 1].trim() === '') {
      bodyLines.pop();
    }

    const wrapped = [
      ...headerLines,
      AUDIT_COMMENT,
      'BEGIN;',
      '',
      ...bodyLines,
      '',
      'COMMIT;',
      '',
    ].join('\n');

    fs.writeFileSync(fullPath, wrapped, 'utf8');
    console.log(`[MODIFIED] ${displayName}`);
    return 'modified';
  } catch (err) {
    console.error(`[ERROR] ${displayName}: ${err.message}`);
    return 'error';
  }
}

/**
 * Validate a path arg: must end in .sql AND resolve under database/migrations/.
 * Returns { ok, fullPath, displayName } or { ok: false, error }.
 */
function validatePathArg(arg) {
  if (!arg.toLowerCase().endsWith('.sql')) {
    return { ok: false, error: `${arg}: not a .sql file` };
  }
  const fullPath = path.isAbsolute(arg) ? path.resolve(arg) : path.resolve(process.cwd(), arg);
  const relFromMigDir = path.relative(MIG_DIR, fullPath);
  if (relFromMigDir.startsWith('..') || path.isAbsolute(relFromMigDir)) {
    return { ok: false, error: `${arg}: not under database/migrations/` };
  }
  const displayName = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');
  return { ok: true, fullPath, displayName };
}

function main() {
  const args = process.argv.slice(2);

  // --help / -h
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    printUsage();
    process.exit(0);
  }

  const stats = { modified: 0, skipped: 0, excluded: 0, errors: 0 };
  let mode;

  if (args.length === 0) {
    // Bulk mode: process the hard-coded list
    mode = 'bulk';
    for (const file of BULK_FILES) {
      const fullPath = path.join(MIG_DIR, file);
      const result = processFile(file, fullPath);
      stats[result === 'error' ? 'errors' : result]++;
    }
  } else {
    // Single-file (or multi-file) mode: process each provided path
    mode = 'per-file';
    for (const arg of args) {
      const v = validatePathArg(arg);
      if (!v.ok) {
        console.error(`[ERROR] ${v.error}`);
        stats.errors++;
        continue;
      }
      const result = processFile(v.displayName, v.fullPath);
      stats[result === 'error' ? 'errors' : result]++;
    }
  }

  console.log('');
  console.log(`=== Summary (${mode} mode) ===`);
  console.log(`Modified: ${stats.modified}`);
  console.log(`Skipped (already wrapped): ${stats.skipped}`);
  console.log(`Excluded (CONCURRENTLY): ${stats.excluded}`);
  console.log(`Errors: ${stats.errors}`);

  process.exit(stats.errors > 0 ? 1 : 0);
}

main();
