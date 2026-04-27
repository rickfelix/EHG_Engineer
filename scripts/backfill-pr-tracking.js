#!/usr/bin/env node
/**
 * backfill-pr-tracking — populate ship_review_findings from merged PRs.
 *
 * SD-LEO-INFRA-PR-TRACKING-BACKFILL-001 (FR-1)
 *
 * Scans `gh pr list --state merged --paginate` for the configured repos,
 * extracts the SD/QF key from each branch via the canonical extractor,
 * validates the key exists in `strategic_directives_v2` (or `quick_fixes`
 * for QF-prefix), then INSERTs a canonical-join row tagged
 * `verdict='backfill_canonical_join'` and `review_tier='canonical_join'`.
 *
 * Idempotent — relies on the partial unique index
 *   ux_ship_review_findings_sd_pr (sd_key, pr_number) WHERE sd_key IS NOT NULL
 * landed in 20260427_pr_tracking_uniqueness.sql.
 *
 * Modes:
 *   --dry-run                Print summary; no DB writes.
 *   --apply                  Write canonical-join rows.
 *   --resume                 Read .claude-work/pr-tracking-backfill-state.jsonl
 *                            and skip PRs at or below the recorded high-water
 *                            mark per repo.
 *   --repos a,b              Comma-separated owner/repo overrides
 *                            (default: rickfelix/EHG_Engineer,rickfelix/ehg).
 *
 * Audit artifacts:
 *   .audit/backfill-pr-tracking-{ts}.jsonl   per-row outcomes (skip/insert/dup)
 *   .claude-work/pr-tracking-backfill-state.jsonl   resume high-water marks
 */

import 'dotenv/config';
import { execSync } from 'node:child_process';
import { mkdirSync, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSupabaseServiceClient } from './lib/supabase-connection.js';
import { extractKey } from './lib/branch-key-extractor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const DEFAULT_REPOS = ['rickfelix/EHG_Engineer', 'rickfelix/ehg'];
const STATE_FILE = join(REPO_ROOT, '.claude-work', 'pr-tracking-backfill-state.jsonl');
const PAGE_LIMIT = 1000; // gh pr list --limit

function parseArgs(argv) {
  const opts = { dryRun: false, apply: false, resume: false, repos: DEFAULT_REPOS };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--apply') opts.apply = true;
    else if (a === '--resume') opts.resume = true;
    else if (a === '--repos') opts.repos = (argv[++i] || '').split(',').filter(Boolean);
  }
  if (!opts.dryRun && !opts.apply) opts.dryRun = true;
  return opts;
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function loadResumeMarks() {
  if (!existsSync(STATE_FILE)) return {};
  const marks = {};
  for (const line of readFileSync(STATE_FILE, 'utf8').split('\n').filter(Boolean)) {
    try {
      const row = JSON.parse(line);
      if (row.repo && Number.isFinite(row.last_processed_pr_number)) {
        const prev = marks[row.repo] ?? 0;
        if (row.last_processed_pr_number > prev) marks[row.repo] = row.last_processed_pr_number;
      }
    } catch { /* skip malformed lines */ }
  }
  return marks;
}

function recordResumeMark(repo, prNumber) {
  ensureDir(dirname(STATE_FILE));
  appendFileSync(
    STATE_FILE,
    JSON.stringify({ repo, last_processed_pr_number: prNumber, ts: new Date().toISOString() }) + '\n',
    'utf8'
  );
}

function recordAudit(auditPath, entry) {
  ensureDir(dirname(auditPath));
  appendFileSync(auditPath, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n', 'utf8');
}

/**
 * Fetch all merged PRs for a repo. Uses gh CLI; supports stub injection
 * via the GH_FETCHER env var (test seam).
 */
export function fetchMergedPRs(repo, fetcher = defaultGhFetcher) {
  return fetcher(repo);
}

function defaultGhFetcher(repo) {
  const cmd = `gh pr list --repo ${repo} --state merged --limit ${PAGE_LIMIT} --json number,headRefName,mergeCommit,mergedAt`;
  const raw = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 });
  return JSON.parse(raw);
}

/**
 * Pure: classify a PR for backfill. Returns one of:
 *   { outcome: 'skip', reason }
 *   { outcome: 'candidate', sd_key, pr_number, branch, mergedAt, mergeOid }
 *
 * Exported for unit testing.
 */
export function classifyPR(pr) {
  if (!pr || typeof pr.number !== 'number' || !pr.headRefName) {
    return { outcome: 'skip', reason: 'missing fields' };
  }
  const parsed = extractKey(pr.headRefName);
  if (!parsed) return { outcome: 'skip', reason: 'no SD/QF key in branch', branch: pr.headRefName, pr_number: pr.number };
  return {
    outcome: 'candidate',
    kind: parsed.kind,
    sd_key: parsed.key,
    pr_number: pr.number,
    branch: pr.headRefName,
    mergedAt: pr.mergedAt || null,
    mergeOid: pr.mergeCommit?.oid || null,
  };
}

async function lookupSdKeyExists(supabase, sd_key) {
  const { data } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', sd_key)
    .limit(1)
    .maybeSingle();
  return !!data;
}

async function processRepo(repo, opts, supabase, auditPath, resumeMarks) {
  const prs = fetchMergedPRs(repo);
  const resumeAt = opts.resume ? (resumeMarks[repo] ?? 0) : 0;
  const summary = { repo, total: prs.length, skipped_resume: 0, skipped_no_key: 0, skipped_unknown_sd: 0, skipped_qf: 0, candidates: 0, inserted: 0, duplicates: 0, errors: 0 };

  for (const pr of prs) {
    if (opts.resume && pr.number <= resumeAt) {
      summary.skipped_resume += 1;
      continue;
    }
    const cls = classifyPR(pr);
    if (cls.outcome === 'skip') {
      summary.skipped_no_key += 1;
      recordAudit(auditPath, { repo, action: 'skip_no_key', pr_number: pr.number, branch: pr.headRefName, reason: cls.reason });
      continue;
    }
    if (cls.kind === 'QF') {
      // QF orphan-tracking is handled by the orphan-PR detector + qf-reaper;
      // this script focuses on SD canonical-join rows.
      summary.skipped_qf += 1;
      recordAudit(auditPath, { repo, action: 'skip_qf', pr_number: cls.pr_number, branch: cls.branch, sd_key: cls.sd_key });
      continue;
    }
    summary.candidates += 1;

    const exists = await lookupSdKeyExists(supabase, cls.sd_key);
    if (!exists) {
      summary.skipped_unknown_sd += 1;
      recordAudit(auditPath, { repo, action: 'skip_unknown_sd', pr_number: cls.pr_number, branch: cls.branch, sd_key: cls.sd_key });
      continue;
    }

    if (opts.dryRun) {
      recordAudit(auditPath, { repo, action: 'would_insert', pr_number: cls.pr_number, branch: cls.branch, sd_key: cls.sd_key });
      continue;
    }

    const row = {
      sd_key: cls.sd_key,
      pr_number: cls.pr_number,
      branch: cls.branch,
      verdict: 'backfill_canonical_join',
      review_tier: 'canonical_join',
      risk_score: 0,
      finding_count: 0,
      finding_categories: {},
      reviewed_at: cls.mergedAt || new Date().toISOString(),
      multi_agent: false,
    };
    const { error } = await supabase.from('ship_review_findings').insert(row);
    if (error) {
      if (error.code === '23505') {
        summary.duplicates += 1;
        recordAudit(auditPath, { repo, action: 'duplicate', pr_number: cls.pr_number, sd_key: cls.sd_key });
      } else {
        summary.errors += 1;
        recordAudit(auditPath, { repo, action: 'insert_error', pr_number: cls.pr_number, sd_key: cls.sd_key, error: error.message, code: error.code });
      }
    } else {
      summary.inserted += 1;
      recordAudit(auditPath, { repo, action: 'inserted', pr_number: cls.pr_number, sd_key: cls.sd_key });
      recordResumeMark(repo, cls.pr_number);
    }
  }
  return summary;
}

async function main() {
  const opts = parseArgs(process.argv);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const auditPath = join(REPO_ROOT, '.audit', `backfill-pr-tracking-${ts}.jsonl`);

  const supabase = await createSupabaseServiceClient('engineer');
  const resumeMarks = loadResumeMarks();

  console.log(`[backfill-pr-tracking] mode=${opts.dryRun ? 'dry-run' : 'apply'} resume=${opts.resume} repos=${opts.repos.join(',')}`);
  console.log(`[backfill-pr-tracking] audit=${auditPath}`);

  const summaries = [];
  for (const repo of opts.repos) {
    try {
      const summary = await processRepo(repo, opts, supabase, auditPath, resumeMarks);
      summaries.push(summary);
      console.log(`[backfill-pr-tracking] ${repo}: ${JSON.stringify(summary)}`);
    } catch (err) {
      console.error(`[backfill-pr-tracking] ${repo} failed: ${err.message}`);
      summaries.push({ repo, error: err.message });
    }
  }

  const totals = summaries.reduce((acc, s) => {
    if (s.error) return acc;
    for (const k of ['total', 'candidates', 'inserted', 'duplicates', 'skipped_unknown_sd', 'skipped_no_key', 'skipped_qf', 'skipped_resume', 'errors']) {
      acc[k] = (acc[k] || 0) + (s[k] || 0);
    }
    return acc;
  }, {});
  console.log(`[backfill-pr-tracking] TOTAL: ${JSON.stringify(totals)}`);

  process.exit(totals.errors ? 1 : 0);
}

// Only run main when invoked directly (not when imported by tests).
const invokedDirectly = process.argv[1] && process.argv[1].endsWith('backfill-pr-tracking.js');
if (invokedDirectly) {
  main().catch((err) => {
    console.error('[backfill-pr-tracking] fatal:', err);
    process.exit(1);
  });
}
