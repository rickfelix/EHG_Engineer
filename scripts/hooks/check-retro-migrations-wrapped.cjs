#!/usr/bin/env node
/**
 * Pre-commit helper for SD-LEO-INFRA-PRE-COMMIT-GUARD-001.
 *
 * Validates that staged `database/migrations/*retrospective*.sql` files contain
 * line-leading `BEGIN;` and `COMMIT;` keywords (the contract enforced by the
 * Layer 4.3 retrospective-quality-gates CI workflow). Catches regressions at
 * commit time so the chronic CI red closed by SD-LEO-INFRA-BULK-ADD-BEGIN-001
 * cannot quietly return.
 *
 * Usage (from .husky/pre-commit STAGE 0.7):
 *   node scripts/check-retro-migrations-wrapped.cjs <file1> <file2> ...
 *
 * Exit codes:
 *   0 — all paths pass (or zero matching files; or all matching files use
 *       CREATE INDEX CONCURRENTLY which is incompatible with explicit transactions)
 *   1 — one or more files lack ^BEGIN; or ^COMMIT; → commit is blocked
 *
 * The workflow's grep contract is line-leading (`grep -L "^BEGIN;"`); same regex
 * is used here so local guard and CI gate agree exactly.
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const files = args.filter((a) => /database\/migrations\/.*retrospective.*\.sql$/i.test(a));

if (files.length === 0) {
  // Empty-set fast path — no retrospective SQL files in this commit.
  process.exit(0);
}

const violations = [];
const concurrentlyExcluded = [];

for (const file of files) {
  const fullPath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(fullPath)) {
    // File deleted in this commit — nothing to validate.
    continue;
  }

  let content;
  try {
    content = fs.readFileSync(fullPath, 'utf8');
  } catch (err) {
    violations.push({ file, missing: ['<read-error: ' + err.message + '>'] });
    continue;
  }

  if (/CREATE\s+INDEX\s+CONCURRENTLY/i.test(content)) {
    // CONCURRENTLY incompatible with explicit transaction — exclude with advisory.
    concurrentlyExcluded.push(file);
    continue;
  }

  const missing = [];
  if (!/^BEGIN;\s*$/m.test(content)) missing.push('BEGIN;');
  if (!/^COMMIT;\s*$/m.test(content)) missing.push('COMMIT;');

  if (missing.length > 0) {
    violations.push({ file, missing });
  }
}

if (concurrentlyExcluded.length > 0) {
  console.log('');
  console.log('  ⚠️  Retrospective SQL files containing CREATE INDEX CONCURRENTLY (excluded from BEGIN/COMMIT check):');
  for (const file of concurrentlyExcluded) {
    console.log('      - ' + file);
  }
  console.log('     CONCURRENTLY is incompatible with explicit transaction wrapping.');
  console.log('     Flag these files for separate handling; Layer 4.3 CI will still fail until resolved.');
  console.log('');
}

if (violations.length > 0) {
  console.error('');
  console.error('❌ BLOCKED: Staged retrospective SQL file(s) missing BEGIN/COMMIT transaction wrapping');
  console.error('');
  console.error('   The Layer 4.3 retrospective-quality-gates CI workflow grep contract requires');
  console.error('   line-leading ^BEGIN; and ^COMMIT; in every database/migrations/*retrospective*.sql file.');
  console.error('   See: .github/workflows/retrospective-quality-gates.yml lines 232,237');
  console.error('');
  for (const { file, missing } of violations) {
    console.error('   File: ' + file);
    console.error('   Missing: ' + missing.join(', '));
    console.error('');
  }
  console.error('   Fix (per-file mode wraps just your offending file(s)):');
  for (const { file } of violations) {
    console.error('     node scripts/one-off/_wrap-retro-migrations.cjs ' + file);
  }
  console.error('   (or add BEGIN; near top + COMMIT; at EOF manually)');
  console.error('');
  console.error('   Emergency bypass (logged): git commit --no-verify');
  console.error('');
  process.exit(1);
}

process.exit(0);
