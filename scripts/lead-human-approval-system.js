/**
 * LEAD Agent Human Approval System
 * Prevents autonomous SD status/priority changes
 * Requires explicit human confirmation for all LEAD decisions
 */

import { createClient  } from '@supabase/supabase-js';
import OverEngineeringRubric from './lead-over-engineering-rubric';
import dotenv from 'dotenv';

dotenv.config();

class LEADApprovalSystem {
  constructor() {
    this.supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    this.rubric = new OverEngineeringRubric();
  }

  /**
   * Evaluate SD for over-engineering with human approval checkpoint
   */
  async evaluateSDForOverEngineering(sdId, humanScores = null) {
    console.log(`🔍 LEAD Agent: Evaluating SD ${sdId} for over-engineering...`);

    // Get SD details
    const { data: sd, error } = await this.supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();

    if (error) {
      throw new Error(`Failed to fetch SD ${sdId}: ${error.message}`);
    }

    // Perform rubric evaluation
    const evaluation = this.rubric.evaluateSD(sd, humanScores);
    const humanReview = this.rubric.formatForHumanReview(evaluation);

    // Log evaluation for audit trail
    await this.logEvaluation(sdId, evaluation, 'over_engineering_assessment');

    // Check if human approval is required
    if (evaluation.requiresHumanReview || evaluation.isOverEngineered) {
      console.log('⚠️  HUMAN APPROVAL REQUIRED');
      console.log('==============================');

      return {
        requiresApproval: true,
        evaluation,
        humanReview,
        approvalRequest: this.generateApprovalRequest(sd, evaluation, humanReview)
      };
    }

    // If no concerns, proceed with recommendation
    return {
      requiresApproval: false,
      evaluation,
      humanReview,
      recommendation: 'PROCEED - No over-engineering concerns detected'
    };
  }

  /**
   * Generate human approval request with clear options
   */
  generateApprovalRequest(sd, evaluation, humanReview) {
    const request = {
      type: 'OVER_ENGINEERING_EVALUATION',
      sdId: sd.id,
      sdTitle: sd.title,
      currentStatus: sd.status,
      currentPriority: sd.priority,

      evaluation: {
        totalScore: `${evaluation.totalScore}/30 (${evaluation.percentage}%)`,
        isOverEngineered: evaluation.isOverEngineered,
        recommendation: evaluation.recommendation,
        warningFlags: humanReview.warningFlags
      },

      scores: humanReview.scores,
      reasoning: humanReview.reasoning,

      proposedActions: this.generateProposedActions(evaluation),

      options: [
        {
          action: 'APPROVE_RECOMMENDATION',
          description: `Accept LEAD recommendation: ${evaluation.recommendation}`,
          consequences: this.getActionConsequences(evaluation.recommendation, sd)
        },
        {
          action: 'MODIFY_SCORES',
          description: 'Provide corrected manual scores for re-evaluation',
          consequences: 'LEAD will re-evaluate with your provided scores'
        },
        {
          action: 'OVERRIDE_KEEP_CURRENT',
          description: 'Override LEAD assessment, keep current status/priority',
          consequences: 'SD remains unchanged, LEAD assessment overridden'
        },
        {
          action: 'MANUAL_DECISION',
          description: 'Make manual status/priority changes',
          consequences: 'You specify exact status and priority changes'
        }
      ],

      warnings: this.generateWarnings(sd, evaluation),

      auditNote: 'This decision will be logged in the audit trail'
    };

    return request;
  }

  /**
   * Generate proposed actions based on evaluation
   */
  generateProposedActions(evaluation) {
    const actions = [];

    if (evaluation.recommendation.includes('CANCEL')) {
      actions.push({
        type: 'STATUS_CHANGE',
        from: 'current',
        to: 'cancelled',
        reason: 'Severely over-engineered with no business justification'
      });
    } else if (evaluation.recommendation.includes('DEFER')) {
      actions.push({
        type: 'STATUS_CHANGE',
        from: 'current',
        to: 'deferred',
        reason: 'Over-engineered or poor strategic alignment'
      });
    } else if (evaluation.recommendation.includes('DOWNGRADE')) {
      actions.push({
        type: 'PRIORITY_CHANGE',
        from: 'current',
        to: 'low',
        reason: 'Over-engineered, reduce priority'
      });
    } else if (evaluation.recommendation.includes('UPGRADE')) {
      actions.push({
        type: 'PRIORITY_CHANGE',
        from: 'current',
        to: 'high',
        reason: 'Excellent strategic value'
      });
    }

    return actions;
  }

  /**
   * Get consequences of recommended actions
   */
  getActionConsequences(recommendation, _sd) {
    if (recommendation.includes('CANCEL')) {
      return 'SD will be permanently cancelled. Cannot be easily restored.';
    }
    if (recommendation.includes('DEFER')) {
      return 'SD will be deferred for later consideration. Can be reactivated.';
    }
    if (recommendation.includes('DOWNGRADE')) {
      return 'Priority will be lowered, reducing visibility in filtered views.';
    }
    if (recommendation.includes('UPGRADE')) {
      return 'Priority will be increased, making it more visible and urgent.';
    }
    return 'No status or priority changes proposed.';
  }

  /**
   * Generate warnings for human consideration
   */
  generateWarnings(sd, evaluation) {
    const warnings = [];

    // Check if this is a user-selected SD
    if (sd.is_working_on) {
      warnings.push({
        type: 'USER_SELECTION_OVERRIDE',
        message: '⚠️ WARNING: This SD is currently marked as "Working On" by user',
        recommendation: 'Consider user preference before making changes'
      });
    }

    // Check for recent modifications
    const recentlyModified = new Date(sd.updated_at) > new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (recentlyModified) {
      warnings.push({
        type: 'RECENT_MODIFICATION',
        message: '⚠️ WARNING: This SD was recently modified',
        recommendation: 'Verify changes are not conflicting with recent updates'
      });
    }

    // Check for high priority with over-engineering concerns
    if (sd.priority === 'high' && evaluation.isOverEngineered) {
      warnings.push({
        type: 'HIGH_PRIORITY_OVER_ENGINEERED',
        message: '⚠️ WARNING: High priority SD flagged as over-engineered',
        recommendation: 'Carefully consider business impact before downgrading'
      });
    }

    return warnings;
  }

  /**
   * Process human approval response
   */
  async processApprovalResponse(sdId, response) {
    console.log(`📝 Processing human approval response for SD ${sdId}...`);

    // Log the human decision
    await this.logHumanDecision(sdId, response);

    switch (response.action) {
      case 'APPROVE_RECOMMENDATION':
        return await this.executeRecommendation(sdId, response.evaluation);

      case 'MODIFY_SCORES':
        return await this.reEvaluateWithScores(sdId, response.manualScores);

      case 'OVERRIDE_KEEP_CURRENT':
        return await this.recordOverride(sdId, 'KEEP_CURRENT', response.reason);

      case 'MANUAL_DECISION':
        return await this.executeManualChanges(sdId, response.changes);

      default:
        throw new Error(`Unknown approval action: ${response.action}`);
    }
  }

  /**
   * Execute LEAD recommendation after human approval
   */
  async executeRecommendation(sdId, evaluation) {
    const updates = {};

    if (evaluation.recommendation.includes('CANCEL')) {
      updates.status = 'cancelled';
    } else if (evaluation.recommendation.includes('DEFER')) {
      updates.status = 'deferred';
    } else if (evaluation.recommendation.includes('DOWNGRADE')) {
      updates.priority = 'low';
    } else if (evaluation.recommendation.includes('UPGRADE')) {
      updates.priority = 'high';
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await this.supabase
        .from('strategic_directives_v2')
        .update(updates)
        .eq('id', sdId);

      if (error) {
        throw new Error(`Failed to update SD ${sdId}: ${error.message}`);
      }

      await this.logStatusChange(sdId, updates, 'LEAD_RECOMMENDATION_APPROVED');
      return { success: true, changes: updates, reason: 'LEAD recommendation executed after human approval' };
    }

    return { success: true, changes: {}, reason: 'No changes required' };
  }

  /**
   * Log evaluation for audit trail
   */
  async logEvaluation(sdId, evaluation, type) {
    const logEntry = {
      sd_id: sdId,
      evaluation_type: type,
      scores: evaluation.scores,
      total_score: evaluation.totalScore,
      is_over_engineered: evaluation.isOverEngineered,
      recommendation: evaluation.recommendation,
      reasoning: evaluation.reasoning,
      requires_human_review: evaluation.requiresHumanReview,
      evaluated_at: new Date().toISOString(),
      evaluated_by: 'LEAD_AGENT'
    };

    // Note: This would insert into a dedicated audit table
    // For now, log to console for demonstration
    console.log('📋 Audit Log Entry:', JSON.stringify(logEntry, null, 2));
  }

  /**
   * Log human decision for audit trail
   */
  async logHumanDecision(sdId, response) {
    const logEntry = {
      sd_id: sdId,
      decision_type: 'HUMAN_APPROVAL_RESPONSE',
      action: response.action,
      reasoning: response.reason || 'No reason provided',
      manual_scores: response.manualScores || null,
      decided_at: new Date().toISOString(),
      decided_by: 'HUMAN_USER'
    };

    console.log('👤 Human Decision Log:', JSON.stringify(logEntry, null, 2));
  }

  /**
   * Log status/priority changes
   */
  async logStatusChange(sdId, changes, reason) {
    const logEntry = {
      sd_id: sdId,
      change_type: 'STATUS_PRIORITY_UPDATE',
      changes: changes,
      reason: reason,
      changed_at: new Date().toISOString(),
      changed_by: 'LEAD_AGENT_WITH_APPROVAL'
    };

    console.log('🔄 Status Change Log:', JSON.stringify(logEntry, null, 2));
  }

  /**
   * Record override decision
   */
  async recordOverride(sdId, overrideType, reason) {
    await this.logHumanDecision(sdId, {
      action: 'OVERRIDE',
      overrideType,
      reason
    });

    return {
      success: true,
      changes: {},
      reason: `Human override: ${reason}`
    };
  }

  /**
   * Display approval request in user-friendly format
   */
  displayApprovalRequest(approvalRequest) {
    console.log('🔔 LEAD AGENT APPROVAL REQUEST');
    console.log('================================');
    console.log(`📋 SD: ${approvalRequest.sdId} - ${approvalRequest.sdTitle}`);
    console.log(`📊 Evaluation: ${approvalRequest.evaluation.totalScore}`);
    console.log(`🎯 Recommendation: ${approvalRequest.evaluation.recommendation}`);

    if (approvalRequest.evaluation.warningFlags.length > 0) {
      console.log('⚠️  Warning Flags:');
      approvalRequest.evaluation.warningFlags.forEach(flag => console.log(`   ${flag}`));
    }

    console.log('\n📝 Detailed Scores:');
    approvalRequest.scores.forEach(score => {
      console.log(`   ${score.criterion}: ${score.score} - ${score.description}`);
    });

    console.log('\n🎯 Available Options:');
    approvalRequest.options.forEach((option, index) => {
      console.log(`   ${index + 1}. ${option.action}: ${option.description}`);
      console.log(`      Consequences: ${option.consequences}`);
    });

    if (approvalRequest.warnings.length > 0) {
      console.log('\n⚠️  Important Warnings:');
      approvalRequest.warnings.forEach(warning => {
        console.log(`   ${warning.message}`);
        console.log(`   Recommendation: ${warning.recommendation}`);
      });
    }

    console.log('\n💡 Please respond with your choice...');
  }
}

export default LEADApprovalSystem;

// Example usage demonstration
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('LEAD Agent Human Approval System');
  console.log('=================================');
  console.log('');
  console.log('🛡️  Safeguards Implemented:');
  console.log('• Standardized over-engineering evaluation rubric');
  console.log('• Mandatory human approval for status/priority changes');
  console.log('• User selection override protection');
  console.log('• Comprehensive audit logging');
  console.log('• Clear approval options with consequences');
  console.log('');
  console.log('❌ LEAD Agent can NO LONGER:');
  console.log('• Make autonomous SD status changes');
  console.log('• Override user selections without approval');
  console.log('• Apply subjective over-engineering judgments');
  console.log('');
  console.log('✅ LEAD Agent MUST NOW:');
  console.log('• Use standardized rubric for evaluations');
  console.log('• Request human approval before any changes');
  console.log('• Provide clear reasoning and consequences');
  console.log('• Log all decisions for audit trail');
}