/**
 * API Relevance Classifier - AI-Powered API Sub-Agent Trigger Decision
 *
 * Uses GPT-5 Mini (gpt-5-mini) with JSON response mode to determine if an SD actually
 * creates/modifies REST/GraphQL API endpoints, or just consumes external APIs.
 *
 * This prevents false positive triggering of the API sub-agent when an SD
 * mentions "API" but is actually building a client service (not a server).
 *
 * Key Features:
 * - JSON response mode for structured output
 * - Semantic understanding of SD scope vs naive keyword matching
 * - Confidence scoring for transparency
 * - Fallback to conservative keyword detection if API fails
 *
 * @module api-relevance-classifier
 * @version 1.0.0
 */

import OpenAI from 'openai';
import dotenv from 'dotenv';

// SD-LLM-CONFIG-CENTRAL-001: Centralized model configuration
import { getOpenAIModel } from '../config/model-config.js';

dotenv.config();

// Classification result structure
const EXPECTED_JSON_SCHEMA = `{
  "creates_api_endpoints": true/false,
  "modifies_api_endpoints": true/false,
  "consumes_external_api": true/false,
  "api_type": "REST|GraphQL|WebSocket|None",
  "confidence": 0-100,
  "reasoning": "Brief explanation of the classification decision",
  "should_run_api_subagent": true/false
}`;

export class APIRelevanceClassifier {
  constructor() {
    this.model = getOpenAIModel('fast'); // SD-LLM-CONFIG-CENTRAL-001: Using fast model for classification

    if (!process.env.OPENAI_API_KEY) {
      console.warn('OPENAI_API_KEY not found - API relevance will fall back to keyword detection');
      this.openai = null;
    } else {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
  }

  /**
   * Classify whether an SD requires API sub-agent review
   *
   * @param {Object} sd - Strategic Directive object
   * @param {string} sd.title - SD title
   * @param {string} sd.scope - SD scope
   * @param {string} sd.description - SD description
   * @param {Object} prd - Product Requirements Document (optional)
   * @returns {Promise<Object>} Classification result
   */
  async classify(sd, prd = null) {
    // If OpenAI not available, fall back to keyword detection
    if (!this.openai) {
      return this.keywordFallback(sd, prd);
    }

    try {
      const result = await this.callOpenAI(sd, prd);
      return this.processResult(result, sd);
    } catch (error) {
      console.error('AI classification failed, falling back to keywords:', error.message);
      return this.keywordFallback(sd, prd);
    }
  }

  /**
   * Call OpenAI with JSON response mode
   */
  async callOpenAI(sd, prd) {
    const systemPrompt = `You are an expert at determining whether a Strategic Directive (SD) in a software development project requires API architecture review.

**Your task:** Analyze the SD and determine if it CREATES or MODIFIES server-side API endpoints (REST, GraphQL, WebSocket).

**Critical Question:** Does this SD define, create, or change how HTTP endpoints accept requests or return responses?

**CREATES API endpoints** = TRUE only if:
- Building NEW routes/controllers that SERVE data to HTTP clients
- Adding new URL paths that accept HTTP requests (GET /api/users, POST /api/orders)
- Creating new REST resources or GraphQL resolvers

**MODIFIES API endpoints** = TRUE only if:
- Changing existing HTTP route signatures, request/response schemas
- Adding/removing query parameters, headers, or body fields
- Changing authentication requirements for existing endpoints
- Adding pagination, filtering, or versioning to existing endpoints

**MODIFIES is FALSE when:**
- Wiring internal services together (calling internal functions/services)
- Hooking into application lifecycle events (stage transitions, workflow hooks)
- Integrating external API responses into internal business logic
- Building client-side code that consumes APIs

**CONSUMES external API** = TRUE if:
- Calling third-party APIs as a CLIENT (Stripe, OpenAI, CrewAI)
- Building services that fetch data FROM external sources
- Integrating/wiring external platform data into the application

**The API sub-agent should ONLY run if creates_api_endpoints OR modifies_api_endpoints is TRUE.**

Examples with reasoning:
- "Build user authentication API" → creates=true, should_run=true (new HTTP endpoints)
- "Create REST endpoints for venture management" → creates=true, should_run=true
- "Add pagination to /api/products" → modifies=true, should_run=true (changes response schema)
- "Integrate with CrewAI Agent Platform API" → consumes=true, should_run=false (client-side consumption)
- "Wire CrewAI contracts to workflow stage transitions" → consumes=true, should_run=false (internal service wiring, not HTTP endpoint changes)
- "Hook advanceStage() to trigger CrewAI at designated stages" → consumes=true, should_run=false (lifecycle hooks, not endpoint changes)
- "Store external API outputs in database" → consumes=true, should_run=false (data storage, not endpoint changes)
- "Display API results in UI" → consumes=true, should_run=false (UI consumption)
- "Add OpenAPI documentation to existing endpoints" → modifies=true, should_run=true

Respond with valid JSON matching this schema:
${EXPECTED_JSON_SCHEMA}`;

    const userPrompt = `Analyze this Strategic Directive:

**Title:** ${sd.title}
**Scope:** ${sd.scope || 'Not specified'}
**Description:** ${sd.description || 'Not specified'}
${prd ? `**Technical Requirements:** ${prd.technical_requirements || 'Not specified'}` : ''}

Should the API sub-agent review this SD?`;

    // gpt-5-mini is a reasoning model that uses tokens for internal reasoning
    // before producing output. Need higher token limit to accommodate reasoning + JSON output
    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 2000 // Higher limit for reasoning model (reasoning_tokens + output)
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    return JSON.parse(content);
  }

  /**
   * Process and validate AI result
   */
  processResult(aiResult, sd) {
    // Validate required fields
    const result = {
      creates_api_endpoints: Boolean(aiResult.creates_api_endpoints),
      modifies_api_endpoints: Boolean(aiResult.modifies_api_endpoints),
      consumes_external_api: Boolean(aiResult.consumes_external_api),
      api_type: aiResult.api_type || 'None',
      confidence: Math.min(100, Math.max(0, aiResult.confidence || 50)),
      reasoning: aiResult.reasoning || 'No reasoning provided',
      should_run_api_subagent: Boolean(aiResult.should_run_api_subagent),
      classification_method: 'ai',
      sd_id: sd.id,
      sd_title: sd.title
    };

    // Double-check logic: only run if creates or modifies endpoints
    if (!result.creates_api_endpoints && !result.modifies_api_endpoints) {
      result.should_run_api_subagent = false;
    }

    console.log(`   🤖 AI Classification: should_run_api_subagent=${result.should_run_api_subagent} (${result.confidence}% confidence)`);
    console.log(`      Reasoning: ${result.reasoning}`);

    return result;
  }

  /**
   * Fallback to keyword detection (conservative approach)
   * Returns true only for clear API creation patterns
   */
  keywordFallback(sd, prd) {
    const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''} ${prd?.technical_requirements || ''}`.toLowerCase();

    // Patterns that indicate CREATING API endpoints (should trigger sub-agent)
    const createsApiPatterns = [
      /\b(create|build|implement|add)\s+(rest|graphql)?\s*(api|endpoint|route)/i,
      /\b(new|expose|publish)\s+(api|endpoint|route)/i,
      /\bapi\s+(endpoint|route|controller)\s+(for|to)/i,
      /\b(rest|graphql)\s+(api|server|service)\b/i
    ];

    // Patterns that indicate CONSUMING APIs (should NOT trigger sub-agent)
    const consumesApiPatterns = [
      /\b(integrate|connect|call|consume|use|wire)\s+(with|to)?\s*(external|third.party|platform)?\s*(api|service)/i,
      /\b(api|service)\s+(client|consumer|integration|wiring)/i,
      /\bclient\s+(service|library)\s+(for|to)/i,
      /\bplatform\s+api\b/i
    ];

    const createsApi = createsApiPatterns.some(p => p.test(content));
    const consumesApi = consumesApiPatterns.some(p => p.test(content));

    // If it clearly consumes but doesn't clearly create, don't trigger
    const shouldRun = createsApi && !consumesApi;

    const result = {
      creates_api_endpoints: createsApi,
      modifies_api_endpoints: false,
      consumes_external_api: consumesApi,
      api_type: createsApi ? 'REST' : 'None',
      confidence: 60, // Lower confidence for keyword fallback
      reasoning: `Keyword fallback: creates_api=${createsApi}, consumes_api=${consumesApi}`,
      should_run_api_subagent: shouldRun,
      classification_method: 'keyword_fallback',
      sd_id: sd.id,
      sd_title: sd.title
    };

    console.log(`   📝 Keyword Fallback: should_run_api_subagent=${result.should_run_api_subagent}`);
    console.log(`      Pattern match: creates=${createsApi}, consumes=${consumesApi}`);

    return result;
  }
}

// Singleton instance for reuse
let classifierInstance = null;

/**
 * Get or create classifier instance
 */
export function getAPIRelevanceClassifier() {
  if (!classifierInstance) {
    classifierInstance = new APIRelevanceClassifier();
  }
  return classifierInstance;
}

/**
 * Convenience function to check if API sub-agent should run
 * @param {Object} sd - Strategic Directive
 * @param {Object} prd - Product Requirements Document (optional)
 * @returns {Promise<boolean>} Whether API sub-agent should run
 */
export async function shouldRunAPISubAgent(sd, prd = null) {
  const classifier = getAPIRelevanceClassifier();
  const result = await classifier.classify(sd, prd);
  return result.should_run_api_subagent;
}

export default APIRelevanceClassifier;
