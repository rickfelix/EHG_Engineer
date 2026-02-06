#!/usr/bin/env node
/**
 * LEO Self-Improvement Analytics Dashboard
 * SD-LEO-ORCH-SELF-IMPROVING-LEO-001-E
 *
 * Displays metrics dashboard covering:
 *   - Feedback pipeline (leo_feedback)
 *   - Enhancement outcomes (enhancement_proposals)
 *   - Pattern resolution (issue_patterns)
 *   - Vetting coverage (leo_vetting_outcomes)
 *
 * Usage:
 *   node scripts/leo-analytics.js              # Concise dashboard
 *   node scripts/leo-analytics.js --verbose     # Detailed metrics
 *   node scripts/leo-analytics.js --format json # JSON output
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const jsonOutput = args.includes('--format') && args[args.indexOf('--format') + 1] === 'json';

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    process.stderr.write('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set\n');
    process.exit(1);
  }

  const supabase = createClient(url, key);

  // Query all metrics sources in parallel
  const [feedbackResult, proposalsResult, patternsResult, vettingResult] = await Promise.all([
    supabase.from('leo_feedback').select('id, status, created_at, updated_at, category, priority'),
    supabase.from('enhancement_proposals').select('id, status, created_at, vetted_at, approved_at, applied_at, source_type'),
    supabase.from('issue_patterns').select('id, status, severity, occurrence_count, created_at, resolution_date, category, trend'),
    supabase.from('leo_vetting_outcomes').select('id, rubric_score, verdict, processed_by, created_at, proposal_id')
  ]);

  const feedback = feedbackResult.data || [];
  const proposals = proposalsResult.data || [];
  const patterns = patternsResult.data || [];
  const vetting = vettingResult.data || [];

  const metrics = buildMetrics(feedback, proposals, patterns, vetting);

  if (jsonOutput) {
    process.stdout.write(JSON.stringify(metrics, null, 2) + '\n');
    return;
  }

  printDashboard(metrics);
}

function buildMetrics(feedback, proposals, patterns, vetting) {
  // Feedback pipeline
  const feedbackTotal = feedback.length;
  const feedbackProcessed = feedback.filter(f => f.status === 'processed' || f.status === 'completed' || f.status === 'resolved').length;
  const feedbackResolutionRate = feedbackTotal > 0 ? ((feedbackProcessed / feedbackTotal) * 100).toFixed(1) : '0.0';
  const feedbackByCategory = {};
  for (const f of feedback) {
    const cat = f.category || 'uncategorized';
    feedbackByCategory[cat] = (feedbackByCategory[cat] || 0) + 1;
  }

  // Enhancement outcomes
  const proposalTotal = proposals.length;
  const proposalVetted = proposals.filter(p => p.vetted_at).length;
  const proposalApproved = proposals.filter(p => p.approved_at).length;
  const proposalApplied = proposals.filter(p => p.applied_at).length;
  const approvalRate = proposalVetted > 0 ? ((proposalApproved / proposalVetted) * 100).toFixed(1) : '0.0';
  const implementationRate = proposalApproved > 0 ? ((proposalApplied / proposalApproved) * 100).toFixed(1) : '0.0';

  // Pattern resolution
  const patternTotal = patterns.length;
  const patternResolved = patterns.filter(p => p.status === 'resolved').length;
  const patternActive = patterns.filter(p => p.status !== 'resolved').length;
  const patternRecurring = patterns.filter(p => (p.occurrence_count || 0) > 2).length;
  const topUnresolved = patterns
    .filter(p => p.status !== 'resolved')
    .sort((a, b) => (b.occurrence_count || 0) - (a.occurrence_count || 0))
    .slice(0, 5);
  const bySeverity = {};
  for (const p of patterns) {
    const sev = p.severity || 'unknown';
    bySeverity[sev] = (bySeverity[sev] || 0) + 1;
  }

  // Vetting coverage
  const vettingTotal = vetting.length;
  const avgRubricScore = vettingTotal > 0
    ? (vetting.reduce((sum, v) => sum + (v.rubric_score || 0), 0) / vettingTotal).toFixed(1)
    : '0.0';
  const approvedVetting = vetting.filter(v => v.verdict === 'approved' || v.verdict === 'APPROVED').length;
  const rejectedVetting = vetting.filter(v => v.verdict === 'rejected' || v.verdict === 'REJECTED').length;
  const vettingApprovalRate = vettingTotal > 0 ? ((approvedVetting / vettingTotal) * 100).toFixed(1) : '0.0';

  return {
    feedback: {
      total: feedbackTotal,
      processed: feedbackProcessed,
      resolutionRate: feedbackResolutionRate,
      byCategory: feedbackByCategory
    },
    enhancements: {
      total: proposalTotal,
      vetted: proposalVetted,
      approved: proposalApproved,
      applied: proposalApplied,
      approvalRate,
      implementationRate
    },
    patterns: {
      total: patternTotal,
      resolved: patternResolved,
      active: patternActive,
      recurring: patternRecurring,
      bySeverity,
      topUnresolved
    },
    vetting: {
      total: vettingTotal,
      avgRubricScore,
      approved: approvedVetting,
      rejected: rejectedVetting,
      approvalRate: vettingApprovalRate
    }
  };
}

function printDashboard(m) {
  const lines = [];
  lines.push('');
  lines.push('='.repeat(60));
  lines.push('  LEO SELF-IMPROVEMENT ANALYTICS DASHBOARD');
  lines.push('='.repeat(60));
  lines.push(`  Generated: ${new Date().toISOString()}`);
  lines.push('');

  // Feedback Pipeline
  lines.push('-'.repeat(60));
  lines.push('  FEEDBACK PIPELINE');
  lines.push('-'.repeat(60));
  lines.push(`  Total Items:      ${m.feedback.total}`);
  lines.push(`  Processed:        ${m.feedback.processed}`);
  lines.push(`  Resolution Rate:  ${m.feedback.resolutionRate}%`);
  if (verbose && Object.keys(m.feedback.byCategory).length > 0) {
    lines.push('  By Category:');
    for (const [cat, count] of Object.entries(m.feedback.byCategory).sort((a, b) => b[1] - a[1])) {
      lines.push(`    ${cat}: ${count}`);
    }
  }
  if (m.feedback.total === 0) {
    lines.push('  No feedback items recorded yet.');
  }
  lines.push('');

  // Enhancement Outcomes
  lines.push('-'.repeat(60));
  lines.push('  ENHANCEMENT OUTCOMES');
  lines.push('-'.repeat(60));
  lines.push(`  Proposals Created:    ${m.enhancements.total}`);
  lines.push(`  Vetted:               ${m.enhancements.vetted}`);
  lines.push(`  Approved:             ${m.enhancements.approved}`);
  lines.push(`  Applied:              ${m.enhancements.applied}`);
  lines.push(`  Approval Rate:        ${m.enhancements.approvalRate}%`);
  lines.push(`  Implementation Rate:  ${m.enhancements.implementationRate}%`);
  if (m.enhancements.total === 0) {
    lines.push('  No enhancement proposals yet. Run /learn to generate proposals.');
  }
  lines.push('');

  // Pattern Resolution
  lines.push('-'.repeat(60));
  lines.push('  PATTERN RESOLUTION');
  lines.push('-'.repeat(60));
  lines.push(`  Total Patterns:   ${m.patterns.total}`);
  lines.push(`  Resolved:         ${m.patterns.resolved}`);
  lines.push(`  Active:           ${m.patterns.active}`);
  lines.push(`  Recurring (>2x):  ${m.patterns.recurring}`);
  if (Object.keys(m.patterns.bySeverity).length > 0) {
    lines.push(`  By Severity:      ${Object.entries(m.patterns.bySeverity).map(([s, c]) => `${s}:${c}`).join('  ')}`);
  }
  if (verbose && m.patterns.topUnresolved.length > 0) {
    lines.push('  Top Unresolved:');
    for (const p of m.patterns.topUnresolved) {
      lines.push(`    [${(p.severity || '?').toUpperCase()}] ${p.category}: ${p.occurrence_count || 0}x occurrences`);
    }
  }
  if (m.patterns.total === 0) {
    lines.push('  No issue patterns tracked yet. Patterns are auto-created by /learn and /rca.');
  }
  lines.push('');

  // Vetting Coverage
  lines.push('-'.repeat(60));
  lines.push('  VETTING COVERAGE');
  lines.push('-'.repeat(60));
  lines.push(`  Proposals Vetted:   ${m.vetting.total}`);
  lines.push(`  Avg Rubric Score:   ${m.vetting.avgRubricScore}`);
  lines.push(`  Approved:           ${m.vetting.approved}`);
  lines.push(`  Rejected:           ${m.vetting.rejected}`);
  lines.push(`  Approval Rate:      ${m.vetting.approvalRate}%`);
  if (m.vetting.total === 0) {
    lines.push('  No vetting outcomes recorded yet. Vetting runs on enhancement proposals.');
  }
  lines.push('');

  lines.push('='.repeat(60));
  lines.push('  Run with --verbose for detailed breakdowns');
  lines.push('  Run with --format json for machine-readable output');
  lines.push('='.repeat(60));
  lines.push('');

  process.stdout.write(lines.join('\n'));
}

main().catch(err => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
