/**
 * Friday Meeting Interactive Format - Structured 6-Section Agenda
 *
 * Presents a structured Friday meeting to the chairman:
 * 1. Performance Review — baseline vs actual, OKR progress
 * 2. Capability Report — capabilities delivered this week
 * 3. Consultant Findings — high-confidence recommendations by domain
 * 4. Intake Review — pending intake items
 * 5. R&D Proposals — skunkworks batch proposals for chairman review
 * 6. Decisions — interactive accept/dismiss via AskUserQuestion
 *
 * SD-MAN-ORCH-FRIDAY-EVA-AUTONOMOUS-001-B
 * SD-AUTONOMOUS-SKUNKWORKS-RD-DEPARTMENT-ORCH-001-B
 */

import { createClient } from '@supabase/supabase-js';
import { getLLMClient } from '../../lib/llm/client-factory.js';
import { gatherRdProposals as _gatherRdProposals, renderRdProposals as _renderRdProposals, buildCombinedDecisionPayload as _buildCombinedDecisionPayload, processRdProposalDecision as _processRdProposalDecision } from '../../lib/skunkworks/friday-rd-section.js';
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

// ─── Section 5: R&D Proposals (delegated to lib/skunkworks/friday-rd-section.js)

function gatherRdProposals() {
  return _gatherRdProposals({ supabase, logger });
}

function renderRdProposals(data) {
  return _renderRdProposals(data);
}

// ─── Section 5b: Fleet Telemetry (SD-MAN-INFRA-WORKER-WORKTREE-SELF-001) ───

async function gatherFleetTelemetry() {
  try {
    const { data, error } = await supabase
      .from('fleet_telemetry_weekly')
      .select('*')
      .order('week_start', { ascending: false })
      .limit(4);

    if (error || !data?.length) return null;

    // Also get current active session count
    const { data: activeSessions } = await supabase
      .from('claude_sessions')
      .select('session_id, handoff_fail_count, has_uncommitted_changes, current_phase')
      .eq('status', 'active');

    return {
      weeks: data,
      currentActive: activeSessions?.length || 0,
      currentStrugglingCount: (activeSessions || []).filter(s => (s.handoff_fail_count || 0) > 3).length,
      currentWipCount: (activeSessions || []).filter(s => s.has_uncommitted_changes === true).length
    };
  } catch {
    return null;
  }
}

function renderFleetTelemetry(data) {
  if (!data) return '';

  const lines = ['', '  SECTION 5b: FLEET TELEMETRY', '  ' + '─'.repeat(40)];

  // Current fleet snapshot
  lines.push(`  Active Sessions:     ${data.currentActive}`);
  lines.push(`  With WIP (uncommitted): ${data.currentWipCount}`);
  lines.push(`  Struggling (>3 fails): ${data.currentStrugglingCount}`);
  lines.push('');

  // Weekly trend (last 4 weeks)
  if (data.weeks.length > 0) {
    lines.push('  Weekly Trend:');
    lines.push('  ' + 'Week'.padEnd(14) + 'Sessions'.padEnd(10) + 'WIP'.padEnd(6) + 'Struggling'.padEnd(12) + 'Hours');
    lines.push('  ' + '─'.repeat(48));
    for (const w of data.weeks) {
      const weekLabel = new Date(w.week_start).toISOString().slice(0, 10);
      lines.push('  ' + weekLabel.padEnd(14) + String(w.total_sessions).padEnd(10) + String(w.wip_sessions).padEnd(6) + String(w.struggling_sessions).padEnd(12) + String(w.total_session_hours));
    }
  }

  return lines.join('\n');
}

// ─── Section 5c: Plugin Pipeline ─────────────────────────────

async function gatherPluginDiscoveries() {
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('anthropic_plugin_registry')
      .select('plugin_name, source_repo, status, fitness_score, last_scanned_at, created_at')
      .gte('last_scanned_at', oneWeekAgo)
      .order('status')
      .order('fitness_score', { ascending: false, nullsFirst: false });

    if (error || !data) return null;
    if (data.length === 0) return null;

    const byStatus = {};
    for (const p of data) {
      const s = p.status || 'discovered';
      if (!byStatus[s]) byStatus[s] = [];
      byStatus[s].push(p);
    }

    return { plugins: data, byStatus, total: data.length };
  } catch {
    return null;
  }
}

function renderPluginDiscoveries(data) {
  if (!data) return '';

  const lines = ['', '  SECTION 5c: ANTHROPIC PLUGIN PIPELINE', '  ' + '─'.repeat(40)];
  lines.push(`  Plugins scanned this week: ${data.total}`);
  lines.push('');

  const statusIcons = { discovered: 'NEW', adapted: 'LIVE', evaluating: 'EVAL', rejected: 'SKIP', outdated: 'OLD' };

  for (const [status, plugins] of Object.entries(data.byStatus)) {
    const icon = statusIcons[status] || status.toUpperCase();
    lines.push(`  [${icon}]`);
    for (const p of plugins) {
      const repo = (p.source_repo || '').split('/').pop();
      const score = p.fitness_score != null ? ` (fitness: ${p.fitness_score})` : '';
      lines.push(`    - ${p.plugin_name} (${repo})${score}`);
    }
  }

  return lines.join('\n');
}

// ─── Section 6: Decisions ────────────────────────────────────

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

function buildCombinedDecisionPayload(findings, proposals) {
  return _buildCombinedDecisionPayload(findings, proposals);
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

function processRdProposalDecision(proposalId, decision, notes) {
  return _processRdProposalDecision({ supabase, logger }, proposalId, decision, notes);
}

// ─── Persistence: Fleet Rollup ───────────────────────────────

async function getFleetRollup() {
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [completedRes, activeRes, pendingRes, blockedRes] = await Promise.all([
      supabase.from('strategic_directives_v2')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed')
        .gte('completion_date', oneWeekAgo),
      supabase.from('strategic_directives_v2')
        .select('id', { count: 'exact', head: true })
        .eq('is_working_on', true),
      supabase.from('strategic_directives_v2')
        .select('id', { count: 'exact', head: true })
        .in('status', ['draft', 'ready', 'in_progress'])
        .eq('is_working_on', false),
      supabase.from('strategic_directives_v2')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'blocked'),
    ]);

    return {
      fleet_velocity: completedRes.count || 0,
      active_claims: activeRes.count || 0,
      pending_sds: pendingRes.count || 0,
      blocked_sds: blockedRes.count || 0,
      captured_at: new Date().toISOString(),
    };
  } catch (err) {
    logger.warn(`  Fleet rollup failed (non-blocking): ${err.message}`);
    return {};
  }
}

// ─── Persistence: Meeting Log ────────────────────────────────

async function persistMeetingLog(results, coordinator = {}, { digest = null, chairmanNotes = null } = {}) {
  try {
    const meetingDate = new Date().toISOString().slice(0, 10);

    const record = {
      meeting_date: meetingDate,
      sections: results.sections || {},
      coordinator,
      decisions: results.decisions || {},
      completed_at: new Date().toISOString(),
    };
    if (digest) record.digest = digest;
    if (chairmanNotes) record.chairman_notes = chairmanNotes;

    const { error } = await supabase
      .from('eva_updates')
      .upsert(record, { onConflict: 'meeting_date' });

    if (error) {
      logger.warn(`  Meeting persist failed (non-blocking): ${error.message}`);
      return false;
    }
    logger.log('  ✓ Meeting data persisted to eva_updates');
    return true;
  } catch (err) {
    logger.warn(`  Meeting persist error (non-blocking): ${err.message}`);
    return false;
  }
}

// ─── Digest Generation ──────────────────────────────────────

/**
 * Generate a template-based digest from meeting sections data.
 * Used as fallback when LLM is unavailable.
 */
function templateDigest(sections, coordinator) {
  const parts = [];
  const cap = sections.capability?.completedSDs ?? 0;
  const findings = sections.consultant?.totalFindings ?? 0;
  const intake = sections.intake?.pendingItems ?? 0;
  const velocity = coordinator?.fleet_velocity ?? 0;
  const active = coordinator?.active_claims ?? 0;

  parts.push(`Week of ${new Date().toISOString().slice(0, 10)}: ${cap} SD(s) completed, ${velocity} fleet velocity.`);
  if (findings > 0) parts.push(`${findings} consultant finding(s) pending review.`);
  if (intake > 0) parts.push(`${intake} intake item(s) awaiting triage.`);
  if (active > 0) parts.push(`${active} SD(s) actively claimed.`);

  return parts.join(' ');
}

/**
 * Generate a condensed 2-3 sentence digest of the meeting using local LLM.
 * Falls back to template-based digest on any error.
 *
 * @param {Object} sections - Meeting sections summary
 * @param {Object} coordinator - Fleet rollup metrics
 * @returns {string} Condensed meeting digest
 */
async function generateDigest(sections, coordinator) {
  try {
    const client = getLLMClient({ purpose: 'digest-generation', allowLocal: true });

    const systemPrompt = 'You are a concise executive briefing writer. Produce a 2-3 sentence digest of a weekly strategic meeting. Focus on outcomes, key metrics, and action items. No preamble or formatting — just the digest text.';

    const userPrompt = `Meeting data for ${new Date().toISOString().slice(0, 10)}:
- Completed SDs this week: ${sections.capability?.completedSDs ?? 0}
- Consultant findings pending: ${sections.consultant?.totalFindings ?? 0} across ${sections.consultant?.domains ?? 0} domain(s)
- Intake items pending: ${sections.intake?.pendingItems ?? 0}
- OKR objectives tracked: ${sections.performance?.okrCount ?? 0}
- Fleet velocity: ${coordinator?.fleet_velocity ?? 0} completed, ${coordinator?.active_claims ?? 0} active, ${coordinator?.pending_sds ?? 0} pending, ${coordinator?.blocked_sds ?? 0} blocked

Write a 2-3 sentence executive digest.`;

    const result = await Promise.race([
      client.complete(systemPrompt, userPrompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error('LLM timeout')), 30000))
    ]);

    const text = typeof result === 'string' ? result : result?.text || result?.content || '';
    if (text.trim().length > 10) {
      logger.log('  ✓ Digest generated via LLM');
      return text.trim();
    }

    logger.warn('  ⚠ LLM returned empty digest, using template fallback');
    return templateDigest(sections, coordinator);
  } catch (err) {
    logger.warn(`  ⚠ Digest LLM failed (${err.message}), using template fallback`);
    return templateDigest(sections, coordinator);
  }
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
  const [perfData, capData, consultData, intakeData, rdData, fleetData, pluginData] = await Promise.all([
    gatherPerformanceReview(),
    gatherCapabilityReport(),
    gatherConsultantFindings(),
    gatherIntakeReview(),
    gatherRdProposals(),
    gatherFleetTelemetry(),
    gatherPluginDiscoveries(),
  ]);

  // Render sections 1-5b
  logger.log(renderPerformanceReview(perfData));
  logger.log(renderCapabilityReport(capData));
  logger.log(renderConsultantFindings(consultData));
  logger.log(renderIntakeReview(intakeData));
  logger.log(renderRdProposals(rdData));
  logger.log(renderFleetTelemetry(fleetData));
  logger.log(renderPluginDiscoveries(pluginData));

  // Section 6: Decisions
  logger.log('');
  logger.log('  SECTION 6: DECISIONS');
  logger.log('  ' + '─'.repeat(45));

  const totalDecisionItems = consultData.findings.length + rdData.proposals.length;
  const results = {
    meeting_date: new Date().toISOString(),
    sections: {
      performance: { hasData: !!perfData.review, okrCount: (perfData.objectives || []).length },
      capability: { completedSDs: capData.completedSDs.length },
      consultant: { totalFindings: consultData.findings.length, domains: Object.keys(consultData.grouped).length },
      intake: { pendingItems: intakeData.pending.length },
      rd_proposals: { pendingProposals: rdData.proposals.length, sources: Object.keys(rdData.grouped).length },
      plugin_pipeline: { scannedThisWeek: pluginData?.total || 0 },
    },
    decisions: { accepted: 0, dismissed: 0, deferred: 0, total: totalDecisionItems },
  };

  if (totalDecisionItems === 0) {
    logger.log('  No findings or proposals require decisions this week.');
  } else {
    logger.log(`  ${totalDecisionItems} item(s) require your decision:`);
    if (consultData.findings.length > 0) logger.log(`    - ${consultData.findings.length} consultant finding(s)`);
    if (rdData.proposals.length > 0) logger.log(`    - ${rdData.proposals.length} R&D proposal(s)`);
    logger.log('');

    // Build combined AskUserQuestion payload
    const payload = buildCombinedDecisionPayload(consultData.findings, rdData.proposals);

    if (options.interactive !== false && payload) {
      // Output the payload for Claude Code to pick up
      logger.log('FRIDAY_MEETING_DECISIONS_PAYLOAD=' + JSON.stringify(payload));
      logger.log('');
      logger.log('  Awaiting chairman decisions via AskUserQuestion...');
      logger.log('  (If running non-interactively, all items will be deferred)');
    }
  }

  // Generate digest and gather fleet rollup
  const coordinator = await getFleetRollup();
  const digest = await generateDigest(results.sections, coordinator);

  // Chairman notes prompt (for /friday skill handler to intercept)
  if (options.interactive !== false) {
    logger.log('');
    logger.log('FRIDAY_MEETING_NOTES_PROMPT=' + JSON.stringify({
      question: 'Any observations or notes for this week\'s meeting record?',
      header: 'Chairman Notes (optional)',
      options: [
        { label: 'Skip', description: 'No notes this week' },
      ],
      freeText: true,
    }));
  }

  // Persist meeting data with digest (non-blocking)
  await persistMeetingLog(results, coordinator, { digest });

  results.digest = digest;

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
 * @param {Object} options - { chairmanNotes?: string }
 * @returns {Object} Summary of decisions made
 */
export async function processMeetingDecisions(decisions, { chairmanNotes = null } = {}) {
  const summary = { accepted: 0, dismissed: 0, deferred: 0 };

  for (const { findingId, decision, itemType, notes } of decisions) {
    let result;
    if (itemType === 'rd_proposal') {
      result = await processRdProposalDecision(findingId, decision, notes);
    } else {
      result = await processDecision({ id: findingId }, decision);
    }
    summary[result]++;
  }

  logger.log('\n  MEETING DECISIONS SUMMARY');
  logger.log('  ' + '─'.repeat(45));
  logger.log(`  Accepted:  ${summary.accepted}`);
  logger.log(`  Dismissed: ${summary.dismissed}`);
  logger.log(`  Deferred:  ${summary.deferred}`);
  logger.log('  ' + '─'.repeat(45) + '\n');

  // Update persisted record with decision outcomes and chairman notes
  const meetingDate = new Date().toISOString().slice(0, 10);
  const updatePayload = { decisions: summary };
  if (chairmanNotes) updatePayload.chairman_notes = chairmanNotes;

  await supabase
    .from('eva_updates')
    .update(updatePayload)
    .eq('meeting_date', meetingDate)
    .then(({ error }) => {
      if (error) logger.warn(`  Decision persist failed: ${error.message}`);
      else logger.log('  ✓ Decisions updated in eva_updates');
    });

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
const isDirectRun = process.argv[1] && (import.meta.url === `file://${process.argv[1]}`
  || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`);

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
