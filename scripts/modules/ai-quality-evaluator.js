/**
 * AI Quality Evaluator - Foundation Class
 *
 * Provides AI-powered quality assessment using GPT 5.2 with Russian Judge
 * multi-criterion weighted rubrics (0-10 scale per criterion).
 *
 * All rubrics (SD, PRD, User Story, Retrospective) extend this class.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║          CONTINUOUS IMPROVEMENT & QUALITY EVOLUTION                   ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * The Russian Judge is designed to help the LEO Protocol improve over time:
 *
 * 1. **Learning System**: Currently in ADVISORY mode—logs scores but doesn't
 *    block handoffs. This lets us gather data on what scores correlate with
 *    actual quality issues in production.
 *
 * 2. **Data-Driven Tuning**: Start with lenient thresholds (50-65% based on
 *    sd_type), then tighten based on empirical evidence:
 *    - If >3 quality issues from SDs that passed → increase threshold +5-10%
 *    - If pass rate <50% with no issues → decrease threshold -5%
 *    - See: config/russian-judge-thresholds.json for tuning history
 *
 * 3. **Meta-Analysis**: Database views track pass rates, score distributions,
 *    and criterion performance by sd_type. Use these to identify patterns:
 *    - Which criteria consistently score low? (rubric needs refinement)
 *    - Which sd_types have high scores but production issues? (threshold too low)
 *    - See: database/migrations/20251205_russian_judge_sd_type_awareness.sql
 *
 * 4. **Future Enforcement**: Once calibrated (2-4 weeks), can transition to:
 *    - Phase 2: Soft enforcement (warnings + LEAD override)
 *    - Phase 3: Hard enforcement for critical SDs (security, database)
 *
 * 5. **Complete Documentation**: See docs/russian-judge-quality-system.md for:
 *    - Architecture overview
 *    - Threshold tuning guidelines
 *    - Meta-analysis queries
 *    - Continuous improvement workflow
 *    - Future enhancement roadmap
 *
 * @module ai-quality-evaluator
 * @version 1.2.0-scoring-bands
 * @see {@link ../docs/russian-judge-quality-system.md} Complete documentation
 * @see {@link ../config/russian-judge-thresholds.json} Threshold configuration
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';

// SD-LLM-CONFIG-CENTRAL-001: Centralized model configuration
import { getOpenAIModel } from '../../lib/config/model-config.js';

dotenv.config();

export class AIQualityEvaluator {
  /**
   * @param {Object} rubricConfig - Rubric configuration
   * @param {string} rubricConfig.contentType - Type: 'sd', 'prd', 'user_story', 'retrospective'
   * @param {Array} rubricConfig.criteria - Array of criterion objects
   * @param {string} rubricConfig.criteria[].name - Criterion name (snake_case)
   * @param {number} rubricConfig.criteria[].weight - Weight (0-1, sum to 1.0)
   * @param {string} rubricConfig.criteria[].prompt - Evaluation prompt for this criterion
   */
  constructor(rubricConfig) {
    this.rubricConfig = rubricConfig;
    this.model = getOpenAIModel('validation'); // SD-LLM-CONFIG-CENTRAL-001: Centralized config
    this.temperature = 0.3; // Balance consistency + nuance

    // Initialize OpenAI
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not found in environment');
    }
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Initialize Supabase
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Scoring band thresholds (v1.2.0)
    // Bands stabilize pass/fail decisions even when exact scores vary
    this.bandThresholds = {
      PASS: 80,        // 80+ = PASS
      NEEDS_REVIEW: 50 // 50-79 = NEEDS_REVIEW, <50 = FAIL
    };
  }

  /**
   * Determine scoring band from weighted score
   * Bands provide stable pass/fail decisions despite score variance
   *
   * @param {number} weightedScore - Score 0-100
   * @returns {string} 'PASS' | 'NEEDS_REVIEW' | 'FAIL'
   */
  determineBand(weightedScore) {
    if (weightedScore >= this.bandThresholds.PASS) {
      return 'PASS';
    } else if (weightedScore >= this.bandThresholds.NEEDS_REVIEW) {
      return 'NEEDS_REVIEW';
    }
    return 'FAIL';
  }

  /**
   * Determine if validation passed based on band and confidence
   *
   * Logic:
   * - PASS band + HIGH/MEDIUM confidence → passed = true
   * - FAIL band → passed = false
   * - NEEDS_REVIEW OR LOW confidence → passed = false (requires human review)
   *
   * This stabilizes decisions: same content with 68% vs 72% both get NEEDS_REVIEW,
   * both require review, decision is consistent.
   *
   * @param {string} band - 'PASS' | 'NEEDS_REVIEW' | 'FAIL'
   * @param {string} confidence - 'HIGH' | 'MEDIUM' | 'LOW'
   * @param {number} weightedScore - For backward compatibility with threshold-based passing
   * @param {number} threshold - Dynamic threshold from SD type
   * @returns {boolean} Whether validation passed
   */
  determinePassedStatus(band, confidence, weightedScore, threshold) {
    // LOW confidence always requires review, regardless of band
    if (confidence === 'LOW') {
      return false;
    }

    // PASS band with non-LOW confidence = passed
    if (band === 'PASS') {
      return true;
    }

    // NEEDS_REVIEW and FAIL bands = not passed
    // Note: For backward compatibility during transition, we also check
    // if score exceeds the SD-type-aware threshold. This allows gradual
    // adoption while maintaining existing behavior.
    if (band === 'NEEDS_REVIEW' && weightedScore >= threshold) {
      // Score passes threshold but not PASS band - still passes but will be logged
      return true;
    }

    return false;
  }

  /**
   * SYSTEMIC FIX: Check for cached recent assessment to avoid redundant AI calls
   * Returns cached result if assessment exists within TTL and content unchanged
   *
   * @param {string} contentId - ID of content being assessed
   * @param {string} contentHash - Hash of content to detect changes
   * @returns {Promise<Object|null>} Cached assessment or null
   */
  async getCachedAssessment(contentId, contentHash) {
    const CACHE_TTL_HOURS = parseInt(process.env.AI_CACHE_TTL_HOURS) || 24;
    const DEBUG = process.env.AI_DEBUG === 'true';

    try {
      const { data, error } = await this.supabase
        .from('ai_quality_assessments')
        .select('*')
        .eq('content_id', contentId)
        .eq('content_type', this.rubricConfig.contentType)
        .gte('assessed_at', new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString())
        .order('assessed_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        return null;
      }

      // SYSTEMIC FIX: Improved cache invalidation logic
      // Case 1: Both hashes exist but differ → content changed → invalidate
      // Case 2: Old entry has NO hash but we have new hash → can't verify → invalidate
      // Case 3: Both hashes exist and match → content unchanged → use cache
      // Case 4: Neither has hash → legacy mode → use cache (will be replaced on next fresh eval)
      if (contentHash) {
        if (data.content_hash && data.content_hash !== contentHash) {
          if (DEBUG) console.log(`[AI-Eval] Cache invalidated: content hash changed for ${contentId}`);
          return null;
        }
        if (!data.content_hash) {
          if (DEBUG) console.log(`[AI-Eval] Cache invalidated: old entry has no hash, can't verify content for ${contentId}`);
          return null;
        }
      }

      if (DEBUG) console.log(`[AI-Eval] Cache HIT for ${contentId} (age: ${Math.round((Date.now() - new Date(data.assessed_at).getTime()) / 60000)}min)`);

      // v1.2.0: Calculate band for cached entries (for consistent band-based decisions)
      const cachedScore = data.weighted_score;
      const cachedThreshold = data.pass_threshold || 70;
      const cachedBand = this.determineBand(cachedScore);
      // Legacy cache entries don't have confidence - default to MEDIUM
      const cachedConfidence = data.confidence || 'MEDIUM';

      return {
        scores: data.scores,
        weightedScore: cachedScore,
        feedback: data.feedback,
        passed: this.determinePassedStatus(cachedBand, cachedConfidence, cachedScore, cachedThreshold),
        threshold: cachedThreshold,
        band: cachedBand,
        confidence: cachedConfidence,
        confidence_reasoning: data.confidence_reasoning || '',
        sd_type: data.sd_type || 'unknown',
        cached: true,
        cached_at: data.assessed_at
      };
    } catch (_err) {
      // Cache lookup failed, proceed with fresh evaluation
      return null;
    }
  }

  /**
   * Generate content hash for cache invalidation
   * SYSTEMIC FIX: Sample from multiple positions to detect changes anywhere in content
   */
  generateContentHash(content) {
    if (!content) return null;

    const len = content.length;

    // Sample from 5 positions: start, 25%, 50%, 75%, end
    // Each sample is 50 chars (or less if content is short)
    const sampleSize = Math.min(50, Math.floor(len / 5));
    const positions = [
      0,                           // Start
      Math.floor(len * 0.25),      // 25%
      Math.floor(len * 0.5),       // Middle
      Math.floor(len * 0.75),      // 75%
      Math.max(0, len - sampleSize) // End
    ];

    // Build sample string from multiple positions
    const samples = positions.map(pos =>
      content.substring(pos, pos + sampleSize)
    );
    const sample = len + ':' + samples.join(':');

    // Generate hash using djb2 algorithm
    let hash = 5381;
    for (let i = 0; i < sample.length; i++) {
      const char = sample.charCodeAt(i);
      hash = ((hash << 5) + hash) + char; // hash * 33 + char
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  /**
   * Main evaluation entry point
   *
   * @param {string} content - Formatted content to evaluate
   * @param {string} contentId - ID of content being assessed
   * @param {Object} sd - Strategic Directive object (for sd_type awareness)
   * @returns {Promise<Object>} Assessment result
   */
  async evaluate(content, contentId, sd = null) {
    const startTime = Date.now();
    const DEBUG = process.env.AI_DEBUG === 'true';
    const logPrefix = `[AI-Eval:${this.rubricConfig.contentType}:${contentId?.substring(0, 8) || 'unknown'}]`;

    if (DEBUG) {
      console.log(`${logPrefix} Starting evaluation...`);
      console.log(`${logPrefix} Content length: ${content?.length || 0} chars`);
    }

    // SYSTEMIC FIX: Generate content hash for caching and cache invalidation
    const contentHash = this.generateContentHash(content);

    // SYSTEMIC FIX: Check cache first to avoid redundant AI calls
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
      let enrichStart = Date.now();
      if (sd && !sd._orchestratorChecked) {
        sd = await this.enrichWithOrchestratorContext(sd);
        if (DEBUG) console.log(`${logPrefix} SD enrichment: ${Date.now() - enrichStart}ms`);
      }

      // Build evaluation prompt with sd_type and orchestrator context
      const messages = this.buildPrompt(content, sd);
      const promptTokenEstimate = Math.ceil((messages[0].content.length + messages[1].content.length) / 4);
      if (DEBUG) {
        console.log(`${logPrefix} Prompt built. Estimated tokens: ~${promptTokenEstimate}`);
        console.log(`${logPrefix} Calling OpenAI API (${this.model})...`);
      }

      // Call OpenAI API
      const apiStart = Date.now();
      const response = await this.callOpenAI(messages);
      const apiDuration = Date.now() - apiStart;

      if (DEBUG) {
        console.log(`${logPrefix} API response received in ${apiDuration}ms`);
        console.log(`${logPrefix} Tokens: prompt=${response.usage?.prompt_tokens}, completion=${response.usage?.completion_tokens}`);
      }

      // Parse scores
      let scores;
      let meta = { confidence: 'MEDIUM', confidence_reasoning: 'Default confidence' };
      const parseStart = Date.now();
      try {
        const parsed = JSON.parse(response.choices[0].message.content);
        // Extract _meta if present, then remove from scores
        if (parsed._meta) {
          meta = {
            confidence: parsed._meta.confidence || 'MEDIUM',
            confidence_reasoning: parsed._meta.confidence_reasoning || ''
          };
          delete parsed._meta;
        }
        scores = parsed;
        if (DEBUG) console.log(`${logPrefix} JSON parsed in ${Date.now() - parseStart}ms`);
      } catch (parseError) {
        console.error(`${logPrefix} Failed to parse OpenAI response. First 500 chars:`, response.choices[0].message.content.substring(0, 500));
        throw new Error(`JSON parse failed: ${parseError.message}`);
      }

      // Calculate weighted score
      const weightedScore = this.calculateWeightedScore(scores);

      // Determine scoring band (v1.2.0 - stabilizes pass/fail decisions)
      const band = this.determineBand(weightedScore);
      const confidence = meta.confidence;

      // Generate feedback (pass criteria config and sd for SD-type-aware blocking logic)
      const feedback = this.generateFeedback(scores, this.rubricConfig.criteria, sd);

      // Get dynamic pass threshold based on sd_type
      const threshold = this.getPassThreshold(this.rubricConfig.contentType, sd);

      // Determine passed status using bands + confidence (v1.2.0)
      // This provides stable decisions: 68% and 72% both get NEEDS_REVIEW band
      const passed = this.determinePassedStatus(band, confidence, weightedScore, threshold);

      // Track metrics
      const duration = Date.now() - startTime;
      const tokensUsed = response.usage;
      const cost = this.calculateCost(tokensUsed);

      if (DEBUG) {
        console.log(`${logPrefix} Score: ${weightedScore}% | Band: ${band} | Confidence: ${confidence}`);
        console.log(`${logPrefix} Threshold: ${threshold}% | Passed: ${passed ? 'YES' : 'NO'}`);
        console.log(`${logPrefix} Total duration: ${duration}ms (API: ${apiDuration}ms)`);
        console.log(`${logPrefix} Cost: $${cost.toFixed(6)}`);
      }

      // Store assessment in database (with content hash, band, confidence for cache validation)
      const storeStart = Date.now();
      await this.storeAssessment(
        contentId,
        scores,
        weightedScore,
        feedback,
        duration,
        tokensUsed,
        cost,
        sd,
        threshold,
        contentHash,
        band,
        confidence,
        meta.confidence_reasoning
      );
      if (DEBUG) console.log(`${logPrefix} Assessment stored in ${Date.now() - storeStart}ms`);

      return {
        scores,
        weightedScore,
        feedback,
        passed,
        threshold,
        // v1.2.0: Scoring bands for stable decisions
        band,
        confidence,
        confidence_reasoning: meta.confidence_reasoning,
        sd_type: sd?.sd_type || 'unknown',
        is_orchestrator: sd?._isOrchestrator || false,
        child_count: sd?._childCount || 0,
        duration,
        cost
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`${logPrefix} FAILED after ${duration}ms: ${error.message}`);
      if (error.stack && process.env.AI_DEBUG === 'true') {
        console.error(`${logPrefix} Stack:`, error.stack);
      }
      throw new Error(`AI evaluation failed: ${error.message}`);
    }
  }

  /**
   * Build OpenAI API prompt with rubric criteria and sd_type context
   */
  buildPrompt(content, sd = null) {
    const systemPrompt = this.getSystemPrompt(sd);
    const userPrompt = this.getUserPrompt(content);

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];
  }

  /**
   * Get system prompt (defines evaluation rules + LEO Protocol context)
   * Now includes sd_type-specific guidance for intelligent evaluation
   */
  getSystemPrompt(sd = null) {
    // Add SD type context if available
    let sdTypeContext = '';
    if (sd?.sd_type) {
      const typeLabel = sd._isOrchestrator
        ? `${sd.sd_type} (ORCHESTRATOR - ${sd._childCount} children)`
        : sd.sd_type;

      sdTypeContext = `\n\n**SD Type**: ${typeLabel}

**Evaluation Adjustments for ${sd.sd_type.toUpperCase()} SDs:**
${this.getTypeSpecificGuidance(sd.sd_type, sd)}`;
    }

    return `You are a quality evaluator for LEO Protocol deliverables.

**LEO Protocol Context:**
LEO Protocol is a database-first software development lifecycle with 3 phases:
- LEAD: Strategic approval (validates Strategic Directives)
- PLAN: Requirements & architecture (validates PRDs and User Stories)
- EXEC: Implementation (validates code and Retrospectives)

**Quality Philosophy:**
- Database-first: All requirements stored in database, not markdown files
- Anti-boilerplate: Reject generic text like "To be defined", "improve system"
- Specific & testable: Every requirement must have clear pass/fail criteria
- Russian Judge scoring: Multi-criterion weighted evaluation (like Olympic judging)

**Common LEO Anti-Patterns to Penalize Heavily:**
- Placeholder text: "To be defined", "TBD", "during planning"
- Generic benefits: "improve UX", "better system", "enhance functionality"
- Boilerplate acceptance criteria: "all tests passing", "code review completed"
- Missing architecture details: No data flow, no integration points
${sdTypeContext}

Your task is to score content across multiple criteria using a 0-10 scale:

**Scoring Scale:**
- 0-3: Completely inadequate (missing, boilerplate, or unusable)
- 4-6: Present but needs significant improvement
- 7-8: Good quality with minor issues
- 9-10: Excellent, exemplary quality (reserve for truly exceptional work)

**Important Rules:**
1. Be **strict but fair** - reserve 9-10 for truly exceptional work
2. Provide **specific reasoning** - explain why you gave each score in 1-2 sentences
3. Focus on **actionable feedback** - what needs improvement?
4. Avoid **grade inflation** - if something is mediocre, score it 4-6
5. **Penalize placeholders heavily** - "To be defined" should score 0-3
6. **Adjust strictness based on SD type** - apply the guidance above appropriately
7. **ALWAYS provide improvement suggestions** for scores below 8 - be specific about WHAT to change

Return ONLY valid JSON in this exact format:
{
  "criterion_name": {
    "score": <number 0-10>,
    "reasoning": "<1-2 sentence explanation of why this score>",
    "improvement": "<REQUIRED for scores <8: specific, actionable suggestion to improve this criterion. Example: 'Add baselines and targets to success metrics like: Baseline: 0% → Target: 80% coverage'. Leave empty string if score >= 8>"
  },
  "_meta": {
    "confidence": "<HIGH | MEDIUM | LOW - your confidence in this assessment>",
    "confidence_reasoning": "<1 sentence explaining confidence level>"
  }
}

**Confidence Guidelines:**
- HIGH: Clear evidence supports scores, no ambiguity in content quality
- MEDIUM: Reasonable assessment but some interpretation required
- LOW: Content is ambiguous, incomplete, or difficult to evaluate fairly

NO additional text, explanations, or markdown - ONLY the JSON object.`;
  }

  /**
   * Get type-specific evaluation guidance for different SD types
   * Helps the AI understand when to be lenient vs strict
   */
  getTypeSpecificGuidance(sdType, sd = null) {
    const guidance = {
      documentation: `- Relax technical architecture requirements (focus on clarity, not code design)
- Don't penalize for missing code-related details (UI components, API endpoints)
- Prioritize documentation coverage, organization, and completeness
- Accept simplified acceptance criteria for documentation tasks
- "As a developer, I need organized docs" is a valid user story`,

      infrastructure: `- De-emphasize user benefits (internal tooling, not customer-facing)
- "User" may be "developer" or "system" (this is acceptable)
- Focus on technical robustness, reliability, and operational excellence
- Prioritize system architecture over user stories
- Benefits can be technical (reduced deploy time, better monitoring, etc.)`,

      feature: `- Full evaluation across all criteria (customer-facing work)
- Balance user value with technical quality
- Require clear end-user benefit (not generic "improve system")
- Strict on UI/UX requirements and acceptance criteria
- Apply standard LEO Protocol quality standards

**LEO v4.4.0 - Human-Verifiable Outcome Requirement:**
- Feature SDs MUST include criteria that a non-technical person could verify
- Look for "smoke test" style outcomes: Navigate to X, click Y, see Z
- Penalize if ALL criteria are technical-only (API returns 200, data in database)
- Good: "User sees success toast within 2 seconds of clicking Save"
- Bad: "Data is correctly persisted to venture_artifacts table"
- If SD lacks human-verifiable outcomes, cap score at 70% for this criterion`,

      database: `- Prioritize schema design quality and data integrity
- Emphasize migration safety, rollback plans, and RLS policies
- Focus on risk analysis (data loss scenarios, downtime, corruption)
- Benefits can be technical (performance, data consistency, scalability)
- Strict on database-specific risks and mitigation strategies`,

      security: `- Extra weight on risk analysis and threat modeling
- Require specific security threat identification (not generic "security")
- Strict on authentication/authorization logic and OWASP compliance
- Emphasize security best practices and vulnerability prevention
- No assumptions about "secure by default" - require explicit security measures`
    };

    let baseGuidance = guidance[sdType] || guidance.feature;

    // Add orchestrator-specific guidance if applicable
    if (sd?._isOrchestrator) {
      const orchestratorGuidance = `

**ORCHESTRATOR SD CONTEXT (${sd._childCount} child SDs, ${sd._completedChildCount} completed):**
- This is a PARENT/ORCHESTRATOR SD that coordinates multiple child SDs
- It does NOT directly produce code, tests, or deliverables itself
- Children handle the actual implementation work
- Evaluate based on COORDINATION quality, not direct deliverable quality
- For 'improvement_area_depth': Focus on coordination patterns, dependency management, and child SD orchestration lessons - NOT missing test evidence (children handle testing)
- For 'learning_specificity': Lessons should be about orchestration patterns, parallel execution, child SD management
- For 'action_item_actionability': Actions should relate to improving future orchestration, not fixing code
- Do NOT penalize for "missing test evidence" - orchestrators delegate testing to children
- Score 7-8 for retrospectives that capture coordination insights even without deep root-cause analysis
- The value of an orchestrator retrospective is in meta-lessons about multi-SD coordination`;

      baseGuidance += orchestratorGuidance;
    }

    return baseGuidance;
  }

  /**
   * Get dynamic pass threshold based on content type and SD type
   * Start lenient (Phase 1), tighten based on empirical data (Phase 2+)
   *
   * Philosophy: Start lenient to avoid blocking work, then increase
   * thresholds where quality issues are detected in production.
   */
  getPassThreshold(contentType, sd = null) {
    if (!sd?.sd_type) return 60; // Default (lenient starting point)

    // PHASE 1: Start lenient, tighten based on data
    const thresholds = {
      // Documentation-only SDs: Very lenient (focus on clarity)
      documentation: 50,

      // Infrastructure SDs: Lenient (internal tooling)
      infrastructure: 55,

      // Feature SDs: Moderate baseline
      feature: 60,

      // Database SDs: Slightly stricter (data integrity)
      database: 65,

      // Security SDs: Stricter (but not blocking)
      security: 65
    };

    // Orchestrator SDs get even more lenient threshold (coordination, not direct work)
    if (sd._isOrchestrator) {
      return 50; // Very lenient - orchestrators coordinate, not produce
    }

    return thresholds[sd.sd_type] || 60; // Default to lenient
  }

  /**
   * Enrich SD object with orchestrator context
   * Detects if SD is a parent with children and adds relevant metadata
   *
   * @param {Object} sd - Strategic Directive object
   * @returns {Promise<Object>} Enriched SD object
   */
  async enrichWithOrchestratorContext(sd) {
    if (!sd || !sd.id) return sd;

    try {
      // Check if this SD has children
      const { data: children, error } = await this.supabase
        .from('strategic_directives_v2')
        .select('id, title, status, progress_percentage')
        .eq('parent_sd_id', sd.id);

      if (error) {
        console.warn(`Could not check orchestrator status for ${sd.id}:`, error.message);
        sd._orchestratorChecked = true;
        return sd;
      }

      const isOrchestrator = children && children.length > 0;
      const completedChildren = children?.filter(c => c.status === 'completed').length || 0;
      const totalChildren = children?.length || 0;

      // Enrich SD with orchestrator metadata
      return {
        ...sd,
        _orchestratorChecked: true,
        _isOrchestrator: isOrchestrator,
        _childCount: totalChildren,
        _completedChildCount: completedChildren,
        _childrenAllComplete: totalChildren > 0 && completedChildren === totalChildren
      };
    } catch (err) {
      console.warn(`Orchestrator check failed for ${sd.id}:`, err.message);
      sd._orchestratorChecked = true;
      return sd;
    }
  }

  /**
   * Get user prompt (content + rubric criteria)
   */
  getUserPrompt(content) {
    const criteriaPrompts = this.rubricConfig.criteria.map((criterion, idx) =>
      `${idx + 1}. **${criterion.name}** (${Math.round(criterion.weight * 100)}% weight):
${criterion.prompt}
`
    ).join('\n');

    return `Evaluate this ${this.rubricConfig.contentType} content:

${content}

---

**Evaluation Criteria:**

${criteriaPrompts}

Return JSON scores for ALL ${this.rubricConfig.criteria.length} criteria.`;
  }

  /**
   * Call OpenAI API with retry logic and rate limit handling
   * Note: gpt-5-mini doesn't support function/tool calling, so we use json_object mode
   */
  async callOpenAI(messages, retries = 3) {
    const timeoutMs = parseInt(process.env.AI_API_TIMEOUT_MS) || 60000; // Default 60s timeout
    const DEBUG = process.env.AI_DEBUG === 'true';

    for (let attempt = 1; attempt <= retries; attempt++) {
      const attemptStart = Date.now();
      try {
        if (DEBUG && attempt > 1) {
          console.log(`[OpenAI] Retry attempt ${attempt}/${retries}...`);
        }

        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`OpenAI API timeout after ${timeoutMs}ms`)), timeoutMs)
        );

        // Create API call promise
        const apiPromise = this.openai.chat.completions.create({
          model: this.model,
          messages,
          response_format: { type: 'json_object' },
          max_completion_tokens: 8000  // Increased to handle detailed multi-criterion responses with improvements
          // Note: gpt-5-mini only supports temperature=1 (default), so we don't set it
        });

        // Race between API call and timeout
        const response = await Promise.race([apiPromise, timeoutPromise]);

        if (DEBUG && attempt > 1) {
          console.log(`[OpenAI] Retry ${attempt} succeeded after ${Date.now() - attemptStart}ms`);
        }

        return response;
      } catch (error) {
        const attemptDuration = Date.now() - attemptStart;
        const isRateLimit = error.status === 429 || error.message?.includes('rate') || error.code === 'rate_limit_exceeded';
        const isTimeout = error.message?.includes('timeout');
        const isNetworkError = error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.message?.includes('network');

        // Enhanced error logging
        console.warn(`[OpenAI] Attempt ${attempt}/${retries} failed after ${attemptDuration}ms`);
        console.warn(`[OpenAI] Error type: ${isRateLimit ? 'RATE_LIMIT' : isTimeout ? 'TIMEOUT' : isNetworkError ? 'NETWORK' : 'OTHER'}`);
        console.warn(`[OpenAI] Error details: ${error.message || error.code || 'Unknown'}`);
        if (error.status) console.warn(`[OpenAI] HTTP status: ${error.status}`);

        if (attempt === retries) {
          if (isRateLimit) {
            throw new Error(`OpenAI rate limit exceeded after ${retries} retries. Try increasing AI_RATE_LIMIT_DELAY_MS (current: ${process.env.AI_RATE_LIMIT_DELAY_MS || '1500'}ms)`);
          }
          throw error;
        }

        // Rate limit: longer backoff (3s, 6s, 12s)
        // Timeout/other: exponential backoff (1s, 2s, 4s)
        const baseDelay = isRateLimit ? 3000 : 1000;
        const delay = Math.pow(2, attempt - 1) * baseDelay;
        console.warn(`[OpenAI] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Calculate weighted total score (0-100 scale)
   */
  calculateWeightedScore(scores) {
    let total = 0;

    for (const criterion of this.rubricConfig.criteria) {
      const scoreData = scores[criterion.name];
      if (!scoreData || typeof scoreData.score !== 'number') {
        console.warn(`Missing score for criterion: ${criterion.name}`);
        continue;
      }

      // Convert 0-10 score to percentage, then weight it
      const percentageScore = (scoreData.score / 10) * 100;
      total += percentageScore * criterion.weight;
    }

    return Math.round(total);
  }

  /**
   * Generate graduated feedback from scores
   *
   * Blocking issues (required) are only generated for:
   * - High-weight criteria (weight >= 0.15) with score < 5
   * - Medium-weight criteria (weight >= 0.10) with score < 3 (severe failure)
   *
   * Low-weight criteria (< 0.10) NEVER block, even with severe scores
   * This prevents a 5% weight criterion from blocking the entire handoff
   *
   * Phase 1 (ADVISORY): Calibrating thresholds based on empirical data
   */
  generateFeedback(scores, criteria = null, sd = null) {
    const required = [];
    const recommended = [];
    const improvements = []; // NEW: Actionable improvement suggestions

    // SD-TYPE-AWARE BLOCKING THRESHOLDS (Systemic Fix v1.1)
    // Infrastructure/documentation SDs get more lenient blocking thresholds
    // This aligns blocking behavior with the already SD-type-aware pass thresholds
    const sdType = sd?.sd_type || 'feature';
    const blockingConfig = this._getBlockingThresholds(sdType);

    // Build weight lookup from criteria config
    const weightLookup = {};
    if (criteria && Array.isArray(criteria)) {
      for (const c of criteria) {
        weightLookup[c.name] = c.weight;
      }
    }

    for (const [criterionName, scoreData] of Object.entries(scores)) {
      const score = scoreData.score;
      const reasoning = scoreData.reasoning;
      const improvement = scoreData.improvement || ''; // NEW: Get improvement suggestion
      const weight = weightLookup[criterionName] || 0.10; // Default to 10% if unknown

      // Collect improvement suggestions for any score < 8
      if (score < 8 && improvement) {
        improvements.push({
          criterion: criterionName,
          score,
          weight,
          suggestion: improvement
        });
      }

      // Low-weight criteria (<10%) NEVER block, regardless of score
      // This is critical for Phase 1 calibration (e.g., given_when_then_format at 5%)
      if (weight < 0.10) {
        if (score < 5) {
          recommended.push(`${criterionName}: Needs improvement (${score}/10) - ${reasoning}`);
        } else if (score < 7) {
          recommended.push(`${criterionName}: Room for improvement (${score}/10) - ${reasoning}`);
        }
        continue;
      }

      // For medium+ weight criteria (>=10%) - SD-TYPE-AWARE BLOCKING
      if (score < blockingConfig.severeThreshold && weight >= 0.10) {
        // Severe failure on medium+ weight criteria - blocking
        required.push(`${criterionName}: Needs significant improvement (${score}/10) - ${reasoning}`);
      } else if (score < blockingConfig.majorThreshold && weight >= 0.15) {
        // Major criterion failure - blocking only for high-weight criteria
        required.push(`${criterionName}: Needs significant improvement (${score}/10) - ${reasoning}`);
      } else if (score < 5) {
        // Medium-weight with score 3-4 - recommended, not blocking
        recommended.push(`${criterionName}: Needs improvement (${score}/10) - ${reasoning}`);
      } else if (score < 7) {
        recommended.push(`${criterionName}: Room for improvement (${score}/10) - ${reasoning}`);
      }
      // Scores 7+ are good, no feedback needed
    }

    return { required, recommended, improvements };
  }

  /**
   * Get SD-type-aware blocking thresholds for generateFeedback
   * Aligns blocking behavior with pass thresholds by SD type
   *
   * @param {string} sdType - SD type (feature, infrastructure, documentation, etc.)
   * @returns {Object} { severeThreshold, majorThreshold }
   */
  _getBlockingThresholds(sdType) {
    // SD-type-aware blocking thresholds
    // More lenient for infrastructure/documentation SDs
    const thresholds = {
      // Documentation SDs: Very lenient - almost never block on criterion scores
      documentation: { severeThreshold: 1, majorThreshold: 2 },

      // Infrastructure SDs: Lenient - only block on truly severe failures
      infrastructure: { severeThreshold: 2, majorThreshold: 3 },

      // Feature SDs: Standard thresholds (default behavior)
      feature: { severeThreshold: 3, majorThreshold: 5 },

      // Database SDs: Moderate
      database: { severeThreshold: 3, majorThreshold: 4 },

      // Security SDs: Strict - maintain high standards
      security: { severeThreshold: 3, majorThreshold: 5 }
    };

    return thresholds[sdType] || thresholds.feature;
  }

  /**
   * Calculate cost in USD
   */
  calculateCost(tokensUsed) {
    // gpt-5-mini pricing (as of 2025)
    const INPUT_COST_PER_MILLION = 0.15;  // $0.15 per 1M input tokens
    const OUTPUT_COST_PER_MILLION = 0.60; // $0.60 per 1M output tokens

    const inputCost = (tokensUsed.prompt_tokens / 1_000_000) * INPUT_COST_PER_MILLION;
    const outputCost = (tokensUsed.completion_tokens / 1_000_000) * OUTPUT_COST_PER_MILLION;

    return inputCost + outputCost;
  }

  /**
   * Store assessment in database with sd_type, threshold tracking, band, and confidence
   * v1.2.0: Added band and confidence for stable decision caching
   */
  async storeAssessment(contentId, scores, weightedScore, feedback, duration, tokensUsed, cost, sd = null, threshold = 70, contentHash = null, band = null, confidence = null, confidenceReasoning = null) {
    // Guard: Skip storage if contentId is null/undefined (prevents NOT NULL constraint violation)
    if (!contentId) {
      console.warn(`[AIQualityEvaluator] Skipping assessment storage: content_id is ${contentId === null ? 'null' : 'undefined'} for content_type=${this.rubricConfig.contentType}`);
      console.warn(`[AIQualityEvaluator] This may indicate a missing 'id' field in the evaluated content. Score: ${weightedScore}%`);
      return;
    }

    try {
      const insertData = {
        content_type: this.rubricConfig.contentType,
        content_id: contentId,
        model: this.model,
        temperature: this.temperature,
        scores,
        weighted_score: weightedScore,
        feedback,
        assessment_duration_ms: duration,
        tokens_used: tokensUsed,
        cost_usd: cost,
        rubric_version: 'v1.2.0-scoring-bands',
        sd_type: sd?.sd_type || null,
        pass_threshold: threshold
      };

      // v1.2.0: Include band and confidence for stable decision caching
      // These columns may not exist in older schema - handled gracefully below
      if (band) insertData.band = band;
      if (confidence) insertData.confidence = confidence;
      if (confidenceReasoning) insertData.confidence_reasoning = confidenceReasoning;

      // SYSTEMIC FIX: Include content_hash for cache invalidation (if column exists)
      if (contentHash) {
        insertData.content_hash = contentHash;
      }

      const { error } = await this.supabase
        .from('ai_quality_assessments')
        .insert(insertData);

      if (error) {
        // Handle missing columns gracefully (backward compatible)
        const missingColumnFields = ['content_hash', 'band', 'confidence', 'confidence_reasoning'];
        let needsRetry = false;

        for (const field of missingColumnFields) {
          if (error.message?.includes(field)) {
            delete insertData[field];
            needsRetry = true;
          }
        }

        if (needsRetry) {
          const { error: retryError } = await this.supabase
            .from('ai_quality_assessments')
            .insert(insertData);
          if (retryError) {
            console.error('Failed to store assessment (retry):', retryError);
          }
        } else {
          console.error('Failed to store assessment:', error);
        }
        // Don't throw - assessment succeeded even if storage failed
      }
    } catch (error) {
      console.error('Database storage error:', error);
      // Don't throw - assessment succeeded even if storage failed
    }
  }
}
