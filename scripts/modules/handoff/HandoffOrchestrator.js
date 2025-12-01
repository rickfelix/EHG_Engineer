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
      'PLAN-TO-LEAD'
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
      'PLAN-TO-LEAD': new PlanToLeadExecutor(executorDeps)
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
