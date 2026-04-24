#!/usr/bin/env node
/**
 * orphan-qf-reaper — find quick_fixes rows whose PRs have already been merged
 * on GitHub but whose DB row never flipped to status='completed', and reconcile
 * them idempotently.
 *
 * SD-LEO-INFRA-LIFECYCLE-RECONCILIATION-ORPHAN-001 (FR1)
 *
 * Triggered by:
 *   - Scheduled GitHub Action (every 15 min, see .github/workflows/orphan-qf-reaper.yml)
 *   - Manual dispatch from the same workflow
 *   - Local operator running `node scripts/orphan-qf-reaper.mjs`
 *
 * Design notes:
 *   - Complementary to QF-20260423-380: that QF filters pr_url IS NULL in
 *     loadOpenQuickFixes to hide pre-merge races. This script cleans up the
 *     post-merge window where complete-quick-fix.js was bypassed.
 *   - 5-minute safety window prevents racing complete-quick-fix.js when a
 *     session is legitimately in the middle of the multi-step flow.
 *   - All UPDATEs are idempotent: .eq('status', current_status) guards prevent
 *     double-writes; re-running on already-completed rows is a no-op.
 *   - Exit 0 even when individual row lookups fail (logged per-row); exit 1
 *     only on hard failure (unauthenticated gh, unreachable Supabase).
 */

import 'dotenv/config';
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const SAFETY_WINDOW_MINUTES = Number(process.env.ORPHAN_QF_REAPER_SAFETY_WINDOW_MINUTES || 5);
const DRY_RUN = process.env.ORPHAN_QF_REAPER_DRY_RUN === 'true';

function log(action, fields) {
  process.stdout.write(JSON.stringify({ action, ts: new Date().toISOString(), ...fields }) + '\n');
}

function parsePrNumber(prUrl) {
  if (!prUrl || typeof prUrl !== 'string') return null;
  const match = prUrl.match(/\/pull\/(\d+)(?:\D|$)/);
  return match ? Number(match[1]) : null;
}

function fetchPrState(prNumber) {
  try {
    const raw = execSync(`gh pr view ${prNumber} --json state,mergeCommit,mergedAt`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15_000,
    });
    return { ok: true, data: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, error: err.stderr?.toString() || err.message };
  }
}

function assertGhAuthenticated() {
  try {
    execSync('gh auth status', { stdio: ['ignore', 'pipe', 'pipe'], timeout: 5_000 });
  } catch (err) {
    console.error('orphan-qf-reaper: gh CLI not authenticated.');
    console.error('  Remediation: run `gh auth login` locally, or set GH_TOKEN in the workflow.');
    process.exit(1);
  }
}

async function main() {
  assertGhAuthenticated();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('orphan-qf-reaper: missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  const cutoffIso = new Date(Date.now() - SAFETY_WINDOW_MINUTES * 60_000).toISOString();

  const { data: candidates, error: queryError } = await supabase
    .from('quick_fixes')
    .select('id, status, pr_url, started_at, claiming_session_id')
    .in('status', ['open', 'in_progress'])
    .not('pr_url', 'is', null)
    .lt('started_at', cutoffIso)
    .limit(100);

  if (queryError) {
    console.error('orphan-qf-reaper: candidate query failed:', queryError.message);
    process.exit(1);
  }

  const summary = {
    evaluated: (candidates || []).length,
    reconciled: 0,
    skipped_pr_not_merged: 0,
    skipped_pr_not_found: 0,
    skipped_already_completed: 0,
    errored: 0,
  };

  for (const qf of candidates || []) {
    const prNumber = parsePrNumber(qf.pr_url);
    if (!prNumber) {
      log('skipped_malformed_pr_url', { qf_id: qf.id, pr_url: qf.pr_url });
      summary.errored += 1;
      continue;
    }

    const pr = fetchPrState(prNumber);
    if (!pr.ok) {
      log('error_gh_pr_view', { qf_id: qf.id, pr_number: prNumber, error: pr.error });
      summary.errored += 1;
      continue;
    }

    if (pr.data.state !== 'MERGED') {
      log('skipped_pr_not_merged', { qf_id: qf.id, pr_number: prNumber, pr_state: pr.data.state });
      summary.skipped_pr_not_merged += 1;
      continue;
    }

    const mergeCommitSha = pr.data.mergeCommit?.oid || null;
    const mergedAt = pr.data.mergedAt || new Date().toISOString();

    if (DRY_RUN) {
      log('dry_run_would_reconcile', { qf_id: qf.id, pr_number: prNumber, merge_commit_sha: mergeCommitSha });
      summary.reconciled += 1;
      continue;
    }

    // Idempotent update: .eq('status', qf.status) guards against concurrent
    // complete-quick-fix.js completing the row between our query and update.
    const { data: updated, error: updateError } = await supabase
      .from('quick_fixes')
      .update({
        status: 'completed',
        completed_at: mergedAt,
        commit_sha: mergeCommitSha,
        compliance_verdict: 'PASS',
        compliance_details: 'Auto-reconciled by orphan-qf-reaper — PR merged on GitHub without complete-quick-fix.js flipping DB status.',
        metadata: { closed_by: 'orphan_reaper', reconciled_at: new Date().toISOString() },
      })
      .eq('id', qf.id)
      .eq('status', qf.status)
      .select('id, status')
      .single();

    if (updateError) {
      log('error_update', { qf_id: qf.id, pr_number: prNumber, error: updateError.message });
      summary.errored += 1;
      continue;
    }

    if (!updated) {
      // Row moved out of open/in_progress between query and update — benign race
      log('skipped_already_completed', { qf_id: qf.id, pr_number: prNumber });
      summary.skipped_already_completed += 1;
      continue;
    }

    log('reconciled', { qf_id: qf.id, pr_number: prNumber, merge_commit_sha: mergeCommitSha });
    summary.reconciled += 1;
  }

  log('summary', summary);
  process.exit(0);
}

main().catch((err) => {
  console.error('orphan-qf-reaper: unhandled error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
