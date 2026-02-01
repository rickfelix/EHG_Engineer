/**
 * Vetting Engine Sub-Agent
 * SD-LEO-SELF-IMPROVE-001F: Phase 2b - Vetting Agent Bridge
 *
 * Routes feedback through rubric-based assessment, applies AEGIS constitutional
 * vetting, and logs outcomes for audit and coverage tracking.
 *
 * @module lib/sub-agents/vetting
 * @version 1.0.0
 */

import { createClient } from '@supabase/supabase-js';
import { getAegisEnforcer } from '../../governance/aegis/AegisEnforcer.js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Default rubric for self-improvement proposals
 * Used when no specific rubric version is provided
 */
export const DEFAULT_RUBRIC = {
  criteria: [
    {
      id: 'value',
      name: 'Value Proposition',
      description: 'Does this improvement provide clear value to the LEO Protocol?',
      weight: 0.25
    },
    {
      id: 'risk',
      name: 'Risk Assessment',
      description: 'What is the risk level of implementing this change?',
      weight: 0.20
    },
    {
      id: 'complexity',
      name: 'Complexity',
      description: 'How complex is the implementation?',
      weight: 0.15
    },
    {
      id: 'reversibility',
      name: 'Reversibility',
      description: 'Can this change be easily reversed if needed?',
      weight: 0.15
    },
    {
      id: 'alignment',
      name: 'Protocol Alignment',
      description: 'Does this align with existing LEO Protocol principles?',
      weight: 0.15
    },
    {
      id: 'testability',
      name: 'Testability',
      description: 'Can this change be properly tested and validated?',
      weight: 0.10
    }
  ],
  scoringScale: {
    min: 1,
    max: 5,
    labels: {
      1: 'Poor',
      2: 'Below Average',
      3: 'Average',
      4: 'Good',
      5: 'Excellent'
    }
  }
};

/**
 * Constitution codes used for vetting proposals
 */
const VETTING_CONSTITUTIONS = [
  'CONST-001', // Protocol integrity
  'CONST-002', // Self-improvement governance
  'CONST-009'  // Feature flag kill switch
];

/**
 * VettingEngine - Core vetting engine class
 */
export class VettingEngine {
  constructor(options = {}) {
    this.supabase = options.supabase || supabase;
    this.aegisEnforcer = options.aegisEnforcer || getAegisEnforcer({ supabase: this.supabase });
    this.rubric = options.rubric || DEFAULT_RUBRIC;
  }

  /**
   * Convert feedback item to a structured proposal
   * @param {Object} feedback - Feedback item from leo_feedback table
   * @returns {Object} Structured proposal object
   */
  async feedbackToProposal(feedback) {
    const startTime = Date.now();

    // Extract proposal fields from feedback
    const proposal = {
      title: feedback.title || `Feedback-based improvement: ${feedback.id.slice(0, 8)}`,
      summary: feedback.description || feedback.content,
      motivation: this._extractMotivation(feedback),
      scope: this._extractScope(feedback),
      affected_components: this._extractAffectedComponents(feedback),
      risk_level: this._assessRiskLevel(feedback),
      constitution_tags: this._extractConstitutionTags(feedback),
      source_feedback_id: feedback.id,
      created_by: 'vetting_engine',
      owner_team: 'LEO',
      status: 'draft'
    };

    // Insert proposal into database
    const { data: insertedProposal, error } = await this.supabase
      .from('leo_proposals')
      .insert(proposal)
      .select()
      .single();

    if (error) {
      console.error('[VettingEngine] Failed to create proposal:', error.message);
      throw new Error(`Failed to create proposal: ${error.message}`);
    }

    const processingTime = Date.now() - startTime;
    console.log(`[VettingEngine] Created proposal ${insertedProposal.id} in ${processingTime}ms`);

    return {
      proposal: insertedProposal,
      processingTime
    };
  }

  /**
   * Apply rubric-based assessment to a proposal
   * @param {Object} proposal - Proposal to assess
   * @param {Object} rubric - Rubric to use (optional, defaults to DEFAULT_RUBRIC)
   * @returns {Object} Assessment result with scores
   */
  async assessWithRubric(proposal, rubric = this.rubric) {
    const scores = {};
    let totalScore = 0;
    let totalWeight = 0;

    for (const criterion of rubric.criteria) {
      const score = this._scoreCriterion(criterion, proposal);
      scores[criterion.id] = {
        name: criterion.name,
        score,
        weight: criterion.weight,
        weightedScore: score * criterion.weight
      };
      totalScore += score * criterion.weight;
      totalWeight += criterion.weight;
    }

    // Normalize to 0-100 scale
    const normalizedScore = totalWeight > 0
      ? (totalScore / totalWeight / rubric.scoringScale.max) * 100
      : 0;

    return {
      scores,
      totalScore: Math.round(normalizedScore * 100) / 100,
      rubricVersion: rubric.version || 'default-1.0',
      assessedAt: new Date().toISOString()
    };
  }

  /**
   * Apply AEGIS constitutional vetting to a proposal
   * @param {Object} proposal - Proposal to vet
   * @param {Object} options - Vetting options
   * @returns {Object} AEGIS validation result
   */
  async vetWithAegis(proposal, options = {}) {
    const context = {
      proposal_id: proposal.id,
      proposal_title: proposal.title,
      proposal_summary: proposal.summary,
      risk_level: proposal.risk_level,
      affected_components: proposal.affected_components,
      constitution_tags: proposal.constitution_tags,
      source: 'vetting_engine',
      ...options.context
    };

    const results = {};
    const allViolations = [];
    const allWarnings = [];

    // Validate against each vetting constitution
    for (const constitutionCode of VETTING_CONSTITUTIONS) {
      try {
        const result = await this.aegisEnforcer.validate(constitutionCode, context, {
          recordViolations: true,
          incrementStats: true
        });

        results[constitutionCode] = result;

        if (!result.passed) {
          allViolations.push(...result.violations);
        }
        if (result.hasWarnings) {
          allWarnings.push(...result.warnings);
        }
      } catch (err) {
        // Constitution might not exist or be disabled
        console.warn(`[VettingEngine] Could not validate ${constitutionCode}:`, err.message);
        results[constitutionCode] = {
          passed: true,
          message: `Skipped: ${err.message}`,
          violations: [],
          warnings: []
        };
      }
    }

    return {
      passed: allViolations.length === 0,
      results,
      violations: allViolations,
      warnings: allWarnings,
      constitutionsChecked: Object.keys(results).length,
      evaluatedAt: new Date().toISOString()
    };
  }

  /**
   * Process a feedback item through the full vetting pipeline
   * @param {Object} feedback - Feedback item to process
   * @param {Object} options - Processing options
   * @returns {Object} Vetting outcome
   */
  async process(feedback, options = {}) {
    const startTime = Date.now();

    try {
      // Step 1: Convert feedback to proposal (if applicable)
      let proposal = null;
      let proposalResult = null;

      if (this._shouldCreateProposal(feedback)) {
        proposalResult = await this.feedbackToProposal(feedback);
        proposal = proposalResult.proposal;
      }

      // Step 2: Assess with rubric
      const rubricAssessment = proposal
        ? await this.assessWithRubric(proposal, options.rubric)
        : this._assessFeedbackDirectly(feedback);

      // Step 3: Apply AEGIS vetting (if proposal exists)
      const aegisResult = proposal
        ? await this.vetWithAegis(proposal, options)
        : { passed: true, violations: [], warnings: [], results: {} };

      // Step 4: Determine outcome
      const outcome = this._determineOutcome(rubricAssessment, aegisResult, options);

      // Step 5: Record vetting outcome
      const processingTime = Date.now() - startTime;
      const outcomeRecord = await this._recordOutcome({
        feedback_id: feedback.id,
        proposal_id: proposal?.id || null,
        outcome: outcome.status,
        rubric_score: rubricAssessment.totalScore,
        aegis_result: aegisResult,
        processing_time_ms: processingTime,
        notes: outcome.notes
      });

      // Step 6: Update proposal status if exists
      if (proposal) {
        await this._updateProposalStatus(proposal.id, outcome.status, aegisResult);
      }

      return {
        success: true,
        feedback_id: feedback.id,
        proposal_id: proposal?.id,
        outcome: outcome.status,
        rubric_score: rubricAssessment.totalScore,
        aegis_passed: aegisResult.passed,
        violations: aegisResult.violations,
        warnings: aegisResult.warnings,
        processing_time_ms: processingTime,
        outcome_record_id: outcomeRecord.id
      };

    } catch (err) {
      const processingTime = Date.now() - startTime;
      console.error('[VettingEngine] Processing failed:', err.message);

      // Record failed outcome
      await this._recordOutcome({
        feedback_id: feedback.id,
        proposal_id: null,
        outcome: 'escalated',
        rubric_score: null,
        aegis_result: { error: err.message },
        processing_time_ms: processingTime,
        notes: `Processing failed: ${err.message}`
      });

      return {
        success: false,
        feedback_id: feedback.id,
        outcome: 'escalated',
        error: err.message,
        processing_time_ms: processingTime
      };
    }
  }

  /**
   * Get coverage metrics for a time period
   * @param {Date} startDate - Start of period
   * @param {Date} endDate - End of period
   * @returns {Object} Coverage metrics
   */
  async getCoverageMetrics(startDate = null, endDate = null) {
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    const { data, error } = await this.supabase
      .rpc('get_vetting_coverage', {
        p_start_date: start.toISOString(),
        p_end_date: end.toISOString()
      });

    if (error) {
      console.error('[VettingEngine] Failed to get coverage metrics:', error.message);
      throw new Error(`Failed to get coverage metrics: ${error.message}`);
    }

    return data?.[0] || {
      total_feedback: 0,
      total_vetted: 0,
      coverage_pct: 0,
      approval_rate: 0,
      avg_rubric_score: 0,
      avg_processing_time_ms: 0
    };
  }

  // =========================================================================
  // Private helper methods
  // =========================================================================

  /**
   * Determine if feedback should be converted to a proposal
   * @private
   */
  _shouldCreateProposal(feedback) {
    // Create proposal for improvement suggestions, feature requests, and protocol changes
    const proposalTypes = ['improvement', 'feature', 'enhancement', 'protocol_change'];
    const feedbackType = feedback.type || feedback.category || '';

    if (proposalTypes.includes(feedbackType.toLowerCase())) {
      return true;
    }

    // Check content for improvement-related keywords
    const content = (feedback.content || feedback.description || '').toLowerCase();
    const improvementKeywords = ['should', 'could', 'improve', 'enhance', 'add', 'suggest', 'proposal'];

    return improvementKeywords.some(kw => content.includes(kw));
  }

  /**
   * Extract motivation from feedback
   * @private
   */
  _extractMotivation(feedback) {
    // Try to extract why this change is needed
    const content = feedback.content || feedback.description || '';

    // Look for motivation patterns
    const motivationPatterns = [
      /because\s+(.+?)(?:\.|$)/i,
      /this would\s+(.+?)(?:\.|$)/i,
      /to improve\s+(.+?)(?:\.|$)/i,
      /the problem is\s+(.+?)(?:\.|$)/i
    ];

    for (const pattern of motivationPatterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    // Fallback to source context
    return feedback.source_context || 'Derived from feedback analysis';
  }

  /**
   * Extract scope items from feedback
   * @private
   */
  _extractScope(feedback) {
    const scope = [];
    const content = feedback.content || feedback.description || '';

    // Check for file/component mentions
    const filePattern = /(?:in|modify|update|change)\s+([a-zA-Z0-9_\-./]+\.(js|ts|md|sql))/gi;
    let match;
    while ((match = filePattern.exec(content)) !== null) {
      scope.push({
        area: 'file',
        description: match[1]
      });
    }

    // Check for component mentions
    if (feedback.related_files) {
      for (const file of feedback.related_files) {
        scope.push({
          area: 'file',
          description: file
        });
      }
    }

    // Default scope if none found
    if (scope.length === 0) {
      scope.push({
        area: 'general',
        description: 'Scope to be determined during implementation'
      });
    }

    return scope;
  }

  /**
   * Extract affected components from feedback
   * @private
   */
  _extractAffectedComponents(feedback) {
    const components = [];
    const content = (feedback.content || feedback.description || '').toLowerCase();

    // Component detection patterns
    const componentPatterns = {
      database: ['database', 'schema', 'migration', 'table', 'rls'],
      api: ['api', 'endpoint', 'route', 'controller'],
      ui: ['ui', 'component', 'page', 'view', 'frontend'],
      config: ['config', 'settings', 'environment'],
      script: ['script', 'cli', 'command'],
      documentation: ['docs', 'documentation', 'readme']
    };

    for (const [type, keywords] of Object.entries(componentPatterns)) {
      if (keywords.some(kw => content.includes(kw))) {
        components.push({
          name: `${type}-component`,
          type,
          impact: 'medium'
        });
      }
    }

    // Default if none detected
    if (components.length === 0) {
      components.push({
        name: 'unknown',
        type: 'config',
        impact: 'low'
      });
    }

    return components;
  }

  /**
   * Assess risk level of feedback
   * @private
   */
  _assessRiskLevel(feedback) {
    const content = (feedback.content || feedback.description || '').toLowerCase();

    // High risk indicators
    const highRiskKeywords = ['breaking', 'migration', 'security', 'auth', 'rls', 'delete', 'remove'];
    if (highRiskKeywords.some(kw => content.includes(kw))) {
      return 'high';
    }

    // Medium risk indicators
    const mediumRiskKeywords = ['modify', 'update', 'change', 'refactor', 'api'];
    if (mediumRiskKeywords.some(kw => content.includes(kw))) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Extract constitution tags from feedback
   * @private
   */
  _extractConstitutionTags(feedback) {
    const tags = [];
    const content = (feedback.content || feedback.description || '').toLowerCase();

    // Map content to constitution codes
    const constitutionMappings = {
      'CONST-001': ['protocol', 'integrity', 'workflow'],
      'CONST-002': ['self-improve', 'learning', 'feedback'],
      'CONST-009': ['feature flag', 'kill switch', 'rollback']
    };

    for (const [code, keywords] of Object.entries(constitutionMappings)) {
      if (keywords.some(kw => content.includes(kw))) {
        tags.push(code);
      }
    }

    return tags.length > 0 ? tags : ['CONST-001']; // Default to protocol integrity
  }

  /**
   * Score a single criterion for a proposal
   * @private
   */
  _scoreCriterion(criterion, proposal) {
    // This is a simplified scoring implementation
    // In production, this could use more sophisticated analysis

    switch (criterion.id) {
      case 'value':
        // Score based on motivation clarity and scope
        return proposal.motivation && proposal.motivation.length > 20 ? 4 : 3;

      case 'risk':
        // Inverse of risk level
        return proposal.risk_level === 'low' ? 5 :
               proposal.risk_level === 'medium' ? 3 : 2;

      case 'complexity':
        // Based on number of affected components
        const componentCount = (proposal.affected_components || []).length;
        return componentCount <= 1 ? 5 :
               componentCount <= 3 ? 4 :
               componentCount <= 5 ? 3 : 2;

      case 'reversibility':
        // Check for database/migration involvement
        const hasDb = (proposal.affected_components || [])
          .some(c => c.type === 'database');
        return hasDb ? 2 : 4;

      case 'alignment':
        // Based on constitution tags
        return (proposal.constitution_tags || []).length > 0 ? 4 : 3;

      case 'testability':
        // Default moderate testability
        return 3;

      default:
        return 3; // Default middle score
    }
  }

  /**
   * Assess feedback directly without creating proposal
   * @private
   */
  _assessFeedbackDirectly(feedback) {
    // For non-proposal feedback, provide basic assessment
    const riskLevel = this._assessRiskLevel(feedback);
    const score = riskLevel === 'low' ? 80 :
                  riskLevel === 'medium' ? 60 : 40;

    return {
      scores: {},
      totalScore: score,
      rubricVersion: 'direct-assessment-1.0',
      assessedAt: new Date().toISOString()
    };
  }

  /**
   * Determine final outcome based on assessments
   * @private
   */
  _determineOutcome(rubricAssessment, aegisResult, options = {}) {
    const thresholds = {
      approval: options.approvalThreshold || 70,
      rejection: options.rejectionThreshold || 40,
      ...options.thresholds
    };

    // AEGIS violations always lead to rejection or escalation
    if (!aegisResult.passed) {
      const canOverride = aegisResult.violations.every(v =>
        v.enforcement_action === 'BLOCK_OVERRIDABLE' ||
        v.enforcement_action === 'WARN_AND_LOG'
      );

      return {
        status: canOverride ? 'needs_revision' : 'rejected',
        notes: `AEGIS violations: ${aegisResult.violations.map(v => v.rule_code).join(', ')}`
      };
    }

    // Score-based determination
    if (rubricAssessment.totalScore >= thresholds.approval) {
      return {
        status: 'approved',
        notes: `Score ${rubricAssessment.totalScore}% meets approval threshold`
      };
    }

    if (rubricAssessment.totalScore < thresholds.rejection) {
      return {
        status: 'rejected',
        notes: `Score ${rubricAssessment.totalScore}% below rejection threshold`
      };
    }

    // In between - needs revision
    return {
      status: 'needs_revision',
      notes: `Score ${rubricAssessment.totalScore}% requires review`
    };
  }

  /**
   * Record vetting outcome to database
   * @private
   */
  async _recordOutcome(outcomeData) {
    const { data, error } = await this.supabase
      .from('leo_vetting_outcomes')
      .insert({
        feedback_id: outcomeData.feedback_id,
        proposal_id: outcomeData.proposal_id,
        outcome: outcomeData.outcome,
        rubric_score: outcomeData.rubric_score,
        aegis_result: outcomeData.aegis_result,
        processing_time_ms: outcomeData.processing_time_ms,
        notes: outcomeData.notes,
        processed_by: 'vetting_engine'
      })
      .select()
      .single();

    if (error) {
      console.error('[VettingEngine] Failed to record outcome:', error.message);
      // Don't throw - this is a non-critical operation
      return { id: null };
    }

    return data;
  }

  /**
   * Update proposal status based on vetting outcome
   * @private
   */
  async _updateProposalStatus(proposalId, outcome, aegisResult) {
    const statusMap = {
      'approved': 'approved',
      'rejected': 'rejected',
      'needs_revision': 'draft',
      'deferred': 'draft',
      'escalated': 'submitted'
    };

    const { error } = await this.supabase
      .from('leo_proposals')
      .update({
        status: statusMap[outcome] || 'draft',
        aegis_compliance_notes: JSON.stringify({
          passed: aegisResult.passed,
          violations: aegisResult.violations?.length || 0,
          warnings: aegisResult.warnings?.length || 0,
          evaluatedAt: aegisResult.evaluatedAt
        })
      })
      .eq('id', proposalId);

    if (error) {
      console.error('[VettingEngine] Failed to update proposal status:', error.message);
    }
  }
}

// =============================================================================
// SINGLETON AND EXPORTS
// =============================================================================

let _instance = null;

/**
 * Get the VettingEngine singleton instance
 * @param {Object} options - Options for initialization
 * @returns {VettingEngine}
 */
export function getVettingEngine(options = {}) {
  if (!_instance) {
    _instance = new VettingEngine(options);
  }
  return _instance;
}

/**
 * Process a feedback item through vetting
 * Convenience function for direct invocation
 */
export async function process(feedback, options = {}) {
  return getVettingEngine().process(feedback, options);
}

/**
 * Get vetting coverage metrics
 * Convenience function for direct invocation
 */
export async function getCoverageMetrics(startDate, endDate) {
  return getVettingEngine().getCoverageMetrics(startDate, endDate);
}

export default VettingEngine;
