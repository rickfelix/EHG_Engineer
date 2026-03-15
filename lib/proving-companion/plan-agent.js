/**
 * Plan Agent — queries vision/arch docs by stage range.
 * Returns planned_capabilities, expected_files, success_criteria per stage.
 * Pure DB queries: zero LLM cost.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { getStageRange } from './stage-config.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Query vision and architecture docs for a stage range
 * @param {number} fromStage
 * @param {number} toStage
 * @returns {object} map of stage number to plan data
 */
export async function getPlan(fromStage, toStage) {
  const stageConfigs = getStageRange(fromStage, toStage);
  const results = {};

  // Fetch vision docs that reference any of the vision keys
  const allVisionKeys = Object.values(stageConfigs)
    .flatMap(c => c.visionKeys)
    .filter(Boolean);

  const { data: visionDocs } = await supabase
    .from('eva_vision_documents')
    .select('vision_key, content, sections, extracted_dimensions')
    .in('vision_key', allVisionKeys.length > 0 ? allVisionKeys : ['__none__']);

  // Fetch architecture plans
  const allArchPhases = [...new Set(Object.values(stageConfigs).flatMap(c => c.archPhases))];
  const { data: archPlans } = await supabase
    .from('eva_architecture_plans')
    .select('plan_key, content, sections, extracted_dimensions')
    .limit(10);

  // Build per-stage plan
  for (const [stageNum, config] of Object.entries(stageConfigs)) {
    const relevantVisions = (visionDocs || []).filter(v =>
      config.visionKeys.some(k => v.vision_key?.toLowerCase().includes(k))
    );

    const plannedCapabilities = relevantVisions.flatMap(v => {
      if (v.extracted_dimensions && Array.isArray(v.extracted_dimensions)) {
        return v.extracted_dimensions.map(d => d.name || d.dimension || String(d));
      }
      return [];
    });

    results[stageNum] = {
      stage_number: parseInt(stageNum),
      stage_name: config.name,
      planned_capabilities: plannedCapabilities,
      expected_files: config.filePatterns,
      success_criteria: extractSuccessCriteria(relevantVisions, archPlans, config),
      vision_coverage: relevantVisions.length,
      arch_coverage: (archPlans || []).length
    };
  }

  return results;
}

function extractSuccessCriteria(visions, archPlans, stageConfig) {
  const criteria = [];

  // From vision docs
  for (const v of visions) {
    if (v.sections?.success_criteria) {
      criteria.push(...ensureArray(v.sections.success_criteria));
    }
  }

  // From arch plans — match by phase
  for (const a of (archPlans || [])) {
    if (a.sections?.implementation_phases) {
      const phases = a.sections.implementation_phases;
      if (typeof phases === 'string' && stageConfig.archPhases.some(p => phases.includes(p))) {
        criteria.push(`Architecture phase coverage: ${stageConfig.archPhases.join(', ')}`);
      }
    }
  }

  // Default if empty
  if (criteria.length === 0) {
    criteria.push(`Stage ${stageConfig.name} implementation exists`);
  }

  return criteria;
}

function ensureArray(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') return [val];
  return [];
}
