/**
 * Friday Meeting Interactive Format - Structured 5-Section Agenda
 *
 * Presents a structured Friday meeting to the chairman:
 * 1. Performance Review — baseline vs actual, OKR progress
 * 2. Capability Report — capabilities delivered this week
 * 3. Consultant Findings — high-confidence recommendations by domain
 * 4. Intake Review — pending intake items
 * 5. Decisions — interactive accept/dismiss via AskUserQuestion
 *
 * SD-MAN-ORCH-FRIDAY-EVA-AUTONOMOUS-001-B
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const logger = console;

// ─── Section 1: Performance Review ───────────────────────────

async function gatherPerformanceReview() {
  // Get latest management review
  const { data: review } = await supabase
    .from('management_reviews')
    .select('review_date, planned_sds, actual_sds, okr_snapshot, pipeline_snapshot')
    .order('review_date', { ascending: false })
    .limit(1)
    .single();

  // Get OKR data
  const { data: objectives } = await supabase
    .from('okr_objectives')
    .select('id, title, status, progress')
    .eq('status', 'active');

  const { data: keyResults } = await supabase
    .from('okr_key_results')
    .select('id, objective_id, title, progress');

  // Get baseline info
  const { data: baseline } = await supabase
    .from('sd_execution_baselines')
    .select('id, baseline_name, version, is_active')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  let baselineItems = 0;
  let completedItems = 0;
  if (baseline) {
    const { data: items } = await supabase
      .from('sd_baseline_items')
      .select('sd_id, is_ready')
      .eq('baseline_id', baseline.id);
    baselineItems = (items || []).length;
    completedItems = (items || []).filter(i => i.is_ready).length;
  }

  return { review, objectives, keyResults, baseline, baselineItems, completedItems };
}

function renderPerformanceReview(data) {
  const lines = [];
  lines.push('');
  lines.push('  SECTION 1: PERFORMANCE REVIEW');
  lines.push('  ' + '─'.repeat(45));

  if (data.review) {
    lines.push(`  Last Review: ${data.review.review_date}`);
    lines.push(`  Planned SDs: ${data.review.planned_sds || 0}  |  Actual: ${data.review.actual_sds || 0}`);
    if (data.review.pipeline_snapshot) {
      const ps = data.review.pipeline_snapshot;
      lines.push(`  Pipeline: ${ps.sdsInFlight || 0} in-flight, ${ps.sdsCompleted || 0} completed`);
    }
  } else {
    lines.push('  No management review data available yet.');
    lines.push('  Run the management review round first.');
  }

  lines.push('');
  lines.push('  Baseline: ' + (data.baseline ? `v${data.baseline.version} (${data.completedItems}/${data.baselineItems} items)` : 'No active baseline'));

  if (data.objectives?.length) {
    lines.push('');
    lines.push('  OKR Progress:');
    for (const obj of data.objectives) {
      const krs = (data.keyResults || []).filter(kr => kr.objective_id === obj.id);
      const avgProgress = krs.length > 0
        ? Math.round(krs.reduce((sum, kr) => sum + (kr.progress || 0), 0) / krs.length)
        : 0;
      lines.push(`    ${obj.title}: ${avgProgress}%`);
    }
  }

  return lines.join('\n');
}

// ─── Section 2: Capability Report ────────────────────────────

async function gatherCapabilityReport() {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: completedSDs } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, delivers_capabilities, modifies_capabilities')
    .eq('status', 'completed')
    .gte('completion_date', oneWeekAgo);

  return { completedSDs: completedSDs || [] };
}

function renderCapabilityReport(data) {
  const lines = [];
  lines.push('');
  lines.push('  SECTION 2: CAPABILITY REPORT');
  lines.push('  ' + '─'.repeat(45));

  if (data.completedSDs.length === 0) {
    lines.push('  No SDs completed this week.');
    return lines.join('\n');
  }

  lines.push(`  ${data.completedSDs.length} SD(s) completed this week:`);
  for (const sd of data.completedSDs) {
    lines.push(`    ${sd.sd_key}: ${sd.title}`);
    if (sd.delivers_capabilities?.length) {
      for (const cap of sd.delivers_capabilities) {
        lines.push(`      + Delivers: ${typeof cap === 'string' ? cap : cap.name || cap.capability || JSON.stringify(cap)}`);
      }
    }
  }

  return lines.join('\n');
}

// ─── Section 3: Consultant Findings ──────────────────────────

async function gatherConsultantFindings() {
  const { data: findings } = await supabase
    .from('eva_consultant_recommendations')
    .select('id, title, description, analysis_domain, priority_score, action_type, confidence_tier, status')
    .eq('confidence_tier', 'high')
    .eq('status', 'pending')
    .order('priority_score', { ascending: false });

  // Group by domain
  const grouped = {};
  for (const f of findings || []) {
    const domain = f.analysis_domain || 'uncategorized';
    if (!grouped[domain]) grouped[domain] = [];
    grouped[domain].push(f);
  }

  return { findings: findings || [], grouped };
}

function renderConsultantFindings(data) {
  const lines = [];
  lines.push('');
  lines.push('  SECTION 3: CONSULTANT FINDINGS');
  lines.push('  ' + '─'.repeat(45));

  if (data.findings.length === 0) {
    lines.push('  No high-confidence findings this week.');
    lines.push('  The consultant analysis runs every Monday.');
    return lines.join('\n');
  }

  lines.push(`  ${data.findings.length} high-confidence finding(s) across ${Object.keys(data.grouped).length} domain(s):`);
  lines.push('');

  for (const [domain, findings] of Object.entries(data.grouped)) {
    lines.push(`  [${domain.toUpperCase()}]`);
    for (const f of findings) {
      lines.push(`    - ${f.title} (priority: ${f.priority_score}, action: ${f.action_type})`);
      lines.push(`      ${f.description}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Section 4: Intake Review ────────────────────────────────

async function gatherIntakeReview() {
  const { data: pending } = await supabase
    .from('eva_intake_queue')
    .select('id, title, source, classification, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(10);

  return { pending: pending || [] };
}

function renderIntakeReview(data) {
  const lines = [];
  lines.push('');
  lines.push('  SECTION 4: INTAKE REVIEW');
  lines.push('  ' + '─'.repeat(45));

  if (data.pending.length === 0) {
    lines.push('  No pending intake items.');
    return lines.join('\n');
  }

  lines.push(`  ${data.pending.length} pending item(s):`);
  for (const item of data.pending) {
    const source = item.source || 'unknown';
    const cls = item.classification || 'unclassified';
    lines.push(`    - [${source}] ${item.title || 'Untitled'} (${cls})`);
  }

  return lines.join('\n');
}

// ─── Section 5: Decisions ────────────────────────────────────

function buildDecisionPayload(findings) {
  if (findings.length === 0) return null;

  return {
    questions: findings.map((f, i) => ({
      question: `${f.title}\n${f.description}\nDomain: ${f.analysis_domain || 'unknown'} | Priority: ${f.priority_score} | Action: ${f.action_type}`,
      header: `Finding ${i + 1}/${findings.length}`,
      multiSelect: false,
      options: [
        { label: 'Accept', description: 'Act on this finding — EVA will create SD or take recommended action' },
        { label: 'Dismiss', description: 'This finding is not actionable — suppress similar future recommendations' },
        { label: 'Defer', description: 'Review again next week — keep as pending' },
      ],
    })),
  };
}

async function processDecision(finding, decision) {
  const now = new Date().toISOString();

  if (decision === 'Accept') {
    const { error } = await supabase
      .from('eva_consultant_recommendations')
      .update({ status: 'accepted', chairman_feedback: 'Accepted during Friday meeting', feedback_at: now })
      .eq('id', finding.id);
    if (error) logger.warn(`   Failed to update finding: ${error.message}`);
    return 'accepted';
  } else if (decision === 'Dismiss') {
    const { error } = await supabase
      .from('eva_consultant_recommendations')
      .update({ status: 'dismissed', chairman_feedback: 'Dismissed during Friday meeting', feedback_at: now })
      .eq('id', finding.id);
    if (error) logger.warn(`   Failed to update finding: ${error.message}`);
    return 'dismissed';
  }
  // Defer — leave as pending
  return 'deferred';
}

// ─── Main Handler ────────────────────────────────────────────

/**
 * Main handler for the Friday meeting format.
 * Can be invoked as a CLI script or as a skill handler.
 *
 * @param {Object} options - { interactive: boolean }
 * @returns {Object} Meeting results with decisions
 */
export async function fridayMeetingHandler(options = {}) {
  logger.log('\n' + '═'.repeat(55));
  logger.log('   FRIDAY WITH EVA — WEEKLY STRATEGIC MEETING');
  logger.log('   ' + new Date().toISOString().slice(0, 10));
  logger.log('═'.repeat(55));

  // Gather all data in parallel
  const [perfData, capData, consultData, intakeData] = await Promise.all([
    gatherPerformanceReview(),
    gatherCapabilityReport(),
    gatherConsultantFindings(),
    gatherIntakeReview(),
  ]);

  // Render sections 1-4
  logger.log(renderPerformanceReview(perfData));
  logger.log(renderCapabilityReport(capData));
  logger.log(renderConsultantFindings(consultData));
  logger.log(renderIntakeReview(intakeData));

  // Section 5: Decisions
  logger.log('');
  logger.log('  SECTION 5: DECISIONS');
  logger.log('  ' + '─'.repeat(45));

  const results = {
    meeting_date: new Date().toISOString(),
    sections: {
      performance: { hasData: !!perfData.review, okrCount: (perfData.objectives || []).length },
      capability: { completedSDs: capData.completedSDs.length },
      consultant: { totalFindings: consultData.findings.length, domains: Object.keys(consultData.grouped).length },
      intake: { pendingItems: intakeData.pending.length },
    },
    decisions: { accepted: 0, dismissed: 0, deferred: 0, total: consultData.findings.length },
  };

  if (consultData.findings.length === 0) {
    logger.log('  No findings require decisions this week.');
  } else {
    logger.log(`  ${consultData.findings.length} finding(s) require your decision.`);
    logger.log('');

    // Build the AskUserQuestion payload for interactive mode
    const payload = buildDecisionPayload(consultData.findings);

    if (options.interactive !== false && payload) {
      // Output the payload for Claude Code to pick up
      logger.log('FRIDAY_MEETING_DECISIONS_PAYLOAD=' + JSON.stringify(payload));
      logger.log('');
      logger.log('  Awaiting chairman decisions via AskUserQuestion...');
      logger.log('  (If running non-interactively, all findings will be deferred)');
    }
  }

  logger.log('');
  logger.log('═'.repeat(55));
  logger.log('   Meeting data gathered. Decisions pending.');
  logger.log('═'.repeat(55) + '\n');

  return results;
}

/**
 * Process decisions after chairman responds.
 * Called by the /friday skill after AskUserQuestion responses are collected.
 *
 * @param {Array<{findingId: string, decision: string}>} decisions
 * @returns {Object} Summary of decisions made
 */
export async function processMeetingDecisions(decisions) {
  const summary = { accepted: 0, dismissed: 0, deferred: 0 };

  for (const { findingId, decision } of decisions) {
    const result = await processDecision({ id: findingId }, decision);
    summary[result]++;
  }

  logger.log('\n  MEETING DECISIONS SUMMARY');
  logger.log('  ' + '─'.repeat(45));
  logger.log(`  Accepted:  ${summary.accepted}`);
  logger.log(`  Dismissed: ${summary.dismissed}`);
  logger.log(`  Deferred:  ${summary.deferred}`);
  logger.log('  ' + '─'.repeat(45) + '\n');

  return summary;
}

/**
 * Register this as an EVA round (for automated Friday trigger).
 */
export function registerFridayMeetingRound(scheduler) {
  scheduler.registerRound('friday_meeting', {
    description: 'Friday interactive meeting: structured agenda with chairman decisions',
    cadence: 'weekly',
    handler: fridayMeetingHandler,
  });
}

// CLI entry point
const isDirectRun = import.meta.url === `file://${process.argv[1]}`
  || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;

if (isDirectRun) {
  fridayMeetingHandler({ interactive: true })
    .then(results => {
      logger.log('Results:', JSON.stringify(results, null, 2));
    })
    .catch(err => {
      console.error('Fatal:', err.message);
      process.exit(1);
    });
}
