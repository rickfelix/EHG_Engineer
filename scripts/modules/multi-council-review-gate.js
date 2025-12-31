/**
 * MULTI-COUNCIL REVIEW GATE (US-008)
 *
 * LEO Protocol v4.3.4 Enhancement - Addresses Genesis PRD Review feedback:
 * "Triangulated AI reviews (OpenAI, AntiGravity, Claude) should be coordinated"
 *
 * Implements a structured gate for collecting and reconciling reviews from
 * multiple AI councils (Claude, OpenAI/ChatGPT, AntiGravity) before approving
 * PRDs or major architectural decisions.
 *
 * @module multi-council-review-gate
 * @version 1.0.0
 * @see SD-LEO-PROTOCOL-V434-001
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Council identifiers and their capabilities
 */
export const COUNCILS = {
  CLAUDE: {
    id: 'claude',
    name: 'Claude (Anthropic)',
    capabilities: ['code-review', 'architecture', 'security', 'testing'],
    weight: 0.40  // Primary council for code-related decisions
  },
  OPENAI: {
    id: 'openai',
    name: 'OpenAI (ChatGPT)',
    capabilities: ['architecture', 'ux', 'documentation', 'user-stories'],
    weight: 0.35  // Strong for documentation and UX
  },
  ANTIGRAVITY: {
    id: 'antigravity',
    name: 'AntiGravity',
    capabilities: ['business', 'strategy', 'risk', 'market-fit'],
    weight: 0.25  // Focus on business alignment
  }
};

/**
 * Review decision types
 */
export const REVIEW_DECISIONS = {
  APPROVE: 'approve',
  APPROVE_WITH_CONDITIONS: 'approve_with_conditions',
  REQUEST_CHANGES: 'request_changes',
  REJECT: 'reject',
  ABSTAIN: 'abstain'
};

/**
 * Create a council review request
 * @param {Object} params - Review request parameters
 * @returns {Object} Review request object
 */
export function createReviewRequest(params) {
  const {
    sd_id,
    prd_id,
    review_type = 'prd_approval',
    artifact,
    context = {}
  } = params;

  return {
    id: `REVIEW-${Date.now()}`,
    created_at: new Date().toISOString(),
    sd_id,
    prd_id,
    review_type,
    artifact_summary: summarizeArtifact(artifact),
    context,
    reviews: {},
    status: 'pending',
    consensus: null,
    final_decision: null
  };
}

/**
 * Summarize artifact for review (PRD, SD, etc.)
 * @param {Object} artifact - Artifact to summarize
 * @returns {Object} Summary
 */
export function summarizeArtifact(artifact) {
  if (!artifact) return { type: 'unknown', summary: 'No artifact provided' };

  const summary = {
    type: artifact.type || (artifact.functional_requirements ? 'prd' : 'sd'),
    id: artifact.id,
    title: artifact.title
  };

  if (summary.type === 'prd') {
    summary.requirements_count = (artifact.functional_requirements || []).length;
    summary.test_count = (artifact.test_scenarios || []).length;
    summary.risk_count = (artifact.risks || []).length;
    summary.has_architecture = !!(artifact.system_architecture);
    summary.has_failure_modes = !!(artifact.failure_modes && artifact.failure_modes.length > 0);
  }

  if (summary.type === 'sd') {
    summary.status = artifact.status;
    summary.category = artifact.category;
    summary.has_user_stories = artifact.has_user_stories || false;
    summary.has_prd = artifact.has_prd || false;
  }

  return summary;
}

/**
 * Record a council's review
 * @param {Object} reviewRequest - Review request object
 * @param {string} councilId - Council identifier (claude, openai, antigravity)
 * @param {Object} review - Review details
 * @returns {Object} Updated review request
 */
export function recordCouncilReview(reviewRequest, councilId, review) {
  const {
    decision,
    confidence = 0.8,
    concerns = [],
    recommendations = [],
    must_fix = [],
    notes = ''
  } = review;

  if (!Object.values(REVIEW_DECISIONS).includes(decision)) {
    throw new Error(`Invalid decision: ${decision}. Must be one of: ${Object.values(REVIEW_DECISIONS).join(', ')}`);
  }

  reviewRequest.reviews[councilId] = {
    council: COUNCILS[councilId.toUpperCase()] || { id: councilId, name: councilId, weight: 0.33 },
    decision,
    confidence,
    concerns,
    recommendations,
    must_fix,
    notes,
    timestamp: new Date().toISOString()
  };

  // Update status if all councils have reviewed
  const reviewCount = Object.keys(reviewRequest.reviews).length;
  if (reviewCount >= 3) {
    reviewRequest.status = 'complete';
    reviewRequest.consensus = analyzeConsensus(reviewRequest);
    reviewRequest.final_decision = determineFinalDecision(reviewRequest);
  } else if (reviewCount >= 2) {
    reviewRequest.status = 'partial';
  }

  return reviewRequest;
}

/**
 * Analyze consensus among councils
 * @param {Object} reviewRequest - Review request with reviews
 * @returns {Object} Consensus analysis
 */
export function analyzeConsensus(reviewRequest) {
  const reviews = Object.values(reviewRequest.reviews);

  if (reviews.length === 0) {
    return {
      agreement_level: 'none',
      agreement_percentage: 0,
      majority_decision: null,
      dissenting_councils: [],
      shared_concerns: [],
      shared_recommendations: []
    };
  }

  // Count decisions
  const decisionCounts = {};
  for (const review of reviews) {
    decisionCounts[review.decision] = (decisionCounts[review.decision] || 0) + 1;
  }

  // Find majority
  let majorityDecision = null;
  let maxCount = 0;
  for (const [decision, count] of Object.entries(decisionCounts)) {
    if (count > maxCount) {
      maxCount = count;
      majorityDecision = decision;
    }
  }

  // Calculate agreement
  const agreementPercentage = Math.round((maxCount / reviews.length) * 100);
  let agreementLevel = 'split';
  if (agreementPercentage === 100) agreementLevel = 'unanimous';
  else if (agreementPercentage >= 67) agreementLevel = 'majority';

  // Find dissenting councils
  const dissentingCouncils = reviews
    .filter(r => r.decision !== majorityDecision)
    .map(r => r.council.id);

  // Find shared concerns
  const allConcerns = reviews.flatMap(r => r.concerns || []);
  const concernCounts = {};
  for (const concern of allConcerns) {
    const normalized = concern.toLowerCase().trim();
    concernCounts[normalized] = (concernCounts[normalized] || 0) + 1;
  }
  const sharedConcerns = Object.entries(concernCounts)
    .filter(([_, count]) => count >= 2)
    .map(([concern]) => concern);

  // Find shared recommendations
  const allRecommendations = reviews.flatMap(r => r.recommendations || []);
  const recCounts = {};
  for (const rec of allRecommendations) {
    const normalized = rec.toLowerCase().trim();
    recCounts[normalized] = (recCounts[normalized] || 0) + 1;
  }
  const sharedRecommendations = Object.entries(recCounts)
    .filter(([_, count]) => count >= 2)
    .map(([rec]) => rec);

  return {
    agreement_level: agreementLevel,
    agreement_percentage: agreementPercentage,
    majority_decision: majorityDecision,
    dissenting_councils: dissentingCouncils,
    shared_concerns: sharedConcerns,
    shared_recommendations: sharedRecommendations,
    decision_breakdown: decisionCounts
  };
}

/**
 * Determine final decision based on reviews and weights
 * @param {Object} reviewRequest - Review request with reviews and consensus
 * @returns {Object} Final decision
 */
export function determineFinalDecision(reviewRequest) {
  const reviews = Object.values(reviewRequest.reviews);
  const consensus = reviewRequest.consensus;

  // If unanimous approval, approve
  if (consensus.agreement_level === 'unanimous' && consensus.majority_decision === REVIEW_DECISIONS.APPROVE) {
    return {
      decision: REVIEW_DECISIONS.APPROVE,
      confidence: 'high',
      reasoning: 'All councils unanimously approved',
      conditions: []
    };
  }

  // If unanimous reject, reject
  if (consensus.agreement_level === 'unanimous' && consensus.majority_decision === REVIEW_DECISIONS.REJECT) {
    return {
      decision: REVIEW_DECISIONS.REJECT,
      confidence: 'high',
      reasoning: 'All councils unanimously rejected',
      conditions: reviews.flatMap(r => r.must_fix || [])
    };
  }

  // Calculate weighted score
  let weightedScore = 0;
  let totalWeight = 0;

  for (const review of reviews) {
    const weight = review.council.weight || 0.33;
    totalWeight += weight;

    // Score decisions: approve=1, approve_with_conditions=0.7, request_changes=0.3, reject=0
    const decisionScores = {
      [REVIEW_DECISIONS.APPROVE]: 1.0,
      [REVIEW_DECISIONS.APPROVE_WITH_CONDITIONS]: 0.7,
      [REVIEW_DECISIONS.REQUEST_CHANGES]: 0.3,
      [REVIEW_DECISIONS.REJECT]: 0,
      [REVIEW_DECISIONS.ABSTAIN]: 0.5
    };

    weightedScore += (decisionScores[review.decision] || 0.5) * weight * review.confidence;
  }

  const normalizedScore = weightedScore / totalWeight;

  // Determine decision based on weighted score
  let decision, confidence, reasoning;

  if (normalizedScore >= 0.8) {
    decision = REVIEW_DECISIONS.APPROVE;
    confidence = 'high';
    reasoning = `Weighted score ${(normalizedScore * 100).toFixed(0)}% indicates approval`;
  } else if (normalizedScore >= 0.6) {
    decision = REVIEW_DECISIONS.APPROVE_WITH_CONDITIONS;
    confidence = 'medium';
    reasoning = `Weighted score ${(normalizedScore * 100).toFixed(0)}% - approval with conditions needed`;
  } else if (normalizedScore >= 0.4) {
    decision = REVIEW_DECISIONS.REQUEST_CHANGES;
    confidence = 'medium';
    reasoning = `Weighted score ${(normalizedScore * 100).toFixed(0)}% - changes required before approval`;
  } else {
    decision = REVIEW_DECISIONS.REJECT;
    confidence = 'high';
    reasoning = `Weighted score ${(normalizedScore * 100).toFixed(0)}% indicates rejection`;
  }

  // Collect all must_fix items
  const conditions = reviews.flatMap(r => r.must_fix || []);

  return {
    decision,
    confidence,
    reasoning,
    weighted_score: normalizedScore,
    conditions,
    shared_concerns: consensus.shared_concerns,
    shared_recommendations: consensus.shared_recommendations
  };
}

/**
 * Validate that a review gate has been passed
 * @param {Object} reviewRequest - Completed review request
 * @returns {Object} Gate validation result
 */
export function validateReviewGate(reviewRequest) {
  const result = {
    passed: false,
    score: 0,
    issues: [],
    warnings: [],
    details: {
      councils_reviewed: Object.keys(reviewRequest.reviews).length,
      consensus: reviewRequest.consensus,
      final_decision: reviewRequest.final_decision
    }
  };

  // Check minimum council participation
  if (result.details.councils_reviewed < 2) {
    result.issues.push(`Insufficient council participation: ${result.details.councils_reviewed}/3 (minimum 2)`);
    return result;
  }

  // Check final decision
  const decision = reviewRequest.final_decision?.decision;

  if (decision === REVIEW_DECISIONS.APPROVE) {
    result.passed = true;
    result.score = 100;
  } else if (decision === REVIEW_DECISIONS.APPROVE_WITH_CONDITIONS) {
    result.passed = true;
    result.score = 80;
    result.warnings.push(`Approved with ${reviewRequest.final_decision.conditions?.length || 0} condition(s)`);
  } else if (decision === REVIEW_DECISIONS.REQUEST_CHANGES) {
    result.passed = false;
    result.score = 50;
    result.issues.push('Changes requested - address feedback before proceeding');
    result.issues.push(...(reviewRequest.final_decision.conditions || []));
  } else {
    result.passed = false;
    result.score = 0;
    result.issues.push('Review gate rejected - major concerns identified');
    result.issues.push(...(reviewRequest.final_decision.shared_concerns || []));
  }

  return result;
}

/**
 * Generate a prompt for requesting council review
 * @param {Object} artifact - Artifact to review (PRD, SD)
 * @param {string} councilId - Target council
 * @returns {string} Review prompt
 */
export function generateReviewPrompt(artifact, councilId) {
  const council = COUNCILS[councilId.toUpperCase()];
  const focusAreas = council?.capabilities || ['general'];

  return `# Multi-Council Review Request

## Review Context
You are ${council?.name || councilId}, participating in a triangulated review process.
Your focus areas: ${focusAreas.join(', ')}

## Artifact Summary
${JSON.stringify(summarizeArtifact(artifact), null, 2)}

## Review Instructions
Please evaluate this artifact and provide:

1. **Decision** (choose one):
   - APPROVE: Ready for implementation
   - APPROVE_WITH_CONDITIONS: Approve with specific conditions
   - REQUEST_CHANGES: Need significant changes
   - REJECT: Fundamental issues prevent approval
   - ABSTAIN: Cannot evaluate (outside expertise)

2. **Confidence** (0.0 - 1.0): How confident are you in this decision?

3. **Concerns** (list): What issues or risks do you see?

4. **Recommendations** (list): What improvements would you suggest?

5. **Must Fix** (list): If approving with conditions, what MUST be addressed?

6. **Notes**: Any additional context for other councils.

## Response Format
Please respond in JSON format:
\`\`\`json
{
  "decision": "approve|approve_with_conditions|request_changes|reject|abstain",
  "confidence": 0.8,
  "concerns": ["concern 1", "concern 2"],
  "recommendations": ["recommendation 1"],
  "must_fix": ["condition 1"],
  "notes": "Additional context"
}
\`\`\`
`;
}

/**
 * Save review request to database
 * @param {Object} reviewRequest - Review request to save
 * @param {Object} supabaseClient - Supabase client (optional)
 * @returns {Promise<Object>} Save result
 */
export async function saveReviewRequest(reviewRequest, supabaseClient = null) {
  const supabase = supabaseClient || createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  // Store in metadata or dedicated table
  // For now, we'll attach to the PRD's metadata
  if (reviewRequest.prd_id) {
    const { data: prd, error: fetchError } = await supabase
      .from('product_requirements_v2')
      .select('metadata')
      .eq('id', reviewRequest.prd_id)
      .single();

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }

    const metadata = prd?.metadata || {};
    metadata.council_reviews = metadata.council_reviews || [];
    metadata.council_reviews.push(reviewRequest);

    const { error: updateError } = await supabase
      .from('product_requirements_v2')
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq('id', reviewRequest.prd_id);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    return { success: true, review_id: reviewRequest.id };
  }

  return { success: false, error: 'No PRD ID provided' };
}

export default {
  COUNCILS,
  REVIEW_DECISIONS,
  createReviewRequest,
  summarizeArtifact,
  recordCouncilReview,
  analyzeConsensus,
  determineFinalDecision,
  validateReviewGate,
  generateReviewPrompt,
  saveReviewRequest
};
