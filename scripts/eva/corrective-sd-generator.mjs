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

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env') });

// ─── Threshold Configuration ─────────────────────────────────────────────────
// Exported so callers can inspect and tests can reference without magic numbers.

export const THRESHOLDS = {
  ACCEPT: 85,      // >=85: no action needed
  MINOR: 70,       // 70-84: minor enhancement SD (medium priority)
  GAP_CLOSURE: 50, // 50-69: gap-closure SD (high priority)
  ESCALATION: 0,   // <50:  critical escalation SD
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

  // 1. Load the score record
  const { data: score, error: scoreErr } = await supabase
    .from('eva_vision_scores')
    .select('id, vision_id, total_score, threshold_action, generated_sd_ids, dimension_scores')
    .eq('id', scoreId)
    .single();

  if (scoreErr || !score) {
    throw new Error(`Score not found: ${scoreId} — ${scoreErr?.message}`);
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

  // 5. Build corrective SD title from dimension context
  const tier = TIER_CONFIG[action] ?? TIER_CONFIG.escalation;
  const sdKey = generateCorrectiveSdKey();
  const dimensionName = _extractDimensionName(score.dimension_scores, score.total_score);
  const title = `[${action.toUpperCase()}] Vision Gap: ${dimensionName} (score ${score.total_score ?? '?'}/100)`;
  const description = `Auto-generated corrective SD from EVA vision scoring. ` +
    `Score ${score.total_score ?? '?'}/100 is in the "${action}" tier (threshold: ${THRESHOLDS[action.toUpperCase().replace('-', '_')] ?? THRESHOLDS.GAP_CLOSURE}). ` +
    `Address the gap in dimension "${dimensionName}" to improve vision alignment.`;

  // 6. Insert corrective SD
  const { data: newSD, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .insert({
      id: sdKey,
      sd_key: sdKey,
      title,
      description,
      status: 'draft',
      category: tier.sdType ?? 'feature',
      sd_type: tier.sdType ?? 'feature',
      priority: tier.priority,
      rationale: `Vision score of ${score.total_score ?? '?'}/100 is below the ${action} threshold. Corrective action required to maintain vision alignment.`,
      scope: `Address the "${dimensionName}" dimension gap identified by EVA scoring run ${scoreId}.`,
      current_phase: 'LEAD',
      target_application: 'EHG_Engineer',
      version: '1.0',
      parent_sd_id: ORCHESTRATOR_ID,
      vision_origin_score_id: scoreId,
      key_principles: [{ principle: 'Vision alignment', description: 'Address gap to improve EVA vision score' }],
      strategic_objectives: [{ objective: `Improve ${dimensionName} dimension score above ${THRESHOLDS.ACCEPT}`, metric: 'EVA dimension score >= 85' }],
      success_criteria: [{ criterion: 'Dimension gap addressed', measure: `EVA re-score shows ${dimensionName} >= ${THRESHOLDS.ACCEPT}` }],
      success_metrics: [{ metric: 'EVA dimension score', target: String(THRESHOLDS.ACCEPT), actual: String(score.total_score ?? 0) }],
    })
    .select('id, sd_key')
    .single();

  if (sdErr || !newSD) {
    throw new Error(`Failed to create corrective SD: ${sdErr?.message}`);
  }

  // 7. Update generated_sd_ids on the score record
  await supabase
    .from('eva_vision_scores')
    .update({ generated_sd_ids: [...existingIds, newSD.id] })
    .eq('id', scoreId);

  // 8. Audit log (non-blocking)
  await _logAudit(supabase, scoreId, action, newSD.sd_key || newSD.id, score.vision_id);

  return { created: true, action, sdKey: newSD.sd_key || newSD.id, sdId: newSD.id };
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

function _extractDimensionName(dimensionScores, totalScore) {
  if (!dimensionScores || typeof dimensionScores !== 'object') {
    return `overall (${totalScore ?? '?'}/100)`;
  }
  // Find the lowest-scoring dimension
  const entries = Object.entries(dimensionScores);
  if (entries.length === 0) return `overall (${totalScore ?? '?'}/100)`;
  const [name] = entries.sort(([, a], [, b]) => a - b)[0];
  return name;
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
