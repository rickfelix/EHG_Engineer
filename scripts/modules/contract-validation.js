/**
 * CONTRACT VALIDATION MODULE
 *
 * Validates SD compliance with parent data contracts and UX contracts.
 * Integrates with the handoff system to enforce contract boundaries.
 *
 * Contract Types:
 * - DATA_CONTRACT: Schema boundaries (tables, columns, operations) - BLOCKER severity
 * - UX_CONTRACT: Component boundaries (paths, cultural style) - WARNING severity
 *
 * @module contract-validation
 * @version 1.0.0
 * @see database/migrations/20251208_sd_contracts.sql
 * @see database/migrations/20251208_contract_validation_functions.sql
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Supabase client
let supabase = null;

function getSupabase() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return supabase;
}

/**
 * Get inherited contracts for an SD
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<Object>} Inherited contracts
 */
export async function getInheritedContracts(sdId) {
  const sb = getSupabase();

  const { data, error } = await sb.rpc('get_inherited_contracts', { p_sd_id: sdId });

  if (error) {
    console.error(`Error getting inherited contracts: ${error.message}`);
    return { contracts: [], error: error.message };
  }

  return {
    contracts: data || [],
    dataContract: data?.find(c => c.contract_type === 'data'),
    uxContract: data?.find(c => c.contract_type === 'ux')
  };
}

/**
 * Validate PRD content against data contract
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} prd - PRD object
 * @returns {Promise<Object>} Validation result
 */
export async function validatePRDAgainstDataContract(sdId, prd) {
  const sb = getSupabase();

  // Build content string from PRD for validation
  const prdContent = buildPRDContentString(prd);

  const { data, error } = await sb.rpc('validate_data_contract_compliance', {
    p_sd_id: sdId,
    p_content_type: 'prd',
    p_content: prdContent
  });

  if (error) {
    console.error(`Error validating PRD against data contract: ${error.message}`);
    return {
      valid: false,
      error: error.message,
      violations: []
    };
  }

  return data;
}

/**
 * Validate migration content against data contract
 * @param {string} sdId - Strategic Directive ID
 * @param {string} migrationContent - SQL migration content
 * @returns {Promise<Object>} Validation result
 */
export async function validateMigrationAgainstDataContract(sdId, migrationContent) {
  const sb = getSupabase();

  const { data, error } = await sb.rpc('validate_data_contract_compliance', {
    p_sd_id: sdId,
    p_content_type: 'migration',
    p_content: migrationContent
  });

  if (error) {
    console.error(`Error validating migration against data contract: ${error.message}`);
    return {
      valid: false,
      error: error.message,
      violations: []
    };
  }

  return data;
}

/**
 * Validate component path against UX contract
 * @param {string} sdId - Strategic Directive ID
 * @param {string} componentPath - Component file path
 * @returns {Promise<Object>} Validation result
 */
export async function validateComponentAgainstUxContract(sdId, componentPath) {
  const sb = getSupabase();

  const { data, error } = await sb.rpc('validate_ux_contract_compliance', {
    p_sd_id: sdId,
    p_component_path: componentPath
  });

  if (error) {
    console.error(`Error validating component against UX contract: ${error.message}`);
    return {
      valid: false,
      error: error.message,
      violations: []
    };
  }

  return data;
}

/**
 * Get contract summary for an SD
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<Object>} Contract summary
 */
export async function getContractSummary(sdId) {
  const sb = getSupabase();

  const { data, error } = await sb.rpc('get_contract_summary', { p_sd_id: sdId });

  if (error) {
    console.error(`Error getting contract summary: ${error.message}`);
    return { error: error.message };
  }

  return data;
}

/**
 * Check if SD can complete (no blocking contract violations)
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<Object>} Completion check result
 */
export async function checkSDCanComplete(sdId) {
  const sb = getSupabase();

  const { data, error } = await sb.rpc('check_sd_can_complete', { p_sd_id: sdId });

  if (error) {
    console.error(`Error checking SD completion: ${error.message}`);
    return { can_complete: false, error: error.message };
  }

  return data;
}

/**
 * Validate SD against all parent contracts
 * Comprehensive validation for handoff gates
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} prd - PRD object (optional)
 * @param {Object} options - Validation options
 * @returns {Promise<Object>} Full validation result
 */
export async function validateSDContractCompliance(sdId, prd = null, options = {}) {
  console.log(`\n📜 Contract Compliance Validation for ${sdId}`);
  console.log('-'.repeat(50));

  const result = {
    passed: true,
    score: 100,
    max_score: 100,
    issues: [],
    warnings: [],
    details: {
      contract_governed: false,
      data_contract: null,
      ux_contract: null,
      violations: []
    }
  };

  try {
    // Step 1: Get inherited contracts
    console.log('   Checking inherited contracts...');
    const contracts = await getInheritedContracts(sdId);

    if (contracts.error) {
      result.warnings.push(`Could not retrieve contracts: ${contracts.error}`);
      console.log(`   ⚠️  ${contracts.error}`);
      return result; // Can't validate without contracts, pass with warning
    }

    if (contracts.contracts.length === 0) {
      console.log('   ℹ️  No contracts found in parent hierarchy (standalone SD)');
      result.details.contract_governed = false;
      return result; // No contracts = no restrictions
    }

    result.details.contract_governed = true;
    result.details.data_contract = contracts.dataContract;
    result.details.ux_contract = contracts.uxContract;

    console.log(`   ✅ Found ${contracts.contracts.length} contract(s) in hierarchy`);

    // Step 2: Validate PRD against data contract (if PRD provided)
    if (prd && contracts.dataContract) {
      console.log('   Validating PRD against data contract...');
      const prdValidation = await validatePRDAgainstDataContract(sdId, prd);

      if (prdValidation.valid === false) {
        // DATA_CONTRACT violations are BLOCKERs
        result.passed = false;
        result.score = Math.max(0, result.score - 50);

        const violations = prdValidation.violations || [];
        violations.forEach(v => {
          result.issues.push(`[DATA_CONTRACT] ${v.message}`);
          result.details.violations.push(v);
        });

        console.log(`   ❌ PRD violates data contract: ${violations.length} violation(s)`);
      } else {
        console.log('   ✅ PRD complies with data contract');
      }
    }

    // Step 3: Validate UX contract (if exists)
    if (contracts.uxContract) {
      console.log('   Checking UX contract boundaries...');

      // Get cultural design style from UX contract
      const culturalStyle = contracts.uxContract.cultural_design_style;
      if (culturalStyle) {
        console.log(`   📎 Cultural design style: ${culturalStyle} (strictly inherited)`);
        result.details.cultural_design_style = culturalStyle;
      }

      // Extract component paths from PRD (if available)
      if (prd) {
        const componentPaths = extractComponentPathsFromPRD(prd);

        for (const path of componentPaths) {
          const uxValidation = await validateComponentAgainstUxContract(sdId, path);

          if (uxValidation.valid === false) {
            // UX_CONTRACT violations are WARNINGs (can be overridden)
            result.score = Math.max(0, result.score - 10);

            const violations = uxValidation.violations || [];
            violations.forEach(v => {
              result.warnings.push(`[UX_CONTRACT] ${v.message}`);
              result.details.violations.push(v);
            });

            console.log(`   ⚠️  Component path '${path}' violates UX contract`);
          }
        }

        if (componentPaths.length > 0) {
          console.log(`   ✅ Validated ${componentPaths.length} component path(s)`);
        }
      }
    }

    // Step 4: Get overall summary
    const summary = await getContractSummary(sdId);
    if (summary && !summary.error) {
      result.details.summary = summary;
    }

    // Final status
    if (result.passed) {
      console.log('   ✅ Contract compliance: PASSED');
    } else {
      console.log('   ❌ Contract compliance: BLOCKED');
      console.log(`      ${result.issues.length} blocking issue(s)`);
    }

    if (result.warnings.length > 0) {
      console.log(`   ⚠️  ${result.warnings.length} warning(s)`);
    }

  } catch (error) {
    console.error(`   ❌ Contract validation error: ${error.message}`);
    result.warnings.push(`Contract validation error: ${error.message}`);
  }

  return result;
}

/**
 * Build content string from PRD for table/column extraction
 * @param {Object} prd - PRD object
 * @returns {string} Content string
 */
function buildPRDContentString(prd) {
  const parts = [];

  if (prd.executive_summary) parts.push(prd.executive_summary);
  if (prd.functional_requirements) {
    if (Array.isArray(prd.functional_requirements)) {
      parts.push(prd.functional_requirements.join('\n'));
    } else {
      parts.push(JSON.stringify(prd.functional_requirements));
    }
  }
  if (prd.technical_requirements) {
    if (Array.isArray(prd.technical_requirements)) {
      parts.push(prd.technical_requirements.join('\n'));
    } else {
      parts.push(JSON.stringify(prd.technical_requirements));
    }
  }
  if (prd.implementation_approach) parts.push(prd.implementation_approach);
  if (prd.system_architecture) parts.push(prd.system_architecture);
  if (prd.database_changes) parts.push(prd.database_changes);

  return parts.join('\n\n');
}

/**
 * Extract component paths from PRD content
 * @param {Object} prd - PRD object
 * @returns {string[]} Array of component paths
 */
function extractComponentPathsFromPRD(prd) {
  const paths = new Set();
  const pathPattern = /(?:src\/|components\/|pages\/)[a-zA-Z0-9_\-\/]+\.(?:tsx?|jsx?)/g;

  const contentToSearch = [
    prd.implementation_approach,
    prd.system_architecture,
    prd.technical_requirements,
    JSON.stringify(prd.features || []),
    JSON.stringify(prd.objectives || [])
  ].filter(Boolean).join('\n');

  const matches = contentToSearch.match(pathPattern) || [];
  matches.forEach(m => paths.add(m));

  return Array.from(paths);
}

/**
 * Gate function for handoff validation
 * Returns result in handoff gate format
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} prd - PRD object
 * @returns {Promise<Object>} Gate result
 */
export async function validateContractGate(sdId, prd) {
  const validation = await validateSDContractCompliance(sdId, prd);

  return {
    passed: validation.passed,
    score: validation.score,
    max_score: validation.max_score,
    issues: validation.issues,
    warnings: validation.warnings,
    details: validation.details
  };
}

export default {
  getInheritedContracts,
  validatePRDAgainstDataContract,
  validateMigrationAgainstDataContract,
  validateComponentAgainstUxContract,
  getContractSummary,
  checkSDCanComplete,
  validateSDContractCompliance,
  validateContractGate
};
