/**
 * SD Query Functions for Phase Sub-Agent Orchestrator
 * Handles strategic directive lookups and sub-agent queries
 *
 * SD-LEO-INFRA-SUBAGENT-ORCHESTRATION-001: Added database-driven sub-agent requirements
 */

import {
  PHASE_SUBAGENT_MAP,
  PLAN_PRD_BY_SD_TYPE,
  PLAN_VERIFY_BY_SD_TYPE,
  REFACTOR_INTENSITY_SUBAGENTS,
  SCHEMA_KEYWORDS
} from './phase-config.js';
import { shouldSkipCodeValidation } from '../../../lib/utils/sd-type-validation.js';

/**
 * Map code phase names to database phase keys
 * Database uses simplified keys: LEAD, PLAN, EXEC
 * Code uses granular phases: LEAD_PRE_APPROVAL, PLAN_PRD, etc.
 */
const PHASE_TO_DB_KEY = {
  LEAD_PRE_APPROVAL: 'LEAD',
  PLAN_PRD: 'PLAN',
  EXEC_IMPL: 'EXEC',
  PLAN_VERIFY: 'PLAN',  // PLAN_VERIFY uses PLAN requirements
  LEAD_FINAL: 'LEAD'    // LEAD_FINAL uses LEAD requirements
};

/**
 * Query required sub-agents from sd_type_validation_profiles
 * SD-LEO-INFRA-SUBAGENT-ORCHESTRATION-001: US-002
 * @param {Object} supabase - Supabase client
 * @param {string} sdType - SD type (feature, infrastructure, etc.)
 * @param {string} phase - Phase name (LEAD_PRE_APPROVAL, PLAN_PRD, etc.)
 * @returns {Promise<string[]>} Array of required sub-agent codes
 */
async function getRequiredSubAgentsFromProfile(supabase, sdType, phase) {
  const dbPhaseKey = PHASE_TO_DB_KEY[phase];
  if (!dbPhaseKey) {
    console.log(`   No DB phase mapping for ${phase}, using fallback`);
    return null;
  }

  const { data, error } = await supabase
    .from('sd_type_validation_profiles')
    .select('required_sub_agents')
    .eq('sd_type', sdType)
    .maybeSingle();

  if (error) {
    console.warn(`   Warning: Failed to query validation profile: ${error.message}`);
    return null;
  }

  if (!data || !data.required_sub_agents) {
    console.log(`   No validation profile found for sd_type: ${sdType}`);
    return null;
  }

  const phaseRequirements = data.required_sub_agents[dbPhaseKey];
  if (!phaseRequirements || !Array.isArray(phaseRequirements)) {
    console.log(`   No ${dbPhaseKey} requirements in profile for ${sdType}`);
    return [];
  }

  return phaseRequirements;
}

/**
 * Query SD details from database
 * SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id (column dropped 2026-01-24)
 * Supports UUID and sd_key lookups
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
      // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id, use only sd_key (column dropped 2026-01-24)
      const keyResult = await supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('sd_key', sdId)
        .maybeSingle();
      data = keyResult.data;
      error = keyResult.error;
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
 * SD-LEO-INFRA-SUBAGENT-ORCHESTRATION-001: Prioritizes database-driven requirements
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

  // SD-LEO-INFRA-SUBAGENT-ORCHESTRATION-001: Try database-driven requirements first
  const dbRequirements = await getRequiredSubAgentsFromProfile(supabase, sdType, phase);

  if (dbRequirements !== null && dbRequirements.length > 0) {
    // Database has requirements for this SD type and phase
    phaseAgentCodes = [...dbRequirements];
    console.log(`   SD Type: ${sdType} (database-driven)`);
    console.log(`   Required sub-agents from profile: ${phaseAgentCodes.join(', ')}`);

    // Still apply schema detection for PLAN phases
    if (phase === 'PLAN_PRD' || phase === 'PLAN_VERIFY') {
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
    }
  } else if (phase === 'PLAN_VERIFY') {
    // Fallback to hardcoded maps for PLAN_VERIFY
    const skipCode = shouldSkipCodeValidation(sd);

    if (sdType === 'refactor' && sd.intensity_level) {
      phaseAgentCodes = REFACTOR_INTENSITY_SUBAGENTS[sd.intensity_level] || PLAN_VERIFY_BY_SD_TYPE.refactor;
      console.log(`   SD Type: ${sdType} (intensity: ${sd.intensity_level}) [fallback]`);
      console.log(`   Using intensity-aware PLAN_VERIFY sub-agents: ${phaseAgentCodes.join(', ')}`);
    } else if (skipCode) {
      phaseAgentCodes = PLAN_VERIFY_BY_SD_TYPE[sdType] || PLAN_VERIFY_BY_SD_TYPE.documentation;
      console.log(`   SD Type: ${sdType} (skip code validation: YES) [fallback]`);
      console.log(`   Using reduced PLAN_VERIFY sub-agents: ${phaseAgentCodes.join(', ')}`);
    } else {
      phaseAgentCodes = PLAN_VERIFY_BY_SD_TYPE[sdType] || PHASE_SUBAGENT_MAP[phase];
      console.log(`   SD Type: ${sdType} (skip code validation: NO) [fallback]`);
      console.log(`   Using full PLAN_VERIFY sub-agents: ${phaseAgentCodes.join(', ')}`);
    }
  } else if (phase === 'PLAN_PRD') {
    // Fallback to hardcoded maps for PLAN_PRD
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

    console.log(`   SD Type: ${sdType}${hasSchemaContent ? ' (schema detected)' : ''} [fallback]`);
    console.log(`   Using PLAN_PRD sub-agents: ${phaseAgentCodes.join(', ')}`);
  } else {
    // Fallback for other phases
    phaseAgentCodes = PHASE_SUBAGENT_MAP[phase] || [];
    console.log(`   Using fallback phase map for ${phase}: ${phaseAgentCodes.join(', ')}`);
  }

  return data.filter(sa => {
    const code = sa.code || sa.sub_agent_code;
    return phaseAgentCodes.includes(code);
  });
}

export {
  getSDDetails,
  getPhaseSubAgents,
  getPhaseSubAgentsForSd,
  getRequiredSubAgentsFromProfile,
  PHASE_TO_DB_KEY
};
