/**
 * Clockwork: GitHub Actions Failure Monitor
 *
 * Detects failed GitHub Actions runs and inserts them into the feedback table
 * for systematic triage via /inbox. Uses error_hash dedup, severity mapping,
 * and auto-dismiss on successful re-runs.
 *
 * SD: SD-LEO-INFRA-GITHUB-ACTIONS-FAILURE-001
 */

const { execSync } = require('child_process');
const crypto = require('crypto');

// Severity mapping: workflow name patterns -> severity level
const SEVERITY_MAP = {
  critical: ['deploy', 'security', 'sign-', 'slsa-'],
  high: ['gate-', 'leo-gates', 'sd-validation', 'prd-validation', 'policy-', 'db-verify', 'story-gate'],
  medium: ['housekeeping', 'doc-', 'schema-', 'codebase-health', 'pattern-', 'wsjf-', 'vision-', 'backlog-'],
  low: ['auto-labels', 'label-sync', 'boundary-lint', 'stale-pr', 'lovable-']
};

function mapSeverity(workflowName) {
  const name = workflowName.toLowerCase();
  for (const [level, patterns] of Object.entries(SEVERITY_MAP)) {
    if (patterns.some(p => name.includes(p))) return level;
  }
  return 'medium';
}

function computeErrorHash(workflowName, runId) {
  return crypto.createHash('sha256')
    .update(`${workflowName}:${runId}`)
    .digest('hex');
}

function sanitizeInput(str) {
  if (!str) return '';
  return String(str)
    .replace(/<[^>]*>/g, '')           // strip HTML tags
    .replace(/[\x00-\x1f\x7f]/g, '')  // strip control chars
    .slice(0, 500);                     // truncate
}

function fetchFailedRuns(repo, lookbackHours = 2) {
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();
  try {
    const raw = execSync(
      `gh run list --repo ${repo} --status=failure --json databaseId,conclusion,status,name,headBranch,url,createdAt,updatedAt --limit 50`,
      { encoding: 'utf8', timeout: 30000 }
    );
    const runs = JSON.parse(raw);
    return runs.filter(r => new Date(r.createdAt) >= new Date(since));
  } catch (err) {
    console.error('Failed to fetch runs:', err.message);
    return [];
  }
}

async function insertFailures(supabase, failures, repo) {
  let inserted = 0;
  let updated = 0;

  for (const run of failures) {
    const errorHash = computeErrorHash(run.name, run.databaseId);
    const title = sanitizeInput(`${run.name} failed on ${run.headBranch}`);

    // Check for existing entry (dedup)
    const { data: existing } = await supabase
      .from('feedback')
      .select('id, occurrence_count')
      .eq('error_hash', errorHash)
      .limit(1);

    if (existing && existing.length > 0) {
      // Update existing: bump occurrence_count and last_seen
      await supabase
        .from('feedback')
        .update({
          occurrence_count: (existing[0].occurrence_count || 1) + 1,
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', existing[0].id);
      updated++;
    } else {
      // Insert new feedback entry
      const { error } = await supabase
        .from('feedback')
        .insert({
          type: 'issue',
          source_type: 'auto_capture',
          source_application: 'EHG_Engineer',
          feedback_type: 'sentry_error',
          title,
          error_message: sanitizeInput(run.conclusion || 'failure'),
          error_hash: errorHash,
          severity: mapSeverity(run.name),
          category: 'ci_failure',
          status: 'new',
          metadata: {
            run_id: run.databaseId,
            run_url: run.url,
            workflow_name: sanitizeInput(run.name),
            branch: sanitizeInput(run.headBranch),
            repo,
            conclusion: run.conclusion,
            gh_created_at: run.createdAt
          },
          first_seen: new Date().toISOString(),
          last_seen: new Date().toISOString()
        });
      if (error) {
        console.error(`Insert failed for ${run.name}:`, error.message);
      } else {
        inserted++;
      }
    }
  }
  return { inserted, updated };
}

async function autoDismissResolved(supabase, repo) {
  let dismissed = 0;

  const { data: pending } = await supabase
    .from('feedback')
    .select('id, metadata')
    .eq('source_type', 'auto_capture')
    .eq('category', 'ci_failure')
    .in('status', ['new', 'triaged']);

  if (!pending || pending.length === 0) return { dismissed: 0 };

  for (const entry of pending) {
    const { workflow_name, branch } = entry.metadata || {};
    if (!workflow_name || !branch) continue;

    try {
      const raw = execSync(
        `gh run list --repo ${repo} --workflow="${workflow_name}" --branch="${branch}" --status=success --json databaseId,conclusion,jobs --limit 1`,
        { encoding: 'utf8', timeout: 15000 }
      );
      const successRuns = JSON.parse(raw);
      if (successRuns.length > 0) {
        // Verify ALL jobs passed (not partial re-run)
        const run = successRuns[0];
        const allPassed = !run.jobs || run.jobs.every(j => j.conclusion === 'success');
        if (allPassed) {
          await supabase
            .from('feedback')
            .update({
              status: 'resolved',
              resolution_type: 'auto_dismissed',
              resolved_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', entry.id);
          dismissed++;
        }
      }
    } catch {
      // gh CLI error for this workflow — skip silently
    }
  }
  return { dismissed };
}

async function main() {
  require('dotenv').config();
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const repo = process.env.GH_MONITOR_REPO || 'rickfelix/EHG_Engineer';
  const lookback = parseInt(process.env.GH_MONITOR_LOOKBACK_HOURS || '2', 10);

  console.log(`[Clockwork:GH-Monitor] Fetching failed runs (last ${lookback}h)...`);
  const failures = fetchFailedRuns(repo, lookback);
  console.log(`[Clockwork:GH-Monitor] Found ${failures.length} failed run(s)`);

  if (failures.length > 0) {
    const result = await insertFailures(supabase, failures, repo);
    console.log(`[Clockwork:GH-Monitor] Inserted: ${result.inserted}, Updated: ${result.updated}`);
  }

  console.log('[Clockwork:GH-Monitor] Running auto-dismiss...');
  const dismissResult = await autoDismissResolved(supabase, repo);
  console.log(`[Clockwork:GH-Monitor] Auto-dismissed: ${dismissResult.dismissed}`);

  console.log('[Clockwork:GH-Monitor] Done.');
}

main().catch(err => {
  console.error('[Clockwork:GH-Monitor] Fatal error:', err.message);
  process.exit(1);
});

module.exports = { mapSeverity, computeErrorHash, sanitizeInput, fetchFailedRuns };
