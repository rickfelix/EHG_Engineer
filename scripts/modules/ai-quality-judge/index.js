/**
 * AI Quality Judge Module
 * Phase 1: SD-LEO-SELF-IMPROVE-AIJUDGE-001
 *
 * Evaluates protocol improvement proposals using multi-criterion scoring
 * and validates against constitution rules.
 *
 * Features:
 * - Constitution rule validation (9 immutable rules)
 * - Russian Judge pattern (multi-criterion weighted scoring)
 * - Model diversity (different families for proposer vs evaluator)
 * - GOVERNED pipeline (human approval required)
 */

import { createClient } from '@supabase/supabase-js';
import { getLLMClient } from '../../../lib/llm/client-factory.js';
import { ConstitutionValidator } from './constitution-validator.js';
import { AssessmentStorage } from './storage.js';
import { generateEvaluationPrompt } from './prompts.js';
import {
  parseAIScores,
  createScoringResult,
  generateScoringSummary
} from './scoring.js';
import { MODEL_CONFIG } from './config.js';

/**
 * AIQualityJudge class
 * Main entry point for improvement evaluation
 */
export class AIQualityJudge {
  constructor(options = {}) {
    this.supabase = options.supabase || createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    this.openai = options.openai || getLLMClient({ purpose: 'validation' });

    this.constitutionValidator = new ConstitutionValidator(this.supabase);
    this.storage = new AssessmentStorage(this.supabase);

    this.evaluatorModel = options.evaluatorModel || MODEL_CONFIG.evaluator.model;
    this.temperature = options.temperature || MODEL_CONFIG.evaluator.temperature;
  }

  /**
   * Evaluate a single improvement proposal
   *
   * @param {string} improvementId - UUID of the improvement to evaluate
   * @param {Object} options - Evaluation options
   * @returns {Object} Complete evaluation result
   */
  async evaluate(improvementId, options = {}) {
    console.log(`\n🔍 AI Quality Judge: Evaluating improvement ${improvementId}`);
    console.log('─'.repeat(60));

    // 1. Load the improvement
    const improvement = await this.storage.getImprovement(improvementId);
    if (!improvement) {
      throw new Error(`Improvement not found: ${improvementId}`);
    }

    console.log(`   Type: ${improvement.improvement_type || 'UNKNOWN'}`);
    console.log(`   Target: ${improvement.target_table || 'N/A'}`);
    console.log(`   Risk Tier: ${improvement.risk_tier || 'UNKNOWN'}`);

    // 2. Run constitution validation
    console.log('\n📜 Constitution Validation...');
    const constitutionResult = await this.constitutionValidator.validate(improvement, {
      evaluator_model: this.evaluatorModel,
      proposer_model: options.proposer_model || 'claude-sonnet-4-20250514'
    });

    if (!constitutionResult.passed) {
      console.log(`   ❌ CRITICAL violations found: ${constitutionResult.critical_count}`);
      for (const violation of constitutionResult.violations.filter(v => v.severity === 'CRITICAL')) {
        console.log(`      - ${violation.rule_code}: ${violation.message}`);
      }

      // Record violations and return early
      await this.storage.recordConstitutionViolations(improvementId, constitutionResult.violations);

      const result = {
        improvement_id: improvementId,
        constitution_check: constitutionResult,
        passed: false,
        score: 0,
        recommendation: 'REJECT',
        reason: 'Constitution violation',
        evaluator_model: this.evaluatorModel,
        evaluated_at: new Date().toISOString()
      };

      // Save assessment
      await this.storage.saveAssessment({
        ...result,
        aggregate_score: 0,
        criteria_scores: {},
        reasoning: `Rejected due to constitution violations: ${constitutionResult.violations.map(v => v.rule_code).join(', ')}`
      });

      // Update improvement status
      await this.storage.updateImprovementStatus(improvementId, {
        status: 'REJECTED',
        reviewed_at: new Date().toISOString(),
        metadata: improvement.metadata ?
          { ...improvement.metadata, rejection_reason: 'constitution_violation' } :
          { rejection_reason: 'constitution_violation' }
      });

      return result;
    }

    console.log(`   ✅ Constitution check passed (${constitutionResult.rules_checked} rules)`);
    if (constitutionResult.high_count > 0 || constitutionResult.medium_count > 0) {
      console.log(`   ⚠️  ${constitutionResult.high_count} HIGH, ${constitutionResult.medium_count} MEDIUM warnings`);
    }

    // 3. Get constitution rules for AI context
    const constitutionRules = await this.constitutionValidator.loadRules();

    // 4. Generate evaluation prompt and call AI
    console.log('\n🤖 AI Quality Scoring...');
    console.log(`   Model: ${this.evaluatorModel} (temp: ${this.temperature})`);

    const prompt = generateEvaluationPrompt(improvement, constitutionRules);
    const aiResponse = await this.callEvaluatorAI(prompt);

    // 5. Parse AI response
    let parsedResponse;
    try {
      const jsonMatch = aiResponse.match(/```json\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[1]);
      } else {
        parsedResponse = JSON.parse(aiResponse);
      }
    } catch (_e) {
      console.log('   ⚠️  Failed to parse AI response, using fallback scoring');
      parsedResponse = {
        criteria_scores: parseAIScores(aiResponse),
        reasoning: { summary: aiResponse.substring(0, 500) }
      };
    }

    // 6. Calculate final score
    const criteriaScores = parsedResponse.criteria_scores || {};
    const scoringResult = createScoringResult(
      criteriaScores,
      parsedResponse.summary || parsedResponse.reasoning?.summary || ''
    );

    console.log('\n' + generateScoringSummary(
      scoringResult.criteria_scores,
      scoringResult.aggregate_score,
      scoringResult.recommendation
    ));

    // 7. Save assessment to database
    const assessment = await this.storage.saveAssessment({
      improvement_id: improvementId,
      evaluator_model: this.evaluatorModel,
      aggregate_score: scoringResult.aggregate_score,
      criteria_scores: scoringResult.criteria_scores,
      recommendation: scoringResult.recommendation,
      reasoning: scoringResult.reasoning,
      evaluated_at: scoringResult.scored_at
    });

    console.log(`\n💾 Assessment saved: ${assessment.id}`);

    // 8. Determine if human review is needed
    const requiresHumanReview =
      scoringResult.recommendation !== 'APPROVE' ||
      scoringResult.confidence === 'LOW' ||
      constitutionResult.requires_human_review ||
      improvement.risk_tier !== 'AUTO';

    if (requiresHumanReview) {
      console.log('👤 Human review required');
    }

    return {
      improvement_id: improvementId,
      assessment_id: assessment.id,
      constitution_check: constitutionResult,
      score: scoringResult.aggregate_score,
      criteria_scores: scoringResult.criteria_scores,
      recommendation: scoringResult.recommendation,
      confidence: scoringResult.confidence,
      reasoning: scoringResult.reasoning,
      requires_human_review: requiresHumanReview,
      evaluator_model: this.evaluatorModel,
      evaluated_at: scoringResult.scored_at
    };
  }

  /**
   * Call the evaluator AI model
   *
   * @param {string} prompt - Evaluation prompt
   * @returns {string} AI response
   */
  async callEvaluatorAI(prompt) {
    const response = await this.openai.chat.completions.create({
      model: this.evaluatorModel,
      temperature: this.temperature,
      messages: [
        {
          role: 'system',
          content: 'You are an AI Quality Judge evaluating protocol improvement proposals. Respond only with valid JSON as specified in the prompt.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_completion_tokens: 2000  // Updated from deprecated max_tokens
    });

    return response.choices[0].message.content;
  }

  /**
   * Evaluate multiple improvements in batch
   *
   * @param {Object} options - Batch options (limit, risk_tier, threshold)
   * @returns {Object} Batch evaluation results
   */
  async evaluatePending(options = {}) {
    const limit = options.limit || 10;
    const threshold = options.threshold || 70;

    console.log('\n📋 AI Quality Judge: Batch Evaluation');
    console.log(`   Limit: ${limit} | Threshold: ${threshold}%`);
    console.log('─'.repeat(60));

    // Get pending improvements
    const improvements = await this.storage.getPendingImprovements({
      limit,
      risk_tier: options.risk_tier
    });

    if (improvements.length === 0) {
      console.log('   No pending improvements to evaluate');
      return { evaluated: 0, results: [] };
    }

    console.log(`   Found ${improvements.length} pending improvements`);

    const results = [];

    for (const improvement of improvements) {
      try {
        const result = await this.evaluate(improvement.id, options);
        results.push(result);
      } catch (error) {
        console.error(`   ❌ Error evaluating ${improvement.id}: ${error.message}`);
        results.push({
          improvement_id: improvement.id,
          error: error.message
        });
      }
    }

    // Summary
    const approved = results.filter(r => r.recommendation === 'APPROVE').length;
    const needsRevision = results.filter(r => r.recommendation === 'NEEDS_REVISION').length;
    const rejected = results.filter(r => r.recommendation === 'REJECT' || r.error).length;

    console.log('\n📊 Batch Summary:');
    console.log(`   ✅ Approved: ${approved}`);
    console.log(`   ⚠️  Needs Revision: ${needsRevision}`);
    console.log(`   ❌ Rejected: ${rejected}`);

    return {
      evaluated: results.length,
      approved,
      needs_revision: needsRevision,
      rejected,
      results
    };
  }

  /**
   * Get evaluation report for an improvement
   *
   * @param {string} improvementId - Improvement UUID
   * @returns {Object} Detailed evaluation report
   */
  async getReport(improvementId) {
    const improvement = await this.storage.getImprovement(improvementId);
    if (!improvement) {
      throw new Error(`Improvement not found: ${improvementId}`);
    }

    const assessments = await this.storage.getAssessmentHistory(improvementId);
    const latestAssessment = assessments[0];

    return {
      improvement: {
        id: improvement.id,
        type: improvement.improvement_type,
        target_table: improvement.target_table,
        target_operation: improvement.target_operation,
        risk_tier: improvement.risk_tier,
        status: improvement.status,
        description: improvement.description,
        evidence_count: improvement.evidence_count
      },
      assessment: latestAssessment ? {
        score: latestAssessment.score,
        criteria_scores: latestAssessment.criteria_scores,
        recommendation: latestAssessment.recommendation,
        reasoning: latestAssessment.reasoning,
        evaluator_model: latestAssessment.evaluator_model,
        evaluated_at: latestAssessment.evaluated_at
      } : null,
      assessment_count: assessments.length,
      constitution_violations: improvement.metadata?.constitution_violations
    };
  }

  /**
   * Get statistics about evaluations
   *
   * @returns {Object} Evaluation statistics
   */
  async getStatistics() {
    return await this.storage.getStatistics();
  }
}

/**
 * Create an AIQualityJudge instance
 *
 * @param {Object} options - Configuration options
 * @returns {AIQualityJudge} Judge instance
 */
export function createAIQualityJudge(options = {}) {
  return new AIQualityJudge(options);
}

// Export all modules for direct access
export { ConstitutionValidator } from './constitution-validator.js';
export { AssessmentStorage } from './storage.js';
export * from './scoring.js';
export * from './prompts.js';
export * from './config.js';

export default AIQualityJudge;
