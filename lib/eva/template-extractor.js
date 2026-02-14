/**
 * Venture Template Extractor
 * SD-EVA-FEAT-VENTURE-TEMPLATES-001 (FR-1, FR-4, FR-8)
 *
 * Extracts reusable templates from ventures that reach Stage 25.
 * Captures scoring thresholds, architecture patterns, DFE trigger
 * calibrations, pricing parameters, and GTM channel effectiveness.
 *
 * Design principles (matching cross-venture-learning.js):
 *   - Pure functions, no side effects in analysis
 *   - Dependency-injected Supabase client
 *   - Deterministic rounding via round2()
 *   - Immutable versioning (new extraction → new version)
 */

import { round2, MIN_VENTURES } from './cross-venture-learning.js';

const MODULE_VERSION = '1.0.0';

/**
 * Extract a reusable template from a venture that has completed Stage 25.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId - UUID of the venture
 * @returns {Promise<{id: string, template_name: string, template_version: number}|null>}
 *   Created template record, or null if venture hasn't reached Stage 25
 */
async function extractTemplate(supabase, ventureId) {
  // 1. Verify venture reached Stage 25
  const { data: venture, error: vErr } = await supabase
    .from('ventures')
    .select('id, name, status, current_lifecycle_stage, domain_tags')
    .eq('id', ventureId)
    .single();

  if (vErr) throw new Error(`Failed to query venture: ${vErr.message}`);
  if (!venture || venture.current_lifecycle_stage < 25) return null;

  // 2. Gather template data from multiple sources
  const [
    scoringThresholds,
    architecturePatterns,
    dfeCalibrations,
    pricingParams,
    gtmEffectiveness,
  ] = await Promise.all([
    extractScoringThresholds(supabase, ventureId),
    extractArchitecturePatterns(supabase, ventureId),
    extractDFECalibrations(supabase, ventureId),
    extractPricingParams(supabase, ventureId),
    extractGTMEffectiveness(supabase, ventureId),
  ]);

  const templateData = {
    scoring_thresholds: scoringThresholds,
    architecture_patterns: architecturePatterns,
    dfe_calibrations: dfeCalibrations,
    pricing_params: pricingParams,
    gtm_effectiveness: gtmEffectiveness,
    source_stage: venture.current_lifecycle_stage,
    extracted_at: new Date().toISOString(),
    extractor_version: MODULE_VERSION,
  };

  // 3. Version management: mark old versions as not current
  const { data: existing } = await supabase
    .from('venture_templates')
    .select('template_version')
    .eq('source_venture_id', ventureId)
    .eq('is_current', true)
    .single();

  const newVersion = existing ? existing.template_version + 1 : 1;

  if (existing) {
    await supabase
      .from('venture_templates')
      .update({ is_current: false })
      .eq('source_venture_id', ventureId)
      .eq('is_current', true);
  }

  // 4. Insert new template version
  const domainTags = venture.domain_tags || [];
  const templateName = `${venture.name} Template v${newVersion}`;

  const { data: created, error: insertErr } = await supabase
    .from('venture_templates')
    .insert({
      source_venture_id: ventureId,
      template_name: templateName,
      template_version: newVersion,
      domain_tags: domainTags,
      template_data: templateData,
      is_current: true,
    })
    .select('id, template_name, template_version')
    .single();

  if (insertErr) throw new Error(`Failed to insert template: ${insertErr.message}`);

  return created;
}

/**
 * Extract scoring thresholds from chairman decisions across all stages.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId
 * @returns {Promise<object>}
 */
async function extractScoringThresholds(supabase, ventureId) {
  const { data: decisions } = await supabase
    .from('chairman_decisions')
    .select('lifecycle_stage, decision, health_score, confidence_score')
    .eq('venture_id', ventureId)
    .order('lifecycle_stage', { ascending: true });

  if (!decisions || decisions.length === 0) return {};

  const thresholds = {};
  for (const d of decisions) {
    thresholds[`stage_${d.lifecycle_stage}`] = {
      decision: d.decision,
      health_score: d.health_score != null ? round2(d.health_score) : null,
      confidence_score: d.confidence_score != null ? round2(d.confidence_score) : null,
    };
  }

  // Compute aggregate stats
  const healthScores = decisions
    .filter((d) => d.health_score != null)
    .map((d) => d.health_score);

  if (healthScores.length > 0) {
    thresholds._summary = {
      avg_health: round2(healthScores.reduce((a, b) => a + b, 0) / healthScores.length),
      min_health: round2(Math.min(...healthScores)),
      max_health: round2(Math.max(...healthScores)),
      proceed_count: decisions.filter((d) => d.decision === 'proceed').length,
      total_decisions: decisions.length,
    };
  }

  return thresholds;
}

/**
 * Extract architecture patterns from venture artifacts.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId
 * @returns {Promise<object>}
 */
async function extractArchitecturePatterns(supabase, ventureId) {
  const { data: artifacts } = await supabase
    .from('venture_artifacts')
    .select('artifact_type, quality_score, lifecycle_stage, content')
    .eq('venture_id', ventureId)
    .eq('is_current', true)
    .order('lifecycle_stage', { ascending: true });

  if (!artifacts || artifacts.length === 0) return {};

  const byType = {};
  for (const a of artifacts) {
    if (!byType[a.artifact_type]) {
      byType[a.artifact_type] = { count: 0, totalQuality: 0, stages: [] };
    }
    byType[a.artifact_type].count += 1;
    if (a.quality_score != null) {
      byType[a.artifact_type].totalQuality += a.quality_score;
    }
    byType[a.artifact_type].stages.push(a.lifecycle_stage);
  }

  const patterns = {};
  for (const [type, data] of Object.entries(byType)) {
    patterns[type] = {
      count: data.count,
      avg_quality: data.count > 0 ? round2(data.totalQuality / data.count) : 0,
      stages: [...new Set(data.stages)].sort((a, b) => a - b),
    };
  }

  return patterns;
}

/**
 * Extract DFE (Decision Filter Engine) calibrations from assumption sets.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId
 * @returns {Promise<object>}
 */
async function extractDFECalibrations(supabase, ventureId) {
  const { data: assumptions } = await supabase
    .from('assumption_sets')
    .select('status, confidence_scores, calibration_report')
    .eq('venture_id', ventureId);

  if (!assumptions || assumptions.length === 0) return {};

  const calibrations = {
    total_sets: assumptions.length,
    validated: assumptions.filter((a) => a.status === 'validated').length,
    invalidated: assumptions.filter((a) => a.status === 'invalidated').length,
    calibration_reports: [],
  };

  for (const a of assumptions) {
    if (a.calibration_report && typeof a.calibration_report === 'object') {
      calibrations.calibration_reports.push(a.calibration_report);
    }
  }

  calibrations.validation_rate = calibrations.total_sets > 0
    ? round2(calibrations.validated / calibrations.total_sets)
    : 0;

  return calibrations;
}

/**
 * Extract pricing parameters from stage outputs.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId
 * @returns {Promise<object>}
 */
async function extractPricingParams(supabase, ventureId) {
  // Pricing is typically captured in Stage 11 (Revenue Model) artifacts
  const { data: artifacts } = await supabase
    .from('venture_artifacts')
    .select('content, quality_score')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 'revenue_model')
    .eq('is_current', true)
    .limit(1)
    .single();

  if (!artifacts || !artifacts.content) return {};

  // Extract structured pricing data if available
  const content = typeof artifacts.content === 'object'
    ? artifacts.content
    : {};

  return {
    model_type: content.model_type || null,
    pricing_tiers: content.pricing_tiers || null,
    unit_economics: content.unit_economics || null,
    quality_score: artifacts.quality_score != null ? round2(artifacts.quality_score) : null,
  };
}

/**
 * Extract GTM (Go-To-Market) channel effectiveness data.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId
 * @returns {Promise<object>}
 */
async function extractGTMEffectiveness(supabase, ventureId) {
  // GTM data is typically in Stage 19-20 artifacts
  const { data: artifacts } = await supabase
    .from('venture_artifacts')
    .select('content, quality_score, lifecycle_stage')
    .eq('venture_id', ventureId)
    .in('artifact_type', ['gtm_strategy', 'channel_analysis', 'marketing_plan'])
    .eq('is_current', true);

  if (!artifacts || artifacts.length === 0) return {};

  const channels = {};
  for (const a of artifacts) {
    const content = typeof a.content === 'object' ? a.content : {};
    if (content.channels && Array.isArray(content.channels)) {
      for (const ch of content.channels) {
        if (ch.name) {
          channels[ch.name] = {
            effectiveness: ch.effectiveness != null ? round2(ch.effectiveness) : null,
            cac: ch.cac != null ? round2(ch.cac) : null,
            stage: a.lifecycle_stage,
          };
        }
      }
    }
  }

  return {
    channels,
    artifact_count: artifacts.length,
  };
}

/**
 * Update effectiveness score for a template based on usage outcomes.
 * Called when a venture that used a template passes Stage 3 or Stage 5 gates.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} templateId - UUID of the template
 * @param {number} outcomeScore - 0-100 score from the gate outcome
 * @returns {Promise<void>}
 */
async function updateEffectivenessScore(supabase, templateId, outcomeScore) {
  const { data: template, error } = await supabase
    .from('venture_templates')
    .select('effectiveness_score, usage_count')
    .eq('id', templateId)
    .single();

  if (error) throw new Error(`Failed to query template: ${error.message}`);
  if (!template) return;

  // Running average: new_avg = (old_avg * count + new_score) / (count + 1)
  const newCount = template.usage_count + 1;
  const newScore = round2(
    (template.effectiveness_score * template.usage_count + outcomeScore) / newCount
  );

  await supabase
    .from('venture_templates')
    .update({
      effectiveness_score: newScore,
      usage_count: newCount,
    })
    .eq('id', templateId);
}

export {
  extractTemplate,
  updateEffectivenessScore,
  extractScoringThresholds,
  extractArchitecturePatterns,
  extractDFECalibrations,
  extractPricingParams,
  extractGTMEffectiveness,
  MODULE_VERSION,
};
