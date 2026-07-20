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
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { fingerprint as sharedFingerprint } from '../../lib/shared/content-fingerprint.cjs';
import { resolveActiveVentureByName } from '../../lib/venture-name-resolver.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: ventures and
// sd_key_result_alignment grow with the portfolio -- un-paginated reads here would
// silently skew this weekly auditor's findings past the PostgREST 1000-row cap.
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

dotenv.config();

const supabase = createSupabaseServiceClient();

const LOOKBACK_DAYS = 30;
const TODAY = new Date().toISOString().split('T')[0];

function cutoffDate(days = LOOKBACK_DAYS) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

// ─── FR-1: stable per-finding fingerprint ─────────────────────
// Several analyzers embed runtime-computed numbers directly in the rendered title
// (percentages, counts, day-deltas) that change every run even when the underlying
// condition is unchanged. Strip these before hashing so the identity is stable.
export function stripVolatileNumbers(text) {
  return String(text || '')
    .replace(/\d+(\.\d+)?%/g, '#PCT#')
    // Day-deltas like "9d"/"14d" have no word boundary between the digit and the unit
    // letter (both are \w), so the generic \b\d+\b rule below never touches them --
    // handle this glued-unit shape explicitly, before the generic numeric pass.
    .replace(/\d+d\b/g, '#DAYS#')
    .replace(/\b\d+\b/g, '#NUM#');
}

/**
 * Stable per-finding identity, independent of an analyzer's rendered numeric text.
 * Prefers sources[0] (a stable entity id) as the identity anchor when the analyzer
 * provides one; otherwise derives identity from domain + a volatile-number-normalized
 * title. Reuses lib/shared/content-fingerprint.cjs's fingerprint()/normalize() rather
 * than inventing new hashing logic (TR-1).
 */
export function computeFindingFingerprint(finding) {
  const anchor = Array.isArray(finding.sources) && finding.sources.length > 0
    ? String(finding.sources[0])
    : stripVolatileNumbers(finding.title);
  return sharedFingerprint(finding.domain, anchor);
}

// FR-6: pure predicate so "near-total suppression" is independently unit-testable
// without a full pipeline mock -- the counts themselves (candidateCount vs
// insertedCount) are what make a fully-suppressed run mechanically detectable.
export function isNearTotalSuppression(candidateCount, insertedCount) {
  return candidateCount > 0 && insertedCount === 0;
}

/**
 * FR-2: fingerprint every candidate finding and suppress one whose fingerprint already
 * exists in eva_consultant_recommendations with an unexpired re_review_at, BEFORE it is
 * ever scored or inserted (TR-3). A finding whose matching row's re_review_at has
 * PASSED is deliberately NOT suppressed -- the time-bound release valve that keeps
 * suppression from being permanent. `client` is injectable for tests; production calls
 * default to the module-level supabase.
 * @param {object} client - supabase client
 * @param {Array} rawFindings - raw findings from the domain analyzers
 * @param {string} [nowIso] - injectable "now" for deterministic expiry tests
 * @returns {Promise<{ survivors: Array, dedupSuppressedCount: number }>}
 */
export async function filterAlreadySuppressed(client, rawFindings, nowIso = new Date().toISOString()) {
  const withFingerprints = rawFindings.map((f) => ({ ...f, fingerprint: computeFindingFingerprint(f) }));
  const uniqueFingerprints = [...new Set(withFingerprints.map((f) => f.fingerprint))];
  const { data: existingUnexpired } = uniqueFingerprints.length > 0
    ? await client
        .from('eva_consultant_recommendations')
        .select('fingerprint')
        .in('fingerprint', uniqueFingerprints)
        .or(`re_review_at.is.null,re_review_at.gt.${nowIso}`)
    : { data: [] };
  const suppressedFingerprints = new Set((existingUnexpired || []).map((r) => r.fingerprint).filter(Boolean));
  const survivors = withFingerprints.filter((f) => !suppressedFingerprints.has(f.fingerprint));
  return { survivors, dedupSuppressedCount: withFingerprints.length - survivors.length };
}

// ─── FR-4: venture-status grounding ────────────────────────────
// Case-insensitive, exact-match venture lookup (reuses lib/venture-name-resolver.js's
// existing safe .ilike() pattern, per security-agent PLAN-phase review -- never a
// hand-built .or() filter string). Returns false (safe no-op) for a non-venture entity
// (e.g. "EHG_Engineer"/"EHG", which are platform repos, not ventures) rather than
// suppressing or erroring. `client` is injectable for tests; production call sites
// default to the module-level supabase (mirrors analyzeOKRDrift's convention).
export async function isNamedVentureCancelled(name, client = supabase) {
  const venture = await resolveActiveVentureByName(client, name);
  if (!venture) return false;
  return venture.status === 'cancelled';
}

// ─── FR-3 (evidence floor half): generic engineering vocabulary that must never, on
// its own, count as evidence of genuine cross-venture capability overlap.
const OVERLAP_STOPWORDS = new Set([
  'implement', 'implementation', 'changes', 'change', 'description', 'details', 'detail',
  'update', 'updates', 'updated', 'add', 'added', 'adding', 'status', 'before', 'after',
  'feature', 'features', 'fix', 'fixes', 'fixed', 'create', 'created', 'support', 'improve',
  'improved', 'improvement', 'required', 'requires', 'using', 'based', 'system', 'systems',
  'default', 'existing', 'various', 'several', 'through', 'because', 'should', 'would',
]);

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
  // Live column is completion_date — strategic_directives_v2 has NO completed_at
  // (SD-LEO-FIX-FIX-PHANTOM-COLUMN-002).
  const { data: completed } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, sd_type, category, completion_date, key_changes')
    .eq('status', 'completed')
    .gte('completion_date', cutoffDate(60))
    .order('completion_date', { ascending: false })
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
  // Live column is current_lifecycle_stage — ventures has NO current_stage
  // (SD-LEO-FIX-FIX-PHANTOM-COLUMN-002).
  let ventures;
  try {
    ventures = await fetchAllPaginated(() => supabase
      .from('ventures')
      .select('id, name, status, current_lifecycle_stage, updated_at')
      .eq('status', 'active')
      .order('id', { ascending: true })); // unique tiebreaker (FR-6)
  } catch { ventures = []; } // prior behavior: read error ignored

  if (!ventures || ventures.length === 0) return [];

  const findings = [];

  // Ventures stuck at same stage for >30 days
  for (const v of ventures) {
    if (v.updated_at) {
      const daysSinceUpdate = (Date.now() - new Date(v.updated_at).getTime()) / 86400000;
      if (daysSinceUpdate > 30) {
        findings.push({
          title: `Venture "${v.name}" stalled at stage ${v.current_lifecycle_stage || 'unknown'}`,
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
  // PRE-EXISTING BUG (confirmed live, out of scope for SD-LEO-INFRA-EVA-CONSULTANT-
  // GENERATOR-001, unrelated to this SD's 3 diagnosed defects): pattern_key/title/
  // frequency do not exist on issue_patterns (real columns: pattern_id/issue_summary/
  // occurrence_count) -- this domain analyzer has likely been silently returning zero
  // findings. Flagged as a completion-flag finding for a dedicated follow-up, not fixed
  // here.
  const { data: patterns } = await supabase
    .from('issue_patterns')
    .select('id, pattern_key, title, frequency, severity, status, created_at') // schema-lint-disable-line
    .in('status', ['active', 'recurring'])
    .order('frequency', { ascending: false })
    .limit(20);

  // Same pre-existing bug class: title/priority do not exist on protocol_improvement_queue
  // (real columns: description/risk_tier).
  const { data: improvements } = await supabase
    .from('protocol_improvement_queue')
    .select('id, title, status, priority, created_at') // schema-lint-disable-line
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
// `client` is injectable for tests (mirrors analyzeOKRDrift's convention); production
// call sites (the domainAnalyzers array below) call it with no arg.
export async function analyzeCrossVentureReuse(client = supabase) {
  // Live column is completion_date (SD-LEO-FIX-FIX-PHANTOM-COLUMN-002).
  const { data: sds } = await client
    .from('strategic_directives_v2')
    .select('id, sd_key, title, key_changes, success_criteria, target_application')
    .eq('status', 'completed')
    .gte('completion_date', cutoffDate(90))
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

        // Check for keyword overlap in changes. FR-3 (evidence floor): generic
        // engineering vocabulary (OVERLAP_STOPWORDS) is excluded so a stopword-only
        // overlap can never count as evidence of genuine capability reuse.
        const keywords1 = new Set(
          app1Changes.join(' ').split(/\s+/).filter(w => w.length > 5 && !OVERLAP_STOPWORDS.has(w))
        );
        const keywords2 = new Set(
          app2Changes.join(' ').split(/\s+/).filter(w => w.length > 5 && !OVERLAP_STOPWORDS.has(w))
        );
        const overlap = [...keywords1].filter(k => keywords2.has(k));

        if (overlap.length >= 3) {
          // FR-4: venture-status grounding -- never recommend reuse involving a
          // cancelled/scrapped venture. A non-venture entity (e.g. EHG_Engineer/EHG)
          // safely no-ops (isNamedVentureCancelled returns false), so this only ever
          // suppresses on a confirmed cancelled match, never a false positive.
          const [app1Cancelled, app2Cancelled] = await Promise.all([
            isNamedVentureCancelled(apps[i], client),
            isNamedVentureCancelled(apps[j], client),
          ]);
          if (app1Cancelled || app2Cancelled) continue;

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
// SD-LEO-INFRA-ADAM-EVA-SEAM-001: patch the OKR-drift blind spot. The prior stub queried the
// non-existent `okr_key_results` table, hard-coded `keyResults = []`, and so returned [] — Adam's
// scan NEVER produced an OKR-drift finding. Run drift over the REAL `key_results`
// (status: at_risk/on_track/achieved/pending) + `sd_key_result_alignment`. `client` is injectable
// for tests; consultantAnalysisHandler calls it with no arg (defaults to the module supabase).
export async function analyzeOKRDrift(client = supabase) {
  const { data: keyResults } = await client
    .from('key_results')
    .select('id, code, title, status, updated_at')
    .eq('is_active', true);

  if (!keyResults || keyResults.length === 0) return [];

  const findings = [];

  // Behind target: the REAL status is 'at_risk' (the prior stub looked for a non-existent 'behind'
  // and a non-existent progress_percentage column, so this never fired).
  const behind = keyResults.filter(kr => kr.status === 'at_risk');
  if (behind.length >= 3) {
    findings.push({
      title: `${behind.length} OKR key results are at risk`,
      description: `${behind.length} active key results are marked "at_risk" (behind target). Review alignment with SD delivery.`,
      dataPoints: behind.length,
      domain: 'okr_drift',
      sources: behind.map(kr => kr.id).slice(0, 5),
    });
  }

  // Stale tracking: not updated in 14+ days — drift from active OKR maintenance.
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

  // Uncovered drift: an at_risk key result with NO strategic directive aligned to remediate it —
  // the seam Adam should flag (drift with no work in flight). Advisory only (CONST-002: Adam
  // proposes, it never accepts a rec or auto-generates an SD).
  if (behind.length > 0) {
    let alignments;
    try {
      alignments = await fetchAllPaginated(() => client
        .from('sd_key_result_alignment')
        .select('key_result_id')
        .order('id', { ascending: true })); // unique tiebreaker (FR-6)
    } catch { alignments = []; } // prior behavior: read error ignored
    const alignedKrIds = new Set(alignments.map(a => a.key_result_id));
    const uncovered = behind.filter(kr => !alignedKrIds.has(kr.id));
    if (uncovered.length >= 1) {
      findings.push({
        title: `${uncovered.length} at-risk OKR key result(s) have no aligned SD`,
        description: `${uncovered.length} at_risk key results have no strategic directive aligned to remediate them — drift with no work in flight. Surface as advisory proposals for the coordinator/chairman.`,
        dataPoints: uncovered.length,
        domain: 'okr_drift',
        sources: uncovered.map(kr => kr.id).slice(0, 5),
      });
    }
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

  // FR-6: candidate count recorded before any suppression, so a near-total-suppression
  // run is mechanically detectable (candidate_count > 0, inserted_count === 0) rather
  // than only describable in prose.
  const candidateCount = allRawFindings.length;

  // FR-1/FR-2/TR-3: fingerprint every candidate and suppress a finding whose fingerprint
  // already exists with an unexpired re_review_at BEFORE it is ever scored or inserted.
  const { survivors, dedupSuppressedCount } = await filterAlreadySuppressed(supabase, allRawFindings);

  // Run through confidence engine pipeline
  const processed = await processFindings(supabase, survivors);

  // Store findings in eva_consultant_recommendations
  let insertedCount = 0;
  const reReviewAt = new Date(Date.now() + LOOKBACK_DAYS * 86400000).toISOString();
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
        fingerprint: finding.fingerprint,
        re_review_at: reReviewAt,
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
    candidateCount,
    dedupSuppressedCount,
    processedFindings: processed.length,
    insertedCount,
    highConfidence: processed.filter(f => f.tier === 'high').length,
    mediumConfidence: processed.filter(f => f.tier === 'medium').length,
    graduated: processed.filter(f => f.graduated).length,
  };

  // FR-6: near-total suppression is logged as a countable signal, not just describable
  // in prose -- lets monitoring distinguish a genuinely quiet week from an over-
  // aggressive dedup/grounding regression.
  if (isNearTotalSuppression(candidateCount, insertedCount)) {
    console.warn(
      `[consultant-analysis] SUPPRESSION_ALERT: ${candidateCount} candidate(s) generated, 0 inserted ` +
      `(dedup_suppressed=${dedupSuppressedCount}) -- possible over-aggressive dedup/grounding regression.`
    );
  }

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
if (isMainModule(import.meta.url)) {
  console.log('[consultant-analysis] Manual trigger starting...');
  consultantAnalysisHandler().then(result => {
    console.log('[consultant-analysis] Result:', JSON.stringify(result, null, 2));
    process.exit(0);
  }).catch(err => {
    console.error('[consultant-analysis] Error:', err);
    process.exit(1);
  });
}
