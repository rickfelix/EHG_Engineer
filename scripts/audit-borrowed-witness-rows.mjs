#!/usr/bin/env node
/**
 * Bounded retroactive audit (SD-FDBK-FIX-WITNESS-LOOKUP-MATCHES-001, FR-3).
 *
 * Read-only. Scoped to trust_tier='trusted' repos only (the only repos where
 * P2's witness result could have gated a real auto-merge decision via
 * lib/ship/venture-trust-gate.mjs). For every merged PR in a trusted repo,
 * replicates the PRE-FIX query exactly (most-recent row for that pr_number,
 * across ALL branches -- NOT "own branch wins if it exists": a PR whose own
 * row is verdict='block'/'fail' could still have been borrow-passed if a
 * NEWER same-pr_number row from a different branch existed, since the pre-fix
 * lookup was order-by-created_at-desc-limit-1). If that most-recent row's
 * branch differs from the PR's own branch AND its verdict is 'pass', it's a
 * "borrowed-row" candidate — evidence the pre-fix pr_number-only lookup could
 * have witness-passed it off another repo's (or branch's) review.
 *
 * This audit reports findings; it does NOT auto-remediate anything.
 *
 * Usage: node scripts/audit-borrowed-witness-rows.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: ship_review_findings has no filter
// below (whole-table read) and this audit's own thoroughness concern (a missed older row hides
// a real borrow) makes silent truncation especially dangerous here — paginate.
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

function listMergedPRs(repo) {
  try {
    const out = execFileSync('gh', ['pr', 'list', '-R', repo, '--state', 'merged', '--limit', '200', '--json', 'number,headRefName,mergedAt'], { encoding: 'utf-8' });
    return JSON.parse(out);
  } catch (e) {
    console.warn(`[audit] gh pr list failed for ${repo} (non-fatal, skipping): ${e?.message || e}`);
    return null;
  }
}

export async function runAudit({ supabase } = {}) {
  const sb = supabase || createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: apps, error: appsErr } = await sb.from('applications').select('github_repo').eq('trust_tier', 'trusted').not('github_repo', 'is', null);
  if (appsErr) throw new Error(`applications query failed: ${appsErr.message}`);
  const trustedRepos = (apps || []).map((r) => r.github_repo.replace(/\.git$/i, ''));

  let findings;
  try {
    findings = await fetchAllPaginated(() => sb.from('ship_review_findings')
      .select('id, pr_number, branch, verdict, sd_key, created_at')
      .order('id', { ascending: true })); // unique tiebreaker (FR-6)
  } catch (e) {
    throw new Error(`ship_review_findings query failed: ${e.message}`);
  }

  const report = { trustedRepos, checkedPRs: 0, borrowedRowCandidates: [], chronologicallyImpossible: [], skippedRepos: [] };

  for (const repo of trustedRepos) {
    const prs = listMergedPRs(repo);
    if (prs === null) { report.skippedRepos.push(repo); continue; }
    for (const pr of prs) {
      report.checkedPRs++;
      const allRowsForPr = (findings || []).filter((f) => f.pr_number === pr.number);

      // Replicate the PRE-FIX query exactly: .eq('pr_number', prNumber).order('created_at', desc).limit(1)
      // -- most-recent-row-wins, across ALL branches, not "own branch wins if it exists". A PR whose own
      // row is verdict='block' can still have been borrow-passed if a NEWER same-pr_number row from a
      // different branch existed -- skipping on "has an own row" (regardless of its verdict/recency)
      // missed exactly that case.
      //
      // CRITICAL (adversarial PR review): the pre-fix query only ever saw rows that existed AT THE
      // MOMENT of merge. Naively sorting ALL rows (including ones inserted long after, by unrelated
      // later SDs) and only checking whether that single globally-newest row postdates the merge is
      // WRONG -- it can silently hide a genuinely earlier, real exposure: if row A (cross-branch,
      // pass, created before the merge -- a real historical borrow) and row B (cross-branch, pass,
      // created after the merge -- irrelevant) both exist for the same pr_number, sorting picks B,
      // sees it postdates the merge, and reports "not a real exposure" -- while A, the actual
      // pre-fix-vulnerable row, is never examined or reported at all. Scope the candidate pool to
      // rows that existed AT OR BEFORE mergedAt (when known) before taking the most-recent one.
      const rowsAtMergeTime = pr.mergedAt
        ? allRowsForPr.filter((f) => new Date(f.created_at) <= new Date(pr.mergedAt))
        : allRowsForPr;
      const mostRecentAtMergeTime = [...rowsAtMergeTime].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

      const ownRow = allRowsForPr.find((f) => f.branch === pr.headRefName);

      if (mostRecentAtMergeTime && mostRecentAtMergeTime.branch !== pr.headRefName && mostRecentAtMergeTime.verdict === 'pass') {
        // A real (or, for merges predating this migration's field, still-live) borrowed-row exposure:
        // this donor genuinely existed at or before merge time and would have been selected.
        report.borrowedRowCandidates.push({
          repo, prNumber: pr.number, ownBranch: pr.headRefName, mergedAt: pr.mergedAt,
          hasOwnRow: Boolean(ownRow), ownVerdict: ownRow?.verdict ?? null,
          donorBranch: mostRecentAtMergeTime.branch, donorSdKey: mostRecentAtMergeTime.sd_key, donorCreatedAt: mostRecentAtMergeTime.created_at,
        });
        continue;
      }

      // No genuine at-merge-time exposure. If today's globally-most-recent row is cross-branch+pass
      // and postdates the merge, it's exactly the chronologically-impossible false-alarm class this
      // fix targets -- report it for transparency (QF-20260713-691: 14/17 raw candidates were this).
      const mostRecentToday = [...allRowsForPr].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      if (
        mostRecentToday && mostRecentToday.branch !== pr.headRefName && mostRecentToday.verdict === 'pass'
        && pr.mergedAt && new Date(mostRecentToday.created_at) > new Date(pr.mergedAt)
      ) {
        report.chronologicallyImpossible.push({
          repo, prNumber: pr.number, ownBranch: pr.headRefName, mergedAt: pr.mergedAt,
          hasOwnRow: Boolean(ownRow), ownVerdict: ownRow?.verdict ?? null,
          donorBranch: mostRecentToday.branch, donorSdKey: mostRecentToday.sd_key, donorCreatedAt: mostRecentToday.created_at,
        });
      }
    }
  }

  return report;
}

function printReport(report) {
  console.log(`[audit] trusted repos: ${report.trustedRepos.join(', ') || '(none)'}`);
  if (report.skippedRepos.length > 0) {
    console.log(`[audit] SKIPPED (gh pr list failed): ${report.skippedRepos.join(', ')}`);
  }
  console.log(`[audit] merged PRs checked: ${report.checkedPRs}`);
  if (report.chronologicallyImpossible.length > 0) {
    console.log(`[audit] FILTERED (chronologically impossible -- donor row postdates the PR's own merge, could not have been returned at merge time): ${report.chronologicallyImpossible.length}`);
    for (const c of report.chronologicallyImpossible) {
      console.log(`  - ${c.repo} PR#${c.prNumber} merged ${c.mergedAt}, donor row created ${c.donorCreatedAt} (${c.donorSdKey ?? 'no sd_key'}) -- donor postdates merge, not a real exposure.`);
    }
  }
  if (report.borrowedRowCandidates.length === 0) {
    console.log('[audit] RESULT: 0 borrowed-row candidates found.');
  } else {
    console.log(`[audit] RESULT: ${report.borrowedRowCandidates.length} borrowed-row candidate(s) found:`);
    for (const c of report.borrowedRowCandidates) {
      const ownDesc = c.hasOwnRow
        ? `has its OWN row (verdict=${c.ownVerdict}) but it was NOT the most recent`
        : 'has NO own ship_review_findings row';
      console.log(`  - ${c.repo} PR#${c.prNumber} (branch ${c.ownBranch}) ${ownDesc}, `
        + `so the pre-fix query would have returned pr_number=${c.prNumber}'s NEWER verdict=pass row on branch ${c.donorBranch} instead (sd_key=${c.donorSdKey}, ${c.donorCreatedAt}).`);
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith('audit-borrowed-witness-rows.mjs')) {
  runAudit().then(printReport).catch((e) => { console.error('[audit] FATAL', e); process.exit(1); });
}
