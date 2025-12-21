/**
 * Base Sub-Agent Class
 * Provides standardized interface and utilities for all sub-agents
 * LEO Protocol v4.1.2 - Sub-Agent Enhancement
 *
 * STRATEGIC HARDENING: Budget enforcement at constructor level
 * THE LAW: No sub-agent shall exist if budget_remaining <= 0. NO EXCEPTIONS.
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

/**
 * BudgetExhaustedException - Thrown when agent budget is depleted
 * Non-retryable error that halts agent execution immediately
 * ABSOLUTE kill switch - no agent can execute if budget is zero
 */
export class BudgetExhaustedException extends Error {
  constructor(agentId, ventureId, budgetRemaining) {
    super(`Budget exhausted for agent ${agentId} (venture: ${ventureId}). Remaining: ${budgetRemaining}`);
    this.name = 'BudgetExhaustedException';
    this.isRetryable = false;
    this.agentId = agentId;
    this.ventureId = ventureId;
    this.budgetRemaining = budgetRemaining;
  }
}

/**
 * VentureRequiredException - Thrown when agent is instantiated without ventureId
 * SD-HARDENING-V2-004: Legacy Mode Elimination
 * THE LAW: Every sub-agent MUST belong to a venture. NO EXCEPTIONS.
 */
export class VentureRequiredException extends Error {
  constructor(agentName) {
    super(`Venture governance required: Agent "${agentName}" cannot be instantiated without ventureId. Legacy mode has been eliminated.`);
    this.name = 'VentureRequiredException';
    this.isRetryable = false;
    this.agentName = agentName;
  }
}

/**
 * BudgetConfigurationException - Thrown when budget tracking is not configured
 * Industrial Hardening v3.0: Fail-closed behavior - no budget record means HALT
 * NON-RETRYABLE - requires database configuration to resolve
 */
export class BudgetConfigurationException extends Error {
  constructor(agentId, ventureId, reason) {
    super(`Budget configuration missing for agent ${agentId} (venture: ${ventureId}). Reason: ${reason}`);
    this.name = 'BudgetConfigurationException';
    this.isRetryable = false;
    this.agentId = agentId;
    this.ventureId = ventureId;
    this.reason = reason;
  }
}

/**
 * Get Supabase client singleton for budget checks
 */
let _supabaseClient = null;
function getSupabaseClient() {
  if (!_supabaseClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseKey) {
      _supabaseClient = createClient(supabaseUrl, supabaseKey);
    }
  }
  return _supabaseClient;
}

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
    this.confidenceThresholds = {
      minimum: 0.6,     // Don't report below this
      high: 0.8,        // High confidence
      certain: 0.95     // Near certain
    };

    // Severity weights for scoring
    this.severityWeights = {
      critical: 20,
      high: 10,
      medium: 5,
      low: 1,
      info: 0
    };
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
      await BaseSubAgent._logInstantiationAttempt(
        effectiveAgentId,
        null,
        'BLOCKED_NO_VENTURE',
        { error: 'ventureId is required. Legacy mode has been eliminated.' }
      );
      throw new VentureRequiredException(name);
    }

    // Log instantiation attempt
    await BaseSubAgent._logInstantiationAttempt(effectiveAgentId, ventureId, 'STARTED');

    try {
      // BUDGET KILL SWITCH: Validate budget before instantiation
      const budgetResult = await BaseSubAgent.checkBudget(ventureId);

      if (budgetResult.budgetRemaining !== null && budgetResult.budgetRemaining <= 0) {
        await BaseSubAgent._logInstantiationAttempt(
          effectiveAgentId,
          ventureId,
          'BLOCKED_BUDGET_EXHAUSTED',
          { budgetRemaining: budgetResult.budgetRemaining, source: budgetResult.source }
        );
        throw new BudgetExhaustedException(effectiveAgentId, ventureId, budgetResult.budgetRemaining);
      }

      // Budget validated - create instance with validation flag
      await BaseSubAgent._logInstantiationAttempt(
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
      await BaseSubAgent._logInstantiationAttempt(
        effectiveAgentId,
        ventureId,
        'FAILED_ERROR',
        { error: error.message }
      );
      throw error;
    }
  }

  /**
   * Check budget for a venture
   * @param {string} ventureId - Venture ID to check budget for
   * @returns {Promise<{budgetRemaining: number|null, source: string}>}
   */
  static async checkBudget(ventureId) {
    const supabase = getSupabaseClient();

    if (!supabase) {
      // Industrial Hardening v3.0: FAIL-CLOSED - no client means HALT
      console.error('[BUDGET] FAIL-CLOSED: Supabase client not available - cannot verify budget');
      throw new BudgetConfigurationException(
        'sub-agent-factory',
        ventureId,
        'NO_SUPABASE_CLIENT - Cannot verify budget without database connection'
      );
    }

    // Query venture_token_budgets first
    const { data: budgetData, error: budgetError } = await supabase
      .from('venture_token_budgets')
      .select('budget_remaining, budget_allocated')
      .eq('venture_id', ventureId)
      .single();

    if (!budgetError && budgetData) {
      return {
        budgetRemaining: budgetData.budget_remaining,
        source: 'venture_token_budgets'
      };
    }

    // Fallback to venture_phase_budgets
    const { data: phaseBudgetData, error: phaseError } = await supabase
      .from('venture_phase_budgets')
      .select('budget_remaining, budget_allocated')
      .eq('venture_id', ventureId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!phaseError && phaseBudgetData) {
      return {
        budgetRemaining: phaseBudgetData.budget_remaining,
        source: 'venture_phase_budgets'
      };
    }

    // Industrial Hardening v3.0: FAIL-CLOSED - no record means HALT
    console.error(`[BUDGET] FAIL-CLOSED: No budget record for venture ${ventureId}`);
    throw new BudgetConfigurationException(
      'sub-agent-factory',
      ventureId,
      'NO_BUDGET_RECORD - Venture must have budget tracking configured before agent execution'
    );
  }

  /**
   * Log instantiation attempt to system_events
   * @private
   */
  static async _logInstantiationAttempt(agentId, ventureId, status, details = {}) {
    const supabase = getSupabaseClient();

    if (!supabase) {
      // Log to console if Supabase unavailable
      console.log(`[AGENT_INSTANTIATION] ${status}: agent=${agentId}, venture=${ventureId}`, details);
      return;
    }

    try {
      await supabase
        .from('system_events')
        .insert({
          event_type: 'AGENT_INSTANTIATION',
          event_source: 'base-sub-agent',
          severity: status.includes('BLOCKED') || status.includes('FAILED') ? 'error' : 'info',
          details: {
            agent_id: agentId,
            venture_id: ventureId,
            status: status,
            ...details,
            timestamp: new Date().toISOString()
          }
        });
    } catch (err) {
      // Don't fail on logging errors
      console.warn(`[AGENT_INSTANTIATION] Failed to log: ${err.message}`);
    }
  }

  /**
   * Standard execute method - must be implemented by subclasses
   */
  async execute(context = {}) {
    this.metadata.startTime = new Date().toISOString();

    try {
      // Run the actual analysis (implemented by subclass)
      await this.analyze(context);

      // Deduplicate findings
      this.findings = this.deduplicateFindings(this.findings);

      // Filter by confidence
      this.findings = this.filterByConfidence(this.findings);

      // Calculate score
      const score = this.calculateScore();

      // Generate standard output
      return this.generateStandardOutput(score);

    } catch (error) {
      return this.handleError(error);
    } finally {
      this.metadata.endTime = new Date().toISOString();
    }
  }

  /**
   * Must be implemented by subclasses
   */
  async analyze(context) {
    throw new Error(`${this.name} must implement analyze() method`);
  }

  /**
   * Add a finding with standard structure
   */
  addFinding(finding) {
    // Generate unique ID based on content
    const id = this.generateFindingId(finding);

    // Standard structure
    const standardFinding = {
      id,
      agent: this.name,
      type: finding.type || 'UNKNOWN',
      severity: this.normalizeSeverity(finding.severity),
      confidence: finding.confidence || 0.7,
      location: {
        file: finding.file || null,
        line: finding.line || null,
        column: finding.column || null,
        snippet: finding.snippet || null
      },
      description: finding.description || 'No description provided',
      recommendation: finding.recommendation || null,
      metadata: finding.metadata || {},
      timestamp: new Date().toISOString()
    };

    this.findings.push(standardFinding);
    return standardFinding;
  }

  /**
   * Generate unique ID for finding
   */
  generateFindingId(finding) {
    const content = `${finding.type}-${finding.file}-${finding.line}-${finding.description}`;
    return crypto.createHash('md5').update(content).digest('hex').substring(0, 8);
  }

  /**
   * Deduplicate findings
   */
  deduplicateFindings(findings) {
    const seen = new Map();
    const deduplicated = [];

    for (const finding of findings) {
      // Create dedup key
      const key = `${finding.type}-${finding.location.file}-${finding.location.line}`;

      if (seen.has(key)) {
        // Merge with existing if higher severity or confidence
        const existing = seen.get(key);
        if (finding.confidence > existing.confidence ||
            this.severityWeights[finding.severity] > this.severityWeights[existing.severity]) {
          seen.set(key, finding);
        }
      } else {
        seen.set(key, finding);
      }
    }

    // Convert back to array and group similar issues
    for (const [key, finding] of seen) {
      // Count similar issues
      const similarCount = findings.filter(f =>
        f.type === finding.type &&
        f.location.file === finding.location.file
      ).length;

      if (similarCount > 1) {
        finding.metadata = finding.metadata || {};
        finding.metadata.occurrences = similarCount;
        finding.description = `${finding.description} (${similarCount} occurrences in file)`;
      }

      deduplicated.push(finding);
    }

    return deduplicated;
  }

  /**
   * Filter findings by confidence threshold
   */
  filterByConfidence(findings) {
    return findings.filter(f => f.confidence >= this.confidenceThresholds.minimum);
  }

  /**
   * Calculate score based on severity-weighted findings
   */
  calculateScore() {
    let score = 100;

    // Group findings by severity
    const bySeverity = {};
    for (const finding of this.findings) {
      bySeverity[finding.severity] = (bySeverity[finding.severity] || 0) + 1;
    }

    // Apply severity weights
    for (const [severity, count] of Object.entries(bySeverity)) {
      const weight = this.severityWeights[severity] || 0;
      score -= Math.min(count * weight, 100); // Cap at 100 points deduction
    }

    return Math.max(0, score);
  }

  /**
   * Generate standard output format
   */
  generateStandardOutput(score) {
    // Group findings by severity
    const bySeverity = {
      critical: [],
      high: [],
      medium: [],
      low: [],
      info: []
    };

    for (const finding of this.findings) {
      if (bySeverity[finding.severity]) {
        bySeverity[finding.severity].push(finding);
      }
    }

    return {
      agent: this.name,
      score,
      status: this.getStatus(score),
      summary: this.generateSummary(),
      findings: this.findings,
      findingsBySeverity: bySeverity,
      metrics: this.metrics,
      metadata: this.metadata,
      recommendations: this.generateRecommendations()
    };
  }

  /**
   * Get status based on score
   */
  getStatus(score) {
    if (score >= 90) return 'EXCELLENT';
    if (score >= 75) return 'GOOD';
    if (score >= 60) return 'ACCEPTABLE';
    if (score >= 40) return 'POOR';
    return 'CRITICAL';
  }

  /**
   * Generate summary
   */
  generateSummary() {
    const total = this.findings.length;
    const critical = this.findings.filter(f => f.severity === 'critical').length;
    const high = this.findings.filter(f => f.severity === 'high').length;

    if (critical > 0) {
      return `${critical} critical issues require immediate attention`;
    } else if (high > 0) {
      return `${high} high priority issues found`;
    } else if (total > 0) {
      return `${total} issues found, all manageable`;
    }
    return 'No issues found';
  }

  /**
   * Generate recommendations based on findings
   */
  generateRecommendations() {
    const recommendations = [];

    // Group by type and generate recommendations
    const byType = {};
    for (const finding of this.findings) {
      if (!byType[finding.type]) {
        byType[finding.type] = [];
      }
      byType[finding.type].push(finding);
    }

    // Create recommendations for each type
    for (const [type, findings] of Object.entries(byType)) {
      if (findings.length >= 3) {
        // Pattern detected
        recommendations.push({
          title: `Fix ${type} pattern`,
          description: `Found ${findings.length} instances of ${type}`,
          impact: this.getImpact(findings[0].severity),
          effort: this.estimateEffort(findings.length)
        });
      }
    }

    return recommendations.slice(0, 5); // Top 5 recommendations
  }

  /**
   * Normalize severity levels
   */
  normalizeSeverity(severity) {
    const normalized = String(severity).toLowerCase();
    const mapping = {
      'critical': 'critical',
      'high': 'high',
      'medium': 'medium',
      'low': 'low',
      'info': 'info',
      'error': 'critical',
      'warning': 'medium',
      'notice': 'low'
    };
    return mapping[normalized] || 'medium';
  }

  /**
   * Get impact level
   */
  getImpact(severity) {
    const impacts = {
      critical: 'CRITICAL',
      high: 'HIGH',
      medium: 'MEDIUM',
      low: 'LOW'
    };
    return impacts[severity] || 'MEDIUM';
  }

  /**
   * Estimate effort
   */
  estimateEffort(count) {
    if (count <= 1) return 'TRIVIAL';
    if (count <= 5) return 'SMALL';
    if (count <= 20) return 'MEDIUM';
    return 'LARGE';
  }

  /**
   * Handle errors
   */
  handleError(error) {
    return {
      agent: this.name,
      score: 0,
      status: 'ERROR',
      error: error.message,
      findings: [],
      findingsBySeverity: {
        critical: [],
        high: [],
        medium: [],
        low: [],
        info: []
      },
      metrics: this.metrics,
      metadata: this.metadata
    };
  }

  /**
   * Utility: Get source files
   */
  async getSourceFiles(basePath, extensions = ['.js', '.jsx', '.ts', '.tsx']) {
    const files = [];

    async function scan(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip node_modules and hidden directories
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
          continue;
        }

        if (entry.isDirectory()) {
          await scan(fullPath);
        } else if (extensions.some(ext => entry.name.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    }

    await scan(basePath);
    return files;
  }
}

export default BaseSubAgent;
// Note: BudgetExhaustedException, VentureRequiredException, and BudgetConfigurationException
// are exported inline at their class declarations above
