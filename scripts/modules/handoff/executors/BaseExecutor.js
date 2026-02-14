/**
 * BaseExecutor - Abstract base class for handoff executors
 * Part of LEO Protocol Unified Handoff System refactor
 *
 * Provides template method pattern for consistent handoff execution flow.
 */

import ResultBuilder from '../ResultBuilder.js';
import { safeTruncate } from '../../../../lib/utils/safe-truncate.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { shouldSkipAndContinue, executeSkipAndContinue } from '../skip-and-continue.js';
import { checkPendingMigrations } from '../pre-checks/pending-migrations-check.js';
import { applyGatePolicies } from '../gate-policy-resolver.js';
import { validateMultiSessionClaim } from '../gates/multi-session-claim-gate.js';

// SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001A: Workflow telemetry
import { createTraceContext, startSpan, endSpan, persist } from '../../../../lib/telemetry/workflow-timer.js';

// Cross-platform path resolution (SD-WIN-MIG-005 fix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get cross-platform repository path
 * SD-LEO-INFRA-GATE-WORKTREE-FIXES-001: Use git rev-parse for worktree-safe resolution.
 * __dirname fails in worktrees because it resolves inside .worktrees/ subdirectory.
 * @param {string} repoName - 'EHG_Engineer' or 'EHG'/'ehg'
 * @returns {string} Resolved absolute path
 */
function getRepoPath(repoName) {
  const normalizedName = repoName.toLowerCase();
  if (normalizedName.includes('engineer')) {
    // Use git rev-parse to get true repo root (works in worktrees)
    try {
      const gitRoot = execSync('git rev-parse --show-toplevel', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
      return gitRoot;
    } catch {
      // Fallback: 4 levels up from this file (executors -> handoff -> modules -> scripts -> root)
      return path.resolve(__dirname, '../../../../');
    }
  }
  // EHG/ehg is sibling to EHG_Engineer
  try {
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    return path.resolve(gitRoot, '../ehg');
  } catch {
    return path.resolve(__dirname, '../../../../../ehg');
  }
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

    // SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001A: Create trace context for this execution
    let traceCtx, rootSpan;
    try {
      const executionId = `${this.handoffType}-${sdId}-${Date.now()}`;
      traceCtx = createTraceContext(executionId, { sdId });
      rootSpan = startSpan('workflow.execute', {
        span_type: 'workflow',
        workflow_execution_id: executionId,
        sd_id: sdId,
        handoff_type: this.handoffType,
        executor_class: this.constructor.name,
        telemetry_version: '1',
      }, traceCtx);
    } catch { /* telemetry init failure is non-fatal */ }

    try {
      // Step 1: Load SD
      let step1Span;
      try { step1Span = startSpan('step.loadSD', { span_type: 'phase', step_name: 'loadSD', sd_id: sdId }, traceCtx, rootSpan); } catch { /* non-fatal */ }
      const sd = await this.sdRepo.getById(sdId);
      try { endSpan(step1Span); } catch { /* non-fatal */ }

      // Step 1.5: Pre-handoff migration check (auto-execute pending migrations)
      let step1_5Span;
      try { step1_5Span = startSpan('step.migrationCheck', { span_type: 'phase', step_name: 'migrationCheck', sd_id: sdId }, traceCtx, rootSpan); } catch { /* non-fatal */ }
      await this._checkAndExecutePendingMigrations(sd, options);
      try { endSpan(step1_5Span); } catch { /* non-fatal */ }

      // Step 1.8: PAT-MSESS-BYP-001 - Multi-session claim conflict check (BLOCKING)
      // Prevents duplicate work when another Claude Code instance is already working on this SD
      let step1_8Span;
      try { step1_8Span = startSpan('step.claimConflictCheck', { span_type: 'phase', step_name: 'claimConflictCheck', sd_id: sdId }, traceCtx, rootSpan); } catch { /* non-fatal */ }
      const claimConflict = await this._checkMultiSessionClaimConflict(sdId, sd);
      try { endSpan(step1_8Span); } catch { /* non-fatal */ }
      if (claimConflict && !claimConflict.pass) {
        try { endSpan(rootSpan, { result: 'claim_conflict' }); persist(traceCtx, { supabase: this.supabase }); } catch { /* non-fatal */ }
        return ResultBuilder.gateFailure('GATE_MULTI_SESSION_CLAIM_CONFLICT', {
          issues: claimConflict.issues,
          score: claimConflict.score,
          max_score: claimConflict.max_score,
          warnings: claimConflict.warnings
        }, claimConflict.issues[0] || 'SD is claimed by another active session. Pick a different SD.');
      }

      // Step 2: Pre-execution setup (optional, override in subclass)
      let step2Span;
      try { step2Span = startSpan('step.setup', { span_type: 'phase', step_name: 'setup', sd_id: sdId }, traceCtx, rootSpan); } catch { /* non-fatal */ }
      const setupResult = await this.setup(sdId, sd, options);
      try { endSpan(step2Span); } catch { /* non-fatal */ }
      if (setupResult && !setupResult.success) {
        try { endSpan(rootSpan, { result: 'setup_failed' }); persist(traceCtx, { supabase: this.supabase }); } catch { /* non-fatal */ }
        return setupResult;
      }

      // Step 2.5: Auto-claim SD for this session (sets is_working_on = true)
      let step2_5Span;
      try { step2_5Span = startSpan('step.claimAndPrepare', { span_type: 'phase', step_name: 'claimAndPrepare', sd_id: sdId }, traceCtx, rootSpan); } catch { /* non-fatal */ }
      const claimResult = await this._claimSDForSession(sdId, sd);
      if (claimResult && !claimResult.success) {
        try { endSpan(step2_5Span, { result: 'claim_failed' }); persist(traceCtx, { supabase: this.supabase }); } catch { /* non-fatal */ }
        return claimResult;
      }

      // Step 2.6: SD-LEARN-010:US-004 - Auto-trigger DATABASE sub-agent for schema SDs
      await this._autoTriggerDatabaseSubAgent(sd);

      // Step 2.7: SD-LEO-CONTINUITY-001 - Display HANDOFF_START directives (protocol familiarization)
      const targetPhase = this._getTargetPhaseFromHandoff();
      await this._displayHandoffStartDirectives(targetPhase);
      try { endSpan(step2_5Span); } catch { /* non-fatal */ }

      // Step 3: Run required gates (with database rule integration - SD-VALIDATION-REGISTRY-001)
      let step3Span;
      try { step3Span = startSpan('step.gateValidation', { span_type: 'phase', step_name: 'gateValidation', sd_id: sdId }, traceCtx, rootSpan); } catch { /* non-fatal */ }
      const hardcodedGates = await this.getRequiredGates(sd, options);

      // SD-LEO-INFRA-VALIDATION-GATE-REGISTRY-001: Apply database-driven gate policies
      // Filters gates based on validation_gate_registry policies (DISABLED gates removed)
      const { filteredGates: policyFilteredGates, fallbackUsed } = await applyGatePolicies(
        this.supabase,
        hardcodedGates,
        {
          sdType: sd?.sd_type,
          validationProfile: sd?.validation_profile || options?.validationProfile,
          sdId: sd?.sd_key || sdId
        }
      );

      if (fallbackUsed) {
        console.log('   [GatePolicy] Using hardcoded gate set (DB policy unavailable)');
      }

      // SD-LEO-001: Load PRD for validators that need it (e.g., prdQualityValidation)
      // This fixes the "No PRD provided" error in PLAN-TO-EXEC handoffs
      let prd = null;
      if (this.prdRepo) {
        prd = await this.prdRepo.getBySdId(sd.id);
      }

      // SD-LEO-INFRA-HARDENING-001: Deep-copy context objects to prevent mutation
      // This ensures chained skills and validators don't accidentally modify original data
      const validationContext = {
        sdId,
        sd_id: sd?.id || sdId,  // Use UUID when available for database queries
        sd: sd ? structuredClone(sd) : null,  // Deep copy to prevent mutation
        prd: prd ? structuredClone(prd) : null,  // SD-LEO-001: Include PRD in context for validators
        prdId: prd?.id,  // Also provide prdId for convenience
        options: options ? structuredClone(options) : {},  // Deep copy options
        supabase: this.supabase  // Supabase client cannot be cloned (has methods)
      };

      // Use database-driven gates when available, fall back to hardcoded
      const gates = await this.validationOrchestrator.buildGatesFromRules(
        policyFilteredGates,
        this.handoffType,
        validationContext
      );

      // SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001A: Pass trace context to gate validation for gate-level spans
      validationContext._traceCtx = traceCtx;
      validationContext._parentSpan = step3Span;

      const gateResults = await this.validationOrchestrator.validateGates(gates, validationContext);
      try { endSpan(step3Span, { result: gateResults.passed ? 'pass' : 'fail' }); } catch { /* non-fatal */ }

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
          // SD-LEO-ENH-AUTO-PROCEED-001-07: Check for skip-and-continue conditions
          const skipCheck = shouldSkipAndContinue({
            sd,
            gateResults,
            retryCount: options._retryCount || 0,
            autoProceed: options.autoProceed
          });

          if (skipCheck.shouldSkip) {
            // Execute skip-and-continue flow
            const correlationId = `skip-${sdId}-${Date.now()}`;
            const skipResult = await executeSkipAndContinue({
              supabase: this.supabase,
              sd,
              gateResults,
              correlationId,
              sessionId: options.autoProceedSessionId || 'unknown'
            });

            try { endSpan(rootSpan, { result: 'skipped' }); persist(traceCtx, { supabase: this.supabase }); } catch { /* non-fatal */ }
            // Return special result for skip-and-continue
            return {
              success: false,
              skippedAndContinued: true,
              blockedSdId: sdId,
              nextSibling: skipResult.nextSibling,
              allBlocked: skipResult.allBlocked,
              skipReason: skipResult.reason,
              correlationId,
              failedGate: gateResults.failedGate,
              issues: gateResults.issues
            };
          }

          // SD-LEO-CONTINUITY-001: Display ON_FAILURE directives (5-Whys, Sustainable Resolution)
          const failurePhase = this._getSourcePhaseFromHandoff();
          await this._displayOnFailureDirectives(failurePhase);

          const remediation = this.getRemediation(gateResults.failedGate);

          // RCA Auto-Trigger on gate failure (SD-LEO-ENH-ENHANCE-RCA-SUB-001)
          // SD-LEARN-FIX-ADDRESS-PAT-AUTO-003: Use individual gate score, not overall aggregate.
          // Previously passed gateResults.totalScore/totalMaxScore which is the SUM across ALL gates,
          // creating misleading patterns like "score 900/1000" for a single gate with max_score 100.
          try {
            const { triggerRCAOnFailure, buildGateContext } = await import('../../../../lib/rca/index.js');
            const failedGateResult = gateResults.gateResults?.[gateResults.failedGate];
            await triggerRCAOnFailure(buildGateContext({
              gateName: gateResults.failedGate,
              score: failedGateResult?.score ?? gateResults.totalScore,
              threshold: failedGateResult?.maxScore ?? gateResults.totalMaxScore,
              breakdown: gateResults.issues,
              sdId,
              handoffType: this.handoffType
            }));
          } catch { /* RCA trigger should never block handoff */ }

          try { endSpan(rootSpan, { result: 'gate_failure' }); persist(traceCtx, { supabase: this.supabase }); } catch { /* non-fatal */ }
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
      let step4Span;
      try { step4Span = startSpan('step.executeSpecific', { span_type: 'phase', step_name: 'executeSpecific', sd_id: sdId }, traceCtx, rootSpan); } catch { /* non-fatal */ }
      const executionResult = await this.executeSpecific(sdId, sd, options, gateResults);
      try { endSpan(step4Span, { result: executionResult.success ? 'pass' : 'fail' }); } catch { /* non-fatal */ }
      if (!executionResult.success) {
        try { endSpan(rootSpan, { result: 'exec_failed' }); persist(traceCtx, { supabase: this.supabase }); } catch { /* non-fatal */ }
        return executionResult;
      }

      // Step 4.5: Handle Plan Mode transition (SD-PLAN-MODE-001)
      await this._handlePlanModeTransition(sdId, sd, options);

      // Step 5: Build success result
      console.log(`\n✅ ${this.handoffType} HANDOFF APPROVED`);

      // SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001A: End root span and persist
      try { endSpan(rootSpan, { result: 'success' }); persist(traceCtx, { supabase: this.supabase }); } catch { /* non-fatal */ }

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

      // SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001A: Record error in telemetry
      try { endSpan(rootSpan, { result: 'error', error_class: error.constructor?.name, error_message: error.message }); persist(traceCtx, { supabase: this.supabase }); } catch { /* non-fatal */ }

      // SD-LEO-CONTINUITY-001: Display ON_FAILURE directives (5-Whys, Sustainable Resolution)
      const failurePhase = this._getSourcePhaseFromHandoff();
      await this._displayOnFailureDirectives(failurePhase);

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
   * Pre-handoff migration check
   *
   * CRITICAL: This check MUST USE the DATABASE sub-agent to execute any
   * pending migrations. The DATABASE sub-agent is the authoritative executor
   * for all migration work.
   *
   * Checks for pending database migrations (uncommitted manual updates,
   * SD-specific migrations not yet executed) and engages the DATABASE
   * sub-agent to execute them automatically.
   *
   * Retry Strategy (implemented in pending-migrations-check.js):
   * - Attempt 1: Standard DATABASE sub-agent invocation
   * - Attempt 2: Consult issue_patterns for known solutions, retry with context
   * - Attempt 3: Consult retrospectives for similar past issues, retry with learnings
   * - Only after 3 failed attempts: Escalate to user
   *
   * Non-blocking: Errors are logged but handoff continues (with warning)
   *
   * @param {object} sd - SD record
   * @param {object} options - Handoff options
   */
  async _checkAndExecutePendingMigrations(sd, options = {}) {
    try {
      // Skip migration check if explicitly disabled
      if (options.skipMigrationCheck === true) {
        console.log('   [Migration Check] Skipped (disabled via options)');
        return;
      }

      const result = await checkPendingMigrations(this.supabase, sd, {
        autoExecute: options.autoExecuteMigrations !== false
      });

      // Store result for potential gate validation
      this._migrationCheckResult = result;

      // Log retry statistics if attempts were made
      if (result.executionAttempted && result.attemptsUsed > 0) {
        console.log(`   [Migration Check] Attempts used: ${result.attemptsUsed}/3`);
        if (result.knowledgeBaseConsulted) {
          console.log('   [Migration Check] Knowledge base was consulted for solutions');
        }
      }

      // If there are still pending migrations after all retry attempts
      if (result.hasPendingMigrations && result.errors.length > 0) {
        console.log('\n   ╔════════════════════════════════════════════════════════════╗');
        console.log('   ║  ⚠️  MIGRATION EXECUTION INCOMPLETE - MANUAL ACTION NEEDED ║');
        console.log('   ╚════════════════════════════════════════════════════════════╝');
        console.log('');
        console.log('   The DATABASE sub-agent attempted execution but could not complete.');
        console.log('   The handoff will continue, but you MUST manually execute these:');
        result.uncommittedManualUpdates.forEach(f => console.log(`      • ${f}`));
        result.pendingMigrations.forEach(m => console.log(`      • ${m.file}`));
        console.log('');
        console.log('   Options:');
        console.log('   1. Run: node scripts/execute-manual-migrations.js');
        console.log('   2. Use /rca to perform root cause analysis on the failure');
        console.log('   3. Execute the SQL manually via psql or Supabase dashboard');
        console.log('');
      }
    } catch (error) {
      // Non-fatal - allow handoff to proceed
      console.log(`   [Migration Check] ⚠️ Error (non-blocking): ${error.message}`);
    }
  }

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
   * Validate that this SD has an existing claim from the parent conversation.
   *
   * Handoff scripts are transient subprocesses — they should NOT create their
   * own claims. The claim lifecycle is: sd:start creates it, LEAD-FINAL-APPROVAL
   * releases it. Handoffs just validate that a claim exists.
   *
   * If no claim exists (e.g., handoff run without sd:start), falls back to
   * creating one for backward compatibility, but logs a warning.
   *
   * @param {string} sdId - SD ID
   * @param {object} sd - SD record
   */
  async _claimSDForSession(sdId, sd) {
    const { claimGuard, formatClaimFailure } = await import('../../../../lib/claim-guard.mjs');
    const heartbeatManager = await import('../../../../lib/heartbeat-manager.mjs');

    const claimId = sd.sd_key || sdId;

    // Step 1: Check if a valid claim already exists (from sd:start or parent conversation)
    // FIX: Query sd_claims directly — v_active_sessions reads claude_sessions.sd_id which
    // diverges from sd_claims when sessions are reused or terminal identity breaks occur.
    // See RCA: SD-LEO-FIX-CLAIM-DUAL-TRUTH-001
    const { data: existingClaims } = await this.supabase
      .from('sd_claims')
      .select('session_id, sd_id, claimed_at')
      .eq('sd_id', claimId)
      .is('released_at', null);

    const activeClaim = (existingClaims || []).find(c => {
      const ageSeconds = (Date.now() - new Date(c.claimed_at).getTime()) / 1000;
      return ageSeconds < 900;
    });

    if (activeClaim) {
      // Valid claim exists from parent conversation — just validate, don't replace
      console.log(`   [Claim] ✅ SD ${claimId} claimed (${activeClaim.session_id === (await this._getCurrentSessionId()) ? 'already_owned' : 'parent_conversation'})`);

      // Refresh the existing claim's heartbeat to keep it alive during handoff
      await this.supabase
        .from('claude_sessions')
        .update({ heartbeat_at: new Date().toISOString() })
        .eq('session_id', activeClaim.session_id);

      // Start heartbeat for the existing session (not a new one)
      const heartbeatStatus = heartbeatManager.isHeartbeatActive();
      if (!heartbeatStatus.active) {
        heartbeatManager.startHeartbeat(activeClaim.session_id);
      }

      // Show duration estimate (non-blocking)
      await this._showDurationEstimate(sd);
      return;
    }

    // Step 2: No active claim found — fall back to creating one (backward compatibility)
    // This handles the case where someone runs handoff without sd:start first
    console.log('   [Claim] ⚠️  No existing claim found — creating one (run sd:start first next time)');

    const sessionManager = await import('../../../../lib/session-manager.mjs');
    const session = await sessionManager.getOrCreateSession();

    if (!session) {
      console.log('   [Claim] ❌ No session available - cannot proceed without claim');
      return { success: false, error: 'Claim required - no session available' };
    }

    const result = await claimGuard(claimId, session.session_id);

    if (!result.success) {
      console.log(formatClaimFailure(result));
      console.log('   [Claim] ❌ Cannot proceed - claim guard rejected');
      return { success: false, error: 'Claim required - cannot proceed without valid SD claim', claimConflict: true };
    }

    console.log(`   [Claim] ✅ SD ${claimId} claimed (${result.claim.status})`);

    // Start automatic heartbeat updates
    const heartbeatStatus = heartbeatManager.isHeartbeatActive();
    if (!heartbeatStatus.active || heartbeatStatus.sessionId !== session.session_id) {
      heartbeatManager.startHeartbeat(session.session_id);
    }

    // Show duration estimate (non-blocking)
    await this._showDurationEstimate(sd);
  }

  /**
   * Get the current subprocess session ID (if one exists).
   * Helper for claim validation — does NOT create a new session.
   */
  async _getCurrentSessionId() {
    try {
      const sessionManager = await import('../../../../lib/session-manager.mjs');
      const existing = sessionManager.getCurrentSession?.();
      return existing?.session_id || null;
    } catch {
      return null;
    }
  }

  /**
   * PAT-MSESS-BYP-001: Check for multi-session claim conflicts
   *
   * BLOCKING check that prevents handoff execution when another active
   * session has claimed the target SD. Runs before gates and before
   * _claimSDForSession to prevent duplicate work.
   *
   * @param {string} sdId - SD ID (UUID)
   * @param {object} sd - SD record
   * @returns {Promise<Object|null>} Gate result if blocked, null if OK
   */
  async _checkMultiSessionClaimConflict(sdId, sd) {
    try {
      // Get current session ID for self-exclusion
      let currentSessionId = null;
      try {
        const sessionManager = await import('../../../../lib/session-manager.mjs');
        const session = await sessionManager.getOrCreateSession();
        currentSessionId = session?.session_id || null;
      } catch (_err) {
        // If session manager unavailable, proceed without self-exclusion
      }

      // Use sd_key for claim lookup (matches how claims are stored)
      const claimId = sd?.sd_key || sdId;

      // PAT-SESSION-IDENTITY-003: Use centralized terminal identity
      const os = await import('os');
      const { getTerminalId } = await import('../../../../lib/terminal-identity.js');
      const currentTerminalId = getTerminalId();
      const result = await validateMultiSessionClaim(this.supabase, claimId, {
        currentSessionId,
        currentHostname: os.hostname(),
        currentTerminalId
      });

      if (!result.pass) {
        return result;
      }

      return null; // No conflict - proceed
    } catch (error) {
      // Non-fatal: fail-open on unexpected errors
      console.log(`   [MultiSession] ⚠️ Claim check error (non-blocking): ${error.message}`);
      return null;
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

  // ============ Plan Mode Integration (SD-PLAN-MODE-001) ============

  async _handlePlanModeTransition(sdId, sd, _options) {
    try {
      const { LEOPlanModeOrchestrator } = await import('../../plan-mode/index.js');
      const orchestrator = new LEOPlanModeOrchestrator({ verbose: true });

      const targetPhase = this._getTargetPhaseFromHandoff();
      const fromPhase = this._getSourcePhaseFromHandoff();

      const result = await orchestrator.handlePhaseTransition({
        sdId: sd.sd_key || sdId,
        fromPhase,
        toPhase: targetPhase,
        handoffType: this.handoffType
      });

      if (result.skipped) {
        console.log(`   [Plan Mode] ${result.reason}`);
      } else if (result.success && result.message) {
        console.log(result.message);
      }
    } catch (error) {
      console.log(`   [Plan Mode] Transition error (non-blocking): ${error.message}`);
    }
  }

  _getTargetPhaseFromHandoff() {
    const handoffToPhase = {
      'LEAD-TO-PLAN': 'PLAN',
      'PLAN-TO-EXEC': 'EXEC',
      'EXEC-TO-PLAN': 'PLAN',
      'EXEC-TO-VERIFY': 'VERIFY',
      'LEAD-FINAL-APPROVAL': 'FINAL',
      'LEAD-APPROVAL': 'LEAD'
    };
    return handoffToPhase[this.handoffType] || 'EXEC';
  }

  _getSourcePhaseFromHandoff() {
    const handoffFromPhase = {
      'LEAD-TO-PLAN': 'LEAD',
      'PLAN-TO-EXEC': 'PLAN',
      'EXEC-TO-PLAN': 'EXEC',
      'EXEC-TO-VERIFY': 'EXEC',
      'LEAD-FINAL-APPROVAL': 'VERIFY',
      'LEAD-APPROVAL': 'START'
    };
    return handoffFromPhase[this.handoffType] || 'LEAD';
  }

  // ============ Autonomous Continuation Directives (SD-LEO-CONTINUITY-001) ============

  /**
   * Fetch autonomous directives from database
   * @param {string} enforcementPoint - 'ALWAYS', 'ON_FAILURE', or 'HANDOFF_START'
   * @param {string} phase - 'LEAD', 'PLAN', or 'EXEC'
   * @returns {Promise<array>} Array of directive objects
   */
  async _fetchAutonomousDirectives(enforcementPoint, phase) {
    try {
      const { data, error } = await this.supabase
        .from('leo_autonomous_directives')
        .select('directive_code, title, content, is_blocking')
        .eq('active', true)
        .eq('enforcement_point', enforcementPoint)
        .contains('applies_to_phases', [phase])
        .order('display_order');

      if (error) {
        console.log(`   [Directives] ⚠️ Could not fetch directives: ${error.message}`);
        return [];
      }

      return data || [];
    } catch (err) {
      console.log(`   [Directives] ⚠️ Error fetching directives: ${err.message}`);
      return [];
    }
  }

  /**
   * Display HANDOFF_START directives (protocol familiarization)
   * Called at the start of each handoff execution
   * @param {string} phase - Target phase (LEAD, PLAN, EXEC)
   */
  async _displayHandoffStartDirectives(phase) {
    const directives = await this._fetchAutonomousDirectives('HANDOFF_START', phase);

    if (directives.length === 0) return;

    console.log('\n   📋 AUTONOMOUS DIRECTIVES (SD-LEO-CONTINUITY-001)');
    console.log('   ─'.repeat(25));

    for (const d of directives) {
      const blockingBadge = d.is_blocking ? ' [BLOCKING]' : '';
      console.log(`\n   🎯 ${d.title}${blockingBadge}`);
      // Wrap content at ~60 chars for readability
      const lines = d.content.match(/.{1,60}(\s|$)/g) || [d.content];
      lines.forEach(line => console.log(`      ${line.trim()}`));
    }

    console.log('\n   ─'.repeat(25));
  }

  /**
   * Display ON_FAILURE directives (5-Whys, Sustainable Resolution)
   * Called when errors or blockers are encountered
   * @param {string} phase - Current phase (LEAD, PLAN, EXEC)
   */
  async _displayOnFailureDirectives(phase) {
    const directives = await this._fetchAutonomousDirectives('ON_FAILURE', phase);

    if (directives.length === 0) return;

    console.log('\n   ⚠️  AUTONOMOUS FAILURE RESPONSE DIRECTIVES');
    console.log('   ─'.repeat(30));

    for (const d of directives) {
      const blockingBadge = d.is_blocking ? ' [BLOCKING]' : '';
      console.log(`\n   🔍 ${d.title}${blockingBadge}`);
      // Wrap content at ~60 chars for readability
      const lines = d.content.match(/.{1,60}(\s|$)/g) || [d.content];
      lines.forEach(line => console.log(`      ${line.trim()}`));
    }

    console.log('\n   💡 Use /rca to invoke the formal 5-Whys root cause analysis process');
    console.log('   ─'.repeat(30));
  }
}

export default BaseExecutor;
