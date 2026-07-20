#!/usr/bin/env node
/**
 * corrective-sd-generator.mjs
 * Generates corrective Strategic Directives when EVA vision scoring reveals gaps.
 *
 * Called by the /eva score command after a scoring run completes.
 * Reads eva_vision_scores, applies threshold logic, creates corrective SDs,
 * sets vision_origin_score_id, and logs to brainstorm_sessions.
 *
 * Part of: SD-MAN-INFRA-CORRECTIVE-GENERATION-VISION-001
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GRADE } from '../../lib/standards/grade-scale.js';
import { publishVisionEvent, VISION_EVENTS } from '../../lib/eva/event-bus/vision-events.js';
import { generateSDKey } from '../modules/sd-key-generator.js';
import { createSD } from '../leo-create-sd.js';
import { loadIntelligenceSignals } from '../../lib/eva/intelligence-loader.js';
import { calculateCorrectivePriority } from '../../lib/eva/corrective-priority-calculator.js';
import { recordCorrectiveFinding } from '../../lib/eva/corrective-finding-recorder.js';
// SD-FDBK-INFRA-SUPPRESS-CORRECTIVE-GENERATOR-001 CAPA 3: reuse the canonical
// placeholder regex set rather than redefining it here.
import { isPlaceholderText } from '../modules/handoff/executors/lead-to-plan/gates/placeholder-content.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: strategic_directives_v2 is a
// growing table -- an un-paginated draft-dedup read here could silently miss existing
// drafts past the PostgREST 1000-row cap, producing duplicate corrective SDs.
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env') });

// ─── Threshold Configuration ─────────────────────────────────────────────────
// Exported so callers can inspect and tests can reference without magic numbers.

export const THRESHOLDS = {
  ACCEPT:      GRADE.A,        // >=93: A grade — no action needed
  MINOR:       GRADE.B,        // 83-92: B/A- range — minor enhancement SD (medium priority)
  GAP_CLOSURE: GRADE.C_MINUS,  // 70-82: C/B- range — gap-closure SD (high priority)
  ESCALATION:  GRADE.F,        // <70:  D or F — critical escalation SD
};

// QF-20260424-807: SD-heal persist (scripts/eva/heal-command.mjs cmdSDPersist) writes
// dimension_scores keyed by friendly names instead of V01/A01 codes. Generator must
// recognize both shapes so heal scores are counted, weak-extracted, and can drive
// corrective SD generation through the same pipeline as vision scores.
export const SD_HEAL_DIMENSION_KEYS = new Set([
  'key_changes_delivered',
  'success_criteria_met',
  'success_metrics_achieved',
  'smoke_tests_pass',
  'capabilities_present',
  'planning_traceability',
]);

export function _isKnownDimensionKey(key) {
  return /^[VA]\d{2}$/.test(key) || SD_HEAL_DIMENSION_KEYS.has(key);
}

// SD type and priority per tier
// Root Cause 2 fix: Use 'corrective' instead of 'feature' for gap-closure/escalation
// Corrective type has 70% gate threshold (vs 85% for feature), lighter validation
const TIER_CONFIG = {
  accept:      { action: 'accept',      sdType: null,            priority: null },
  minor:       { action: 'minor',       sdType: 'enhancement',   priority: 'medium' },
  'gap-closure': { action: 'gap-closure', sdType: 'corrective',  priority: 'high' },
  escalation:  { action: 'escalation',  sdType: 'corrective',    priority: 'critical' },
};

// Orchestrator parent UUID (SD-MAN-ORCH-EVA-VISION-GOVERNANCE-001)
const ORCHESTRATOR_ID = 'da3b936a-3f62-4966-9093-f1c1bdec53e7';

// Minimum number of scoring runs below threshold before generating a corrective SD.
// Prevents test data or one-off scores from polluting the SD queue.
// Set to 1 for critical severity overrides (see checkMinOccurrences).
export const MIN_OCCURRENCES = 2;

// created_by values that identify test/smoke-test score records to skip.
const TEST_CREATED_BY_PATTERNS = ['test-', 'test-sync', 'vision-scorer-test'];

// ─── A05 Source-Class Filter (SD-LEO-INFRA-FILTER-CORRECTIVE-GENERATOR-001) ───
// Heuristic keyword sets used by classifySourceSD() to decide whether the source
// SD is a class for which A05 (event_bus_integration) corrective SDs are noise.
// Read-only/CLI/validation-only sources legitimately do not emit lifecycle events.

export const READONLY_KEYWORDS = [
  'cli', 'validation', 'parser', 'parsing', 'validator', 'preflight',
  'check', 'verify', 'classifier', 'lookup', 'query', 'audit',
  'helper', 'logger', 'reporter', 'inspector', 'scanner',
];
export const WRITE_KEYWORDS = [
  'emit', 'publish', 'event', 'persist', 'insert', 'update', 'migration',
  'schema', 'lifecycle', 'webhook', 'broadcast',
];
export const READONLY_BUGFIX_TYPES = new Set(['bugfix', 'fix', 'documentation']);

// SD-LEO-INFRA-EXTEND-CORRECTIVE-GENERATOR-001: lifecycle-feature heuristic.
// Feature-type SDs that touch only session/lifecycle plumbing (e.g. session-id
// capture, hook installation, identity persistence) legitimately do not address
// architectural dimensions. They were previously bypassing classification because
// READONLY_BUGFIX_TYPES omits 'feature'.
export const LIFECYCLE_FEATURE_KEYWORDS = [
  'session', 'hook', 'capture', 'sessionstart', 'lifecycle', 'identity',
];

// SD-LEO-INFRA-EXTEND-CORRECTIVE-GENERATOR-001: dimension set stripped when a
// source is suppression-eligible. Previously only A05 was stripped, leaving
// A01-A04 to emit identical noise correctives (see cancelled SDs 040/041/042).
export const SUPPRESSED_ARCHITECTURAL_DIMS = new Set(['A01', 'A02', 'A03', 'A04', 'A05']);

// QF-20260610-124: classifier verdicts that ALSO strip VISION dims. A narrow
// readonly/bugfix/documentation source was never scoped to advance vision
// dimensions, yet V-dim weak scores emitted P1 vision-gap findings against it —
// all 5 corrective_finding rows ever emitted hit this class and every one was
// triaged wont_fix/resolved. lifecycle_feature is deliberately EXCLUDED (keeps
// its A-dims-only strip): feature-type sources may legitimately move V-dims.
export const VISION_SUPPRESSED_REASONS = new Set(['cli_validation', 'readonly_bugfix', 'documentation']);

/**
 * QF-20260610-124: pure strip step for the 5b source-class filter (extracted so it
 * is unit-testable without a Supabase client). For ANY suppression verdict, removes
 * SUPPRESSED_ARCHITECTURAL_DIMS from every group; when `reason` is one of
 * VISION_SUPPRESSED_REASONS, also removes V-dims. Mutates `groups` in place and
 * drops now-empty groups (identical to the prior inline A-dim loop). Other
 * (non-V/non-A) dims always pass through.
 *
 * @param {Array<{dims: Array<{dimId: string}>}>} groups
 * @param {string|null} reason - classifySourceSD verdict
 * @returns {{ suppressedArch: string[], suppressedVision: string[] }} sorted dim ids removed
 */
export function _stripSuppressedDims(groups, reason) {
  const stripVision = VISION_SUPPRESSED_REASONS.has(reason);
  const hit = (d) => SUPPRESSED_ARCHITECTURAL_DIMS.has(d.dimId) || (stripVision && d.dimId.startsWith('V'));
  const suppressedArch = new Set();
  const suppressedVision = new Set();
  for (let i = groups.length - 1; i >= 0; i--) {
    for (const d of groups[i].dims) {
      if (!hit(d)) continue;
      (d.dimId.startsWith('V') ? suppressedVision : suppressedArch).add(d.dimId);
    }
    groups[i].dims = groups[i].dims.filter(d => !hit(d));
    if (groups[i].dims.length === 0) groups.splice(i, 1);
  }
  return { suppressedArch: [...suppressedArch].sort(), suppressedVision: [...suppressedVision].sort() };
}

/**
 * Lightweight classifier: inspect SD shape and return reason if architectural
 * correctives should be suppressed. Returns null when no suppression match.
 * Pure / synchronous so it is unit-testable without a Supabase client.
 *
 * @param {Object} sd - { sd_type, scope, key_changes, title, description }
 * @returns {string|null} reason like 'cli_validation' / 'readonly_bugfix' /
 *   'documentation' / 'lifecycle_feature' or null
 */
export function classifySourceSD(sd) {
  if (!sd) return null;
  const text = [
    sd.title, sd.description, sd.scope,
    Array.isArray(sd.key_changes)
      ? sd.key_changes.map(k => (typeof k === 'object' ? `${k.change || ''} ${k.impact || ''}` : String(k))).join(' ')
      : '',
  ].join(' ').toLowerCase();

  const writeMatches = WRITE_KEYWORDS.filter(k => text.includes(k)).length;
  if (writeMatches >= 2) return null;

  const readonlyMatches = READONLY_KEYWORDS.filter(k => text.includes(k)).length;
  if (readonlyMatches >= 2) return 'cli_validation';

  const sdType = String(sd.sd_type || '').toLowerCase();
  if (READONLY_BUGFIX_TYPES.has(sdType) && writeMatches === 0 && readonlyMatches >= 1) {
    return 'readonly_bugfix';
  }
  if (sdType === 'documentation') return 'documentation';

  // Conservative lifecycle-feature path: feature-type SD with at least one
  // lifecycle keyword AND zero STRICT write verbs. The strict-write count
  // excludes 'lifecycle' itself (it sits in WRITE_KEYWORDS as a domain noun
  // that describes lifecycle-themed SDs, not a write action) — otherwise any
  // SD describing itself as "lifecycle hook" trips the write floor and never
  // reaches this branch. Real write verbs (persist, emit, publish, insert,
  // update, migration, schema, broadcast, webhook, event) still bump the count
  // and disqualify the SD from suppression.
  if (sdType === 'feature') {
    const lifecycleMatches = LIFECYCLE_FEATURE_KEYWORDS.filter(k => text.includes(k)).length;
    const strictWriteMatches = WRITE_KEYWORDS.filter(k => k !== 'lifecycle' && text.includes(k)).length;
    if (lifecycleMatches >= 1 && strictWriteMatches === 0) return 'lifecycle_feature';
  }

  return null;
}

/**
 * Database-backed companion: load source SD by sd_key OR id and run classifier.
 * Conservative default: returns suppress=false on any lookup failure or null SD,
 * so legit A05 emissions are never silently lost.
 *
 * @param {string|null} sourceSdId
 * @param {Object} supabase
 * @returns {Promise<{ suppress: boolean, reason: string|null, sourceSdKey: string|null }>}
 */
export async function isSourceSDA05Suppressed(sourceSdId, supabase) {
  if (!sourceSdId) return { suppress: false, reason: null, sourceSdKey: null };
  try {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, sd_type, title, description, scope, key_changes')
      .or(`sd_key.eq.${sourceSdId},id.eq.${sourceSdId}`)
      .limit(1)
      .maybeSingle();
    if (error || !data) return { suppress: false, reason: null, sourceSdKey: null };
    const reason = classifySourceSD(data);
    return { suppress: !!reason, reason, sourceSdKey: data.sd_key || data.id };
  } catch {
    return { suppress: false, reason: null, sourceSdKey: null };
  }
}

// SD-FDBK-INFRA-SUPPRESS-CORRECTIVE-GENERATOR-001 CAPA-1.
// Skip when source SD status='completed' AND completion_date >= NOW() - 24h AND
// no FAIL/BLOCKED gate evidence exists for the source SD's most-recent phase.
// Conservative default: emit on lookup failure or NULL completion_date so legit
// signals aren't lost (mirrors isSourceSDA05Suppressed shape).
export async function isSourceCompletedRecently(sourceSdId, supabase) {
  if (!sourceSdId) return { suppress: false, reason: null, sourceSdKey: null };
  try {
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, status, completion_date')
      .or(`sd_key.eq.${sourceSdId},id.eq.${sourceSdId}`)
      .limit(1)
      .maybeSingle();
    if (!sd || sd.status !== 'completed' || !sd.completion_date) {
      return { suppress: false, reason: null, sourceSdKey: null };
    }
    const hoursSince = (Date.now() - new Date(sd.completion_date).getTime()) / (1000 * 60 * 60);
    if (hoursSince >= 24) {
      return { suppress: false, reason: null, sourceSdKey: sd.sd_key || sd.id };
    }
    // Verify no FAIL/BLOCKED evidence (UPPERCASE per verdict enum)
    const { data: failures } = await supabase
      .from('sub_agent_execution_results')
      .select('id, verdict')
      .eq('sd_id', sd.id)
      .in('verdict', ['FAIL', 'BLOCKED'])
      .limit(1);
    if (failures && failures.length > 0) {
      return { suppress: false, reason: 'has_failing_gate_evidence', sourceSdKey: sd.sd_key || sd.id };
    }
    return {
      suppress: true,
      reason: 'completed_within_24h_no_failures',
      sourceSdKey: sd.sd_key || sd.id,
      hoursSince: Math.round(hoursSince * 10) / 10,
    };
  } catch {
    return { suppress: false, reason: null, sourceSdKey: null };
  }
}

// SD-FDBK-INFRA-SUPPRESS-CORRECTIVE-GENERATOR-001 CAPA-2.
// Skip when source SD's parent_sd_id resolves to an orchestrator with
// status='completed' AND completion_date older than 30 days. Orphan-parent class.
export async function isParentOrchestratorStale(sourceSdId, supabase) {
  if (!sourceSdId) return { suppress: false, reason: null, parentSdKey: null };
  try {
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('id, parent_sd_id')
      .or(`sd_key.eq.${sourceSdId},id.eq.${sourceSdId}`)
      .limit(1)
      .maybeSingle();
    if (!sd || !sd.parent_sd_id) return { suppress: false, reason: null, parentSdKey: null };
    const { data: parent } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, status, completion_date')
      .eq('id', sd.parent_sd_id)
      .maybeSingle();
    if (!parent || parent.status !== 'completed' || !parent.completion_date) {
      return { suppress: false, reason: null, parentSdKey: parent?.sd_key || sd.parent_sd_id };
    }
    const daysSince = (Date.now() - new Date(parent.completion_date).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince <= 30) {
      return { suppress: false, reason: null, parentSdKey: parent.sd_key || parent.id };
    }
    return {
      suppress: true,
      reason: 'parent_completed_30d_stale',
      parentSdKey: parent.sd_key || parent.id,
      daysSince: Math.round(daysSince),
    };
  } catch {
    return { suppress: false, reason: null, parentSdKey: null };
  }
}

// SD-FDBK-INFRA-SUPPRESS-CORRECTIVE-GENERATOR-001 CAPA-3.
// Refuse emission when source SD's key_changes are entirely placeholder
// templates (no concrete file/function/test reference). Reuses isPlaceholderText
// from lead-to-plan/gates/placeholder-content.js as canonical regex set.
export function isAllKeyChangesPlaceholder(keyChanges) {
  if (!Array.isArray(keyChanges) || keyChanges.length === 0) return false;
  return keyChanges.every((kc) => {
    const text = typeof kc === 'string' ? kc : (kc?.change ?? kc?.title ?? '');
    return isPlaceholderText(text);
  });
}

// SD-FDBK-INFRA-SUPPRESS-CORRECTIVE-GENERATOR-001 CAPA-4.
// Strip self-exempting handoff-gate entries from gate_exemptions[] when the
// source_gate matches. Mapping: eva_vision_score / eva_heal_score both produce
// findings whose vision-scoring gate IS GATE_VISION_SCORE — exempting that gate
// is tautological self-exemption. Returns the filtered array.
const SOURCE_GATE_TO_HANDOFF_GATE = Object.freeze({
  eva_vision_score: 'GATE_VISION_SCORE',
  eva_heal_score: 'GATE_VISION_SCORE',
});
export function stripSelfExemptingGate(gateExemptions, sourceGate) {
  if (!Array.isArray(gateExemptions) || gateExemptions.length === 0) return [];
  const selfExempting = SOURCE_GATE_TO_HANDOFF_GATE[sourceGate];
  if (!selfExempting) return [...gateExemptions];
  return gateExemptions.filter((g) => g !== selfExempting);
}

/**
 * QF-20260503-858 dedup: return the sd_key of an existing draft corrective SD
 * that targets the same source SD + dimensions, or null if no duplicate.
 *
 * Match key is (source_sd_id, sorted dimensions). Resolves candidate source SDs
 * via metadata.source_sd_id (preferred) or falls back to the eva_vision_scores
 * row referenced by metadata.score_id (legacy SDs predating this field).
 *
 * @param {Object} supabase
 * @param {string|null} sourceSdId
 * @param {string[]} dimensionIds
 * @returns {Promise<string|null>} duplicate sd_key, or null
 */
export async function findDuplicateCorrective(supabase, sourceSdId, dimensionIds) {
  if (!sourceSdId || !Array.isArray(dimensionIds) || dimensionIds.length === 0) return null;
  const dimsKey = [...dimensionIds].sort().join(',');
  try {
    const drafts = await fetchAllPaginated(() => supabase
      .from('strategic_directives_v2')
      .select('sd_key, metadata')
      .eq('status', 'draft')
      .filter('metadata->>source', 'eq', 'corrective_sd_generator')
      .order('id', { ascending: true })); // unique tiebreaker (FR-6)
    const matches = drafts.filter(
      d => (d.metadata?.dimensions || []).slice().sort().join(',') === dimsKey
    );
    if (!matches.length) return null;
    const idsNeedingLookup = matches
      .filter(m => !m.metadata?.source_sd_id)
      .map(m => m.metadata?.score_id || m.metadata?.vision_origin_score_id)
      .filter(Boolean);
    const scoreSdMap = {};
    if (idsNeedingLookup.length) {
      const { data: scores } = await supabase
        .from('eva_vision_scores').select('id, sd_id').in('id', idsNeedingLookup);
      for (const sc of (scores || [])) scoreSdMap[sc.id] = sc.sd_id;
    }
    for (const m of matches) {
      const candSrc = m.metadata?.source_sd_id
        || scoreSdMap[m.metadata?.score_id || m.metadata?.vision_origin_score_id];
      if (candSrc === sourceSdId) return m.sd_key;
    }
    return null;
  } catch { return null; }
}

// ─── Supabase Client ──────────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key);
}

// ─── Threshold Classification ─────────────────────────────────────────────────

/**
 * Classify a numeric score into a corrective action tier.
 * Uses THRESHOLDS constants — not hardcoded inline.
 *
 * @param {number} score - Numeric score (0-100)
 * @returns {'accept'|'minor'|'gap-closure'|'escalation'}
 */
export function classifyScore(score) {
  if (score >= THRESHOLDS.ACCEPT)     return 'accept';
  if (score >= THRESHOLDS.MINOR)      return 'minor';
  if (score >= THRESHOLDS.GAP_CLOSURE) return 'gap-closure';
  return 'escalation';
}

// ─── Occurrence Check ─────────────────────────────────────────────────────────

/**
 * Check if a dimension has appeared below threshold enough times to warrant an SD.
 * Queries eva_vision_scores for recent records with total_score < THRESHOLDS.MINOR (70),
 * excluding test records by created_by.
 *
 * @param {Object} supabase
 * @param {string|null} sdId - SD key/id this score is for (null = portfolio-level)
 * @param {number} minOccurrences - Minimum count required (default: MIN_OCCURRENCES)
 * @returns {Promise<{qualifies: boolean, count: number}>}
 */
export async function checkMinOccurrences(supabase, sdId, minOccurrences = MIN_OCCURRENCES) {
  let query = supabase
    .from('eva_vision_scores')
    .select('id', { count: 'exact', head: true })
    .lt('total_score', THRESHOLDS.MINOR);

  if (sdId) {
    query = query.eq('sd_id', sdId);
  }

  // Exclude test records (allow NULL created_by through — NOT LIKE excludes NULLs in PostgreSQL)
  const testFilter = TEST_CREATED_BY_PATTERNS
    .map(p => `created_by.not.like.${p}%`)
    .join(',');
  query = query.or(`created_by.is.null,${testFilter}`);

  const { count, error } = await query;
  if (error) {
    console.warn(`[corrective-sd-generator] Occurrence check failed: ${error.message} — defaulting to qualify`);
    return { qualifies: true, count: minOccurrences };
  }

  return { qualifies: (count ?? 0) >= minOccurrences, count: count ?? 0 };
}

// ─── Relevance Validation (False Positive Detection) ─────────────────────────

const FALSE_POSITIVE_CLASSIFICATIONS = ['DESCOPED', 'RELOCATED', 'SUPERSEDED'];
const FALSE_POSITIVE_SIGNALS = ['ZERO CALLERS', 'NO REFERENCES', 'INTENTIONALLY OMITTED', 'NOT NEEDED'];

/**
 * Check dimension reasoning for false positive signals.
 * If a majority of dimensions contain signals that items were intentionally
 * omitted or already delivered elsewhere, the score is likely a false positive.
 *
 * @param {Object} score - eva_vision_scores record with dimension_scores
 * @returns {{ likely_false_positive: boolean, signal_count: number, total_dims: number, ratio: number }}
 */
export function checkRelevanceSignals(score) {
  const dims = score.dimension_scores ?? {};

  let falsePositiveSignals = 0;
  let totalDims = 0;

  for (const [code, dim] of Object.entries(dims)) {
    if (!/^[VA]\d{2}$/.test(code)) continue;
    if (!dim?.reasoning) continue;
    totalDims++;
    const reasoning = String(dim.reasoning).toUpperCase();

    if (FALSE_POSITIVE_CLASSIFICATIONS.some(c => reasoning.includes(c)) ||
        FALSE_POSITIVE_SIGNALS.some(s => reasoning.includes(s))) {
      falsePositiveSignals++;
    }
  }

  const ratio = totalDims > 0 ? falsePositiveSignals / totalDims : 0;
  return {
    likely_false_positive: ratio > 0.5,
    signal_count: falsePositiveSignals,
    total_dims: totalDims,
    ratio,
  };
}

// ─── Enriched Description Builder ─────────────────────────────────────────────

/**
 * Build an enriched SD description from dimension score data and rubric snapshot.
 * Pulls LLM reasoning and vision source section for actionable context.
 *
 * @param {string} dimensionName - Name of the worst-scoring dimension
 * @param {string} dimId - Dimension ID (e.g. 'V02', 'A03')
 * @param {Object} dimensionScores - dimension_scores JSONB from eva_vision_scores
 * @param {Object} rubricSnapshot - rubric_snapshot JSONB from eva_vision_scores
 * @param {number} totalScore
 * @param {string} action - Tier action (escalation/gap-closure/minor)
 * @returns {string}
 */
function buildEnrichedDescription(dimensionName, dimId, dimensionScores, rubricSnapshot, totalScore, action) {
  const dim = dimensionScores?.[dimId] ?? {};
  const reasoning = dim.reasoning ? String(dim.reasoning).substring(0, 400) : null;

  const criteria = rubricSnapshot?.criteria ?? [];
  const rubricEntry = criteria.find(c => c.id === dimId || c.name === dimensionName) ?? {};
  const sourceSection = rubricEntry.source_section ?? null;
  const dimDescription = rubricEntry.description ?? null;

  const lines = [
    `Vision alignment score ${totalScore}/100 is in the "${action}" tier.`,
    `Lowest-scoring dimension: ${dimensionName} (${dimId})`,
  ];

  if (dimDescription) {
    lines.push(`\nDimension measures: ${dimDescription}`);
  }
  if (sourceSection) {
    lines.push(`Vision source: ${sourceSection}`);
  }
  if (reasoning) {
    lines.push(`\nWhy score was low: ${reasoning}`);
  }
  if (dim.gaps?.length) {
    lines.push(`\nIdentified gaps: ${dim.gaps.slice(0, 3).join('; ')}`);
  }

  lines.push(`\nAddress the ${dimensionName} dimension to improve vision alignment above ${THRESHOLDS.ACCEPT}.`);

  return lines.join('\n');
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Generate a corrective SD from a vision score record.
 * Idempotent: if a corrective SD was already generated for this score, returns it.
 *
 * @param {string} scoreId - UUID of the eva_vision_scores record
 * @returns {Promise<{created: boolean, action: string, sdKey: string|null, sdId: string|null}>}
 */
// SD-FDBK-ENH-HEAL-COMMAND-MJS-001: bind options param so line 286 staleness check (CAPA-3) does not ReferenceError
export async function generateCorrectiveSD(scoreId, options = {}) {
  const supabase = getSupabase();

  // 1. Load the score record (include created_by and rubric_snapshot for quality checks)
  const { data: score, error: scoreErr } = await supabase
    .from('eva_vision_scores')
    .select('id, vision_id, sd_id, total_score, threshold_action, generated_sd_ids, dimension_scores, rubric_snapshot, created_by')
    .eq('id', scoreId)
    .single();

  if (scoreErr || !score) {
    throw new Error(`Score not found: ${scoreId} — ${scoreErr?.message}`);
  }

  // 1a. Skip test score records (created by smoke tests / manual inserts)
  const createdBy = score.created_by ?? '';
  if (TEST_CREATED_BY_PATTERNS.some(p => createdBy.startsWith(p))) {
    console.log(`[corrective-sd-generator] Skipping test record (created_by: ${createdBy})`);
    return { created: false, action: 'skipped', reason: 'test-data-filtered', sdKey: null, sdId: null };
  }

  // 1b. Minimum occurrence threshold — don't create SDs from single-run data
  // Critical severity override: escalation-level scores (<70) require only 1 occurrence.
  // SD heal scores (mode='sd-heal') also require only 1 occurrence since they are one-shot.
  const isEscalation = (score.total_score ?? 0) < THRESHOLDS.GAP_CLOSURE;
  const isSDHeal = score.rubric_snapshot?.mode === 'sd-heal';
  const effectiveMinOccurrences = (isEscalation || isSDHeal) ? 1 : MIN_OCCURRENCES;
  const { qualifies, count } = await checkMinOccurrences(supabase, score.sd_id ?? null, effectiveMinOccurrences);
  if (!qualifies) {
    console.log(`[corrective-sd-generator] Skipping: only ${count}/${effectiveMinOccurrences} occurrences below threshold`);
    return { created: false, action: 'deferred', reason: `min-occurrences-not-met (${count}/${effectiveMinOccurrences})`, sdKey: null, sdId: null };
  }

  // 1c. Overall-only detection — skip scores with < 3 dimensions (SD-MAN-INFRA-ENFORCE-PER-DIMENSION-003)
  // QF-20260424-807: accept both V/A codes and SD-heal friendly dimension names.
  const dimKeys = Object.keys(score.dimension_scores || {}).filter(_isKnownDimensionKey);
  if (dimKeys.length < 3) {
    console.log(`[corrective-sd-generator] Skipping: score has only ${dimKeys.length} dimension(s) — needs re-scoring with full 5-dimension breakdown`);
    console.log(`[corrective-sd-generator] RE_SCORE_NEEDED=true score_id=${scoreId} sd_id=${score.sd_id}`);
    await _logAudit(supabase, scoreId, 'skipped_incomplete_dimensions', null, score.vision_id);
    return { created: false, action: 'skipped', reason: `incomplete-dimensions (${dimKeys.length}/5)`, sdKey: null, sdId: null, needsRescore: true };
  }

  // 1d. Relevance validation — skip if signals suggest false positive
  const relevance = checkRelevanceSignals(score);
  if (relevance.likely_false_positive) {
    console.log(`[corrective-sd-generator] Skipping: ${relevance.signal_count}/${relevance.total_dims} dimensions flagged as intentional omissions (ratio ${(relevance.ratio * 100).toFixed(0)}%)`);
    await _logAudit(supabase, scoreId, 'skipped_false_positive', null, score.vision_id);
    return { created: false, action: 'skipped', reason: `false-positive-signals (${relevance.signal_count}/${relevance.total_dims})`, sdKey: null, sdId: null };
  }

  // 1e. Staleness check — skip if score is based on outdated codebase state
  // SD-LEO-INFRA-HEAL-PIPELINE-INTEGRITY-001 (CAPA-3)
  const scoreGitSha = score.rubric_snapshot?.git_sha;
  if (scoreGitSha && !options?.force) {
    try {
      const { execSync } = await import('child_process');
      const commitCount = execSync(`git rev-list --count ${scoreGitSha}..HEAD 2>/dev/null`, { encoding: 'utf8' }).trim();
      const commitsBehind = parseInt(commitCount, 10) || 0;
      const STALENESS_THRESHOLD = 50;
      if (commitsBehind > STALENESS_THRESHOLD) {
        console.log(`[corrective-sd-generator] ⚠️  STALE SCORE: ${commitsBehind} commits behind HEAD (threshold: ${STALENESS_THRESHOLD})`);
        console.log(`[corrective-sd-generator] Score git_sha: ${scoreGitSha} — scored_at: ${score.scored_at}`);
        console.log(`[corrective-sd-generator] Use --force to override staleness check`);
        await _logAudit(supabase, scoreId, 'skipped_stale_score', null, score.vision_id);
        return { created: false, action: 'skipped', reason: `stale-score (${commitsBehind} commits behind)`, sdKey: null, sdId: null };
      }
    } catch {
      // git command failed (worktree, shallow clone, etc.) — proceed anyway
    }
  }

  // 2. Determine action (prefer stored threshold_action, fall back to classify)
  // Normalize DB values: "escalate" → "escalation", "gap_closure" → "gap-closure", etc.
  const rawAction = score.threshold_action || classifyScore(score.total_score ?? 0);
  const action = _normalizeAction(rawAction);

  // 3. Accept — no SD needed
  if (action === 'accept') {
    await _logAudit(supabase, scoreId, action, null, score.vision_id);
    return { created: false, action, sdKey: null, sdId: null };
  }

  // 4. Idempotency — check generated_sd_ids
  const existingIds = score.generated_sd_ids ?? [];
  if (existingIds.length > 0) {
    // Fetch the first existing corrective SD
    const { data: existing } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key')
      .in('id', existingIds)
      .limit(1)
      .single();

    if (existing) {
      return { created: false, action, sdKey: existing.sd_key || existing.id, sdId: existing.id };
    }
  }

  // 4b. Source-completion + parent-orchestrator suppression
  // (SD-FDBK-INFRA-SUPPRESS-CORRECTIVE-GENERATOR-001 CAPA 1 + 2). Runs BEFORE
  // multi-dim extraction so the audit trail is clean and no groups are formed
  // for SDs that should never have generated a finding in the first place.
  if (score.sd_id) {
    const completedCheck = await isSourceCompletedRecently(score.sd_id, supabase);
    if (completedCheck.suppress) {
      const eventType = 'skipped_completed_source_24h';
      console.log(`[corrective-sd-generator] eva.corrective.${eventType} source_sd_id=${completedCheck.sourceSdKey} hours_since=${completedCheck.hoursSince}`);
      await _logAudit(supabase, scoreId, eventType, null, score.vision_id, {
        source_sd_id: completedCheck.sourceSdKey,
        reason: completedCheck.reason,
        hours_since_completion: completedCheck.hoursSince,
      });
      return { created: false, action: 'skipped', reason: 'completed_source_24h', sdKey: null, sdId: null };
    }
    const parentCheck = await isParentOrchestratorStale(score.sd_id, supabase);
    if (parentCheck.suppress) {
      const eventType = 'skipped_stale_orchestrator_30d';
      console.log(`[corrective-sd-generator] eva.corrective.${eventType} parent_sd_key=${parentCheck.parentSdKey} days_stale=${parentCheck.daysSince}`);
      await _logAudit(supabase, scoreId, eventType, null, score.vision_id, {
        parent_sd_key: parentCheck.parentSdKey,
        reason: parentCheck.reason,
        days_stale: parentCheck.daysSince,
      });
      return { created: false, action: 'skipped', reason: 'stale_orchestrator_30d', sdKey: null, sdId: null };
    }
  }

  // 5. Multi-dimension extraction and grouping (SD-MAN-INFRA-VISION-CORRECTIVE-MULTI-DIM-001)
  const tier = TIER_CONFIG[action] ?? TIER_CONFIG.escalation;
  const weakDims = _extractWeakDimensions(score.dimension_scores, 3);
  const { vDims, aDims, otherDims } = _groupDimensions(weakDims);

  // 5a. Load intelligence signals for dynamic priority (SD-EHG-ORCH-INTELLIGENCE-INTEGRATION-001-C)
  let intelligenceSignals = null;
  let priorityResult = null;
  try {
    intelligenceSignals = await loadIntelligenceSignals(supabase, score.sd_id ?? '', { sdUuid: score.sd_id });
    priorityResult = calculateCorrectivePriority({
      tier: action,
      okrImpact: intelligenceSignals.okrImpact,
      patterns: intelligenceSignals.patterns,
      blocking: intelligenceSignals.blocking,
      visionScore: score.total_score,
    });
  } catch (err) {
    console.warn(`[corrective-sd-generator] Intelligence loading failed, using static priority: ${err.message}`);
    // Fall back to static tier priority
    priorityResult = { priority: tier.priority, band: null, score: null, reason_codes: ['static_fallback'], source: 'tier-fallback' };
  }

  // Groups to process: V-dims → corrective SD; A-dims → infrastructure SD; other → corrective SD
  const groups = [
    { dims: vDims,    sdType: 'corrective',       category: 'corrective',      label: 'Vision' },
    { dims: aDims,    sdType: 'infrastructure',   category: 'infrastructure',  label: 'Architecture' },
    { dims: otherDims, sdType: tier.sdType ?? 'corrective', category: tier.sdType ?? 'corrective', label: 'Vision' },
  ].filter(g => g.dims.length > 0);

  // Fall back to single lowest-dimension if no weak dims found (e.g. empty dimension_scores)
  if (groups.length === 0) {
    const { dimId, dimensionName } = _extractLowestDimension(score.dimension_scores, score.total_score);
    groups.push({
      dims: [{ dimId, dimensionName, score: score.total_score }],
      sdType: tier.sdType ?? 'corrective',
      category: tier.sdType ?? 'corrective',
      label: 'Vision',
    });
  }

  // 5b. Source-class filter (SD-LEO-INFRA-FILTER-CORRECTIVE-GENERATOR-001 shipped
  // A05-only; SD-LEO-INFRA-EXTEND-CORRECTIVE-GENERATOR-001 extends to A01-A05;
  // QF-20260610-124 extends readonly/bugfix/documentation verdicts to V-dims too).
  // For suppressed sources the architectural row (A01-A05) is noise because the SD
  // does not change architecture; for the readonly verdict subset the V-dims are
  // equally noise (the SD never scoped vision-relevant behavior). lifecycle_feature
  // keeps V-dims. Drop empty groups. Other dims still emit for non-suppressed sources.
  if (score.sd_id) {
    const verdict = await isSourceSDA05Suppressed(score.sd_id, supabase);
    if (verdict.suppress) {
      const { suppressedArch, suppressedVision } = _stripSuppressedDims(groups, verdict.reason);
      if (suppressedArch.length > 0) {
        const eventType = verdict.reason === 'lifecycle_feature'
          ? 'skipped_lifecycle_feature_class'
          : 'skipped_a05_source_class';
        console.log(`[corrective-sd-generator] eva.corrective.${eventType} source_sd_id=${verdict.sourceSdKey} reason=${verdict.reason} dims=${suppressedArch.join(',')} total_score=${score.total_score ?? '?'}`);
        await _logAudit(supabase, scoreId, eventType, null, score.vision_id, {
          source_sd_id: verdict.sourceSdKey,
          reason: verdict.reason,
          suppressed_dims: suppressedArch,
        });
      }
      // QF-20260610-124 (FR-3): distinct event so the V-dim strip is observable in
      // the brainstorm_sessions audit, mirroring the skipped_a05_source_class shape.
      if (suppressedVision.length > 0) {
        const eventType = 'skipped_vision_dim_readonly_source';
        console.log(`[corrective-sd-generator] eva.corrective.${eventType} source_sd_id=${verdict.sourceSdKey} reason=${verdict.reason} dims=${suppressedVision.join(',')} total_score=${score.total_score ?? '?'}`);
        await _logAudit(supabase, scoreId, eventType, null, score.vision_id, {
          source_sd_id: verdict.sourceSdKey,
          reason: verdict.reason,
          suppressed_dims: suppressedVision,
        });
      }
    }
  }

  // 5c. Tautology guard (SD-FDBK-INFRA-SUPPRESS-CORRECTIVE-GENERATOR-001 CAPA-3).
  // Refuse the entire emission when the source SD's key_changes are all
  // placeholder templates — generating a corrective finding for an SD whose
  // own deliverable is template noise is tautological. Conservative default:
  // emit when key_changes is missing or unreadable.
  if (score.sd_id) {
    try {
      const { data: sourceForTautology } = await supabase
        .from('strategic_directives_v2')
        .select('key_changes')
        .or(`sd_key.eq.${score.sd_id},id.eq.${score.sd_id}`)
        .limit(1)
        .maybeSingle();
      if (sourceForTautology && isAllKeyChangesPlaceholder(sourceForTautology.key_changes)) {
        const eventType = 'refused_tautology_key_changes';
        console.log(`[corrective-sd-generator] eva.corrective.${eventType} source_sd_id=${score.sd_id} reason=all_key_changes_placeholder`);
        await _logAudit(supabase, scoreId, eventType, null, score.vision_id, {
          source_sd_id: score.sd_id,
          reason: 'all_key_changes_placeholder',
        });
        return { created: false, action: 'skipped', reason: 'tautology_key_changes', sdKey: null, sdId: null };
      }
    } catch {
      // Conservative default: emit on lookup failure
    }
  }

  // 6. Record one feedback finding per group via corrective-finding-recorder
  // (SD-LEO-INFRA-CORRECTIVE-FINDING-REDIRECT-001). Replaces direct createSD()
  // emission; findings now persist in feedback (category='corrective_finding')
  // and are promoted to SDs deliberately via scripts/corrective-triage.mjs.
  const recordedFindings = [];

  for (const group of groups) {
    const { dims, label } = group;
    const dimSummary = dims.map(d => `${d.dimensionName} (${d.dimId})`).join(', ');
    const lowestScore = dims[0]?.score ?? score.total_score;
    const title = `Corrective: ${label} Gap — ${dimSummary} (score ${score.total_score ?? '?'}/100)`;
    const description = buildEnrichedDescription(
      dims[0]?.dimensionName, dims[0]?.dimId, score.dimension_scores,
      score.rubric_snapshot, score.total_score, action
    );

    const dimensionIds = dims.map(d => d.dimId);
    const correctiveClass = label === 'Vision' ? 'vision_gap'
      : label === 'Architecture' ? 'arch_gap'
      : 'other_gap';
    const sourceGate = score.rubric_snapshot?.mode === 'sd-heal'
      ? 'eva_heal_score'
      : 'eva_vision_score';
    const dynamicPriority = priorityResult?.priority ?? tier.priority;

    try {
      const result = await recordCorrectiveFinding(supabase, {
        source_sd_id: score.sd_id ?? null,
        source_gate: sourceGate,
        gate_run_id: scoreId,
        corrective_class: correctiveClass,
        dimensions: dimensionIds,
        tier: action,
        score: score.total_score ?? null,
        title,
        description,
        metadata: {
          source: 'corrective_sd_generator',
          dim_summary: dimSummary,
          lowest_dim_score: lowestScore,
          vision_id: score.vision_id ?? null,
          action_tier: action,
          // SD-FDBK-INFRA-SUPPRESS-CORRECTIVE-GENERATOR-001 CAPA-4: strip the
          // source_gate's corresponding handoff-gate entry so corrective findings
          // don't self-exempt from the gate that justified their existence.
          gate_exemptions: stripSelfExemptingGate(['GATE_VISION_SCORE'], sourceGate),
          intelligence_priority: {
            priority: dynamicPriority,
            band: priorityResult?.band ?? null,
            score: priorityResult?.score ?? null,
            reason_codes: priorityResult?.reason_codes ?? [],
            source: priorityResult?.source ?? 'static',
          },
          // Stored for triage CLI promote — payload identical to pre-redesign
          // createSD args, so promotion produces the same SD as before.
          promote_payload: {
            sdType: group.sdType,
            category: group.category,
            parentId: ORCHESTRATOR_ID,
            priority: dynamicPriority,
            rationale: `Vision score of ${score.total_score ?? '?'}/100 is below the ${action} threshold. Corrective action required for ${label} dimensions: ${dimSummary}.`,
            strategic_objectives: dims.map(d => ({ objective: `Improve ${d.dimensionName} above ${THRESHOLDS.ACCEPT}`, metric: `EVA ${d.dimId} >= ${THRESHOLDS.ACCEPT}` })),
            success_criteria: dims.map(d => ({ criterion: `${d.dimensionName} gap addressed`, measure: `EVA re-score shows ${d.dimId} >= ${THRESHOLDS.ACCEPT}` })),
            success_metrics: [{ metric: 'EVA dimension score', target: String(THRESHOLDS.ACCEPT), actual: String(lowestScore) }],
            key_principles: [{ principle: 'Vision alignment', description: `Address ${label} gap(s) to improve EVA vision score` }],
          },
        },
      });

      recordedFindings.push({ feedbackId: result.feedbackId, recorded: result.recorded, dims, label });
      await _logAudit(supabase, scoreId, action, null, score.vision_id, {
        feedback_id: result.feedbackId,
        recorded: result.recorded,
        dedup_hash: result.dedupHash,
        corrective_class: correctiveClass,
        source_gate: sourceGate,
      });

      // Replaces CORRECTIVE_SD_CREATED — no SD created at this stage.
      publishVisionEvent(VISION_EVENTS.CORRECTIVE_FINDING_RECORDED ?? 'eva.corrective.finding_recorded', {
        originSdKey: score.sd_id || null,
        feedbackId: result.feedbackId,
        recorded: result.recorded,
        scoreId,
        action,
        dimensions: dimensionIds,
        label,
        correctiveClass,
        sourceGate,
      });
    } catch (recErr) {
      console.warn(`[corrective-sd-generator] Failed to record ${label} finding: ${recErr?.message}`);
      continue;
    }
  }

  if (recordedFindings.length === 0) {
    throw new Error('Failed to record any corrective findings');
  }

  // 7. Backward-compatible return shim: existing callers may destructure
  //    {created, action, sdKey, sdId, sds}. We preserve those keys (as null/[]
  //    since no SDs are created at this stage) and add feedbackIds as additive
  //    new field. eva_vision_scores.generated_sd_ids no longer updated here —
  //    triage CLI promote will update it when an SD is actually created.
  return {
    created: false,
    action,
    sdKey: null,
    sdId: null,
    sds: [],
    feedbackIds: recordedFindings.map(f => f.feedbackId),
    findings: recordedFindings,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _normalizeAction(raw) {
  const map = {
    escalate: 'escalation',
    'gap_closure': 'gap-closure',
    'gap-closure': 'gap-closure',
    minor: 'minor',
    accept: 'accept',
    escalation: 'escalation',
  };
  return map[raw?.toLowerCase()] ?? 'escalation';
}

/**
 * Extract all dimensions below THRESHOLDS.MINOR, sorted ascending by score.
 * SD-MAN-INFRA-VISION-CORRECTIVE-MULTI-DIM-001: multi-dimension extraction.
 *
 * @param {Object|null} dimensionScores - dimension_scores JSONB
 * @param {number} [maxDims=3] - Maximum weak dimensions to return
 * @returns {Array<{dimId: string, dimensionName: string, score: number}>}
 */
export function _extractWeakDimensions(dimensionScores, maxDims = 3) {
  if (!dimensionScores || typeof dimensionScores !== 'object') return [];
  const entries = Object.entries(dimensionScores);
  if (entries.length === 0) return [];

  return entries
    .filter(([dimId]) => _isKnownDimensionKey(dimId))
    .map(([dimId, dimData]) => {
      const score = typeof dimData === 'object' ? (dimData?.score ?? 100) : Number(dimData);
      const dimensionName = (typeof dimData === 'object' ? dimData?.name : null) || dimId;
      return { dimId, dimensionName, score };
    })
    .filter(d => d.score < THRESHOLDS.MINOR)
    .sort((a, b) => a.score - b.score)
    .slice(0, maxDims);
}

/**
 * Group weak dimensions by prefix: V (vision gaps) and A (architecture gaps).
 * SD-MAN-INFRA-VISION-CORRECTIVE-MULTI-DIM-001
 *
 * @param {Array<{dimId: string, dimensionName: string, score: number}>} dims
 * @returns {{ vDims: Array, aDims: Array, otherDims: Array }}
 */
export function _groupDimensions(dims) {
  const vDims = dims.filter(d => d.dimId.startsWith('V'));
  const aDims = dims.filter(d => d.dimId.startsWith('A'));
  const otherDims = dims.filter(d => !d.dimId.startsWith('V') && !d.dimId.startsWith('A'));
  return { vDims, aDims, otherDims };
}

/**
 * Extract the lowest-scoring dimension from dimension_scores JSONB.
 * @deprecated Use _extractWeakDimensions() for multi-dimension support.
 * @returns {{ dimId: string, dimensionName: string }}
 */
function _extractLowestDimension(dimensionScores, totalScore) {
  const weak = _extractWeakDimensions(dimensionScores, 1);
  if (weak.length > 0) return { dimId: weak[0].dimId, dimensionName: weak[0].dimensionName };
  return { dimId: 'overall', dimensionName: `overall (${totalScore ?? '?'}/100)` };
}

// Keep old name as alias for external callers during transition
function _extractDimensionName(dimensionScores, totalScore) {
  return _extractLowestDimension(dimensionScores, totalScore).dimensionName;
}

async function _logAudit(supabase, scoreId, action, sdKey, visionId, extra = null) {
  try {
    await supabase.from('brainstorm_sessions').insert({
      domain: 'protocol',
      topic: `EVA Corrective SD: ${sdKey ?? action}`,
      mode: 'structured',
      capabilities_status: 'not_checked',
      retrospective_status: 'pending',
      metadata: {
        source: 'corrective_sd_generator',
        score_id: scoreId,
        vision_id: visionId,
        action_taken: action,
        sd_key_created: sdKey ?? null,
        ...(extra || {}),
      },
    });
  } catch {
    // Audit is non-blocking
    console.warn('[corrective-sd-generator] Audit log failed (non-blocking)');
  }
}

// ─── CLI Entry Point ──────────────────────────────────────────────────────────

const argv1 = process.argv[1];
const isMain = argv1 && (
  import.meta.url === `file://${argv1}` ||
  import.meta.url === `file:///${argv1.replace(/\\/g, '/')}`
);

if (isMain) {
  const scoreId = process.argv[2];
  if (!scoreId) {
    console.error('Usage: node scripts/eva/corrective-sd-generator.mjs <score-id>');
    process.exit(1);
  }

  generateCorrectiveSD(scoreId)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}
