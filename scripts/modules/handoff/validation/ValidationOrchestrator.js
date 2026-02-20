/**
 * ValidationOrchestrator - Coordinates gate validations for handoffs
 * Part of LEO Protocol Unified Handoff System refactor
 *
 * Consolidates 7 duplicate gate validation patterns into a single orchestrator.
 * Provides consistent validation interface across all handoff types.
 *
 * Enhanced for SD-VALIDATION-REGISTRY-001:
 * - Database-driven validation rules from leo_validation_rules
 * - Integration with ValidatorRegistry for dynamic validator resolution
 * - Caching for performance optimization
 */

import ResultBuilder from '../ResultBuilder.js';
import { validatorRegistry } from './ValidatorRegistry.js';
import { shouldSkipCodeValidation } from '../../../../lib/utils/sd-type-validation.js';
import {
  createSkippedResult,
  isSkippedResult,
  ValidatorStatus,
  SkipReasonCode
} from './sd-type-applicability-policy.js';

// SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001A: Gate telemetry
import { startSpan, endSpan } from '../../../../lib/telemetry/workflow-timer.js';

// SD-LEO-INFRA-HARDENING-001: Import threshold profiles for gate enforcement
import { THRESHOLD_PROFILES } from '../../sd-type-checker.js';

// SD-LEO-INFRA-HARDENING-001: Gate result schema validation
import { validateGateResult } from './gate-result-schema.js';

// SD-LEO-INFRA-OIV-001: Operational Integration Verification
import { OIVGate, OIV_GATE_WEIGHT } from './oiv/index.js';

export class ValidationOrchestrator {
  constructor(supabase, options = {}) {
    if (!supabase) {
      throw new Error('ValidationOrchestrator requires a Supabase client');
    }
    this.supabase = supabase;

    // Allow injection of validators for testing
    this.validators = options.validators || {};

    // Schema constraints cache
    this.constraintsCache = null;
    this.constraintsCacheExpiry = 0;

    // Validation rules cache (SD-VALIDATION-REGISTRY-001)
    this.rulesCache = new Map();
    this.rulesCacheExpiry = new Map();
    this.RULES_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

    // Validator registry
    this.validatorRegistry = options.validatorRegistry || validatorRegistry;

    // SD-LEO-INFRA-OIV-001: OIV Gate instance
    this.oivGate = options.oivGate || new OIVGate(supabase, {
      basePath: options.basePath || process.cwd(),
      verbose: options.verbose || false
    });
    this.oivEnabled = options.oivEnabled !== false; // Default: enabled

    // SD_TYPE_THRESHOLD registry override cache
    this._thresholdOverrideCache = null;
    this._thresholdOverrideCacheExpiry = 0;
  }

  /**
   * Check if SD_TYPE_THRESHOLD is DISABLED in validation_gate_registry for a given sd_type.
   * Uses caching to avoid repeated DB queries within a single validation run.
   *
   * @param {string} sdType - The SD type to check (e.g., 'bugfix')
   * @returns {Promise<{disabled: boolean, reason: string|null}>}
   */
  async _isThresholdDisabledByRegistry(sdType) {
    if (!sdType) return { disabled: false, reason: null };

    const now = Date.now();
    const CACHE_TTL_MS = 60 * 1000; // 1 minute

    // Check cache
    if (this._thresholdOverrideCache && now < this._thresholdOverrideCacheExpiry) {
      const cached = this._thresholdOverrideCache[sdType];
      if (cached !== undefined) return cached;
    }

    try {
      const { data, error } = await this.supabase
        .from('validation_gate_registry')
        .select('applicability, reason')
        .eq('gate_key', 'SD_TYPE_THRESHOLD')
        .eq('sd_type', sdType)
        .limit(1);

      if (error || !data || data.length === 0) {
        // No override found — threshold applies
        if (!this._thresholdOverrideCache) this._thresholdOverrideCache = {};
        this._thresholdOverrideCache[sdType] = { disabled: false, reason: null };
        this._thresholdOverrideCacheExpiry = now + CACHE_TTL_MS;
        return { disabled: false, reason: null };
      }

      const row = data[0];
      const result = {
        disabled: row.applicability === 'DISABLED',
        reason: row.reason || null
      };

      if (!this._thresholdOverrideCache) this._thresholdOverrideCache = {};
      this._thresholdOverrideCache[sdType] = result;
      this._thresholdOverrideCacheExpiry = now + CACHE_TTL_MS;
      return result;
    } catch (err) {
      // On error, fail-open (don't block handoff due to registry lookup failure)
      console.log(`   [ValidationOrchestrator] Warning: SD_TYPE_THRESHOLD registry check failed: ${err.message}`);
      return { disabled: false, reason: null };
    }
  }

  /**
   * Validate a single gate with consistent logging
   * @param {string} gateName - Gate identifier
   * @param {function} validator - Async validation function
   * @param {object} context - Validation context
   * @returns {Promise<object>} Validation result
   */
  async validateGate(gateName, validator, context = {}) {
    console.log(`\n🔍 Validating ${gateName}`);
    console.log('-'.repeat(50));

    // SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001A: Gate telemetry span
    let gateSpan;
    try {
      const traceCtx = context._traceCtx;
      const parentSpan = context._parentSpan;
      if (traceCtx) {
        gateSpan = startSpan('gate.execute', {
          span_type: 'gate',
          gate_name: gateName,
          gate_runner_class: 'ValidationOrchestrator',
        }, traceCtx, parentSpan);
      }
    } catch { /* telemetry failure is non-fatal */ }

    try {
      const result = await validator(context);

      // SD-LEO-INFRA-HARDENING-001: Use schema validation for consistent normalization
      // This replaces the manual normalization with validated, auto-fixing schema validation
      const normalizedResult = validateGateResult(result, gateName, {
        strict: false, // Don't throw, auto-fix instead
        autoFix: true  // Fill missing fields with defaults
      });

      // Preserve details from original result if not already set
      if (!normalizedResult.details && result !== normalizedResult) {
        normalizedResult.details = result;
      }

      ResultBuilder.logGateResult(gateName, normalizedResult, !normalizedResult.passed);

      // SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001A: End gate span with result
      try { endSpan(gateSpan, { result: normalizedResult.passed ? 'pass' : 'fail', gate_name: gateName }); } catch { /* non-fatal */ }

      return normalizedResult;
    } catch (error) {
      console.error(`\n❌ ${gateName} validation error: ${error.message}`);
      // SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001A: End gate span with error
      try { endSpan(gateSpan, { result: 'error', gate_name: gateName, error_class: error.constructor?.name, error_message: error.message }); } catch { /* non-fatal */ }
      // Return a schema-validated error result
      return validateGateResult({
        passed: false,
        score: 0,
        maxScore: 100,
        issues: [`Validation error: ${error.message}`],
        warnings: [],
        error: error.message
      }, gateName, { strict: false, autoFix: true });
    }
  }

  /**
   * Run multiple gates in sequence, stopping on first failure
   * @param {array} gates - Array of gate definitions
   * @param {object} context - Shared context
   * @returns {Promise<object>} Combined result with normalized scoring
   *
   * SCORING SYSTEM (Fixed: was summing scores, now uses weighted average)
   * - Each gate contributes a score (0-100) and optional weight
   * - Default weight is 1.0 for all gates
   * - normalizedScore = weighted average of all gate scores (0-100%)
   * - totalScore/totalMaxScore preserved for backward compatibility
   */
  async validateGates(gates, context = {}) {
    const results = {
      passed: true,
      totalScore: 0,           // Sum of raw scores (backward compat)
      totalMaxScore: 0,        // Sum of max scores (backward compat)
      normalizedScore: 0,      // NEW: Weighted average percentage (0-100)
      gateCount: 0,            // Number of gates evaluated
      skippedCount: 0,         // NEW: Number of gates skipped due to SD type (SD-LEO-FIX-REMEDIATE-TYPE-AWARE-001)
      gateResults: {},
      gateStatuses: {},        // NEW: Per-gate status tracking {gateName: {status, required, skipReason}}
      failedGate: null,
      skippedGates: [],        // NEW: List of skipped gate names
      issues: [],
      warnings: []
    };

    // Track weighted scores for normalization
    let weightedScoreSum = 0;
    let totalWeight = 0;

    for (const gate of gates) {
      // Check condition if provided
      if (gate.condition && !(await gate.condition(context))) {
        console.log(`⏭️  Skipping ${gate.name} (condition not met)`);
        continue;
      }

      const gateResult = await this.validateGate(gate.name, gate.validator, context);
      results.gateResults[gate.name] = gateResult;

      // SD-LEO-FIX-REMEDIATE-TYPE-AWARE-001: Track SKIPPED status
      const isSkipped = isSkippedResult(gateResult);
      if (isSkipped) {
        results.skippedCount++;
        results.skippedGates.push(gate.name);
        results.gateStatuses[gate.name] = {
          status: ValidatorStatus.SKIPPED,
          required: gate.required !== false,
          skipReason: gateResult.skipReason || SkipReasonCode.NON_APPLICABLE_SD_TYPE,
          skipDetails: gateResult.skipDetails
        };
      } else {
        results.gateStatuses[gate.name] = {
          status: gateResult.passed ? ValidatorStatus.PASS : ValidatorStatus.FAIL,
          required: gate.required !== false
        };
      }

      // Backward compat: sum raw scores
      results.totalScore += gateResult.score;
      results.totalMaxScore += gateResult.maxScore;
      results.gateCount++;

      // Calculate weighted contribution
      // Gate weight defaults to 1.0, can be customized per gate
      const gateWeight = gate.weight || 1.0;
      const gatePercentage = gateResult.maxScore > 0
        ? (gateResult.score / gateResult.maxScore) * 100
        : 0;
      weightedScoreSum += gatePercentage * gateWeight;
      totalWeight += gateWeight;

      // Defensive check for optional warnings array (PAT-SCHEMA-VALIDATION-001)
      if (gateResult.warnings && Array.isArray(gateResult.warnings)) {
        results.warnings.push(...gateResult.warnings);
      }

      // SD-LEO-FIX-REMEDIATE-TYPE-AWARE-001: SKIPPED counts as satisfied (not a failure)
      // Only FAIL (not SKIPPED) should block handoff for required gates
      if (!gateResult.passed && gate.required !== false && !isSkipped) {
        results.passed = false;
        results.failedGate = gate.name;
        // Defensive check for optional issues array (PAT-SCHEMA-VALIDATION-001)
        if (gateResult.issues && Array.isArray(gateResult.issues)) {
          results.issues.push(...gateResult.issues);
        }
        break; // Stop on first required failure
      }
    }

    // Calculate normalized score as weighted average (0-100%)
    results.normalizedScore = totalWeight > 0
      ? Math.round(weightedScoreSum / totalWeight)
      : 0;

    // SD-LEO-INFRA-HARDENING-001: Enforce SD-type-specific thresholds
    // This ensures security SDs require 90%, features require 85%, etc.
    // SD-MAN-FEAT-VISION-DASHBOARD-VALIDATE-001: Check registry for DISABLED override
    if (results.passed && context.sd?.sd_type) {
      const sdType = context.sd.sd_type;

      // Check if SD_TYPE_THRESHOLD is DISABLED in validation_gate_registry
      const thresholdOverride = await this._isThresholdDisabledByRegistry(sdType);
      if (thresholdOverride.disabled) {
        console.log(`   [GatePolicyResolver] DISABLED: SD_TYPE_THRESHOLD (sd_type: ${thresholdOverride.reason})`);
      } else {
        const profile = THRESHOLD_PROFILES[sdType] || THRESHOLD_PROFILES.default;
        const threshold = profile.gateThreshold || THRESHOLD_PROFILES.default.gateThreshold;

        if (results.normalizedScore < threshold) {
          results.passed = false;
          results.failedGate = 'SD_TYPE_THRESHOLD';
          results.thresholdViolation = {
            sdType,
            required: threshold,
            actual: results.normalizedScore
          };
          results.issues.push(
            `SD type '${sdType}' requires ${threshold}% gate score, got ${results.normalizedScore}%`
          );
          console.log(`   ❌ SD-Type Threshold BLOCKED: ${sdType} requires ${threshold}%, got ${results.normalizedScore}%`);
        }
      }
    }

    return results;
  }

  // ============================================
  // OIV Integration (SD-LEO-INFRA-OIV-001)
  // ============================================

  /**
   * Validate gates with OIV as an additional gate
   * OIV runs AFTER standard gates pass and contributes 15% weight to overall score
   *
   * @param {Array} gates - Array of gate definitions
   * @param {Object} context - Shared context (must include sd object)
   * @param {Object} options - Options
   * @param {boolean} options.includeOIV - Whether to include OIV gate (default: true if oivEnabled)
   * @returns {Promise<Object>} Combined result with OIV contribution
   */
  async validateGatesWithOIV(gates, context = {}, options = {}) {
    const includeOIV = options.includeOIV !== false && this.oivEnabled;

    // First, run standard gates
    const standardResults = await this.validateGates(gates, context);

    // If standard gates fail or OIV is disabled, return standard results
    if (!standardResults.passed || !includeOIV) {
      return standardResults;
    }

    // Check if SD type should skip code validation entirely
    if (context.sd && shouldSkipCodeValidation(context.sd)) {
      console.log(`   ⏭️  OIV skipped: SD type '${context.sd.sd_type}' skips code validation`);
      standardResults.oivResult = {
        skipped: true,
        reason: 'SD type skips code validation'
      };
      return standardResults;
    }

    // Run OIV gate
    console.log('\n📦 Running OIV Gate (15% weight)...');
    const oivResult = await this.oivGate.validateHandoff(context);

    // Store OIV result for reference
    standardResults.oivResult = oivResult;

    // Calculate combined score with OIV weight
    // Standard gates: 85%, OIV: 15%
    const standardWeight = 1 - OIV_GATE_WEIGHT;
    const combinedScore = Math.round(
      (standardResults.normalizedScore * standardWeight) +
      (oivResult.score * OIV_GATE_WEIGHT)
    );

    // Update results with OIV contribution
    standardResults.oivScore = oivResult.score;
    standardResults.oivWeight = OIV_GATE_WEIGHT;
    standardResults.combinedScore = combinedScore;

    // OIV failure blocks handoff
    if (!oivResult.passed) {
      standardResults.passed = false;
      standardResults.failedGate = 'OIV';
      standardResults.issues.push(...oivResult.issues);
      console.log(`   ❌ OIV Gate BLOCKED handoff (score: ${oivResult.score}%)`);
    }

    // Re-check SD-type threshold with combined score
    // SD-MAN-FEAT-VISION-DASHBOARD-VALIDATE-001: Check registry for DISABLED override
    if (standardResults.passed && context.sd?.sd_type) {
      const sdType = context.sd.sd_type;

      // Check if SD_TYPE_THRESHOLD is DISABLED in validation_gate_registry
      const thresholdOverride = await this._isThresholdDisabledByRegistry(sdType);
      if (thresholdOverride.disabled) {
        console.log(`   [GatePolicyResolver] DISABLED: SD_TYPE_THRESHOLD_WITH_OIV (sd_type: ${thresholdOverride.reason})`);
      } else {
        const profile = THRESHOLD_PROFILES[sdType] || THRESHOLD_PROFILES.default;
        const threshold = profile.gateThreshold || THRESHOLD_PROFILES.default.gateThreshold;

        if (combinedScore < threshold) {
          standardResults.passed = false;
          standardResults.failedGate = 'SD_TYPE_THRESHOLD_WITH_OIV';
          standardResults.thresholdViolation = {
            sdType,
            required: threshold,
            actual: combinedScore,
            standardScore: standardResults.normalizedScore,
            oivScore: oivResult.score
          };
          standardResults.issues.push(
            `Combined score (${combinedScore}%) below threshold (${threshold}%) for SD type '${sdType}'`
          );
          console.log(`   ❌ Combined Threshold BLOCKED: ${sdType} requires ${threshold}%, got ${combinedScore}%`);
        }
      }
    }

    // Log summary
    console.log('\n📊 Gate Scoring Summary:');
    console.log(`   Standard gates: ${standardResults.normalizedScore}% (weight: ${(standardWeight * 100).toFixed(0)}%)`);
    console.log(`   OIV gate: ${oivResult.score}% (weight: ${(OIV_GATE_WEIGHT * 100).toFixed(0)}%)`);
    console.log(`   Combined: ${combinedScore}%`);
    console.log(`   Status: ${standardResults.passed ? '✓ PASS' : '✗ FAIL'}`);

    return standardResults;
  }

  /**
   * Get OIV gate instance for direct access
   * @returns {OIVGate} The OIV gate instance
   */
  getOIVGate() {
    return this.oivGate;
  }

  /**
   * Enable or disable OIV validation
   * @param {boolean} enabled - Whether OIV is enabled
   */
  setOIVEnabled(enabled) {
    this.oivEnabled = enabled;
    console.log(`   OIV validation ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Pre-validate data against database schema constraints
   * @param {string} tableName - Target table
   * @param {object} data - Data to validate
   * @returns {Promise<object>} Validation result
   */
  async preValidateData(tableName, data) {
    const result = { valid: true, errors: [], hints: [] };

    try {
      const constraints = await this.loadSchemaConstraints(tableName);

      if (!constraints || constraints.length === 0) {
        return result;
      }

      console.log(`🔍 Pre-validating ${Object.keys(data).length} fields against ${constraints.length} constraints for ${tableName}`);

      for (const constraint of constraints) {
        const fieldValue = data[constraint.column_name];

        if (fieldValue === undefined) {
          continue;
        }

        switch (constraint.constraint_type) {
          case 'check':
          case 'enum':
            if (constraint.valid_values && Array.isArray(constraint.valid_values)) {
              if (!constraint.valid_values.includes(fieldValue)) {
                result.valid = false;
                result.errors.push({
                  field: constraint.column_name,
                  value: fieldValue,
                  constraint: constraint.constraint_type,
                  message: `Invalid value '${fieldValue}' for ${constraint.column_name}`,
                  validValues: constraint.valid_values
                });
                if (constraint.remediation_hint) {
                  result.hints.push(constraint.remediation_hint);
                }
              }
            }
            break;

          case 'not_null':
            if (fieldValue === null || fieldValue === '') {
              result.valid = false;
              result.errors.push({
                field: constraint.column_name,
                value: fieldValue,
                constraint: 'not_null',
                message: `${constraint.column_name} cannot be null or empty`
              });
              if (constraint.remediation_hint) {
                result.hints.push(constraint.remediation_hint);
              }
            }
            break;
        }
      }

      if (!result.valid) {
        this._logPreValidationFailure(tableName, result);
      } else {
        console.log(`✅ Pre-validation passed for ${tableName}`);
      }

    } catch (error) {
      console.warn(`⚠️  Could not load constraints for ${tableName}: ${error.message}`);
    }

    return result;
  }

  /**
   * Load schema constraints from database (with caching)
   */
  async loadSchemaConstraints(tableName) {
    const now = Date.now();
    const CACHE_TTL_MS = 5 * 60 * 1000;

    if (this.constraintsCache && now < this.constraintsCacheExpiry) {
      return this.constraintsCache.filter(c => c.table_name === tableName);
    }

    const { data, error } = await this.supabase
      .from('leo_schema_constraints')
      .select('*')
      .order('table_name');

    if (error) {
      if (error.code === '42P01') {
        console.log('ℹ️  leo_schema_constraints table not yet created - skipping pre-validation');
        return [];
      }
      throw error;
    }

    this.constraintsCache = data || [];
    this.constraintsCacheExpiry = now + CACHE_TTL_MS;

    return this.constraintsCache.filter(c => c.table_name === tableName);
  }

  _logPreValidationFailure(tableName, result) {
    console.error('');
    console.error('❌ PRE-VALIDATION FAILED');
    console.error('='.repeat(60));
    console.error(`   Table: ${tableName}`);
    console.error(`   Errors: ${result.errors.length}`);
    console.error('');
    result.errors.forEach((err, idx) => {
      console.error(`   ${idx + 1}. ${err.field}: ${err.message}`);
      if (err.validValues) {
        console.error(`      Valid values: ${err.validValues.join(', ')}`);
      }
    });
    if (result.hints.length > 0) {
      console.error('');
      console.error('   HINTS:');
      result.hints.forEach(hint => console.error(`   - ${hint}`));
    }
    console.error('='.repeat(60));
  }

  clearCache() {
    this.constraintsCache = null;
    this.constraintsCacheExpiry = 0;
    this.rulesCache.clear();
    this.rulesCacheExpiry.clear();
    this._thresholdOverrideCache = null;
    this._thresholdOverrideCacheExpiry = 0;
  }

  // ============================================
  // Database-Driven Validation Rules (SD-VALIDATION-REGISTRY-001)
  // ============================================

  /**
   * Load validation rules from database for a specific handoff type
   * @param {string} handoffType - LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN, PLAN-TO-LEAD, LEAD-FINAL-APPROVAL
   * @returns {Promise<Array>} Array of validation rules
   */
  async loadValidationRules(handoffType) {
    const now = Date.now();
    const cacheKey = handoffType;

    // Check cache
    if (this.rulesCache.has(cacheKey)) {
      const expiry = this.rulesCacheExpiry.get(cacheKey);
      if (now < expiry) {
        console.log(`📋 Using cached validation rules for ${handoffType} (${this.rulesCache.get(cacheKey).length} rules)`);
        return this.rulesCache.get(cacheKey);
      }
    }

    console.log(`📥 Loading validation rules from database for ${handoffType}...`);

    try {
      const { data, error } = await this.supabase
        .from('leo_validation_rules')
        .select('*')
        .eq('handoff_type', handoffType)
        .eq('active', true)
        .order('gate', { ascending: true })
        .order('execution_order', { ascending: true });

      if (error) {
        // Check for table not existing
        if (error.code === '42P01') {
          console.warn('⚠️  leo_validation_rules table not found - using hardcoded gates only');
          return [];
        }
        throw error;
      }

      const rules = data || [];

      // Cache the results
      this.rulesCache.set(cacheKey, rules);
      this.rulesCacheExpiry.set(cacheKey, now + this.RULES_CACHE_TTL_MS);

      console.log(`✅ Loaded ${rules.length} validation rules for ${handoffType}`);
      if (rules.length > 0) {
        const gateGroups = rules.reduce((acc, r) => {
          acc[r.gate] = (acc[r.gate] || 0) + 1;
          return acc;
        }, {});
        console.log(`   Gates: ${Object.entries(gateGroups).map(([g, c]) => `${g}(${c})`).join(', ')}`);
      }

      return rules;
    } catch (error) {
      console.error(`❌ Failed to load validation rules: ${error.message}`);
      return [];
    }
  }

  /**
   * Build gates array from database rules merged with hardcoded gates
   * @param {Array} hardcodedGates - Original hardcoded gates from executor
   * @param {string} handoffType - The handoff type
   * @param {object} context - Context for validators (sdId, sd, prd, supabase, options)
   * @returns {Promise<Array>} Merged gates array ready for validateGates()
   */
  async buildGatesFromRules(hardcodedGates, handoffType, context = {}) {
    // Load rules from database
    const dbRules = await this.loadValidationRules(handoffType);

    if (dbRules.length === 0) {
      console.log('ℹ️  No database rules found, using hardcoded gates only');
      return hardcodedGates;
    }

    // Group rules by gate
    const rulesByGate = dbRules.reduce((acc, rule) => {
      if (!acc[rule.gate]) acc[rule.gate] = [];
      acc[rule.gate].push(rule);
      return acc;
    }, {});

    // Build gates from database rules
    const dbGates = [];
    for (const [gate, rules] of Object.entries(rulesByGate)) {
      for (const rule of rules) {
        const validator = this.validatorRegistry.getOrCreateFallback(rule.rule_name, rule);

        dbGates.push({
          name: `${gate}:${rule.rule_name}`,
          weight: rule.weight || 0,
          required: rule.required,
          validator: async (ctx) => {
            const mergedContext = { ...context, ...ctx };

            // SD-LEO-FIX-REMEDIATE-TYPE-AWARE-001: Check SD type and skip code validation
            // Uses centralized SD-type applicability policy for proper SKIPPED status
            if (mergedContext.sd_id || mergedContext.sdId) {
              const sdId = mergedContext.sd_id || mergedContext.sdId;
              const { data: sdData } = await this.supabase
                .from('strategic_directives_v2')
                .select('id, sd_type, title')
                .eq('id', sdId)
                .single();

              if (sdData && shouldSkipCodeValidation(sdData)) {
                // Extract validator name from rule for proper policy lookup
                const validatorName = rule.rule_name?.toUpperCase() ||
                                     gate.split(':').pop()?.toUpperCase() ||
                                     'UNKNOWN';

                // Use policy to get proper skip result with SKIPPED status
                return createSkippedResult(validatorName, sdData.sd_type, SkipReasonCode.NON_APPLICABLE_SD_TYPE);
              }
            }

            const result = await validator(mergedContext);
            return this.validatorRegistry.normalizeResult(result);
          },
          meta: {
            gate: rule.gate,
            ruleName: rule.rule_name,
            criteria: rule.criteria,
            executionOrder: rule.execution_order,
            fromDatabase: true
          }
        });
      }
    }

    // Merge strategy: database rules take precedence, hardcoded fill gaps
    const dbGateNames = new Set(dbGates.map(g => g.meta?.ruleName || g.name));
    const uniqueHardcodedGates = hardcodedGates.filter(g => {
      // Keep hardcoded gate if no equivalent in database
      const baseName = g.name.includes(':') ? g.name.split(':')[1] : g.name;
      return !dbGateNames.has(baseName) && !dbGateNames.has(g.name);
    });

    // Combine and sort
    const mergedGates = [...dbGates, ...uniqueHardcodedGates];
    mergedGates.sort((a, b) => {
      const orderA = a.meta?.executionOrder ?? 50;
      const orderB = b.meta?.executionOrder ?? 50;
      return orderA - orderB;
    });

    console.log('\n📋 Merged gate configuration:');
    console.log(`   Database rules: ${dbGates.length}`);
    console.log(`   Hardcoded gates retained: ${uniqueHardcodedGates.length}`);
    console.log(`   Total gates: ${mergedGates.length}`);

    return mergedGates;
  }

  /**
   * Get rules for a specific gate
   * @param {string} handoffType - The handoff type
   * @param {string} gate - The gate code (L, 0, 1, 2A, 2B, etc.)
   * @returns {Promise<Array>} Rules for the specified gate
   */
  async getRulesForGate(handoffType, gate) {
    const allRules = await this.loadValidationRules(handoffType);
    return allRules.filter(r => r.gate === gate);
  }

  /**
   * Validate a specific gate using database rules
   * @param {string} handoffType - The handoff type
   * @param {string} gate - The gate code
   * @param {object} context - Validation context
   * @returns {Promise<object>} Validation result
   */
  async validateGateFromRules(handoffType, gate, context = {}) {
    const rules = await this.getRulesForGate(handoffType, gate);

    if (rules.length === 0) {
      return {
        passed: true,
        score: 100,
        maxScore: 100,
        warnings: [`No database rules found for gate ${gate}`],
        issues: []
      };
    }

    // Build gates from rules
    const gates = rules.map(rule => ({
      name: rule.rule_name,
      weight: rule.weight || (1 / rules.length),
      required: rule.required,
      validator: async (ctx) => {
        const validator = this.validatorRegistry.getOrCreateFallback(rule.rule_name, rule);
        return validator({ ...context, ...ctx });
      }
    }));

    // Use existing validateGates method
    return this.validateGates(gates, context);
  }

  /**
   * Get summary of all validation rules
   * @returns {Promise<object>} Summary statistics
   */
  async getValidationRulesSummary() {
    try {
      const { data, error } = await this.supabase
        .from('leo_validation_rules')
        .select('gate, handoff_type, rule_name, weight, required, active')
        .eq('active', true);

      if (error) throw error;

      const summary = {
        totalRules: data.length,
        byGate: {},
        byHandoffType: {},
        weightedGates: []
      };

      for (const rule of data) {
        // By gate
        if (!summary.byGate[rule.gate]) {
          summary.byGate[rule.gate] = { count: 0, totalWeight: 0 };
        }
        summary.byGate[rule.gate].count++;
        summary.byGate[rule.gate].totalWeight += rule.weight || 0;

        // By handoff type
        if (rule.handoff_type) {
          if (!summary.byHandoffType[rule.handoff_type]) {
            summary.byHandoffType[rule.handoff_type] = { count: 0, gates: new Set() };
          }
          summary.byHandoffType[rule.handoff_type].count++;
          summary.byHandoffType[rule.handoff_type].gates.add(rule.gate);
        }
      }

      // Convert Sets to arrays for JSON serialization
      for (const ht of Object.keys(summary.byHandoffType)) {
        summary.byHandoffType[ht].gates = Array.from(summary.byHandoffType[ht].gates);
      }

      // Check which gates have weights that sum to 1.0
      for (const [gate, info] of Object.entries(summary.byGate)) {
        if (Math.abs(info.totalWeight - 1.0) < 0.01) {
          summary.weightedGates.push(gate);
        }
      }

      return summary;
    } catch (error) {
      console.error(`Failed to get validation rules summary: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Clear only the rules cache (not constraints)
   */
  clearRulesCache() {
    this.rulesCache.clear();
    this.rulesCacheExpiry.clear();
    console.log('🗑️  Validation rules cache cleared');
  }

  /**
   * Run ALL gates without stopping on failure (batch prerequisite validation)
   * SD-LEO-STREAMS-001 Retrospective: Reduces handoff iterations 60-70%
   *
   * Unlike validateGates() which stops on first required failure, this method
   * runs ALL gates and collects ALL issues at once. Use this for pre-flight
   * checks before attempting a handoff.
   *
   * @param {array} gates - Array of gate definitions
   * @param {object} context - Shared context
   * @returns {Promise<object>} Combined result with ALL issues
   */
  async validateGatesAll(gates, context = {}) {
    console.log('');
    console.log('🔎 BATCH PREREQUISITE VALIDATION (All Gates)');
    console.log('='.repeat(60));

    const results = {
      passed: true,
      totalScore: 0,
      totalMaxScore: 0,
      normalizedScore: 0,
      gateCount: 0,
      passedGates: [],
      failedGates: [],
      gateResults: {},
      issues: [],       // ALL issues from ALL gates
      warnings: []
    };

    let weightedScoreSum = 0;
    let totalWeight = 0;

    // Run ALL gates, don't stop on failure
    for (const gate of gates) {
      // Check condition if provided
      if (gate.condition && !(await gate.condition(context))) {
        console.log(`⏭️  Skipping ${gate.name} (condition not met)`);
        continue;
      }

      const gateResult = await this.validateGate(gate.name, gate.validator, context);
      results.gateResults[gate.name] = gateResult;

      results.totalScore += gateResult.score;
      results.totalMaxScore += gateResult.maxScore;
      results.gateCount++;

      const gateWeight = gate.weight || 1.0;
      const gatePercentage = gateResult.maxScore > 0
        ? (gateResult.score / gateResult.maxScore) * 100
        : 0;
      weightedScoreSum += gatePercentage * gateWeight;
      totalWeight += gateWeight;

      // Defensive check for optional warnings array (PAT-SCHEMA-VALIDATION-001)
      if (gateResult.warnings && Array.isArray(gateResult.warnings)) {
        results.warnings.push(...gateResult.warnings);
      }

      // Collect issues but DON'T stop - this is the key difference
      if (!gateResult.passed && gate.required !== false) {
        results.passed = false;
        results.failedGates.push({
          name: gate.name,
          issues: gateResult.issues || [],
          score: gateResult.score,
          maxScore: gateResult.maxScore
        });
        // Defensive check for optional issues array (PAT-SCHEMA-VALIDATION-001)
        if (gateResult.issues && Array.isArray(gateResult.issues)) {
          results.issues.push(...gateResult.issues.map(issue => ({
            gate: gate.name,
            issue
          })));
        }
      } else {
        results.passedGates.push(gate.name);
      }
    }

    results.normalizedScore = totalWeight > 0
      ? Math.round(weightedScoreSum / totalWeight)
      : 0;

    // Summary
    console.log('');
    console.log('─'.repeat(60));
    console.log('BATCH VALIDATION SUMMARY');
    console.log(`   Gates evaluated: ${results.gateCount}`);
    console.log(`   Passed: ${results.passedGates.length} (${results.passedGates.join(', ') || 'none'})`);
    console.log(`   Failed: ${results.failedGates.length} (${results.failedGates.map(g => g.name).join(', ') || 'none'})`);
    console.log(`   Total issues: ${results.issues.length}`);
    console.log(`   Score: ${results.normalizedScore}%`);
    console.log('='.repeat(60));

    return results;
  }
}

export default ValidationOrchestrator;
