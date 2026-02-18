/**
 * Vision Score Gate for LEAD-TO-PLAN
 * SD: SD-MAN-INFRA-VISION-SCORE-GATE-001
 *
 * Soft informational gate — never blocks handoff.
 * Displays the SD's vision alignment score (if available) during LEAD-TO-PLAN validation.
 *
 * Behaviour:
 *   - score present → display score + threshold action classification
 *   - score absent  → pass silently (graceful degradation)
 *   - Always returns score: 100 (non-blocking)
 */

const THRESHOLD_LABELS = {
  accept:        { emoji: '✅', label: 'ACCEPT',       desc: 'Strong vision alignment' },
  minor_sd:      { emoji: '🟡', label: 'MINOR GAP',   desc: 'Minor alignment gaps — consider scope adjustments' },
  gap_closure_sd:{ emoji: '🟠', label: 'GAP',         desc: 'Moderate gaps — corrective SD may be needed' },
  escalate:      { emoji: '🔴', label: 'ESCALATE',    desc: 'Significant gaps — LEAD review recommended' },
};

/**
 * Validate vision alignment score for the SD (informational only).
 *
 * @param {Object} sd - Strategic Directive (must have sd_key, vision_score, vision_score_action)
 * @param {Object} supabase - Supabase client (for latest score lookup)
 * @returns {Object} Gate result — always passes
 */
export async function validateVisionScore(sd, supabase) {
  const warnings = [];

  // Prefer SD-level cached score; fall back to live query
  let visionScore = sd.vision_score ?? null;
  let thresholdAction = sd.vision_score_action ?? null;

  // If score not on SD object, check eva_vision_scores for latest record
  if (visionScore === null && supabase && sd.sd_key) {
    try {
      const { data } = await supabase
        .from('eva_vision_scores')
        .select('total_score, threshold_action, scored_at')
        .eq('sd_id', sd.sd_key)
        .order('scored_at', { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        visionScore = data[0].total_score;
        thresholdAction = data[0].threshold_action;
      }
    } catch {
      // Graceful degradation — vision score is informational
    }
  }

  if (visionScore === null) {
    console.log('   ℹ️  No vision alignment score — run `node scripts/eva/vision-scorer.js` to score this SD');
    return {
      valid: true,
      score: 100,
      details: 'Vision score not yet available — pass (soft gate)',
      warnings: [],
    };
  }

  const classification = THRESHOLD_LABELS[thresholdAction] || THRESHOLD_LABELS.escalate;

  console.log(`   Vision Alignment: ${visionScore}/100  ${classification.emoji} ${classification.label}`);
  console.log(`   ${classification.desc}`);

  if (thresholdAction === 'escalate') {
    warnings.push(`Vision alignment score ${visionScore}/100 (ESCALATE) — LEAD review recommended before EXEC`);
    console.log(`   ⚠️  Score below 50 — consider addressing vision gaps before implementation`);
  } else if (thresholdAction === 'gap_closure_sd') {
    warnings.push(`Vision alignment score ${visionScore}/100 (GAP_CLOSURE) — corrective SD may be needed`);
    console.log(`   ⚠️  Moderate vision gaps — review dimension scores for guidance`);
  } else if (thresholdAction === 'minor_sd') {
    console.log(`   ✅ Minor gaps only — proceed with awareness`);
  } else {
    console.log(`   ✅ Strong vision alignment`);
  }

  return {
    valid: true,
    score: 100,  // Always pass — soft gate
    details: `Vision score: ${visionScore}/100 (${thresholdAction || 'unknown'})`,
    warnings,
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
    validator: async (ctx) => {
      console.log('\n🔍 GATE: Vision Alignment Score');
      console.log('-'.repeat(50));
      return validateVisionScore(ctx.sd, supabase);
    },
    required: false,   // Soft gate — never blocks
    remediation: 'Run `node scripts/eva/vision-scorer.js --sd-id <SD-KEY>` to generate a vision alignment score',
  };
}
