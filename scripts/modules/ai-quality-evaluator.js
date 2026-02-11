/**
 * AI Quality Evaluator - Foundation Class
 *
 * Provides AI-powered quality assessment using GPT 5.2 with Russian Judge
 * multi-criterion weighted rubrics (0-10 scale per criterion).
 *
 * All rubrics (SD, PRD, User Story, Retrospective) extend this class.
 *
 * REFACTORED: Modularized from 948 LOC to ~120 LOC (SD-LEO-REFAC-TESTING-INFRA-001)
 * Modules: config, caching, prompts, scoring, feedback, api, storage
 *
 * @module ai-quality-evaluator
 * @version 1.2.0-scoring-bands
 * @see {@link ../docs/russian-judge-quality-system.md} Complete documentation
 */

import { createClient } from '@supabase/supabase-js';
import { getLLMClient } from '../../lib/llm/client-factory.js';
import dotenv from 'dotenv';

// Import from decomposed modules
import {
  BAND_THRESHOLDS,
  getCachedAssessment,
  generateContentHash,
  buildPrompt,
  determineBand,
  determinePassedStatus,
  getPassThreshold,
  calculateWeightedScore,
  calculateCost,
  generateFeedback,
  callOpenAI,
  enrichWithOrchestratorContext,
  storeAssessment
} from './ai-quality-evaluator/index.js';

dotenv.config();

export class AIQualityEvaluator {
  /**
   * @param {Object} rubricConfig - Rubric configuration
   * @param {string} rubricConfig.contentType - Type: 'sd', 'prd', 'user_story', 'retrospective'
   * @param {Array} rubricConfig.criteria - Array of criterion objects
   */
  constructor(rubricConfig) {
    this.rubricConfig = rubricConfig;
    this.temperature = 0.3;
    this.llmClient = null; // Initialized lazily on first use

    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    this.bandThresholds = BAND_THRESHOLDS;
  }

  /**
   * Get LLM client from factory (lazy initialization)
   */
  async getLLMClient() {
    if (!this.llmClient) {
      this.llmClient = await getLLMClient({
        purpose: 'quality-evaluation',
        phase: 'EXEC'
      });
    }
    return this.llmClient;
  }

  // Delegate to scoring module
  determineBand(weightedScore) {
    return determineBand(weightedScore);
  }

  determinePassedStatus(band, confidence, weightedScore, threshold) {
    return determinePassedStatus(band, confidence, weightedScore, threshold);
  }

  // Delegate to caching module
  async getCachedAssessment(contentId, contentHash) {
    return getCachedAssessment(this.supabase, contentId, contentHash, this.rubricConfig.contentType);
  }

  generateContentHash(content) {
    return generateContentHash(content);
  }

  /**
   * Main evaluation entry point
   */
  async evaluate(content, contentId, sd = null) {
    const startTime = Date.now();
    const DEBUG = process.env.AI_DEBUG === 'true';
    const logPrefix = `[AI-Eval:${this.rubricConfig.contentType}:${contentId?.substring(0, 8) || 'unknown'}]`;

    if (DEBUG) {
      console.log(`${logPrefix} Starting evaluation...`);
      console.log(`${logPrefix} Content length: ${content?.length || 0} chars`);
    }

    const contentHash = this.generateContentHash(content);

    // Check cache
    const SKIP_CACHE = process.env.AI_SKIP_CACHE === 'true';
    if (!SKIP_CACHE) {
      const cached = await this.getCachedAssessment(contentId, contentHash);
      if (cached) {
        if (DEBUG) console.log(`${logPrefix} Using cached assessment (score: ${cached.weightedScore}%)`);
        return cached;
      }
    }

    try {
      // Enrich SD with orchestrator context if needed
      if (sd && !sd._orchestratorChecked) {
        sd = await enrichWithOrchestratorContext(this.supabase, sd);
      }

      // Build and send prompt
      const messages = buildPrompt(content, this.rubricConfig, sd);
      const apiStart = Date.now();
      const llmClient = await this.getLLMClient();
      const response = await callOpenAI(llmClient, messages);
      const apiDuration = Date.now() - apiStart;

      // Parse scores
      let scores, meta = { confidence: 'MEDIUM', confidence_reasoning: 'Default confidence' };
      const parsed = JSON.parse(response.choices[0].message.content);
      if (parsed._meta) {
        meta = { confidence: parsed._meta.confidence || 'MEDIUM', confidence_reasoning: parsed._meta.confidence_reasoning || '' };
        delete parsed._meta;
      }
      scores = parsed;

      // Calculate results
      const weightedScore = calculateWeightedScore(scores, this.rubricConfig.criteria);
      const band = this.determineBand(weightedScore);
      const confidence = meta.confidence;
      const feedback = generateFeedback(scores, this.rubricConfig.criteria, sd);
      const threshold = getPassThreshold(this.rubricConfig.contentType, sd);
      const passed = this.determinePassedStatus(band, confidence, weightedScore, threshold);

      // Metrics
      const duration = Date.now() - startTime;
      const tokensUsed = response.usage;
      const cost = calculateCost(tokensUsed);

      if (DEBUG) {
        console.log(`${logPrefix} Score: ${weightedScore}% | Band: ${band} | Confidence: ${confidence}`);
        console.log(`${logPrefix} Total duration: ${duration}ms (API: ${apiDuration}ms)`);
      }

      // Store assessment
      await storeAssessment(
        this.supabase, this.rubricConfig, contentId, scores, weightedScore,
        feedback, duration, tokensUsed, cost, sd, threshold, contentHash,
        band, confidence, meta.confidence_reasoning, 'factory-resolved', this.temperature
      );

      return {
        scores, weightedScore, feedback, passed, threshold,
        band, confidence, confidence_reasoning: meta.confidence_reasoning,
        sd_type: sd?.sd_type || 'unknown',
        is_orchestrator: sd?._isOrchestrator || false,
        child_count: sd?._childCount || 0,
        duration, cost
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`${logPrefix} FAILED after ${duration}ms: ${error.message}`);
      throw new Error(`AI evaluation failed: ${error.message}`);
    }
  }

  // Delegate to prompts module
  buildPrompt(content, sd = null) {
    return buildPrompt(content, this.rubricConfig, sd);
  }

  // Delegate to scoring module
  getPassThreshold(contentType, sd = null) {
    return getPassThreshold(contentType, sd);
  }

  calculateWeightedScore(scores) {
    return calculateWeightedScore(scores, this.rubricConfig.criteria);
  }

  calculateCost(tokensUsed) {
    return calculateCost(tokensUsed);
  }

  // Delegate to feedback module
  generateFeedback(scores, criteria = null, sd = null) {
    return generateFeedback(scores, criteria || this.rubricConfig.criteria, sd);
  }

  // Delegate to api module
  async callOpenAI(messages, retries = 3) {
    const llmClient = await this.getLLMClient();
    return callOpenAI(llmClient, messages, retries);
  }

  // Delegate to storage module
  async enrichWithOrchestratorContext(sd) {
    return enrichWithOrchestratorContext(this.supabase, sd);
  }

  async storeAssessment(contentId, scores, weightedScore, feedback, duration, tokensUsed, cost, sd = null, threshold = 70, contentHash = null, band = null, confidence = null, confidenceReasoning = null) {
    return storeAssessment(
      this.supabase, this.rubricConfig, contentId, scores, weightedScore,
      feedback, duration, tokensUsed, cost, sd, threshold, contentHash,
      band, confidence, confidenceReasoning, 'factory-resolved', this.temperature
    );
  }
}
