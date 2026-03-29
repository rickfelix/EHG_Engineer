#!/usr/bin/env node
/**
 * PCVP Anomaly Detection & Triage Report
 * SD: SD-LEO-PROTOCOL-PCVP-COMPLETION-INTEGRITY-001-C
 *
 * Scans completed SDs for anomalous completions:
 * - Zero handoff records
 * - Missing PR merge evidence (code-producing types)
 * - Suspiciously fast completions
 *
 * Generates a prioritized triage report for Chairman review.
 *
 * Usage:
 *   node scripts/pcvp-anomaly-detection.cjs                    # Full scan + report
 *   node scripts/pcvp-anomaly-detection.cjs --summary          # Summary only
 *   node scripts/pcvp-anomaly-detection.cjs --limit 100        # Scan last 100 SDs
 *   node scripts/pcvp-anomaly-detection.cjs --type feature     # Filter by type
 *   node scripts/pcvp-anomaly-detection.cjs --json             # Machine-readable
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CODE_PRODUCING_TYPES = ['feature', 'infrastructure', 'fix', 'refactor', 'security', 'enhancement', 'performance', 'bugfix'];

// Tiered verification thresholds (tunable)
const VERIFICATION_CONFIG = {
  high: { min_handoffs: 3, require_pr: true, types: ['feature', 'security', 'bugfix'] },
  standard: { min_handoffs: 2, require_pr: true, types: ['infrastructure', 'refactor', 'enhancement', 'performance'] },
  light: { min_handoffs: 1, require_pr: false, types: ['orchestrator', 'documentation', 'database'] },
};

function getTier(sdType) {
  for (const [tier, config] of Object.entries(VERIFICATION_CONFIG)) {
    if (config.types.includes(sdType)) return { tier, ...config };
  }
  return { tier: 'standard', min_handoffs: 2, require_pr: true };
}

async function scanCompletedSDs(options = {}) {
  const { limit = 200, sdType, since } = options;

  let query = supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, sd_type, status, current_phase, category, priority, created_at, updated_at, completion_date')
    .eq('status', 'completed')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (sdType) query = query.eq('sd_type', sdType);
  if (since) query = query.gte('updated_at', since);

  const { data: sds, error } = await query;
  if (error) { console.error('Query error:', error.message); return []; }
  return sds || [];
}

async function detectAnomalies(sds) {
  const anomalies = [];

  for (const sd of sds) {
    const tierConfig = getTier(sd.sd_type);
    const issues = [];

    // Check handoff records
    const { data: handoffs } = await supabase
      .from('sd_phase_handoffs')
      .select('id, handoff_type, status')
      .eq('sd_id', sd.id)
      .eq('status', 'accepted');

    const handoffCount = handoffs?.length || 0;

    if (handoffCount === 0) {
      issues.push({
        type: 'zero_handoffs',
        severity: 'critical',
        detail: 'No accepted handoff records found',
        expected: `At least ${tierConfig.min_handoffs} for ${sd.sd_type} (${tierConfig.tier} tier)`
      });
    } else if (handoffCount < tierConfig.min_handoffs) {
      issues.push({
        type: 'insufficient_handoffs',
        severity: 'warning',
        detail: `Only ${handoffCount} handoff(s), expected ${tierConfig.min_handoffs}+`,
        expected: `${tierConfig.min_handoffs} for ${sd.sd_type} (${tierConfig.tier} tier)`
      });
    }

    // Check PR evidence for code-producing types
    if (tierConfig.require_pr && CODE_PRODUCING_TYPES.includes(sd.sd_type)) {
      const { data: shipping } = await supabase
        .from('shipping_decisions')
        .select('id, decision_type')
        .or(`sd_id.eq.${sd.id},sd_id.eq.${sd.sd_key || ''}`)
        .eq('decision_type', 'PR_MERGE');

      if (!shipping || shipping.length === 0) {
        issues.push({
          type: 'missing_pr_evidence',
          severity: sd.sd_type === 'feature' ? 'critical' : 'warning',
          detail: 'No PR merge evidence in shipping_decisions'
        });
      }
    }

    if (issues.length > 0) {
      anomalies.push({
        sd_key: sd.sd_key,
        sd_type: sd.sd_type,
        title: sd.title?.substring(0, 60),
        tier: tierConfig.tier,
        category: sd.category,
        priority: sd.priority,
        handoff_count: handoffCount,
        completed_at: sd.completion_date || sd.updated_at,
        issues
      });
    }
  }

  return anomalies;
}

function prioritizeAnomalies(anomalies) {
  const priorityMap = { critical: 4, high: 3, medium: 2, low: 1 };
  const tierMap = { high: 3, standard: 2, light: 1 };

  return anomalies.sort((a, b) => {
    // Critical issues first
    const aCrit = a.issues.some(i => i.severity === 'critical') ? 1 : 0;
    const bCrit = b.issues.some(i => i.severity === 'critical') ? 1 : 0;
    if (aCrit !== bCrit) return bCrit - aCrit;

    // Then by tier (high-tier SDs are more important)
    const aTier = tierMap[a.tier] || 0;
    const bTier = tierMap[b.tier] || 0;
    if (aTier !== bTier) return bTier - aTier;

    // Then by recency
    return new Date(b.completed_at) - new Date(a.completed_at);
  });
}

function generateReport(anomalies, total, options = {}) {
  const critical = anomalies.filter(a => a.issues.some(i => i.severity === 'critical'));
  const warnings = anomalies.filter(a => !a.issues.some(i => i.severity === 'critical'));

  if (options.json) {
    console.log(JSON.stringify({
      scan_date: new Date().toISOString(),
      total_scanned: total,
      total_anomalies: anomalies.length,
      critical_count: critical.length,
      warning_count: warnings.length,
      integrity_rate: total > 0 ? Math.round(100 * (total - anomalies.length) / total) : 100,
      anomalies
    }, null, 2));
    return;
  }

  console.log(`\nPCVP Anomaly Detection Report`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Scan Date: ${new Date().toISOString()}`);
  console.log(`  SDs Scanned: ${total}`);
  console.log(`  Anomalies Found: ${anomalies.length}`);
  console.log(`  Critical: ${critical.length}`);
  console.log(`  Warning: ${warnings.length}`);
  console.log(`  Integrity Rate: ${total > 0 ? Math.round(100 * (total - anomalies.length) / total) : 100}%`);
  console.log();

  if (options.summary) {
    // Summary by type
    const byType = {};
    anomalies.forEach(a => {
      byType[a.sd_type] = (byType[a.sd_type] || 0) + 1;
    });
    console.log(`  By SD Type:`);
    Object.entries(byType).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
      console.log(`    ${type}: ${count} anomalies`);
    });
    console.log(`${'='.repeat(60)}`);
    return;
  }

  if (critical.length > 0) {
    console.log(`  CRITICAL ANOMALIES (Chairman Review Required)`);
    console.log(`  ${'─'.repeat(56)}`);
    critical.forEach((a, i) => {
      console.log(`  ${i + 1}. ${a.sd_key} (${a.sd_type}, ${a.tier} tier)`);
      console.log(`     ${a.title}`);
      a.issues.filter(is => is.severity === 'critical').forEach(is => {
        console.log(`     ❌ ${is.detail}`);
      });
      console.log();
    });
  }

  if (warnings.length > 0) {
    console.log(`  WARNINGS (Review Recommended)`);
    console.log(`  ${'─'.repeat(56)}`);
    warnings.slice(0, 20).forEach((a, i) => {
      console.log(`  ${i + 1}. ${a.sd_key} (${a.sd_type}) - ${a.issues.length} issue(s)`);
    });
    if (warnings.length > 20) {
      console.log(`  ... and ${warnings.length - 20} more`);
    }
  }

  console.log();
  console.log(`${'='.repeat(60)}`);

  // Log to pcvp_verification_log
  supabase.from('pcvp_verification_log').insert({
    sd_id: 'SYSTEM',
    sd_key: 'PCVP-ANOMALY-SCAN',
    event_type: 'anomaly_detected',
    event_data: {
      total_scanned: total,
      anomalies_found: anomalies.length,
      critical_count: critical.length,
      scan_date: new Date().toISOString()
    },
    verification_score: total > 0 ? Math.round(100 * (total - anomalies.length) / total) : 100,
    created_by: 'PCVP_ANOMALY_DETECTOR'
  }).then(() => {});
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const options = {
    limit: 200,
    summary: args.includes('--summary'),
    json: args.includes('--json'),
    sdType: null,
    since: null
  };

  const limitIdx = args.indexOf('--limit');
  if (limitIdx !== -1 && args[limitIdx + 1]) options.limit = parseInt(args[limitIdx + 1]);

  const typeIdx = args.indexOf('--type');
  if (typeIdx !== -1 && args[typeIdx + 1]) options.sdType = args[typeIdx + 1];

  const sds = await scanCompletedSDs(options);
  const anomalies = await detectAnomalies(sds);
  const prioritized = prioritizeAnomalies(anomalies);

  generateReport(prioritized, sds.length, options);
}

main();
