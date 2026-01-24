/**
 * Base Sub-Agent Class
 * Provides standardized interface and utilities for all sub-agents
 * LEO Protocol v4.1.2 - Sub-Agent Enhancement
 *
 * STRATEGIC HARDENING: Budget enforcement at constructor level
 * THE LAW: No sub-agent shall exist if budget_remaining <= 0. NO EXCEPTIONS.
 *
 * Refactored: 2026-01-24 (SD-LEO-REFAC-BASE-AGENT-003)
 *
 * Module Structure:
 * - exceptions.js: Exception classes (BudgetExhaustedException, etc.)
 * - budget-manager.js: Budget checking and logging
 * - finding-manager.js: Finding creation, deduplication, scoring
 * - output-generator.js: Output generation, status, recommendations
 */

// Import from extracted modules
import {
  BudgetExhaustedException,
  VentureRequiredException,
  BudgetConfigurationException
} from './exceptions.js';

import {
  getSupabaseClient,
  checkBudget,
  logInstantiationAttempt
} from './budget-manager.js';

import {
  DEFAULT_CONFIDENCE_THRESHOLDS,
  SEVERITY_WEIGHTS,
  generateFindingId,
  normalizeSeverity,
  createStandardFinding,
  deduplicateFindings,
  filterByConfidence,
  calculateScore
} from './finding-manager.js';

import {
  getStatus,
  generateSummary,
  getImpact,
  estimateEffort,
  generateRecommendations,
  generateStandardOutput,
  handleError,
  applyDegradePolicy,
  handleAuditFailure,
  getSourceFiles
} from './output-generator.js';

class BaseSubAgent {
  /**
   * Private constructor - MUST be called through factory method create()
   * SD-HARDENING-V2-004: Legacy Mode Eliminated
   * @param {string} name - Agent name
   * @param {string} emoji - Agent emoji (default: robot)
   * @param {Object} options - Additional options including _budgetValidated flag
   */
  constructor(name, emoji = '🤖', options = {}) {
    // KILL SWITCH: Enforce factory pattern usage - NO LEGACY MODE
    // Every sub-agent MUST have a ventureId and pass budget validation
    if (!options._budgetValidated) {
      throw new Error(
        `SECURITY VIOLATION: Direct instantiation of ${name} is forbidden. ` +
        'Use BaseSubAgent.create() factory method to instantiate sub-agents with budget enforcement.'
      );
    }

    // SD-HARDENING-V2-004: ventureId is MANDATORY - no legacy mode
    if (!options.ventureId) {
      throw new VentureRequiredException(name);
    }

    this.name = name;
    this.emoji = emoji;
    this.ventureId = options.ventureId;  // REQUIRED, no fallback to null
    this.agentId = options.agentId || `${name}-${Date.now()}`;
    this.findings = [];
    this.uncertainties = [];  // Anti-hallucination: separate low-confidence findings
    this.metrics = {};
    this.metadata = {
      startTime: null,
      endTime: null,
      filesScanned: 0,
      version: '1.0.0',
      budgetValidated: options._budgetValidated || false,
      budgetRemaining: options._budgetRemaining || null
    };

    // Confidence thresholds
    this.confidenceThresholds = { ...DEFAULT_CONFIDENCE_THRESHOLDS };

    // Severity weights for scoring
    this.severityWeights = { ...SEVERITY_WEIGHTS };
  }

  /**
   * Factory method with budget enforcement - THE ONLY WAY to create sub-agents
   * SD-HARDENING-V2-004: Legacy Mode Eliminated
   * @param {string} name - Agent name
   * @param {string} emoji - Agent emoji (default: robot)
   * @param {Object} options - Configuration options
   * @param {string} options.ventureId - REQUIRED (no legacy mode - every agent needs a venture)
   * @param {string} options.agentId - Optional agent identifier
   * @returns {Promise<BaseSubAgent>} - New sub-agent instance
   * @throws {VentureRequiredException} - If ventureId is not provided
   * @throws {BudgetExhaustedException} - If budget is exhausted
   */
  static async create(name, emoji = '🤖', options = {}) {
    const { ventureId, agentId } = options;
    const effectiveAgentId = agentId || `${name}-${Date.now()}`;

    // SD-HARDENING-V2-004: ZERO TOLERANCE - ventureId is MANDATORY
    // Legacy mode has been eliminated. Every sub-agent must belong to a venture.
    if (!ventureId) {
      await logInstantiationAttempt(
        effectiveAgentId,
        null,
        'BLOCKED_NO_VENTURE',
        { error: 'ventureId is required. Legacy mode has been eliminated.' }
      );
      throw new VentureRequiredException(name);
    }

    // Log instantiation attempt
    await logInstantiationAttempt(effectiveAgentId, ventureId, 'STARTED');

    try {
      // BUDGET KILL SWITCH: Validate budget before instantiation
      const budgetResult = await checkBudget(ventureId);

      if (budgetResult.budgetRemaining !== null && budgetResult.budgetRemaining <= 0) {
        await logInstantiationAttempt(
          effectiveAgentId,
          ventureId,
          'BLOCKED_BUDGET_EXHAUSTED',
          { budgetRemaining: budgetResult.budgetRemaining, source: budgetResult.source }
        );
        throw new BudgetExhaustedException(effectiveAgentId, ventureId, budgetResult.budgetRemaining);
      }

      // Budget validated - create instance with validation flag
      await logInstantiationAttempt(
        effectiveAgentId,
        ventureId,
        'SUCCEEDED',
        { budgetRemaining: budgetResult.budgetRemaining, source: budgetResult.source }
      );

      return new BaseSubAgent(name, emoji, {
        ...options,
        _budgetValidated: true,
        _budgetRemaining: budgetResult.budgetRemaining
      });

    } catch (error) {
      // Re-throw known exceptions
      if (error instanceof BudgetExhaustedException || error instanceof VentureRequiredException) {
        throw error;
      }

      // Log other errors
      await logInstantiationAttempt(
        effectiveAgentId,
        ventureId,
        'FAILED_ERROR',
        { error: error.message }
      );
      throw error;
    }
  }

  /**
   * Static method to check budget (exposed for external use)
   */
  static checkBudget = checkBudget;

  /**
   * Standard execute method - must be implemented by subclasses
   * Enhanced with Anti-Hallucination Claim/Evidence Audit
   */
  async execute(context = {}) {
    this.metadata.startTime = new Date().toISOString();

    try {
      // Run the actual analysis (implemented by subclass)
      await this.analyze(context);

      // Deduplicate findings
      this.findings = deduplicateFindings(this.findings, this.severityWeights);

      // Filter by confidence (populates uncertainties array)
      const filterResult = filterByConfidence(
        this.findings,
        this.confidenceThresholds.minimum,
        this.name
      );
      this.findings = filterResult.passed;
      this.uncertainties.push(...filterResult.uncertainties);

      // Calculate score
      const score = calculateScore(this.findings, this.severityWeights);

      // Run claim/evidence audit (anti-hallucination)
      let auditResults = null;
      if (!this.metadata.skipClaimEvidenceAudit) {
        auditResults = await this._runClaimEvidenceAudit(context);
      }

      // Generate standard output with audit results
      let output = generateStandardOutput({
        agentName: this.name,
        score,
        findings: this.findings,
        uncertainties: this.uncertainties,
        metrics: this.metrics,
        metadata: this.metadata,
        auditResults,
        rejectedHypotheses: this._rejectedHypotheses
      });

      // Apply degrade policy if needed
      if (auditResults?.action === 'DEGRADE_CONFIDENCE') {
        output = applyDegradePolicy(output, auditResults);
      }

      return output;

    } catch (error) {
      // Handle ClaimEvidenceAuditException specifically
      if (error.name === 'ClaimEvidenceAuditException') {
        return handleAuditFailure(error, this.name, this.uncertainties, this.metrics, this.metadata);
      }
      return handleError(error, this.name, this.metrics, this.metadata);
    } finally {
      this.metadata.endTime = new Date().toISOString();
    }
  }

  /**
   * Run claim/evidence audit before output emission
   * Anti-hallucination safeguard - validates claims have evidence
   * @private
   */
  async _runClaimEvidenceAudit(context = {}) {
    try {
      const { getClaimEvidenceAuditor } = require('./claim-evidence-auditor.cjs');
      const auditor = getClaimEvidenceAuditor();
      return await auditor.audit(this, context);
    } catch (err) {
      // If auditor module not available, log and continue
      if (err.code === 'ERR_MODULE_NOT_FOUND') {
        console.warn('[BaseSubAgent] Claim/Evidence auditor not available, skipping audit');
        return null;
      }
      throw err;
    }
  }

  /**
   * Must be implemented by subclasses
   */
  async analyze(_context) {
    throw new Error(`${this.name} must implement analyze() method`);
  }

  /**
   * Add a finding with standard structure
   */
  addFinding(finding) {
    const standardFinding = createStandardFinding(finding, this.name);
    this.findings.push(standardFinding);
    return standardFinding;
  }

  /**
   * Generate unique ID for finding (delegated to finding-manager)
   */
  generateFindingId(finding) {
    return generateFindingId(finding);
  }

  /**
   * Deduplicate findings (delegated)
   */
  deduplicateFindings(findings) {
    return deduplicateFindings(findings, this.severityWeights);
  }

  /**
   * Filter findings by confidence threshold (instance method)
   */
  filterByConfidence(findings) {
    const result = filterByConfidence(findings, this.confidenceThresholds.minimum, this.name);
    this.uncertainties.push(...result.uncertainties);
    return result.passed;
  }

  /**
   * Calculate score based on severity-weighted findings
   */
  calculateScore() {
    return calculateScore(this.findings, this.severityWeights);
  }

  /**
   * Generate standard output format
   */
  generateStandardOutput(score, auditResults = null) {
    return generateStandardOutput({
      agentName: this.name,
      score,
      findings: this.findings,
      uncertainties: this.uncertainties,
      metrics: this.metrics,
      metadata: this.metadata,
      auditResults,
      rejectedHypotheses: this._rejectedHypotheses
    });
  }

  /**
   * Get status based on score (delegated)
   */
  getStatus(score) {
    return getStatus(score);
  }

  /**
   * Generate summary (delegated)
   */
  generateSummary() {
    return generateSummary(this.findings);
  }

  /**
   * Generate recommendations based on findings (delegated)
   */
  generateRecommendations() {
    return generateRecommendations(this.findings);
  }

  /**
   * Normalize severity levels (delegated)
   */
  normalizeSeverity(severity) {
    return normalizeSeverity(severity);
  }

  /**
   * Get impact level (delegated)
   */
  getImpact(severity) {
    return getImpact(severity);
  }

  /**
   * Estimate effort (delegated)
   */
  estimateEffort(count) {
    return estimateEffort(count);
  }

  /**
   * Handle errors (delegated)
   */
  handleError(error) {
    return handleError(error, this.name, this.metrics, this.metadata);
  }

  /**
   * Utility: Get source files (delegated)
   */
  async getSourceFiles(basePath, extensions = ['.js', '.jsx', '.ts', '.tsx']) {
    return getSourceFiles(basePath, extensions);
  }
}

export default BaseSubAgent;

// Re-export exceptions for convenience
export {
  BudgetExhaustedException,
  VentureRequiredException,
  BudgetConfigurationException
};

// Re-export utility functions that might be needed externally
export {
  getSupabaseClient,
  checkBudget,
  generateFindingId,
  normalizeSeverity,
  calculateScore,
  getStatus,
  generateSummary,
  getSourceFiles,
  DEFAULT_CONFIDENCE_THRESHOLDS,
  SEVERITY_WEIGHTS
};
