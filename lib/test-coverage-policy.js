/**
 * Test Coverage Policy Enforcement
 *
 * LOC-based test coverage requirement lookup per SD-QUALITY-002.
 *
 * Usage:
 *   import { getCoverageRequirement } from './lib/test-coverage-policy.js';
 *   const req = await getCoverageRequirement(filePath);
 *   console.log(req.level); // 'OPTIONAL' | 'RECOMMENDED' | 'REQUIRED'
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Count lines of code in a file
 *
 * @param {string} filePath - Path to file
 * @returns {Promise<number>} Number of lines
 */
export async function countLOC(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    // Filter out empty lines and comments
    const codeLines = lines.filter(line => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*');
    });

    return codeLines.length;
  } catch (error) {
    console.warn(`⚠️  Could not count LOC for ${filePath}:`, error.message);
    return 0;
  }
}

/**
 * Get test coverage requirement for a file based on LOC
 *
 * @param {string} filePath - Path to file
 * @returns {Promise<Object>} { loc, level, tier, description }
 *
 * @example
 * const req = await getCoverageRequirement('src/utils/helper.js');
 * // Returns: { loc: 35, level: 'RECOMMENDED', tier: 'Tier 2: Standard Files', description: '...' }
 */
export async function getCoverageRequirement(filePath) {
  const loc = await countLOC(filePath);

  const { data: policy, error } = await supabase
    .from('test_coverage_policies')
    .select('*')
    .lte('loc_min', loc)
    .gte('loc_max', loc)
    .single();

  if (error || !policy) {
    // Default fallback if policy not found
    return {
      loc,
      level: 'RECOMMENDED',
      tier: 'Default Policy',
      description: 'Could not find LOC-based policy, defaulting to RECOMMENDED.'
    };
  }

  return {
    loc,
    level: policy.requirement_level,
    tier: policy.tier_name,
    description: policy.description
  };
}

/**
 * Validate test coverage for a file
 *
 * @param {string} filePath - Path to file
 * @param {number} actualCoverage - Actual coverage percentage (0-100)
 * @returns {Promise<Object>} { passes, requirement, actualCoverage, message }
 *
 * @example
 * const result = await validateCoverage('src/complex.js', 45);
 * if (!result.passes) {
 *   console.error('Coverage validation failed:', result.message);
 * }
 */
export async function validateCoverage(filePath, actualCoverage) {
  const req = await getCoverageRequirement(filePath);

  const thresholds = {
    'OPTIONAL': 0,        // No minimum
    'RECOMMENDED': 50,    // 50% recommended
    'REQUIRED': 80        // 80% required
  };

  const minRequired = thresholds[req.level];

  return {
    passes: actualCoverage >= minRequired,
    requirement: req,
    actualCoverage,
    minRequired,
    message: actualCoverage >= minRequired
      ? `✅ Coverage ${actualCoverage}% meets ${req.level} threshold (${minRequired}%)`
      : `❌ Coverage ${actualCoverage}% below ${req.level} threshold (${minRequired}%)`
  };
}

/**
 * Get summary of test coverage policies
 *
 * @returns {Promise<Array>} Array of all policies
 */
export async function getPolicySummary() {
  const { data: policies, error } = await supabase
    .from('test_coverage_policies')
    .select('*')
    .order('loc_min');

  if (error) {
    console.error('Error fetching policies:', error.message);
    return [];
  }

  return policies;
}

export default {
  countLOC,
  getCoverageRequirement,
  validateCoverage,
  getPolicySummary
};
