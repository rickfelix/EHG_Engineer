/**
 * Environment Readiness Checks
 * Validates development environment is ready for planning
 *
 * Extracted from verify-handoff-lead-to-plan.js for modularity
 * SD-LEO-REFACTOR-VERIFY-L2P-001
 */

import fs from 'fs';
import path from 'path';

/**
 * Check development environment readiness
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - Strategic Directive data (unused but kept for signature)
 * @param {string} projectRoot - Project root path
 * @returns {Promise<Object>} Environment check result
 */
export async function checkEnvironmentReadiness(supabase, sd, projectRoot) {
  const check = {
    ready: true,
    issues: []
  };

  try {
    // Check database connectivity
    const { error: dbError } = await supabase.from('strategic_directives_v2').select('id').limit(1);
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

  } catch (envError) {
    check.ready = false;
    check.issues.push(`Environment check failed: ${envError.message}`);
  }

  return check;
}

/**
 * Validate handoff document exists and is valid
 * @param {string} handoffPath - Path to handoff document
 * @param {Object} handoffValidator - HandoffValidator instance
 * @returns {Object|null} Validation result or null if no document
 */
export function validateHandoffDocument(handoffPath, handoffValidator) {
  if (!fs.existsSync(handoffPath)) {
    return null;
  }

  const handoffContent = fs.readFileSync(handoffPath, 'utf8');
  const handoffData = handoffValidator.parseHandoffDocument(handoffContent);
  return handoffValidator.validateHandoff(handoffData);
}
