#!/usr/bin/env node
/**
 * Bounded retroactive audit (SD-FDBK-FIX-WITNESS-LOOKUP-MATCHES-001, FR-3).
 *
 * Read-only. Scoped to trust_tier='trusted' repos only (the only repos where
 * P2's witness result could have gated a real auto-merge decision via
 * lib/ship/venture-trust-gate.mjs). For every merged PR in a trusted repo,
 * checks whether ship_review_findings has a row for that PR's OWN branch. A
 * merged PR whose own branch has no row, but whose pr_number exists in the
 * table under a DIFFERENT branch with verdict='pass', is a "borrowed-row"
 * candidate — evidence the pre-fix pr_number-only lookup could have
 * witness-passed it off another repo's review.
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
      const ownRow = (findings || []).find((f) => f.pr_number === pr.number && f.branch === pr.headRefName);
      if (ownRow) continue; // has its own row -- not a borrowed-row candidate.
      const donorRow = (findings || [])
        .filter((f) => f.pr_number === pr.number && f.branch !== pr.headRefName && f.verdict === 'pass')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      if (donorRow) {
        report.borrowedRowCandidates.push({
          repo, prNumber: pr.number, ownBranch: pr.headRefName,
          donorBranch: donorRow.branch, donorSdKey: donorRow.sd_key, donorCreatedAt: donorRow.created_at,
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
      console.log(`  - ${c.repo} PR#${c.prNumber} (branch ${c.ownBranch}) has NO own ship_review_findings row, `
        + `but pr_number=${c.prNumber} has a verdict=pass row on branch ${c.donorBranch} (sd_key=${c.donorSdKey}, ${c.donorCreatedAt}).`);
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith('audit-borrowed-witness-rows.mjs')) {
  runAudit().then(printReport).catch((e) => { console.error('[audit] FATAL', e); process.exit(1); });
}
