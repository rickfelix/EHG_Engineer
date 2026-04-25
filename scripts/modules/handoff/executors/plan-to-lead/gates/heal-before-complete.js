/**
 * Heal-Before-Complete Gate for PLAN-TO-LEAD
 * SD-MAN-GEN-CORRECTIVE-VISION-GAP-007-03 (FR-004)
 * SD-LEO-INFRA-ALIGN-HEAL-GATE-001 (FR-1, FR-2)
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-047 (SD-type-aware thresholds)
 * SD-LEARN-FIX-ADDRESS-PAT-AUTO-053 (auto-re-heal on below-threshold)
 * SD-LEARN-FIX-ADDRESS-PAT-AUTO-054 (fix auto-heal scoring mode, proportional reporting, tolerance buffer)
 * SD-LEO-INFRA-TYPE-AWARE-GATE-001: Intelligent fast auto-heal with Haiku + structural scoring
 *
 * Checks that the SD has a recent heal score meeting the threshold
 * before allowing final approval. Prevents premature SD completion
 * by catching gaps while context is fresh.
 *
 * Auto-heal strategy (3-tier fallback):
 *   1. Fast heal: Structural checks (DB state) + Claude Haiku semantic spot-check (~10-15s)
 *   2. Full heal: Full vision-dimension scoring via scoreSD() (~60-180s)
 *   3. Structural-only: Deterministic DB/file checks as last resort (~2s)
 *
 * - SD heal: BLOCKING — score must be >= (threshold - tolerance)
 *   - Threshold resolved in priority order:
 *     1. leo_config 'heal_gate_threshold' (global override)
 *     2. SD-type-aware tier (feature/security=90, infrastructure/docs=80)
 *     3. DEFAULT_HEAL_THRESHOLD (85) as final fallback
 *   - Tolerance buffer: leo_config 'heal_gate_tolerance_buffer' (default 3)
 *   - Corrective SDs: always use GRADE.A (93) via grade-scale.js
 * - Vision heal: ADVISORY — logged but does not block
 */

import { execSync } from 'child_process';
import { GATE_REASON_CODES, MAX_HEAL_ITERATIONS } from './gate-reason-codes.js';

const DEFAULT_HEAL_THRESHOLD = 85;
const DEFAULT_TOLERANCE_BUFFER = 3;
const AUTO_HEAL_TIMEOUT_MS = 120_000; // 120 seconds (increased from 60s — LLM calls need headroom)
const FAST_HEAL_TIMEOUT_MS = 30_000; // 30 seconds for fast Haiku path

/**
 * SD-LEO-INFRA-TYPE-AWARE-GATE-001: Lightweight SD types that can use fast heal.
 * Feature/security SDs still prefer the full vision-dimension scorer for thoroughness.
 */
const FAST_HEAL_SD_TYPES = ['infrastructure', 'documentation', 'fix', 'refactor', 'enhancement'];

/**
 * SD-LEO-INFRA-TYPE-AWARE-GATE-001: Fast auto-heal using structural checks + Claude Haiku.
 *
 * Produces a reliable score in ~10-15s instead of 60-180s by:
 * 1. Structural verification (30% weight): DB state checks — stories completed, PRD exists, retrospective exists
 * 2. Semantic spot-check (70% weight): Claude Haiku evaluates key_changes + success_criteria against git diff
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdKey - SD key (e.g., SD-LEO-INFRA-TYPE-AWARE-GATE-001)
 * @param {string} sdUuid - SD UUID
 * @param {string} sdType - SD type
 * @returns {Promise<{score: number, mode: string, details: Object}|null>} Score or null if fast heal unavailable
 */
async function fastAutoHeal(supabase, sdKey, sdUuid, sdType) {
  const startTime = Date.now();
  const details = { structural: {}, semantic: {} };

  // ── Phase 1: Structural verification (deterministic, <2s) ──
  let structuralScore = 0;
  let structuralChecks = 0;
  let structuralPassed = 0;

  // Check 1: User stories completed
  // SD-LEARN-FIX-ADDRESS-PAT-AUTO-073: Use handoff acceptance as a completion
  // signal when stories exist but aren't marked complete. Many SDs ship code
  // without updating user_stories.status, causing systematic false negatives.
  let acceptedHandoffCount = 0; // populated in Check 4, used for story credit
  try {
    // Pre-fetch accepted handoff count for cross-check use in story scoring
    const { data: preHandoffs } = await supabase
      .from('sd_phase_handoffs')
      .select('id')
      .eq('sd_id', sdUuid)
      .eq('status', 'accepted');
    acceptedHandoffCount = preHandoffs?.length || 0;
  } catch (e) { console.debug('[HealBeforeComplete] pre-handoff count suppressed:', e?.message || e); }

  try {
    const { data: stories } = await supabase
      .from('user_stories')
      .select('id, status')
      .eq('sd_id', sdUuid);
    structuralChecks++;
    if (stories && stories.length > 0) {
      const completed = stories.filter(s => ['completed', 'done', 'validated'].includes(s.status));
      if (completed.length === stories.length) {
        structuralPassed++;
        details.structural.stories = `${completed.length}/${stories.length} completed`;
      } else if (acceptedHandoffCount >= 2) {
        // Stories incomplete but handoffs accepted — work was reviewed and approved
        structuralPassed += 0.75;
        details.structural.stories = `${completed.length}/${stories.length} completed (handoff-verified: ${acceptedHandoffCount} accepted)`;
      } else {
        details.structural.stories = `${completed.length}/${stories.length} completed (incomplete)`;
      }
    } else {
      // No stories may be valid for some SD types
      structuralPassed += 0.5;
      details.structural.stories = 'No stories found (may be expected)';
    }
  } catch (e) { details.structural.stories = 'Query failed'; console.debug('[HealBeforeComplete] stories query suppressed:', e?.message || e); }

  // Check 2: PRD exists
  try {
    const { data: prd } = await supabase
      .from('product_requirements_v2')
      .select('id, status')
      .eq('sd_id', sdUuid)
      .limit(1)
      .single();
    structuralChecks++;
    if (prd) {
      structuralPassed++;
      details.structural.prd = `exists (status: ${prd.status})`;
    } else {
      details.structural.prd = 'missing';
    }
  } catch (e) { details.structural.prd = 'not found (may be expected for SD type)'; structuralChecks++; structuralPassed += 0.5; console.debug('[HealBeforeComplete] PRD query suppressed:', e?.message || e); }

  // Check 3: Retrospective exists with PUBLISHED status
  try {
    const { data: retro } = await supabase
      .from('retrospectives')
      .select('id, status, quality_score')
      .eq('sd_id', sdUuid)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    structuralChecks++;
    if (retro && retro.status === 'PUBLISHED') {
      structuralPassed++;
      details.structural.retrospective = `PUBLISHED (quality: ${retro.quality_score || 'n/a'})`;
    } else if (retro) {
      structuralPassed += 0.5;
      details.structural.retrospective = `exists but status: ${retro.status}`;
    } else {
      details.structural.retrospective = 'missing';
    }
  } catch (e) { details.structural.retrospective = 'query failed'; structuralChecks++; console.debug('[HealBeforeComplete] retrospective query suppressed:', e?.message || e); }

  // Check 4: Handoff chain has required handoffs
  // SD-LEARN-FIX-ADDRESS-PAT-AUTO-073: Award partial credit for 1 accepted handoff
  try {
    const { data: handoffs } = await supabase
      .from('sd_phase_handoffs')
      .select('handoff_type, status')
      .eq('sd_id', sdUuid)
      .eq('status', 'accepted');
    structuralChecks++;
    const handoffCount = handoffs?.length || 0;
    if (handoffCount >= 2) { // Minimum for infrastructure
      structuralPassed++;
      details.structural.handoffs = `${handoffCount} accepted`;
    } else if (handoffCount === 1) {
      structuralPassed += 0.5;
      details.structural.handoffs = `1 accepted (partial credit, need ≥2)`;
    } else {
      details.structural.handoffs = `only ${handoffCount} accepted (need ≥2)`;
    }
  } catch (e) { details.structural.handoffs = 'query failed'; structuralChecks++; console.debug('[HealBeforeComplete] handoffs query suppressed:', e?.message || e); }

  structuralScore = structuralChecks > 0
    ? Math.round((structuralPassed / structuralChecks) * 100)
    : 50;

  console.log(`   📊 Structural score: ${structuralScore}/100 (${structuralPassed}/${structuralChecks} checks passed)`);

  // ── Phase 2: Semantic spot-check via Claude Haiku (~5-10s) ──
  let semanticScore = null;
  try {
    // Load SD context
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('title, key_changes, success_criteria, success_metrics')
      .eq('sd_key', sdKey)
      .single();

    if (!sd) throw new Error('SD not found');

    // Get recent git diff for this SD's branch (if available)
    let gitDiff = '';
    try {
      gitDiff = execSync(
        `git log --oneline -5 --all --grep="${sdKey}" --format="%h %s"`,
        { encoding: 'utf8', timeout: 5000 }
      ).trim();
      if (!gitDiff) {
        // Fallback: check recent commits
        gitDiff = execSync(
          'git log --oneline -5 HEAD --format="%h %s"',
          { encoding: 'utf8', timeout: 5000 }
        ).trim();
      }
    } catch (e) { gitDiff = '(git history unavailable)'; console.debug('[HealBeforeComplete] git history suppressed:', e?.message || e); }

    const keyChanges = (sd.key_changes || [])
      .map(kc => typeof kc === 'string' ? kc : kc.description || kc.title || JSON.stringify(kc))
      .join('\n- ');
    const successCriteria = (sd.success_criteria || [])
      .map(sc => typeof sc === 'string' ? sc : sc.description || sc.title || JSON.stringify(sc))
      .join('\n- ');

    // SD-LEARN-FIX-ADDRESS-PAT-AUTO-073: Instruct Haiku to focus on key_changes
    // delivery rather than story completion status, which is already factored into
    // the structural score. This prevents double-penalization.
    const prompt = `You are evaluating whether a Strategic Directive's promises were delivered.

SD: "${sd.title}" (type: ${sdType})

KEY CHANGES PROMISED:
- ${keyChanges || '(none specified)'}

SUCCESS CRITERIA:
- ${successCriteria || '(none specified)'}

RECENT GIT ACTIVITY:
${gitDiff}

STRUCTURAL VERIFICATION RESULTS:
${Object.entries(details.structural).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

IMPORTANT: Focus your evaluation on whether the KEY CHANGES and SUCCESS CRITERIA were delivered based on git activity and structural evidence. Do NOT penalize for user story completion status — story tracking often lags behind actual implementation, and the structural score already accounts for this. Instead, focus on whether handoffs were accepted (indicating reviewed work) and whether git commits evidence the promised changes.

Based on the delivery evidence, score how well this SD's promises appear to be delivered.
Respond with ONLY a JSON object: {"score": <0-100>, "reasoning": "<one sentence>"}`;

    // Use client factory — fast tier, respects local LLM routing
    const { getFastClient } = await import('../../../../../../lib/llm/client-factory.js');
    const haiku = getFastClient();

    const semanticPromise = haiku.complete(
      'You are a concise SD delivery verification assistant. Respond with ONLY valid JSON.',
      prompt,
      { maxTokens: 200, timeout: 20000 }
    );
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Haiku timeout')), FAST_HEAL_TIMEOUT_MS)
    );

    const response = await Promise.race([semanticPromise, timeoutPromise]);
    const jsonMatch = response.content.match(/\{[\s\S]*"score"\s*:\s*(\d+)[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      semanticScore = Math.max(0, Math.min(100, parsed.score));
      details.semantic = { score: semanticScore, reasoning: parsed.reasoning || '', model: haiku.model || 'fast-tier' };
      console.log(`   🧠 Semantic score: ${semanticScore}/100 (Haiku: "${parsed.reasoning || 'no reasoning'}")`);
    } else {
      console.log('   ⚠️  Haiku response could not be parsed — using structural score only');
    }
  } catch (err) {
    console.log(`   ⚠️  Semantic scoring failed: ${err.message} — using structural score only`);
  }

  // ── Phase 3: Composite score ──
  let compositeScore;
  let mode;
  if (semanticScore !== null) {
    compositeScore = Math.round(structuralScore * 0.3 + semanticScore * 0.7);
    mode = 'fast-heal-composite';
  } else {
    compositeScore = structuralScore;
    mode = 'fast-heal-structural-only';
  }

  const elapsedMs = Date.now() - startTime;
  console.log(`   ✅ Fast heal complete: ${compositeScore}/100 (${mode}, ${elapsedMs}ms)`);

  return {
    score: compositeScore,
    mode,
    details: { structural: details.structural, semantic: details.semantic, elapsed_ms: elapsedMs }
  };
}

/**
 * SD-type-aware heal threshold tiers.
 * Feature and security SDs require higher fidelity; infrastructure
 * and documentation SDs use a lower bar since auto-heal scoring
 * produces scores in the 80-90 range for non-code-heavy SDs.
 */
const SD_TYPE_THRESHOLDS = {
  feature: 90,
  security: 90,
  enhancement: 85,
  fix: 85,
  refactor: 85,
  infrastructure: 80,
  documentation: 80,
  // `bugfix` is the canonical db-stored value (sd-key-generator maps fix → bugfix).
  // Threshold lower than feature/security because bugfix SDs address a narrow slice
  // of dimensions and are mathematically unable to hit higher thresholds against the
  // full vision rubric. A follow-up SD should port type-aware dimension filtering
  // from GATE_VISION_SCORE's SD_TYPE_ADDRESSABLE_DIMENSIONS into this gate.
  bugfix: 60,
};

/**
 * Load the heal gate threshold with SD-type awareness.
 *
 * Resolution order:
 *   1. leo_config 'heal_gate_threshold' (explicit global override)
 *   2. SD-type-aware tier from SD_TYPE_THRESHOLDS
 *   3. DEFAULT_HEAL_THRESHOLD (85)
 *
 * @param {Object} supabase
 * @param {string} [sdType] - The SD type (feature, infrastructure, etc.)
 * @returns {Promise<{threshold: number, source: string}>}
 */
async function loadHealThreshold(supabase, sdType) {
  // 1. Check leo_config for explicit global override
  try {
    const { data } = await supabase
      .from('leo_config')
      .select('value')
      .eq('key', 'heal_gate_threshold')
      .single();

    if (data?.value != null) {
      const parsed = parseInt(data.value, 10);
      if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
        return { threshold: parsed, source: 'leo_config' };
      }
    }
  } catch (e) {
    // Intentionally suppressed: Fall through to SD-type tier
    console.debug('[HealBeforeComplete] leo_config threshold lookup suppressed:', e?.message || e);
  }

  // 2. SD-type-aware tier
  if (sdType && SD_TYPE_THRESHOLDS[sdType] != null) {
    return { threshold: SD_TYPE_THRESHOLDS[sdType], source: `sd_type:${sdType}` };
  }

  // 3. Default fallback
  return { threshold: DEFAULT_HEAL_THRESHOLD, source: 'default' };
}

/**
 * Load the tolerance buffer from leo_config.
 * Scores within (threshold - buffer) are accepted with a warning.
 *
 * @param {Object} supabase
 * @returns {Promise<number>}
 */
async function loadToleranceBuffer(supabase) {
  try {
    const { data } = await supabase
      .from('leo_config')
      .select('value')
      .eq('key', 'heal_gate_tolerance_buffer')
      .single();

    if (data?.value != null) {
      const parsed = parseInt(data.value, 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 10) {
        return parsed;
      }
    }
  } catch (e) {
    // Intentionally suppressed: Fall through to default tolerance buffer
    console.debug('[HealBeforeComplete] tolerance buffer lookup suppressed:', e?.message || e);
  }
  return DEFAULT_TOLERANCE_BUFFER;
}

/**
 * Create the HEAL_BEFORE_COMPLETE gate validator.
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createHealBeforeCompleteGate(supabase) {
  return {
    name: 'HEAL_BEFORE_COMPLETE',
    validator: async (ctx) => {
      console.log('\n🩺 HEAL GATE: SD Heal Score Verification');
      console.log('-'.repeat(50));

      const sdKey = ctx.sd?.sd_key || ctx.sdId;
      const sdUuid = ctx.sd?.id || ctx.sdId;

      // Parent orchestrators skip heal gate — children are individually healed
      const { data: childSDs } = await supabase
        .from('strategic_directives_v2')
        .select('id')
        .eq('parent_sd_id', sdUuid);

      if (childSDs && childSDs.length > 0) {
        console.log(`   ℹ️  Orchestrator SD with ${childSDs.length} children — skipping heal gate`);
        console.log('   ✅ Children are individually healed during their own PLAN-TO-LEAD');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: ['Orchestrator SD — heal gate deferred to children'],
          details: { is_orchestrator: true, child_count: childSDs.length }
        };
      }

      // Child SD detection: child SDs have limited scope and cannot satisfy
      // vision-wide dimensions (governance, DFE, OKR alignment) that belong to
      // the parent orchestrator. Apply increased tolerance for scoped children.
      let isChildSD = false;
      const CHILD_SD_TOLERANCE_BONUS = 5;
      try {
        const { data: parentCheck } = await supabase
          .from('strategic_directives_v2')
          .select('parent_sd_id')
          .eq('id', sdUuid)
          .single();
        isChildSD = !!parentCheck?.parent_sd_id;
      } catch (e) {
        // Intentionally suppressed: Fail-open, treat as standalone if check fails
        console.debug('[HealBeforeComplete] parent SD check suppressed:', e?.message || e);
      }

      // Resolve SD type for threshold tiering
      const sdType = ctx.sd?.sd_type || null;
      const { threshold: resolvedThreshold, source: thresholdSource } = await loadHealThreshold(supabase, sdType);
      let threshold = resolvedThreshold;
      let toleranceBuffer = await loadToleranceBuffer(supabase);
      if (isChildSD) {
        toleranceBuffer += CHILD_SD_TOLERANCE_BONUS;
        console.log(`   👶 Child SD detected — tolerance increased by ${CHILD_SD_TOLERANCE_BONUS} (vision-wide dimensions out of scope)`);
      }
      console.log(`   📏 Threshold: ${threshold} (source: ${thresholdSource}, tolerance: ${toleranceBuffer}${isChildSD ? ' [child bonus]' : ''})`);

      // Corrective SD detection: if metadata.vision_origin_score_id exists,
      // this SD was generated by corrective-sd-generator and requires GRADE.A (93)
      let isCorrective = false;
      // SD-LEARN-FIX-ADDRESS-PAT-AUTO-061: /learn-sourced SDs have thin auto-generated
      // key_changes that produce lower semantic scores. Apply tolerance bonus.
      let isLearnSource = false;
      const LEARN_SOURCE_TOLERANCE_BONUS = 5;
      try {
        const { data: sdRecord } = await supabase
          .from('strategic_directives_v2')
          .select('metadata')
          .eq('id', sdUuid)
          .single();

        if (sdRecord?.metadata?.vision_origin_score_id) {
          isCorrective = true;
          const { GRADE } = await import('../../../../../../lib/standards/grade-scale.js');
          threshold = GRADE.A;
          console.log(`   🔧 Corrective SD detected (vision_origin_score_id: ${sdRecord.metadata.vision_origin_score_id})`);
          console.log(`   📏 Overriding to GRADE.A (${GRADE.A}) for corrective SD`);
        }

        if (sdRecord?.metadata?.source === 'learn_command') {
          isLearnSource = true;
          toleranceBuffer += LEARN_SOURCE_TOLERANCE_BONUS;
          console.log(`   📚 /learn-sourced SD detected — tolerance increased by ${LEARN_SOURCE_TOLERANCE_BONUS} (auto-generated metadata is inherently thinner)`);
        }
      } catch (err) {
        // Fail-open: if metadata check fails, use standard threshold (backward compatible)
        console.log(`   ⚠️  Could not check corrective SD status: ${err.message}`);
        console.log(`   📏 Using resolved threshold (${threshold})`);
      }

      // Query SD heal scores - prefer sd-heal mode over vision-scorer auto-created
      // Strategy: try sd-heal mode first, fall back to most recent of any mode
      let healError = null;
      let healScores = null;

      // First try: get the most recent sd-heal mode score
      const { data: sdHealScores } = await supabase
        .from('eva_vision_scores')
        .select('id, sd_id, total_score, threshold_action, rubric_snapshot, scored_at')
        .eq('sd_id', sdKey)
        .containedBy('rubric_snapshot', { mode: 'sd-heal' })
        .order('scored_at', { ascending: false })
        .limit(1);

      // containedBy may not work for jsonb — fall back to fetching all and filtering
      if (sdHealScores && sdHealScores.length > 0) {
        healScores = sdHealScores;
      } else {
        // Fetch recent scores and filter client-side
        const { data: allScores, error: allErr } = await supabase
          .from('eva_vision_scores')
          .select('id, sd_id, total_score, threshold_action, rubric_snapshot, scored_at')
          .eq('sd_id', sdKey)
          .order('scored_at', { ascending: false })
          .limit(20);

        healError = allErr;
        if (allScores && allScores.length > 0) {
          const sdHealMode = allScores.filter(s => s.rubric_snapshot?.mode === 'sd-heal');
          healScores = sdHealMode.length > 0 ? [sdHealMode[0]] : [allScores[0]];
        } else {
          healScores = allScores;
        }
      }

      if (healError) {
        console.log(`   ⚠️  Database error querying heal scores: ${healError.message}`);
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [`Database error: ${healError.message}`],
          warnings: [],
          remediation: 'Check database connectivity and retry'
        };
      }

      // No heal score found — auto-trigger heal scoring (SD-LEARN-FIX-ADDRESS-PAT-AUTO-046)
      // SD-LEO-INFRA-TYPE-AWARE-GATE-001: 3-tier auto-heal strategy
      if (!healScores || healScores.length === 0) {
        console.log(`   ⚠️  No heal score found for ${sdKey} — auto-triggering heal...`);

        let autoHealScore = null;

        // ── Tier 1: Fast heal (structural + Haiku) — ~10-15s ──
        const useFastHeal = FAST_HEAL_SD_TYPES.includes(sdType);
        if (useFastHeal) {
          console.log(`   🚀 Fast heal path (SD type: ${sdType})`);
          try {
            const fastResult = await fastAutoHeal(supabase, sdKey, sdUuid, sdType);
            if (fastResult) {
              // Persist the fast heal score to eva_vision_scores
              // Requires: vision_id (NOT NULL), dimension_scores (NOT NULL), iteration (NOT NULL)
              // threshold_action CHECK: must be 'accept', 'minor_sd', 'gap_closure_sd', or 'escalate'

              // Find a vision_id to reference (parent orchestrator or any recent)
              let visionId = null;
              const { data: visionDocs } = await supabase
                .from('eva_vision_documents')
                .select('id')
                .order('created_at', { ascending: false })
                .limit(1);
              if (visionDocs && visionDocs.length > 0) {
                visionId = visionDocs[0].id;
              }

              // Count existing iterations for this SD
              const { count: iterCount } = await supabase
                .from('eva_vision_scores')
                .select('id', { count: 'exact', head: true })
                .eq('sd_id', sdKey);

              const dimensionScores = fastResult.details || {
                structural: { score: fastResult.structuralScore || 100 },
                semantic: { score: fastResult.semanticScore || 70 }
              };

              const insertPayload = {
                sd_id: sdKey,
                total_score: fastResult.score,
                threshold_action: fastResult.score >= threshold ? 'accept' : 'minor_sd',
                iteration: (iterCount || 0) + 1,
                dimension_scores: dimensionScores,
                rubric_snapshot: {
                  mode: 'sd-heal',
                  source: 'fast-auto-heal',
                  scoring_mode: fastResult.mode,
                  details: fastResult.details
                }
              };
              if (visionId) insertPayload.vision_id = visionId;

              const { data: inserted, error: insertErr } = await supabase
                .from('eva_vision_scores')
                .insert(insertPayload)
                .select('id, sd_id, total_score, threshold_action, rubric_snapshot, scored_at');

              if (insertErr) {
                console.log(`   ⚠️  Fast heal score insert failed: ${insertErr.message}`);
              }

              if (inserted && inserted.length > 0) {
                autoHealScore = inserted[0];
                console.log(`   ✅ Fast heal score persisted: ${autoHealScore.total_score}/100 (id: ${autoHealScore.id})`);
              }
            }
          } catch (err) {
            console.log(`   ⚠️  Fast heal failed: ${err.message} — falling back to full scorer`);
          }
        }

        // ── Tier 2: Full vision-dimension scorer — ~60-180s ──
        // SD-LEARN-FIX-ADDRESS-PAT-AUTO-054: tag auto-heal scores as sd-heal mode
        if (!autoHealScore) {
          console.log(useFastHeal
            ? '   🔄 Falling back to full vision-dimension scorer...'
            : `   🔍 Full heal path (SD type: ${sdType} requires thorough scoring)`);
          try {
            const { scoreSD } = await import('../../../../../../scripts/eva/vision-scorer.js');
            const healPromise = scoreSD({ sdKey, supabase });
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Auto-heal timed out')), AUTO_HEAL_TIMEOUT_MS)
            );
            await Promise.race([healPromise, timeoutPromise]);

            // Re-query for the newly created score
            const { data: newScores } = await supabase
              .from('eva_vision_scores')
              .select('id, sd_id, total_score, threshold_action, rubric_snapshot, scored_at')
              .eq('sd_id', sdKey)
              .order('scored_at', { ascending: false })
              .limit(1);

            if (newScores && newScores.length > 0) {
              autoHealScore = newScores[0];
              // Tag the auto-created score as sd-heal mode if not already
              if (autoHealScore.rubric_snapshot?.mode !== 'sd-heal') {
                const updatedSnapshot = { ...(autoHealScore.rubric_snapshot || {}), mode: 'sd-heal', source: 'auto-heal-gate' };
                await supabase.from('eva_vision_scores').update({ rubric_snapshot: updatedSnapshot }).eq('id', autoHealScore.id);
                autoHealScore.rubric_snapshot = updatedSnapshot;
              }
              console.log(`   ✅ Full heal complete: score ${autoHealScore.total_score}/100 (mode: sd-heal)`);
            } else {
              console.log('   ⚠️  Full heal ran but no score was persisted');
            }
          } catch (err) {
            console.log(`   ❌ Full heal failed: ${err.message}`);
          }
        }

        // ── Tier 3: Structural-only fallback — deterministic, <2s ──
        if (!autoHealScore) {
          console.log('   🔧 Tier 3: Structural-only fallback (deterministic)');
          try {
            const fastResult = await fastAutoHeal(supabase, sdKey, sdUuid, sdType);
            if (fastResult) {
              // Use structural score only (semantic already failed or wasn't attempted)
              const structuralOnlyScore = fastResult.details?.structural
                ? Math.round(Object.values(fastResult.details.structural).filter(v => typeof v === 'string' && !v.includes('missing') && !v.includes('failed') && !v.includes('incomplete')).length / Math.max(1, Object.keys(fastResult.details.structural).length) * 100)
                : fastResult.score;

              // Find a vision_id to reference
              let t3VisionId = null;
              const { data: t3VisionDocs } = await supabase
                .from('eva_vision_documents').select('id').order('created_at', { ascending: false }).limit(1);
              if (t3VisionDocs && t3VisionDocs.length > 0) t3VisionId = t3VisionDocs[0].id;

              // Count existing iterations
              const { count: t3IterCount } = await supabase
                .from('eva_vision_scores').select('id', { count: 'exact', head: true }).eq('sd_id', sdKey);

              const t3DimensionScores = fastResult.details || {
                structural: { score: structuralOnlyScore }
              };

              const t3InsertPayload = {
                sd_id: sdKey,
                total_score: structuralOnlyScore,
                threshold_action: structuralOnlyScore >= threshold ? 'accept' : 'minor_sd',
                iteration: (t3IterCount || 0) + 1,
                dimension_scores: t3DimensionScores,
                rubric_snapshot: {
                  mode: 'sd-heal',
                  source: 'structural-fallback',
                  scoring_mode: 'structural-only',
                  details: fastResult.details
                }
              };
              if (t3VisionId) t3InsertPayload.vision_id = t3VisionId;

              const { data: inserted, error: t3InsertErr } = await supabase
                .from('eva_vision_scores')
                .insert(t3InsertPayload)
                .select('id, sd_id, total_score, threshold_action, rubric_snapshot, scored_at');

              if (t3InsertErr) console.log(`   ⚠️  Tier 3 score insert failed: ${t3InsertErr.message}`);

              if (inserted && inserted.length > 0) {
                autoHealScore = inserted[0];
                console.log(`   ✅ Structural fallback score: ${autoHealScore.total_score}/100`);
              }
            }
          } catch (err) {
            console.log(`   ❌ Structural fallback also failed: ${err.message}`);
          }
        }

        // If ALL tiers failed, fall back to manual remediation
        if (!autoHealScore) {
          console.log('');
          console.log('   All auto-heal tiers failed (fast, full, structural).');
          console.log('   This is unusual — check LLM provider connectivity.');
          console.log('');
          console.log(`   Run manually: /heal sd --sd-id ${sdKey}`);
          console.log('   Then retry PLAN-TO-LEAD.');

          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: [`Auto-heal failed for ${sdKey} (all 3 tiers) — run /heal sd --sd-id ${sdKey} manually`],
            warnings: ['Fast heal, full heal, and structural fallback all failed'],
            remediation: `/heal sd --sd-id ${sdKey}`
          };
        }

        // Auto-heal produced a score — evaluate it against threshold below
        // (falls through to the same threshold comparison logic as existing scores)
        healScores = [autoHealScore];
      }

      const latestScore = healScores[0];
      const sdHealScore = latestScore.total_score;
      const scoreAge = Math.round((Date.now() - new Date(latestScore.scored_at).getTime()) / (1000 * 60));
      const isSDHeal = latestScore.rubric_snapshot?.mode === 'sd-heal';

      console.log(`   SD Heal Score: ${sdHealScore}/100 (threshold: ${threshold})`);
      console.log(`   Score Age: ${scoreAge} min`);
      console.log(`   Score ID: ${latestScore.id}`);
      if (!isSDHeal) {
        console.log(`   ⚠️  Score mode: ${latestScore.rubric_snapshot?.mode || 'unknown'} (expected: sd-heal)`);
      }

      // Check vision heal score (advisory — non-blocking)
      let visionAdvisory = null;
      try {
        const { data: visionScores } = await supabase
          .from('eva_vision_scores')
          .select('id, total_score, scored_at')
          .is('sd_id', null)
          .order('scored_at', { ascending: false })
          .limit(1);

        if (visionScores && visionScores.length > 0) {
          visionAdvisory = {
            score: visionScores[0].total_score,
            age_minutes: Math.round((Date.now() - new Date(visionScores[0].scored_at).getTime()) / (1000 * 60))
          };
          console.log(`   Vision Heal (advisory): ${visionAdvisory.score}/100 (${visionAdvisory.age_minutes} min ago)`);
        } else {
          console.log('   Vision Heal (advisory): No recent score — consider running /heal vision');
        }
      } catch (e) {
        console.log('   Vision Heal (advisory): Query failed (non-blocking)');
        console.debug('[HealBeforeComplete] vision heal query suppressed:', e?.message || e);
      }

      // Intent-vs-Outcome Advisory (PAT-HEAL-SCOPE-001)
      // Checks whether SD scope addressed the original parent/vision intent.
      // Advisory only — does not affect pass/fail score.
      let intentAdvisory = null;
      try {
        const { data: sdRecord } = await supabase
          .from('strategic_directives_v2')
          .select('parent_sd_id, strategic_objectives, key_changes, title')
          .eq('sd_key', sdKey)
          .single();

        if (sdRecord?.parent_sd_id) {
          const { data: parentSD } = await supabase
            .from('strategic_directives_v2')
            .select('strategic_objectives, key_changes, title, description')
            .eq('id', sdRecord.parent_sd_id)
            .single();

          if (parentSD) {
            const parentObjectives = parentSD.strategic_objectives || [];
            const childObjectives = sdRecord.strategic_objectives || [];
            const parentChanges = parentSD.key_changes || [];
            const childChanges = sdRecord.key_changes || [];

            // Simple heuristic: count how many parent objectives/changes
            // have at least a keyword overlap with child objectives/changes
            const parentTerms = [...parentObjectives, ...parentChanges]
              .map(o => (typeof o === 'string' ? o : o.description || o.title || JSON.stringify(o)).toLowerCase());
            const childTerms = [...childObjectives, ...childChanges]
              .map(o => (typeof o === 'string' ? o : o.description || o.title || JSON.stringify(o)).toLowerCase());

            const coveredCount = parentTerms.filter(pt =>
              childTerms.some(ct => {
                const ptWords = pt.split(/\s+/).filter(w => w.length > 3);
                return ptWords.filter(w => ct.includes(w)).length >= 2;
              })
            ).length;

            const coverageRatio = parentTerms.length > 0 ? coveredCount / parentTerms.length : 1;

            if (coverageRatio < 0.3 && parentTerms.length > 0) {
              intentAdvisory = {
                type: 'scope_gap',
                coverage: Math.round(coverageRatio * 100),
                parent_title: parentSD.title,
                parent_objectives_count: parentObjectives.length,
                child_objectives_count: childObjectives.length
              };
              console.log(`   ⚠️  Intent-vs-Outcome Advisory: SD scope covers ~${intentAdvisory.coverage}% of parent "${parentSD.title}" objectives`);
              console.log(`      Parent has ${parentObjectives.length} objectives, child addresses ${childObjectives.length}`);
              console.log('      This is advisory only — does not affect heal pass/fail');
            } else {
              console.log(`   ✅ Intent-vs-Outcome Advisory: scope coverage ${Math.round(coverageRatio * 100)}% of parent objectives (OK)`);
            }
          }
        }
      } catch (e) {
        // Intentionally suppressed: advisory should never block
        console.debug('[HealBeforeComplete] intent-vs-outcome advisory suppressed:', e?.message || e);
      }

      // SD-LEARN-FIX-ADDRESS-PAT-AUTO-073: Log effective threshold breakdown
      const toleranceComponents = [];
      toleranceComponents.push(`base(${DEFAULT_TOLERANCE_BUFFER})`);
      if (isChildSD) toleranceComponents.push(`child(${CHILD_SD_TOLERANCE_BONUS})`);
      if (isLearnSource) toleranceComponents.push(`learn(${LEARN_SOURCE_TOLERANCE_BONUS})`);
      console.log(`   📐 Effective threshold: ${threshold - toleranceBuffer} = base(${threshold}) - tolerance(${toleranceBuffer}) [${toleranceComponents.join(' + ')}]`);

      // SD heal score within tolerance buffer — PASS with warning
      // (SD-LEARN-FIX-ADDRESS-PAT-AUTO-054: tolerance buffer for near-threshold scores)
      const effectiveThreshold = threshold - toleranceBuffer;
      if (sdHealScore >= effectiveThreshold && sdHealScore < threshold) {
        console.log(`   ⚠️  SD heal score ${sdHealScore} within tolerance buffer (${effectiveThreshold}-${threshold}) — PASS with warning`);
        return {
          passed: true,
          score: sdHealScore,
          max_score: 100,
          issues: [],
          warnings: [
            `SD heal score ${sdHealScore}/100 within tolerance buffer of threshold ${threshold} (buffer: ${toleranceBuffer})`,
            ...(visionAdvisory ? [`Vision heal advisory: ${visionAdvisory.score}/100`] : []),
            ...(intentAdvisory ? [`Intent-vs-Outcome advisory: ${intentAdvisory.coverage}% parent scope coverage (parent: "${intentAdvisory.parent_title}")`] : [])
          ],
          details: {
            sd_heal_score: sdHealScore,
            threshold,
            tolerance_buffer: toleranceBuffer,
            effective_threshold: effectiveThreshold,
            is_corrective: isCorrective,
              is_child_sd: isChildSD,
              is_learn_source: isLearnSource,
            score_id: latestScore.id,
            score_age_minutes: scoreAge,
            vision_advisory: visionAdvisory,
            intent_advisory: intentAdvisory
          }
        };
      }

      // SD heal score below effective threshold — auto-re-heal up to MAX_HEAL_ITERATIONS
      // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-132 (FR-2): bounded iteration loop with EXHAUSTED verdict
      if (sdHealScore < effectiveThreshold) {
        const initialGaps = latestScore.rubric_snapshot?.gaps || [];
        console.log('');
        console.log(`   ⚠️  SD heal score ${sdHealScore} < ${effectiveThreshold} effective threshold — attempting auto-re-heal (max ${MAX_HEAL_ITERATIONS} iterations)...`);
        if (initialGaps.length > 0) {
          console.log('   Gaps identified in previous score:');
          initialGaps.forEach((gap, i) => {
            console.log(`     ${i + 1}. ${gap}`);
          });
        }

        // Inner: try one heal attempt (fast for lightweight SDs, full fallback otherwise).
        // Returns the new vision_scores row or null if both paths failed.
        const attemptOneHeal = async () => {
          let result = null;

          if (FAST_HEAL_SD_TYPES.includes(sdType)) {
            try {
              console.log('   🚀 Fast re-heal path...');
              const fastResult = await fastAutoHeal(supabase, sdKey, sdUuid, sdType);
              if (fastResult && fastResult.score >= effectiveThreshold) {
                let reHealVisionId = null;
                const { data: reVisionDocs } = await supabase
                  .from('eva_vision_documents')
                  .select('id')
                  .order('created_at', { ascending: false })
                  .limit(1);
                if (reVisionDocs && reVisionDocs.length > 0) reHealVisionId = reVisionDocs[0].id;

                const { count: reIterCount } = await supabase
                  .from('eva_vision_scores')
                  .select('id', { count: 'exact', head: true })
                  .eq('sd_id', sdKey);

                const reHealPayload = {
                  sd_id: sdKey,
                  total_score: fastResult.score,
                  threshold_action: fastResult.score >= threshold ? 'accept' : 'minor_sd',
                  iteration: (reIterCount || 0) + 1,
                  dimension_scores: fastResult.details || { structural: { score: 100 }, semantic: { score: 72 } },
                  rubric_snapshot: { mode: 'sd-heal', source: 'fast-auto-re-heal', scoring_mode: fastResult.mode, details: fastResult.details }
                };
                if (reHealVisionId) reHealPayload.vision_id = reHealVisionId;

                const { data: inserted, error: reInsertErr } = await supabase
                  .from('eva_vision_scores')
                  .insert(reHealPayload)
                  .select('id, sd_id, total_score, threshold_action, rubric_snapshot, scored_at');
                if (reInsertErr) console.log(`   ⚠️  Re-heal score insert failed: ${reInsertErr.message}`);
                if (inserted && inserted.length > 0) result = inserted[0];
              }
            } catch (err) {
              console.log(`   ⚠️  Fast re-heal failed: ${err.message}`);
            }
          }

          if (!result) {
            try {
              const { scoreSD } = await import('../../../../../../scripts/eva/vision-scorer.js');
              const healPromise = scoreSD({ sdKey, supabase });
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Auto-re-heal timed out')), AUTO_HEAL_TIMEOUT_MS)
              );
              await Promise.race([healPromise, timeoutPromise]);

              const { data: newScores } = await supabase
                .from('eva_vision_scores')
                .select('id, sd_id, total_score, threshold_action, rubric_snapshot, scored_at')
                .eq('sd_id', sdKey)
                .order('scored_at', { ascending: false })
                .limit(1);

              if (newScores && newScores.length > 0) {
                result = newScores[0];
                if (result.rubric_snapshot?.mode !== 'sd-heal') {
                  const updatedSnapshot = { ...(result.rubric_snapshot || {}), mode: 'sd-heal', source: 'auto-re-heal-gate' };
                  await supabase.from('eva_vision_scores').update({ rubric_snapshot: updatedSnapshot }).eq('id', result.id);
                  result.rubric_snapshot = updatedSnapshot;
                }
              }
            } catch (err) {
              console.log(`   ❌ Auto-re-heal failed: ${err.message}`);
            }
          }

          return result;
        };

        let currentScore = sdHealScore;
        let currentScoreObj = latestScore;
        let healIterations = 0;
        const iterationHistory = [];

        while (healIterations < MAX_HEAL_ITERATIONS && currentScore < effectiveThreshold) {
          healIterations++;

          // FR-5: per-iteration audit_log row with structured payload
          try {
            await supabase.from('audit_log').insert({
              event_type: 'session.heal_iteration',
              entity_type: 'sd',
              entity_id: sdKey,
              new_value: {
                gate: 'HEAL_BEFORE_COMPLETE',
                iteration_number: healIterations,
                score: currentScore,
                threshold: effectiveThreshold,
                delta: currentScore - effectiveThreshold,
              },
              metadata: { sd_uuid: sdUuid, sd_type: sdType },
              severity: 'info',
              created_by: process.env.CLAUDE_SESSION_ID || 'heal-before-complete-gate',
            });
          } catch (auditErr) {
            console.error('[heal-before-complete] audit_log_write_failed:', auditErr?.message || auditErr);
          }

          console.log(`   🔁 Iteration ${healIterations}/${MAX_HEAL_ITERATIONS}: score ${currentScore}, threshold ${effectiveThreshold}, delta ${currentScore - effectiveThreshold}`);

          const newScoreObj = await attemptOneHeal();
          iterationHistory.push({ iteration: healIterations, before: currentScore, after: newScoreObj?.total_score ?? null });

          if (!newScoreObj) {
            console.log('   ⚠️  Heal attempt produced no new score; breaking iteration loop');
            break;
          }

          currentScoreObj = newScoreObj;
          currentScore = newScoreObj.total_score;
          console.log(`   📈 Iteration ${healIterations} produced score ${currentScore}`);
        }

        // Convergence — PASS
        if (currentScore >= effectiveThreshold) {
          const withinBuffer = currentScore < threshold;
          console.log(`   ✅ Heal converged in ${healIterations} iteration(s): ${sdHealScore} → ${currentScore} >= ${effectiveThreshold}${withinBuffer ? ' (within tolerance)' : ''}`);
          return {
            passed: true,
            score: currentScore,
            max_score: 100,
            issues: [],
            warnings: [
              `Auto-re-heal converged in ${healIterations} iteration(s): ${sdHealScore} → ${currentScore}`,
              ...(withinBuffer ? [`Score ${currentScore} within tolerance buffer of threshold ${threshold} (buffer: ${toleranceBuffer})`] : []),
              ...(visionAdvisory ? [`Vision heal advisory: ${visionAdvisory.score}/100`] : []),
              ...(intentAdvisory ? [`Intent-vs-Outcome advisory: ${intentAdvisory.coverage}% parent scope coverage (parent: "${intentAdvisory.parent_title}")`] : [])
            ],
            details: {
              sd_heal_score: currentScore,
              original_score: sdHealScore,
              auto_re_healed: true,
              iterations: healIterations,
              iteration_history: iterationHistory,
              threshold,
              tolerance_buffer: toleranceBuffer,
              effective_threshold: effectiveThreshold,
              is_corrective: isCorrective,
              is_child_sd: isChildSD,
              is_learn_source: isLearnSource,
              score_id: currentScoreObj.id,
              score_age_minutes: 0,
              vision_advisory: visionAdvisory,
              intent_advisory: intentAdvisory
            }
          };
        }

        // EXHAUSTED — cap reached or attempt failed without convergence
        const finalGaps = currentScoreObj?.rubric_snapshot?.gaps || initialGaps;
        const exhaustedNote = `Heal exhausted ${healIterations}/${MAX_HEAL_ITERATIONS} iteration(s) without converging (${sdHealScore} → ${currentScore}, effective threshold ${effectiveThreshold})`;

        console.log('');
        console.log(`   ❌ EXHAUSTED: ${exhaustedNote}`);
        console.log('');
        console.log('   Fix the gaps within this SD, re-ship, then re-run:');
        console.log(`   /heal sd --sd-id ${sdKey}`);

        return {
          passed: false,
          score: currentScore,
          max_score: 100,
          issues: [
            `[${GATE_REASON_CODES.HEAL_EXHAUSTED}] ${exhaustedNote}`,
            ...finalGaps.map(g => `Gap: ${g}`)
          ],
          warnings: [
            ...(visionAdvisory ? [`Vision heal advisory: ${visionAdvisory.score}/100`] : []),
            ...(intentAdvisory ? [`Intent-vs-Outcome advisory: ${intentAdvisory.coverage}% parent scope coverage (parent: "${intentAdvisory.parent_title}")`] : [])
          ],
          remediation: `Fix identified gaps, re-ship, run /heal sd --sd-id ${sdKey}, then retry PLAN-TO-LEAD`,
          details: {
            verdict: 'EXHAUSTED',
            reason_code: GATE_REASON_CODES.HEAL_EXHAUSTED,
            sd_heal_score: currentScore,
            original_score: sdHealScore,
            auto_re_healed: healIterations > 0,
            iterations: healIterations,
            iteration_history: iterationHistory,
            threshold,
            tolerance_buffer: toleranceBuffer,
            effective_threshold: effectiveThreshold,
            is_corrective: isCorrective,
            is_child_sd: isChildSD,
            is_learn_source: isLearnSource,
            score_id: currentScoreObj?.id ?? latestScore.id,
            score_age_minutes: healIterations > 0 ? 0 : scoreAge,
            gaps: finalGaps,
            vision_advisory: visionAdvisory,
            intent_advisory: intentAdvisory
          }
        };
      }

      // SD heal score meets threshold — PASS
      console.log(`   ✅ SD heal score ${sdHealScore}/100 >= ${threshold} threshold — PASS`);

      return {
        passed: true,
        score: sdHealScore,
        max_score: 100,
        issues: [],
        warnings: [
          ...(visionAdvisory ? [`Vision heal advisory: ${visionAdvisory.score}/100`] : ['No vision heal score available — consider running /heal vision']),
          ...(intentAdvisory ? [`Intent-vs-Outcome advisory: ${intentAdvisory.coverage}% parent scope coverage (parent: "${intentAdvisory.parent_title}")`] : [])
        ],
        details: {
          sd_heal_score: sdHealScore,
          threshold,
          tolerance_buffer: toleranceBuffer,
          is_corrective: isCorrective,
              is_child_sd: isChildSD,
              is_learn_source: isLearnSource,
          score_id: latestScore.id,
          score_age_minutes: scoreAge,
          vision_advisory: visionAdvisory,
          intent_advisory: intentAdvisory
        }
      };
    },
    required: true
  };
}
