#!/usr/bin/env node

/**
 * Branch protection drift audit — ALERT-ONLY mode.
 *
 * Compares live GitHub branch protection settings against the
 * declarative policy in .github/branch-protection.json and reports
 * any differences. NEVER auto-remediates.
 *
 * Exit codes:
 *   0 — no drift detected
 *   1 — drift detected (differences printed)
 *   2 — error (missing token, API failure)
 *
 * SD: SD-NARRATIVE-KNOWLEDGE-TO-ENFORCED-ORCH-001-D
 * @module scripts/audit-branch-protection
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';

dotenv.config();

const POLICY_PATH = resolve(import.meta.dirname, '..', '.github', 'branch-protection.json');

function loadPolicy() {
  const raw = readFileSync(POLICY_PATH, 'utf-8');
  return JSON.parse(raw);
}

function compareBoolField(name, live, policy) {
  const liveVal = typeof live === 'object' ? live?.enabled : live;
  if (liveVal !== policy) {
    return { field: name, live: liveVal, policy };
  }
  return null;
}

async function auditBranch(octokit, owner, repo, branch, policy) {
  const diffs = [];

  let live;
  try {
    const { data } = await octokit.repos.getBranchProtection({ owner, repo, branch });
    live = data;
  } catch (err) {
    if (err.status === 404) {
      diffs.push({ field: 'protection', live: 'NONE', policy: 'CONFIGURED' });
      return diffs;
    }
    throw err;
  }

  // Compare key boolean fields
  const checks = [
    compareBoolField('allow_force_pushes', live.allow_force_pushes, policy.allow_force_pushes ?? false),
    compareBoolField('allow_deletions', live.allow_deletions, policy.allow_deletions ?? false),
    compareBoolField('enforce_admins', live.enforce_admins, policy.enforce_admins ?? false),
    compareBoolField('required_linear_history', live.required_linear_history, policy.required_linear_history ?? false),
  ];

  for (const diff of checks) {
    if (diff) diffs.push(diff);
  }

  // Compare review count
  const liveReviews = live.required_pull_request_reviews?.required_approving_review_count ?? 0;
  const policyReviews = policy.required_pull_request_reviews?.required_approving_review_count ?? 0;
  if (liveReviews !== policyReviews) {
    diffs.push({ field: 'required_approving_review_count', live: liveReviews, policy: policyReviews });
  }

  return diffs;
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('[audit-branch-protection] GITHUB_TOKEN not set');
    process.exit(2);
  }

  const policy = loadPolicy();
  const [owner, repo] = policy.repository.split('/');
  const octokit = new Octokit({ auth: token });

  console.log(`[audit-branch-protection] Repository: ${owner}/${repo}`);
  console.log(`[audit-branch-protection] Mode: ALERT-ONLY (no auto-remediation)`);
  console.log(`[audit-branch-protection] Time: ${new Date().toISOString()}\n`);

  let totalDrift = 0;

  for (const [branch, branchPolicy] of Object.entries(policy.branches)) {
    console.log(`[Branch: ${branch}]`);

    try {
      const diffs = await auditBranch(octokit, owner, repo, branch, branchPolicy);

      if (diffs.length === 0) {
        console.log('  No drift detected');
      } else {
        totalDrift += diffs.length;
        for (const d of diffs) {
          console.log(`  DRIFT: ${d.field} — live=${d.live}, policy=${d.policy}`);
        }
      }
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      totalDrift++;
    }
    console.log();
  }

  if (totalDrift === 0) {
    console.log('[audit-branch-protection] All branches match policy.');
    process.exit(0);
  } else {
    console.log(`[audit-branch-protection] ${totalDrift} drift(s) detected. Review and remediate manually.`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`[audit-branch-protection] Fatal: ${err.message}`);
  process.exit(2);
});
