#!/usr/bin/env node
/**
 * audit-orphan-prs — list open PRs whose parent SD/QF is already completed.
 *
 * SD-LEO-INFRA-PR-TRACKING-BACKFILL-001 (FR-3)
 *
 * Queries `gh pr list --state open` for both repos, parses SD/QF keys via
 * the shared extractor, joins against strategic_directives_v2 and
 * quick_fixes, and reports any PR whose parent record has status='completed'.
 *
 * Always exits 0; the report is informational. Output supports
 *   --format human  (default)
 *   --format json
 */

import 'dotenv/config';
import { execSync } from 'node:child_process';
import { createSupabaseServiceClient } from './lib/supabase-connection.js';
import { extractKey } from './lib/branch-key-extractor.js';

const DEFAULT_REPOS = ['rickfelix/EHG_Engineer', 'rickfelix/ehg'];

function parseArgs(argv) {
  const opts = { format: 'human', repos: DEFAULT_REPOS };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--format') opts.format = argv[++i] || 'human';
    else if (a === '--repos') opts.repos = (argv[++i] || '').split(',').filter(Boolean);
  }
  return opts;
}

function fetchOpenPRs(repo) {
  const cmd = `gh pr list --repo ${repo} --state open --limit 1000 --json number,headRefName,createdAt`;
  const raw = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 });
  return JSON.parse(raw);
}

/**
 * Pure: classify a single open PR. Exported for unit testing.
 *
 * @param {object} pr - { number, headRefName, createdAt }
 * @param {string} repo
 * @returns {{ kind, key, pr_number, branch, repo, age_days }|null}
 */
export function classifyOpenPR(pr, repo, now = Date.now()) {
  if (!pr || typeof pr.number !== 'number' || !pr.headRefName) return null;
  const parsed = extractKey(pr.headRefName);
  if (!parsed) return null;
  const created = pr.createdAt ? Date.parse(pr.createdAt) : null;
  const age_days = created ? Math.round((now - created) / (1000 * 60 * 60 * 24)) : null;
  return {
    kind: parsed.kind,
    key: parsed.key,
    pr_number: pr.number,
    branch: pr.headRefName,
    repo,
    age_days,
  };
}

async function lookupCompleted(supabase, table, keyColumn, keys) {
  if (!keys.length) return new Set();
  const { data } = await supabase
    .from(table)
    .select(`${keyColumn},status`)
    .in(keyColumn, [...keys])
    .eq('status', 'completed');
  return new Set((data || []).map((r) => r[keyColumn]));
}

/**
 * Core join logic. Exported for testing without gh CLI.
 *
 * @param {Array} candidates - already-parsed open PRs (from classifyOpenPR).
 * @param {Set<string>} completedSDs
 * @param {Set<string>} completedQFs
 * @returns {Array} orphans
 */
export function findOrphans(candidates, completedSDs, completedQFs) {
  return candidates.filter((c) => {
    if (!c) return false;
    if (c.kind === 'SD') return completedSDs.has(c.key);
    if (c.kind === 'QF') return completedQFs.has(c.key);
    return false;
  });
}

async function main() {
  const opts = parseArgs(process.argv);
  const supabase = await createSupabaseServiceClient('engineer');

  const candidates = [];
  for (const repo of opts.repos) {
    try {
      const prs = fetchOpenPRs(repo);
      for (const pr of prs) {
        const cls = classifyOpenPR(pr, repo);
        if (cls) candidates.push(cls);
      }
    } catch (err) {
      process.stderr.write(`[audit-orphan-prs] ${repo} fetch failed: ${err.message}\n`);
    }
  }

  const sdKeys = new Set(candidates.filter((c) => c.kind === 'SD').map((c) => c.key));
  const qfKeys = new Set(candidates.filter((c) => c.kind === 'QF').map((c) => c.key));

  const completedSDs = await lookupCompleted(supabase, 'strategic_directives_v2', 'sd_key', sdKeys);
  const completedQFs = await lookupCompleted(supabase, 'quick_fixes', 'id', qfKeys);

  const orphans = findOrphans(candidates, completedSDs, completedQFs);

  if (opts.format === 'json') {
    process.stdout.write(JSON.stringify(orphans, null, 2) + '\n');
  } else {
    if (orphans.length === 0) {
      console.log('[audit-orphan-prs] No orphan PRs detected.');
    } else {
      console.log(`[audit-orphan-prs] ${orphans.length} orphan PR(s) — open PRs whose parent ${'SD/QF'} is completed:`);
      for (const o of orphans) {
        console.log(`  - ${o.repo} #${o.pr_number}  ${o.kind}=${o.key}  branch=${o.branch}  age=${o.age_days ?? '?'}d`);
      }
    }
  }
  process.exit(0);
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('audit-orphan-prs.mjs');
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`[audit-orphan-prs] fatal: ${err.message}\n`);
    process.exit(0); // still exit 0 — informational only
  });
}
