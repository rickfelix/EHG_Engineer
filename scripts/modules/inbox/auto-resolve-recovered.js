#!/usr/bin/env node

/**
 * Auto-Resolve Recovered CI-Failure Feedback Rows
 *
 * CAPA-7 of SD-LEO-INFRA-FEEDBACK-PIPELINE-HEALTH-001. Closes the gap where
 * feedback rows with status='in_progress' + category='ci_failure' stay stuck
 * indefinitely after the cited workflow self-heals (witnessed: row
 * c7907621-... stuck 186h while fr-c-generator-cron had 40/40 success).
 *
 * Sibling to CAPA-2 (auto-triage). Stricter than gh-failure-monitor's
 * autoDismissResolved (status='new'/'triaged' + limit=1): requires K
 * consecutive successful runs newer than row.created_at.
 *
 * Usage:
 *   node scripts/modules/inbox/auto-resolve-recovered.js \
 *     [--dry-run] [--max-items N] [--k K] [--stale-hours H]
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { isMainModule } from '../../../lib/utils/is-main-module.js';
import 'dotenv/config';

const STALE_HOURS_DEFAULT = 24;
const K_DEFAULT = 5;
const MAX_ITEMS_DEFAULT = 20;

export function parseArgs(argv = process.argv.slice(2)) {
  const flags = { maxItems: MAX_ITEMS_DEFAULT, dryRun: false, k: K_DEFAULT, staleHours: STALE_HOURS_DEFAULT };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--max-items' && argv[i + 1]) flags.maxItems = parseInt(argv[++i], 10) || MAX_ITEMS_DEFAULT;
    else if (argv[i] === '--k' && argv[i + 1]) flags.k = parseInt(argv[++i], 10) || K_DEFAULT;
    else if (argv[i] === '--stale-hours' && argv[i + 1]) flags.staleHours = parseInt(argv[++i], 10) || STALE_HOURS_DEFAULT;
    else if (argv[i] === '--dry-run') flags.dryRun = true;
  }
  return flags;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('[auto-resolve-recovered] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
  return createClient(url, key);
}

export function fetchRecentRuns(repo, workflowName, k, exec = execSync) {
  const wf = String(workflowName).replace(/"/g, '');
  try {
    const raw = exec(`gh run list --repo ${repo} --workflow="${wf}" --json conclusion,createdAt --limit ${k}`, { encoding: 'utf8', timeout: 15000 });
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function shouldAutoResolve(runs, rowCreatedAt, k) {
  if (!Array.isArray(runs) || runs.length < k) return false;
  if (!runs.every(r => r && r.conclusion === 'success')) return false;
  const newest = runs.reduce((m, r) => new Date(r.createdAt) > new Date(m.createdAt) ? r : m, runs[0]);
  return new Date(newest.createdAt) > new Date(rowCreatedAt);
}

// status=new rows are eligible immediately (post-merge race; K-consecutive-success
// already enforces correctness). status=in_progress still requires the stale-hours
// min-age so we don't churn rows the triage pipeline is actively working.
export function isEligibleForResolve(item, staleHours, now = Date.now()) {
  if (!item || typeof item.status !== 'string') return false;
  if (item.status === 'new') return true;
  if (item.status === 'in_progress') {
    const ageMs = now - new Date(item.created_at).getTime();
    return ageMs >= staleHours * 3600_000;
  }
  return false;
}

async function run() {
  const flags = parseArgs();
  const supabase = getSupabase();
  console.log(`[auto-resolve-recovered] stale>${flags.staleHours}h k=${flags.k} max=${flags.maxItems} dry=${flags.dryRun}`);

  const { data: items, error } = await supabase.from('feedback')
    .select('id, status, title, metadata, created_at')
    .in('status', ['in_progress', 'new']).eq('category', 'ci_failure')
    .order('created_at', { ascending: true }).limit(flags.maxItems);
  if (error) { console.error('[auto-resolve-recovered] Query error:', error.message); process.exit(1); }
  if (!items?.length) { console.log('[auto-resolve-recovered] No stuck rows.'); return; }

  let resolved = 0, skipped = 0;
  for (const item of items) {
    if (!isEligibleForResolve(item, flags.staleHours)) { skipped++; continue; }
    const { workflow_name, repo } = item.metadata || {};
    if (!workflow_name || !repo) { skipped++; continue; }
    const runs = fetchRecentRuns(repo, workflow_name, flags.k);
    if (!shouldAutoResolve(runs, item.created_at, flags.k)) { skipped++; continue; }
    const oldest = runs[runs.length - 1].createdAt;
    const newest = runs[0].createdAt;
    const notes = `Auto-resolved by clockwork-auto-resolve (CAPA-7): workflow "${workflow_name}" had ${flags.k}/${flags.k} consecutive successful runs (oldest ${oldest}, newest ${newest}); newest > row.created_at ${item.created_at}.`;
    if (flags.dryRun) { console.log(`  [DRY-RUN] ${item.id.slice(0, 8)} → ${workflow_name}`); resolved++; continue; }
    const { error: upErr } = await supabase.from('feedback').update({ status: 'resolved', resolution_type: 'auto_resolved', resolution_notes: notes, resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', item.id);
    if (upErr) { console.error(`  [ERROR] ${item.id.slice(0, 8)}: ${upErr.message}`); skipped++; } else { console.log(`  [OK] ${item.id.slice(0, 8)} → resolved (${workflow_name})`); resolved++; }
  }
  console.log(`\n[auto-resolve-recovered] Resolved=${resolved} Skipped=${skipped} Total=${items.length} Mode=${flags.dryRun ? 'dry-run' : 'live'}`);
}

if (isMainModule(import.meta.url)) {
  run().catch(err => { console.error('[auto-resolve-recovered] Fatal:', err.message); process.exit(1); });
}
