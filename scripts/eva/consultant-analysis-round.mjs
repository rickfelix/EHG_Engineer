/**
 * Consultant Analysis Round — Monday Internal Strategic Auditor
 *
 * EvaMasterScheduler round (weekly cadence) that analyzes 7 internal domains:
 * 1. Retrospective mining
 * 2. Gate calibration intelligence
 * 3. Capability delivery tracking
 * 4. Venture stage readiness
 * 5. Protocol health
 * 6. Cross-venture capability reuse detection
 * 7. OKR drift detection
 *
 * Registration: Import registerConsultantAnalysisRound(scheduler) during init.
 * Manual trigger: node scripts/eva/consultant-analysis-round.mjs
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import dotenv from 'dotenv';
import { processFindings } from '../../lib/eva/consultant/confidence-engine.js';

dotenv.config();

const supabase = createSupabaseServiceClient();

const LOOKBACK_DAYS = 30;
const TODAY = new Date().toISOString().split('T')[0];

function cutoffDate(days = LOOKBACK_DAYS) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

// ─── Domain 1: Retrospective Mining ───────────────────────────
async function analyzeRetrospectives() {
  const { data: retros } = await supabase
    .from('retrospectives')
    .select('id, sd_id, key_learnings, improvement_areas, action_items, quality_score, created_at')
    .gte('created_at', cutoffDate())
    .order('created_at', { ascending: false })
    .limit(50);

  if (!retros || retros.length === 0) return [];

  // Extract recurring themes from key_learnings
  const themes = {};
  for (const retro of retros) {
    const learnings = retro.key_learnings || [];
    for (const learning of learnings) {
      const text = typeof learning === 'string' ? learning : learning.learning || learning.description || '';
      const normalized = text.toLowerCase().trim().substring(0, 100);
      if (!normalized) continue;
      if (!themes[normalized]) themes[normalized] = { text, count: 0, sources: [] };
      themes[normalized].count++;
      themes[normalized].sources.push(retro.id);
    }
  }

  // Also track low quality scores
  const lowQuality = retros.filter(r => r.quality_score && r.quality_score < 60);

  const findings = [];

  // Recurring learnings (≥2 appearances = pattern)
  for (const [key, theme] of Object.entries(themes)) {
    if (theme.count >= 2) {
      findings.push({
        title: `Recurring retrospective theme: ${theme.text.substring(0, 80)}`,
        description: `Found ${theme.count} times across ${theme.sources.length} retrospectives in the last ${LOOKBACK_DAYS} days`,
        dataPoints: theme.count,
        domain: 'retrospective_mining',
        sources: theme.sources.slice(0, 5),
      });
    }
  }

  if (lowQuality.length >= 3) {
    findings.push({
      title: 'Pattern of low-quality retrospectives detected',
      description: `${lowQuality.length} retrospectives scored below 60% in the last ${LOOKBACK_DAYS} days`,
      dataPoints: lowQuality.length,
      domain: 'retrospective_mining',
      sources: lowQuality.map(r => r.id).slice(0, 5),
    });
  }

  return findings;
}

// ─── Domain 2: Gate Calibration Intelligence ──────────────────
async function analyzeGateCalibration() {
  const { data: handoffs } = await supabase
    .from('sd_phase_handoffs')
    .select('id, sd_id, from_phase, to_phase, status, validation_score, created_at')
    .gte('created_at', cutoffDate())
    .order('created_at', { ascending: false })
    .limit(100);

  if (!handoffs || handoffs.length === 0) return [];

  const findings = [];
  const rejected = handoffs.filter(h => h.status === 'rejected');
  const accepted = handoffs.filter(h => h.status === 'accepted');

  // High rejection rate for specific transitions
  const byTransition = {};
  for (const h of handoffs) {
    const key = `${h.from_phase}->${h.to_phase}`;
    if (!byTransition[key]) byTransition[key] = { total: 0, rejected: 0 };
    byTransition[key].total++;
    if (h.status === 'rejected') byTransition[key].rejected++;
  }

  for (const [transition, stats] of Object.entries(byTransition)) {
    if (stats.total >= 3 && stats.rejected / stats.total > 0.4) {
      findings.push({
        title: `High rejection rate for ${transition} handoff`,
        description: `${stats.rejected}/${stats.total} (${Math.round(stats.rejected / stats.total * 100)}%) rejected. Gate may be too strict or SD preparation is insufficient.`,
        dataPoints: stats.total,
        domain: 'gate_calibration',
        sources: [],
      });
    }
  }

  // Gates passing at threshold boundary (70-75% scores)
  const borderline = handoffs.filter(h =>
    h.validation_score && h.validation_score >= 70 && h.validation_score <= 75 && h.status === 'accepted'
  );
  if (borderline.length >= 3) {
    findings.push({
      title: 'Multiple handoffs passing at threshold boundary (70-75%)',
      description: `${borderline.length} handoffs barely passed. Consider reviewing gate calibration or improving pre-handoff preparation.`,
      dataPoints: borderline.length,
      domain: 'gate_calibration',
      sources: borderline.map(h => h.id).slice(0, 5),
    });
  }

  return findings;
}

// ─── Domain 3: Capability Delivery Tracking ───────────────────
async function analyzeCapabilityDelivery() {
  const { data: completed } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, sd_type, category, completed_at, key_changes')
    .eq('status', 'completed')
    .gte('completed_at', cutoffDate(60))
    .order('completed_at', { ascending: false })
    .limit(50);

  if (!completed || completed.length === 0) return [];

  const findings = [];

  // Track capability categories delivered
  const byType = {};
  for (const sd of completed) {
    const t = sd.sd_type || 'unknown';
    if (!byType[t]) byType[t] = 0;
    byType[t]++;
  }

  // Imbalanced delivery (e.g., all infrastructure, no features)
  const total = completed.length;
  for (const [type, count] of Object.entries(byType)) {
    if (count / total > 0.6 && total >= 5) {
      findings.push({
        title: `Delivery skewed toward ${type} SDs (${Math.round(count / total * 100)}%)`,
        description: `${count}/${total} completed SDs in the last 60 days are ${type}. Consider rebalancing toward other SD types.`,
        dataPoints: total,
        domain: 'capability_delivery',
        sources: completed.filter(s => s.sd_type === type).map(s => s.id).slice(0, 5),
      });
    }
  }

  return findings;
}

// ─── Domain 4: Venture Stage Readiness ────────────────────────
async function analyzeVentureReadiness() {
  const { data: ventures } = await supabase
    .from('ventures')
    .select('id, name, status, current_stage, updated_at')
    .eq('status', 'active');

  if (!ventures || ventures.length === 0) return [];

  const findings = [];

  // Ventures stuck at same stage for >30 days
  for (const v of ventures) {
    if (v.updated_at) {
      const daysSinceUpdate = (Date.now() - new Date(v.updated_at).getTime()) / 86400000;
      if (daysSinceUpdate > 30) {
        findings.push({
          title: `Venture "${v.name}" stalled at stage ${v.current_stage || 'unknown'}`,
          description: `No progress in ${Math.round(daysSinceUpdate)} days. Consider reviewing blockers or deprioritizing.`,
          dataPoints: 3, // venture + stage + staleness = 3 signals
          domain: 'venture_readiness',
          sources: [v.id],
        });
      }
    }
  }

  return findings;
}

// ─── Domain 5: Protocol Health ────────────────────────────────
async function analyzeProtocolHealth() {
  const { data: patterns } = await supabase
    .from('issue_patterns')
    .select('id, pattern_key, title, frequency, severity, status, created_at')
    .in('status', ['active', 'recurring'])
    .order('frequency', { ascending: false })
    .limit(20);

  const { data: improvements } = await supabase
    .from('protocol_improvement_queue')
    .select('id, title, status, priority, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(20);

  const findings = [];

  // High-frequency recurring patterns
  if (patterns) {
    const highFreq = patterns.filter(p => p.frequency >= 5);
    for (const p of highFreq) {
      findings.push({
        title: `High-frequency issue pattern: ${p.title}`,
        description: `Occurred ${p.frequency} times. Severity: ${p.severity || 'unknown'}. Status: ${p.status}.`,
        dataPoints: p.frequency,
        domain: 'protocol_health',
        sources: [p.id],
      });
    }
  }

  // Stale improvement queue
  if (improvements && improvements.length >= 5) {
    const oldestDays = improvements[0]
      ? Math.round((Date.now() - new Date(improvements[0].created_at).getTime()) / 86400000)
      : 0;
    findings.push({
      title: `${improvements.length} pending protocol improvements (oldest: ${oldestDays}d)`,
      description: `Protocol improvement queue has ${improvements.length} unaddressed items. Oldest pending for ${oldestDays} days.`,
      dataPoints: improvements.length,
      domain: 'protocol_health',
      sources: improvements.map(i => i.id).slice(0, 5),
    });
  }

  return findings;
}

// ─── Domain 6: Cross-Venture Capability Reuse Detection ──────
async function analyzeCrossVentureReuse() {
  const { data: sds } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, key_changes, success_criteria, target_application')
    .eq('status', 'completed')
    .gte('completed_at', cutoffDate(90))
    .limit(50);

  if (!sds || sds.length < 5) return [];

  const findings = [];

  // Look for similar key_changes across different target applications
  const changesByApp = {};
  for (const sd of sds) {
    const app = sd.target_application || 'unknown';
    if (!changesByApp[app]) changesByApp[app] = [];
    const changes = sd.key_changes || [];
    for (const change of changes) {
      changesByApp[app].push({ change: typeof change === 'string' ? change : JSON.stringify(change), sdKey: sd.sd_key });
    }
  }

  const apps = Object.keys(changesByApp);
  if (apps.length >= 2) {
    // Simple keyword overlap detection between apps
    for (let i = 0; i < apps.length; i++) {
      for (let j = i + 1; j < apps.length; j++) {
        const app1Changes = changesByApp[apps[i]].map(c => c.change.toLowerCase());
        const app2Changes = changesByApp[apps[j]].map(c => c.change.toLowerCase());

        // Check for keyword overlap in changes
        const keywords1 = new Set(app1Changes.join(' ').split(/\s+/).filter(w => w.length > 5));
        const keywords2 = new Set(app2Changes.join(' ').split(/\s+/).filter(w => w.length > 5));
        const overlap = [...keywords1].filter(k => keywords2.has(k));

        if (overlap.length >= 3) {
          findings.push({
            title: `Potential capability reuse between ${apps[i]} and ${apps[j]}`,
            description: `${overlap.length} shared keywords in key_changes: ${overlap.slice(0, 5).join(', ')}. Review for shared service extraction.`,
            dataPoints: overlap.length,
            domain: 'cross_venture_reuse',
            sources: [],
          });
        }
      }
    }
  }

  return findings;
}

// ─── Domain 7: OKR Drift Detection ───────────────────────────
async function analyzeOKRDrift() {
  const { data: keyResults } = await supabase
    .from('okr_key_results')
    .select('id, title, current_value, target_value, progress_percentage, status, updated_at')
    .in('status', ['on_track', 'at_risk', 'behind'])
    .limit(50);

  if (!keyResults || keyResults.length === 0) return [];

  const findings = [];

  // Key results significantly behind target
  const behind = keyResults.filter(kr => kr.status === 'behind' || (kr.progress_percentage && kr.progress_percentage < 30));
  if (behind.length >= 3) {
    findings.push({
      title: `${behind.length} OKR key results are significantly behind`,
      description: `${behind.length} key results have less than 30% progress or are marked "behind". Review alignment with SD delivery.`,
      dataPoints: behind.length,
      domain: 'okr_drift',
      sources: behind.map(kr => kr.id).slice(0, 5),
    });
  }

  // Key results not updated recently
  const stale = keyResults.filter(kr => {
    if (!kr.updated_at) return false;
    const daysSince = (Date.now() - new Date(kr.updated_at).getTime()) / 86400000;
    return daysSince > 14;
  });

  if (stale.length >= 3) {
    findings.push({
      title: `${stale.length} OKR key results not updated in 14+ days`,
      description: `Stale OKR tracking may indicate drift from strategic objectives. Review and update.`,
      dataPoints: stale.length,
      domain: 'okr_drift',
      sources: stale.map(kr => kr.id).slice(0, 5),
    });
  }

  return findings;
}

// ─── Main Round Handler ──────────────────────────────────────
export async function consultantAnalysisHandler(options = {}) {

  const domainAnalyzers = [
    { name: 'retrospective_mining', fn: analyzeRetrospectives },
    { name: 'gate_calibration', fn: analyzeGateCalibration },
    { name: 'capability_delivery', fn: analyzeCapabilityDelivery },
    { name: 'venture_readiness', fn: analyzeVentureReadiness },
    { name: 'protocol_health', fn: analyzeProtocolHealth },
    { name: 'cross_venture_reuse', fn: analyzeCrossVentureReuse },
    { name: 'okr_drift', fn: analyzeOKRDrift },
  ];

  const allRawFindings = [];
  const domainSummary = {};

  for (const { name, fn } of domainAnalyzers) {
    try {
      const findings = await fn();
      domainSummary[name] = { rawCount: findings.length, status: 'ok' };
      allRawFindings.push(...findings);
    } catch (err) {
      domainSummary[name] = { rawCount: 0, status: 'error', error: err.message };
      console.error(`[consultant-analysis] Domain ${name} failed:`, err.message);
    }
  }

  // Run through confidence engine pipeline
  const processed = await processFindings(supabase, allRawFindings);

  // Store findings in eva_consultant_recommendations
  let insertedCount = 0;
  for (const finding of processed) {
    const { error } = await supabase
      .from('eva_consultant_recommendations')
      .upsert({
        recommendation_date: TODAY,
        recommendation_type: finding.tier === 'high' ? 'strategic' : 'tactical',
        title: finding.title.substring(0, 255),
        description: finding.description,
        priority_score: finding.confidenceScore,
        action_type: 'review',
        status: 'pending',
        application_domain: finding.domain,
        analysis_domain: finding.domain,
        confidence_tier: finding.tier,
        detected_by: 'consultant-analysis-round.mjs',
      }, { onConflict: 'recommendation_date,title' });

    if (!error) insertedCount++;
    else console.error(`[consultant-analysis] Insert error for "${finding.title}":`, error.message);
  }

  const summary = {
    roundType: 'weekly_consultant_analysis',
    executedAt: new Date().toISOString(),
    domainsAnalyzed: Object.keys(domainSummary).length,
    domainSummary,
    rawFindingsTotal: allRawFindings.length,
    processedFindings: processed.length,
    insertedCount,
    highConfidence: processed.filter(f => f.tier === 'high').length,
    mediumConfidence: processed.filter(f => f.tier === 'medium').length,
    graduated: processed.filter(f => f.graduated).length,
  };

  console.log(`[consultant-analysis] Complete: ${processed.length} findings (${summary.highConfidence} high, ${summary.mediumConfidence} medium, ${summary.graduated} graduated)`);

  return summary;
}

/**
 * Register this round in EvaMasterScheduler.
 */
export function registerConsultantAnalysisRound(scheduler) {
  scheduler.registerRound('weekly_consultant_analysis', {
    description: 'Monday internal strategic auditing across 7 domains: retrospectives, gates, capabilities, ventures, protocol health, cross-venture reuse, OKR drift',
    cadence: 'weekly',
    handler: consultantAnalysisHandler,
  });
}

// Manual trigger support
if (process.argv[1] && (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\\\/g, '/')}` ||
    import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`)) {
  console.log('[consultant-analysis] Manual trigger starting...');
  consultantAnalysisHandler().then(result => {
    console.log('[consultant-analysis] Result:', JSON.stringify(result, null, 2));
    process.exit(0);
  }).catch(err => {
    console.error('[consultant-analysis] Error:', err);
    process.exit(1);
  });
}
