/**
 * Sub-Agent Selection Logic for Phase Sub-Agent Orchestrator
 * Determines which sub-agents are required based on SD scope and phase
 */

import { selectSubAgentsHybrid } from '../../../lib/context-aware-sub-agent-selector.js';
import { shouldSkipCodeValidation } from '../../../lib/utils/sd-type-validation.js';

/**
 * Check if sub-agent is required based on SD scope
 * Uses hybrid semantic + keyword matching
 * @param {Object} subAgent - Sub-agent definition
 * @param {Object} sd - Strategic Directive
 * @param {string} phase - Current phase
 * @returns {Promise<Object>} Result with required flag and reason
 */
async function isSubAgentRequired(subAgent, sd, phase) {
  const code = subAgent.sub_agent_code || subAgent.code;

  const skipCodeValidation = shouldSkipCodeValidation(sd);

  const alwaysRequired = {
    LEAD_PRE_APPROVAL: ['RISK', 'VALIDATION', 'SECURITY', 'DATABASE', 'DESIGN'],
    PLAN_PRD: ['DATABASE', 'STORIES', 'RISK'],
    PLAN_VERIFY: skipCodeValidation
      ? ['DOCMON', 'STORIES']
      : ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE'],
    LEAD_FINAL: ['RETRO']
  };

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

  try {
    const { recommended, coordinationGroups, matchingStrategy } = await selectSubAgentsHybrid(sd, {
      semanticWeight: 0.6,
      keywordWeight: 0.4,
      combinedThreshold: 0.6,
      useKeywordFallback: true,
      matchCount: 10
    });

    const recommendation = recommended.find(r => r.code === code);

    if (recommendation) {
      const confidencePercent = recommendation.confidence;

      let reason;
      if (matchingStrategy === 'hybrid' && recommendation.semanticScore !== undefined) {
        reason = `Hybrid match (${confidencePercent}%): ${recommendation.semanticScore}% semantic + ${recommendation.keywordScore}% keyword (${recommendation.keywordMatches} keywords)`;
      } else {
        const matchedKeywords = recommendation.matchedKeywords || [];
        const keywordSummary = matchedKeywords.slice(0, 3).join(', ');
        reason = `Keyword match (${confidencePercent}% confidence): ${keywordSummary}${matchedKeywords.length > 3 ? '...' : ''}`;
      }

      return { required: true, reason };
    }

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

    if (code === 'PERFORMANCE' && sd.priority >= 70) {
      return { required: true, reason: 'High priority SD requires performance review' };
    }

    if (code === 'COST' && phase === 'PLAN_VERIFY') {
      const content = `${sd.title || ''} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

      const infraKeywords = [
        'database migration', 'scaling', 'infrastructure', 'cloud', 'serverless',
        'deployment', 'instances', 'storage', 'bandwidth', 'compute',
        'load balancer', 'CDN', 'cache', 'Redis', 'Elasticsearch',
        'S3', 'CloudFront', 'Lambda', 'EC2', 'RDS', 'DynamoDB'
      ];

      const matchedKeywords = infraKeywords.filter(kw => content.includes(kw));

      if (matchedKeywords.length > 0) {
        return {
          required: true,
          reason: `Infrastructure changes detected (${matchedKeywords.slice(0, 3).join(', ')}) - cost analysis required`
        };
      }
    }

    return { required: false, reason: 'Not recommended by context-aware analysis' };

  } catch (error) {
    console.warn(`Context-aware selector failed for ${code}, using fallback: ${error.message}`);

    const scope = (sd.scope || '').toLowerCase();
    const conditionalRequirements = {
      DATABASE: ['database', 'migration', 'schema', 'table'],
      DESIGN: ['ui', 'component', 'design', 'interface', 'page', 'view'],
      SECURITY: ['auth', 'security', 'permission', 'rls', 'encryption'],
      PERFORMANCE: ['performance', 'optimization', 'load', 'scale'],
      VALIDATION: ['integration', 'existing', 'refactor']
    };

    const keywords = conditionalRequirements[code];
    if (keywords) {
      const matches = keywords.some(keyword => scope.includes(keyword));
      if (matches) {
        return { required: true, reason: `Scope contains (fallback): ${keywords.filter(k => scope.includes(k)).join(', ')}` };
      }
    }

    return { required: false, reason: 'Not required based on scope (fallback)' };
  }
}

export { isSubAgentRequired };
