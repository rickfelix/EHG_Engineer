#!/usr/bin/env node
/**
 * Monitor Scheduled GitHub Actions Jobs
 *
 * Checks all scheduled workflow runs from the past 24 hours,
 * identifies failures, and inserts them into the feedback table
 * with deduplication via error_hash.
 *
 * Usage:
 *   node scripts/monitor-scheduled-jobs.js [--dry-run]
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GITHUB_TOKEN
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// --- Configuration ---

const DRY_RUN = process.argv.includes('--dry-run');
const LOOKBACK_HOURS = 25; // slightly over 24h to avoid gaps
const REPO = process.env.GITHUB_REPOSITORY || 'rickfelix/EHG_Engineer';

// Severity mapping: workflows whose failure is critical vs routine
const SEVERITY_MAP = {
  // High severity — core infrastructure or prod-facing
  'housekeeping-staging-selfcontained.yml': 'high',
  'housekeeping-staging.yml': 'high',
  'wsjf-proposals-ingest-prod.yml': 'high',
  'wsjf-bulk-accept-prod.yml': 'high',
  'vision-alignment-prod-readonly.yml': 'high',
  'wsjf-prod-readonly.yml': 'high',
  'housekeeping-prod-promotion.yml': 'high',
  // Medium severity — everything else (default)
};

// --- Helpers ---

function generateHash(workflowName, dateStr) {
  const content = `scheduled-job|${workflowName}|${dateStr}`;
  return crypto.createHash('md5').update(content).digest('hex');
}

async function fetchFailedRuns(token) {
  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const url = `https://api.github.com/repos/${REPO}/actions/runs?event=schedule&status=failure&created=%3E${since}&per_page=100`;

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!resp.ok) {
    throw new Error(`GitHub API error: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();
  return data.workflow_runs || [];
}

function buildFeedbackRecord(run) {
  const dateStr = run.created_at.slice(0, 10); // YYYY-MM-DD for dedup
  const workflowFile = run.path?.split('/').pop() || 'unknown.yml';
  const severity = SEVERITY_MAP[workflowFile] || 'medium';

  return {
    type: 'issue',
    title: `Scheduled job failed: ${run.name}`,
    description: [
      `**Workflow**: ${run.name}`,
      `**File**: ${workflowFile}`,
      `**Run**: #${run.run_number}`,
      `**Branch**: ${run.head_branch}`,
      `**Started**: ${run.run_started_at}`,
      `**URL**: ${run.html_url}`,
      '',
      'This scheduled GitHub Actions workflow failed. Check the run logs for details.',
    ].join('\n'),
    severity,
    priority: severity === 'high' ? 'P1' : 'P2',
    status: 'new',
    category: 'bug',
    source_type: 'github_actions',
    source_application: 'EHG_Engineer',
    source_id: String(run.id),
    error_hash: generateHash(run.name, dateStr),
    occurrence_count: 1,
    metadata: {
      workflow_name: run.name,
      workflow_file: workflowFile,
      run_id: run.id,
      run_number: run.run_number,
      run_url: run.html_url,
      head_branch: run.head_branch,
      run_started_at: run.run_started_at,
      conclusion: run.conclusion,
      monitor_source: 'monitor-scheduled-jobs',
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// --- Main ---

async function main() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    console.error('[Monitor] GITHUB_TOKEN or GH_TOKEN is required');
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('[Monitor] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log(`[Monitor] Checking scheduled job runs from the last ${LOOKBACK_HOURS}h...`);
  if (DRY_RUN) console.log('[Monitor] DRY RUN — no records will be inserted');

  // 1. Fetch failed runs from GitHub
  const failedRuns = await fetchFailedRuns(token);
  console.log(`[Monitor] Found ${failedRuns.length} failed scheduled run(s)`);

  if (failedRuns.length === 0) {
    console.log('[Monitor] All scheduled jobs passed. Nothing to report.');
    // Output for GitHub Actions summary
    if (process.env.GITHUB_STEP_SUMMARY) {
      const fs = await import('fs');
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## Scheduled Job Monitor\n\nAll scheduled jobs passed in the last 24 hours.\n');
    }
    return;
  }

  // 2. Check which failures are already reported (dedup by error_hash)
  const hashes = failedRuns.map((r) =>
    generateHash(r.name, r.created_at.slice(0, 10))
  );

  const { data: existing } = await supabase
    .from('feedback')
    .select('error_hash, id, occurrence_count')
    .in('error_hash', hashes);

  const existingMap = new Map(
    (existing || []).map((e) => [e.error_hash, e])
  );

  // 3. Process each failure
  let inserted = 0;
  let deduplicated = 0;
  const results = [];

  for (const run of failedRuns) {
    const record = buildFeedbackRecord(run);
    const existingRecord = existingMap.get(record.error_hash);

    if (existingRecord) {
      // Already reported today — bump occurrence count
      deduplicated++;
      if (!DRY_RUN) {
        await supabase
          .from('feedback')
          .update({
            occurrence_count: (existingRecord.occurrence_count || 1) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingRecord.id);
      }
      results.push({ workflow: run.name, action: 'deduplicated' });
      continue;
    }

    if (!DRY_RUN) {
      const { error } = await supabase
        .from('feedback')
        .insert(record);

      if (error) {
        console.error(`[Monitor] Failed to insert feedback for "${run.name}":`, error.message);
        results.push({ workflow: run.name, action: 'error', detail: error.message });
        continue;
      }
    }

    inserted++;
    results.push({ workflow: run.name, action: 'inserted', severity: record.severity });
  }

  // 4. Summary
  console.log(`[Monitor] Done: ${inserted} inserted, ${deduplicated} deduplicated`);
  for (const r of results) {
    const icon = r.action === 'inserted' ? '+' : r.action === 'deduplicated' ? '~' : '!';
    console.log(`  [${icon}] ${r.workflow} → ${r.action}${r.severity ? ` (${r.severity})` : ''}${r.detail ? `: ${r.detail}` : ''}`);
  }

  // GitHub Actions job summary
  if (process.env.GITHUB_STEP_SUMMARY) {
    const fs = await import('fs');
    const lines = [
      '## Scheduled Job Monitor',
      '',
      '| Workflow | Action | Severity |',
      '|----------|--------|----------|',
      ...results.map((r) => `| ${r.workflow} | ${r.action} | ${r.severity || '-'} |`),
      '',
      `**Total**: ${failedRuns.length} failures — ${inserted} new, ${deduplicated} deduplicated`,
    ];
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  }

  // Exit with code 1 if there were new failures (for visibility in Actions UI)
  if (inserted > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[Monitor] Fatal error:', err);
  process.exit(2);
});
