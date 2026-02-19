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
import { randomBytes } from 'crypto';
import { GRADE } from '../../lib/standards/grade-scale.js';

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

// SD type and priority per tier
const TIER_CONFIG = {
  accept:      { action: 'accept',      sdType: null,            priority: null },
  minor:       { action: 'minor',       sdType: 'enhancement',   priority: 'medium' },
  'gap-closure': { action: 'gap-closure', sdType: 'feature',     priority: 'high' },
  escalation:  { action: 'escalation',  sdType: 'feature',       priority: 'critical' },
};

// Orchestrator parent UUID (SD-MAN-ORCH-EVA-VISION-GOVERNANCE-001)
const ORCHESTRATOR_ID = 'da3b936a-3f62-4966-9093-f1c1bdec53e7';

// Minimum number of scoring runs below threshold before generating a corrective SD.
// Prevents test data or one-off scores from polluting the SD queue.
// Set to 1 for critical severity overrides (see checkMinOccurrences).
export const MIN_OCCURRENCES = 2;

// created_by values that identify test/smoke-test score records to skip.
const TEST_CREATED_BY_PATTERNS = ['test-', 'test-sync', 'vision-scorer-test'];

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

// ─── SD Key Generator ─────────────────────────────────────────────────────────

function generateCorrectiveSdKey() {
  const hex = randomBytes(3).toString('hex').toUpperCase(); // 6 chars
  return `SD-CORR-VIS-${hex}`;
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

  // Exclude test records
  for (const pattern of TEST_CREATED_BY_PATTERNS) {
    query = query.not('created_by', 'like', `${pattern}%`);
  }

  const { count, error } = await query;
  if (error) {
    console.warn(`[corrective-sd-generator] Occurrence check failed: ${error.message} — defaulting to qualify`);
    return { qualifies: true, count: minOccurrences };
  }

  return { qualifies: (count ?? 0) >= minOccurrences, count: count ?? 0 };
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
export async function generateCorrectiveSD(scoreId) {
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
  const { qualifies, count } = await checkMinOccurrences(supabase, score.sd_id ?? null);
  if (!qualifies) {
    console.log(`[corrective-sd-generator] Skipping: only ${count}/${MIN_OCCURRENCES} occurrences below threshold`);
    return { created: false, action: 'deferred', reason: `min-occurrences-not-met (${count}/${MIN_OCCURRENCES})`, sdKey: null, sdId: null };
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

  // 5. Multi-dimension extraction and grouping (SD-MAN-INFRA-VISION-CORRECTIVE-MULTI-DIM-001)
  const tier = TIER_CONFIG[action] ?? TIER_CONFIG.escalation;
  const weakDims = _extractWeakDimensions(score.dimension_scores, 3);
  const { vDims, aDims, otherDims } = _groupDimensions(weakDims);

  // Groups to process: V-dims → governance/feature SD; A-dims → infrastructure SD; other → feature SD
  const groups = [
    { dims: vDims,    sdType: 'feature',         category: 'feature',         label: 'Vision' },
    { dims: aDims,    sdType: 'infrastructure',   category: 'infrastructure',  label: 'Architecture' },
    { dims: otherDims, sdType: tier.sdType ?? 'feature', category: tier.sdType ?? 'feature', label: 'Vision' },
  ].filter(g => g.dims.length > 0);

  // Fall back to single lowest-dimension if no weak dims found (e.g. empty dimension_scores)
  if (groups.length === 0) {
    const { dimId, dimensionName } = _extractLowestDimension(score.dimension_scores, score.total_score);
    groups.push({
      dims: [{ dimId, dimensionName, score: score.total_score }],
      sdType: tier.sdType ?? 'feature',
      category: tier.sdType ?? 'feature',
      label: 'Vision',
    });
  }

  // 6. Create one SD per group, collecting all new IDs
  const createdSDs = [];
  const allGeneratedIds = [...existingIds];

  for (const group of groups) {
    const { dims, sdType, category, label } = group;
    const dimSummary = dims.map(d => `${d.dimensionName} (${d.dimId})`).join(', ');
    const lowestScore = dims[0]?.score ?? score.total_score;
    const sdKey = generateCorrectiveSdKey();
    const title = `[${action.toUpperCase()}] ${label} Gap: ${dimSummary} (score ${score.total_score ?? '?'}/100)`;
    const description = buildEnrichedDescription(
      dims[0]?.dimensionName, dims[0]?.dimId, score.dimension_scores,
      score.rubric_snapshot, score.total_score, action
    );

    const { data: newSD, error: sdErr } = await supabase
      .from('strategic_directives_v2')
      .insert({
        id: sdKey,
        sd_key: sdKey,
        title,
        description,
        status: 'draft',
        category,
        sd_type: sdType,
        priority: tier.priority,
        rationale: `Vision score of ${score.total_score ?? '?'}/100 is below the ${action} threshold. Corrective action required for ${label} dimensions: ${dimSummary}.`,
        scope: `Address ${label} dimension gap(s): ${dimSummary}. EVA score run: ${scoreId}. Lowest dim score: ${lowestScore}/100. Target: >=${THRESHOLDS.ACCEPT}.`,
        current_phase: 'LEAD',
        target_application: 'EHG_Engineer',
        version: '1.0',
        parent_sd_id: ORCHESTRATOR_ID,
        vision_origin_score_id: scoreId,
        key_principles: [{ principle: 'Vision alignment', description: `Address ${label} gap(s) to improve EVA vision score` }],
        strategic_objectives: dims.map(d => ({ objective: `Improve ${d.dimensionName} above ${THRESHOLDS.ACCEPT}`, metric: `EVA ${d.dimId} >= ${THRESHOLDS.ACCEPT}` })),
        success_criteria: dims.map(d => ({ criterion: `${d.dimensionName} gap addressed`, measure: `EVA re-score shows ${d.dimId} >= ${THRESHOLDS.ACCEPT}` })),
        success_metrics: [{ metric: 'EVA dimension score', target: String(THRESHOLDS.ACCEPT), actual: String(lowestScore) }],
      })
      .select('id, sd_key')
      .single();

    if (sdErr || !newSD) {
      console.warn(`[corrective-sd-generator] Failed to create ${label} SD: ${sdErr?.message}`);
      continue;
    }

    createdSDs.push({ sdKey: newSD.sd_key || newSD.id, sdId: newSD.id, dims, label });
    allGeneratedIds.push(newSD.id);
    await _logAudit(supabase, scoreId, action, newSD.sd_key || newSD.id, score.vision_id);
  }

  if (createdSDs.length === 0) {
    throw new Error('Failed to create any corrective SDs');
  }

  // 7. Update generated_sd_ids with all created SD IDs
  await supabase
    .from('eva_vision_scores')
    .update({ generated_sd_ids: allGeneratedIds })
    .eq('id', scoreId);

  // Backward-compatible return: primary SD = first created; sds = full list
  const primary = createdSDs[0];
  return { created: true, action, sdKey: primary.sdKey, sdId: primary.sdId, sds: createdSDs };
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

async function _logAudit(supabase, scoreId, action, sdKey, visionId) {
  try {
    await supabase.from('brainstorm_sessions').insert({
      domain: 'protocol',
      topic: `EVA Corrective SD: ${sdKey ?? 'accept (no SD)'}`,
      mode: 'structured',
      capabilities_status: 'not_checked',
      retrospective_status: 'pending',
      metadata: {
        source: 'corrective_sd_generator',
        score_id: scoreId,
        vision_id: visionId,
        action_taken: action,
        sd_key_created: sdKey ?? null,
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
