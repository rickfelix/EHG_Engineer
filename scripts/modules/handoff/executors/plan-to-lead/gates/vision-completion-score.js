/**
 * Vision Completion Re-Score Gate for PLAN-TO-LEAD
 *
 * Re-scores the SD against vision/architecture dimensions at completion time
 * and compares with the entry score. Detects vision regression — where an SD
 * starts aligned but drifts during implementation.
 *
 * ADVISORY gate — always passes, but logs delta for visibility.
 */

const RESCORE_TIMEOUT_MS = 60_000;

export function createVisionCompletionScoreGate(supabase) {
  return {
    name: 'VISION_COMPLETION_SCORE',
    validator: async (ctx) => {
      console.log('\n🔭 VISION COMPLETION RE-SCORE GATE (Advisory)');
      console.log('-'.repeat(50));

      const sdUuid = ctx.sd?.id || ctx.sdId;
      const sdKey = ctx.sd?.sd_key || ctx.sdId;

      // ORCHESTRATOR BYPASS
      const { data: childSDs } = await supabase
        .from('strategic_directives_v2')
        .select('id')
        .eq('parent_sd_id', sdUuid);

      if (childSDs && childSDs.length > 0) {
        console.log(`   ℹ️  Orchestrator SD (${childSDs.length} children) — bypassing`);
        return {
          passed: true, score: 100, max_score: 100,
          issues: [], warnings: ['Orchestrator SD — vision score deferred to children'],
          details: { is_orchestrator: true }
        };
      }

      // CORRECTIVE SD EXEMPTION
      let metadata = ctx.sd?.metadata;
      if (!metadata) {
        const { data: sdRecord } = await supabase
          .from('strategic_directives_v2')
          .select('metadata')
          .eq('id', sdUuid)
          .single();
        metadata = sdRecord?.metadata;
      }

      if (metadata?.vision_origin_score_id) {
        console.log('   ℹ️  Corrective SD — vision re-score not applicable');
        return {
          passed: true, score: 100, max_score: 100,
          issues: [], warnings: ['Corrective SD — skipping vision re-score'],
          details: { is_corrective: true }
        };
      }

      // Check for vision_key
      const visionKey = metadata?.vision_key;
      const archKey = metadata?.arch_key;

      if (!visionKey) {
        console.log('   ⚠️  No vision_key in SD metadata — skipping re-score');
        return {
          passed: true, score: 100, max_score: 100,
          issues: [],
          warnings: ['No vision_key in SD metadata — cannot compare entry vs completion score'],
          details: { has_vision_key: false }
        };
      }

      console.log(`   Vision Key: ${visionKey}`);
      if (archKey) console.log(`   Arch Key: ${archKey}`);

      // Look up entry score (earliest score for this SD)
      const { data: entryScores } = await supabase
        .from('eva_vision_scores')
        .select('id, total_score, dimension_scores, scored_at')
        .eq('sd_id', sdKey)
        .order('scored_at', { ascending: true })
        .limit(1);

      const entryScore = entryScores?.[0];
      if (entryScore) {
        console.log(`   Entry Score: ${entryScore.total_score}/100 (${new Date(entryScore.scored_at).toLocaleDateString()})`);
      } else {
        console.log('   ⚠️  No entry score found — will score for the first time');
      }

      // Check for a recent score (within 30 minutes) — skip expensive re-score
      const RECENT_SCORE_THRESHOLD_MS = 30 * 60 * 1000;
      let completionScore = null;

      const { data: recentScores } = await supabase
        .from('eva_vision_scores')
        .select('id, total_score, dimension_scores, scored_at')
        .eq('sd_id', sdKey)
        .order('scored_at', { ascending: false })
        .limit(1);

      const recentScore = recentScores?.[0];
      if (recentScore) {
        const ageMs = Date.now() - new Date(recentScore.scored_at).getTime();
        if (ageMs < RECENT_SCORE_THRESHOLD_MS) {
          completionScore = recentScore;
          console.log(`   ♻️  Using recent score (${Math.round(ageMs / 60000)}min old) — skipping re-score`);
        }
      }

      // Only re-score if no recent score exists
      if (!completionScore) {
        try {
          const { scoreSD } = await import('../../../../../../scripts/eva/vision-scorer.js');
          const scorePromise = scoreSD({ sdKey, visionKey, archKey, supabase });
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Vision re-score timed out')), RESCORE_TIMEOUT_MS)
          );
          await Promise.race([scorePromise, timeoutPromise]);

          // Fetch the newly created score
          const { data: newScores } = await supabase
            .from('eva_vision_scores')
            .select('id, total_score, dimension_scores, scored_at')
            .eq('sd_id', sdKey)
            .order('scored_at', { ascending: false })
            .limit(1);

          completionScore = newScores?.[0];
        } catch (err) {
          console.log(`   ⚠️  Vision re-score failed: ${err.message}`);
          return {
            passed: true, score: 100, max_score: 100,
            issues: [],
            warnings: [`Vision re-score failed: ${err.message} — advisory only, not blocking`],
            details: { rescore_error: err.message }
          };
        }
      }

      if (!completionScore) {
        console.log('   ⚠️  Re-score ran but no score persisted');
        return {
          passed: true, score: 100, max_score: 100,
          issues: [],
          warnings: ['Vision re-score did not produce a persisted score'],
          details: { rescore_persisted: false }
        };
      }

      console.log(`   Completion Score: ${completionScore.total_score}/100`);

      // Compare entry vs completion
      const warnings = [];
      const delta = entryScore
        ? completionScore.total_score - entryScore.total_score
        : null;

      if (delta !== null) {
        console.log(`   Delta: ${delta >= 0 ? '+' : ''}${delta} points`);

        if (delta >= 0) {
          console.log('   ✅ Vision alignment maintained or improved');
        } else if (delta > -5) {
          console.log('   ℹ️  Minor vision score decrease (within tolerance)');
        } else if (delta > -15) {
          const msg = `Vision regression: score dropped ${Math.abs(delta)} points (${entryScore.total_score} → ${completionScore.total_score})`;
          warnings.push(msg);
          console.log(`   ⚠️  ${msg}`);
        } else {
          const msg = `Significant vision regression: score dropped ${Math.abs(delta)} points (${entryScore.total_score} → ${completionScore.total_score})`;
          warnings.push(msg);
          console.log(`   🚨 ${msg}`);
        }
      } else {
        console.log('   ℹ️  No entry score to compare — baseline established');
      }

      return {
        passed: true, // Advisory — always passes
        score: completionScore.total_score,
        max_score: 100,
        issues: [],
        warnings,
        details: {
          entry_score: entryScore?.total_score || null,
          completion_score: completionScore.total_score,
          delta,
          entry_score_id: entryScore?.id || null,
          completion_score_id: completionScore.id,
          vision_key: visionKey,
          arch_key: archKey
        }
      };
    },
    required: true // Gate runs, but always passes (advisory)
  };
}
