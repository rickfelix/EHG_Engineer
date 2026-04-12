/**
 * HandoffOrchestrator - Main orchestrator for LEO Protocol handoffs
 * Part of LEO Protocol Unified Handoff System refactor
 *
 * Provides the main entry point for handoff execution with:
 * - Dependency injection for testability
 * - Unified interface for all handoff types
 * - Consistent error handling and recording
 */

import { createSupabaseServiceClient } from '../../../lib/supabase-client.js';
import { safeTruncate } from '../../../lib/utils/safe-truncate.js';
import { SDRepository } from './db/SDRepository.js';
import { PRDRepository } from './db/PRDRepository.js';
import { HandoffRepository } from './db/HandoffRepository.js';
import { ValidationOrchestrator } from './validation/ValidationOrchestrator.js';
import { HandoffRecorder } from './recording/HandoffRecorder.js';
import { ContentBuilder } from './content/ContentBuilder.js';
import ResultBuilder from './ResultBuilder.js';
import {
  resolveAutoProceed,
  createHandoffMetadata
} from './auto-proceed-resolver.js';
import { captureHandoffGate } from '../../../lib/flywheel/capture.js';
import { runPrerequisitePreflight } from './pre-checks/prerequisite-preflight.js';

export class HandoffOrchestrator {
  constructor(options = {}) {
    // Create or use injected Supabase client
    this.supabase = options.supabase || createSupabaseServiceClient();

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
    console.log('');

    try {
      // SD-LEO-ENH-AUTO-PROCEED-001-02: Resolve AUTO-PROCEED mode
      const autoProceedResult = await resolveAutoProceed({
        supabase: this.supabase,
        verbose: true
      });

      // Inject AUTO-PROCEED into options for downstream use
      const enhancedOptions = {
        ...options,
        autoProceed: autoProceedResult.autoProceed,
        autoProceedSource: autoProceedResult.source,
        autoProceedSessionId: autoProceedResult.sessionId,
        _autoProceedMetadata: createHandoffMetadata(
          autoProceedResult.autoProceed,
          autoProceedResult.source
        )
      };

      console.log('');
      console.log('Options:', { ...options, autoProceed: autoProceedResult.autoProceed });
      console.log('');
      // MANDATORY: Verify SD exists in database
      await this.sdRepo.verifyExists(sdId);

      // Validate handoff type
      if (!this.supportedHandoffs.includes(normalizedType)) {
        return ResultBuilder.unsupportedType(normalizedType, this.supportedHandoffs);
      }

      // SD-LEO-GEMINI-001 (US-006): Self-Critique Pre-Flight
      // Validate agent confidence scoring before handoff
      const selfCritiqueResult = this._validateSelfCritique(normalizedType, enhancedOptions);
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

      // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-078: Quick prerequisite preflight
      // Catches common 0% gate causes before running expensive full validation
      const preflight = await runPrerequisitePreflight(this.supabase, normalizedType, sdId);
      if (!preflight.passed) {
        console.log('');
        console.log('🚫 PREREQUISITE PREFLIGHT FAILED');
        console.log('─'.repeat(50));
        console.log('   The following prerequisites must be met before running gates:');
        console.log('');
        for (const issue of preflight.issues) {
          console.log(`   ❌ [${issue.code}] ${issue.message}`);
          console.log(`      💡 ${issue.remediation}`);
          console.log('');
        }
        console.log('─'.repeat(50));
        console.log('   Fix these issues first, then retry the handoff.');
        console.log('');

        // Record as failure with clear reason
        const preflightResult = ResultBuilder.rejected(
          'PREREQUISITE_PREFLIGHT_FAILED',
          `Prerequisite preflight failed: ${preflight.issues.map(i => i.code).join(', ')}`
        );
        preflightResult.preflightIssues = preflight.issues;
        await this.recorder.recordFailure(normalizedType, sdId, preflightResult, null);
        return preflightResult;
      }

      // Execute the handoff with AUTO-PROCEED metadata
      const result = await executor.execute(sdId, enhancedOptions);

      // SD-LEO-ENH-AUTO-PROCEED-001-02: Include AUTO-PROCEED in result
      result.autoProceed = autoProceedResult.autoProceed;
      result.autoProceedSource = autoProceedResult.source;

      // Record result FIRST (before any deferred operations)
      // SD-LEO-INFRA-INTELLIGENT-LOCAL-LLM-001B-RCA: Record-First Pattern
      // This ensures handoff is recorded even if post-handoff operations timeout
      if (result.success) {
        await this.recorder.recordSuccess(normalizedType, sdId, result, template);
        console.log('📝 Handoff recorded successfully');

        // Handle deferred PRD generation for LEAD-TO-PLAN
        // This happens AFTER recording, so timeout won't lose the handoff
        if (result._deferredPrdGeneration) {
          await this._executeDeferredPrdGeneration(result._deferredPrdGeneration);
        }
      } else if (!result.systemError) {
        await this.recorder.recordFailure(normalizedType, sdId, result, template);
      }

      // SD-LEO-FEAT-DATA-FLYWHEEL-001: Fire-and-forget capture to eva_interactions
      captureHandoffGate(result, normalizedType, sdId, enhancedOptions.autoProceedSessionId)
        .catch(err => console.warn(`[flywheel] Capture error (non-blocking): ${err.message}`));

      return result;

    } catch (error) {
      console.error('❌ Handoff system error:', error.message);

      // Record system error
      await this.recorder.recordSystemError(normalizedType, sdId, error.message);

      return ResultBuilder.systemError(error);
    }
  }

  /**
   * Batch prerequisite validation - checks ALL gates without stopping
   * SD-LEO-STREAMS-001 Retrospective: Reduces handoff iterations 60-70%
   *
   * Use this BEFORE executeHandoff() to find ALL issues at once.
   *
   * @param {string} handoffType - Handoff type (case-insensitive)
   * @param {string} sdId - Strategic Directive ID
   * @param {object} options - Options
   * @returns {Promise<object>} Batch validation result with ALL issues
   */
  async precheckHandoff(handoffType, sdId, options = {}) {
    const normalizedType = handoffType.toUpperCase();

    console.log('');
    console.log('🔎 BATCH PREREQUISITE PRE-CHECK');
    console.log('='.repeat(60));
    console.log(`   Handoff Type: ${normalizedType}`);
    console.log(`   SD: ${sdId}`);
    console.log('   Mode: Find ALL issues (no early stopping)');
    console.log('='.repeat(60));

    try {
      // Validate handoff type
      if (!this.supportedHandoffs.includes(normalizedType)) {
        return {
          success: false,
          issues: [{ gate: 'HANDOFF_TYPE', issue: `Unsupported type: ${normalizedType}. Valid: ${this.supportedHandoffs.join(', ')}` }],
          passedGates: [],
          failedGates: [{ name: 'HANDOFF_TYPE', issues: ['Unsupported handoff type'] }]
        };
      }

      // Verify SD exists
      const sd = await this.sdRepo.getById(sdId);
      if (!sd) {
        return {
          success: false,
          issues: [{ gate: 'SD_EXISTS', issue: `SD not found: ${sdId}` }],
          passedGates: [],
          failedGates: [{ name: 'SD_EXISTS', issues: ['SD not found'] }]
        };
      }

      // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-078: Run quick preflight first
      const preflight = await runPrerequisitePreflight(this.supabase, normalizedType, sdId);
      if (!preflight.passed) {
        console.log('');
        console.log('🚫 PREREQUISITE PREFLIGHT ISSUES (fix these first):');
        for (const issue of preflight.issues) {
          console.log(`   ❌ [${issue.code}] ${issue.message}`);
          console.log(`      💡 ${issue.remediation}`);
        }
        console.log('');
        console.log('   Continuing with full gate check to find additional issues...');
        console.log('');
      }

      // Get executor and gates
      const executor = await this._getExecutor(normalizedType);
      if (!executor) {
        return {
          success: false,
          issues: [{ gate: 'EXECUTOR', issue: `No executor for: ${normalizedType}` }],
          passedGates: [],
          failedGates: [{ name: 'EXECUTOR', issues: ['No executor found'] }]
        };
      }

      // Get gates for this handoff type
      const gates = await executor.getRequiredGates(sd, options);

      // Run ALL gates using batch validation (doesn't stop on first failure)
      const result = await this.validationOrchestrator.validateGatesAll(gates, {
        sdId,
        sd,
        options,
        precheckMode: true,
        supabase: this.supabase
      });

      // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-080: Show gate scores and thresholds
      if (result.gateResults && Object.keys(result.gateResults).length > 0) {
        console.log('');
        console.log('📊 GATE SCORES (Precheck)');
        console.log('─'.repeat(60));
        for (const [gateName, gr] of Object.entries(result.gateResults)) {
          const pct = gr.maxScore > 0 ? Math.round((gr.score / gr.maxScore) * 100) : 0;
          const threshold = gr.threshold || 70;
          const status = gr.passed !== false ? '✅' : '❌';
          console.log(`   ${status} ${gateName}: ${pct}% (threshold: ${threshold}%)`);
        }
        console.log(`   📈 Overall: ${result.normalizedScore || 0}%`);
        console.log('─'.repeat(60));
      }

      // Add actionable remediation for each failed gate
      if (result.failedGates.length > 0) {
        console.log('');
        console.log('📋 REMEDIATION ACTIONS');
        console.log('─'.repeat(60));
        result.failedGates.forEach((gate, idx) => {
          const remediation = executor.getRemediation ? executor.getRemediation(gate.name) : null;
          console.log(`   ${idx + 1}. ${gate.name}`);
          gate.issues.forEach(issue => console.log(`      ❌ ${issue}`));
          if (remediation) {
            console.log(`      💡 ${remediation}`);
          }
        });
        console.log('─'.repeat(60));
      }

      return {
        success: result.passed,
        handoffType: normalizedType,
        sdId,
        sdTitle: sd.title,
        ...result
      };

    } catch (error) {
      console.error('❌ Precheck error:', error.message);
      return {
        success: false,
        error: error.message,
        issues: [{ gate: 'SYSTEM', issue: error.message }],
        passedGates: [],
        failedGates: [{ name: 'SYSTEM', issues: [error.message] }]
      };
    }
  }

  /**
   * Dry-run a handoff: resolve gate policies and display a manifest
   * without executing gates, writing to database, or updating SD status.
   *
   * @param {string} handoffType - Handoff type (case-insensitive)
   * @param {string} sdId - Strategic Directive ID
   * @param {object} options - Options
   * @returns {Promise<object>} Dry-run manifest
   */
  async dryRunHandoff(handoffType, sdId, options = {}) {
    const normalizedType = handoffType.toUpperCase();

    try {
      // Validate handoff type
      if (!this.supportedHandoffs.includes(normalizedType)) {
        return {
          success: false,
          error: `Unsupported handoff type: ${normalizedType}. Valid: ${this.supportedHandoffs.join(', ')}`
        };
      }

      // Step 1: Load SD info (read-only)
      const sd = await this.sdRepo.getById(sdId);
      if (!sd) {
        return {
          success: false,
          error: `SD not found: ${sdId}`
        };
      }

      // Step 2: Get executor
      const executor = await this._getExecutor(normalizedType);
      if (!executor) {
        return {
          success: false,
          error: `No executor registered for handoff type: ${normalizedType}`
        };
      }

      // Step 3: Get hardcoded gates from executor
      const hardcodedGates = await executor.getRequiredGates(sd, options);

      // Step 4: Inject DFE escalation gate (same as BaseExecutor.execute)
      const hasDFE = hardcodedGates.some(g => g.name === 'DFE_ESCALATION_GATE');
      if (!hasDFE) {
        const { createDFEEscalationGate } = await import('./gates/dfe-escalation-gate.js');
        hardcodedGates.push(createDFEEscalationGate(this.supabase, `${normalizedType}-gate`));
      }

      // Step 5: Apply gate policies (reads validation_gate_registry)
      const { applyGatePolicies } = await import('./gate-policy-resolver.js');
      const { filteredGates, resolutions, fallbackUsed } = await applyGatePolicies(
        this.supabase,
        hardcodedGates,
        {
          sdType: sd.sd_type,
          validationProfile: sd.validation_profile || options.validationProfile,
          sdId: sd.sd_key || sdId
        }
      );

      // Step 6: Load database-driven rules (for display only)
      const dbRules = await this.validationOrchestrator.loadValidationRules(normalizedType);

      // Step 7: Resolve threshold
      const { THRESHOLD_PROFILES } = await import('../sd-type-checker.js');
      const sdType = (sd.sd_type || 'feature').toLowerCase();
      const thresholdProfile = THRESHOLD_PROFILES[sdType] || THRESHOLD_PROFILES.default;
      const gateThreshold = thresholdProfile?.gateThreshold || 85;

      // Step 8: Build manifest
      const allGateNames = hardcodedGates.map(g => g.name || g.key || 'unknown');
      const filteredGateNames = new Set(filteredGates.map(g => g.name || g.key || 'unknown'));
      const dbRuleNames = new Set(dbRules.map(r => `${r.gate}:${r.rule_name}`));

      const manifest = [];
      for (const gate of hardcodedGates) {
        const gateName = gate.name || gate.key || 'unknown';
        const isEnabled = filteredGateNames.has(gateName);
        const resolution = resolutions.find(r => r.gate_key === gateName);
        const isRequired = gate.required !== false;

        let source = 'executor';
        if (gate.meta?.fromDatabase) {
          source = 'validation_rules';
        } else if (resolution) {
          source = 'registry';
        }

        let policyReason = null;
        if (!isEnabled && resolution) {
          policyReason = `${resolution.matched_scope}: ${resolution.applicability}`;
        } else if (!isEnabled) {
          // Find the reason from the gate policy resolver resolutions
          const matchingResolution = resolutions.find(r => r.gate_key === gateName && r.applicability === 'DISABLED');
          if (matchingResolution) {
            policyReason = `sd_type=${sdType}`;
          }
        }

        manifest.push({
          name: gateName,
          enabled: isEnabled,
          source,
          required: isRequired,
          policyReason,
          weight: gate.weight || 0
        });
      }

      // Add database rules not already represented
      for (const rule of dbRules) {
        const ruleName = `${rule.gate}:${rule.rule_name}`;
        if (!allGateNames.includes(ruleName)) {
          manifest.push({
            name: ruleName,
            enabled: true,
            source: 'validation_rules',
            required: rule.required !== false,
            policyReason: null,
            weight: rule.weight || 0
          });
        }
      }

      const enabledCount = manifest.filter(g => g.enabled).length;
      const disabledCount = manifest.filter(g => !g.enabled).length;

      // Step 9 (optional): Evaluate gates if requested
      let evaluationResults = null;
      let aggregateScore = null;
      let wouldPass = null;

      if (options.evaluate) {
        console.log('\n  Evaluating gates (dry-run, no writes)...');

        // Load PRD for context
        let prd = null;
        try { prd = await this.prdRepo.getBySdId(sd.id); } catch (_) { /* no PRD yet is ok */ }

        const validationContext = {
          sdId,
          sd_id: sd.id || sdId,
          sd,
          prd,
          prdId: prd?.id,
          options: {},
          supabase: this.supabase
        };

        // Build final gate set from rules + policy-filtered gates
        const gates = await this.validationOrchestrator.buildGatesFromRules(
          filteredGates,
          normalizedType,
          validationContext
        );

        // Run all gates without stopping (batch mode)
        const gateResults = await this.validationOrchestrator.validateGatesAll(gates, validationContext);

        // Build per-gate evaluation rows
        evaluationResults = [];
        for (const gate of manifest) {
          const gateName = gate.name;
          const result = gateResults.gateResults[gateName];
          evaluationResults.push({
            name: gateName,
            source: gate.source,
            enabled: gate.enabled,
            required: gate.required,
            score: result ? result.score : null,
            maxScore: result ? result.maxScore : null,
            passed: result ? result.passed : null,
            issues: result?.issues || []
          });
        }

        // Include any gates that were in gateResults but not in manifest
        // (e.g. database-driven rules merged by buildGatesFromRules)
        const manifestNames = new Set(manifest.map(m => m.name));
        for (const [gateName, result] of Object.entries(gateResults.gateResults)) {
          if (!manifestNames.has(gateName)) {
            evaluationResults.push({
              name: gateName,
              source: 'validation_rules',
              enabled: true,
              required: true,
              score: result.score,
              maxScore: result.maxScore,
              passed: result.passed,
              issues: result.issues || []
            });
          }
        }

        aggregateScore = gateResults.normalizedScore;
        wouldPass = gateResults.passed && aggregateScore >= gateThreshold;
      }

      return {
        success: true,
        handoffType: normalizedType,
        sdId,
        sdKey: sd.sd_key,
        sdTitle: sd.title,
        sdType,
        gateThreshold,
        fallbackUsed,
        manifest,
        evaluationResults,
        aggregateScore,
        wouldPass,
        summary: {
          enabled: enabledCount,
          disabled: disabledCount,
          total: manifest.length
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
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
   * Execute deferred PRD generation after handoff is recorded
   * SD-LEO-INFRA-INTELLIGENT-LOCAL-LLM-001B-RCA: Record-First Pattern
   * SD-LEO-INFRA-INTELLIGENT-LOCAL-LLM-001E-RCA: Detached Spawn Pattern
   * SD-LEO-FIX-FIX-STAGE-INTEGRATION-001-RCA: Observability Fix
   *
   * Spawns PRD generation as a detached child process with log file output
   * and post-spawn verification. Falls back to inline execution if the
   * detached process fails to create a PRD within the verification window.
   *
   * Previous issue: stdio: 'ignore' hid all errors, making detached process
   * failures completely silent. Now logs to file and verifies completion.
   *
   * @param {object} params - { sdId, sd }
   */
  async _executeDeferredPrdGeneration({ sdId, sd }) {
    const title = sd.title || 'Technical Implementation';
    const idToUse = sd.id || sdId;

    // Inline mode (default): Claude Code IS the LLM — skip detached spawn.
    // The detached process can't feed the prompt back to Claude Code,
    // so PRD generation must happen inline in the conversation flow.
    if (process.env.LLM_PRD_INLINE !== 'false') {
      console.log('\n🤖 PRD GENERATION (Inline Mode)');
      console.log('='.repeat(70));
      console.log(`   SD: ${title}`);
      console.log('   Method: Inline — Claude Code generates PRD directly');
      console.log(`   SD ID: ${idToUse}`);
      console.log('');
      console.log('   ℹ️  Handoff recorded. PRD creation is the next workflow step.');
      console.log(`   💡 Run: node scripts/add-prd-to-database.js ${idToUse} "${title}"`);
      console.log('      Claude Code will process the inline prompt and insert the PRD.');
      console.log('');
      return;
    }

    const { spawn } = await import('child_process');
    const { join } = await import('path');
    const fs = await import('fs');

    const scriptPath = join(process.cwd(), 'scripts', 'add-prd-to-database.js');

    console.log('\n🤖 PRD GENERATION (Detached with Verification)');
    console.log('='.repeat(70));
    console.log(`   SD: ${title}`);
    console.log('   Method: add-prd-to-database.js (detached + log + verify)');
    console.log(`   Command: node scripts/add-prd-to-database.js ${idToUse} "${title}"`);

    // Ensure logs directory exists
    const logsDir = join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logPath = join(logsDir, `prd-generation-${timestamp}.log`);
    let logFd;

    try {
      logFd = fs.openSync(logPath, 'w');

      // Spawn with log file output instead of stdio: 'ignore'
      const child = spawn('node', [scriptPath, idToUse, title], {
        detached: true,
        stdio: ['ignore', logFd, logFd],
        cwd: process.cwd(),
        env: process.env
      });
      child.unref();

      console.log(`   ✅ PRD generation spawned (PID: ${child.pid})`);
      console.log(`   📝 Log file: ${logPath}`);

      // Verify PRD creation with polling (max 90 seconds)
      const maxWaitMs = 90000;
      const pollIntervalMs = 5000;
      let elapsed = 0;
      let prdCreated = false;

      while (elapsed < maxWaitMs) {
        await new Promise(r => setTimeout(r, pollIntervalMs));
        elapsed += pollIntervalMs;

        try {
          const { data } = await this.supabase
            .from('product_requirements_v2')
            .select('prd_id')
            .eq('sd_id', sdId)
            .limit(1);

          if (data && data.length > 0) {
            prdCreated = true;
            console.log(`   ✅ PRD creation verified after ${Math.round(elapsed / 1000)}s`);
            break;
          }
        } catch (e) {
          // Intentionally suppressed: Supabase query failed - keep waiting
          console.debug('[HandoffOrchestrator] PRD poll query suppressed:', e?.message || e);
        }

        if (elapsed % 15000 === 0) {
          console.log(`   ⏳ Waiting for PRD... (${Math.round(elapsed / 1000)}s elapsed)`);
        }
      }

      if (!prdCreated) {
        // Read log file for error details
        let logContents = '';
        try {
          fs.closeSync(logFd);
          logFd = null;
          logContents = fs.readFileSync(logPath, 'utf-8');
        } catch (e) {
          // Intentionally suppressed: ignore read errors
          console.debug('[HandoffOrchestrator] log file read suppressed:', e?.message || e);
        }

        const lastLines = logContents.split('\n').filter(Boolean).slice(-10).join('\n   ');
        console.warn(`   ⚠️  PRD not created after ${maxWaitMs / 1000}s`);
        if (lastLines) {
          console.warn(`   📋 Last log output:\n   ${lastLines}`);
        }
        console.log(`   💡 Full log: ${logPath}`);
        console.log(`   💡 Retry: node scripts/add-prd-to-database.js ${idToUse} "${title}"`);
      }

      console.log('');
    } catch (error) {
      console.error('⚠️  Could not start PRD generation:', error.message);
      console.log('   💡 Handoff was recorded successfully.');
      console.log(`   💡 Run manually: node scripts/add-prd-to-database.js ${idToUse} "${title}"`);
    } finally {
      if (logFd != null) {
        try { fs.closeSync(logFd); } catch (e) { console.debug('[HandoffOrchestrator] logFd close suppressed:', e?.message || e); }
      }
    }
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
        console.log(`   📝 Reasoning: ${safeTruncate(reasoning, 100)}${reasoning.length > 100 ? '...' : ''}`);
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
        console.log(`   📝 Reasoning: ${safeTruncate(reasoning, 100)}${reasoning.length > 100 ? '...' : ''}`);
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
      console.log(`   📝 Reasoning: ${safeTruncate(reasoning, 150)}${reasoning.length > 150 ? '...' : ''}`);

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
