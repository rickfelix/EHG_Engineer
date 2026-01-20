/**
 * Sub-Agent Selection
 *
 * Functions for querying SD details and selecting appropriate sub-agents
 * based on phase, SD type, and content analysis.
 *
 * Extracted from orchestrate-phase-subagents.js for maintainability.
 * Part of SD-LEO-REFACTOR-ORCH-001
 */

import { selectSubAgentsHybrid } from '../../../lib/context-aware-sub-agent-selector.js';
import { shouldSkipCodeValidation } from '../../../lib/utils/sd-type-validation.js';
import {
  PHASE_SUBAGENT_MAP,
  PLAN_PRD_BY_SD_TYPE,
  PLAN_VERIFY_BY_SD_TYPE,
  REFACTOR_INTENSITY_SUBAGENTS,
  ALWAYS_REQUIRED_BY_PHASE,
  SCHEMA_KEYWORDS,
  INFRASTRUCTURE_KEYWORDS,
  CONDITIONAL_REQUIREMENTS
} from './phase-subagent-config.js';

/**
 * Query SD details from database
 * SD-VENTURE-STAGE0-UI-001: Support UUID, legacy_id, and sd_key lookups
 *
 * @param {string} sdId - SD identifier (UUID, legacy_id, or sd_key)
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object>} - SD data
 */
export async function getSDDetails(sdId, supabase) {
  // Check if sdId is a UUID
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sdId);

  let data, error;

  if (isUUID) {
    // Direct UUID lookup
    const result = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .maybeSingle();
    data = result.data;
    error = result.error;
  } else {
    // Try id column first even if not UUID format (some SDs use string IDs like SD-EHG-001)
    const idResult = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .maybeSingle();

    if (idResult.data) {
      data = idResult.data;
      error = idResult.error;
    } else {
      // Try legacy_id first, then sd_key
      const legacyResult = await supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('legacy_id', sdId)
        .maybeSingle();

      if (legacyResult.data) {
        data = legacyResult.data;
        error = legacyResult.error;
      } else {
        // Try sd_key if legacy_id not found
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
 *
 * @param {string} phase - Phase name
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object[]>} - Filtered sub-agents
 */
export async function getPhaseSubAgents(phase, supabase) {
  const { data, error } = await supabase
    .from('leo_sub_agents')
    .select('*')
    .eq('active', true)
    .order('priority', { ascending: false });

  if (error) {
    throw new Error(`Failed to query sub-agents: ${error.message}`);
  }

  // Get sub-agent codes for this phase from hardcoded map
  const phaseAgentCodes = PHASE_SUBAGENT_MAP[phase] || [];

  // Filter sub-agents by codes defined for this phase
  return data.filter(sa => {
    const code = sa.code || sa.sub_agent_code;
    return phaseAgentCodes.includes(code);
  });
}

/**
 * Get phase sub-agents with SD type awareness
 * SD-TECH-DEBT-DOCS-001: Documentation-only SDs skip TESTING/GITHUB
 *
 * @param {string} phase - Phase name
 * @param {Object} sd - Strategic Directive object
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object[]>} Filtered sub-agents
 */
export async function getPhaseSubAgentsForSd(phase, sd, supabase) {
  const { data, error } = await supabase
    .from('leo_sub_agents')
    .select('*')
    .eq('active', true)
    .order('priority', { ascending: false });

  if (error) {
    throw new Error(`Failed to query sub-agents: ${error.message}`);
  }

  // For PLAN_VERIFY and PLAN_PRD, use sd_type-aware mapping
  let phaseAgentCodes;
  const sdType = sd.sd_type || 'feature';

  if (phase === 'PLAN_VERIFY') {
    const skipCode = shouldSkipCodeValidation(sd);

    // LEO Protocol v4.3.3: Intensity-aware sub-agent selection for refactor SDs
    if (sdType === 'refactor' && sd.intensity_level) {
      phaseAgentCodes = REFACTOR_INTENSITY_SUBAGENTS[sd.intensity_level] || PLAN_VERIFY_BY_SD_TYPE.refactor;
      console.log(`   SD Type: ${sdType} (intensity: ${sd.intensity_level})`);
      console.log(`   Using intensity-aware PLAN_VERIFY sub-agents: ${phaseAgentCodes.join(', ')}`);
    } else if (skipCode) {
      // Use reduced validation for documentation/non-code SDs
      phaseAgentCodes = PLAN_VERIFY_BY_SD_TYPE[sdType] || PLAN_VERIFY_BY_SD_TYPE.documentation;
      console.log(`   SD Type: ${sdType} (skip code validation: YES)`);
      console.log(`   Using reduced PLAN_VERIFY sub-agents: ${phaseAgentCodes.join(', ')}`);
    } else {
      // Use full validation for code-impacting SDs
      phaseAgentCodes = PLAN_VERIFY_BY_SD_TYPE[sdType] || PHASE_SUBAGENT_MAP[phase];
      console.log(`   SD Type: ${sdType} (skip code validation: NO)`);
      console.log(`   Using full PLAN_VERIFY sub-agents: ${phaseAgentCodes.join(', ')}`);
    }
  } else if (phase === 'PLAN_PRD') {
    // LEO Protocol v4.4.1: SD type-aware PLAN_PRD sub-agent selection
    phaseAgentCodes = PLAN_PRD_BY_SD_TYPE[sdType] || PHASE_SUBAGENT_MAP[phase];

    // Schema keyword detection for DATABASE auto-invocation
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
    // For other phases, use standard mapping
    phaseAgentCodes = PHASE_SUBAGENT_MAP[phase] || [];
  }

  // Filter sub-agents by codes defined for this phase
  return data.filter(sa => {
    const code = sa.code || sa.sub_agent_code;
    return phaseAgentCodes.includes(code);
  });
}

/**
 * Check if sub-agent is required based on SD scope
 * PHASE 4 ENHANCEMENT: Now uses hybrid semantic + keyword matching
 * SD-TECH-DEBT-DOCS-001: Now sd_type-aware for PLAN_VERIFY phase
 *
 * @param {Object} subAgent - Sub-agent definition
 * @param {Object} sd - Strategic Directive
 * @param {string} phase - Current phase
 * @returns {Promise<Object>} - { required: boolean, reason: string }
 */
export async function isSubAgentRequired(subAgent, sd, phase) {
  const code = subAgent.sub_agent_code || subAgent.code;

  // SD-TECH-DEBT-DOCS-001: Check if this is a non-code SD
  const skipCodeValidation = shouldSkipCodeValidation(sd);

  // Always required sub-agents per phase (MANDATORY regardless of content)
  const alwaysRequired = {
    ...ALWAYS_REQUIRED_BY_PHASE,
    // PLAN_VERIFY is now dynamic based on sd_type
    PLAN_VERIFY: skipCodeValidation
      ? ['DOCMON', 'STORIES']  // Documentation-only SDs: skip TESTING, GITHUB
      : ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE']
  };

  // Check if sub-agent should be SKIPPED for documentation-only SDs
  if (skipCodeValidation && phase === 'PLAN_VERIFY') {
    if (['TESTING', 'GITHUB'].includes(code)) {
      return {
        required: false,
        reason: `Skipped for documentation-only SD (sd_type=${sd.sd_type || 'detected'})`
      };
    }
  }

  if (alwaysRequired[phase]?.includes(code)) {
    return { required: true, reason: 'Always required for this phase' };
  }

  // Use hybrid selector (semantic + keyword) for intelligent matching
  try {
    const { recommended, coordinationGroups, matchingStrategy } = await selectSubAgentsHybrid(sd, {
      semanticWeight: 0.6,
      keywordWeight: 0.4,
      combinedThreshold: 0.6,
      useKeywordFallback: true,
      matchCount: 10
    });

    // Check if this sub-agent is recommended
    const recommendation = recommended.find(r => r.code === code);

    if (recommendation) {
      const confidencePercent = recommendation.confidence;

      // Build reason based on matching strategy
      let reason;
      if (matchingStrategy === 'hybrid' && recommendation.semanticScore !== undefined) {
        reason = `Hybrid match (${confidencePercent}%): ${recommendation.semanticScore}% semantic + ${recommendation.keywordScore}% keyword (${recommendation.keywordMatches} keywords)`;
      } else {
        // Fallback or keyword-only
        const matchedKeywords = recommendation.matchedKeywords || [];
        const keywordSummary = matchedKeywords.slice(0, 3).join(', ');
        reason = `Keyword match (${confidencePercent}% confidence): ${keywordSummary}${matchedKeywords.length > 3 ? '...' : ''}`;
      }

      return { required: true, reason };
    }

    // Check if sub-agent is part of a coordination group
    const inCoordination = coordinationGroups && coordinationGroups.some(group =>
      group.agents.includes(code)
    );

    if (inCoordination) {
      const group = coordinationGroups.find(g => g.agents.includes(code));
      return {
        required: true,
        reason: `Required by coordination group: ${group.groupName} (${group.keywordMatches} keyword matches)`
      };
    }

    // High priority SDs still get performance review (legacy rule)
    if (code === 'PERFORMANCE' && sd.priority >= 70) {
      return { required: true, reason: 'High priority SD requires performance review' };
    }

    // Smart COST agent triggering - auto-detect infrastructure changes
    if (code === 'COST' && phase === 'PLAN_VERIFY') {
      const content = `${sd.title || ''} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();
      const matchedKeywords = INFRASTRUCTURE_KEYWORDS.filter(kw => content.includes(kw.toLowerCase()));

      if (matchedKeywords.length > 0) {
        return {
          required: true,
          reason: `Infrastructure changes detected (${matchedKeywords.slice(0, 3).join(', ')}) - cost analysis required`
        };
      }
    }

    return { required: false, reason: 'Not recommended by context-aware analysis' };

  } catch (error) {
    // Fallback to legacy simple matching if selector fails
    console.warn(`   Context-aware selector failed for ${code}, using fallback: ${error.message}`);

    const scope = (sd.scope || '').toLowerCase();
    const keywords = CONDITIONAL_REQUIREMENTS[code];

    if (keywords) {
      const matches = keywords.some(keyword => scope.includes(keyword));
      if (matches) {
        return { required: true, reason: `Scope contains (fallback): ${keywords.filter(k => scope.includes(k)).join(', ')}` };
      }
    }

    return { required: false, reason: 'Not required based on scope (fallback)' };
  }
}
