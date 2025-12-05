/**
 * AI Quality Evaluator - Foundation Class
 *
 * Provides AI-powered quality assessment using gpt-5-mini with Russian Judge
 * multi-criterion weighted rubrics (0-10 scale per criterion).
 *
 * All rubrics (SD, PRD, User Story, Retrospective) extend this class.
 *
 * @module ai-quality-evaluator
 * @version 1.0.0
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
   * @returns {Promise<Object>} Assessment result
   */
  async evaluate(content, contentId) {
    const startTime = Date.now();

    try {
      // Build evaluation prompt
      const messages = this.buildPrompt(content);

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

      // Generate feedback
      const feedback = this.generateFeedback(scores);

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
        cost
      );

      return {
        scores,
        weightedScore,
        feedback,
        passed: weightedScore >= 70,
        duration,
        cost
      };
    } catch (error) {
      console.error('AI Quality Evaluation Error:', error);
      throw new Error(`AI evaluation failed: ${error.message}`);
    }
  }

  /**
   * Build OpenAI API prompt with rubric criteria
   */
  buildPrompt(content) {
    const systemPrompt = this.getSystemPrompt();
    const userPrompt = this.getUserPrompt(content);

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];
  }

  /**
   * Get system prompt (defines evaluation rules + LEO Protocol context)
   */
  getSystemPrompt() {
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

Return ONLY valid JSON in this exact format:
{
  "criterion_name": {
    "score": <number 0-10>,
    "reasoning": "<1-2 sentence explanation>"
  }
}

NO additional text, explanations, or markdown - ONLY the JSON object.`;
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
   */
  generateFeedback(scores) {
    const required = [];
    const recommended = [];

    for (const [criterionName, scoreData] of Object.entries(scores)) {
      const score = scoreData.score;
      const reasoning = scoreData.reasoning;

      if (score < 5) {
        required.push(`${criterionName}: Needs significant improvement (${score}/10) - ${reasoning}`);
      } else if (score < 7) {
        recommended.push(`${criterionName}: Room for improvement (${score}/10) - ${reasoning}`);
      }
      // Scores 7+ are good, no feedback needed
    }

    return { required, recommended };
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
   * Store assessment in database
   */
  async storeAssessment(contentId, scores, weightedScore, feedback, duration, tokensUsed, cost) {
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
          rubric_version: 'v1.0.0'
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
