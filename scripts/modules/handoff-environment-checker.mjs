/**
 * Handoff Environment Checker Module
 * Extracted from verify-handoff-lead-to-plan.js for modularity
 *
 * Part of SD-REFACTOR-2025-001-P2-003: verify-handoff-lead-to-plan Refactoring
 *
 * Contains environment readiness checks.
 * @module HandoffEnvironmentChecker
 * @version 1.0.0
 */

import fs from 'fs';
import path from 'path';

// =============================================================================
// ENVIRONMENT CHECKS
// =============================================================================

/**
 * Check development environment readiness
 * @param {Object} supabase - Supabase client
 * @param {Object} options - Check options
 * @param {string} options.projectRoot - Project root path
 * @returns {Promise<Object>} { ready: boolean, issues: string[] }
 */
export async function checkEnvironmentReadiness(supabase, options = {}) {
  const projectRoot = options.projectRoot || '.';

  const check = {
    ready: true,
    issues: []
  };

  try {
    // Check database connectivity
    const { error: dbError } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .limit(1);

    if (dbError) {
      check.ready = false;
      check.issues.push('Database connectivity issue');
    }

    // Check required tables exist
    const requiredTables = ['strategic_directives_v2', 'product_requirements_v2'];
    for (const table of requiredTables) {
      const { error } = await supabase.from(table).select('*').limit(1);
      if (error) {
        check.ready = false;
        check.issues.push(`Required table missing: ${table}`);
      }
    }

    // Check filesystem accessibility
    if (!fs.existsSync(projectRoot)) {
      check.ready = false;
      check.issues.push('Project filesystem not accessible');
    }

    // Check required directories
    const requiredDirs = ['scripts', 'docs/strategic-directives', 'docs/prds'];
    for (const dir of requiredDirs) {
      const fullPath = path.join(projectRoot, dir);
      if (!fs.existsSync(fullPath)) {
        check.issues.push(`Directory missing: ${dir} (will create if needed)`);
      }
    }

  } catch (error) {
    check.ready = false;
    check.issues.push(`Environment check failed: ${error.message}`);
  }

  return check;
}

/**
 * Check if all required environment variables are set
 * @returns {Object} { ready: boolean, missing: string[] }
 */
export function checkEnvironmentVariables() {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];

  const optional = [
    'SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY'
  ];

  const missing = required.filter(key => !process.env[key]);

  return {
    ready: missing.length === 0,
    missing,
    optional: optional.filter(key => !process.env[key])
  };
}

/**
 * Ensure required directories exist
 * @param {string} projectRoot - Project root path
 * @param {string[]} dirs - Directories to ensure exist
 * @returns {Object} { created: string[], existing: string[], errors: string[] }
 */
export function ensureDirectoriesExist(projectRoot, dirs) {
  const result = {
    created: [],
    existing: [],
    errors: []
  };

  for (const dir of dirs) {
    const fullPath = path.join(projectRoot, dir);
    try {
      if (fs.existsSync(fullPath)) {
        result.existing.push(dir);
      } else {
        fs.mkdirSync(fullPath, { recursive: true });
        result.created.push(dir);
      }
    } catch (e) {
      result.errors.push(`${dir}: ${e.message}`);
    }
  }

  return result;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  checkEnvironmentReadiness,
  checkEnvironmentVariables,
  ensureDirectoriesExist
};
