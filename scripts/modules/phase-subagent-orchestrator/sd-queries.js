/**
 * SD Query Functions for Phase Sub-Agent Orchestrator
 * Handles strategic directive lookups and sub-agent queries
 */

import {
  PHASE_SUBAGENT_MAP,
  PLAN_PRD_BY_SD_TYPE,
  PLAN_VERIFY_BY_SD_TYPE,
  REFACTOR_INTENSITY_SUBAGENTS,
  SCHEMA_KEYWORDS
} from './phase-config.js';
import { shouldSkipCodeValidation } from '../../lib/utils/sd-type-validation.js';

/**
 * Query SD details from database
 * Supports UUID, legacy_id, and sd_key lookups
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - SD identifier
 * @returns {Promise<Object>} SD details
 */
async function getSDDetails(supabase, sdId) {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sdId);

  let data, error;

  if (isUUID) {
    const result = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .maybeSingle();
    data = result.data;
    error = result.error;
  } else {
    const idResult = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .maybeSingle();

    if (idResult.data) {
      data = idResult.data;
      error = idResult.error;
    } else {
      const legacyResult = await supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('legacy_id', sdId)
        .maybeSingle();

      if (legacyResult.data) {
        data = legacyResult.data;
        error = legacyResult.error;
      } else {
        const keyResult = await supabase
          .from('strategic_directives_v2')
          .select('*')
          .eq('sd_key', sdId)
          .maybeSingle();
        data = keyResult.data;
        error = keyResult.error;
      }
    }
  }

  if (error) {
    throw new Error(`Failed to get SD details: ${error.message}`);
  }

  if (!data) {
    throw new Error(`SD not found: ${sdId}`);
  }

  return data;
}

/**
 * Query sub-agents from database filtered by phase
 * @param {Object} supabase - Supabase client
 * @param {string} phase - Phase name
 * @returns {Promise<Array>} Filtered sub-agents
 */
async function getPhaseSubAgents(supabase, phase) {
  const { data, error } = await supabase
    .from('leo_sub_agents')
    .select('*')
    .eq('active', true)
    .order('priority', { ascending: false });

  if (error) {
    throw new Error(`Failed to query sub-agents: ${error.message}`);
  }

  const phaseAgentCodes = PHASE_SUBAGENT_MAP[phase] || [];

  return data.filter(sa => {
    const code = sa.code || sa.sub_agent_code;
    return phaseAgentCodes.includes(code);
  });
}

/**
 * Get phase sub-agents with SD type awareness
 * @param {Object} supabase - Supabase client
 * @param {string} phase - Phase name
 * @param {Object} sd - Strategic Directive object
 * @returns {Promise<Array>} Filtered sub-agents
 */
async function getPhaseSubAgentsForSd(supabase, phase, sd) {
  const { data, error } = await supabase
    .from('leo_sub_agents')
    .select('*')
    .eq('active', true)
    .order('priority', { ascending: false });

  if (error) {
    throw new Error(`Failed to query sub-agents: ${error.message}`);
  }

  let phaseAgentCodes;
  const sdType = sd.sd_type || 'feature';

  if (phase === 'PLAN_VERIFY') {
    const skipCode = shouldSkipCodeValidation(sd);

    if (sdType === 'refactor' && sd.intensity_level) {
      phaseAgentCodes = REFACTOR_INTENSITY_SUBAGENTS[sd.intensity_level] || PLAN_VERIFY_BY_SD_TYPE.refactor;
      console.log(`   SD Type: ${sdType} (intensity: ${sd.intensity_level})`);
      console.log(`   Using intensity-aware PLAN_VERIFY sub-agents: ${phaseAgentCodes.join(', ')}`);
    } else if (skipCode) {
      phaseAgentCodes = PLAN_VERIFY_BY_SD_TYPE[sdType] || PLAN_VERIFY_BY_SD_TYPE.documentation;
      console.log(`   SD Type: ${sdType} (skip code validation: YES)`);
      console.log(`   Using reduced PLAN_VERIFY sub-agents: ${phaseAgentCodes.join(', ')}`);
    } else {
      phaseAgentCodes = PLAN_VERIFY_BY_SD_TYPE[sdType] || PHASE_SUBAGENT_MAP[phase];
      console.log(`   SD Type: ${sdType} (skip code validation: NO)`);
      console.log(`   Using full PLAN_VERIFY sub-agents: ${phaseAgentCodes.join(', ')}`);
    }
  } else if (phase === 'PLAN_PRD') {
    phaseAgentCodes = PLAN_PRD_BY_SD_TYPE[sdType] || PHASE_SUBAGENT_MAP[phase];

    const sdContent = [
      sd.title || '',
      sd.description || '',
      sd.scope || '',
      sd.rationale || ''
    ].join(' ').toLowerCase();

    const hasSchemaContent = SCHEMA_KEYWORDS.some(kw => sdContent.includes(kw));

    if (hasSchemaContent && !phaseAgentCodes.includes('DATABASE')) {
      console.log('   Schema keywords detected - adding DATABASE sub-agent');
      phaseAgentCodes = [...phaseAgentCodes, 'DATABASE'];
    }

    console.log(`   SD Type: ${sdType}${hasSchemaContent ? ' (schema detected)' : ''}`);
    console.log(`   Using PLAN_PRD sub-agents: ${phaseAgentCodes.join(', ')}`);
  } else {
    phaseAgentCodes = PHASE_SUBAGENT_MAP[phase] || [];
  }

  return data.filter(sa => {
    const code = sa.code || sa.sub_agent_code;
    return phaseAgentCodes.includes(code);
  });
}

export {
  getSDDetails,
  getPhaseSubAgents,
  getPhaseSubAgentsForSd
};
