/**
 * Action Router - Intelligent Issue Routing with Transparent Reasoning
 *
 * Routes classified issues to quick-fix, SD creation, or backlog
 * based on consensus analysis. Provides reasoning for all decisions.
 *
 * Part of: SD-LEO-FEAT-INTELLIGENT-UAT-FEEDBACK-001
 *
 * @module lib/uat/action-router
 * @version 1.0.0
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Routing thresholds
const ROUTING_CONFIG = {
  QUICK_FIX_MAX_LOC: 50,
  MEDIUM_FIX_MAX_LOC: 200,
  HIGH_RISK_AREAS: ['auth', 'payment', 'data', 'security'],
  AUTO_ROUTE_CONFIDENCE: 0.8
};

// Action types
const ACTIONS = {
  QUICK_FIX: 'quick-fix',
  CREATE_SD: 'create-sd',
  BACKLOG: 'backlog',
  SKIP: 'skip'
};

/**
 * Action Router with transparent reasoning
 */
export class ActionRouter {
  constructor() {
    this.config = ROUTING_CONFIG;
    this.supabase = null;

    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      this.supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
    }
  }

  /**
   * Route a single issue to an action
   * @param {Object} issue - Issue with consensus data
   * @returns {Object} Routing decision with reasoning
   */
  route(issue) {
    const { consensus, finalAction } = issue;

    // If user already clarified, use their choice
    if (finalAction && issue.actionSource === 'user_clarification') {
      return this.createDecision(issue, finalAction, 'User explicitly selected this action', 1.0, 'user');
    }

    // If no consensus data, fallback to conservative routing
    if (!consensus || !consensus.finalValues) {
      return this.createDecision(issue, ACTIONS.BACKLOG, 'Insufficient analysis data - defaulting to backlog for review', 0.3, 'fallback');
    }

    const { action, severity, estimatedLOC, riskAreas } = consensus.finalValues;

    // Check for high-risk areas that require SD regardless of size
    const hasHighRisk = riskAreas?.some(area => this.config.HIGH_RISK_AREAS.includes(area));
    if (hasHighRisk && action === ACTIONS.QUICK_FIX) {
      return this.createDecision(
        issue,
        ACTIONS.CREATE_SD,
        `High-risk area detected (${riskAreas.filter(a => this.config.HIGH_RISK_AREAS.includes(a)).join(', ')}). Upgrading from quick-fix to SD for proper tracking.`,
        consensus.confidence,
        'risk_upgrade'
      );
    }

    // Apply routing logic based on consensus
    const routingDecision = this.applyRoutingLogic(action, severity, estimatedLOC, consensus);

    return this.createDecision(
      issue,
      routingDecision.action,
      routingDecision.reasoning,
      consensus.confidence,
      routingDecision.source
    );
  }

  /**
   * Apply routing logic based on analysis
   */
  applyRoutingLogic(suggestedAction, severity, estimatedLOC, consensus) {
    const reasoning = [];

    // Start with suggested action
    let finalAction = suggestedAction;

    // Validate quick-fix eligibility
    if (suggestedAction === ACTIONS.QUICK_FIX) {
      if (estimatedLOC > this.config.QUICK_FIX_MAX_LOC) {
        finalAction = ACTIONS.CREATE_SD;
        reasoning.push(`Estimated ${estimatedLOC} LOC exceeds quick-fix threshold (${this.config.QUICK_FIX_MAX_LOC})`);
      } else {
        reasoning.push(`Small scope (~${estimatedLOC} LOC) suitable for quick-fix`);
      }

      if (severity === 'critical' || severity === 'major') {
        reasoning.push(`${severity} severity supports immediate action`);
      }
    }

    // Validate SD necessity
    if (suggestedAction === ACTIONS.CREATE_SD) {
      reasoning.push(`Scope (${estimatedLOC} LOC) or complexity requires planning`);

      if (estimatedLOC <= this.config.QUICK_FIX_MAX_LOC && severity !== 'critical') {
        // Could potentially be a quick-fix, but models suggested SD
        reasoning.push('Models recommend SD despite small scope - may have hidden complexity');
      }
    }

    // Validate backlog decision
    if (suggestedAction === ACTIONS.BACKLOG) {
      if (severity === 'minor' || severity === 'enhancement') {
        reasoning.push(`${severity} severity appropriate for backlog`);
      } else {
        reasoning.push('Lower priority or uncertain scope - parking in backlog');
      }
    }

    // Add consensus info
    if (consensus.confidenceLevel === 'high') {
      reasoning.push('Both GPT and Gemini agree on this classification');
    } else if (consensus.singleModelOnly) {
      reasoning.push(`Single model analysis (${consensus.availableModel}) - reduced confidence`);
    } else if (consensus.confidenceLevel === 'medium') {
      reasoning.push('Models mostly agree with minor differences');
    }

    return {
      action: finalAction,
      reasoning: reasoning.join('. ') + '.',
      source: 'consensus'
    };
  }

  /**
   * Create a routing decision object
   */
  createDecision(issue, action, reasoning, confidence, source) {
    return {
      issueId: issue.id,
      issueText: issue.text,
      action,
      reasoning,
      confidence,
      source,
      metadata: {
        detectedMode: issue.detectedMode,
        severity: issue.consensus?.finalValues?.severity,
        estimatedLOC: issue.consensus?.finalValues?.estimatedLOC,
        riskAreas: issue.consensus?.finalValues?.riskAreas,
        modelComparison: issue.consensus?.modelComparison
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Route multiple issues
   */
  routeBatch(issues) {
    return issues.map(issue => this.route(issue));
  }

  /**
   * Execute a routing decision
   * @param {Object} decision - Routing decision
   * @param {Object} options - Execution options
   */
  async executeDecision(decision, options = {}) {
    const { sdId, dryRun = false } = options;

    const result = {
      decision,
      executed: false,
      result: null
    };

    if (dryRun) {
      result.dryRun = true;
      result.wouldExecute = this.describeExecution(decision);
      return result;
    }

    switch (decision.action) {
      case ACTIONS.QUICK_FIX:
        result.result = await this.createQuickFix(decision, sdId);
        break;

      case ACTIONS.CREATE_SD:
        result.result = await this.createNewSD(decision);
        break;

      case ACTIONS.BACKLOG:
        result.result = await this.addToBacklog(decision, sdId);
        break;

      case ACTIONS.SKIP:
        result.result = { skipped: true, reason: 'User marked as not an issue' };
        break;
    }

    result.executed = true;
    return result;
  }

  /**
   * Describe what would be executed (for dry run)
   */
  describeExecution(decision) {
    switch (decision.action) {
      case ACTIONS.QUICK_FIX:
        return 'Would invoke /quick-fix command with issue details';
      case ACTIONS.CREATE_SD:
        return 'Would create new Strategic Directive in database';
      case ACTIONS.BACKLOG:
        return 'Would add to backlog/feedback table for later review';
      case ACTIONS.SKIP:
        return 'Would mark as skipped/not-an-issue';
      default:
        return 'Unknown action';
    }
  }

  /**
   * Create a quick-fix entry
   */
  async createQuickFix(decision, sdId) {
    if (!this.supabase) {
      return { success: false, reason: 'Database not configured' };
    }

    // Add to feedback table as quick-fix candidate
    const { data, error } = await this.supabase
      .from('feedback')
      .insert({
        title: decision.issueText.substring(0, 200),
        description: decision.issueText,
        type: 'issue',
        source_type: 'uat_feedback',
        source_sd_id: sdId,
        severity: decision.metadata?.severity || 'minor',
        priority: decision.metadata?.severity === 'critical' ? 'P1' : 'P2',
        status: 'new',
        ai_routing_decision: ACTIONS.QUICK_FIX,
        ai_routing_reasoning: decision.reasoning,
        ai_routing_confidence: decision.confidence,
        metadata: {
          routed_by: 'intelligent-uat-feedback',
          estimated_loc: decision.metadata?.estimatedLOC,
          risk_areas: decision.metadata?.riskAreas,
          model_comparison: decision.metadata?.modelComparison
        }
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, feedbackId: data.id, action: ACTIONS.QUICK_FIX };
  }

  /**
   * Create a new Strategic Directive
   */
  async createNewSD(decision) {
    if (!this.supabase) {
      return { success: false, reason: 'Database not configured' };
    }

    // Generate SD key
    const timestamp = Date.now().toString(36).toUpperCase();
    const sdId = `SD-UAT-${timestamp}`;

    const { data, error } = await this.supabase
      .from('strategic_directives_v2')
      .insert({
        id: sdId,
        title: decision.issueText.substring(0, 200),
        description: decision.issueText,
        status: 'draft',
        current_phase: 'LEAD_APPROVAL',
        priority: decision.metadata?.severity === 'critical' ? 'critical' : 'medium',
        category: 'fix',
        sd_type: 'fix',
        strategic_intent: decision.reasoning,
        metadata: {
          source: 'intelligent-uat-feedback',
          routing_decision: decision,
          estimated_loc: decision.metadata?.estimatedLOC,
          risk_areas: decision.metadata?.riskAreas
        }
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, sdId: data.id, action: ACTIONS.CREATE_SD };
  }

  /**
   * Add issue to backlog
   */
  async addToBacklog(decision, sdId) {
    if (!this.supabase) {
      return { success: false, reason: 'Database not configured' };
    }

    const { data, error } = await this.supabase
      .from('feedback')
      .insert({
        title: decision.issueText.substring(0, 200),
        description: decision.issueText,
        type: 'issue',
        source_type: 'uat_feedback',
        source_sd_id: sdId,
        severity: decision.metadata?.severity || 'low',
        priority: 'P3',
        status: 'backlog',
        ai_routing_decision: ACTIONS.BACKLOG,
        ai_routing_reasoning: decision.reasoning,
        ai_routing_confidence: decision.confidence,
        metadata: {
          routed_by: 'intelligent-uat-feedback',
          estimated_loc: decision.metadata?.estimatedLOC
        }
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, feedbackId: data.id, action: ACTIONS.BACKLOG };
  }

  /**
   * Allow user to override a routing decision
   */
  override(decision, newAction, reason) {
    return {
      ...decision,
      originalAction: decision.action,
      action: newAction,
      reasoning: `[OVERRIDE] ${reason}. Original: ${decision.reasoning}`,
      source: 'user_override',
      overrideReason: reason
    };
  }
}

// Export singleton instance
export const actionRouter = new ActionRouter();

// Export constants
export { ACTIONS, ROUTING_CONFIG };

export default ActionRouter;
