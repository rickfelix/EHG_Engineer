#!/usr/bin/env node
/**
 * GATE HEALTH CHECK
 * LEO Protocol Self-Improvement Automation
 *
 * Monitors gate pass rates and auto-creates remediation SDs when thresholds are breached.
 * Integrates with issue_patterns for unified learning.
 *
 * Thresholds for auto-action:
 * - Pass rate < 70% → Create remediation SD
 * - Same failure_reason > 5 times → Link to/create issue_pattern
 * - Week-over-week drop > 20% → Alert + create SD
 *
 * Usage:
 *   node scripts/gate-health-check.js [--dry-run] [--refresh] [--threshold=N]
 *
 * Options:
 *   --dry-run    Preview actions without making changes
 *   --refresh    Refresh materialized view before analysis
 *   --threshold  Custom pass rate threshold (default: 70)
 *
 * Integrates with: pattern-alert-sd-creator.js, generate-claude-md-from-db.js
 */

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// CLI Arguments
const DRY_RUN = process.argv.includes('--dry-run');
const REFRESH = process.argv.includes('--refresh');
const CUSTOM_THRESHOLD = parseInt(process.argv.find(a => a.startsWith('--threshold='))?.split('=')[1] || '0');

/**
 * Configuration
 */
const CONFIG = {
  // Thresholds
  PASS_RATE_THRESHOLD: CUSTOM_THRESHOLD || 70,
  FAILURE_PATTERN_THRESHOLD: 5, // Same failure > 5 times → create pattern
  WEEK_DROP_THRESHOLD: 20, // 20% week-over-week drop → alert
  MIN_ATTEMPTS: 5, // Minimum attempts to consider gate for analysis

  // SD Creation
  SD_PREFIX: 'SD-GATE-FIX',
  SD_PRIORITY: 'high',
  SD_STATUS: 'draft',

  // Gate to category mapping for SDs
  GATE_TO_CATEGORY: {
    '0': 'code_quality',
    '2A': 'testing',
    '2B': 'testing',
    '2C': 'documentation',
    '2D': 'security',
    '3': 'deployment'
  }
};

/**
 * Refresh the materialized view
 */
async function refreshMetrics() {
  console.log('\n🔄 Refreshing gate health metrics...');

  const { error } = await supabase.rpc('refresh_gate_health_metrics');

  if (error) {
    // View might not exist yet, try direct refresh
    const { error: directError } = await supabase.rpc('refresh_materialized_view', {
      view_name: 'v_gate_health_metrics'
    });

    if (directError) {
      console.log('  ⚠️  Could not refresh view (may not exist yet):', directError.message);
      return false;
    }
  }

  console.log('  ✅ Metrics refreshed');
  return true;
}

/**
 * Get gates that need attention
 */
async function getGateAlerts() {
  console.log('\n📊 Analyzing gate health...');

  const { data, error } = await supabase.rpc('get_gate_health_alerts', {
    p_pass_rate_threshold: CONFIG.PASS_RATE_THRESHOLD,
    p_min_attempts: CONFIG.MIN_ATTEMPTS
  });

  if (error) {
    // Fallback to direct query if function doesn't exist
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('v_gate_health_metrics')
      .select('*')
      .lt('pass_rate', CONFIG.PASS_RATE_THRESHOLD)
      .gte('total_attempts', CONFIG.MIN_ATTEMPTS);

    if (fallbackError) {
      console.error('  ❌ Error fetching gate health:', fallbackError.message);
      return [];
    }

    return (fallbackData || []).map(g => ({
      ...g,
      alert_type: g.pass_rate < CONFIG.PASS_RATE_THRESHOLD ? 'LOW_PASS_RATE' : 'MONITOR'
    }));
  }

  return data || [];
}

/**
 * Check for week-over-week drops
 */
async function checkWeekOverWeekDrops() {
  console.log('\n📉 Checking week-over-week trends...');

  const { data, error } = await supabase
    .from('gate_health_history')
    .select('*')
    .gte('week_start', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
    .order('week_start', { ascending: false });

  if (error || !data || data.length === 0) {
    console.log('  ℹ️  Not enough history for trend analysis');
    return [];
  }

  // Group by gate and compare weeks
  const byGate = {};
  data.forEach(row => {
    if (!byGate[row.gate]) byGate[row.gate] = [];
    byGate[row.gate].push(row);
  });

  const drops = [];
  Object.entries(byGate).forEach(([gate, weeks]) => {
    if (weeks.length >= 2) {
      const thisWeek = weeks[0].pass_rate;
      const lastWeek = weeks[1].pass_rate;
      const drop = lastWeek - thisWeek;

      if (drop >= CONFIG.WEEK_DROP_THRESHOLD) {
        drops.push({
          gate,
          thisWeek,
          lastWeek,
          drop,
          alert_type: 'WEEK_OVER_WEEK_DROP'
        });
      }
    }
  });

  if (drops.length > 0) {
    console.log(`  ⚠️  Found ${drops.length} gate(s) with significant drops`);
    drops.forEach(d => {
      console.log(`     • Gate ${d.gate}: ${d.lastWeek}% → ${d.thisWeek}% (↓${d.drop}%)`);
    });
  } else {
    console.log('  ✅ No significant week-over-week drops');
  }

  return drops;
}

/**
 * Check if SD already exists for a gate issue
 */
async function hasExistingSD(gate) {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, legacy_id, status')
    .or(`title.ilike.%Gate ${gate}%,description.ilike.%Gate ${gate}%`)
    .in('status', ['draft', 'active', 'in_progress', 'approved'])
    .limit(1);

  if (error) {
    console.error(`  Error checking existing SD for gate ${gate}:`, error.message);
    return null;
  }

  return data && data.length > 0 ? data[0] : null;
}

/**
 * Create remediation SD for a failing gate
 */
async function createRemediationSD(gateAlert) {
  const gate = gateAlert.gate;
  const existingSD = await hasExistingSD(gate);

  if (existingSD) {
    console.log(`  ℹ️  Gate ${gate}: Existing SD found (${existingSD.legacy_id || existingSD.id})`);
    return null;
  }

  const sdId = `${CONFIG.SD_PREFIX}-${gate}-${Date.now().toString(36).toUpperCase()}`;
  const category = CONFIG.GATE_TO_CATEGORY[gate] || 'quality_assurance';

  const sd = {
    id: sdId,
    legacy_id: sdId,
    title: `Gate ${gate} Health Remediation`,
    description: `Auto-generated SD to address Gate ${gate} performance issues.\n\n` +
      '**Current State:**\n' +
      `- Pass Rate: ${gateAlert.pass_rate}% (threshold: ${CONFIG.PASS_RATE_THRESHOLD}%)\n` +
      `- Total Attempts: ${gateAlert.total_attempts}\n` +
      `- Failures: ${gateAlert.failures}\n` +
      `- Avg Score: ${gateAlert.avg_score}\n\n` +
      '**Top Failure Reasons:**\n' +
      (gateAlert.top_failure_reasons
        ? JSON.parse(gateAlert.top_failure_reasons).map(r => `- ${r}`).join('\n')
        : '- Unknown') +
      `\n\n**Alert Type:** ${gateAlert.alert_type}\n` +
      '\n_Auto-generated by gate-health-check.js_',
    status: CONFIG.SD_STATUS,
    priority: CONFIG.SD_PRIORITY,
    category: category,
    scope: `Improve Gate ${gate} pass rate from ${gateAlert.pass_rate}% to ≥${CONFIG.PASS_RATE_THRESHOLD}%`,
    strategic_objectives: [
      `Increase Gate ${gate} pass rate to ≥${CONFIG.PASS_RATE_THRESHOLD}%`,
      'Address root causes of gate failures',
      'Update validation rules if overly strict'
    ],
    success_criteria: [
      `Gate ${gate} pass rate ≥${CONFIG.PASS_RATE_THRESHOLD}% for 2 consecutive weeks`,
      'No recurring failure patterns',
      'Gate health documented in retrospective'
    ],
    key_principles: [
      'Fix root causes, not symptoms',
      'Update validation rules if too strict',
      'Document learnings in issue_patterns'
    ],
    rationale: `Gate ${gate} has fallen below the ${CONFIG.PASS_RATE_THRESHOLD}% pass rate threshold, ` +
      'indicating systemic issues that need remediation.',
    metadata: {
      auto_generated: true,
      source: 'gate-health-check.js',
      gate: gate,
      alert_type: gateAlert.alert_type,
      metrics_at_creation: {
        pass_rate: gateAlert.pass_rate,
        total_attempts: gateAlert.total_attempts,
        failures: gateAlert.failures,
        avg_score: gateAlert.avg_score
      },
      created_at: new Date().toISOString()
    },
    is_active: true,
    current_phase: 'LEAD_APPROVAL',
    sd_type: 'quick-fix'
  };

  if (DRY_RUN) {
    console.log(`  🔍 [DRY RUN] Would create SD: ${sdId}`);
    console.log(`     Title: ${sd.title}`);
    console.log(`     Category: ${category}`);
    return sd;
  }

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(sd)
    .select()
    .single();

  if (error) {
    console.error(`  ❌ Error creating SD for gate ${gate}:`, error.message);
    return null;
  }

  console.log(`  ✅ Created SD: ${sdId}`);
  return data;
}

/**
 * Link gate failure to issue_patterns
 */
async function linkToIssuePattern(gateAlert) {
  if (!gateAlert.top_failure_reasons) return;

  const reasons = JSON.parse(gateAlert.top_failure_reasons);

  for (const reason of reasons.slice(0, 3)) { // Top 3 reasons
    if (!reason) continue;

    // Check if pattern already exists
    const { data: existing } = await supabase
      .from('issue_patterns')
      .select('id, occurrence_count')
      .ilike('issue_summary', `%${reason.substring(0, 50)}%`)
      .limit(1);

    if (existing && existing.length > 0) {
      // Update occurrence count
      if (!DRY_RUN) {
        await supabase
          .from('issue_patterns')
          .update({
            occurrence_count: existing[0].occurrence_count + 1,
            last_seen_sd_id: `GATE-${gateAlert.gate}`,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing[0].id);
      }
      console.log(`  📎 Linked to existing pattern: ${existing[0].id}`);
    } else {
      // Create new pattern if failures exceed threshold
      if (gateAlert.failures >= CONFIG.FAILURE_PATTERN_THRESHOLD) {
        if (!DRY_RUN) {
          const { data: newPattern } = await supabase
            .from('issue_patterns')
            .insert({
              category: CONFIG.GATE_TO_CATEGORY[gateAlert.gate] || 'general',
              severity: gateAlert.pass_rate < 50 ? 'critical' : 'high',
              issue_summary: `Gate ${gateAlert.gate}: ${reason}`,
              root_cause: `Recurring failure in Gate ${gateAlert.gate} validation`,
              prevention_checklist: [
                'Review gate validation rules',
                'Check for overly strict criteria',
                'Update documentation if rules unclear'
              ],
              occurrence_count: gateAlert.failures,
              first_seen_sd_id: `GATE-${gateAlert.gate}`,
              last_seen_sd_id: `GATE-${gateAlert.gate}`,
              trend: 'stable',
              status: 'active'
            })
            .select()
            .single();

          if (newPattern) {
            console.log(`  🆕 Created issue pattern: ${newPattern.id}`);
          }
        } else {
          console.log(`  🔍 [DRY RUN] Would create issue pattern for: ${reason}`);
        }
      }
    }
  }
}

/**
 * Record gate failure pattern for tracking
 */
async function recordFailurePattern(gateAlert) {
  if (!gateAlert.top_failure_reasons) return;

  const reasons = JSON.parse(gateAlert.top_failure_reasons);

  for (const reason of reasons.slice(0, 3)) {
    if (!reason || DRY_RUN) continue;

    await supabase.rpc('record_gate_failure_pattern', {
      p_gate: gateAlert.gate,
      p_failure_signature: reason,
      p_evidence: {
        pass_rate: gateAlert.pass_rate,
        total_attempts: gateAlert.total_attempts,
        recorded_at: new Date().toISOString()
      }
    });
  }
}

/**
 * Generate summary report
 */
function generateReport(alerts, drops, createdSDs) {
  console.log('\n' + '═'.repeat(60));
  console.log('📋 GATE HEALTH CHECK SUMMARY');
  console.log('═'.repeat(60));

  console.log('\n🎯 Thresholds:');
  console.log(`   Pass Rate: ≥${CONFIG.PASS_RATE_THRESHOLD}%`);
  console.log(`   Min Attempts: ${CONFIG.MIN_ATTEMPTS}`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

  console.log('\n📊 Findings:');
  console.log(`   Gates below threshold: ${alerts.length}`);
  console.log(`   Week-over-week drops: ${drops.length}`);
  console.log(`   SDs created: ${createdSDs.length}`);

  if (alerts.length > 0) {
    console.log('\n⚠️  Gates Needing Attention:');
    alerts.forEach(a => {
      console.log(`   • Gate ${a.gate}: ${a.pass_rate}% pass rate (${a.failures}/${a.total_attempts} failures)`);
    });
  }

  if (createdSDs.length > 0) {
    console.log('\n🆕 Created SDs:');
    createdSDs.forEach(sd => {
      console.log(`   • ${sd.id || sd.legacy_id}: ${sd.title}`);
    });
  }

  console.log('\n' + '═'.repeat(60));

  // Output for GitHub Actions
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT,
      `alerts_count=${alerts.length}\n` +
      `drops_count=${drops.length}\n` +
      `sds_created=${createdSDs.length}\n`
    );
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🏥 GATE HEALTH CHECK');
  console.log('═'.repeat(60));
  console.log(`Timestamp: ${new Date().toISOString()}`);

  // Refresh metrics if requested
  if (REFRESH) {
    await refreshMetrics();
  }

  // Get alerts
  const alerts = await getGateAlerts();
  const drops = await checkWeekOverWeekDrops();

  // Combine alerts and drops
  const allIssues = [...alerts];
  drops.forEach(d => {
    if (!allIssues.find(a => a.gate === d.gate)) {
      allIssues.push(d);
    }
  });

  if (allIssues.length === 0) {
    console.log('\n✅ All gates are healthy!');
    generateReport([], [], []);
    return;
  }

  console.log(`\n🔍 Found ${allIssues.length} gate(s) needing attention`);

  // Process each issue
  const createdSDs = [];

  for (const issue of allIssues) {
    console.log(`\n📍 Processing Gate ${issue.gate}...`);

    // Record failure patterns
    await recordFailurePattern(issue);

    // Link to issue_patterns
    await linkToIssuePattern(issue);

    // Create SD if pass rate is critically low
    if (issue.pass_rate < CONFIG.PASS_RATE_THRESHOLD || issue.alert_type === 'WEEK_OVER_WEEK_DROP') {
      const sd = await createRemediationSD(issue);
      if (sd) createdSDs.push(sd);
    }
  }

  generateReport(alerts, drops, createdSDs);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
