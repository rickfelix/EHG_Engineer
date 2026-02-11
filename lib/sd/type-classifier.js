/**
 * SD Type Classifier - LLM-Assisted Classification
 *
 * Uses GPT to intelligently classify SD type at creation time
 * based on title and description analysis.
 *
 * Part of: SD-LEO-FEAT-LLM-ASSISTED-TYPE-001
 *
 * @module lib/sd/type-classifier
 * @version 1.0.0
 */

import { getLLMClient } from '../llm/client-factory.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * SD Type Profiles - Validation rules per type
 */
export const SD_TYPE_PROFILES = {
  feature: {
    name: 'Feature',
    description: 'User-facing functionality with UI',
    prdRequired: true,
    e2eRequired: true,
    designRequired: true,
    minHandoffs: 4,
    gateThreshold: 85,
    subAgents: ['DESIGN', 'DATABASE', 'STORIES', 'TESTING', 'RISK']
  },
  infrastructure: {
    name: 'Infrastructure',
    description: 'Backend systems, tooling, scripts, CI/CD',
    prdRequired: true,
    e2eRequired: false,
    designRequired: false,
    minHandoffs: 3,
    gateThreshold: 80,
    subAgents: ['DATABASE', 'STORIES', 'RISK']
  },
  library: {
    name: 'Library',
    description: 'Reusable modules, utilities, backend code',
    prdRequired: false,
    e2eRequired: false,
    designRequired: false,
    minHandoffs: 2,
    gateThreshold: 75,
    subAgents: ['DATABASE', 'RISK']
  },
  fix: {
    name: 'Fix',
    description: 'Bug fixes, error corrections',
    prdRequired: false,
    e2eRequired: false,
    designRequired: false,
    minHandoffs: 1,
    gateThreshold: 70,
    subAgents: ['RCA']
  },
  enhancement: {
    name: 'Enhancement',
    description: 'Improvements to existing features',
    prdRequired: false,
    e2eRequired: false,
    designRequired: false,
    minHandoffs: 2,
    gateThreshold: 75,
    subAgents: ['VALIDATION', 'STORIES']
  },
  documentation: {
    name: 'Documentation',
    description: 'Documentation-only changes',
    prdRequired: false,
    e2eRequired: false,
    designRequired: false,
    minHandoffs: 1,
    gateThreshold: 60,
    subAgents: ['DOCMON']
  },
  refactor: {
    name: 'Refactor',
    description: 'Code restructuring without behavior change',
    prdRequired: false,
    e2eRequired: true,
    designRequired: false,
    minHandoffs: 2,
    gateThreshold: 80,
    subAgents: ['REGRESSION', 'VALIDATION']
  },
  security: {
    name: 'Security',
    description: 'Security-related changes',
    prdRequired: true,
    e2eRequired: true,
    designRequired: false,
    minHandoffs: 3,
    gateThreshold: 90,
    subAgents: ['SECURITY', 'RISK', 'TESTING']
  }
};

/**
 * Type classification keywords for fallback
 */
const TYPE_KEYWORDS = {
  feature: ['user', 'dashboard', 'page', 'button', 'form', 'ui', 'interface', 'component', 'screen', 'display'],
  infrastructure: ['script', 'ci', 'cd', 'deploy', 'pipeline', 'tooling', 'automation', 'hook', 'workflow'],
  library: ['module', 'util', 'helper', 'lib', 'service', 'class', 'function', 'api client', 'sdk'],
  fix: ['bug', 'fix', 'error', 'broken', 'crash', 'issue', 'wrong', 'incorrect', 'fail'],
  enhancement: ['improve', 'enhance', 'better', 'optimize', 'upgrade', 'update'],
  documentation: ['doc', 'readme', 'guide', 'tutorial', 'comment', 'jsdoc'],
  refactor: ['refactor', 'restructure', 'reorganize', 'clean', 'simplify', 'rename'],
  security: ['auth', 'permission', 'rls', 'token', 'encrypt', 'password', 'credential', 'vulnerability']
};

/**
 * SD Type Classifier using GPT
 */
export class SDTypeClassifier {
  constructor() {
    this.llmClient = null; // Initialized lazily on first use
  }

  /**
   * Get LLM client from factory (lazy initialization)
   */
  async getLLMClient() {
    if (!this.llmClient) {
      try {
        // Fix: Use recognized purpose string and remove await (getLLMClient is synchronous)
        this.llmClient = getLLMClient({
          purpose: 'classification',
          phase: 'LEAD'
        });
      } catch (error) {
        console.warn('LLM client unavailable - will use keyword fallback');
        return null;
      }
    }
    return this.llmClient;
  }

  /**
   * Classify SD type based on title and description
   * @param {string} title - SD title
   * @param {string} description - SD description
   * @param {Object} options - Classification options
   * @returns {Promise<Object>} Classification result
   */
  async classify(title, description, options = {}) {
    const { useKeywordFallback = true } = options;

    // Try LLM classification first
    const llmClient = await this.getLLMClient();
    if (llmClient) {
      try {
        const llmResult = await this.classifyWithGPT(title, description, llmClient);
        return {
          ...llmResult,
          source: 'llm',
          profile: SD_TYPE_PROFILES[llmResult.recommendedType]
        };
      } catch (error) {
        console.error('LLM classification failed:', error.message);
        if (!useKeywordFallback) {
          throw error;
        }
      }
    }

    // Fallback to keyword-based classification
    const keywordResult = this.classifyByKeywords(title, description);
    return {
      ...keywordResult,
      source: 'keyword_fallback',
      profile: SD_TYPE_PROFILES[keywordResult.recommendedType]
    };
  }

  /**
   * Classify using LLM
   */
  async classifyWithGPT(title, description, llmClient) {
    const prompt = this.buildClassificationPrompt(title, description);

    // Fix: Use adapter interface .complete() instead of OpenAI SDK interface
    const response = await llmClient.complete(prompt.system, prompt.user, {
      temperature: 0.2
    });

    // Fix: Parse adapter response format (response.content) instead of OpenAI format
    const result = JSON.parse(response.content);

    // Normalize the type to our known types
    const normalizedType = this.normalizeType(result.sdType || result.recommendedType);

    return {
      recommendedType: normalizedType,
      confidence: result.confidence || 0.8,
      reasoning: result.reasoning,
      analysis: {
        hasUI: result.hasUI,
        hasAPIEndpoints: result.hasAPIEndpoints,
        isLibrary: result.isLibrary,
        complexity: result.complexity,
        riskAreas: result.riskAreas || []
      }
    };
  }

  /**
   * Build classification prompt for GPT
   */
  buildClassificationPrompt(title, description) {
    const typeDescriptions = Object.entries(SD_TYPE_PROFILES)
      .map(([type, profile]) => `- ${type}: ${profile.description}`)
      .join('\n');

    return {
      system: `You are an expert software architect helping classify Strategic Directives (SDs) for a LEO Protocol workflow system.

Your job is to analyze the SD title and description, then determine the most appropriate SD type.

Available SD types:
${typeDescriptions}

Classification rules:
1. If it has user-facing UI components (pages, buttons, forms, dashboards) → feature
2. If it's backend processing with no UI but not a reusable module → infrastructure
3. If it's a reusable module/utility/library/class → library
4. If it fixes a bug or error → fix
5. If it improves existing functionality without adding new features → enhancement
6. If it's documentation-only → documentation
7. If it restructures code without changing behavior → refactor
8. If it involves authentication, permissions, or security → security

Return JSON with your analysis.`,

      user: `Analyze this Strategic Directive and classify it:

Title: "${title}"
Description: "${description || 'No description provided'}"

Return JSON:
{
  "sdType": "feature|infrastructure|library|fix|enhancement|documentation|refactor|security",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of why this type was chosen",
  "hasUI": true/false,
  "hasAPIEndpoints": true/false,
  "isLibrary": true/false,
  "complexity": "low|medium|high",
  "riskAreas": ["auth", "data", "performance", etc. or empty array]
}`
    };
  }

  /**
   * Normalize type string to valid SD type
   */
  normalizeType(type) {
    const normalized = type?.toLowerCase()?.trim();
    if (SD_TYPE_PROFILES[normalized]) {
      return normalized;
    }

    // Handle common variations
    const typeMap = {
      'bugfix': 'fix',
      'bug_fix': 'fix',
      'bug-fix': 'fix',
      'hotfix': 'fix',
      'feat': 'feature',
      'infra': 'infrastructure',
      'lib': 'library',
      'module': 'library',
      'util': 'library',
      'doc': 'documentation',
      'docs': 'documentation',
      'sec': 'security',
      'auth': 'security'
    };

    return typeMap[normalized] || 'infrastructure'; // Default to infrastructure if unknown
  }

  /**
   * Classify using keyword matching (fallback)
   */
  classifyByKeywords(title, description) {
    const text = `${title} ${description}`.toLowerCase();
    const scores = {};

    for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
      scores[type] = keywords.filter(kw => text.includes(kw)).length;
    }

    const maxScore = Math.max(...Object.values(scores));
    const recommendedType = maxScore > 0
      ? Object.keys(scores).find(type => scores[type] === maxScore)
      : 'infrastructure'; // Default

    return {
      recommendedType,
      confidence: maxScore > 0 ? Math.min(0.6 + (maxScore * 0.1), 0.85) : 0.5,
      reasoning: maxScore > 0
        ? `Matched ${maxScore} keyword(s) for ${recommendedType} type`
        : 'No keywords matched, defaulting to infrastructure',
      analysis: {
        hasUI: TYPE_KEYWORDS.feature.some(kw => text.includes(kw)),
        hasAPIEndpoints: text.includes('api') || text.includes('endpoint'),
        isLibrary: TYPE_KEYWORDS.library.some(kw => text.includes(kw)),
        complexity: 'medium',
        riskAreas: []
      }
    };
  }

  /**
   * Format classification result for display
   */
  formatForDisplay(result) {
    const profile = result.profile;
    const implications = [];

    if (profile.prdRequired) implications.push('PRD required');
    if (profile.e2eRequired) implications.push('E2E tests required');
    if (profile.designRequired) implications.push('DESIGN sub-agent required');
    implications.push(`${profile.gateThreshold}% gate threshold`);
    implications.push(`Min ${profile.minHandoffs} handoffs`);

    return {
      type: result.recommendedType,
      typeName: profile.name,
      confidence: Math.round(result.confidence * 100) + '%',
      reasoning: result.reasoning,
      implications,
      subAgents: profile.subAgents
    };
  }

  /**
   * Get validation profile for an SD type
   */
  getProfile(sdType) {
    return SD_TYPE_PROFILES[sdType] || SD_TYPE_PROFILES.infrastructure;
  }

  /**
   * Check if a validation is required for an SD type
   */
  isValidationRequired(sdType, validationType) {
    const profile = this.getProfile(sdType);

    switch (validationType) {
      case 'prd':
        return profile.prdRequired;
      case 'e2e':
        return profile.e2eRequired;
      case 'design':
        return profile.designRequired;
      default:
        return true;
    }
  }
}

// Export singleton instance
export const sdTypeClassifier = new SDTypeClassifier();

export default SDTypeClassifier;
