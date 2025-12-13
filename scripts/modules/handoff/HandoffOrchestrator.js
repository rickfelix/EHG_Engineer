/**
 * HandoffOrchestrator - Main orchestrator for LEO Protocol handoffs
 * Part of LEO Protocol Unified Handoff System refactor
 *
 * Provides the main entry point for handoff execution with:
 * - Dependency injection for testability
 * - Unified interface for all handoff types
 * - Consistent error handling and recording
 */

import { createClient } from '@supabase/supabase-js';
import { SDRepository } from './db/SDRepository.js';
import { PRDRepository } from './db/PRDRepository.js';
import { HandoffRepository } from './db/HandoffRepository.js';
import { ValidationOrchestrator } from './validation/ValidationOrchestrator.js';
import { HandoffRecorder } from './recording/HandoffRecorder.js';
import { ContentBuilder } from './content/ContentBuilder.js';
import ResultBuilder from './ResultBuilder.js';

export class HandoffOrchestrator {
  constructor(options = {}) {
    // Create or use injected Supabase client
    this.supabase = options.supabase || createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // Dependency injection for all components
    this.sdRepo = options.sdRepo || new SDRepository(this.supabase);
    this.prdRepo = options.prdRepo || new PRDRepository(this.supabase);
    this.handoffRepo = options.handoffRepo || new HandoffRepository(this.supabase);
    this.validationOrchestrator = options.validationOrchestrator || new ValidationOrchestrator(this.supabase);
    this.contentBuilder = options.contentBuilder || new ContentBuilder();
    this.recorder = options.recorder || new HandoffRecorder(this.supabase, {
      contentBuilder: this.contentBuilder,
      validationOrchestrator: this.validationOrchestrator
    });

    // Supported handoff types
    this.supportedHandoffs = [
      'LEAD-TO-PLAN',
      'PLAN-TO-EXEC',
      'EXEC-TO-PLAN',
      'PLAN-TO-LEAD',
      'LEAD-FINAL-APPROVAL'
    ];

    // Executors (will be lazy loaded or injected)
    this._executors = options.executors || null;
  }

  /**
   * Main handoff execution entry point
   * @param {string} handoffType - Handoff type (case-insensitive)
   * @param {string} sdId - Strategic Directive ID
   * @param {object} options - Execution options
   * @returns {Promise<object>} Execution result
   */
  async executeHandoff(handoffType, sdId, options = {}) {
    // Normalize handoff type
    const normalizedType = handoffType.toUpperCase();

    console.log('🔄 UNIFIED LEO HANDOFF SYSTEM (Refactored)');
    console.log('='.repeat(50));
    console.log(`Type: ${normalizedType}${handoffType !== normalizedType ? ` (normalized from: ${handoffType})` : ''}`);
    console.log(`Strategic Directive: ${sdId}`);
    console.log('Options:', options);
    console.log('');

    try {
      // MANDATORY: Verify SD exists in database
      await this.sdRepo.verifyExists(sdId);

      // Validate handoff type
      if (!this.supportedHandoffs.includes(normalizedType)) {
        return ResultBuilder.unsupportedType(normalizedType, this.supportedHandoffs);
      }

      // SD-LEO-GEMINI-001 (US-006): Self-Critique Pre-Flight
      // Validate agent confidence scoring before handoff
      const selfCritiqueResult = this._validateSelfCritique(normalizedType, options);
      if (selfCritiqueResult.blocked) {
        return ResultBuilder.rejected(
          'LOW_CONFIDENCE',
          selfCritiqueResult.message
        );
      }

      // Load template
      const template = await this.handoffRepo.loadTemplate(normalizedType);
      if (!template) {
        console.warn(`⚠️  No template found for: ${normalizedType} (continuing without template)`);
      }

      // Get executor for this handoff type
      const executor = await this._getExecutor(normalizedType);
      if (!executor) {
        return ResultBuilder.rejected(
          'EXECUTOR_NOT_FOUND',
          `No executor registered for handoff type: ${normalizedType}`
        );
      }

      // Execute the handoff
      const result = await executor.execute(sdId, options);

      // Record result
      if (result.success) {
        await this.recorder.recordSuccess(normalizedType, sdId, result, template);
      } else if (!result.systemError) {
        await this.recorder.recordFailure(normalizedType, sdId, result, template);
      }

      return result;

    } catch (error) {
      console.error('❌ Handoff system error:', error.message);

      // Record system error
      await this.recorder.recordSystemError(normalizedType, sdId, error.message);

      return ResultBuilder.systemError(error);
    }
  }

  /**
   * List handoff executions
   * @param {object} filters - Query filters
   * @returns {Promise<array>} Execution records
   */
  async listHandoffExecutions(filters = {}) {
    return this.handoffRepo.listExecutions(filters);
  }

  /**
   * Get handoff system statistics
   * @returns {Promise<object|null>} Statistics
   */
  async getHandoffStats() {
    return this.handoffRepo.getStats();
  }

  /**
   * Get executor for handoff type
   */
  async _getExecutor(handoffType) {
    // Load executors if not already loaded
    if (!this._executors) {
      await this._loadExecutors();
    }

    return this._executors[handoffType] || null;
  }

  /**
   * Lazy load executors
   */
  async _loadExecutors() {
    if (this._executors) return;

    // Import executors
    const { PlanToExecExecutor } = await import('./executors/PlanToExecExecutor.js');
    const { ExecToPlanExecutor } = await import('./executors/ExecToPlanExecutor.js');
    const { PlanToLeadExecutor } = await import('./executors/PlanToLeadExecutor.js');
    const { LeadToPlanExecutor } = await import('./executors/LeadToPlanExecutor.js');
    const { LeadFinalApprovalExecutor } = await import('./executors/LeadFinalApprovalExecutor.js');

    // Create executor instances with shared dependencies
    const executorDeps = {
      supabase: this.supabase,
      sdRepo: this.sdRepo,
      prdRepo: this.prdRepo,
      validationOrchestrator: this.validationOrchestrator,
      contentBuilder: this.contentBuilder
    };

    this._executors = {
      'LEAD-TO-PLAN': new LeadToPlanExecutor(executorDeps),
      'PLAN-TO-EXEC': new PlanToExecExecutor(executorDeps),
      'EXEC-TO-PLAN': new ExecToPlanExecutor(executorDeps),
      'PLAN-TO-LEAD': new PlanToLeadExecutor(executorDeps),
      'LEAD-FINAL-APPROVAL': new LeadFinalApprovalExecutor(executorDeps)
    };
  }

  /**
   * Register a custom executor (for testing or extensions)
   * @param {string} handoffType - Handoff type
   * @param {object} executor - Executor instance
   */
  registerExecutor(handoffType, executor) {
    if (!this._executors) {
      this._executors = {};
    }
    this._executors[handoffType.toUpperCase()] = executor;
  }

  /**
   * SD-LEO-GEMINI-001 (US-006): Self-Critique Pre-Flight
   *
   * Validates agent confidence scoring before handoff execution.
   * Prompts agents to self-assess their confidence level (1-10) before submitting handoffs.
   *
   * Behavior:
   * - If confidence provided and >= 7: Pass (green light)
   * - If confidence provided and 5-6: Warn but allow (amber light)
   * - If confidence provided and < 5: Block with explanation requirement
   * - If no confidence provided: Warn but allow (soft enforcement)
   *
   * @param {string} handoffType - Type of handoff being executed
   * @param {object} options - Handoff options (may contain self_critique)
   * @returns {object} Validation result { blocked, warning, message, confidence }
   */
  _validateSelfCritique(handoffType, options) {
    console.log('\n🎯 SELF-CRITIQUE PRE-FLIGHT');
    console.log('-'.repeat(50));

    const MIN_CONFIDENCE = 5;
    const GOOD_CONFIDENCE = 7;

    // Check for self-critique data in options
    const selfCritique = options.self_critique || options.selfCritique || options.confidence;

    if (!selfCritique) {
      // Soft enforcement: warn but don't block if no confidence provided
      console.log('   ℹ️  No self-critique confidence provided');
      console.log('   💡 Consider providing confidence score (1-10) in options:');
      console.log('      options.self_critique = { confidence: 8, reasoning: "..." }');
      console.log('');
      return {
        blocked: false,
        warning: true,
        message: 'No self-critique confidence provided (soft enforcement)',
        confidence: null
      };
    }

    // Extract confidence score
    const confidence = typeof selfCritique === 'number'
      ? selfCritique
      : (selfCritique.confidence || selfCritique.score || 7);

    const reasoning = selfCritique.reasoning || selfCritique.explanation || '';
    const gaps = selfCritique.gaps || selfCritique.concerns || [];

    console.log(`   📊 Agent Confidence: ${confidence}/10`);

    if (confidence >= GOOD_CONFIDENCE) {
      // High confidence - proceed
      console.log('   ✅ HIGH CONFIDENCE: Proceeding with handoff');
      if (reasoning) {
        console.log(`   📝 Reasoning: ${reasoning.substring(0, 100)}${reasoning.length > 100 ? '...' : ''}`);
      }
      console.log('');
      return {
        blocked: false,
        warning: false,
        message: 'High confidence - proceeding',
        confidence
      };
    } else if (confidence >= MIN_CONFIDENCE) {
      // Medium confidence - warn but allow
      console.log('   ⚠️  MEDIUM CONFIDENCE: Proceeding with caution');
      console.log('   💡 Consider reviewing before handoff completion');

      if (gaps.length > 0) {
        console.log('   📋 Identified Gaps:');
        gaps.slice(0, 3).forEach((gap, i) => console.log(`      ${i + 1}. ${gap}`));
      }

      if (reasoning) {
        console.log(`   📝 Reasoning: ${reasoning.substring(0, 100)}${reasoning.length > 100 ? '...' : ''}`);
      }

      console.log('');
      return {
        blocked: false,
        warning: true,
        message: `Medium confidence (${confidence}/10) - proceeding with warning`,
        confidence,
        gaps
      };
    } else {
      // Low confidence - block or warn based on explanation
      console.log('   ❌ LOW CONFIDENCE: Review required before handoff');

      if (!reasoning || reasoning.length < 20) {
        // Block: low confidence with no explanation
        console.log(`   🛑 BLOCKED: Low confidence (${confidence}/10) requires explanation`);
        console.log('   📋 TO PROCEED:');
        console.log('      1. Identify specific gaps or concerns');
        console.log('      2. Provide reasoning for low confidence');
        console.log('      3. Address gaps before re-submitting');
        console.log('   💡 Add to options: self_critique.reasoning = "..."');
        console.log('');
        return {
          blocked: true,
          warning: false,
          message: `Low confidence (${confidence}/10) with insufficient explanation. Provide reasoning or address concerns.`,
          confidence,
          gaps
        };
      }

      // Low confidence but with explanation - warn but allow
      console.log('   ⚠️  LOW CONFIDENCE but explanation provided');
      console.log(`   📝 Reasoning: ${reasoning.substring(0, 150)}${reasoning.length > 150 ? '...' : ''}`);

      if (gaps.length > 0) {
        console.log('   📋 Known Gaps:');
        gaps.slice(0, 5).forEach((gap, i) => console.log(`      ${i + 1}. ${gap}`));
      }

      console.log('');
      return {
        blocked: false,
        warning: true,
        message: `Low confidence (${confidence}/10) with explanation - proceeding with strong warning`,
        confidence,
        gaps,
        reasoning
      };
    }
  }
}

/**
 * Factory function for creating HandoffOrchestrator
 * @param {object} options - Configuration options
 * @returns {HandoffOrchestrator} Orchestrator instance
 */
export function createHandoffSystem(options = {}) {
  return new HandoffOrchestrator(options);
}

export default HandoffOrchestrator;
