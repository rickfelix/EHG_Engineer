/**
 * Schema Dependency Checker for Validators
 * Part of SD-LEO-001: Process Improvement (US-007)
 *
 * Ensures validators that depend on specific database columns declare those
 * dependencies, and verifies the columns exist before running validation.
 *
 * Problem solved:
 * - Validators added without corresponding migrations cause runtime failures
 * - Example: fileScopeValidation expected prd.file_scope but column didn't exist
 *
 * Solution:
 * - Validators declare their schema dependencies
 * - Startup check verifies dependencies exist
 * - Missing dependencies trigger warnings (not blocking) or skip validator
 *
 * Usage:
 *   import { SchemaDependencyChecker } from './lib/validation/schema-dependency-checker.js';
 *   const checker = new SchemaDependencyChecker(supabaseClient);
 *   await checker.validateDependencies(validatorDependencies);
 */

/**
 * Validator Schema Dependencies
 * Maps validator names to their required database columns
 */
export const VALIDATOR_DEPENDENCIES = {
  // Validators that require specific PRD columns
  fileScopeValidation: {
    table: 'product_requirements_v2',
    columns: ['file_scope'],
    fallback: 'metadata.file_scope', // Alternative location
    required: false, // If missing, validator can be skipped
    addedIn: 'SD-VALIDATION-REGISTRY-001' // For tracking
  },

  executionPlanValidation: {
    table: 'product_requirements_v2',
    columns: ['execution_plan'],
    fallback: 'metadata.execution_plan',
    required: false,
    addedIn: 'SD-VALIDATION-REGISTRY-001'
  },

  testingStrategyValidation: {
    table: 'product_requirements_v2',
    columns: ['testing_strategy'],
    fallback: 'metadata.testing_strategy',
    required: false,
    addedIn: 'SD-VALIDATION-REGISTRY-001'
  },

  // Validators that require SD columns
  sdTypeValidation: {
    table: 'strategic_directives_v2',
    columns: ['sd_type'],
    required: false,
    addedIn: 'SD-LEO-001'
  },

  // Validators that require user_stories columns
  userStoryQualityValidation: {
    table: 'user_stories',
    columns: ['test_scenarios', 'implementation_context'],
    required: false,
    addedIn: 'initial'
  }
};

export class SchemaDependencyChecker {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.cache = new Map(); // Cache column checks
  }

  /**
   * Check if a column exists in a table
   * @param {string} table - Table name
   * @param {string} column - Column name
   * @returns {Promise<boolean>}
   */
  async columnExists(table, column) {
    const cacheKey = `${table}.${column}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      // Query information_schema to check column existence
      const { data, error } = await this.supabase
        .rpc('check_column_exists', { p_table: table, p_column: column });

      if (error) {
        // Fallback: try a limited select to infer column existence
        const { error: selectError } = await this.supabase
          .from(table)
          .select(column)
          .limit(1);

        const exists = !selectError || !selectError.message.includes('does not exist');
        this.cache.set(cacheKey, exists);
        return exists;
      }

      this.cache.set(cacheKey, data);
      return data;
    } catch {
      // Assume column exists if we can't check
      this.cache.set(cacheKey, true);
      return true;
    }
  }

  /**
   * Validate all dependencies for registered validators
   * @param {Object} dependencies - Map of validator name to dependency config
   * @returns {Promise<Object>} Validation results
   */
  async validateDependencies(dependencies = VALIDATOR_DEPENDENCIES) {
    const results = {
      valid: [],
      missing: [],
      warnings: []
    };

    for (const [validatorName, config] of Object.entries(dependencies)) {
      const { table, columns, required, fallback, addedIn } = config;

      for (const column of columns) {
        const exists = await this.columnExists(table, column);

        if (exists) {
          results.valid.push({
            validator: validatorName,
            table,
            column
          });
        } else {
          const entry = {
            validator: validatorName,
            table,
            column,
            fallback,
            addedIn,
            required
          };

          if (required) {
            results.missing.push(entry);
          } else {
            results.warnings.push(entry);
          }
        }
      }
    }

    return results;
  }

  /**
   * Print dependency validation report
   * @param {Object} results - Results from validateDependencies
   */
  printReport(results) {
    console.log('\n📋 Validator Schema Dependency Check');
    console.log('='.repeat(50));

    if (results.valid.length > 0) {
      console.log(`\n✅ Valid Dependencies: ${results.valid.length}`);
    }

    if (results.warnings.length > 0) {
      console.log(`\n⚠️  Missing (Non-blocking): ${results.warnings.length}`);
      for (const w of results.warnings) {
        console.log(`   - ${w.validator}: ${w.table}.${w.column}`);
        if (w.fallback) {
          console.log(`     Fallback: ${w.fallback}`);
        }
        console.log(`     Added in: ${w.addedIn}`);
      }
    }

    if (results.missing.length > 0) {
      console.log(`\n❌ Missing (Required): ${results.missing.length}`);
      for (const m of results.missing) {
        console.log(`   - ${m.validator}: ${m.table}.${m.column}`);
        console.log(`     Added in: ${m.addedIn}`);
      }
    }

    console.log('\n' + '='.repeat(50));
  }

  /**
   * Get validators that should be skipped due to missing dependencies
   * @param {Object} results - Results from validateDependencies
   * @returns {Set<string>} Set of validator names to skip
   */
  getSkippedValidators(results) {
    const skipped = new Set();

    for (const entry of [...results.warnings, ...results.missing]) {
      if (!entry.required) {
        skipped.add(entry.validator);
      }
    }

    return skipped;
  }
}

export default SchemaDependencyChecker;
