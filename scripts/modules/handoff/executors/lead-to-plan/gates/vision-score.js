/**
 * Vision Score Gate for LEAD-TO-PLAN
 * SD: SD-MAN-INFRA-VISION-SCORE-GATE-HARDEN-001
 *
 * Hard SD-type-aware enforcement gate — blocks handoff when vision score is
 * below the type-specific threshold or when no score exists.
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
 * @param {string} sdKey
 * @param {Object} supabase
 * @returns {Promise<{active: boolean, justification?: string}>}
 */
async function checkOverride(sdKey, supabase) {
  if (!supabase || !sdKey) return { active: false };
  try {
    const { data } = await supabase
      .from('validation_gate_registry')
      .select('justification')
      .eq('gate_name', 'GATE_VISION_SCORE')
      .eq('applicability', 'OPTIONAL_OVERRIDE')
      .eq('sd_id', sdKey)
      .limit(1);

    if (data && data.length > 0) {
      const justification = (data[0].justification || '').trim();
      if (justification.length > 0) {
        return { active: true, justification };
      }
    }
    return { active: false };
  } catch {
    // Table or columns absent — fail-closed (enforce the gate)
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
  const threshold = SD_TYPE_THRESHOLDS[sdType] ?? SD_TYPE_THRESHOLDS._default;

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
    } catch {
      // DB unavailable — proceed to hard block (no score = no pass)
    }
  }

  console.log('\n🔍 GATE: Vision Alignment Score (Hard Enforcement)');
  console.log(`   SD Type: ${sdType} | Required: ${threshold}/100`);
  console.log('-'.repeat(50));

  // ── No score present → hard block ───────────────────────────────────────
  if (visionScore === null) {
    console.log('   ❌ No vision alignment score found — handoff BLOCKED');
    console.log(`   💡 Run: node scripts/eva/vision-scorer.js --sd-id ${sdKey || '<SD-KEY>'}`);
    return {
      valid: false,
      score: 0,
      details: `No vision alignment score found for ${sdKey}. Run vision-scorer.js before LEAD-TO-PLAN.`,
      remediation: `node scripts/eva/vision-scorer.js --sd-id ${sdKey || '<SD-KEY>'}`,
      warnings: [],
    };
  }

  const classification = THRESHOLD_LABELS[thresholdAction] || THRESHOLD_LABELS.escalate;
  console.log(`   Vision Alignment: ${visionScore}/100  ${classification.emoji} ${classification.label}`);
  console.log(`   ${classification.desc}`);

  // ── Score below threshold → check override, then hard block ─────────────
  if (visionScore < threshold) {
    const override = await checkOverride(sdKey, supabase);
    if (override.active) {
      console.log(`   ⚠️  Score ${visionScore}/100 below ${sdType} threshold ${threshold} — OVERRIDE ACTIVE`);
      console.log(`   📋 Chairman justification: ${override.justification}`);
      const dimWarnings = getDimensionWarnings(dimensionScores);
      dimWarnings.forEach(w => console.log(`   ⚠️  ${w}`));
      return {
        valid: true,
        score: 100,
        details: `Vision score ${visionScore}/100 below ${sdType} threshold ${threshold} — OVERRIDDEN (Chairman: ${override.justification})`,
        warnings: dimWarnings,
      };
    }

    console.log(`   ❌ Score ${visionScore}/100 BELOW ${sdType} threshold ${threshold} — handoff BLOCKED`);
    console.log(`   💡 Improve vision alignment: node scripts/eva/vision-scorer.js --sd-id ${sdKey}`);
    console.log('   💡 Or request Chairman override via validation_gate_registry');
    return {
      valid: false,
      score: 0,
      details: `Vision score ${visionScore}/100 does not meet ${sdType} threshold ${threshold}/100`,
      remediation: `Score must reach ${threshold}/100 for ${sdType} SDs. Run: node scripts/eva/vision-scorer.js --sd-id ${sdKey}`,
      warnings: [],
    };
  }

  // ── Score passes — check per-dimension warnings ──────────────────────────
  const dimWarnings = getDimensionWarnings(dimensionScores);
  dimWarnings.forEach(w => console.log(`   ⚠️  ${w}`));

  if (dimWarnings.length === 0) {
    console.log(`   ✅ Score ${visionScore}/100 meets ${sdType} threshold ${threshold}`);
  } else {
    console.log(`   ✅ Score ${visionScore}/100 meets threshold — ${dimWarnings.length} dimension(s) below ${DIMENSION_WARNING_THRESHOLD}`);
  }

  return {
    valid: true,
    score: 100,
    details: `Vision score: ${visionScore}/100 (${thresholdAction || 'unknown'}) — meets ${sdType} threshold ${threshold}`,
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
