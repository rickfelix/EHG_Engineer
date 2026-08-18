#!/usr/bin/env node
/**
 * Migration RECENT-gap accountability loop (SD-FDBK-ENH-AUTO-APPLY-MIGRATION-001 FR-2/FR-3).
 *
 * Runs verify-migration-apply-state.mjs --json, diffs the current RECENT gap set against the
 * previously-recorded baseline (scripts/lib/migration-gap-baseline.mjs), and files one feedback
 * row per NEWLY-detected RECENT gap file -- so migration-deploy-drift-guard.yml's existing loud
 * CI failure (::error, non-zero exit) reaches an actionable ticket instead of only CI logs.
 *
 * Deduplication is two-layered:
 *   (1) THIS script only acts on gaps not seen in the prior recorded run (the baseline diff) --
 *       a gap that is still open and already has a ticket is not re-flagged.
 *   (2) emitFeedback's own same-day dedup_hash (lib/governance/emit-feedback.js) additionally
 *       collapses multiple triggers on the SAME day (e.g. a push and the daily cron both firing
 *       near the same new gap) into one row.
 *
 * Usage: node scripts/migration-gap-notify.mjs
 * Always exits 0 -- this is an accountability/notification step, not a second blocking gate.
 * The existing verify-migration-apply-state.mjs --strict --recent-only step (run earlier in
 * migration-deploy-drift-guard.yml) remains the sole blocking check.
 */
import 'dotenv/config';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { emitFeedback } from '../lib/governance/emit-feedback.js';
import { diffNewGaps, loadGapBaseline, saveGapBaseline } from './lib/migration-gap-baseline.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

function gapFileBasename(file) {
  return String(file || '').replace(/^.*[\\/]/, '');
}

function runVerifier() {
  const out = execFileSync(
    process.execPath,
    [path.join(PROJECT_ROOT, 'scripts', 'verify-migration-apply-state.mjs'), '--json'],
    { cwd: PROJECT_ROOT, encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 }
  );
  // The verifier prepends a dotenvx banner (and other diagnostic lines) to stdout before its
  // JSON (pre-existing on origin/main, same quirk seed-migration-dispositions.mjs works around):
  // slice from the first line that is exactly '{' rather than parsing raw.
  const lines = out.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === '{');
  return JSON.parse(lines.slice(start).join('\n'));
}

/**
 * @param {Object} deps - injectable for tests: { supabase, runVerifier, emitFeedback }
 */
export async function notifyNewGaps(deps = {}) {
  const {
    supabase,
    runVerifier: runVerifierDep = runVerifier,
    emitFeedback: emitFeedbackDep = emitFeedback,
  } = deps;

  const state = runVerifierDep();
  const currentRecentFiles = [...new Set((state.recentGaps || []).map((g) => gapFileBasename(g.file)))].sort();

  const baseline = await loadGapBaseline(supabase);
  const newGaps = diffNewGaps(baseline.files, currentRecentFiles);

  const filed = [];
  for (const file of newGaps) {
    const gapEntry = (state.recentGaps || []).find((g) => gapFileBasename(g.file) === file);
    const missing = (gapEntry?.missing || []).map((m) => `${m.cls} ${m.name}`).join(', ') || 'unknown declared object(s)';
    const result = await emitFeedbackDep({
      supabase,
      title: `Migration gap: ${file} not applied live`,
      description: `migration-deploy-drift-guard.yml detected ${file} as a RECENT committed-but-unapplied migration. Missing live: ${missing}. Apply via 'node scripts/apply-migration.js database/migrations/${file} --prod-deploy' (3-factor @approved-by chairman gate) or the Adam-delegated path if in scope, then re-run the drift guard to confirm green.`,
      category: 'harness_backlog',
      severity: 'high',
      dedup_key: file,
      metadata: { migration_gap_file: file, missing_objects: gapEntry?.missing || [] },
    });
    filed.push({ file, ...result });
  }

  await saveGapBaseline(supabase, currentRecentFiles);

  return { currentRecentFiles, priorFiles: baseline.files, newGaps, filed };
}

async function main() {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log('⚠️  [migration-gap-notify] Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY -- skipping (non-blocking)');
    return;
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    const result = await notifyNewGaps({ supabase });
    console.log(`[migration-gap-notify] RECENT gaps: ${result.currentRecentFiles.length} current, ${result.newGaps.length} new`);
    for (const f of result.filed) {
      console.log(`   ${f.deduped ? 'deduped (already filed today)' : `filed feedback ${f.id}`}: ${f.file}`);
    }
  } catch (e) {
    // Notification is an accountability enhancement, not the blocking gate itself -- a failure
    // here must not fail the CI job (the earlier --strict step already carries that contract).
    console.log(`⚠️  [migration-gap-notify] non-fatal error: ${e?.message || e}`);
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main();
}
