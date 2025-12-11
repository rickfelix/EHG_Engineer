/**
 * AI Quality Evaluator - Foundation Class
 *
 * Provides AI-powered quality assessment using gpt-5-mini with Russian Judge
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
 * @version 1.1.0-sd-type-aware
 * @see {@link ../docs/russian-judge-quality-system.md} Complete documentation
 * @see {@link ../config/russian-judge-thresholds.json} Threshold configuration
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';

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
    this.model = 'gpt-5-mini';
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

    try {
      // Build evaluation prompt with sd_type context
      const messages = this.buildPrompt(content, sd);

      // Call OpenAI API
      const response = await this.callOpenAI(messages);

      // Parse scores
      let scores;
      try {
        scores = JSON.parse(response.choices[0].message.content);
      } catch (parseError) {
        console.error('Failed to parse OpenAI response. First 500 chars:', response.choices[0].message.content.substring(0, 500));
        throw new Error(`JSON parse failed: ${parseError.message}`);
      }

      // Calculate weighted score
      const weightedScore = this.calculateWeightedScore(scores);

      // Generate feedback (pass criteria config to enable weight-based blocking logic)
      const feedback = this.generateFeedback(scores, this.rubricConfig.criteria);

      // Get dynamic pass threshold based on sd_type
      const threshold = this.getPassThreshold(this.rubricConfig.contentType, sd);
      const passed = weightedScore >= threshold;

      // Track metrics
      const duration = Date.now() - startTime;
      const tokensUsed = response.usage;
      const cost = this.calculateCost(tokensUsed);

      // Store assessment in database
      await this.storeAssessment(
        contentId,
        scores,
        weightedScore,
        feedback,
        duration,
        tokensUsed,
        cost,
        sd,
        threshold
      );

      return {
        scores,
        weightedScore,
        feedback,
        passed,
        threshold,
        sd_type: sd?.sd_type || 'unknown',
        duration,
        cost
      };
    } catch (error) {
      console.error('AI Quality Evaluation Error:', error);
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
      sdTypeContext = `\n\n**SD Type**: ${sd.sd_type}

**Evaluation Adjustments for ${sd.sd_type.toUpperCase()} SDs:**
${this.getTypeSpecificGuidance(sd.sd_type)}`;
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
  }
}

NO additional text, explanations, or markdown - ONLY the JSON object.`;
  }

  /**
   * Get type-specific evaluation guidance for different SD types
   * Helps the AI understand when to be lenient vs strict
   */
  getTypeSpecificGuidance(sdType) {
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
- Apply standard LEO Protocol quality standards`,

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

    return guidance[sdType] || guidance.feature;
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

    return thresholds[sd.sd_type] || 60; // Default to lenient
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
   * Call OpenAI API with retry logic
   * Note: gpt-5-mini doesn't support function/tool calling, so we use json_object mode
   */
  async callOpenAI(messages, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await this.openai.chat.completions.create({
          model: this.model,
          messages,
          response_format: { type: 'json_object' },
          max_completion_tokens: 4000  // High limit to prevent JSON truncation (quality over cost)
          // Note: gpt-5-mini only supports temperature=1 (default), so we don't set it
        });

        return response;
      } catch (error) {
        if (attempt === retries) throw error;

        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        console.warn(`OpenAI API attempt ${attempt} failed, retrying in ${delay}ms...`);
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
  generateFeedback(scores, criteria = null) {
    const required = [];
    const recommended = [];
    const improvements = []; // NEW: Actionable improvement suggestions

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

      // For medium+ weight criteria (>=10%)
      if (score < 3 && weight >= 0.10) {
        // Severe failure on medium+ weight criteria - blocking
        required.push(`${criterionName}: Needs significant improvement (${score}/10) - ${reasoning}`);
      } else if (score < 5 && weight >= 0.15) {
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
   * Store assessment in database with sd_type and threshold tracking
   */
  async storeAssessment(contentId, scores, weightedScore, feedback, duration, tokensUsed, cost, sd = null, threshold = 70) {
    // Guard: Skip storage if contentId is null/undefined (prevents NOT NULL constraint violation)
    if (!contentId) {
      console.warn(`[AIQualityEvaluator] Skipping assessment storage: content_id is ${contentId === null ? 'null' : 'undefined'} for content_type=${this.rubricConfig.contentType}`);
      console.warn(`[AIQualityEvaluator] This may indicate a missing 'id' field in the evaluated content. Score: ${weightedScore}%`);
      return;
    }

    try {
      const { error } = await this.supabase
        .from('ai_quality_assessments')
        .insert({
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
          rubric_version: 'v1.1.0-sd-type-aware',  // Updated version
          sd_type: sd?.sd_type || null,
          pass_threshold: threshold
        });

      if (error) {
        console.error('Failed to store assessment:', error);
        // Don't throw - assessment succeeded even if storage failed
      }
    } catch (error) {
      console.error('Database storage error:', error);
      // Don't throw - assessment succeeded even if storage failed
    }
  }
}
