// Dead Script Archival - SD-LEO-INFRA-DEAD-SCRIPT-ARCHIVAL-001
// Moves one-off scripts to scripts/archive/one-time/
// Consolidates archived directories
// Removes tmp/debug files
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SCRIPTS_DIR = path.join(__dirname);
const ARCHIVE_DIR = path.join(SCRIPTS_DIR, 'archive', 'one-time');
const ARCHIVE_TESTS_DIR = path.join(ARCHIVE_DIR, 'tests');

// Protected scripts that must NOT be moved (referenced in package.json or imported)
const PROTECTED = new Set([
  'add-prd-to-database.js', 'add-sd-to-database.js', 'agent-reconciliation-audit.js',
  'audit-dormant-tables.js', 'audit-enum-coverage.js', 'audit-retro.mjs',
  'audit-rls-policies.js', 'audit-to-sd.mjs', 'auto-extract-patterns-from-retro.js',
  'backfill-pattern-subagents.js', 'baseline.js', 'brainstorm-pipeline-health.js',
  'capability-analyzer.js', 'chairman-dashboard.js', 'chairman-seed-data.js',
  'check-directives-data.js', 'check-handoff-compliance.js', 'check-jsonb-integrity.js',
  'check-leo-version.js', 'child-sd-preflight.js', 'claude-code-release-check.js',
  'claude-session-coordinator.mjs', 'cleanup-passing-traces.js', 'cleanup-root-temp-files.js',
  'cli.cjs', 'context-monitor.js', 'create-department.js', 'cross-platform-run.js',
  'decision-audit.js', 'department-hierarchy.cjs', 'design-quality-scorecard.js',
  'detect-duplicate-docs.js', 'detect-stale-patterns.js', 'discover-schema-constraints.js',
  'doc-health-report.js', 'docmon.js', 'docmon-validate.js',
  'eva-decisions.js', 'eva-dlq-replay.js', 'eva-events-status.js',
  'eva-health-check.cjs', 'eva-idea-evaluate.js', 'eva-idea-post-process.js',
  'eva-idea-status.js', 'eva-idea-sync.js', 'eva-intake-classify.js',
  'eva-intake-pipeline.js', 'eva-intake-refine.js', 'eva-recovery-status.js',
  'eva-run.js', 'eva-scheduler.js', 'eva-services-status.js',
  'eva-venture-new.js', 'eva-youtube-auth.js', 'exec-commit-gate.js',
  'execute-database-sql.js', 'execute-subagent.js', 'execute-untrack-manifest.js',
  'feedback-staleness-check.js', 'fix-prd-scripts.js', 'gate-health-check.js',
  'generate-agent-md-from-db.js', 'generate-boundary-examples.js',
  'generate-claude-md-from-db.js', 'generate-doc-metadata.js',
  'generate-file-trees.js', 'generate-playground-config.cjs',
  'generate-schema-docs-from-db.js', 'generate-session-prologue.js',
  'generate-untrack-manifest.js', 'generate-workflow-docs.js',
  'git-commit-recovery.js', 'governance.js', 'handoff.js',
  'heal-empty-metrics.js', 'human-like-e2e-retrospective.js',
  'ingest-audit-file.mjs', 'ingest-lessons-learned-markdown.js',
  'inject-doc-metadata.js', 'install-doc-validation-hooks.js',
  'lead-dossier.js', 'leo.js', 'leo-analytics.js',
  'leo-artifact-cleaner.js', 'leo-audit.js', 'leo-auto-init.js',
  'leo-cleanup.js', 'leo-continuous.js', 'leo-continuous-prompt.js',
  'leo-genesis-branches.js', 'leo-hook-feedback.js', 'leo-maintenance.js',
  'leo-orchestrator-enforced.js', 'leo-refresh.js', 'leo-search.mjs',
  'leo-status-line.js', 'leo-summary.mjs', 'list-departments.cjs',
  'llm-audit.js', 'llm-canary-control.js', 'manage-department-agents.cjs',
  'manage-department-capabilities.cjs', 'migration-stats.js',
  'new-strategic-directive.js', 'oiv-validate.js', 'okr-priority-sync.js',
  'pattern-alert-sd-creator.js', 'pattern-maintenance.js',
  'phase-preflight.js', 'pipeline-status.js', 'prd-diagnostic-toolkit.js',
  'prd-format-validator.js', 'proposal-manage.js', 'protocol-improvements.js',
  'rca-learning-ingestion.js', 'register-app.js', 'resolve-pattern.js',
  'retroactive-gap-analysis.js', 'roadmap-generate.js', 'roadmap-promote.js',
  'roadmap-status.js', 'root-cause-agent.js', 'run-leo.cjs',
  'schema-snapshot.js', 'sd-baseline.js', 'sd-baseline-deactivate.js',
  'sd-baseline-intelligent.js', 'sd-burnrate.js', 'sd-from-feedback.js',
  'sd-next.js', 'sd-query.js', 'sd-start.js', 'sd-status.js', 'sd-verify.js',
  'security-audit-dashboard.js', 'separability-delta.js', 'session-worktree.js',
  'setup-database.js', 'setup-database-supabase.js', 'setup-global-hooks.cjs',
  'ship-preflight.js', 'show-budget-status.js', 'skill-audit.js',
  'story-requirements-template.js', 'strategy-objectives.js',
  'switch-context.js', 'sync-context-usage.js', 'sync-github.js',
  'sync-manager.js', 'sync-pattern-triggers.js', 'sync-supabase.js',
  'test-automation.js', 'test-database.js', 'test-feedback-loop-integration.js',
  'test-pipeline-smoke.js', 'test-result-capture.js', 'test-scanner.js',
  'test-selection.js', 'test-validate-system.js', 'token-logger.js',
  'unified-consolidated-prd.js', 'update-directive-status.js',
  'validate-audit-file.mjs', 'validate-doc-links.js', 'validate-doc-location.js',
  'validate-doc-metadata.js', 'validate-doc-naming.js', 'validate-doc-staged.js',
  'validate-story-test-mapping.js', 'venture-proving-companion.js',
  'view-memory.js', 'wsjf-priority-fetcher.js',
  // Also protect this archival script and other infrastructure
  'archive-dead-scripts.cjs', 'leo-create-sd.js', 'leo-history.mjs',
  'create-quick-fix.js', 'get-working-on-sd.js', 'multi-repo-status.js',
  'orchestrator-preflight.js', 'unified-handoff-system-v2.js',
  'handoff-validator.js', 'handoff-import.cjs', 'handoff-export.cjs',
]);

// Patterns to archive (one-off scripts)
const ONE_OFF_PATTERNS = [
  /^accept-/,
  /^create-.*prd/i,
  /^create-.*section/i,
  /^create-.*handoff/i,
  /^create-.*gate/i,
  /^create-.*retro/i,
  /^create-.*sd-/i,
  /^activate-/,
  /^fix-.*(?!prd-scripts)/,  // fix-* but not fix-prd-scripts
  /^migrate-/,
  /^setup-.*(?!database|global)/,  // setup-* but not setup-database or setup-global
];

// Test script patterns (ad-hoc tests, not CI-referenced)
const TEST_PATTERNS = [
  /^test-.*(?!automation|database|feedback|pipeline|result|scanner|selection|validate)/,
];

const dryRun = process.argv.includes('--dry-run');
const mode = dryRun ? 'DRY RUN' : 'LIVE';

console.log(`\n=== Dead Script Archival (${mode}) ===\n`);

// Step 1: Get all root-level scripts
const allFiles = fs.readdirSync(SCRIPTS_DIR)
  .filter(f => /\.(js|mjs|cjs)$/.test(f) && fs.statSync(path.join(SCRIPTS_DIR, f)).isFile());

console.log(`Total scripts at root: ${allFiles.length}`);
console.log(`Protected scripts: ${PROTECTED.size}`);

// Step 2: Categorize
const toArchive = [];
const toArchiveTests = [];
const toRemove = [];

for (const file of allFiles) {
  if (PROTECTED.has(file)) continue;

  // tmp-* and debug-* -> remove
  if (/^(tmp-|debug-)/.test(file)) {
    toRemove.push(file);
    continue;
  }

  // test-* (not protected) -> archive tests
  if (/^test-/.test(file) && !PROTECTED.has(file)) {
    toArchiveTests.push(file);
    continue;
  }

  // One-off patterns -> archive
  if (ONE_OFF_PATTERNS.some(p => p.test(file))) {
    if (!PROTECTED.has(file)) {
      toArchive.push(file);
    }
    continue;
  }

  // create-* (not protected and not the main create scripts)
  if (/^create-/.test(file) && !PROTECTED.has(file)) {
    toArchive.push(file);
    continue;
  }

  // add-* (not protected)
  if (/^add-/.test(file) && !PROTECTED.has(file)) {
    toArchive.push(file);
    continue;
  }
}

console.log(`\nTo archive (one-time): ${toArchive.length}`);
console.log(`To archive (tests): ${toArchiveTests.length}`);
console.log(`To remove (tmp/debug): ${toRemove.length}`);
console.log(`Expected new root count: ${allFiles.length - toArchive.length - toArchiveTests.length - toRemove.length}`);

if (dryRun) {
  console.log('\n--- Would archive (one-time) ---');
  toArchive.slice(0, 20).forEach(f => console.log('  ' + f));
  if (toArchive.length > 20) console.log(`  ... and ${toArchive.length - 20} more`);

  console.log('\n--- Would archive (tests) ---');
  toArchiveTests.slice(0, 20).forEach(f => console.log('  ' + f));
  if (toArchiveTests.length > 20) console.log(`  ... and ${toArchiveTests.length - 20} more`);

  console.log('\n--- Would remove (tmp/debug) ---');
  toRemove.forEach(f => console.log('  ' + f));

  console.log('\n--- Archived directories to consolidate ---');
  const archivedDirs = fs.readdirSync(SCRIPTS_DIR)
    .filter(f => f.startsWith('archived-') && fs.statSync(path.join(SCRIPTS_DIR, f)).isDirectory());
  archivedDirs.forEach(d => {
    const count = fs.readdirSync(path.join(SCRIPTS_DIR, d)).length;
    console.log(`  ${d}/ (${count} files)`);
  });

  process.exit(0);
}

// Step 3: Create directories
fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
fs.mkdirSync(ARCHIVE_TESTS_DIR, { recursive: true });

// Step 4: Move one-off scripts
let moved = 0;
for (const file of toArchive) {
  const src = path.join(SCRIPTS_DIR, file);
  const dst = path.join(ARCHIVE_DIR, file);
  try {
    execSync(`git mv "${src}" "${dst}"`, { cwd: path.dirname(SCRIPTS_DIR), stdio: 'pipe' });
    moved++;
  } catch (e) {
    // Fallback to fs.rename if not tracked
    try {
      fs.renameSync(src, dst);
      moved++;
    } catch (e2) {
      console.error(`  Failed to move: ${file} - ${e2.message}`);
    }
  }
}
console.log(`Moved ${moved} one-off scripts to archive/one-time/`);

// Step 5: Move test scripts
let movedTests = 0;
for (const file of toArchiveTests) {
  const src = path.join(SCRIPTS_DIR, file);
  const dst = path.join(ARCHIVE_TESTS_DIR, file);
  try {
    execSync(`git mv "${src}" "${dst}"`, { cwd: path.dirname(SCRIPTS_DIR), stdio: 'pipe' });
    movedTests++;
  } catch (e) {
    try {
      fs.renameSync(src, dst);
      movedTests++;
    } catch (e2) {
      console.error(`  Failed to move test: ${file} - ${e2.message}`);
    }
  }
}
console.log(`Moved ${movedTests} test scripts to archive/one-time/tests/`);

// Step 6: Remove tmp/debug
let removed = 0;
for (const file of toRemove) {
  const src = path.join(SCRIPTS_DIR, file);
  try {
    execSync(`git rm "${src}"`, { cwd: path.dirname(SCRIPTS_DIR), stdio: 'pipe' });
    removed++;
  } catch (e) {
    try {
      fs.unlinkSync(src);
      removed++;
    } catch (e2) {
      console.error(`  Failed to remove: ${file} - ${e2.message}`);
    }
  }
}
console.log(`Removed ${removed} tmp/debug scripts`);

// Step 7: Consolidate archived-* directories
const ARCHIVE_BASE = path.join(SCRIPTS_DIR, 'archive');
const archivedDirs = [
  { src: 'archived-prd-scripts', dst: 'prd-scripts' },
  { src: 'archived-handoffs', dst: 'handoffs' },
  { src: 'archived-sd-scripts', dst: 'sd-scripts' },
  { src: 'archived-migrations', dst: 'migrations' },
];

for (const { src, dst } of archivedDirs) {
  const srcPath = path.join(SCRIPTS_DIR, src);
  const dstPath = path.join(ARCHIVE_BASE, dst);
  if (fs.existsSync(srcPath)) {
    try {
      fs.mkdirSync(dstPath, { recursive: true });
      execSync(`git mv "${srcPath}" "${dstPath}"`, { cwd: path.dirname(SCRIPTS_DIR), stdio: 'pipe' });
      console.log(`Consolidated ${src}/ -> archive/${dst}/`);
    } catch (e) {
      // git mv of dirs can fail, try moving contents
      try {
        const files = fs.readdirSync(srcPath);
        for (const f of files) {
          try {
            execSync(`git mv "${path.join(srcPath, f)}" "${path.join(dstPath, f)}"`, { cwd: path.dirname(SCRIPTS_DIR), stdio: 'pipe' });
          } catch {
            fs.renameSync(path.join(srcPath, f), path.join(dstPath, f));
          }
        }
        // Remove empty source dir
        if (fs.readdirSync(srcPath).length === 0) {
          fs.rmdirSync(srcPath);
        }
        console.log(`Consolidated ${src}/ -> archive/${dst}/ (file-by-file)`);
      } catch (e2) {
        console.error(`  Failed to consolidate ${src}/: ${e2.message}`);
      }
    }
  }
}

// Final count
const finalFiles = fs.readdirSync(SCRIPTS_DIR)
  .filter(f => /\.(js|mjs|cjs)$/.test(f) && fs.statSync(path.join(SCRIPTS_DIR, f)).isFile());
console.log(`\n=== RESULTS ===`);
console.log(`Root scripts: ${allFiles.length} -> ${finalFiles.length}`);
console.log(`Archived: ${moved + movedTests}`);
console.log(`Removed: ${removed}`);
