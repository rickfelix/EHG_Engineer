/**
 * DESIGN Sub-Agent Utilities
 * Helper functions for thresholds, risk context, and UX contracts
 *
 * Extracted from design.js for modularity
 * SD-LEO-REFACTOR-DESIGN-SUB-001
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import {
  getRiskContext,
  calculateContextualConfidence,
  getAggregateRiskStats
} from '../../utils/risk-context.js';
import { validateComponentAgainstUxContract, getInheritedContracts } from '../../../scripts/modules/contract-validation.js';

const execAsync = promisify(exec);

/**
 * Determine adaptive design score threshold based on SD scope
 * Different SDs have different design rigor requirements
 *
 * @param {Object} sd - Strategic Directive metadata
 * @returns {number} Design score threshold (0-100)
 */
export function determineDesignThreshold(sd) {
  if (!sd) return 70; // Default threshold

  const category = (sd.category || '').toLowerCase();
  const scope = (sd.scope || '').toLowerCase();
  const priority = (sd.priority || '').toLowerCase();

  // Critical/Security SDs need higher design bar
  if (category.includes('security') || category.includes('critical') || priority === 'critical') {
    return 85; // High bar for critical work
  }

  // Infrastructure/Database changes have moderate design requirements
  if (category.includes('infrastructure') || category.includes('database') || category.includes('migration')) {
    return 60; // Lower bar for backend-only work
  }

  // Utility/Polish/Quick-fix SDs are lower bar
  if (category.includes('utility') || category.includes('polish') || category.includes('quick-fix') || scope.includes('small')) {
    return 50; // Low bar for small/polish work
  }

  // Performance optimization can have moderate bar
  if (category.includes('performance') || category.includes('optimization')) {
    return 65; // Moderate bar
  }

  // Default for standard feature SDs
  return 70; // Medium bar for normal features
}

/**
 * Enhance detected issues with contextual risk scoring
 *
 * @param {Array<string>} affectedFiles - Files with detected patterns
 * @param {string} patternType - Type of pattern (accessibility, performance, etc)
 * @param {string} repoPath - Repository path
 * @returns {Promise<Object>} Contextual risk analysis
 */
export async function enhanceWithRiskContext(affectedFiles, patternType, repoPath) {
  const analysis = {
    pattern_type: patternType,
    files_analyzed: affectedFiles.length,
    risk_scores: [],
    max_risk_score: 0,
    max_severity: 'LOW',
    aggregate_stats: null
  };

  if (affectedFiles.length === 0) {
    return analysis;
  }

  console.log(`   📊 Analyzing risk context for ${affectedFiles.length} file(s)...`);

  // Gather risk context for each file
  const contextualFindings = [];
  for (const file of affectedFiles.slice(0, 10)) { // Limit to 10 for performance
    try {
      const riskContext = await getRiskContext(file, { repo_path: repoPath });
      const scoring = calculateContextualConfidence(85, riskContext); // Base confidence 85

      contextualFindings.push({
        file,
        risk_score: scoring.risk_score,
        contextual_severity: scoring.contextual_severity,
        risk_factors: scoring.risk_factors,
        explanation: scoring.explanation,
        adjusted_confidence: scoring.adjusted_confidence
      });

      // Track max risk
      if (scoring.risk_score > analysis.max_risk_score) {
        analysis.max_risk_score = scoring.risk_score;
        analysis.max_severity = scoring.contextual_severity;
      }

      console.log(`      ${getSeverityIcon(scoring.contextual_severity)} ${file.split('/').pop()}: Risk ${scoring.risk_score}/10 (${scoring.contextual_severity})`);
      if (scoring.risk_factors.length > 0) {
        console.log(`         Factors: ${scoring.risk_factors.join(', ')}`);
      }
    } catch (err) {
      console.warn(`      ⚠️  Could not analyze ${file}: ${err.message}`);
    }
  }

  analysis.risk_scores = contextualFindings;
  analysis.aggregate_stats = getAggregateRiskStats(contextualFindings);

  console.log(`   📈 Risk Summary: ${analysis.aggregate_stats.critical} critical, ${analysis.aggregate_stats.high} high, ${analysis.aggregate_stats.medium} medium, ${analysis.aggregate_stats.low} low`);
  console.log(`   📊 Avg Risk Score: ${analysis.aggregate_stats.avg_risk_score}/10`);

  return analysis;
}

/**
 * Get files changed in current git diff
 */
export async function getGitDiffFiles(repoPath) {
  try {
    const { stdout } = await execAsync(
      `cd "${repoPath}" && git diff --name-only HEAD 2>/dev/null`
    );

    const files = stdout.trim().split('\n').filter(f => f && f.endsWith('.tsx') || f.endsWith('.jsx'));
    return files;
  } catch {
    // No git or no changes
    return [];
  }
}

/**
 * Get severity icon for display
 */
export function getSeverityIcon(severity) {
  const icons = {
    CRITICAL: '🔴',
    HIGH: '🟠',
    MEDIUM: '🟡',
    LOW: '🟢'
  };
  return icons[severity] || '⚪';
}

/**
 * Validate UX contract compliance for SD
 * @param {string} sdId - Strategic Directive ID
 * @param {string} repoPath - Repository path to check components
 * @returns {Promise<Object>} UX contract compliance result
 */
export async function validateUxContractCompliance(sdId, repoPath) {
  const result = {
    has_contract: false,
    valid: true,
    violations: [],
    cultural_design_style: null,
    style_source: null,
    max_component_loc: null,
    min_wcag_level: null,
    contract_id: null,
    contract_version: null
  };

  try {
    // Check if SD has an inherited UX contract
    const contracts = await getInheritedContracts(sdId);

    if (contracts.error || !contracts.uxContract) {
      // No UX contract = no restrictions
      return result;
    }

    result.has_contract = true;
    result.contract_id = contracts.uxContract.contract_id;
    result.contract_version = contracts.uxContract.contract_version;

    // Extract cultural design style (strictly inherited)
    if (contracts.uxContract.cultural_design_style) {
      result.cultural_design_style = contracts.uxContract.cultural_design_style;
      result.style_source = `inherited_from_${contracts.uxContract.parent_sd_id}`;
    }

    // Extract component constraints
    result.max_component_loc = contracts.uxContract.max_component_loc;
    result.min_wcag_level = contracts.uxContract.min_wcag_level;

    // Get changed files from git diff (focus on what's being modified)
    const changedFiles = await getGitDiffFiles(repoPath);
    const componentFiles = changedFiles.filter(f =>
      f.endsWith('.tsx') || f.endsWith('.jsx')
    );

    if (componentFiles.length === 0) {
      console.log('   ℹ️  No component files changed in current diff');
      return result;
    }

    // Validate each changed component against UX contract
    for (const componentPath of componentFiles) {
      const validation = await validateComponentAgainstUxContract(sdId, componentPath);

      if (validation && validation.valid === false) {
        result.valid = false;
        if (validation.violations) {
          result.violations.push(...validation.violations);
        }
      }

      // Also inherit cultural style and WCAG level from validation
      if (validation?.cultural_design_style && !result.cultural_design_style) {
        result.cultural_design_style = validation.cultural_design_style;
      }
      if (validation?.min_wcag_level && !result.min_wcag_level) {
        result.min_wcag_level = validation.min_wcag_level;
      }
    }

    // Remove duplicate violations
    const uniqueViolations = [];
    const seen = new Set();
    for (const v of result.violations) {
      const key = `${v.type}:${v.message}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueViolations.push(v);
      }
    }
    result.violations = uniqueViolations;

  } catch (error) {
    console.error(`      ❌ UX contract validation error: ${error.message}`);
    result.error = error.message;
    // Don't block on errors - just warn
    result.valid = true;
  }

  return result;
}

/**
 * Count workflow steps in a user story
 *
 * @param {Object} userStory - User story to analyze
 * @returns {number} Number of steps detected
 */
export function getStepCount(userStory) {
  if (!userStory.implementation_context) {
    return 1; // Default single step
  }

  // Count arrow-separated steps: "Step 1 → Step 2 → Step 3"
  const arrowSteps = userStory.implementation_context.split('→').length;

  // Count "then" keywords: "Click X then Y then Z"
  const thenSteps = (userStory.implementation_context.match(/\bthen\b/gi) || []).length + 1;

  // Count numbered steps: "1. X 2. Y 3. Z"
  const numberedSteps = (userStory.implementation_context.match(/\d+\./g) || []).length;

  // Return max of detected step counts
  return Math.max(arrowSteps, thenSteps, numberedSteps, 1);
}

/**
 * Parse baseline workflow from SD description
 * NOTE: For NEW feature SDs, routes in the description are TARGETS to add,
 * not existing routes. The regression detection logic in detectWorkflowIssues
 * handles this by comparing against user story targets.
 */
export function parseBaselineWorkflow(description) {
  const workflow = {
    steps: [],
    routes: []
  };

  // Extract workflow steps (simple pattern matching)
  const stepMatches = description.match(/(?:User|Customer)\s+(.+?)(?:\.|,|$)/gi);
  if (stepMatches) {
    workflow.steps = stepMatches.map(s => s.trim());
  }

  // Extract route patterns: /path-name
  const routeMatches = description.match(/\/[\w/-]+/g);
  if (routeMatches) {
    // Filter out false positives
    const filteredRoutes = routeMatches.filter(route => {
      // Exclude documentation paths
      if (/^\/docs\//i.test(route)) return false;
      if (/^\/specs\//i.test(route)) return false;

      // Exclude common false positive patterns
      const falsePositivePatterns = [
        /^\/warning/i, /^\/critical/i, /^\/paused/i, /^\/killed/i,
        /^\/hard/i, /^\/soft/i, /^\/yellow/i, /^\/red/i, /^\/green/i,
        /^\/server/i, /^\/client/i, /^\/local/i, /^\/remote/i,
        /^\/true/i, /^\/false/i, /^\/null/i, /^\/undefined/i
      ];
      if (falsePositivePatterns.some(p => p.test(route))) return false;

      // Only include routes that look like app routes
      if (!/^\/[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)*\/?$/i.test(route)) return false;

      return true;
    });

    workflow.routes = [...new Set(filteredRoutes)]; // Deduplicate
  }

  return workflow;
}
