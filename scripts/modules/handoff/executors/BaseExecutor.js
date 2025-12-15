/**
 * BaseExecutor - Abstract base class for handoff executors
 * Part of LEO Protocol Unified Handoff System refactor
 *
 * Provides template method pattern for consistent handoff execution flow.
 */

import ResultBuilder from '../ResultBuilder.js';

export class BaseExecutor {
  constructor(dependencies = {}) {
    this.supabase = dependencies.supabase;
    this.sdRepo = dependencies.sdRepo;
    this.prdRepo = dependencies.prdRepo;
    this.validationOrchestrator = dependencies.validationOrchestrator;
    this.contentBuilder = dependencies.contentBuilder;

    if (!this.supabase) {
      throw new Error('BaseExecutor requires a Supabase client');
    }
  }

  /**
   * Execute the handoff - template method
   * Subclasses should NOT override this, but implement abstract methods
   * @param {string} sdId - Strategic Directive ID
   * @param {object} options - Execution options
   * @returns {Promise<object>} Execution result
   */
  async execute(sdId, options = {}) {
    console.log(`🔍 ${this.handoffType} HANDOFF EXECUTION`);
    console.log('-'.repeat(30));

    try {
      // Step 1: Load SD
      const sd = await this.sdRepo.getById(sdId);

      // Step 2: Pre-execution setup (optional, override in subclass)
      const setupResult = await this.setup(sdId, sd, options);
      if (setupResult && !setupResult.success) {
        return setupResult;
      }

      // Step 3: Run required gates
      const gates = this.getRequiredGates(sd, options);
      const gateResults = await this.validationOrchestrator.validateGates(gates, {
        sdId,
        sd,
        options,
        supabase: this.supabase
      });

      if (!gateResults.passed) {
        const remediation = this.getRemediation(gateResults.failedGate);
        return ResultBuilder.gateFailure(gateResults.failedGate, {
          issues: gateResults.issues,
          score: gateResults.totalScore,
          max_score: gateResults.totalMaxScore,
          warnings: gateResults.warnings,
          details: gateResults.gateResults
        }, remediation);
      }

      // Step 4: Execute type-specific logic
      const executionResult = await this.executeSpecific(sdId, sd, options, gateResults);
      if (!executionResult.success) {
        return executionResult;
      }

      // Step 5: Build success result
      console.log(`\n✅ ${this.handoffType} HANDOFF APPROVED`);

      return {
        success: true,
        ...executionResult,
        gateResults: gateResults.gateResults,
        // Scoring: normalized is the weighted average (0-100%), totalScore/maxScore for backward compat
        normalizedScore: gateResults.normalizedScore,
        totalScore: gateResults.totalScore,
        maxScore: gateResults.totalMaxScore,
        gateCount: gateResults.gateCount,
        warnings: gateResults.warnings
      };

    } catch (error) {
      console.error(`❌ ${this.handoffType} execution error:`, error.message);
      return ResultBuilder.systemError(error);
    }
  }

  // ============ Abstract methods - MUST implement in subclasses ============

  /**
   * @returns {string} Handoff type (e.g., 'PLAN-TO-EXEC')
   */
  get handoffType() {
    throw new Error('Subclass must implement handoffType getter');
  }

  /**
   * Get required gates for this handoff type
   * @param {object} sd - Strategic Directive
   * @param {object} options - Options
   * @returns {array} Array of gate definitions
   */
  getRequiredGates(_sd, _options) {
    throw new Error('Subclass must implement getRequiredGates()');
  }

  /**
   * Execute type-specific logic after gates pass
   * @param {string} sdId - SD ID
   * @param {object} sd - SD record
   * @param {object} options - Options
   * @param {object} gateResults - Results from gate validation
   * @returns {Promise<object>} Execution result
   */
  async executeSpecific(_sdId, _sd, _options, _gateResults) {
    throw new Error('Subclass must implement executeSpecific()');
  }

  /**
   * Get remediation instructions for a failed gate
   * @param {string} gateName - Name of failed gate
   * @returns {string|null} Remediation instructions
   */
  getRemediation(_gateName) {
    return null; // Default: use ResultBuilder's defaults
  }

  // ============ Optional overrides ============

  /**
   * Pre-execution setup (optional)
   * @param {string} sdId - SD ID
   * @param {object} sd - SD record
   * @param {object} options - Options
   * @returns {Promise<object|null>} Result if should abort, null to continue
   */
  async setup(_sdId, _sd, _options) {
    return null; // Default: no setup needed
  }

  // ============ Helper methods ============

  /**
   * Determine target repository based on SD
   */
  determineTargetRepository(sd) {
    // PRIMARY: Use target_application field if explicitly set
    if (sd.target_application) {
      const targetApp = sd.target_application.toLowerCase().trim();

      if (targetApp.includes('engineer') ||
          targetApp === 'ehg_engineer' ||
          targetApp === 'ehg-engineer') {
        console.log(`   Repository determined by target_application: "${sd.target_application}" → EHG_Engineer`);
        return '/mnt/c/_EHG/EHG_Engineer';
      }

      if (targetApp === 'ehg' ||
          targetApp === 'app' ||
          targetApp === 'application') {
        console.log(`   Repository determined by target_application: "${sd.target_application}" → EHG`);
        return '/mnt/c/_EHG/ehg';
      }

      console.warn(`   ⚠️  Unknown target_application value: "${sd.target_application}"`);
    }

    // FALLBACK: Heuristic detection
    console.log('   Repository determined by heuristics...');

    const engineeringCategories = ['engineering', 'tool', 'infrastructure', 'devops', 'ci-cd'];
    const engineeringKeywords = ['eng/', 'tool/', 'infra/', 'pipeline/', 'build/', 'deploy/'];

    if (engineeringKeywords.some(keyword => sd.id.toLowerCase().includes(keyword))) {
      return '/mnt/c/_EHG/EHG_Engineer';
    }

    if (sd.category && engineeringCategories.includes(sd.category.toLowerCase())) {
      return '/mnt/c/_EHG/EHG_Engineer';
    }

    if (sd.title) {
      const titleLower = sd.title.toLowerCase();
      if (titleLower.includes('engineer') ||
          titleLower.includes('protocol') ||
          titleLower.includes('leo ') ||
          titleLower.includes('gate ') ||
          titleLower.includes('handoff')) {
        return '/mnt/c/_EHG/EHG_Engineer';
      }
    }

    return '/mnt/c/_EHG/ehg';
  }
}

export default BaseExecutor;
