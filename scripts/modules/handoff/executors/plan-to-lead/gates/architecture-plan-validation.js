/**
 * Architecture Plan Validation Gate for PLAN-TO-LEAD
 *
 * Validates that architecture plan dimensions have been addressed by the SD.
 * Checks SD description, scope, key_changes, user stories, and vision scores
 * for evidence of dimension coverage.
 *
 * ADVISORY gate — always passes, but reports uncovered dimensions as warnings.
 */

/**
 * Check if text contains references to a dimension name.
 * Uses word-boundary matching to avoid false positives.
 */
function textReferencesName(text, dimensionName) {
  if (!text || !dimensionName) return false;
  const normalizedText = text.toLowerCase();
  const normalizedName = dimensionName.toLowerCase();

  // Check exact match
  if (normalizedText.includes(normalizedName)) return true;

  // Check individual words (for multi-word dimensions like "data_pipeline")
  const words = normalizedName.replace(/[_-]/g, ' ').split(/\s+/);
  if (words.length > 1) {
    return words.every(word => normalizedText.includes(word));
  }

  return false;
}

export function createArchitecturePlanValidationGate(supabase) {
  return {
    name: 'ARCHITECTURE_PLAN_VALIDATION',
    validator: async (ctx) => {
      console.log('\n🏗️  ARCHITECTURE PLAN VALIDATION GATE (Advisory)');
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
          issues: [], warnings: ['Orchestrator SD — architecture validation deferred to children'],
          details: { is_orchestrator: true }
        };
      }

      // Read metadata for arch_key
      let metadata = ctx.sd?.metadata;
      if (!metadata) {
        const { data: sdRecord } = await supabase
          .from('strategic_directives_v2')
          .select('metadata')
          .eq('id', sdUuid)
          .single();
        metadata = sdRecord?.metadata;
      }

      const archKey = metadata?.arch_key;
      if (!archKey) {
        console.log('   ⚠️  No arch_key in SD metadata — skipping architecture validation');
        return {
          passed: true, score: 100, max_score: 100,
          issues: [],
          warnings: ['No arch_key in SD metadata — architecture plan validation skipped'],
          details: { has_arch_key: false }
        };
      }

      console.log(`   Architecture Key: ${archKey}`);

      // Query architecture plan
      const { data: archPlan, error: archError } = await supabase
        .from('eva_architecture_plans')
        .select('plan_key, extracted_dimensions, content')
        .eq('plan_key', archKey)
        .single();

      if (archError || !archPlan) {
        console.log(`   ⚠️  Architecture plan not found: ${archError?.message || 'no record'}`);
        return {
          passed: true, score: 100, max_score: 100,
          issues: [],
          warnings: [`Architecture plan '${archKey}' not found in database`],
          details: { arch_key: archKey, plan_found: false }
        };
      }

      const dimensions = archPlan.extracted_dimensions;
      if (!dimensions || !Array.isArray(dimensions) || dimensions.length === 0) {
        console.log('   ⚠️  Architecture plan has no extracted dimensions');
        return {
          passed: true, score: 100, max_score: 100,
          issues: [],
          warnings: ['Architecture plan has no extracted_dimensions to validate against'],
          details: { arch_key: archKey, dimensions_count: 0 }
        };
      }

      console.log(`   Found ${dimensions.length} architecture dimension(s)\n`);

      // Gather SD text content for dimension matching
      const sd = ctx.sd || {};
      const sdText = [
        sd.description || '',
        sd.scope || '',
        ...(Array.isArray(sd.key_changes) ? sd.key_changes : []),
        sd.title || ''
      ].join(' ');

      // Fetch user stories for text matching
      const { data: stories } = await supabase
        .from('user_stories')
        .select('title, acceptance_criteria')
        .eq('sd_id', sdUuid);

      const storyText = (stories || [])
        .map(s => `${s.title || ''} ${JSON.stringify(s.acceptance_criteria || '')}`)
        .join(' ');

      // Fetch latest vision scores for dimension-level scores
      const { data: visionScores } = await supabase
        .from('eva_vision_scores')
        .select('dimension_scores')
        .eq('sd_id', sdKey)
        .order('scored_at', { ascending: false })
        .limit(1);

      const dimensionScores = visionScores?.[0]?.dimension_scores || {};

      // Evaluate each dimension
      const results = [];
      let totalWeightedScore = 0;
      let totalWeight = 0;

      for (const dim of dimensions) {
        const name = dim.name || 'unnamed';
        const weight = dim.weight || 1;
        totalWeight += weight;

        const inSD = textReferencesName(sdText, name);
        const inStories = textReferencesName(storyText, name);

        // Check vision score for this dimension
        const dimScore = dimensionScores[name];
        const hasVisionScore = dimScore != null && dimScore > 70;

        const hasEvidence = inSD || inStories || hasVisionScore;
        const evidenceSources = [];
        if (inSD) evidenceSources.push('SD description/scope');
        if (inStories) evidenceSources.push('user stories');
        if (hasVisionScore) evidenceSources.push(`vision score: ${dimScore}`);

        results.push({
          name,
          weight,
          hasEvidence,
          evidenceSources,
          description: dim.description || '',
          visionScore: dimScore
        });

        totalWeightedScore += hasEvidence ? weight : 0;

        if (hasEvidence) {
          console.log(`   ✅ ${name} (weight: ${weight}) — evidence: ${evidenceSources.join(', ')}`);
        } else {
          console.log(`   ⚠️  ${name} (weight: ${weight}) — no evidence found`);
        }
      }

      const score = totalWeight > 0
        ? Math.round((totalWeightedScore / totalWeight) * 100)
        : 100;

      const coveredCount = results.filter(r => r.hasEvidence).length;
      const uncovered = results.filter(r => !r.hasEvidence);

      console.log(`\n   Coverage: ${coveredCount}/${dimensions.length} dimensions (${score}%)`);

      const warnings = uncovered.map(d =>
        `Architecture dimension '${d.name}' (weight: ${d.weight}) has no evidence in SD scope, stories, or vision scores${d.description ? ` — expected: ${d.description}` : ''}`
      );

      if (warnings.length > 0) {
        console.log(`   ⚠️  ${warnings.length} dimension(s) without evidence`);
      } else {
        console.log('   ✅ All architecture dimensions have evidence');
      }

      return {
        passed: true, // Advisory — always passes
        score,
        max_score: 100,
        issues: [],
        warnings,
        details: {
          arch_key: archKey,
          dimensions_total: dimensions.length,
          dimensions_covered: coveredCount,
          dimensions_uncovered: uncovered.length,
          dimension_results: results,
          weighted_score: score
        }
      };
    },
    required: true // Gate runs, but always passes (advisory)
  };
}
