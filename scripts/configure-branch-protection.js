#!/usr/bin/env node

/**
 * Apply branch protection settings from .github/branch-protection.json.
 *
 * Reads the declarative policy file and applies it to the repository
 * via GitHub REST API using @octokit/rest.
 *
 * Usage:
 *   node scripts/configure-branch-protection.js              # Apply policy
 *   node scripts/configure-branch-protection.js --dry-run    # Show what would change
 *
 * Requires: GITHUB_TOKEN env var with repo admin scope.
 *
 * SD: SD-NARRATIVE-KNOWLEDGE-TO-ENFORCED-ORCH-001-D
 * @module scripts/configure-branch-protection
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';

dotenv.config();

const POLICY_PATH = resolve(import.meta.dirname, '..', '.github', 'branch-protection.json');
const DRY_RUN = process.argv.includes('--dry-run');

function loadPolicy() {
  const raw = readFileSync(POLICY_PATH, 'utf-8');
  return JSON.parse(raw);
}

async function getCurrentProtection(octokit, owner, repo, branch) {
  try {
    const { data } = await octokit.repos.getBranchProtection({ owner, repo, branch });
    return data;
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

async function applyProtection(octokit, owner, repo, branch, policy) {
  const params = {
    owner,
    repo,
    branch,
    required_pull_request_reviews: policy.required_pull_request_reviews || null,
    required_status_checks: policy.required_status_checks || null,
    enforce_admins: policy.enforce_admins ?? false,
    required_linear_history: policy.required_linear_history ?? false,
    allow_force_pushes: policy.allow_force_pushes ?? false,
    allow_deletions: policy.allow_deletions ?? false,
    restrictions: policy.restrictions || null,
  };

  await octokit.repos.updateBranchProtection(params);
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('[configure-branch-protection] GITHUB_TOKEN not set');
    process.exit(1);
  }

  const policy = loadPolicy();
  const [owner, repo] = policy.repository.split('/');
  const octokit = new Octokit({ auth: token });

  console.log(`[configure-branch-protection] Repository: ${owner}/${repo}`);
  console.log(`[configure-branch-protection] Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY'}`);

  for (const [branch, branchPolicy] of Object.entries(policy.branches)) {
    console.log(`\n[Branch: ${branch}]`);

    const current = await getCurrentProtection(octokit, owner, repo, branch);

    if (!current) {
      console.log('  No protection currently set');
    } else {
      console.log(`  Current: force_push=${current.allow_force_pushes?.enabled}, deletions=${current.allow_deletions?.enabled}`);
    }

    console.log(`  Policy:  force_push=${branchPolicy.allow_force_pushes}, deletions=${branchPolicy.allow_deletions}`);

    if (DRY_RUN) {
      console.log('  [DRY RUN] Would apply policy — no changes made');
      continue;
    }

    try {
      await applyProtection(octokit, owner, repo, branch, branchPolicy);
      console.log('  Applied successfully');
    } catch (err) {
      console.error(`  Failed: ${err.message}`);
    }
  }
}

main().catch(err => {
  console.error(`[configure-branch-protection] Fatal: ${err.message}`);
  process.exit(1);
});
