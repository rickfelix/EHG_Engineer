/**
 * Cost Optimization Sub-Agent - Alerts Generator
 * Generate alerts, optimizations, and calculate score
 */

import { LIMITS } from './config.js';

/**
 * Generate alerts based on usage
 * @param {Object} results - Analysis results
 */
export function generateAlerts(results) {
  const usage = results.usage;

  // Database alerts
  if (usage.database.estimatedSize > LIMITS.database.size * LIMITS.database.critical) {
    results.critical.push({
      type: 'DATABASE_SIZE_CRITICAL',
      message: 'Database size exceeds 95% of free tier limit!',
      action: 'Immediate action required: Archive data or upgrade'
    });
  } else if (usage.database.estimatedSize > LIMITS.database.size * LIMITS.database.warning) {
    results.warnings.push({
      type: 'DATABASE_SIZE_WARNING',
      message: 'Database size exceeds 80% of free tier limit',
      action: 'Plan for data archival or tier upgrade'
    });
  }

  // Expensive operations alerts
  const criticalOps = usage.expensive.filter(op => op.cost === 'CRITICAL');
  if (criticalOps.length > 0) {
    results.critical.push({
      type: 'EXPENSIVE_OPERATIONS',
      message: `${criticalOps.length} critical cost operations found`,
      action: 'Refactor immediately to prevent cost overruns'
    });
  }

  // API usage alerts
  if (usage.api.costlyEndpoints.length > 5) {
    results.warnings.push({
      type: 'INEFFICIENT_API_USAGE',
      message: 'Multiple inefficient API patterns detected',
      action: 'Optimize queries and implement caching'
    });
  }
}

/**
 * Generate optimization recommendations
 * @param {Object} results - Analysis results
 * @returns {Array} Optimization recommendations
 */
export function generateOptimizations(results) {
  const optimizations = [];

  // Database optimizations
  if (results.usage.database.largestTables.length > 0) {
    const largestTable = results.usage.database.largestTables[0];
    if (largestTable.rowCount > 10000) {
      optimizations.push({
        area: 'Database',
        priority: 'HIGH',
        recommendation: `Archive old records from ${largestTable.name}`,
        impact: `Could reduce database size by ~${Math.round(largestTable.estimatedSize / 1024)}MB`,
        implementation: `
// Archive records older than 90 days
const cutoffDate = new Date();
cutoffDate.setDate(cutoffDate.getDate() - 90);

const { data } = await supabase
  .from('${largestTable.name}')
  .select('*')
  .lt('created_at', cutoffDate.toISOString());

// Save to archive storage
await saveToArchive(data);

// Delete from main table
await supabase
  .from('${largestTable.name}')
  .delete()
  .lt('created_at', cutoffDate.toISOString());`
      });
    }
  }

  // API optimizations
  if (results.usage.expensive.filter(op => op.type === 'SELECT_ALL').length > 0) {
    optimizations.push({
      area: 'API Queries',
      priority: 'MEDIUM',
      recommendation: 'Replace SELECT * with specific columns',
      impact: 'Reduce bandwidth by 50-70%',
      implementation: `
// Instead of:
const { data } = await supabase.from('users').select('*');

// Use:
const { data } = await supabase.from('users').select('id, name, email');`
    });
  }

  // Caching optimizations
  if (results.usage.api.endpoints.length > 10) {
    optimizations.push({
      area: 'Caching',
      priority: 'HIGH',
      recommendation: 'Implement Redis caching layer',
      impact: 'Reduce API calls by 60-80%',
      implementation: 'Consider using Upstash Redis (free tier: 10k commands/day)'
    });
  }

  return optimizations;
}

/**
 * Calculate cost efficiency score
 * @param {Object} results - Analysis results
 * @returns {number} Score 0-100
 */
export function calculateScore(results) {
  let score = 100;

  // Deduct for warnings
  score -= results.warnings.length * 5;
  score -= results.critical.length * 15;

  // Deduct for expensive operations
  score -= results.usage.expensive.filter(op => op.cost === 'CRITICAL').length * 10;
  score -= results.usage.expensive.filter(op => op.cost === 'HIGH').length * 5;

  // Deduct for inefficient patterns
  score -= results.usage.api.costlyEndpoints.length * 3;

  return Math.max(0, score);
}
