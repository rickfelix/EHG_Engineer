/**
 * LLM-Powered User Story Generator
 * SD-LEO-ENH-LLM-POWERED-USER-001: Replace template-based generation with semantic LLM understanding
 * SD-LEO-INFRA-CONTEXT-AWARE-LLM-001A: Context enrichment with SD type, hierarchy, personas
 *
 * Uses Claude API to generate high-quality user stories with:
 * - Semantic understanding of PRD requirements
 * - SD-type-aware persona selection (infrastructure allows technical personas)
 * - Hierarchical context (parent SD objectives flow to children)
 * - Specific, testable acceptance criteria
 * - Automatic gap detection for missing requirements
 * - Fallback to rule-based generation on failure
 *
 * @module llm-story-generator
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getForbiddenPersonasSync } from '../../../persona-config-provider.js';
import { getLLMClient } from '../../../llm/client-factory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../../../.env') });

// LLM configuration
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 2;

/**
 * SD Type to allowed persona mapping
 * Infrastructure/documentation SDs can use technical personas
 * Feature/bugfix SDs require business personas
 */
const SD_TYPE_PERSONA_RULES = {
  infrastructure: {
    allowTechnical: true,
    suggestedPersonas: ['LEO Protocol operator', 'Platform engineer', 'DevOps engineer', 'System administrator'],
    forbiddenPersonas: []
  },
  documentation: {
    allowTechnical: true,
    suggestedPersonas: ['Documentation reader', 'Developer', 'Technical writer', 'API consumer'],
    forbiddenPersonas: []
  },
  refactor: {
    allowTechnical: true,
    suggestedPersonas: ['Code maintainer', 'Developer', 'Platform engineer'],
    forbiddenPersonas: []
  },
  feature: {
    allowTechnical: false,
    suggestedPersonas: ['Platform User', 'Portfolio Manager', 'Business Analyst', 'Chairman'],
    forbiddenPersonas: ['developer', 'engineer', 'dba', 'admin', 'ops', 'devops', 'sysadmin']
  },
  bugfix: {
    allowTechnical: false,
    suggestedPersonas: ['Platform User', 'Affected user', 'End user'],
    forbiddenPersonas: ['developer', 'engineer', 'dba', 'admin', 'ops', 'devops', 'sysadmin']
  },
  security: {
    allowTechnical: false,
    suggestedPersonas: ['Platform User', 'System user', 'Authenticated user'],
    forbiddenPersonas: ['developer', 'engineer', 'dba', 'admin', 'ops', 'devops', 'sysadmin']
  },
  database: {
    allowTechnical: true,
    suggestedPersonas: ['Database administrator', 'Data architect', 'Platform engineer'],
    forbiddenPersonas: []
  }
};

/**
 * Normalize SD context into a structured format for prompt enrichment
 * @param {Object} sdContext - Raw SD context from caller
 * @returns {Object} Normalized SD context
 */
export function normalizeSdContext(sdContext) {
  if (!sdContext) {
    return null;
  }

  const normalized = {
    sdKey: sdContext.sd_key || sdContext.sdKey || null,
    sdType: (sdContext.sd_type || sdContext.sdType || 'feature').toLowerCase(),
    category: sdContext.category || null,
    targetApplication: sdContext.target_application || sdContext.targetApplication || 'Unknown',
    title: sdContext.title || null,
    summary: sdContext.executive_summary || sdContext.summary || null,
    hierarchy: {
      parentSdKey: sdContext.parent_sd_id || sdContext.parentSdKey || null,
      parentTitle: sdContext.parent_title || sdContext.parentTitle || null,
      parentObjectives: sdContext.parent_strategic_objectives || sdContext.parentObjectives || [],
      isChild: !!(sdContext.parent_sd_id || sdContext.parentSdKey)
    },
    personas: getPersonaRulesForSdType(
      sdContext.sd_type || sdContext.sdType || 'feature',
      sdContext.target_application || sdContext.targetApplication
    )
  };

  return normalized;
}

/**
 * Get persona rules based on SD type and target application
 * SD-MAN-GEN-TITLE-TARGET-APPLICATION-001: Now app-aware
 *
 * @param {string} sdType - The SD type
 * @param {string} [targetApp] - Target application for app-aware rules
 * @returns {Object} Persona rules for the SD type
 */
function getPersonaRulesForSdType(sdType, targetApp) {
  const type = (sdType || 'feature').toLowerCase();
  const baseRules = SD_TYPE_PERSONA_RULES[type] || SD_TYPE_PERSONA_RULES.feature;

  // If target app is provided, use database-driven forbidden list
  if (targetApp) {
    const appForbidden = getForbiddenPersonasSync(targetApp, type);
    return {
      ...baseRules,
      allowTechnical: appForbidden.length === 0 || baseRules.allowTechnical,
      forbiddenPersonas: appForbidden
    };
  }

  return baseRules;
}

/**
 * LLM Story Generator class
 * Handles Claude API integration for user story generation
 */
export class LLMStoryGenerator {
  constructor(options = {}) {
    this.timeout = options.timeout || DEFAULT_TIMEOUT;
    this.enabled = true; // Factory handles availability
    this.phase = options.phase || 'PLAN'; // Default to PLAN phase for story generation
  }

  /**
   * Check if LLM generation is available
   * @returns {boolean} Whether LLM generation is enabled
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Generate user stories from PRD acceptance criteria using LLM
   * @param {Array} acceptanceCriteria - Array of acceptance criteria strings
   * @param {Object} prd - The PRD object for context
   * @param {Object} options - Generation options
   * @param {Object} sdContext - Optional SD context for enriched generation
   * @returns {Promise<Object>} Generated stories and detected gaps
   */
  async generateStoriesFromCriteria(acceptanceCriteria, prd, options = {}, sdContext = null) {
    if (!this.isEnabled()) {
      return { success: false, reason: 'LLM not enabled', stories: [], gaps: [] };
    }

    const sdKey = options.sdKey || 'unknown';
    const normalizedContext = normalizeSdContext(sdContext);

    if (normalizedContext) {
      console.log(`   [LLM] Generating stories for ${acceptanceCriteria.length} criteria (SD type: ${normalizedContext.sdType})...`);
    } else {
      console.log(`   [LLM] Generating stories for ${acceptanceCriteria.length} criteria...`);
    }

    try {
      const prompt = this.buildStoryGenerationPrompt(acceptanceCriteria, prd, normalizedContext);

      const response = await this.callClaude(prompt, {
        maxTokens: 4000,
        temperature: 0.3, // Lower temperature for more consistent output
      });

      const result = this.parseStoryResponse(response, acceptanceCriteria, sdKey, normalizedContext);

      console.log(`   [LLM] Generated ${result.stories.length} stories, found ${result.gaps.length} gaps`);

      return {
        success: true,
        stories: result.stories,
        gaps: result.gaps,
        rawResponse: response,
        sdContext: normalizedContext,
      };
    } catch (error) {
      console.log(`   [LLM] Generation failed: ${error.message}`);
      return {
        success: false,
        reason: error.message,
        stories: [],
        gaps: [],
      };
    }
  }

  /**
   * Generate a single user story with enhanced context
   * @param {string} criterion - The acceptance criterion
   * @param {Object} prd - The PRD object
   * @param {number} index - Story index
   * @param {Object} sdContext - Optional SD context for enriched generation
   * @returns {Promise<Object>} Generated story content
   */
  async generateSingleStory(criterion, prd, index, sdContext = null) {
    if (!this.isEnabled()) {
      return null;
    }

    const normalizedContext = normalizeSdContext(sdContext);

    try {
      const prompt = this.buildSingleStoryPrompt(criterion, prd, index, normalizedContext);

      const response = await this.callClaude(prompt, {
        maxTokens: 1500,
        temperature: 0.3,
      });

      return this.parseSingleStoryResponse(response, criterion, index, normalizedContext);
    } catch (error) {
      console.log(`   [LLM] Single story generation failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Detect gaps in requirements
   * @param {Array} acceptanceCriteria - Acceptance criteria to analyze
   * @param {Object} prd - PRD context
   * @returns {Promise<Array>} Detected gaps
   */
  async detectRequirementGaps(acceptanceCriteria, prd) {
    if (!this.isEnabled()) {
      return [];
    }

    try {
      const prompt = this.buildGapDetectionPrompt(acceptanceCriteria, prd);

      const response = await this.callClaude(prompt, {
        maxTokens: 2000,
        temperature: 0.5, // Slightly higher for creative gap detection
      });

      return this.parseGapResponse(response);
    } catch (error) {
      console.log(`   [LLM] Gap detection failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Build prompt for batch story generation
   * @param {Array} acceptanceCriteria - Acceptance criteria to convert
   * @param {Object} prd - PRD object
   * @param {Object} sdContext - Normalized SD context (optional)
   */
  buildStoryGenerationPrompt(acceptanceCriteria, prd, sdContext = null) {
    const prdContext = prd ? `
PRD Title: ${prd.title || 'Unknown'}
PRD Summary: ${prd.executive_summary || 'No summary available'}
Target Application: ${prd.target_application || 'Unknown'}
` : 'No PRD context available.';

    // Build SD context section if available
    let sdContextSection = '';
    let personaGuidance = '';

    if (sdContext) {
      sdContextSection = `
## Strategic Directive Context:
SD Key: ${sdContext.sdKey || 'Unknown'}
SD Type: ${sdContext.sdType}
Category: ${sdContext.category || 'Not specified'}
Target Application: ${sdContext.targetApplication}
`;

      // Add hierarchy context if this is a child SD
      if (sdContext.hierarchy.isChild) {
        sdContextSection += `
Parent SD: ${sdContext.hierarchy.parentSdKey || 'Unknown'}
Parent Title: ${sdContext.hierarchy.parentTitle || 'Not specified'}
`;
        if (sdContext.hierarchy.parentObjectives && sdContext.hierarchy.parentObjectives.length > 0) {
          sdContextSection += `Parent Strategic Objectives:\n${sdContext.hierarchy.parentObjectives.map(o => `  - ${o}`).join('\n')}\n`;
        }
      }

      // Build persona guidance based on SD type
      const personas = sdContext.personas;
      if (personas.allowTechnical) {
        personaGuidance = `
## Persona Guidance (${sdContext.sdType} SD):
This is a ${sdContext.sdType} SD which ALLOWS technical personas.
Suggested personas: ${personas.suggestedPersonas.join(', ')}
You MAY use technical roles like developer, engineer, DBA, operator when appropriate.`;
      } else {
        personaGuidance = `
## Persona Guidance (${sdContext.sdType} SD):
This is a ${sdContext.sdType} SD which requires BUSINESS personas.
Suggested personas: ${personas.suggestedPersonas.join(', ')}
FORBIDDEN personas: ${personas.forbiddenPersonas.join(', ')}
Do NOT use technical roles - focus on end-user business value.`;
      }
    } else {
      // Default guidance when no SD context
      personaGuidance = `
## Persona Guidance:
Use business-focused user roles (NOT developer/engineer/DBA - use business roles like "Platform User", "Portfolio Manager", "Business Analyst").`;
    }

    return `You are a senior product manager creating user stories from acceptance criteria.

${prdContext}
${sdContextSection}
${personaGuidance}

## Acceptance Criteria to Convert:
${acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## Instructions:
For each acceptance criterion, generate a user story with:
1. **title**: Clear, action-oriented title (not just repeating the criterion)
2. **user_role**: The appropriate persona based on the guidance above
3. **user_want**: What the user wants to accomplish (start with action verb)
4. **user_benefit**: The business/technical value - why this matters
5. **acceptance_criteria**: Array of 2-4 specific, testable criteria in Given-When-Then format
6. **story_points**: Complexity estimate (1, 2, 3, 5, 8, or 13)

Also identify any GAPS - missing requirements like:
- Error handling not specified
- Edge cases not covered
- Performance requirements missing
- Security considerations absent

## Output Format (JSON):
{
  "stories": [
    {
      "criterion_index": 0,
      "title": "...",
      "user_role": "...",
      "user_want": "...",
      "user_benefit": "...",
      "acceptance_criteria": [
        {
          "scenario": "...",
          "given": "...",
          "when": "...",
          "then": "..."
        }
      ],
      "story_points": 3
    }
  ],
  "gaps": [
    {
      "type": "error_handling|edge_case|performance|security|other",
      "description": "...",
      "recommendation": "..."
    }
  ]
}

Generate the JSON response:`;
  }

  /**
   * Build prompt for single story generation
   * @param {string} criterion - The acceptance criterion
   * @param {Object} prd - PRD object
   * @param {number} _index - Story index (unused but kept for signature compatibility)
   * @param {Object} sdContext - Normalized SD context (optional)
   */
  buildSingleStoryPrompt(criterion, prd, _index, sdContext = null) {
    let contextSection = `Context: ${prd?.title || 'Unknown PRD'}`;
    let personaGuidance = 'Use business-focused user roles (NOT developer/engineer). Make acceptance criteria specific and testable.';

    if (sdContext) {
      contextSection = `Context: ${prd?.title || 'Unknown PRD'}
SD Type: ${sdContext.sdType}
Target Application: ${sdContext.targetApplication}`;

      if (sdContext.hierarchy.isChild) {
        contextSection += `\nParent SD: ${sdContext.hierarchy.parentTitle || sdContext.hierarchy.parentSdKey || 'Unknown'}`;
      }

      const personas = sdContext.personas;
      if (personas.allowTechnical) {
        personaGuidance = `This is a ${sdContext.sdType} SD - technical personas (${personas.suggestedPersonas.slice(0, 3).join(', ')}) are allowed.`;
      } else {
        personaGuidance = `This is a ${sdContext.sdType} SD - use business personas only (${personas.suggestedPersonas.slice(0, 3).join(', ')}). Do NOT use ${personas.forbiddenPersonas.slice(0, 3).join(', ')}.`;
      }
    }

    return `Generate a user story for this acceptance criterion:

"${criterion}"

${contextSection}

Return JSON with: title, user_role, user_want, user_benefit, acceptance_criteria (array of Given-When-Then objects), story_points.

${personaGuidance}

JSON response:`;
  }

  /**
   * Build prompt for gap detection
   */
  buildGapDetectionPrompt(acceptanceCriteria, prd) {
    return `Analyze these acceptance criteria for a software feature and identify any gaps:

Feature: ${prd?.title || 'Unknown'}
Summary: ${prd?.executive_summary || 'No summary'}

Acceptance Criteria:
${acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Identify gaps in these categories:
1. **Error Handling**: What happens when things go wrong?
2. **Edge Cases**: Unusual inputs, empty states, boundary conditions
3. **Performance**: Response times, throughput, scalability
4. **Security**: Authentication, authorization, data protection
5. **Accessibility**: Screen readers, keyboard navigation
6. **Data Validation**: Input validation, data integrity

Return JSON array of gaps found:
[
  {
    "type": "error_handling|edge_case|performance|security|accessibility|validation|other",
    "description": "What's missing",
    "recommendation": "What should be added",
    "severity": "high|medium|low"
  }
]

JSON response:`;
  }

  /**
   * Call Claude API with retry logic
   */
  async callClaude(prompt, options = {}) {
    const maxTokens = options.maxTokens || 2000;
    const temperature = options.temperature || 0.3;

    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Sanitize prompt to remove invalid Unicode surrogates that cause JSON serialization errors
        const sanitizedPrompt = typeof prompt === 'string' ? prompt.replace(
          /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD'
        ) : prompt;

        // Use factory to get LLM client with opus tier for PLAN phase (per phase-model-routing.json)
        const client = await getLLMClient({
          purpose: 'story-generation',
          subAgent: 'STORIES',
          phase: this.phase
        });

        const response = await client.messages.create({
          max_tokens: maxTokens,
          temperature: temperature,
          messages: [
            { role: 'user', content: sanitizedPrompt }
          ],
        });

        if (response.content && response.content[0] && response.content[0].text) {
          return response.content[0].text;
        }
        throw new Error('Empty response from Claude');
      } catch (error) {
        lastError = error;
        if (attempt < MAX_RETRIES) {
          console.log(`   [LLM] Retry ${attempt}/${MAX_RETRIES} after error: ${error.message}`);
          await this.sleep(1000 * attempt); // Exponential backoff
        }
      }
    }
    throw lastError;
  }

  /**
   * Parse the story generation response
   * @param {string} response - Raw LLM response
   * @param {Array} acceptanceCriteria - Original acceptance criteria
   * @param {string} sdKey - SD key
   * @param {Object} sdContext - Normalized SD context (optional)
   */
  parseStoryResponse(response, acceptanceCriteria, sdKey, sdContext = null) {
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                        response.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr);

      // Validate and enrich stories with SD context
      const stories = (parsed.stories || []).map((story, i) => ({
        ...story,
        criterion_index: story.criterion_index ?? i,
        original_criterion: acceptanceCriteria[story.criterion_index ?? i],
        generated_by: 'LLM',
        model: this.model,
        sd_type: sdContext?.sdType || null,
        sd_context_applied: !!sdContext,
      }));

      const gaps = (parsed.gaps || []).map(gap => ({
        ...gap,
        sd_key: sdKey,
        detected_by: 'LLM',
      }));

      return { stories, gaps };
    } catch (error) {
      console.log(`   [LLM] Parse error: ${error.message}`);
      return { stories: [], gaps: [] };
    }
  }

  /**
   * Parse single story response
   * @param {string} response - Raw LLM response
   * @param {string} criterion - Original criterion
   * @param {number} index - Story index
   * @param {Object} sdContext - Normalized SD context (optional)
   */
  parseSingleStoryResponse(response, criterion, index, sdContext = null) {
    try {
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                        response.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        return null;
      }

      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr);

      return {
        ...parsed,
        criterion_index: index,
        original_criterion: criterion,
        generated_by: 'LLM',
        model: this.model,
        sd_type: sdContext?.sdType || null,
        sd_context_applied: !!sdContext,
      };
    } catch (_error) {
      return null;
    }
  }

  /**
   * Parse gap detection response
   */
  parseGapResponse(response) {
    try {
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                        response.match(/\[[\s\S]*\]/);

      if (!jsonMatch) {
        return [];
      }

      const jsonStr = jsonMatch[1] || jsonMatch[0];
      return JSON.parse(jsonStr);
    } catch (_error) {
      return [];
    }
  }

  /**
   * Sleep helper for retry backoff
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create a configured LLM story generator instance
 * @param {Object} options - Configuration options
 * @returns {LLMStoryGenerator} Configured generator
 */
export function createLLMStoryGenerator(options = {}) {
  return new LLMStoryGenerator(options);
}

/**
 * Quick check if LLM generation is available
 * @returns {boolean} Whether LLM generation can be used
 */
export function isLLMAvailable() {
  return !!process.env.ANTHROPIC_API_KEY;
}

export default LLMStoryGenerator;
