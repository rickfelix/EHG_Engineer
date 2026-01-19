/**
 * BaseExecutor - Abstract base class for handoff executors
 * Part of LEO Protocol Unified Handoff System refactor
 *
 * Provides template method pattern for consistent handoff execution flow.
 */

import ResultBuilder from '../ResultBuilder.js';
import path from 'path';
import { fileURLToPath } from 'url';

// Cross-platform path resolution (SD-WIN-MIG-005 fix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get cross-platform repository path
 * @param {string} repoName - 'EHG_Engineer' or 'EHG'/'ehg'
 * @returns {string} Resolved absolute path
 */
function getRepoPath(repoName) {
  const normalizedName = repoName.toLowerCase();
  if (normalizedName.includes('engineer')) {
    // EHG_Engineer is 4 levels up from this file: executors -> handoff -> modules -> scripts -> root
    return path.resolve(__dirname, '../../../../');
  }
  // EHG/ehg is sibling to EHG_Engineer
  return path.resolve(__dirname, '../../../../../ehg');
}

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

      // Step 2.5: Auto-claim SD for this session (sets is_working_on = true)
      await this._claimSDForSession(sdId, sd);

      // Step 2.6: SD-LEARN-010:US-004 - Auto-trigger DATABASE sub-agent for schema SDs
      await this._autoTriggerDatabaseSubAgent(sd);

      // Step 3: Run required gates (with database rule integration - SD-VALIDATION-REGISTRY-001)
      const hardcodedGates = await this.getRequiredGates(sd, options);

      // SD-LEO-001: Load PRD for validators that need it (e.g., prdQualityValidation)
      // This fixes the "No PRD provided" error in PLAN-TO-EXEC handoffs
      let prd = null;
      if (this.prdRepo) {
        prd = await this.prdRepo.getBySdId(sd.id);
      }

      // Merge hardcoded gates with database rules
      const validationContext = {
        sdId,
        sd_id: sd?.id || sdId,  // Use UUID when available for database queries
        sd,
        prd,          // SD-LEO-001: Include PRD in context for validators
        prdId: prd?.id,  // Also provide prdId for convenience
        options,
        supabase: this.supabase
      };

      // Use database-driven gates when available, fall back to hardcoded
      const gates = await this.validationOrchestrator.buildGatesFromRules(
        hardcodedGates,
        this.handoffType,
        validationContext
      );

      const gateResults = await this.validationOrchestrator.validateGates(gates, validationContext);

      // SD-LEARN-010:US-005: Handle bypass validation
      if (!gateResults.passed) {
        if (options.bypassValidation) {
          console.log('');
          console.log('⚠️  BYPASS ACTIVE: Gate failures overridden');
          console.log(`   Failed gate: ${gateResults.failedGate}`);
          console.log(`   Issues: ${gateResults.issues.length}`);
          console.log('   Proceeding despite validation failures...');
          console.log('');
          // Continue execution despite gate failure
        } else {
          const remediation = this.getRemediation(gateResults.failedGate);
          return ResultBuilder.gateFailure(gateResults.failedGate, {
            issues: gateResults.issues,
            score: gateResults.totalScore,
            max_score: gateResults.totalMaxScore,
            warnings: gateResults.warnings,
            details: gateResults.gateResults
          }, remediation);
        }
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
   * @returns {Promise<array>} Array of gate definitions
   */
  async getRequiredGates(_sd, _options) {
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
   * SD-LEARN-010:US-004: Auto-trigger DATABASE sub-agent for schema SDs
   *
   * Automatically invokes DATABASE sub-agent when SD has:
   * - sd_type = 'database'
   * - metadata.schema_changes = true
   *
   * Creates sub_agent_executions record with trigger_type='auto'
   * Non-blocking: Errors are logged but handoff continues
   *
   * @param {object} sd - Strategic Directive record
   */
  async _autoTriggerDatabaseSubAgent(sd) {
    try {
      const sdType = (sd.sd_type || '').toLowerCase();
      const hasSchemaChanges = sd.metadata?.schema_changes === true;

      // Only trigger for database SDs or schema changes
      if (sdType !== 'database' && !hasSchemaChanges) {
        return;
      }

      console.log('\n   🗄️  DATABASE SUB-AGENT AUTO-TRIGGER (SD-LEARN-010:US-004)');
      console.log(`      Reason: ${sdType === 'database' ? 'sd_type=database' : 'schema_changes=true'}`);

      // Check if DATABASE sub-agent already executed for this SD
      const { data: existingExecution } = await this.supabase
        .from('sub_agent_execution_results')
        .select('id, verdict')
        .eq('sd_id', sd.id)
        .eq('sub_agent_code', 'DATABASE')
        .limit(1);

      if (existingExecution && existingExecution.length > 0) {
        console.log(`      ℹ️  DATABASE sub-agent already executed (verdict: ${existingExecution[0].verdict})`);
        return;
      }

      // Auto-invoke DATABASE sub-agent
      console.log('      🔄 Auto-invoking DATABASE sub-agent...');

      try {
        const { orchestrate } = await import('../../../orchestrate-phase-subagents.js');
        const result = await orchestrate('PLAN_PRD', sd.id, {
          specificSubAgent: 'DATABASE',
          triggerType: 'auto',
          autoRemediate: false
        });

        if (result.status === 'PASS' || result.status === 'COMPLETE') {
          console.log('      ✅ DATABASE sub-agent auto-triggered successfully');
        } else {
          console.log(`      ⚠️  DATABASE sub-agent status: ${result.status}`);
        }
      } catch (invokeError) {
        // Non-fatal - allow handoff to proceed
        console.log(`      ⚠️  DATABASE auto-invoke unavailable: ${invokeError.message}`);
        console.log('      → Proceeding with handoff - manual DATABASE invocation may be required');
      }
    } catch (error) {
      // Non-fatal - allow handoff to proceed
      console.log(`   [DATABASE Auto-Trigger] ⚠️ Error (non-blocking): ${error.message}`);
    }
  }

  /**
   * Auto-claim SD for the current session
   * This ensures is_working_on is set at the START of any handoff
   *
   * Non-blocking: Errors are logged but handoff continues
   * @param {string} sdId - SD ID
   * @param {object} sd - SD record
   */
  async _claimSDForSession(sdId, sd) {
    try {
      // Dynamic imports to avoid circular dependencies
      const sessionManager = await import('../../../../lib/session-manager.mjs');
      const conflictChecker = await import('../../../../lib/session-conflict-checker.mjs');

      // Get or create session for this terminal
      const session = await sessionManager.getOrCreateSession();

      if (!session) {
        console.log('   [Claim] No session available - skipping auto-claim');
      } else {
        // Determine which ID to use for claiming (legacy_id or id)
        const claimId = sd.legacy_id || sdId;

        // Check if already claimed by this session
        const claimStatus = await conflictChecker.isSDClaimed(claimId, session.session_id);

        if (claimStatus.claimed && claimStatus.claimedBy === session.session_id) {
          // Already claimed by us - just update heartbeat
          await sessionManager.updateHeartbeat(session.session_id);
          console.log('   [Claim] SD already claimed by this session');
        } else if (claimStatus.claimed) {
          // Claimed by another session - warn but don't block
          console.log(`   [Claim] ⚠️ SD claimed by another session (${claimStatus.claimedBy})`);
          console.log('   [Claim] Proceeding with handoff - claim conflict will not block');
        } else {
          // Attempt to claim the SD
          const result = await conflictChecker.claimSD(claimId, session.session_id);

          if (result.success) {
            console.log(`   [Claim] ✅ SD ${claimId} claimed for session - is_working_on=true`);
            if (result.warnings?.length > 0) {
              result.warnings.forEach(w => console.log(`   [Claim] ⚠️ ${w.message}`));
            }
          } else {
            console.log(`   [Claim] ⚠️ Could not claim SD: ${result.error || 'Unknown error'}`);
            console.log('   [Claim] Proceeding with handoff - claim failure will not block');
          }
        }
      }

      // Show duration estimate (non-blocking) - ALWAYS runs regardless of claim status
      await this._showDurationEstimate(sd);
    } catch (error) {
      // Non-fatal - allow handoff to proceed
      console.log(`   [Claim] ⚠️ Auto-claim error (non-blocking): ${error.message}`);
    }
  }

  /**
   * Show duration estimate for the SD
   * Non-blocking: Errors are logged but handoff continues
   * @param {object} sd - SD record
   */
  async _showDurationEstimate(sd) {
    try {
      const { getEstimatedDuration, formatEstimateDetailed } =
        await import('../../../lib/duration-estimator.js');

      const estimate = await getEstimatedDuration(this.supabase, sd);

      if (estimate) {
        console.log('\n   📊 Duration Estimate:');
        const lines = formatEstimateDetailed(estimate);
        lines.forEach(line => {
          if (line.startsWith('  •')) {
            console.log(`      ${line}`);
          } else if (line === '') {
            // Skip empty lines
          } else {
            console.log(`      ${line}`);
          }
        });
      }
    } catch (error) {
      // Non-fatal - estimate is optional
      console.log(`   [Estimate] ⚠️ Could not calculate duration estimate: ${error.message}`);
    }
  }

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
        return getRepoPath('EHG_Engineer');
      }

      if (targetApp === 'ehg' ||
          targetApp === 'app' ||
          targetApp === 'application') {
        console.log(`   Repository determined by target_application: "${sd.target_application}" → EHG`);
        return getRepoPath('EHG');
      }

      console.warn(`   ⚠️  Unknown target_application value: "${sd.target_application}"`);
    }

    // FALLBACK: Heuristic detection
    console.log('   Repository determined by heuristics...');

    const engineeringCategories = ['engineering', 'tool', 'infrastructure', 'devops', 'ci-cd'];
    const engineeringKeywords = ['eng/', 'tool/', 'infra/', 'pipeline/', 'build/', 'deploy/'];

    if (engineeringKeywords.some(keyword => sd.id.toLowerCase().includes(keyword))) {
      return getRepoPath('EHG_Engineer');
    }

    if (sd.category && engineeringCategories.includes(sd.category.toLowerCase())) {
      return getRepoPath('EHG_Engineer');
    }

    if (sd.title) {
      const titleLower = sd.title.toLowerCase();
      if (titleLower.includes('engineer') ||
          titleLower.includes('protocol') ||
          titleLower.includes('leo ') ||
          titleLower.includes('gate ') ||
          titleLower.includes('handoff')) {
        return getRepoPath('EHG_Engineer');
      }
    }

    return getRepoPath('EHG');
  }
}

export default BaseExecutor;
