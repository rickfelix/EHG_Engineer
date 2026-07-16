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

// Threshold policy extracted to the shared module (SD-PAT-FIX-WRITER-CONSUMER-ASYMMETRY-001):
// lib/handoff/threshold-resolver.js is the single source both LEAD-TO-PLAN (this gate)
// and PLAN-TO-LEAD (heal-before-complete) consume. Re-exported here for back-compat.
import {
  SD_TYPE_THRESHOLDS,
  DIMENSION_WARNING_THRESHOLD,
  MIN_ADDRESSABLE_DIMENSIONS,
  FLOOR_MINIMUM_SCORE,
  MIN_ADJUSTED_THRESHOLD_RATIO,
  NARROW_FEATURE_DIM_FLOOR,
  SD_TYPE_ADDRESSABLE_DIMENSIONS,
  getAddressableDimNames,
  countAddressableDimensions,
  calculateDynamicThreshold,
  dimScoreOf,
  dimNameOf,
} from '../../../../../../lib/handoff/threshold-resolver.js';
export {
  SD_TYPE_THRESHOLDS,
  DIMENSION_WARNING_THRESHOLD,
  MIN_ADDRESSABLE_DIMENSIONS,
  FLOOR_MINIMUM_SCORE,
  MIN_ADJUSTED_THRESHOLD_RATIO,
  NARROW_FEATURE_DIM_FLOOR,
  SD_TYPE_ADDRESSABLE_DIMENSIONS,
  getAddressableDimNames,
  countAddressableDimensions,
  calculateDynamicThreshold,
  dimScoreOf,
  dimNameOf,
};

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

/**
 * SD-LEO-INFRA-VISION-SCORER-L2-FLAGS-001: Build a tier hint for the gate's remediation
 * message. Resolves the SD's vision tier from (in precedence order):
 *   1. ctx.options / env override (LEO_VISION_KEY_OVERRIDE)
 *   2. sd.metadata.vision_key
 *   3. sd_key suffix `/-L([123])-/` autodetect
 * Returns { tier, source, flagSuffix, note } — `flagSuffix` is appended to the
 * remediation command when a non-default tier is resolved, so operators don't
 * accidentally re-score L2 SDs against L1 dims.
 *
 * @param {Object} sd
 * @returns {{ tier: string|null, source: string|null, flagSuffix: string, note: string|null }}
 */
export function buildTierRemediationHint(sd) {
  const envKey = process.env.LEO_VISION_KEY_OVERRIDE || null;
  const envArch = process.env.LEO_ARCH_KEY_OVERRIDE || null;
  if (envKey) {
    return {
      tier: extractTier(envKey),
      source: 'env_override',
      flagSuffix: ` --vision-key ${envKey}${envArch ? ` --arch-key ${envArch}` : ''}`,
      note: 'Tier supplied via --vision-key / LEO_VISION_KEY_OVERRIDE — keep it on the rerun.'
    };
  }
  const metaKey = sd?.metadata?.vision_key || null;
  const metaArch = sd?.metadata?.arch_key || null;
  if (metaKey) {
    return {
      tier: extractTier(metaKey),
      source: 'sd.metadata.vision_key',
      flagSuffix: '', // metadata path is auto-resolved by scorer; no flag needed
      note: `Tier auto-resolves from sd.metadata.vision_key='${metaKey}'.`
    };
  }
  const sdKey = sd?.sd_key || sd?.id || null;
  const suffixMatch = sdKey ? sdKey.match(/-L([123])-/) : null;
  if (suffixMatch) {
    const tier = `L${suffixMatch[1]}`;
    return {
      tier,
      source: 'sd_key_suffix',
      flagSuffix: ` --vision-key VISION-EHG-${tier}-001 --arch-key ARCH-EHG-${tier}-001`,
      note: `SD key suggests tier ${tier} — passing --vision-key/--arch-key on the rerun avoids the L1 default.`
    };
  }
  return { tier: null, source: null, flagSuffix: '', note: null };
}

function extractTier(visionKey) {
  if (!visionKey) return null;
  const m = visionKey.match(/-L([123])-/);
  return m ? `L${m[1]}` : null;
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
  // QF-20260713-713: rich scorer values ({ name, score, ... } keyed by A01/V01 IDs)
  // previously failed the typeof === 'number' filter, silently muting all warnings.
  return Object.entries(dimensionScores)
    .map(([key, value]) => [dimNameOf(key, value), dimScoreOf(value)])
    .filter(([, score]) => typeof score === 'number' && score < DIMENSION_WARNING_THRESHOLD)
    .map(([dim, score]) =>
      `Dimension '${dim}': ${score}/100 (below ${DIMENSION_WARNING_THRESHOLD} warning threshold)`
    );
}

/**
 * SD-LEO-FEAT-VISION-SCORER-NEVER-001: run ONE bounded, awaited vision-score for an
 * unscored SD right when the gate needs it. The conception-time score (leo-create-sd.js)
 * and the LEAD-entry async trigger are both fire-and-forget and routinely never complete,
 * so unscored SDs sat at GATE_VISION_SCORE forever waiting for a human to run the scorer.
 * This makes the scorer auto-run at the one moment the score is actually required.
 *
 * FAIL-OPEN by construction: the scorer is lazy-imported (tests inject deps.scoreSD) and
 * raced against a timeout; on ANY timeout/error (e.g. no LLM key in CI) it returns null and
 * the caller falls through to the existing hard block — removing no protection.
 *
 * @param {string} sdKey
 * @param {Object} supabase
 * @param {Object} [deps] - { scoreSD, timeoutMs } injectable seams for testing
 * @returns {Promise<Object|null>} the score record ({total_score, threshold_action, dimension_scores}) or null
 */
export async function autoScoreUnscoredSD(sdKey, supabase, deps = {}) {
  if (!sdKey || !supabase) return null;
  const timeoutMs = Number.isFinite(deps.timeoutMs)
    ? deps.timeoutMs
    : Number(process.env.VISION_SCORE_GATE_TIMEOUT_MS) || 120000;
  const scorer = typeof deps.scoreSD === 'function'
    ? deps.scoreSD
    : async (o) => (await import('../../../../../eva/vision-scorer.js')).scoreSD(o);
  let timer;
  try {
    console.log(`   ⏳ No score yet — auto-running vision-scorer for ${sdKey} (bounded ${Math.round(timeoutMs / 1000)}s)…`);
    // Attach a no-op .catch to the scorer promise so that if it REJECTS after we've already lost the
    // timeout race (the LLM error arrives past the bound), it never surfaces as an unhandledRejection
    // (which can crash a process run with --unhandled-rejections=strict). NOTE: the timeout bounds our
    // WAIT, not the underlying LLM WORK — threading an AbortSignal into scoreSD is a follow-up.
    const scoring = scorer({ sdKey, supabase, quiet: true });
    if (scoring && typeof scoring.then === 'function') scoring.catch(() => {});
    const result = await Promise.race([
      scoring,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('vision auto-score timeout')), timeoutMs); }),
    ]);
    if (result && typeof result.total_score === 'number') {
      console.log(`   ✅ Auto-score complete for ${sdKey}: ${Math.round(result.total_score)}/100`);
      return result;
    }
    return null;
  } catch (e) {
    console.log(`   ⚠️  Auto-score for ${sdKey} did not complete (${e?.message || e}) — falling through to hard block.`);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Validate vision alignment score for the SD (hard enforcement).
 *
 * @param {Object} sd - Strategic Directive (must have sd_key, sd_type)
 * @param {Object} supabase - Supabase client
 * @param {Object} [deps] - injectable seams (deps.scoreSD, deps.timeoutMs) for the auto-score
 * @returns {Promise<Object>} Gate result — may block (valid: false)
 */
export async function validateVisionScore(sd, supabase, deps = {}) {
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

  // Fetch latest score from eva_vision_scores if EITHER piece is missing.
  // QF-20260713-713 (non-determinism): scoreSD() syncs only the SCALAR
  // sd.vision_score back to strategic_directives_v2 (there is no dimension_scores
  // column on the SD), so gating this fetch on the scalar alone starved every
  // post-first-run evaluation of dimension context — countAddressableDimensions
  // saw {0,0}, dynamic-threshold/floor-rule narrowing vanished, and a first-run
  // floor-rule PASS flipped to a hard BLOCK on the very next run of the same SD.
  if ((visionScore === null || dimensionScores === null) && supabase && sdKey) {
    try {
      const { data } = await supabase
        .from('eva_vision_scores')
        .select('total_score, threshold_action, dimension_scores, scored_at')
        .eq('sd_id', sdKey)
        .order('scored_at', { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        visionScore = visionScore ?? data[0].total_score;
        thresholdAction = thresholdAction ?? data[0].threshold_action;
        dimensionScores = dimensionScores ?? data[0].dimension_scores ?? null;
      }
    } catch (e) {
      // Intentionally suppressed: DB unavailable — proceed to hard block
      console.debug('[VisionScore] DB score lookup suppressed:', e?.message || e);
    }
  }

  // ── SD-LEO-FEAT-VISION-SCORER-NEVER-001: auto-run the scorer for an unscored SD ──
  // If the SD is STILL unscored (the fire-and-forget conception/LEAD-entry scores never
  // completed), run ONE bounded, awaited score now so the SD never sits at this gate
  // indefinitely. Fail-open: on timeout/error this returns null and we fall through to the
  // existing hard block below — no protection is removed.
  if (visionScore === null && supabase && sdKey) {
    const auto = await autoScoreUnscoredSD(sdKey, supabase, deps);
    if (auto && typeof auto.total_score === 'number') {
      visionScore = auto.total_score;
      thresholdAction = auto.threshold_action ?? thresholdAction;
      dimensionScores = auto.dimension_scores ?? dimensionScores;
    }
  }

  // ── Dynamic threshold adjustment ────────────────────────────────────────
  // QF-20260505-102: pass sd.metadata so per-SD vision_addressable_dimensions override applies.
  const { addressable, total } = countAddressableDimensions(sdType, dimensionScores, sd.metadata);
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
    // SD-LEO-INFRA-VISION-SCORER-L2-FLAGS-001: include tier hint in remediation
    // so operators don't default-score L2/L3 SDs against L1 dims.
    const tierHint = buildTierRemediationHint(sd);
    const cmd = `node scripts/eva/vision-scorer.js --sd-id ${sdKey || '<SD-KEY>'}${tierHint.flagSuffix}`;
    console.log('   ❌ No vision alignment score found — handoff BLOCKED');
    console.log(`   💡 Run: ${cmd}`);
    if (tierHint.note) console.log(`      ${tierHint.note}`);
    await logGateEvaluation(supabase, {
      sdId: sdKey, sdType, totalDims: total, addressableCount: addressable,
      baseThreshold, adjustedThreshold: threshold, score: null, verdict: 'blocked_no_score',
      context: tierHint.tier ? `tier_resolved=${tierHint.tier} via ${tierHint.source}` : null,
    });
    return {
      passed: false,
      score: 0,
      maxScore: 100,
      details: `No vision alignment score found for ${sdKey}. Run vision-scorer.js before LEAD-TO-PLAN.${tierHint.tier ? ` Resolved tier: ${tierHint.tier} (${tierHint.source}).` : ''}`,
      remediation: cmd,
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
  // SD-FDBK-INFRA-GATE-VISION-SCORE-001: applies to the type-pattern path AND the
  // null-type auto-detect carve-out path (so a focused feature must score WELL on the
  // dims it addresses, not merely narrow the set). The manual-override path is
  // intentionally excluded to preserve its prior behavior (backward-compat).
  if (total > 0 && addressable > 0 && addressable < total && dimensionScores) {
    const hasManualOverride = Array.isArray(sd.metadata?.vision_addressable_dimensions)
      && sd.metadata.vision_addressable_dimensions.length > 0;
    const typePatterns = SD_TYPE_ADDRESSABLE_DIMENSIONS[sdType];
    let addressableDimScores = null;
    if (typePatterns) {
      // Type-pattern path. QF-20260713-713: match on the dimension NAME (rich
      // values are keyed by opaque A01/V01 IDs) and extract .score from rich values.
      addressableDimScores = Object.entries(dimensionScores)
        .filter(([key, value]) => {
          const name = dimNameOf(key, value).toLowerCase();
          return typePatterns.some(p => name.includes(p.toLowerCase()));
        })
        .map(([, value]) => dimScoreOf(value))
        .filter(s => typeof s === 'number');
    } else if (!hasManualOverride) {
      // null-type auto-detect carve-out path: score the auto-detected addressable dims.
      addressableDimScores = getAddressableDimNames(sdType, dimensionScores, sd.metadata)
        .map(key => dimScoreOf(dimensionScores[key]))
        .filter(s => typeof s === 'number');
    }

    if (addressableDimScores && addressableDimScores.length > 0) {
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

    // SD-LEO-INFRA-VISION-SCORER-L2-FLAGS-001: include tier hint on rerun command.
    const belowTierHint = buildTierRemediationHint(sd);
    const rerunCmd = `node scripts/eva/vision-scorer.js --sd-id ${sdKey}${belowTierHint.flagSuffix}`;
    console.log(`   ❌ Score ${visionScore}/100 BELOW ${sdType} threshold ${threshold} — handoff BLOCKED`);
    if (thresholdAdjusted) {
      console.log(`   ℹ️  (Adjusted from base ${baseThreshold} to ${threshold} for ${addressable}/${total} addressable dims)`);
    }
    console.log(`   💡 Improve vision alignment: ${rerunCmd}`);
    if (belowTierHint.note) console.log(`      ${belowTierHint.note}`);
    console.log('   💡 Or request Chairman override via validation_gate_registry');
    await logGateEvaluation(supabase, {
      sdId: sdKey, sdType, totalDims: total, addressableCount: addressable,
      baseThreshold, adjustedThreshold: threshold, score: visionScore, verdict: 'blocked_below_threshold',
      context: belowTierHint.tier ? `tier_resolved=${belowTierHint.tier} via ${belowTierHint.source}` : null,
    });
    return {
      passed: false,
      score: 0,
      maxScore: 100,
      details: `Vision score ${visionScore}/100 does not meet ${sdType} threshold ${threshold}/100${thresholdAdjusted ? ` (adjusted from ${baseThreshold} for ${addressable}/${total} dims)` : ''}${belowTierHint.tier ? `. Resolved tier: ${belowTierHint.tier} (${belowTierHint.source}).` : ''}`,
      remediation: `Score must reach ${threshold}/100 for ${sdType} SDs. Run: ${rerunCmd}`,
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
