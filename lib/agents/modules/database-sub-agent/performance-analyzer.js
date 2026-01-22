/**
 * Database Sub-Agent - Performance Analyzer Module
 *
 * Analyzes database performance including indexes and query patterns.
 *
 * @module lib/agents/modules/database-sub-agent/performance-analyzer
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import { getSourceFiles } from './helpers.js';

/**
 * Analyze database performance
 *
 * @returns {Promise<Object>} Performance analysis results
 */
export async function analyzePerformance() {
  const performance = {
    slowQueries: [],
    missingIndexes: [],
    recommendations: []
  };

  // Analyze code for performance issues
  const queryPatterns = await findQueryPatterns();

  // Check for missing indexes on commonly queried columns
  const commonQueries = [
    { column: 'created_at', usage: 'ORDER BY' },
    { column: 'status', usage: 'WHERE' },
    { column: 'user_id', usage: 'WHERE' },
    { column: 'updated_at', usage: 'ORDER BY' }
  ];

  for (const query of commonQueries) {
    const hasIndex = await checkIndexExists(query.column);
    if (!hasIndex) {
      performance.missingIndexes.push({
        column: query.column,
        usage: query.usage,
        recommendation: `CREATE INDEX idx_${query.column} ON table_name(${query.column});`
      });
    }
  }

  // Performance recommendations
  if (queryPatterns.hasLargeJoins) {
    performance.recommendations.push({
      type: 'OPTIMIZE_JOINS',
      message: 'Large JOINs detected',
      fix: 'Consider denormalization or materialized views for frequently joined data'
    });
  }

  if (queryPatterns.hasComplexAggregations) {
    performance.recommendations.push({
      type: 'OPTIMIZE_AGGREGATIONS',
      message: 'Complex aggregations detected',
      fix: 'Consider using materialized views or caching aggregated results'
    });
  }

  performance.status = performance.missingIndexes.length > 3 ? 'WARNING' :
                      performance.slowQueries.length > 0 ? 'FAIL' : 'PASS';

  return performance;
}

/**
 * Find query patterns in code
 *
 * @returns {Promise<Object>} Query pattern analysis
 */
export async function findQueryPatterns() {
  const patterns = {
    hasLargeJoins: false,
    hasComplexAggregations: false,
    hasRecursiveQueries: false
  };

  const files = await getSourceFiles('./src').catch(() => []);

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8').catch(() => '');

    // Check for multiple JOINs
    if (/JOIN.*JOIN.*JOIN/gi.test(content)) {
      patterns.hasLargeJoins = true;
    }

    // Check for aggregations
    if (/GROUP\s+BY|SUM\s*\(|COUNT\s*\(|AVG\s*\(/gi.test(content)) {
      patterns.hasComplexAggregations = true;
    }

    // Check for recursive CTEs
    if (/WITH\s+RECURSIVE/gi.test(content)) {
      patterns.hasRecursiveQueries = true;
    }
  }

  return patterns;
}

/**
 * Check if index exists (mock implementation)
 *
 * @param {string} column - Column name to check
 * @returns {Promise<boolean>} Whether index exists
 */
export async function checkIndexExists(column) {
  // In a real implementation, query the database
  // For now, assume common columns are indexed
  return ['id', 'created_at', 'updated_at'].includes(column);
}
