/**
 * Vision/Architecture Traceability Helper
 *
 * Generates traceable success metrics from vision documents and architecture
 * plans. These metrics link SD success measurements back to their originating
 * vision dimensions and architecture plan dimensions, enabling end-to-end
 * traceability from strategic vision to implementation outcomes.
 *
 * Used by:
 * - create-orchestrator-from-plan.js — inject into orchestrator + children
 * - leo-create-sd.js — when --vision-key and --arch-key are provided
 * - success-metrics-achievement.js — identify vision/arch-linked metrics
 */

import dotenv from 'dotenv';

dotenv.config();

/**
 * Generate traceable success metrics from vision and architecture dimensions.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} visionKey - Vision document key (e.g., 'VISION-EHG-L2-001')
 * @param {string} archKey - Architecture plan key (e.g., 'ARCH-EHG-001')
 * @param {Object} [options] - Options
 * @param {string} [options.targetTemplate] - Target value template (default: '>=90%')
 * @returns {Promise<{visionMetrics: Array, archMetrics: Array}>}
 */
export async function generateTraceableMetrics(supabase, visionKey, archKey, options = {}) {
  const { targetTemplate = '>=90%' } = options;
  const visionMetrics = [];
  const archMetrics = [];

  // Load vision dimensions
  if (visionKey) {
    const { data: visionDoc } = await supabase
      .from('eva_vision_documents')
      .select('vision_key, extracted_dimensions')
      .eq('vision_key', visionKey)
      .single();

    if (visionDoc?.extracted_dimensions && Array.isArray(visionDoc.extracted_dimensions)) {
      for (const dim of visionDoc.extracted_dimensions) {
        visionMetrics.push({
          metric: `Vision: ${dim.name} alignment`,
          target: targetTemplate,
          measurement: 'EVA vision score dimension',
          source: `${visionKey}:${dim.name}`,
          traceability: 'vision_dimension'
        });
      }
    }
  }

  // Load architecture dimensions
  if (archKey) {
    const { data: archPlan } = await supabase
      .from('eva_architecture_plans')
      .select('plan_key, extracted_dimensions')
      .eq('plan_key', archKey)
      .single();

    if (archPlan?.extracted_dimensions && Array.isArray(archPlan.extracted_dimensions)) {
      for (const dim of archPlan.extracted_dimensions) {
        archMetrics.push({
          metric: `Architecture: ${dim.name} implementation`,
          target: targetTemplate,
          measurement: 'Architecture dimension coverage',
          source: `${archKey}:${dim.name}`,
          traceability: 'arch_dimension'
        });
      }
    }
  }

  return { visionMetrics, archMetrics };
}

/**
 * Map architecture dimensions to implementation phases based on keyword matching.
 *
 * @param {Array} dimensions - Architecture dimensions array
 * @param {Array} phases - Phase objects with {title, description, scope}
 * @returns {Map<number, Array>} Map of phase index to relevant dimensions
 */
export function mapDimensionsToPhases(dimensions, phases) {
  const phaseMap = new Map();

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const phaseText = `${phase.title || ''} ${phase.description || ''} ${phase.scope || ''}`.toLowerCase();
    const relevant = [];

    for (const dim of dimensions) {
      const dimName = (dim.name || '').toLowerCase().replace(/[_-]/g, ' ');
      const dimWords = dimName.split(/\s+/);

      // Check if any dimension word appears in phase text
      const matches = dimWords.some(word => word.length > 3 && phaseText.includes(word));
      if (matches) {
        relevant.push(dim);
      }
    }

    phaseMap.set(i, relevant);
  }

  return phaseMap;
}
