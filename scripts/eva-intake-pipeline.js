#!/usr/bin/env node
/**
 * EVA Intake Pipeline — Single command for the full intake-to-roadmap flow
 *
 * Aligns with the EVA Intake Redesign Vision + Strategic Roadmap Architecture:
 *   Sync → Classify → Chairman Review → Propose Waves → Status
 *
 * Vision principle: "Build-ready doesn't mean build now"
 *   Classify → Chairman Review → Group/Cluster → Research SDs → THEN build decisions
 *
 * Usage:
 *   npm run eva:intake:pipeline                    # Full pipeline
 *   npm run eva:intake:pipeline -- --dry-run       # Preview only, no DB writes
 *   npm run eva:intake:pipeline -- --from-step N   # Start from step N (1-6)
 *   npm run eva:intake:pipeline -- --skip-sync     # Skip sync, start at classify
 *   npm run eva:intake:pipeline -- --skip-review   # Skip chairman review step
 *   npm run eva:intake:pipeline -- --app <app>     # Filter clustering by application
 *   npm run eva:intake:pipeline -- --skip-archive  # Skip archiving processed items
 *
 * Post-pipeline (separate Chairman actions):
 *   npm run roadmap:approve -- --roadmap-id <id>   # Chairman reviews + approves waves
 *   npm run roadmap:promote -- --wave-id <id>      # Promote approved wave to SDs
 *   npm run roadmap:status                          # View current roadmap
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skipSync = args.includes('--skip-sync');
const skipArchive = args.includes('--skip-archive');
const skipReview = args.includes('--skip-review');
const fromStepIdx = args.indexOf('--from-step');
const fromStep = fromStepIdx >= 0 ? parseInt(args[fromStepIdx + 1], 10) || 1 : 1;
const appIdx = args.indexOf('--app');
const appFilter = appIdx >= 0 ? args[appIdx + 1] : '';

function run(cmd, env = {}) {
  try {
    execSync(cmd, {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, ...env },
      timeout: 600_000,
    });
    return true;
  } catch {
    return false;
  }
}

function header(step, title) {
  console.log(`\n── Step ${step}: ${title} ──\n`);
}

console.log('');
console.log('══════════════════════════════════════════════════════');
console.log('  EVA INTAKE PIPELINE');
console.log('  Sync → Classify → Chairman Review → Propose Waves → Archive → Status');
console.log('══════════════════════════════════════════════════════');

// ─── Step 1: Sync ───────────────────────────────────────────
if (fromStep <= 1 && !skipSync) {
  header(1, 'Sync from Todoist + YouTube');
  if (dryRun) {
    console.log('  [DRY RUN] Would run: node scripts/eva-idea-sync.js\n');
  } else {
    const ok = run('node scripts/eva-idea-sync.js');
    if (!ok) {
      console.error('  ⚠ Sync failed. Continuing with existing items.\n');
    }
  }
} else {
  console.log('\n── Step 1: Sync ── SKIPPED\n');
}

// ─── Step 2: Classify ───────────────────────────────────────
if (fromStep <= 2) {
  header(2, 'Classify unclassified items (AI)');
  if (dryRun) {
    run('node scripts/eva-intake-classify.js --stats');
  } else {
    // Force cloud LLM — local Ollama can't produce parseable JSON for classification
    const ok = run('node scripts/eva-intake-classify.js --batch --limit 500', {
      USE_LOCAL_LLM: 'false',
    });
    if (!ok) {
      console.error('  ⚠ Classification had errors. Check output above.\n');
    }
    console.log('');
    run('node scripts/eva-intake-classify.js --stats');
  }
} else {
  console.log('\n── Step 2: Classify ── SKIPPED\n');
}

// ─── Step 3: Chairman Review ─────────────────────────────────
if (fromStep <= 3 && !skipReview) {
  header(3, 'Chairman intake review');
  const reviewFlags = dryRun ? ' --dry-run' : '';
  const ok = run(`node scripts/eva/chairman-intake-review.js${reviewFlags}`);
  if (!ok) {
    console.error('  ⚠ Chairman review had errors. Check output above.\n');
  }
} else {
  console.log('\n── Step 3: Chairman Review ── SKIPPED\n');
}

// ─── Step 4: Propose waves ──────────────────────────────────
if (fromStep <= 4) {
  header(4, 'Propose roadmap waves (AI clustering)');

  // --respect-locks is on by default in roadmap-generate.js; pipeline does not pass --force-reassign
  const generateCmd = appFilter
    ? `node scripts/roadmap-generate.js --app ${appFilter}${dryRun ? ' --dry-run' : ''}`
    : `node scripts/roadmap-generate.js${dryRun ? ' --dry-run' : ''}`;

  const ok = run(generateCmd, { USE_LOCAL_LLM: 'false' });
  if (!ok) {
    console.error('  ⚠ Wave clustering failed. Check output above.\n');
  }
} else {
  console.log('\n── Step 4: Propose ── SKIPPED\n');
}

// ─── Step 5: Archive ────────────────────────────────────────
if (fromStep <= 5 && !skipArchive) {
  header(5, 'Archive processed items');
  if (dryRun) {
    console.log('  [DRY RUN] Would move classified items to Processed (Todoist project + YouTube playlist)\n');
  } else {
    const ok = run('node scripts/eva-intake-archive.js');
    if (!ok) {
      console.error('  ⚠ Archive had errors. Items remain in source. Check output above.\n');
    }
  }
} else {
  console.log('\n── Step 5: Archive ── SKIPPED\n');
}

// ─── Step 6: Status ─────────────────────────────────────────
if (fromStep <= 6) {
  header(6, 'Roadmap status');
  run('node scripts/roadmap-status.js');
} else {
  console.log('\n── Step 6: Status ── SKIPPED\n');
}

// ─── Summary ────────────────────────────────────────────────
console.log('');
console.log('══════════════════════════════════════════════════════');
console.log('  PIPELINE COMPLETE');
console.log('══════════════════════════════════════════════════════');
console.log('');
console.log('  Chairman review (next steps):');
console.log('    View roadmap:     npm run roadmap:status');
console.log('    Approve waves:    npm run roadmap:approve -- --roadmap-id <id>');
console.log('    Promote to SDs:   npm run roadmap:promote -- --wave-id <id>');
console.log('');
