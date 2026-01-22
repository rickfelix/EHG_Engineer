/**
 * Cost Optimization Sub-Agent - Cost Calculator
 * Calculate current and projected costs
 */

import { LIMITS } from './config.js';

/**
 * Calculate current costs
 * @param {Object} usage - Usage data
 * @returns {Object} Cost breakdown
 */
export function calculateCosts(usage) {
  const costs = {
    current: 'FREE_TIER',
    breakdown: {},
    totalMonthly: 0
  };

  // Check if exceeding free tier
  const dbUsage = usage.database;
  const dbPercent = (dbUsage.estimatedSize / LIMITS.database.size) * 100;

  costs.breakdown.database = {
    usage: `${Math.round(dbUsage.estimatedSize / 1024 / 1024)}MB`,
    limit: '500MB',
    percent: Math.round(dbPercent),
    status: dbPercent > 95 ? 'CRITICAL' : dbPercent > 80 ? 'WARNING' : 'GOOD'
  };

  // API usage (estimated)
  const apiCalls = usage.api.totalCalls;
  const estimatedMonthly = apiCalls * 30 * 24; // Rough estimate

  costs.breakdown.api = {
    estimatedCalls: estimatedMonthly,
    status: estimatedMonthly > 1000000 ? 'WARNING' : 'GOOD'
  };

  // Check if likely to exceed free tier
  if (dbPercent > 80 || estimatedMonthly > 500000) {
    costs.current = 'APPROACHING_LIMITS';
    costs.warning = 'Consider upgrading to Pro tier ($25/month) soon';
  }

  return costs;
}

/**
 * Project future costs
 * @param {Object} usage - Usage data
 * @returns {Object} Cost projections
 */
export function projectFutureCosts(usage) {
  const projections = {
    '30_days': {},
    '90_days': {},
    '365_days': {}
  };

  // Simple linear projection (would need historical data for better accuracy)
  const dailyGrowth = 0.02; // Assume 2% daily growth

  const currentSize = usage.database.estimatedSize;

  projections['30_days'] = {
    databaseSize: Math.round(currentSize * Math.pow(1 + dailyGrowth, 30) / 1024 / 1024) + 'MB',
    estimatedCost: currentSize * Math.pow(1 + dailyGrowth, 30) > LIMITS.database.size ? '$25' : '$0'
  };

  projections['90_days'] = {
    databaseSize: Math.round(currentSize * Math.pow(1 + dailyGrowth, 90) / 1024 / 1024) + 'MB',
    estimatedCost: currentSize * Math.pow(1 + dailyGrowth, 90) > LIMITS.database.size ? '$25' : '$0'
  };

  projections['365_days'] = {
    databaseSize: Math.round(currentSize * Math.pow(1 + dailyGrowth, 365) / 1024 / 1024) + 'MB',
    estimatedCost: '$25-$599'
  };

  return projections;
}
