/**
 * Vision Score Gate for LEAD-TO-PLAN
 * SD: SD-MAN-INFRA-VISION-SCORE-GATE-HARDEN-001
 * Enhanced: SD-CONTEXTAWARE-VISION-SCORING-DYNAMIC-ORCH-001-A
 *
 * Hard SD-type-aware enforcement gate — blocks handoff when vision score is
 * below the type-specific threshold or when no score exists.
 *
 * Dynamic threshold adjustment (SD-CONTEXTAWARE-VISION-SCORING-DYNAMIC-ORCH-001-A):
 *   adjusted_threshold = base_threshold * (addressable_dims / total_dims)
 *   Floor rule: min 3 addressable dimensions, score >= 60
 *   Audit: every gate evaluation logged with full dimensional context
 *
 * Threshold tiers:
 *   feature / governance / security    → must score ≥ 90
 *   infrastructure / enhancement       → must score ≥ 80
 *   maintenance / protocol / bugfix /
 *   fix / documentation / refactor /
 *   orchestrator                       → must score ≥ 70
 *   unknown / default                  → must score ≥ 80
 *
 * Override: A row in validation_gate_registry with
 *   gate_name='GATE_VISION_SCORE', applicability='OPTIONAL_OVERRIDE',
 *   and a non-empty justification field bypasses the hard block.
 *
 * Per-dimension warnings: Any dimension score < 75 emits a named warning
 * (non-blocking — valid=true is still returned when overall score passes).
 */

/** Threshold per SD type. Exported for tests. */
export const SD_TYPE_THRESHOLDS = {
  // Tier 1 — highest bar
  feature:        90,
  governance:     90,
  security:       90,
  // Tier 2 — standard bar
  infrastructure: 80,
  enhancement:    80,
  // Tier 3 — lower bar
  maintenance:    70,
  protocol:       70,
  bugfix:         70,
  fix:            70,
  documentation:  70,
  refactor:       70,
  orchestrator:   70,
  // Default (unknown types)
  _default:       80,
};

/** Minimum dimension score before a named warning is emitted. */
export const DIMENSION_WARNING_THRESHOLD = 75;

/** Minimum addressable dimensions for auto-scoring (floor rule). */
export const MIN_ADDRESSABLE_DIMENSIONS = 3;

/** Minimum average score for addressable dimensions (floor rule). */
export const FLOOR_MINIMUM_SCORE = 60;

/**
 * Dimension addressability by SD type.
 * Maps SD type to a Set of dimension name patterns that the type CAN address.
 * Dimensions not in this set are considered non-addressable for that SD type.
 * Pattern matching is case-insensitive substring match.
 *
 * null = all dimensions addressable (no adjustment needed).
 */
export const SD_TYPE_ADDRESSABLE_DIMENSIONS = {
  feature:        null, // features can address all dimensions
  governance:     null,
  security:       ['security', 'compliance', 'risk', 'architecture', 'reliability', 'data'],
  infrastructure: ['architecture', 'reliability', 'scalability', 'performance', 'security', 'maintainability', 'automation', 'observability'],
  enhancement:    null,
  maintenance:    ['reliability', 'maintainability', 'performance', 'security', 'architecture'],
  protocol:       ['process', 'governance', 'compliance', 'documentation', 'automation', 'quality'],
  bugfix:         ['reliability', 'quality', 'performance', 'security'],
  fix:            ['reliability', 'quality', 'performance', 'security'],
  documentation:  ['documentation', 'knowledge', 'compliance', 'process'],
  refactor:       ['architecture', 'maintainability', 'performance', 'scalability', 'reliability'],
  orchestrator:   null,
};

/**
 * Count addressable dimensions for an SD type given the total dimension names.
 * Returns { addressable, total } counts.
 *
 * @param {string} sdType
 * @param {Object|null} dimensionScores - JSONB { dimName: score, ... }
 * @returns {{ addressable: number, total: number }}
 */
export function countAddressableDimensions(sdType, dimensionScores) {
  if (!dimensionScores || typeof dimensionScores !== 'object') {
    return { addressable: 0, total: 0 };
  }

  const dimNames = Object.keys(dimensionScores);
  const total = dimNames.length;

  const patterns = SD_TYPE_ADDRESSABLE_DIMENSIONS[sdType];
  if (patterns === null || patterns === undefined) {
    return { addressable: total, total }; // all addressable
  }

  const addressable = dimNames.filter(name => {
    const lower = name.toLowerCase();
    return patterns.some(p => lower.includes(p.toLowerCase()));
  }).length;

  return { addressable, total };
}

/**
 * Calculate dynamic threshold based on addressable dimension ratio.
 * Formula: adjusted = base * (addressable / total)
 * Returns base threshold if all dims addressable or no dimension data.
 *
 * @param {number} baseThreshold
 * @param {number} addressable
 * @param {number} total
 * @returns {number} Adjusted threshold (rounded to nearest integer)
 */
export function calculateDynamicThreshold(baseThreshold, addressable, total) {
  if (total === 0 || addressable >= total) return baseThreshold;
  return Math.round(baseThreshold * (addressable / total));
}

/**
 * Log a vision gate evaluation to the database (audit trail).
 * Non-blocking — failures are logged but do not affect the gate result.
 *
 * @param {Object} supabase
 * @param {Object} auditData
 */
async function logGateEvaluation(supabase, auditData) {
  if (!supabase) return;
  try {
    await supabase
      .from('vision_scoring_audit_log')
      .insert({
        sd_id: auditData.sdId,
        sd_type: auditData.sdType,
        total_dims: auditData.totalDims,
        addressable_count: auditData.addressableCount,
        base_threshold: auditData.baseThreshold,
        adjusted_threshold: auditData.adjustedThreshold,
        score: auditData.score,
        verdict: auditData.verdict,
        floor_rule_triggered: auditData.floorRuleTriggered || false,
        evaluation_context: auditData.context || null,
      });
  } catch (e) {
    // Non-blocking: audit logging failure must not block the gate
    console.debug('[VisionScore] Audit log insert suppressed:', e?.message || e);
  }
}

const THRESHOLD_LABELS = {
  accept:        { emoji: '✅', label: 'ACCEPT',      desc: 'Strong vision alignment' },
  minor_sd:      { emoji: '🟡', label: 'MINOR GAP',  desc: 'Minor alignment gaps — consider scope adjustments' },
  gap_closure_sd:{ emoji: '🟠', label: 'GAP',        desc: 'Moderate gaps — corrective SD may be needed' },
  escalate:      { emoji: '🔴', label: 'ESCALATE',   desc: 'Significant gaps — LEAD review recommended' },
};

/**
 * Check for a Chairman override in validation_gate_registry.
 * Returns { active: false } if the table or row is absent (fail-closed: enforce).
 *
 * Table schema: gate_key, sd_type, applicability, reason, created_at.
 * Override is per-sd_type (not per-SD). To bypass vision scoring for an
 * sd_type, insert a row with gate_key='GATE_VISION_SCORE',
 * applicability='OPTIONAL_OVERRIDE', sd_type=<type>, reason=<justification>.
 *
 * @param {string} sdType - The SD's sd_type (e.g. 'infrastructure')
 * @param {Object} supabase
 * @returns {Promise<{active: boolean, justification?: string}>}
 */
async function checkOverride(sdType, supabase) {
  if (!supabase || !sdType) return { active: false };
  try {
    const { data } = await supabase
      .from('validation_gate_registry')
      .select('reason')
      .eq('gate_key', 'GATE_VISION_SCORE')
      .eq('applicability', 'OPTIONAL_OVERRIDE')
      .eq('sd_type', sdType)
      .limit(1);

    if (data && data.length > 0) {
      const justification = (data[0].reason || '').trim();
      if (justification.length > 0) {
        return { active: true, justification };
      }
    }
    return { active: false };
  } catch (e) {
    // Intentionally suppressed: Table or columns absent — fail-closed (enforce the gate)
    console.debug('[VisionScore] bypass check suppressed:', e?.message || e);
    return { active: false };
  }
}

/**
 * Return per-dimension warnings for any dimension whose score < DIMENSION_WARNING_THRESHOLD.
 *
 * @param {Object|null} dimensionScores - JSONB object of { dimName: score, ... }
 * @returns {string[]} Warning strings (may be empty)
 */
function getDimensionWarnings(dimensionScores) {
  if (!dimensionScores || typeof dimensionScores !== 'object') return [];
  return Object.entries(dimensionScores)
    .filter(([, score]) => typeof score === 'number' && score < DIMENSION_WARNING_THRESHOLD)
    .map(([dim, score]) =>
      `Dimension '${dim}': ${score}/100 (below ${DIMENSION_WARNING_THRESHOLD} warning threshold)`
    );
}

/**
 * Validate vision alignment score for the SD (hard enforcement).
 *
 * @param {Object} sd - Strategic Directive (must have sd_key, sd_type)
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object>} Gate result — may block (valid: false)
 */
export async function validateVisionScore(sd, supabase) {
  const sdKey = sd.sd_key || sd.id;
  const sdType = (sd.sd_type || 'unknown').toLowerCase();
  const baseThreshold = SD_TYPE_THRESHOLDS[sdType] ?? SD_TYPE_THRESHOLDS._default;

  // ── Orchestrator-child exemption ──────────────────────────────────────
  // Children of an orchestrator are tactical decompositions of an already
  // vision-aligned parent.  Scoring them individually against the full
  // strategic vision produces false-negatives (e.g., a "40→25 migration"
  // refactor scores 57/100 because it only touches 2-3 dimensions).
  // The parent orchestrator already passed vision alignment at creation.
  // SD-LEO-INFRA-ORCHESTRATOR-GATE-FIXES-ORCH-001-C: also check parent_sd_id
  // (leo-create-sd.js sets parent_sd_key in metadata, not parent_orchestrator)
  if (sd.metadata?.parent_orchestrator || sd.metadata?.auto_generated || sd.parent_sd_id) {
    console.log('\n🔍 GATE: Vision Alignment Score (Hard Enforcement)');
    console.log(`   SD Type: ${sdType} | Required: ${baseThreshold}/100`);
    console.log('-'.repeat(50));
    console.log(`   ⏭️  Orchestrator child detected (parent: ${sd.metadata.parent_orchestrator || 'auto_generated'})`);
    console.log('   ✅ Orchestrator children exempt — parent already validated vision alignment');
    return {
      passed: true,
      score: 100,
      maxScore: 100,
      details: `Orchestrator child exempt from standalone vision scoring (parent: ${sd.metadata.parent_orchestrator || 'auto_generated'})`,
      warnings: ['Orchestrator child: vision scoring deferred to parent orchestrator'],
    };
  }

  // ── Corrective SD exemption ────────────────────────────────────────────
  // Corrective SDs are generated by the heal system to FIX vision gaps.
  // They are meta-directives that inherently score 0/100 on vision alignment
  // because they describe "fix this gap" rather than advancing a dimension.
  // Blocking them creates a circular dependency. RCA: PAT-CORR-VISION-GATE-001
  if (sd.vision_origin_score_id || sd.metadata?.source === 'corrective_sd_generator') {
    console.log('\n🔍 GATE: Vision Alignment Score (Hard Enforcement)');
    console.log(`   SD Type: ${sdType} | Required: ${baseThreshold}/100`);
    console.log('-'.repeat(50));
    console.log(`   ⏭️  Corrective SD detected (origin_score: ${sd.vision_origin_score_id || 'metadata.source'})`);
    console.log('   ✅ Corrective SDs exempt from GATE_VISION_SCORE — they exist to fix vision gaps');
    return {
      passed: true,
      score: 100,
      maxScore: 100,
      details: `Corrective SD exempt from vision scoring (origin_score_id: ${sd.vision_origin_score_id || 'metadata.source'})`,
      warnings: ['Corrective SD: vision scoring bypassed — SD exists to remediate vision gaps'],
    };
  }

  // Prefer SD-level cached score; fall back to live query
  let visionScore = sd.vision_score ?? null;
  let thresholdAction = sd.vision_score_action ?? null;
  let dimensionScores = sd.dimension_scores ?? null;

  // Fetch latest score from eva_vision_scores if not cached
  if (visionScore === null && supabase && sdKey) {
    try {
      const { data } = await supabase
        .from('eva_vision_scores')
        .select('total_score, threshold_action, dimension_scores, scored_at')
        .eq('sd_id', sdKey)
        .order('scored_at', { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        visionScore = data[0].total_score;
        thresholdAction = data[0].threshold_action;
        dimensionScores = data[0].dimension_scores ?? null;
      }
    } catch (e) {
      // Intentionally suppressed: DB unavailable — proceed to hard block
      console.debug('[VisionScore] DB score lookup suppressed:', e?.message || e);
    }
  }

  // ── Dynamic threshold adjustment ────────────────────────────────────────
  const { addressable, total } = countAddressableDimensions(sdType, dimensionScores);
  const threshold = calculateDynamicThreshold(baseThreshold, addressable, total);
  const thresholdAdjusted = threshold !== baseThreshold;

  console.log('\n🔍 GATE: Vision Alignment Score (Hard Enforcement)');
  console.log(`   SD Type: ${sdType} | Base Threshold: ${baseThreshold}/100`);
  if (thresholdAdjusted) {
    console.log(`   📐 Dynamic Threshold: ${threshold}/100 (${addressable}/${total} addressable dims)`);
  }
  console.log('-'.repeat(50));

  // ── No score present → hard block ───────────────────────────────────────
  if (visionScore === null) {
    console.log('   ❌ No vision alignment score found — handoff BLOCKED');
    console.log(`   💡 Run: node scripts/eva/vision-scorer.js --sd-id ${sdKey || '<SD-KEY>'}`);
    await logGateEvaluation(supabase, {
      sdId: sdKey, sdType, totalDims: total, addressableCount: addressable,
      baseThreshold, adjustedThreshold: threshold, score: null, verdict: 'blocked_no_score',
    });
    return {
      passed: false,
      score: 0,
      maxScore: 100,
      details: `No vision alignment score found for ${sdKey}. Run vision-scorer.js before LEAD-TO-PLAN.`,
      remediation: `node scripts/eva/vision-scorer.js --sd-id ${sdKey || '<SD-KEY>'}`,
      warnings: [],
    };
  }

  // ── Floor rule: minimum addressable dimensions ───────────────────────────
  // Only applies when some dims are non-addressable (addressable < total).
  // If all dims are addressable, no adjustment needed regardless of count.
  if (total > 0 && addressable < total && addressable < MIN_ADDRESSABLE_DIMENSIONS) {
    console.log(`   ⚠️  Floor rule: only ${addressable}/${total} addressable dims (min: ${MIN_ADDRESSABLE_DIMENSIONS})`);
    console.log('   🔍 Flagged for human review — too few addressable dimensions');
    await logGateEvaluation(supabase, {
      sdId: sdKey, sdType, totalDims: total, addressableCount: addressable,
      baseThreshold, adjustedThreshold: threshold, score: visionScore,
      verdict: 'human_review_floor_dims', floorRuleTriggered: true,
      context: `Only ${addressable} addressable dimensions (minimum ${MIN_ADDRESSABLE_DIMENSIONS} required)`,
    });
    return {
      passed: true,
      score: 75,
      maxScore: 100,
      details: `Floor rule: ${addressable}/${total} addressable dims (min: ${MIN_ADDRESSABLE_DIMENSIONS}). Human review recommended.`,
      warnings: [`Floor rule triggered: only ${addressable} addressable dims for ${sdType} SD (minimum ${MIN_ADDRESSABLE_DIMENSIONS})`],
    };
  }

  // ── Floor rule: minimum average score for addressable dims ────────────────
  if (total > 0 && addressable > 0 && addressable < total && dimensionScores) {
    const patterns = SD_TYPE_ADDRESSABLE_DIMENSIONS[sdType];
    if (patterns) {
      const addressableDimScores = Object.entries(dimensionScores)
        .filter(([name]) => patterns.some(p => name.toLowerCase().includes(p.toLowerCase())))
        .map(([, score]) => score)
        .filter(s => typeof s === 'number');

      if (addressableDimScores.length > 0) {
        const avgScore = addressableDimScores.reduce((a, b) => a + b, 0) / addressableDimScores.length;
        if (avgScore < FLOOR_MINIMUM_SCORE) {
          console.log(`   ❌ Floor rule: addressable dim avg ${Math.round(avgScore)}/100 < ${FLOOR_MINIMUM_SCORE} minimum`);
          await logGateEvaluation(supabase, {
            sdId: sdKey, sdType, totalDims: total, addressableCount: addressable,
            baseThreshold, adjustedThreshold: threshold, score: visionScore,
            verdict: 'blocked_floor_score', floorRuleTriggered: true,
            context: `Addressable dim avg ${Math.round(avgScore)} below floor minimum ${FLOOR_MINIMUM_SCORE}`,
          });
          return {
            passed: false,
            score: 0,
            maxScore: 100,
            details: `Floor rule: addressable dim avg ${Math.round(avgScore)}/100 below minimum ${FLOOR_MINIMUM_SCORE}`,
            remediation: `Improve addressable dimension scores to avg >= ${FLOOR_MINIMUM_SCORE}`,
            warnings: [],
          };
        }
      }
    }
  }

  const classification = THRESHOLD_LABELS[thresholdAction] || THRESHOLD_LABELS.escalate;
  console.log(`   Vision Alignment: ${visionScore}/100  ${classification.emoji} ${classification.label}`);
  console.log(`   ${classification.desc}`);

  // ── Score below threshold → check override, then hard block ─────────────
  if (visionScore < threshold) {
    const override = await checkOverride(sdType, supabase);
    if (override.active) {
      console.log(`   ⚠️  Score ${visionScore}/100 below ${sdType} threshold ${threshold} — OVERRIDE ACTIVE`);
      console.log(`   📋 Chairman justification: ${override.justification}`);
      const dimWarnings = getDimensionWarnings(dimensionScores);
      dimWarnings.forEach(w => console.log(`   ⚠️  ${w}`));
      await logGateEvaluation(supabase, {
        sdId: sdKey, sdType, totalDims: total, addressableCount: addressable,
        baseThreshold, adjustedThreshold: threshold, score: visionScore, verdict: 'pass_override',
      });
      return {
        passed: true,
        score: 100,
        maxScore: 100,
        details: `Vision score ${visionScore}/100 below ${sdType} threshold ${threshold} — OVERRIDDEN (Chairman: ${override.justification})`,
        warnings: dimWarnings,
      };
    }

    console.log(`   ❌ Score ${visionScore}/100 BELOW ${sdType} threshold ${threshold} — handoff BLOCKED`);
    if (thresholdAdjusted) {
      console.log(`   ℹ️  (Adjusted from base ${baseThreshold} to ${threshold} for ${addressable}/${total} addressable dims)`);
    }
    console.log(`   💡 Improve vision alignment: node scripts/eva/vision-scorer.js --sd-id ${sdKey}`);
    console.log('   💡 Or request Chairman override via validation_gate_registry');
    await logGateEvaluation(supabase, {
      sdId: sdKey, sdType, totalDims: total, addressableCount: addressable,
      baseThreshold, adjustedThreshold: threshold, score: visionScore, verdict: 'blocked_below_threshold',
    });
    return {
      passed: false,
      score: 0,
      maxScore: 100,
      details: `Vision score ${visionScore}/100 does not meet ${sdType} threshold ${threshold}/100${thresholdAdjusted ? ` (adjusted from ${baseThreshold} for ${addressable}/${total} dims)` : ''}`,
      remediation: `Score must reach ${threshold}/100 for ${sdType} SDs. Run: node scripts/eva/vision-scorer.js --sd-id ${sdKey}`,
      warnings: [],
    };
  }

  // ── Score passes — check per-dimension warnings ──────────────────────────
  const dimWarnings = getDimensionWarnings(dimensionScores);
  dimWarnings.forEach(w => console.log(`   ⚠️  ${w}`));

  if (dimWarnings.length === 0) {
    console.log(`   ✅ Score ${visionScore}/100 meets ${sdType} threshold ${threshold}${thresholdAdjusted ? ` (adjusted from ${baseThreshold})` : ''}`);
  } else {
    console.log(`   ✅ Score ${visionScore}/100 meets threshold — ${dimWarnings.length} dimension(s) below ${DIMENSION_WARNING_THRESHOLD}`);
  }

  await logGateEvaluation(supabase, {
    sdId: sdKey, sdType, totalDims: total, addressableCount: addressable,
    baseThreshold, adjustedThreshold: threshold, score: visionScore, verdict: 'pass',
  });

  return {
    passed: true,
    score: 100,
    maxScore: 100,
    details: `Vision score: ${visionScore}/100 (${thresholdAction || 'unknown'}) — meets ${sdType} threshold ${threshold}${thresholdAdjusted ? ` (adjusted from ${baseThreshold} for ${addressable}/${total} dims)` : ''}`,
    warnings: dimWarnings,
  };
}

/**
 * Factory: create the Vision Score Gate for use in getRequiredGates().
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate definition
 */
export function createVisionScoreGate(supabase) {
  return {
    name: 'GATE_VISION_SCORE',
    validator: async (ctx) => validateVisionScore(ctx.sd, supabase),
    required: true,   // Hard gate — blocks when score insufficient or absent
    remediation: 'Run `node scripts/eva/vision-scorer.js --sd-id <SD-KEY>` to generate a vision alignment score, then retry the handoff.',
  };
}
