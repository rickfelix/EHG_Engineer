/**
 * OIV Gate - Operational Integration Verification Gate
 * SD-LEO-INFRA-OIV-001: Validates integration contracts as a handoff gate
 *
 * Loads contracts from database, applies SD-type policy for verification depth,
 * and returns standard gate result schema with 15% weight contribution.
 */

import { OIVVerifier } from './OIVVerifier.js';
import { validateGateResult } from '../gate-result-schema.js';
import {
  isValidatorNonApplicable,
  createSkippedResult,
  SkipReasonCode
} from '../sd-type-applicability-policy.js';

// SD-type to max verification level mapping
const SD_TYPE_MAX_LEVELS = {
  // Full verification (L1-L5)
  feature: 'L5_ARGS_COMPATIBLE',
  security: 'L5_ARGS_COMPATIBLE',

  // Static verification only (L1-L3)
  infrastructure: 'L3_EXPORT_EXISTS',
  enhancement: 'L3_EXPORT_EXISTS',
  refactor: 'L3_EXPORT_EXISTS',
  bugfix: 'L3_EXPORT_EXISTS',
  database: 'L3_EXPORT_EXISTS',
  performance: 'L3_EXPORT_EXISTS',
  api: 'L3_EXPORT_EXISTS',
  backend: 'L3_EXPORT_EXISTS',

  // Exempt from OIV
  documentation: null,
  docs: null,
  process: null,
  orchestrator: null,
  qa: null,
  discovery_spike: null
};

// Default max level for unknown SD types
const DEFAULT_MAX_LEVEL = 'L3_EXPORT_EXISTS';

// Gate weight (15% of total)
export const OIV_GATE_WEIGHT = 0.15;

export class OIVGate {
  constructor(supabase, options = {}) {
    if (!supabase) {
      throw new Error('OIVGate requires a Supabase client');
    }
    this.supabase = supabase;
    this.verifier = options.verifier || new OIVVerifier({
      basePath: options.basePath || process.cwd(),
      verbose: options.verbose || false
    });
    this.verbose = options.verbose || false;
  }

  /**
   * Get the maximum verification level for an SD type
   * @param {string} sdType - The SD type
   * @returns {string|null} Max checkpoint level or null if exempt
   */
  getMaxLevelForSDType(sdType) {
    const normalizedType = (sdType || '').toLowerCase();

    if (normalizedType in SD_TYPE_MAX_LEVELS) {
      return SD_TYPE_MAX_LEVELS[normalizedType];
    }

    // Unknown types get default level
    console.log(`   ⚠️  Unknown SD type '${sdType}' - using default max level: ${DEFAULT_MAX_LEVEL}`);
    return DEFAULT_MAX_LEVEL;
  }

  /**
   * Check if SD type is exempt from OIV
   * @param {string} sdType - The SD type
   * @returns {boolean} True if exempt
   */
  isExemptSDType(sdType) {
    return this.getMaxLevelForSDType(sdType) === null;
  }

  /**
   * Load applicable contracts for an SD
   * @param {string} sdType - The SD type
   * @param {string} gateName - Optional specific gate to filter by
   * @returns {Promise<Array>} Array of contracts
   */
  async loadContracts(sdType, gateName = null) {
    let query = this.supabase
      .from('leo_integration_contracts')
      .select('*')
      .eq('is_active', true);

    if (gateName) {
      query = query.eq('gate_name', gateName);
    }

    const { data, error } = await query;

    if (error) {
      console.error(`   ❌ Failed to load OIV contracts: ${error.message}`);
      throw error;
    }

    // Filter contracts by SD type scope
    const applicableContracts = (data || []).filter(contract => {
      if (!contract.sd_type_scope || contract.sd_type_scope.length === 0) {
        return true; // No scope restriction = applies to all
      }
      return contract.sd_type_scope.includes(sdType.toLowerCase());
    });

    if (this.verbose) {
      console.log(`   Loaded ${data.length} contracts, ${applicableContracts.length} applicable for SD type '${sdType}'`);
    }

    return applicableContracts;
  }

  /**
   * Validate handoff with OIV
   * @param {Object} context - Validation context
   * @param {Object} context.sd - Strategic Directive object
   * @param {string} context.handoffType - e.g., 'EXEC-TO-PLAN'
   * @returns {Promise<Object>} Gate result conforming to gate-result-schema
   */
  async validateHandoff(context = {}) {
    const { sd, handoffType } = context;
    const sdType = sd?.sd_type || 'unknown';
    const sdId = sd?.id || context.sdId || context.sd_id;

    console.log('\n');
    console.log('🔗 OIV: Operational Integration Verification');
    console.log('─'.repeat(60));
    console.log(`   SD: ${sdId}`);
    console.log(`   SD Type: ${sdType}`);
    console.log(`   Handoff: ${handoffType || 'N/A'}`);

    // Check if SD type is exempt
    if (this.isExemptSDType(sdType)) {
      console.log(`   ⏭️  SKIP: SD type '${sdType}' is exempt from OIV`);
      return validateGateResult(
        createSkippedResult('OIV', sdType, SkipReasonCode.NON_APPLICABLE_SD_TYPE),
        'OIV',
        { strict: false, autoFix: true }
      );
    }

    // Get max level for this SD type
    const maxLevel = this.getMaxLevelForSDType(sdType);
    console.log(`   Max verification level: ${maxLevel}`);

    // Load applicable contracts
    const contracts = await this.loadContracts(sdType, handoffType);

    if (contracts.length === 0) {
      console.log('   ℹ️  No OIV contracts applicable for this handoff');
      return validateGateResult({
        passed: true,
        score: 100,
        maxScore: 100,
        issues: [],
        warnings: ['No OIV contracts found for this SD type and handoff'],
        details: {
          sd_type: sdType,
          handoff_type: handoffType,
          contracts_checked: 0
        }
      }, 'OIV', { strict: false, autoFix: true });
    }

    console.log(`   Contracts to verify: ${contracts.length}`);
    console.log('');

    // Generate run ID for this verification batch
    const runId = crypto.randomUUID();

    // Verify each contract
    const results = [];
    let totalScore = 0;
    let passedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const failedContracts = [];
    const issues = [];

    for (const contract of contracts) {
      // Determine effective max level (min of SD type level and contract level)
      const contractLevel = contract.checkpoint_level || 'L3_EXPORT_EXISTS';
      const effectiveLevel = this._minLevel(maxLevel, contractLevel);

      console.log(`   ├─ ${contract.contract_key}`);

      const result = await this.verifier.verify(contract, effectiveLevel);
      results.push(result);

      // Persist result to database
      await this._persistResult(runId, contract, result, sdId, sdType, handoffType);

      if (result.final_status === 'PASS') {
        passedCount++;
        totalScore += result.score;
        console.log(`   │  ✓ PASS (${result.final_checkpoint}, score: ${result.score})`);
      } else if (result.final_status === 'SKIP') {
        skippedCount++;
        totalScore += 100; // Skipped counts as full score
        console.log(`   │  ⏭️ SKIP: ${result.checkpoints?.l4?.details?.reason || 'configured'}`);
      } else {
        failedCount++;
        totalScore += result.score;
        failedContracts.push(contract.contract_key);
        issues.push(`${contract.contract_key}: ${result.failure_checkpoint} failed - ${result.error_message}`);
        console.log(`   │  ✗ FAIL at ${result.failure_checkpoint} (score: ${result.score})`);
        console.log(`   │    Error: ${result.error_message}`);
        if (result.remediation_hint) {
          console.log(`   │    Fix: ${result.remediation_hint}`);
        }
      }
    }

    // Calculate overall score
    const maxPossibleScore = contracts.length * 100;
    const overallScore = Math.round((totalScore / maxPossibleScore) * 100);
    const passed = failedCount === 0;

    console.log('');
    console.log('─'.repeat(60));
    console.log('OIV Gate Result:');
    console.log(`   Contracts checked: ${contracts.length}`);
    console.log(`   Passed: ${passedCount}`);
    console.log(`   Failed: ${failedCount}`);
    console.log(`   Skipped: ${skippedCount}`);
    console.log(`   Score: ${overallScore}%`);
    console.log(`   Status: ${passed ? '✓ PASS' : '✗ FAIL'}`);
    if (failedContracts.length > 0) {
      console.log(`   Failed contracts: ${failedContracts.join(', ')}`);
    }
    console.log('');

    return validateGateResult({
      passed,
      score: overallScore,
      maxScore: 100,
      issues,
      warnings: [],
      details: {
        run_id: runId,
        sd_id: sdId,
        sd_type: sdType,
        handoff_type: handoffType,
        contracts_total: contracts.length,
        contracts_passed: passedCount,
        contracts_failed: failedCount,
        contracts_skipped: skippedCount,
        failed_contracts: failedContracts,
        max_level_applied: maxLevel,
        results: results.map(r => ({
          contract_key: r.contract_key,
          status: r.final_status,
          score: r.score,
          failure_checkpoint: r.failure_checkpoint
        }))
      }
    }, 'OIV', { strict: false, autoFix: true });
  }

  /**
   * Persist verification result to database
   */
  async _persistResult(runId, contract, result, sdId, sdType, handoffType) {
    const record = {
      run_id: runId,
      contract_id: contract.id,
      contract_key: contract.contract_key,
      sd_id: sdId,
      sd_type: sdType,
      handoff_type: handoffType,
      l1_result: result.checkpoints?.l1?.status || null,
      l1_details: result.checkpoints?.l1 || {},
      l2_result: result.checkpoints?.l2?.status || null,
      l2_details: result.checkpoints?.l2 || {},
      l3_result: result.checkpoints?.l3?.status || null,
      l3_details: result.checkpoints?.l3 || {},
      l4_result: result.checkpoints?.l4?.status || null,
      l4_details: result.checkpoints?.l4 || {},
      l5_result: result.checkpoints?.l5?.status || null,
      l5_details: result.checkpoints?.l5 || {},
      final_status: result.final_status,
      final_checkpoint: result.final_checkpoint,
      failure_checkpoint: result.failure_checkpoint,
      score: result.score,
      error_message: result.error_message,
      remediation_hint: result.remediation_hint,
      started_at: result.started_at,
      completed_at: result.completed_at,
      duration_ms: result.duration_ms
    };

    const { error } = await this.supabase
      .from('leo_integration_verification_results')
      .insert(record);

    if (error) {
      console.warn(`   ⚠️  Failed to persist OIV result: ${error.message}`);
    }
  }

  /**
   * Get the minimum of two checkpoint levels
   */
  _minLevel(level1, level2) {
    const order = [
      'L1_FILE_EXISTS',
      'L2_IMPORT_RESOLVES',
      'L3_EXPORT_EXISTS',
      'L4_FUNCTION_CALLABLE',
      'L5_ARGS_COMPATIBLE'
    ];

    const idx1 = order.indexOf(level1);
    const idx2 = order.indexOf(level2);

    // If either is invalid, return the valid one or L3 as default
    if (idx1 === -1) return level2;
    if (idx2 === -1) return level1;

    return idx1 <= idx2 ? level1 : level2;
  }

  /**
   * Get summary of latest OIV run for an SD
   * @param {string} sdId - Strategic Directive ID
   * @returns {Promise<Object>} Summary of latest run
   */
  async getLatestRunSummary(sdId) {
    const { data, error } = await this.supabase
      .from('leo_integration_verification_results')
      .select('run_id, final_status, score, contract_key, failure_checkpoint')
      .eq('sd_id', sdId)
      .order('completed_at', { ascending: false })
      .limit(20);

    if (error || !data || data.length === 0) {
      return null;
    }

    // Group by run_id and get the latest run
    const latestRunId = data[0].run_id;
    const runResults = data.filter(r => r.run_id === latestRunId);

    return {
      run_id: latestRunId,
      contracts_total: runResults.length,
      contracts_passed: runResults.filter(r => r.final_status === 'PASS').length,
      contracts_failed: runResults.filter(r => r.final_status === 'FAIL').length,
      contracts_skipped: runResults.filter(r => r.final_status === 'SKIP').length,
      average_score: Math.round(runResults.reduce((sum, r) => sum + r.score, 0) / runResults.length),
      failed_contracts: runResults
        .filter(r => r.final_status === 'FAIL')
        .map(r => ({ key: r.contract_key, checkpoint: r.failure_checkpoint }))
    };
  }

  /**
   * Create gate function for use with ValidationOrchestrator
   * @returns {Function} Gate validator function
   */
  createGateValidator() {
    return async (context) => {
      return this.validateHandoff(context);
    };
  }
}

export default OIVGate;
