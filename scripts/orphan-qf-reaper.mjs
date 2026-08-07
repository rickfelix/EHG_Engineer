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
import { isMainModule } from '../lib/utils/is-main-module.js';
import { resolveGitHubRepo } from '../lib/repo-paths.js';
// QF-20260807-745: the reaper reuses complete-quick-fix's reconcile contract rather than
// restating it. QF-20260725-691 already settled what a merged PR proves at the front door;
// a second, divergent copy here is how the two answers drift apart again.
import { buildMergedReconcileUpdate } from './modules/complete-quick-fix/orchestrator.js';

const SAFETY_WINDOW_MINUTES = Number(process.env.ORPHAN_QF_REAPER_SAFETY_WINDOW_MINUTES || 5);
const DRY_RUN = process.env.ORPHAN_QF_REAPER_DRY_RUN === 'true';

// QF-20260807-745. Landing NON-TERMINAL re-opened a loop the old terminal close hid: a
// witnessed row keeps matching the candidate query, so without this the reaper would
// re-witness the same QF every 15 minutes and append the note to verification_notes
// forever. The old code could not hit this because `completed` removed the row from the
// query — the bug was masked by the very behaviour being fixed.
export const WITNESS_MARKER = 'merge witnessed, SCOPE ACCEPTANCE OUTSTANDING';

export function alreadyWitnessed(qf, prUrl) {
  const notes = qf?.verification_notes;
  if (typeof notes !== 'string' || !notes.includes(WITNESS_MARKER)) return false;
  // Same PR already witnessed → nothing new to record. A DIFFERENT PR on the same QF is
  // new information (the guard-then-fix case) and is allowed through to be recorded.
  return prUrl ? notes.includes(prUrl) : true;
}

function log(action, fields) {
  process.stdout.write(JSON.stringify({ action, ts: new Date().toISOString(), ...fields }) + '\n');
}

function parsePrNumber(prUrl) {
  if (!prUrl || typeof prUrl !== 'string') return null;
  const match = prUrl.match(/\/pull\/(\d+)(?:\D|$)/);
  return match ? Number(match[1]) : null;
}

/**
 * FR-2 (SD-LEO-INFRA-CANONICAL-REPO-APP-001): resolve a QF's target_application to
 * an explicit `owner/repo` -R argument via the canonical resolver, instead of letting
 * `gh` fall back to its ambient cwd/config default (which silently queries the wrong
 * repo for a venture-targeted QF — the QF-726/QF-401 pattern).
 */
export function resolveQfGithubRepo(targetApplication) {
  const repo = resolveGitHubRepo(targetApplication);
  if (!repo) {
    throw new Error(`orphan-qf-reaper: unresolvable target_application "${targetApplication}" — refusing to fall back to an ambient default repo`);
  }
  return repo;
}

function fetchPrState(prNumber, repo) {
  try {
    const raw = execSync(`gh pr view ${prNumber} --json state,mergeCommit,mergedAt -R ${repo}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15_000,
    });
    return { ok: true, data: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, error: err.stderr?.toString() || err.message };
  }
}

export function isValidQfId(id) {
  // FR-5 shell-injection defense for branch-derived path; QF id format set by create-quick-fix.js.
  return typeof id === 'string' && /^QF-\d{8}-\d{3}$/.test(id);
}

function fetchMergedPrByBranch(branchName, repo) {
  try {
    const raw = execSync(
      `gh pr list --head "${branchName}" --state merged --json number,url,mergeCommit,mergedAt --limit 1 -R ${repo}`,
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

export async function main() {
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
    // verification_notes is REQUIRED, not decorative (QF-20260807-745): alreadyWitnessed()
    // reads it to stop re-witnessing every 15 min, and buildMergedReconcileUpdate PREPENDS
    // it — unselected, the guard silently reads undefined and prior notes are overwritten.
    .select('id, status, pr_url, started_at, claiming_session_id, target_application, verification_notes')
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
    skipped_already_witnessed: 0,
    errored: 0,
  };

  for (const qf of candidates || []) {
    const prNumber = parsePrNumber(qf.pr_url);
    if (!prNumber) {
      log('skipped_malformed_pr_url', { qf_id: qf.id, pr_url: qf.pr_url });
      summary.errored += 1;
      continue;
    }

    let repo;
    try {
      repo = resolveQfGithubRepo(qf.target_application);
    } catch (err) {
      log('error_unresolvable_repo', { qf_id: qf.id, target_application: qf.target_application, error: err.message });
      summary.errored += 1;
      continue;
    }

    const pr = fetchPrState(prNumber, repo);
    if (!pr.ok) {
      log('error_gh_pr_view', { qf_id: qf.id, pr_number: prNumber, repo, error: pr.error });
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

    if (alreadyWitnessed(qf, qf.pr_url)) {
      log('skipped_already_witnessed', { qf_id: qf.id, pr_number: prNumber });
      summary.skipped_already_witnessed += 1;
      continue;
    }

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
        // QF-20260807-745: was status:'completed' + force_completed + compliance_verdict:'PASS'.
        // A merged PR witnesses that CODE LANDED; terminal `completed` asserts the QF's SCOPE
        // WAS SATISFIED. The reaper can observe the first and can never establish the second,
        // and the terminal status made complete-quick-fix.js answer already-completed, so the
        // scope-proof gate never ran — the backstop fired first and hid the door it was backing.
        ...buildMergedReconcileUpdate({
          qf,
          prUrl: qf.pr_url,
          mergeSha: mergeCommitSha,
          nowIso: mergedAt,
          scopeAcceptedBy: null, // the reaper is a witness; it is never the attester
        }),
        compliance_details: `Merge witnessed by orphan-qf-reaper (pr_url path, PR #${prNumber}) — NOT a scope acceptance. Attest via complete-quick-fix.js --scope-accepted.`,
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
    .select('id, status, started_at, claiming_session_id, target_application, verification_notes')
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
      if (!isValidQfId(qf.id)) {
        log('skipped_orphan_invalid_id', { qf_id: qf.id });
        summary.errored += 1;
        continue;
      }
      let repo;
      try {
        repo = resolveQfGithubRepo(qf.target_application);
      } catch (err) {
        log('error_unresolvable_repo_orphan', { qf_id: qf.id, target_application: qf.target_application, error: err.message });
        summary.errored += 1;
        continue;
      }

      const branchName = `qf/${qf.id}`;
      const merged = fetchMergedPrByBranch(branchName, repo);
      if (!merged.ok) {
        log('error_gh_pr_list_orphan', { qf_id: qf.id, branch: branchName, repo, error: merged.error });
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

      if (alreadyWitnessed(qf, prUrl)) {
        log('skipped_already_witnessed_orphan', { qf_id: qf.id, pr_number: prNumber, branch: branchName });
        summary.skipped_already_witnessed += 1;
        continue;
      }

      if (DRY_RUN) {
        log('dry_run_would_reconcile_orphan', { qf_id: qf.id, pr_number: prNumber, branch: branchName, merge_commit_sha: mergeCommitSha });
        summary.orphan_reconciled += 1;
        continue;
      }

      const { data: updated, error: updateError } = await supabase
        .from('quick_fixes')
        .update({
          // QF-20260807-745, the incident this fix is named for. This path closed on the FIRST
          // PR merged from branch `qf/<id>` — and guard-then-fix is a normal, sometimes MANDATORY
          // decomposition. On QF-20260804-647 it closed at 17:17Z citing the GUARD PR (which
          // removed zero tax) while the actual fix was still 65 minutes from existing. A reaper
          // that can only say "done" cannot express "PR merged, scope unvouched" — so it said the
          // only thing it knew how to say, and it was wrong.
          ...buildMergedReconcileUpdate({
            qf,
            prUrl,
            mergeSha: mergeCommitSha,
            nowIso: reconciledAt,
            scopeAcceptedBy: null,
          }),
          compliance_details: `Merge witnessed by orphan-qf-reaper (branch-derived path, branch ${branchName}, PR #${prNumber}) — the FIRST merged PR from this branch, which is NOT proof this QF's scope is satisfied. Attest via complete-quick-fix.js --scope-accepted.`,
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

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('orphan-qf-reaper: unhandled error:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
}
