/**
 * Venture Template Applier
 * SD-EVA-FEAT-VENTURE-TEMPLATES-001 (FR-2, FR-5, FR-6, FR-7, FR-9)
 *
 * Recommends and applies reusable templates to new ventures at Stage 1.
 * Uses searchSimilar() for domain-based matching and injects template
 * data into the Stage 1 analysisStep context.
 *
 * Design principles (matching cross-venture-learning.js):
 *   - Pure functions, no side effects in analysis
 *   - Dependency-injected Supabase client
 *   - Deterministic rounding via round2()
 *   - Graceful degradation when <5 ventures exist
 */

import { round2, MIN_VENTURES, searchSimilar } from './cross-venture-learning.js';

const MODULE_VERSION = '1.0.0';

/**
 * Recommend templates for a new venture based on domain similarity.
 *
 * Uses a two-stage approach:
 *   1. Domain tag overlap scoring (fast, exact match on tags)
 *   2. Hybrid semantic search via searchSimilar() for deeper matching
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId - UUID of the new venture
 * @param {object} [options]
 * @param {number} [options.limit=3] - Max templates to recommend
 * @param {number} [options.minEffectiveness=0] - Min effectiveness score filter
 * @returns {Promise<{status: string, recommendations: Array<{templateId: string, templateName: string, score: number, domainOverlap: number, effectivenessScore: number, sourceVentureName: string}>}>}
 */
async function recommendTemplates(supabase, ventureId, options = {}) {
  const { limit = 3, minEffectiveness = 0 } = options;

  // 1. Check if enough ventures exist for meaningful recommendations
  const { count: ventureCount } = await supabase
    .from('ventures')
    .select('id', { count: 'exact', head: true })
    .not('status', 'eq', 'draft');

  if (ventureCount < MIN_VENTURES) {
    return {
      status: 'insufficient_data',
      minimum: MIN_VENTURES,
      actual: ventureCount || 0,
      recommendations: [],
    };
  }

  // 2. Get the target venture's domain info
  const { data: venture, error: vErr } = await supabase
    .from('ventures')
    .select('id, name, domain_tags, elevator_pitch')
    .eq('id', ventureId)
    .single();

  if (vErr) throw new Error(`Failed to query venture: ${vErr.message}`);
  if (!venture) throw new Error(`Venture not found: ${ventureId}`);

  const targetTags = venture.domain_tags || [];

  // 3. Get all current templates with source venture info
  let query = supabase
    .from('venture_templates')
    .select('id, template_name, template_version, domain_tags, effectiveness_score, usage_count, source_venture_id')
    .eq('is_current', true)
    .gte('effectiveness_score', minEffectiveness)
    .order('effectiveness_score', { ascending: false });

  const { data: templates, error: tErr } = await query;

  if (tErr) throw new Error(`Failed to query templates: ${tErr.message}`);
  if (!templates || templates.length === 0) {
    return { status: 'no_templates', recommendations: [] };
  }

  // 4. Score each template by domain overlap
  const scored = [];
  for (const t of templates) {
    // Don't recommend a venture's own template
    if (t.source_venture_id === ventureId) continue;

    const templateTags = t.domain_tags || [];
    const domainOverlap = computeDomainOverlap(targetTags, templateTags);

    scored.push({
      templateId: t.id,
      templateName: t.template_name,
      domainOverlap,
      effectivenessScore: round2(t.effectiveness_score),
      usageCount: t.usage_count,
      sourceVentureId: t.source_venture_id,
    });
  }

  // 5. Augment with semantic search if venture has description
  if (venture.elevator_pitch) {
    try {
      const searchResults = await searchSimilar(supabase, {
        query: venture.elevator_pitch,
        tables: ['venture_artifacts'],
        limit: 10,
      });

      // Boost templates whose source ventures appear in semantic results
      const semanticVentureIds = new Set(
        searchResults
          .filter((r) => r.metadata?.venture_id)
          .map((r) => r.metadata.venture_id)
      );

      for (const s of scored) {
        if (semanticVentureIds.has(s.sourceVentureId)) {
          s.semanticBoost = 0.2;
        } else {
          s.semanticBoost = 0;
        }
      }
    } catch {
      // Graceful degradation: semantic search failure doesn't block recommendations
      for (const s of scored) {
        s.semanticBoost = 0;
      }
    }
  } else {
    for (const s of scored) {
      s.semanticBoost = 0;
    }
  }

  // 6. Compute final score: 50% domain + 30% effectiveness + 20% semantic
  for (const s of scored) {
    s.score = round2(
      s.domainOverlap * 0.5 +
      (s.effectivenessScore / 100) * 0.3 +
      s.semanticBoost
    );
  }

  // 7. Get source venture names
  const sourceIds = [...new Set(scored.map((s) => s.sourceVentureId))];
  const { data: sourceVentures } = await supabase
    .from('ventures')
    .select('id, name')
    .in('id', sourceIds);

  const nameMap = {};
  for (const v of sourceVentures || []) {
    nameMap[v.id] = v.name;
  }

  // 8. Rank, limit, and return
  const recommendations = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => ({
      templateId: s.templateId,
      templateName: s.templateName,
      score: s.score,
      domainOverlap: round2(s.domainOverlap),
      effectivenessScore: s.effectivenessScore,
      sourceVentureName: nameMap[s.sourceVentureId] || 'Unknown',
    }));

  return {
    status: 'complete',
    recommendations,
    metadata: {
      ventureId,
      ventureName: venture.name,
      templatesEvaluated: scored.length,
      moduleVersion: MODULE_VERSION,
    },
  };
}

/**
 * Apply a template to a new venture at Stage 1.
 * Returns structured context to inject into the Stage 1 analysisStep.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId - UUID of the target venture
 * @param {string} templateId - UUID of the template to apply
 * @returns {Promise<{applied: boolean, templateContext: object}>}
 */
async function applyTemplate(supabase, ventureId, templateId) {
  const { data: template, error } = await supabase
    .from('venture_templates')
    .select('*')
    .eq('id', templateId)
    .single();

  if (error) throw new Error(`Failed to query template: ${error.message}`);
  if (!template) return { applied: false, templateContext: {} };

  // Increment usage count
  await supabase
    .from('venture_templates')
    .update({ usage_count: template.usage_count + 1 })
    .eq('id', templateId);

  // Build context for Stage 1 analysis injection
  const templateData = template.template_data || {};
  const templateContext = {
    template_applied: true,
    template_id: templateId,
    template_name: template.template_name,
    template_version: template.template_version,
    effectiveness_score: round2(template.effectiveness_score),

    // Scoring guidance from similar successful venture
    suggested_thresholds: templateData.scoring_thresholds?._summary || null,

    // Architecture patterns to consider
    artifact_patterns: templateData.architecture_patterns || null,

    // DFE calibration hints
    assumption_guidance: templateData.dfe_calibrations
      ? {
          expected_validation_rate: templateData.dfe_calibrations.validation_rate,
          common_calibration_issues: templateData.dfe_calibrations.calibration_reports?.slice(0, 3) || [],
        }
      : null,

    // Pricing model reference
    pricing_reference: templateData.pricing_params || null,

    // GTM channel insights
    gtm_insights: templateData.gtm_effectiveness || null,
  };

  return { applied: true, templateContext };
}

/**
 * Compute domain overlap between two tag arrays.
 * Returns a value 0-1 representing the Jaccard similarity.
 *
 * @param {string[]} tagsA
 * @param {string[]} tagsB
 * @returns {number} 0-1 overlap ratio
 */
function computeDomainOverlap(tagsA, tagsB) {
  if (!tagsA.length && !tagsB.length) return 0;
  if (!tagsA.length || !tagsB.length) return 0;

  const setA = new Set(tagsA.map((t) => t.toLowerCase()));
  const setB = new Set(tagsB.map((t) => t.toLowerCase()));

  let intersection = 0;
  for (const tag of setA) {
    if (setB.has(tag)) intersection++;
  }

  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? round2(intersection / union) : 0;
}

export {
  recommendTemplates,
  applyTemplate,
  computeDomainOverlap,
  MODULE_VERSION,
};
