/**
 * Function Consistency Validator
 * SD-DATABASE-VALIDATION-001: Phase 3 - Function Consistency
 *
 * Validates consistency between related database functions by:
 * - Comparing function signatures
 * - Detecting table/column reference inconsistencies
 * - Checking phase weight consistency
 * - Identifying logic pattern mismatches
 *
 * CRITICAL: This is a read-only analysis tool - never modifies database.
 *
 * Usage:
 *   node scripts/db-validate/function-validator.js [--project=engineer|ehg] [--verbose] [--group=progress]
 */

import { createDatabaseClient } from '../lib/supabase-connection.js';

/**
 * Function validation result
 * @typedef {Object} FunctionValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {string[]} errors - List of errors found
 * @property {string[]} warnings - List of warnings
 * @property {Object} metadata - Validation metadata
 */

/**
 * Function info from database
 * @typedef {Object} FunctionInfo
 * @property {string} name - Function name
 * @property {string} arguments - Function arguments
 * @property {string} returnType - Return type
 * @property {string} language - Language (plpgsql, sql, etc.)
 * @property {string} volatility - Volatility (volatile, stable, immutable)
 * @property {string} definition - Full function definition
 */

/**
 * Related function groups that should have consistent logic
 */
export const FUNCTION_GROUPS = {
  progress: {
    name: 'Progress Calculation',
    functions: [
      'calculate_sd_progress',
      'get_progress_breakdown',
      'get_progress_breakdown_v2',
      'calculate_parent_sd_progress'
    ],
    consistencyRules: [
      {
        id: 'phase-weights',
        description: 'Phase weights should be consistent across functions',
        check: 'phaseWeights'
      },
      {
        id: 'table-references',
        description: 'Table references should be consistent',
        check: 'tableReferences'
      },
      {
        id: 'column-references',
        description: 'Column references should match across functions',
        check: 'columnReferences'
      }
    ]
  },
  handoff: {
    name: 'Handoff Processing',
    functions: [
      'accept_phase_handoff',
      'create_validated_handoff',
      'get_sd_handoff_status',
      'check_handoff_gates_status'
    ],
    consistencyRules: [
      {
        id: 'table-references',
        description: 'Handoff table references should be consistent',
        check: 'tableReferences'
      }
    ]
  },
  validation: {
    name: 'Validation Gates',
    functions: [
      'check_gates_before_exec',
      'check_prd_for_exec_handoff',
      'check_required_sub_agents',
      'check_deliverables_complete'
    ],
    consistencyRules: [
      {
        id: 'return-format',
        description: 'Return format should be consistent (jsonb structure)',
        check: 'returnFormat'
      }
    ]
  }
};

/**
 * Known phase weights for progress calculation
 */
const EXPECTED_PHASE_WEIGHTS = {
  LEAD_approval: 20,
  PLAN_prd: 20,
  EXEC_implementation: 30,
  PLAN_verification: 15,
  LEAD_final_approval: 15
};

export class FunctionValidator {
  constructor(project = 'engineer', options = {}) {
    this.project = project;
    this.verbose = options.verbose || false;
    this.client = null;
    this.functions = new Map();
  }

  /**
   * Connect to database
   */
  async connect() {
    this.client = await createDatabaseClient(this.project, { verify: false });
    return this;
  }

  /**
   * Disconnect from database
   */
  async disconnect() {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
  }

  /**
   * Get all functions in the public schema
   * @returns {Promise<FunctionInfo[]>}
   */
  async getAllFunctions() {
    const result = await this.client.query(`
      SELECT
        p.proname as name,
        pg_get_function_arguments(p.oid) as arguments,
        pg_get_function_result(p.oid) as return_type,
        l.lanname as language,
        CASE WHEN p.provolatile = 'v' THEN 'volatile'
             WHEN p.provolatile = 's' THEN 'stable'
             ELSE 'immutable' END as volatility,
        pg_get_functiondef(p.oid) as definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      JOIN pg_language l ON p.prolang = l.oid
      WHERE n.nspname = 'public'
        AND l.lanname IN ('plpgsql', 'sql')
      ORDER BY p.proname
    `);
    return result.rows;
  }

  /**
   * Get function by name
   * @param {string} name - Function name
   * @returns {Promise<FunctionInfo|null>}
   */
  async getFunction(name) {
    if (this.functions.has(name)) {
      return this.functions.get(name);
    }

    const result = await this.client.query(`
      SELECT
        p.proname as name,
        pg_get_function_arguments(p.oid) as arguments,
        pg_get_function_result(p.oid) as return_type,
        l.lanname as language,
        CASE WHEN p.provolatile = 'v' THEN 'volatile'
             WHEN p.provolatile = 's' THEN 'stable'
             ELSE 'immutable' END as volatility,
        pg_get_functiondef(p.oid) as definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      JOIN pg_language l ON p.prolang = l.oid
      WHERE n.nspname = 'public'
        AND p.proname = $1
      LIMIT 1
    `, [name]);

    const func = result.rows[0] || null;
    if (func) {
      this.functions.set(name, func);
    }
    return func;
  }

  /**
   * Extract table references from function definition
   * @param {string} definition - Function definition
   * @returns {string[]} List of table names referenced
   */
  extractTableReferences(definition) {
    if (!definition) return [];

    const tables = new Set();

    // Common patterns for table references
    const patterns = [
      /FROM\s+(\w+)/gi,
      /JOIN\s+(\w+)/gi,
      /INTO\s+(\w+)/gi,
      /UPDATE\s+(\w+)/gi,
      /INSERT\s+INTO\s+(\w+)/gi,
      /DELETE\s+FROM\s+(\w+)/gi,
      /EXISTS\s*\(\s*SELECT.*?FROM\s+(\w+)/gi
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(definition)) !== null) {
        const table = match[1].toLowerCase();
        // Filter out common keywords and non-table names
        if (!['select', 'from', 'where', 'and', 'or', 'not', 'null', 'true', 'false'].includes(table)) {
          tables.add(table);
        }
      }
    }

    return Array.from(tables).sort();
  }

  /**
   * Extract column references for a specific table
   * @param {string} definition - Function definition
   * @param {string} tableName - Table name to look for
   * @returns {string[]} List of column names referenced
   */
  extractColumnReferences(definition, tableName) {
    if (!definition) return [];

    const columns = new Set();

    // Pattern to find column references like table.column or column = value after FROM table
    const patterns = [
      new RegExp(`${tableName}\\.([\\w]+)`, 'gi'),
      new RegExp('WHERE\\s+([\\w]+)\\s*=', 'gi'),
      new RegExp('SELECT.*?([\\w]+)\\s*(?:,|FROM)', 'gi')
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(definition)) !== null) {
        columns.add(match[1].toLowerCase());
      }
    }

    return Array.from(columns).sort();
  }

  /**
   * Extract phase weights from function definition
   * @param {string} definition - Function definition
   * @returns {Object} Phase weights found
   */
  extractPhaseWeights(definition) {
    if (!definition) return {};

    const weights = {};

    // Look for weight assignments like progress := progress + 20
    const progressPatterns = [
      /progress\s*:=\s*progress\s*\+\s*(\d+)/gi,
      /'weight',\s*(\d+)/gi,
      /weight.*?(\d+)/gi
    ];

    // Extract numeric values that could be weights
    const weightMatches = definition.match(/\+ (\d+)/g) || [];
    for (const match of weightMatches) {
      const value = parseInt(match.replace('+ ', ''));
      if ([15, 20, 30].includes(value)) {
        // These are likely phase weights
        weights[`phase_${Object.keys(weights).length + 1}`] = value;
      }
    }

    return weights;
  }

  /**
   * Check consistency of table references across functions
   * @param {FunctionInfo[]} functions - Functions to compare
   * @returns {Object} Consistency check result
   */
  checkTableReferenceConsistency(functions) {
    const errors = [];
    const warnings = [];
    const tableRefs = {};

    for (const func of functions) {
      const tables = this.extractTableReferences(func.definition);
      tableRefs[func.name] = tables;
    }

    // Check for PRD table reference inconsistency
    const prdReferences = {};
    for (const [funcName, tables] of Object.entries(tableRefs)) {
      const func = functions.find(f => f.name === funcName);
      if (!func) continue;

      // Check for product_requirements_v2 reference patterns
      if (func.definition.includes('product_requirements_v2')) {
        if (func.definition.includes('sd_uuid')) {
          prdReferences[funcName] = 'sd_uuid';
        } else if (func.definition.includes('directive_id')) {
          prdReferences[funcName] = 'directive_id';
        }
      }
    }

    // Check for inconsistent PRD column references
    const refValues = Object.values(prdReferences);
    if (refValues.includes('sd_uuid') && refValues.includes('directive_id')) {
      for (const [funcName, ref] of Object.entries(prdReferences)) {
        if (ref === 'directive_id') {
          errors.push(
            `Function '${funcName}' uses 'directive_id' for PRD lookup, but other functions use 'sd_uuid'. ` +
            'This can cause data retrieval inconsistencies.'
          );
        }
      }
    }

    return { errors, warnings, tableRefs };
  }

  /**
   * Check consistency of phase weights across functions
   * @param {FunctionInfo[]} functions - Functions to compare
   * @returns {Object} Consistency check result
   */
  checkPhaseWeightConsistency(functions) {
    const errors = [];
    const warnings = [];
    const phaseWeights = {};

    for (const func of functions) {
      const weights = this.extractPhaseWeights(func.definition);
      phaseWeights[func.name] = weights;
    }

    // Check if any function has unexpected weights
    for (const [funcName, weights] of Object.entries(phaseWeights)) {
      const values = Object.values(weights);
      const sum = values.reduce((a, b) => a + b, 0);

      // Standard weights should sum to 100
      if (values.length >= 5 && sum !== 100) {
        warnings.push(
          `Function '${funcName}' has phase weights that sum to ${sum}, expected 100`
        );
      }
    }

    return { errors, warnings, phaseWeights };
  }

  /**
   * Validate a function group for consistency
   * @param {string} groupName - Name of the function group
   * @returns {Promise<FunctionValidationResult>}
   */
  async validateFunctionGroup(groupName) {
    const group = FUNCTION_GROUPS[groupName];
    if (!group) {
      return {
        valid: false,
        errors: [`Unknown function group: ${groupName}`],
        warnings: [],
        metadata: { groupName }
      };
    }

    const errors = [];
    const warnings = [];
    const functions = [];

    // Get all functions in the group
    for (const funcName of group.functions) {
      const func = await this.getFunction(funcName);
      if (!func) {
        warnings.push(`Function '${funcName}' not found in database`);
      } else {
        functions.push(func);
      }
    }

    if (functions.length < 2) {
      return {
        valid: true,
        errors: [],
        warnings: [...warnings, 'Not enough functions found for consistency check'],
        metadata: { groupName, functionCount: functions.length }
      };
    }

    // Run consistency checks
    for (const rule of group.consistencyRules) {
      if (rule.check === 'tableReferences') {
        const result = this.checkTableReferenceConsistency(functions);
        errors.push(...result.errors);
        warnings.push(...result.warnings);
      }

      if (rule.check === 'phaseWeights') {
        const result = this.checkPhaseWeightConsistency(functions);
        errors.push(...result.errors);
        warnings.push(...result.warnings);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        groupName,
        groupTitle: group.name,
        functionCount: functions.length,
        functionsChecked: functions.map(f => f.name)
      }
    };
  }

  /**
   * Validate all function groups
   * @returns {Promise<{valid: boolean, results: Object}>}
   */
  async validateAllGroups() {
    const results = {};
    let allValid = true;

    for (const groupName of Object.keys(FUNCTION_GROUPS)) {
      const result = await this.validateFunctionGroup(groupName);
      results[groupName] = result;
      if (!result.valid) {
        allValid = false;
      }
    }

    return { valid: allValid, results };
  }

  /**
   * Analyze a single function
   * @param {string} funcName - Function name
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeFunction(funcName) {
    const func = await this.getFunction(funcName);
    if (!func) {
      return { error: `Function '${funcName}' not found` };
    }

    return {
      name: func.name,
      arguments: func.arguments,
      returnType: func.return_type,
      language: func.language,
      volatility: func.volatility,
      definitionLength: func.definition?.length || 0,
      tables: this.extractTableReferences(func.definition),
      phaseWeights: this.extractPhaseWeights(func.definition)
    };
  }

  /**
   * Log validation result
   * @param {FunctionValidationResult} result - Validation result
   */
  logResult(result) {
    if (result.valid) {
      console.log('\x1b[32m%s\x1b[0m', `✓ Function group validation PASSED: ${result.metadata.groupTitle || result.metadata.groupName}`);
    } else {
      console.log('\x1b[31m%s\x1b[0m', `✗ Function group validation FAILED: ${result.metadata.groupTitle || result.metadata.groupName}`);
    }

    if (result.errors.length > 0) {
      console.log('\n\x1b[31mErrors:\x1b[0m');
      result.errors.forEach(err => console.log(`  - ${err}`));
    }

    if (result.warnings.length > 0) {
      console.log('\n\x1b[33mWarnings:\x1b[0m');
      result.warnings.forEach(warn => console.log(`  - ${warn}`));
    }

    if (this.verbose && result.metadata) {
      console.log('\n\x1b[36mMetadata:\x1b[0m');
      console.log(JSON.stringify(result.metadata, null, 2));
    }
  }
}

/**
 * Get function groups list
 * @returns {Object} Function groups
 */
export function getFunctionGroups() {
  return FUNCTION_GROUPS;
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const project = args.find(a => a.startsWith('--project='))?.split('=')[1] || 'engineer';
  const verbose = args.includes('--verbose');
  const groupArg = args.find(a => a.startsWith('--group='))?.split('=')[1];
  const analyzeArg = args.find(a => a.startsWith('--analyze='))?.split('=')[1];
  const listGroups = args.includes('--list-groups');

  const validator = new FunctionValidator(project, { verbose });

  async function main() {
    try {
      if (listGroups) {
        console.log('\nAvailable function groups:');
        for (const [name, group] of Object.entries(FUNCTION_GROUPS)) {
          console.log(`\n  ${name}: ${group.name}`);
          console.log(`    Functions: ${group.functions.join(', ')}`);
        }
        return;
      }

      await validator.connect();
      console.log(`\nFunction Consistency Validator - ${project} database\n`);

      if (analyzeArg) {
        // Analyze single function
        const analysis = await validator.analyzeFunction(analyzeArg);
        console.log('Function Analysis:');
        console.log(JSON.stringify(analysis, null, 2));
      } else if (groupArg) {
        // Validate specific group
        const result = await validator.validateFunctionGroup(groupArg);
        validator.logResult(result);
        process.exit(result.valid ? 0 : 1);
      } else {
        // Validate all groups
        const { valid, results } = await validator.validateAllGroups();

        for (const [groupName, result] of Object.entries(results)) {
          validator.logResult(result);
          console.log('');
        }

        const totalErrors = Object.values(results).reduce((sum, r) => sum + r.errors.length, 0);
        const totalWarnings = Object.values(results).reduce((sum, r) => sum + r.warnings.length, 0);

        console.log(`\nSummary: ${totalErrors} errors, ${totalWarnings} warnings`);
        process.exit(valid ? 0 : 1);
      }
    } catch (error) {
      console.error('Validation error:', error.message);
      process.exit(1);
    } finally {
      await validator.disconnect();
    }
  }

  main();
}
