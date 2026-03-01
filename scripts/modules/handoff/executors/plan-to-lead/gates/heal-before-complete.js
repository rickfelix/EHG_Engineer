/**
 * Heal-Before-Complete Gate for PLAN-TO-LEAD
 * SD-MAN-GEN-CORRECTIVE-VISION-GAP-007-03 (FR-004)
 *
 * Checks that the SD has a recent heal score meeting the threshold
 * before allowing final approval. Prevents premature SD completion
 * by catching gaps while context is fresh.
 *
 * - SD heal: BLOCKING — score must be >= threshold (default 80)
 * - Vision heal: ADVISORY — logged but does not block
 */

const DEFAULT_HEAL_THRESHOLD = 80;

/**
 * Load the heal gate threshold from leo_config.
 * @param {Object} supabase
 * @returns {Promise<number>}
 */
async function loadHealThreshold(supabase) {
  try {
    const { data } = await supabase
      .from('leo_config')
      .select('value')
      .eq('key', 'heal_gate_threshold')
      .single();

    if (data?.value != null) {
      const parsed = parseInt(data.value, 10);
      if (!isNaN(parsed) && parsed > 0 && parsed <= 100) return parsed;
    }
  } catch {
    // Fall through to default
  }
  return DEFAULT_HEAL_THRESHOLD;
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

      const threshold = await loadHealThreshold(supabase);

      // Query most recent SD heal score from eva_vision_scores
      const { data: healScores, error: healError } = await supabase
        .from('eva_vision_scores')
        .select('id, sd_id, total_score, threshold_action, rubric_snapshot, created_at')
        .eq('sd_id', sdKey)
        .order('created_at', { ascending: false })
        .limit(1);

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

      // No heal score found — require running /heal sd first
      if (!healScores || healScores.length === 0) {
        console.log(`   ❌ No heal score found for ${sdKey}`);
        console.log('');
        console.log('   The heal-before-complete gate requires an SD heal score');
        console.log('   before final approval. This catches gaps while context is fresh.');
        console.log('');
        console.log(`   Run: /heal sd --sd-id ${sdKey}`);
        console.log('   Then retry PLAN-TO-LEAD.');

        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [`No heal score found for ${sdKey} — run /heal sd --sd-id ${sdKey} before PLAN-TO-LEAD`],
          warnings: [],
          remediation: `/heal sd --sd-id ${sdKey}`
        };
      }

      const latestScore = healScores[0];
      const sdHealScore = latestScore.total_score;
      const scoreAge = Math.round((Date.now() - new Date(latestScore.created_at).getTime()) / (1000 * 60));
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
          .select('id, total_score, created_at')
          .is('sd_id', null)
          .order('created_at', { ascending: false })
          .limit(1);

        if (visionScores && visionScores.length > 0) {
          visionAdvisory = {
            score: visionScores[0].total_score,
            age_minutes: Math.round((Date.now() - new Date(visionScores[0].created_at).getTime()) / (1000 * 60))
          };
          console.log(`   Vision Heal (advisory): ${visionAdvisory.score}/100 (${visionAdvisory.age_minutes} min ago)`);
        } else {
          console.log('   Vision Heal (advisory): No recent score — consider running /heal vision');
        }
      } catch {
        console.log('   Vision Heal (advisory): Query failed (non-blocking)');
      }

      // SD heal score below threshold — NEEDS_ITERATION
      if (sdHealScore < threshold) {
        const gaps = latestScore.rubric_snapshot?.gaps || [];
        console.log('');
        console.log(`   ❌ NEEDS_ITERATION: SD heal score ${sdHealScore} < ${threshold} threshold`);
        if (gaps.length > 0) {
          console.log('   Gaps to address:');
          gaps.forEach((gap, i) => {
            console.log(`     ${i + 1}. ${gap}`);
          });
        }
        console.log('');
        console.log('   Fix the gaps within this SD, re-ship, then re-run:');
        console.log(`   /heal sd --sd-id ${sdKey}`);

        return {
          passed: false,
          score: Math.round((sdHealScore / threshold) * 100),
          max_score: 100,
          issues: [
            `SD heal score ${sdHealScore}/100 below threshold ${threshold} — NEEDS_ITERATION`,
            ...gaps.map(g => `Gap: ${g}`)
          ],
          warnings: visionAdvisory ? [`Vision heal advisory: ${visionAdvisory.score}/100`] : [],
          remediation: `Fix identified gaps, re-ship, run /heal sd --sd-id ${sdKey}, then retry PLAN-TO-LEAD`,
          details: {
            sd_heal_score: sdHealScore,
            threshold,
            score_id: latestScore.id,
            score_age_minutes: scoreAge,
            gaps,
            vision_advisory: visionAdvisory
          }
        };
      }

      // SD heal score meets threshold — PASS
      console.log(`   ✅ SD heal score ${sdHealScore} >= ${threshold} threshold — PASS`);

      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: visionAdvisory
          ? [`Vision heal advisory: ${visionAdvisory.score}/100`]
          : ['No vision heal score available — consider running /heal vision'],
        details: {
          sd_heal_score: sdHealScore,
          threshold,
          score_id: latestScore.id,
          score_age_minutes: scoreAge,
          vision_advisory: visionAdvisory
        }
      };
    },
    required: true
  };
}
