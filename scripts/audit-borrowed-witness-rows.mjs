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

function listMergedPRs(repo) {
  try {
    const out = execFileSync('gh', ['pr', 'list', '-R', repo, '--state', 'merged', '--limit', '200', '--json', 'number,headRefName'], { encoding: 'utf-8' });
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

  const { data: findings, error: findErr } = await sb.from('ship_review_findings').select('pr_number, branch, verdict, sd_key, created_at');
  if (findErr) throw new Error(`ship_review_findings query failed: ${findErr.message}`);

  const report = { trustedRepos, checkedPRs: 0, borrowedRowCandidates: [], skippedRepos: [] };

  for (const repo of trustedRepos) {
    const prs = listMergedPRs(repo);
    if (prs === null) { report.skippedRepos.push(repo); continue; }
    for (const pr of prs) {
      report.checkedPRs++;
      // Replicate the PRE-FIX query exactly: .eq('pr_number', prNumber).order('created_at', desc).limit(1)
      // -- most-recent-row-wins, across ALL branches, not "own branch wins if it exists". A PR whose own
      // row is verdict='block' can still have been borrow-passed if a NEWER same-pr_number row from a
      // different branch existed -- skipping on "has an own row" (regardless of its verdict/recency)
      // missed exactly that case.
      const mostRecentRow = (findings || [])
        .filter((f) => f.pr_number === pr.number)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      if (!mostRecentRow) continue; // pre-fix lookup would have returned null too -- nothing to borrow.
      if (mostRecentRow.branch === pr.headRefName) continue; // pre-fix lookup would have returned this PR's own row.
      if (mostRecentRow.verdict === 'pass') {
        const ownRow = (findings || []).find((f) => f.pr_number === pr.number && f.branch === pr.headRefName);
        report.borrowedRowCandidates.push({
          repo, prNumber: pr.number, ownBranch: pr.headRefName,
          hasOwnRow: Boolean(ownRow), ownVerdict: ownRow?.verdict ?? null,
          donorBranch: mostRecentRow.branch, donorSdKey: mostRecentRow.sd_key, donorCreatedAt: mostRecentRow.created_at,
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
