/**
 * Feasibility and Environment Checks for LEAD-TO-PLAN Verifier
 *
 * Validates SD feasibility and development environment readiness.
 *
 * Extracted from scripts/verify-handoff-lead-to-plan.js for maintainability.
 * Part of SD-LEO-REFACTOR-HANDOFF-001
 */

import fs from 'fs';
import path from 'path';

/**
 * Validate strategic feasibility
 *
 * @param {Object} sd - Strategic Directive object
 * @returns {Object} - Check result with passed and issues
 */
export function validateFeasibility(sd) {
  const check = {
    passed: true,
    issues: []
  };

  // Check for unrealistic timelines in key principles
  if (sd.key_principles) {
    try {
      const principles = typeof sd.key_principles === 'string'
        ? JSON.parse(sd.key_principles)
        : sd.key_principles;

      // Look for timeline constraints in key principles
      const timelineConstraint = Array.isArray(principles)
        ? principles.find(c => c.type === 'timeline' || c.title?.toLowerCase().includes('time'))
        : null;

      if (timelineConstraint && timelineConstraint.value) {
        const timeline = timelineConstraint.value.toLowerCase();
        if (timeline.includes('1 day') || timeline.includes('immediate')) {
          check.issues.push('Timeline constraint may be unrealistic for comprehensive implementation');
        }
      }
    } catch {
      // Ignore JSON parsing errors for feasibility check
    }
  }

  // Check priority vs complexity alignment
  if (sd.priority === 'LOW' && sd.description?.length > 500) {
    check.issues.push('Low priority directive with high complexity description - consider priority adjustment');
  }

  // Validate risk mitigation
  if (sd.risks) {
    try {
      const risks = typeof sd.risks === 'string' ? JSON.parse(sd.risks) : sd.risks;
      if (Array.isArray(risks)) {
        const highRisks = risks.filter(r => r.level === 'HIGH' || r.severity === 'HIGH');
        const withMitigation = highRisks.filter(r => r.mitigation || r.response);

        if (highRisks.length > 0 && withMitigation.length < highRisks.length) {
          check.issues.push('High-risk items lack mitigation strategies');
        }
      }
    } catch {
      // Ignore JSON parsing errors
    }
  }

  // Only fail for critical feasibility issues
  if (check.issues.some(issue => issue.includes('unrealistic') || issue.includes('lack mitigation'))) {
    check.passed = false;
  }

  return check;
}

/**
 * Check development environment readiness
 *
 * @param {Object} _sd - Strategic Directive object (unused but kept for interface)
 * @param {Object} supabase - Supabase client
 * @param {string} projectRoot - Project root path
 * @returns {Promise<Object>} - Check result with ready and issues
 */
export async function checkEnvironmentReadiness(_sd, supabase, projectRoot) {
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
