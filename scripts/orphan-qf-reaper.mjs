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
 *   - Two reconciliation paths:
 *       (a) pr_url-populated: parse PR number, fetch state via `gh pr view`.
 *       (b) pr_url=null + claiming_session_id set: derive branch as `qf/<id>`
 *           and look up the merged PR via `gh pr list --head ...`. Covers QFs
 *           that bypassed complete-quick-fix.js entirely (e.g. wedge under
 *           --non-interactive per QF-20260508-230 retro). 6th-witness fix for
 *           PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 (QF-20260508-911).
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

function fetchMergedPrByBranch(branchName) {
  try {
    const raw = execSync(
      `gh pr list --head "${branchName}" --state merged --json number,url,mergeCommit,mergedAt --limit 1`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000 },
    );
    const arr = JSON.parse(raw);
    return { ok: true, data: Array.isArray(arr) && arr.length > 0 ? arr[0] : null };
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
    orphan_evaluated: 0,
    orphan_reconciled: 0,
    orphan_skipped_no_merged_pr: 0,
    orphan_skipped_already_completed: 0,
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

  // Second candidate path: QFs whose PR was merged via a path that never
  // populated pr_url (e.g. complete-quick-fix.js wedged under --non-interactive
  // per QF-20260508-230 retro). Resolve via `qf/<id>` branch convention.
  const { data: orphanCandidates, error: orphanQueryError } = await supabase
    .from('quick_fixes')
    .select('id, status, started_at, claiming_session_id')
    .in('status', ['open', 'in_progress'])
    .is('pr_url', null)
    .not('claiming_session_id', 'is', null)
    .lt('started_at', cutoffIso)
    .limit(100);

  if (orphanQueryError) {
    log('error_orphan_query', { error: orphanQueryError.message });
  } else {
    summary.orphan_evaluated = (orphanCandidates || []).length;
    for (const qf of orphanCandidates || []) {
      const branchName = `qf/${qf.id}`;
      const merged = fetchMergedPrByBranch(branchName);
      if (!merged.ok) {
        log('error_gh_pr_list_orphan', { qf_id: qf.id, branch: branchName, error: merged.error });
        summary.errored += 1;
        continue;
      }
      if (!merged.data) {
        log('skipped_orphan_no_merged_pr', { qf_id: qf.id, branch: branchName });
        summary.orphan_skipped_no_merged_pr += 1;
        continue;
      }

      const { number: prNumber, url: prUrl, mergeCommit, mergedAt } = merged.data;
      const mergeCommitSha = mergeCommit?.oid || null;
      const reconciledAt = mergedAt || new Date().toISOString();

      if (DRY_RUN) {
        log('dry_run_would_reconcile_orphan', { qf_id: qf.id, pr_number: prNumber, branch: branchName, merge_commit_sha: mergeCommitSha });
        summary.orphan_reconciled += 1;
        continue;
      }

      const { data: updated, error: updateError } = await supabase
        .from('quick_fixes')
        .update({
          status: 'completed',
          completed_at: reconciledAt,
          commit_sha: mergeCommitSha,
          pr_url: prUrl,
          compliance_verdict: 'PASS',
          compliance_details: 'Auto-reconciled by orphan-qf-reaper (branch-derived path) — PR merged on GitHub without pr_url ever populated.',
          metadata: { closed_by: 'orphan_reaper_branch_derived', reconciled_at: new Date().toISOString() },
        })
        .eq('id', qf.id)
        .eq('status', qf.status)
        .select('id, status')
        .single();

      if (updateError) {
        log('error_update_orphan', { qf_id: qf.id, pr_number: prNumber, error: updateError.message });
        summary.errored += 1;
        continue;
      }

      if (!updated) {
        log('skipped_orphan_already_completed', { qf_id: qf.id, pr_number: prNumber });
        summary.orphan_skipped_already_completed += 1;
        continue;
      }

      log('reconciled_orphan', { qf_id: qf.id, pr_number: prNumber, branch: branchName, merge_commit_sha: mergeCommitSha });
      summary.orphan_reconciled += 1;
    }
  }

  log('summary', summary);
  process.exit(0);
}

main().catch((err) => {
  console.error('orphan-qf-reaper: unhandled error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
