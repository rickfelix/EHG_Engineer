/**
 * LLM-Powered User Story Generator
 * SD-LEO-ENH-LLM-POWERED-USER-001: Replace template-based generation with semantic LLM understanding
 *
 * Uses Claude API to generate high-quality user stories with:
 * - Semantic understanding of PRD requirements
 * - Specific, testable acceptance criteria
 * - Automatic gap detection for missing requirements
 * - Fallback to rule-based generation on failure
 *
 * @module llm-story-generator
 */

import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../../../.env') });

// LLM configuration
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 2;

/**
 * LLM Story Generator class
 * Handles Claude API integration for user story generation
 */
export class LLMStoryGenerator {
  constructor(options = {}) {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    this.model = options.model || DEFAULT_MODEL;
    this.timeout = options.timeout || DEFAULT_TIMEOUT;
    this.enabled = !!process.env.ANTHROPIC_API_KEY;
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
   * @returns {Promise<Object>} Generated stories and detected gaps
   */
  async generateStoriesFromCriteria(acceptanceCriteria, prd, options = {}) {
    if (!this.isEnabled()) {
      return { success: false, reason: 'LLM not enabled', stories: [], gaps: [] };
    }

    const sdKey = options.sdKey || 'unknown';
    console.log(`   [LLM] Generating stories for ${acceptanceCriteria.length} criteria...`);

    try {
      const prompt = this.buildStoryGenerationPrompt(acceptanceCriteria, prd);

      const response = await this.callClaude(prompt, {
        maxTokens: 4000,
        temperature: 0.3, // Lower temperature for more consistent output
      });

      const result = this.parseStoryResponse(response, acceptanceCriteria, sdKey);

      console.log(`   [LLM] Generated ${result.stories.length} stories, found ${result.gaps.length} gaps`);

      return {
        success: true,
        stories: result.stories,
        gaps: result.gaps,
        rawResponse: response,
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
   * @returns {Promise<Object>} Generated story content
   */
  async generateSingleStory(criterion, prd, index) {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      const prompt = this.buildSingleStoryPrompt(criterion, prd, index);

      const response = await this.callClaude(prompt, {
        maxTokens: 1500,
        temperature: 0.3,
      });

      return this.parseSingleStoryResponse(response, criterion, index);
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
   */
  buildStoryGenerationPrompt(acceptanceCriteria, prd) {
    const prdContext = prd ? `
PRD Title: ${prd.title || 'Unknown'}
PRD Summary: ${prd.executive_summary || 'No summary available'}
Target Application: ${prd.target_application || 'Unknown'}
` : 'No PRD context available.';

    return `You are a senior product manager creating user stories from acceptance criteria.

${prdContext}

## Acceptance Criteria to Convert:
${acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## Instructions:
For each acceptance criterion, generate a user story with:
1. **title**: Clear, action-oriented title (not just repeating the criterion)
2. **user_role**: The appropriate end-user persona (NOT developer/engineer/DBA - use business roles like "Platform User", "Portfolio Manager", "Business Analyst")
3. **user_want**: What the user wants to accomplish (start with action verb)
4. **user_benefit**: The business value - why this matters to the user
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
   */
  buildSingleStoryPrompt(criterion, prd, _index) {
    return `Generate a user story for this acceptance criterion:

"${criterion}"

Context: ${prd?.title || 'Unknown PRD'}

Return JSON with: title, user_role, user_want, user_benefit, acceptance_criteria (array of Given-When-Then objects), story_points.

Use business-focused user roles (NOT developer/engineer). Make acceptance criteria specific and testable.

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
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: maxTokens,
          temperature: temperature,
          messages: [
            { role: 'user', content: prompt }
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
   */
  parseStoryResponse(response, acceptanceCriteria, sdKey) {
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                        response.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr);

      // Validate and enrich stories
      const stories = (parsed.stories || []).map((story, i) => ({
        ...story,
        criterion_index: story.criterion_index ?? i,
        original_criterion: acceptanceCriteria[story.criterion_index ?? i],
        generated_by: 'LLM',
        model: this.model,
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
   */
  parseSingleStoryResponse(response, criterion, index) {
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
