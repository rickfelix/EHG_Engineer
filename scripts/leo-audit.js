#!/usr/bin/env node
/**
 * LEO Audit Discovery Report
 * SD-LEO-ORCH-SELF-IMPROVING-LEO-001-E
 *
 * Queries issue_patterns, retrospectives, and compliance_alerts
 * to display a formatted audit report for protocol improvement.
 *
 * Usage:
 *   node scripts/leo-audit.js              # Concise report
 *   node scripts/leo-audit.js --verbose     # Detailed report
 *   node scripts/leo-audit.js --format json # JSON output
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

  // Query all sections in parallel
  const [patternsResult, alertsResult, retrosResult] = await Promise.all([
    supabase
      .from('issue_patterns')
      .select('pattern_id, category, severity, issue_summary, occurrence_count, status, trend, created_at, updated_at, proven_solutions, last_seen_sd_id')
      .order('occurrence_count', { ascending: false })
      .limit(100),
    supabase
      .from('compliance_alerts')
      .select('alert_type, severity, message, resolved, created_at, resolution_notes')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('retrospectives')
      .select('sd_id, title, quality_score, what_needs_improvement, action_items, key_learnings, created_at')
      .order('created_at', { ascending: false })
      .limit(10)
  ]);

  const patterns = patternsResult.data || [];
  const alerts = alertsResult.data || [];
  const retros = retrosResult.data || [];

  if (jsonOutput) {
    process.stdout.write(JSON.stringify({ patterns, alerts, retros }, null, 2) + '\n');
    return;
  }

  // --- Text output ---
  const lines = [];
  lines.push('');
  lines.push('='.repeat(60));
  lines.push('  LEO AUDIT DISCOVERY REPORT');
  lines.push('='.repeat(60));
  lines.push(`  Generated: ${new Date().toISOString()}`);
  lines.push('');

  // Section 1: Issue Patterns
  const activePatterns = patterns.filter(p => p.status !== 'resolved');
  const resolvedPatterns = patterns.filter(p => p.status === 'resolved');

  lines.push('-'.repeat(60));
  lines.push('  ISSUE PATTERNS');
  lines.push('-'.repeat(60));
  lines.push(`  Active: ${activePatterns.length}  |  Resolved: ${resolvedPatterns.length}  |  Total: ${patterns.length}`);
  lines.push('');

  if (activePatterns.length === 0) {
    lines.push('  No active issue patterns. The protocol is running clean.');
    lines.push('');
  } else {
    for (const p of activePatterns) {
      const severity = (p.severity || 'unknown').toUpperCase();
      const trend = p.trend ? ` [${p.trend}]` : '';
      lines.push(`  [${severity}] ${p.issue_summary || p.pattern_id}`);
      lines.push(`    Occurrences: ${p.occurrence_count || 0}  |  Category: ${p.category || 'uncategorized'}${trend}`);
      if (verbose && p.proven_solutions?.length) {
        lines.push(`    Solutions: ${Array.isArray(p.proven_solutions) ? p.proven_solutions.slice(0, 2).join('; ') : p.proven_solutions}`);
      }
      lines.push('');
    }
  }

  // Section 2: Compliance Alerts
  const unresolvedAlerts = alerts.filter(a => !a.resolved);
  const resolvedAlerts = alerts.filter(a => a.resolved);

  lines.push('-'.repeat(60));
  lines.push('  COMPLIANCE ALERTS');
  lines.push('-'.repeat(60));
  lines.push(`  Unresolved: ${unresolvedAlerts.length}  |  Resolved: ${resolvedAlerts.length}  |  Total: ${alerts.length}`);
  lines.push('');

  if (unresolvedAlerts.length === 0 && alerts.length === 0) {
    lines.push('  No compliance alerts recorded.');
    lines.push('');
  } else if (unresolvedAlerts.length === 0) {
    lines.push('  All compliance alerts have been resolved.');
    lines.push('');
  } else {
    for (const a of unresolvedAlerts) {
      const severity = (a.severity || 'info').toUpperCase();
      lines.push(`  [${severity}] ${a.alert_type}: ${a.message}`);
      if (verbose) {
        lines.push(`    Created: ${new Date(a.created_at).toLocaleDateString()}`);
      }
      lines.push('');
    }
  }

  // Section 3: Retrospective Insights
  lines.push('-'.repeat(60));
  lines.push('  RETROSPECTIVE INSIGHTS (Last 10)');
  lines.push('-'.repeat(60));

  if (retros.length === 0) {
    lines.push('  No retrospectives found. Run /learn after completing SDs.');
    lines.push('');
  } else {
    const avgQuality = retros.reduce((sum, r) => sum + (r.quality_score || 0), 0) / retros.length;
    lines.push(`  Average Quality Score: ${avgQuality.toFixed(1)}/100`);
    lines.push('');

    for (const r of retros.slice(0, verbose ? 10 : 5)) {
      lines.push(`  ${r.sd_id || 'Unknown SD'}: ${r.title || 'Untitled'}`);
      lines.push(`    Quality: ${r.quality_score || 'N/A'}  |  Date: ${new Date(r.created_at).toLocaleDateString()}`);
      if (verbose && r.key_learnings?.length) {
        const learnings = Array.isArray(r.key_learnings) ? r.key_learnings : [r.key_learnings];
        for (const l of learnings.slice(0, 2)) {
          lines.push(`    Learning: ${typeof l === 'string' ? l.substring(0, 80) : JSON.stringify(l).substring(0, 80)}`);
        }
      }
      lines.push('');
    }
  }

  lines.push('='.repeat(60));
  lines.push('  Run with --verbose for detailed output');
  lines.push('  Run with --format json for machine-readable output');
  lines.push('='.repeat(60));
  lines.push('');

  process.stdout.write(lines.join('\n'));
}

main().catch(err => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
