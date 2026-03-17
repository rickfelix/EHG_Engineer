#!/usr/bin/env node

/**
 * Brainstorm Pipeline Health Check
 *
 * Automated maintenance check that catches brainstorms falling through the cracks
 * in the brainstorm → vision → architecture → SD pipeline.
 *
 * Checks:
 * 1. needs_triage with vision+arch keys → auto-upgrade to sd_created
 * 2. NULL outcome real brainstorms (non-corrective) → flag for disposition
 * 3. sd_created with no vision/arch keys → flag historical gap
 * 4. Stuck at vision (no arch plan) → flag
 * 5. Stale needs_triage (>7 days) → escalate
 *
 * Usage:
 *   node scripts/brainstorm-pipeline-health.js [--fix] [--dry-run] [--json] [--stale-days=N]
 *
 * Options:
 *   --fix         Auto-fix trivially fixable issues (outcome upgrades, null→classified)
 *   --dry-run     Preview fixes without applying
 *   --json        Output as JSON (for programmatic consumption)
 *   --stale-days  Days before needs_triage is flagged as stale (default: 7)
 *   --summary     One-line summary only (for sd:next integration)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// CLI Arguments
const FIX = process.argv.includes('--fix');
const DRY_RUN = process.argv.includes('--dry-run');
const JSON_OUTPUT = process.argv.includes('--json');
const SUMMARY_ONLY = process.argv.includes('--summary');
const STALE_DAYS = parseInt(process.argv.find(a => a.startsWith('--stale-days='))?.split('=')[1] || '7');

/**
 * Run all pipeline health checks.
 * @returns {Promise<Object>} Health check results
 */
export async function checkBrainstormPipelineHealth(options = {}) {
  const fix = options.fix ?? FIX;
  const dryRun = options.dryRun ?? DRY_RUN;
  const staleDays = options.staleDays ?? STALE_DAYS;

  const { data: sessions, error } = await supabase
    .from('brainstorm_sessions')
    .select('id, domain, topic, outcome_type, stage, created_at, metadata')
    .order('created_at', { ascending: true });

  if (error) {
    return { error: error.message, checks: [] };
  }

  const now = new Date();
  const staleThreshold = staleDays * 24 * 60 * 60 * 1000;
  const checks = [];
  const fixes = [];

  for (const s of sessions) {
    const meta = s.metadata || {};
    const hasVision = !!meta.vision_key;
    const hasArch = !!meta.plan_key;
    const age = now - new Date(s.created_at);
    const ageDays = Math.round(age / (24 * 60 * 60 * 1000));
    const isCorrective = s.topic?.includes('Corrective');
    const isTest = s.topic?.toLowerCase().startsWith('test');

    // Check 1: needs_triage with both artifacts → should be sd_created
    if (s.outcome_type === 'needs_triage' && hasVision && hasArch) {
      checks.push({
        type: 'UPGRADE_NEEDED',
        severity: 'auto_fixable',
        session_id: s.id,
        topic: s.topic,
        created: s.created_at?.substring(0, 10),
        message: `Has vision (${meta.vision_key}) + arch (${meta.plan_key}) but outcome still needs_triage`,
        fix: 'Upgrade outcome_type to sd_created'
      });
      if (fix) {
        fixes.push({ id: s.id, field: 'outcome_type', from: 'needs_triage', to: 'sd_created' });
      }
    }

    // Check 2: NULL outcome with both artifacts → should be sd_created
    if (s.outcome_type === null && hasVision && hasArch && !isCorrective && !isTest) {
      checks.push({
        type: 'NULL_WITH_ARTIFACTS',
        severity: 'auto_fixable',
        session_id: s.id,
        topic: s.topic,
        created: s.created_at?.substring(0, 10),
        message: `Has vision (${meta.vision_key}) + arch (${meta.plan_key}) but outcome is NULL`,
        fix: 'Set outcome_type to sd_created'
      });
      if (fix) {
        fixes.push({ id: s.id, field: 'outcome_type', from: null, to: 'sd_created' });
      }
    }

    // Check 3: NULL outcome, real brainstorm, no artifacts → needs disposition
    if (s.outcome_type === null && !hasVision && !hasArch && !isCorrective && !isTest) {
      checks.push({
        type: 'UNDISPOSITIONED',
        severity: 'needs_review',
        session_id: s.id,
        topic: s.topic,
        domain: s.domain,
        created: s.created_at?.substring(0, 10),
        age_days: ageDays,
        message: 'Real brainstorm with no outcome and no artifacts — needs chairman disposition'
      });
    }

    // Check 4: Stuck at vision (has vision, no arch)
    if (hasVision && !hasArch) {
      checks.push({
        type: 'STUCK_AT_VISION',
        severity: 'warning',
        session_id: s.id,
        topic: s.topic,
        created: s.created_at?.substring(0, 10),
        vision_key: meta.vision_key,
        message: `Has vision (${meta.vision_key}) but no architecture plan — pipeline incomplete`
      });
    }

    // Check 5: sd_created with no artifacts (historical gap)
    if (s.outcome_type === 'sd_created' && !hasVision && !hasArch) {
      checks.push({
        type: 'SD_NO_ARTIFACTS',
        severity: 'info',
        session_id: s.id,
        topic: s.topic,
        created: s.created_at?.substring(0, 10),
        message: 'SD created without vision/arch pipeline (pre-pipeline historical)'
      });
    }

    // Check 6: Stale needs_triage with no artifacts
    if (s.outcome_type === 'needs_triage' && !hasVision && !hasArch && age > staleThreshold) {
      checks.push({
        type: 'STALE_TRIAGE',
        severity: 'escalation',
        session_id: s.id,
        topic: s.topic,
        domain: s.domain,
        created: s.created_at?.substring(0, 10),
        age_days: ageDays,
        message: `needs_triage for ${ageDays} days with no artifacts — stale, needs chairman decision`
      });
    }
  }

  // Apply fixes
  let fixResults = [];
  if (fix && fixes.length > 0 && !dryRun) {
    for (const f of fixes) {
      const { error: updateErr } = await supabase
        .from('brainstorm_sessions')
        .update({
          outcome_type: f.to,
          metadata: { ...(sessions.find(s => s.id === f.id)?.metadata || {}), auto_upgraded_by: 'pipeline-health', auto_upgraded_at: new Date().toISOString() }
        })
        .eq('id', f.id);

      fixResults.push({
        id: f.id,
        success: !updateErr,
        error: updateErr?.message || null,
        from: f.from,
        to: f.to
      });
    }
  } else if (fix && fixes.length > 0 && dryRun) {
    fixResults = fixes.map(f => ({ id: f.id, dry_run: true, from: f.from, to: f.to }));
  }

  // Compute summary
  const byType = {};
  for (const c of checks) {
    byType[c.type] = (byType[c.type] || 0) + 1;
  }

  const bySeverity = {};
  for (const c of checks) {
    bySeverity[c.severity] = (bySeverity[c.severity] || 0) + 1;
  }

  return {
    total_sessions: sessions.length,
    total_issues: checks.length,
    by_type: byType,
    by_severity: bySeverity,
    checks,
    fixes_applied: fixResults,
    healthy: checks.filter(c => c.severity === 'escalation' || c.severity === 'needs_review').length === 0
  };
}

/**
 * Get a one-line summary for sd:next banner integration.
 * @returns {Promise<{show: boolean, message: string, count: number}>}
 */
export async function getBrainstormPipelineSummary() {
  try {
    const result = await checkBrainstormPipelineHealth({ fix: false });
    if (result.error) return { show: false, message: '', count: 0 };

    const actionable = (result.by_severity?.auto_fixable || 0) +
                       (result.by_severity?.needs_review || 0) +
                       (result.by_severity?.escalation || 0);

    if (actionable === 0) return { show: false, message: '', count: 0 };

    const parts = [];
    if (result.by_severity?.auto_fixable) parts.push(`${result.by_severity.auto_fixable} auto-fixable`);
    if (result.by_severity?.escalation) parts.push(`${result.by_severity.escalation} stale`);
    if (result.by_severity?.needs_review) parts.push(`${result.by_severity.needs_review} need review`);

    return {
      show: true,
      message: `Brainstorm pipeline: ${parts.join(', ')} — run: npm run brainstorm:health:fix`,
      count: actionable
    };
  } catch {
    return { show: false, message: '', count: 0 };
  }
}

/**
 * Auto-fix all trivially fixable issues (for maintenance integration).
 * @returns {Promise<{fixed: number, errors: number}>}
 */
export async function autoFixBrainstormPipeline() {
  const result = await checkBrainstormPipelineHealth({ fix: true, dryRun: false });
  const fixed = result.fixes_applied?.filter(f => f.success).length || 0;
  const errors = result.fixes_applied?.filter(f => !f.success).length || 0;
  return { fixed, errors, total_issues: result.total_issues };
}

// CLI output
function printReport(result) {
  if (JSON_OUTPUT) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (SUMMARY_ONLY) {
    const actionable = (result.by_severity?.auto_fixable || 0) +
                       (result.by_severity?.needs_review || 0) +
                       (result.by_severity?.escalation || 0);
    if (actionable === 0) {
      console.log('Brainstorm pipeline: healthy');
    } else {
      const parts = [];
      if (result.by_severity?.auto_fixable) parts.push(`${result.by_severity.auto_fixable} auto-fixable`);
      if (result.by_severity?.escalation) parts.push(`${result.by_severity.escalation} stale`);
      if (result.by_severity?.needs_review) parts.push(`${result.by_severity.needs_review} need review`);
      console.log(`Brainstorm pipeline: ${parts.join(', ')}`);
    }
    return;
  }

  console.log('\n  BRAINSTORM PIPELINE HEALTH CHECK');
  console.log('  ' + '='.repeat(50));
  console.log(`  Total sessions: ${result.total_sessions} | Issues found: ${result.total_issues}`);

  if (result.total_issues === 0) {
    console.log('\n  All brainstorms properly dispositioned.');
    return;
  }

  console.log('\n  BY TYPE:');
  for (const [type, count] of Object.entries(result.by_type || {})) {
    const icon = {
      UPGRADE_NEEDED: '  ',
      NULL_WITH_ARTIFACTS: '  ',
      UNDISPOSITIONED: '  ',
      STUCK_AT_VISION: '  ',
      SD_NO_ARTIFACTS: '  ',
      STALE_TRIAGE: '  '
    }[type] || '  ';
    console.log(`  ${icon} ${type}: ${count}`);
  }

  console.log('\n  BY SEVERITY:');
  for (const [sev, count] of Object.entries(result.by_severity || {})) {
    console.log(`    ${sev}: ${count}`);
  }

  // Show escalations and needs_review
  const urgent = result.checks.filter(c => c.severity === 'escalation' || c.severity === 'needs_review');
  if (urgent.length > 0) {
    console.log('\n  NEEDS ATTENTION:');
    for (const c of urgent.slice(0, 15)) {
      console.log(`    [${c.created}] ${c.topic?.substring(0, 65)}`);
      console.log(`      ${c.type} — ${c.message}`);
    }
    if (urgent.length > 15) {
      console.log(`    ... and ${urgent.length - 15} more`);
    }
  }

  // Show fix results
  if (result.fixes_applied?.length > 0) {
    console.log('\n  FIXES APPLIED:');
    for (const f of result.fixes_applied) {
      const status = f.dry_run ? 'DRY RUN' : f.success ? 'FIXED' : 'FAILED';
      console.log(`    [${status}] ${f.id?.substring(0, 8)}... ${f.from || 'null'} -> ${f.to}`);
      if (f.error) console.log(`      Error: ${f.error}`);
    }
  }

  if (!FIX && (result.by_severity?.auto_fixable || 0) > 0) {
    console.log(`\n  TIP: Run with --fix to auto-upgrade ${result.by_severity.auto_fixable} trivially fixable issues`);
    console.log('       Add --dry-run to preview changes first');
  }

  console.log('');
}

// CLI entry point
const isMain = import.meta.url === `file://${process.argv[1]}` ||
                     import.meta.url === `file:///${process.argv[1].replace(/\\\\/g, '/')}` ||
               import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;

if (isMain) {
  checkBrainstormPipelineHealth({ fix: FIX, dryRun: DRY_RUN, staleDays: STALE_DAYS })
    .then(result => {
      printReport(result);
      process.exit(result.healthy ? 0 : 1);
    })
    .catch(err => {
      console.error('Pipeline health check failed:', err.message);
      process.exit(2);
    });
}
