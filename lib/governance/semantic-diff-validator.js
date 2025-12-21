/**
 * SemanticDiffValidator - 60/40 Truth Law Gate for Crew Outputs
 *
 * OPERATION 'GOVERNED ENGINE' v5.1.0
 *
 * THE LAW: truth_score = (business_accuracy * 0.6) + (technical_accuracy * 0.4)
 *
 * Replaces deprecated 'Git Commit' validation with semantic analysis:
 * 1. Business Accuracy (60%): Does the output align with venture strategy?
 * 2. Technical Accuracy (40%): Is the output technically sound?
 *
 * If truth_score < gate_threshold (default 0.7), the crew output is REJECTED.
 *
 * @module SemanticDiffValidator
 * @version 5.1.0
 */

import { createSupabaseServiceClient } from '../supabase-client.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const GATE_CONFIG = {
  // THE LAW: 60/40 Truth Law
  businessWeight: 0.6,
  technicalWeight: 0.4,

  // Gate threshold (output rejected if below)
  gateThreshold: 0.7,

  // Warning threshold (log warning but don't reject)
  warningThreshold: 0.8,

  // Semantic similarity threshold for alignment check
  similarityThreshold: 0.65,

  // Patterns that indicate low-quality output
  lowQualityPatterns: [
    /lorem ipsum/i,
    /placeholder/i,
    /todo:/i,
    /fixme:/i,
    /implementation pending/i,
    /not implemented/i,
    /to be determined/i,
    /\[insert.*\]/i
  ],

  // Required business keywords by context
  businessKeywords: {
    healthcare: ['patient', 'clinical', 'diagnosis', 'treatment', 'care', 'health', 'medical'],
    fintech: ['transaction', 'payment', 'account', 'balance', 'financial', 'banking', 'ledger'],
    edtech: ['learning', 'student', 'course', 'curriculum', 'assessment', 'education', 'progress'],
    logistics: ['shipment', 'delivery', 'tracking', 'warehouse', 'inventory', 'route', 'freight'],
    other: ['user', 'customer', 'business', 'value', 'outcome', 'goal']
  }
};

// =============================================================================
// EXCEPTIONS
// =============================================================================

export class SemanticGateRejectionError extends Error {
  constructor(truthScore, gateThreshold, reason) {
    super(`SEMANTIC GATE REJECTED: Truth score ${truthScore.toFixed(3)} < threshold ${gateThreshold}`);
    this.name = 'SemanticGateRejectionError';
    this.truthScore = truthScore;
    this.gateThreshold = gateThreshold;
    this.reason = reason;
    this.isRetryable = false;
  }
}

// =============================================================================
// SEMANTIC DIFF VALIDATOR
// =============================================================================

export class SemanticDiffValidator {
  constructor(options = {}) {
    this.supabase = createSupabaseServiceClient();
    this.config = { ...GATE_CONFIG, ...options };
    this.openai = options.openai || null; // Optional OpenAI for embeddings
  }

  /**
   * Validate crew output against 60/40 Truth Law
   *
   * @param {Object} crewOutput - The crew's output to validate
   * @param {Object} context - Execution context
   * @param {string} context.ventureId - MANDATORY: Venture ID
   * @param {string} context.prdId - PRD ID for alignment check
   * @param {string} context.sdId - Strategic Directive ID
   * @param {string} context.vertical - Venture vertical (healthcare, fintech, etc.)
   * @param {string} context.executionId - Flow execution ID
   * @returns {Object} Validation result with truth_score and passed_gate
   */
  async validate(crewOutput, context) {
    // GOVERNANCE: venture_id is MANDATORY
    if (!context.ventureId) {
      throw new Error('GOVERNANCE VIOLATION: ventureId is MANDATORY for semantic validation (GOVERNED-ENGINE-v5.1.0)');
    }

    console.log(`[SEMANTIC-GATE] Validating crew output for venture ${context.ventureId}`);

    // 1. Extract content from crew output
    const content = this._extractContent(crewOutput);

    // 2. Calculate Business Accuracy (60%)
    const businessAccuracy = await this._calculateBusinessAccuracy(content, context);
    console.log(`[SEMANTIC-GATE] Business accuracy: ${(businessAccuracy * 100).toFixed(1)}%`);

    // 3. Calculate Technical Accuracy (40%)
    const technicalAccuracy = this._calculateTechnicalAccuracy(content, crewOutput);
    console.log(`[SEMANTIC-GATE] Technical accuracy: ${(technicalAccuracy * 100).toFixed(1)}%`);

    // 4. Apply 60/40 Truth Law
    const truthScore = (businessAccuracy * this.config.businessWeight) +
                       (technicalAccuracy * this.config.technicalWeight);
    console.log(`[SEMANTIC-GATE] Truth score: ${(truthScore * 100).toFixed(1)}% (threshold: ${this.config.gateThreshold * 100}%)`);

    // 5. Determine pass/fail
    const passedGate = truthScore >= this.config.gateThreshold;
    let rejectionReason = null;

    if (!passedGate) {
      rejectionReason = this._determineRejectionReason(businessAccuracy, technicalAccuracy, content);
      console.warn(`[SEMANTIC-GATE] REJECTED: ${rejectionReason}`);
    } else if (truthScore < this.config.warningThreshold) {
      console.warn(`[SEMANTIC-GATE] WARNING: Truth score ${(truthScore * 100).toFixed(1)}% is below optimal threshold`);
    }

    // 6. Store validation result
    const validationResult = {
      businessAccuracy,
      technicalAccuracy,
      truthScore,
      passedGate,
      gateThreshold: this.config.gateThreshold,
      rejectionReason,
      validatedAt: new Date().toISOString()
    };

    await this._storeValidationResult(crewOutput, context, validationResult);

    // 7. Throw if rejected
    if (!passedGate) {
      throw new SemanticGateRejectionError(
        truthScore,
        this.config.gateThreshold,
        rejectionReason
      );
    }

    return validationResult;
  }

  /**
   * Extract content string from various crew output formats
   */
  _extractContent(crewOutput) {
    if (typeof crewOutput === 'string') {
      return crewOutput;
    }

    // Handle common output structures
    const contentFields = ['content', 'output', 'result', 'text', 'response', 'message'];
    for (const field of contentFields) {
      if (crewOutput[field]) {
        if (typeof crewOutput[field] === 'string') {
          return crewOutput[field];
        }
        if (typeof crewOutput[field] === 'object') {
          return JSON.stringify(crewOutput[field]);
        }
      }
    }

    // Fallback: stringify the whole output
    return JSON.stringify(crewOutput);
  }

  /**
   * Calculate Business Accuracy (60% weight)
   *
   * Factors:
   * 1. Keyword presence for vertical
   * 2. PRD/SD alignment (if available)
   * 3. Absence of low-quality patterns
   */
  async _calculateBusinessAccuracy(content, context) {
    let score = 0;
    let factors = 0;

    // Factor 1: Vertical keyword presence (0-1)
    const vertical = context.vertical || 'other';
    const keywords = this.config.businessKeywords[vertical] || this.config.businessKeywords.other;
    const contentLower = content.toLowerCase();

    let keywordMatches = 0;
    for (const keyword of keywords) {
      if (contentLower.includes(keyword)) {
        keywordMatches++;
      }
    }
    const keywordScore = Math.min(keywordMatches / 3, 1); // At least 3 keywords for full score
    score += keywordScore;
    factors++;

    // Factor 2: Low-quality pattern absence (0-1)
    let lowQualityMatches = 0;
    for (const pattern of this.config.lowQualityPatterns) {
      if (pattern.test(content)) {
        lowQualityMatches++;
      }
    }
    const qualityScore = Math.max(0, 1 - (lowQualityMatches * 0.25)); // -25% per low-quality pattern
    score += qualityScore;
    factors++;

    // Factor 3: Content substance (0-1)
    const wordCount = content.split(/\s+/).length;
    const substanceScore = Math.min(wordCount / 100, 1); // At least 100 words for full score
    score += substanceScore;
    factors++;

    // Factor 4: PRD alignment (if prdId provided)
    if (context.prdId) {
      const alignmentScore = await this._checkPrdAlignment(content, context.prdId, context.ventureId);
      score += alignmentScore;
      factors++;
    }

    return score / factors;
  }

  /**
   * Calculate Technical Accuracy (40% weight)
   *
   * Factors:
   * 1. Structural completeness
   * 2. No obvious technical errors
   * 3. Consistent formatting
   */
  _calculateTechnicalAccuracy(content, crewOutput) {
    let score = 0;
    let factors = 0;

    // Factor 1: Structural completeness (0-1)
    // Check if output has expected structure
    if (typeof crewOutput === 'object' && crewOutput !== null) {
      const hasRequiredFields = Object.keys(crewOutput).length > 0;
      const noNullValues = !Object.values(crewOutput).some(v => v === null || v === undefined);
      score += hasRequiredFields ? 0.5 : 0;
      score += noNullValues ? 0.5 : 0;
    } else if (typeof crewOutput === 'string' && crewOutput.trim().length > 0) {
      score += 1;
    }
    factors++;

    // Factor 2: No error indicators (0-1)
    const errorPatterns = [
      /error:/i,
      /exception:/i,
      /failed to/i,
      /could not/i,
      /unable to/i,
      /invalid/i,
      /undefined/i,
      /null pointer/i
    ];
    let errorMatches = 0;
    for (const pattern of errorPatterns) {
      if (pattern.test(content)) {
        errorMatches++;
      }
    }
    score += Math.max(0, 1 - (errorMatches * 0.2));
    factors++;

    // Factor 3: Formatting consistency (0-1)
    // Check for balanced brackets, consistent structure
    const brackets = {
      '{': 0,
      '}': 0,
      '[': 0,
      ']': 0,
      '(': 0,
      ')': 0
    };
    for (const char of content) {
      if (brackets[char] !== undefined) {
        brackets[char]++;
      }
    }
    const balanced = (brackets['{'] === brackets['}']) &&
                     (brackets['['] === brackets[']']) &&
                     (brackets['('] === brackets[')']);
    score += balanced ? 1 : 0.5;
    factors++;

    return score / factors;
  }

  /**
   * Check alignment with PRD content
   */
  async _checkPrdAlignment(content, prdId, ventureId) {
    try {
      // Get PRD content
      const { data: prd, error } = await this.supabase
        .from('product_requirements_v2')
        .select('problem_statement, target_users, success_criteria')
        .eq('id', prdId)
        .single();

      if (error || !prd) {
        console.warn(`[SEMANTIC-GATE] Could not fetch PRD ${prdId}: ${error?.message}`);
        return 0.5; // Neutral score if PRD not found
      }

      // Simple keyword matching for alignment
      const prdContent = [
        prd.problem_statement || '',
        JSON.stringify(prd.target_users || ''),
        JSON.stringify(prd.success_criteria || '')
      ].join(' ').toLowerCase();

      const contentLower = content.toLowerCase();
      const prdKeywords = prdContent.split(/\s+/).filter(w => w.length > 4);

      let matches = 0;
      const sampleSize = Math.min(prdKeywords.length, 20);
      const sampledKeywords = prdKeywords.slice(0, sampleSize);

      for (const keyword of sampledKeywords) {
        if (contentLower.includes(keyword)) {
          matches++;
        }
      }

      return sampleSize > 0 ? matches / sampleSize : 0.5;
    } catch (err) {
      console.error(`[SEMANTIC-GATE] Error checking PRD alignment: ${err.message}`);
      return 0.5;
    }
  }

  /**
   * Determine the reason for rejection
   */
  _determineRejectionReason(businessAccuracy, technicalAccuracy, content) {
    const reasons = [];

    if (businessAccuracy < 0.5) {
      reasons.push('Low business relevance - output lacks domain-specific content');
    }

    if (technicalAccuracy < 0.5) {
      reasons.push('Technical quality issues - incomplete or malformed output');
    }

    // Check for specific issues
    for (const pattern of this.config.lowQualityPatterns) {
      if (pattern.test(content)) {
        reasons.push(`Contains low-quality pattern: ${pattern.source}`);
        break;
      }
    }

    if (content.split(/\s+/).length < 50) {
      reasons.push('Insufficient content - output too brief');
    }

    return reasons.length > 0 ? reasons.join('; ') : 'Truth score below threshold';
  }

  /**
   * Store validation result in database
   */
  async _storeValidationResult(crewOutput, context, result) {
    try {
      const { error } = await this.supabase
        .from('crew_semantic_diffs')
        .insert({
          execution_id: context.executionId || null,
          venture_id: context.ventureId,
          prd_id: context.prdId || null,
          sd_id: context.sdId || null,
          crew_output: typeof crewOutput === 'string' ? { content: crewOutput } : crewOutput,
          business_accuracy: result.businessAccuracy,
          technical_accuracy: result.technicalAccuracy,
          passed_gate: result.passedGate,
          gate_threshold: result.gateThreshold,
          rejection_reason: result.rejectionReason,
          validated_by: 'SemanticDiffValidator-v5.1.0'
        });

      if (error) {
        console.error(`[SEMANTIC-GATE] Failed to store validation result: ${error.message}`);
      }
    } catch (err) {
      console.error(`[SEMANTIC-GATE] Error storing validation result: ${err.message}`);
    }
  }
}

// =============================================================================
// SINGLETON FACTORY
// =============================================================================

let validatorInstance = null;

/**
 * Get singleton SemanticDiffValidator instance
 */
export function getSemanticDiffValidator(options = {}) {
  if (!validatorInstance) {
    validatorInstance = new SemanticDiffValidator(options);
  }
  return validatorInstance;
}

export default { SemanticDiffValidator, getSemanticDiffValidator, SemanticGateRejectionError };
