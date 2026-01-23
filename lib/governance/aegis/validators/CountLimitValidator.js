/**
 * CountLimitValidator - Validates rate limits and count constraints
 *
 * Configuration options (in validation_config):
 * - table: Table to count records from
 * - filter: Object of field:value filters
 * - period_hours: Time period in hours
 * - max_count: Maximum allowed count
 *
 * @module CountLimitValidator
 * @version 1.0.0
 */

import { BaseValidator } from './BaseValidator.js';

export class CountLimitValidator extends BaseValidator {
  constructor(options = {}) {
    super(options);
    this.supabase = options.supabase;
  }

  /**
   * Validate count limits
   * @param {Object} rule - Rule with validation_config
   * @param {Object} context - Context to validate
   * @returns {Promise<Object>} Validation result
   */
  async validate(rule, context) {
    const config = rule.validation_config || {};
    const issues = [];

    // Skip if no supabase client
    if (!this.supabase) {
      console.warn('[CountLimitValidator] No Supabase client, skipping count validation');
      return this.formatResult(true, 'Count validation skipped (no database connection)');
    }

    // Skip if required config is missing
    if (!config.table || !config.max_count) {
      return this.formatResult(true, 'Count validation skipped (missing config)');
    }

    try {
      // Build the query
      let query = this.supabase
        .from(config.table)
        .select('*', { count: 'exact', head: true });

      // Apply filters
      if (config.filter) {
        for (const [field, value] of Object.entries(config.filter)) {
          query = query.eq(field, value);
        }
      }

      // Apply time period filter
      if (config.period_hours) {
        const cutoffDate = new Date();
        cutoffDate.setHours(cutoffDate.getHours() - config.period_hours);

        // Try common timestamp column names
        const timestampCol = config.timestamp_column || 'applied_at' || 'created_at';
        query = query.gte(timestampCol, cutoffDate.toISOString());
      }

      const { count, error } = await query;

      if (error) {
        // Fail safe - if we can't check, report as a violation
        issues.push(`Cannot verify count limit: ${error.message}`);
        return this.formatResult(false, issues.join('; '), {
          issues,
          error: error.message
        });
      }

      if (count >= config.max_count) {
        issues.push(
          `Count limit exceeded: ${count} >= ${config.max_count} in ${config.period_hours || 'all'}h`
        );
      }

      if (issues.length > 0) {
        return this.formatResult(false, issues.join('; '), {
          issues,
          currentCount: count,
          maxCount: config.max_count,
          periodHours: config.period_hours,
          table: config.table,
          filter: config.filter
        });
      }

      return this.formatResult(true, `Count check passed (${count}/${config.max_count})`, {
        currentCount: count,
        maxCount: config.max_count
      });

    } catch (err) {
      // Fail safe on any error
      issues.push(`Count validation error: ${err.message}`);
      return this.formatResult(false, issues.join('; '), {
        issues,
        error: err.message
      });
    }
  }
}

export default CountLimitValidator;
