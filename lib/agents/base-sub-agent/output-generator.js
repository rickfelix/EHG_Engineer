/**
 * Output Generator Module
 * Extracted from lib/agents/base-sub-agent.js (SD-LEO-REFAC-BASE-AGENT-003)
 *
 * Responsibilities:
 * - Standard output format generation
 * - Confidence interval calculation
 * - Status and summary generation
 * - Recommendations and error handling
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';

/**
 * Get status based on score
 * @param {number} score - Score value
 * @returns {string} Status string
 */
export function getStatus(score) {
  if (score >= 90) return 'EXCELLENT';
  if (score >= 75) return 'GOOD';
  if (score >= 60) return 'ACCEPTABLE';
  if (score >= 40) return 'POOR';
  return 'CRITICAL';
}

/**
 * Generate summary based on findings
 * @param {Array} findings - Array of findings
 * @returns {string} Summary text
 */
export function generateSummary(findings) {
  const total = findings.length;
  const critical = findings.filter(f => f.severity === 'critical').length;
  const high = findings.filter(f => f.severity === 'high').length;

  if (critical > 0) {
    return `${critical} critical issues require immediate attention`;
  } else if (high > 0) {
    return `${high} high priority issues found`;
  } else if (total > 0) {
    return `${total} issues found, all manageable`;
  }
  return 'No issues found';
}

/**
 * Get impact level from severity
 * @param {string} severity - Severity level
 * @returns {string} Impact level
 */
export function getImpact(severity) {
  const impacts = {
    critical: 'CRITICAL',
    high: 'HIGH',
    medium: 'MEDIUM',
    low: 'LOW'
  };
  return impacts[severity] || 'MEDIUM';
}

/**
 * Estimate effort based on count
 * @param {number} count - Count of items
 * @returns {string} Effort estimate
 */
export function estimateEffort(count) {
  if (count <= 1) return 'TRIVIAL';
  if (count <= 5) return 'SMALL';
  if (count <= 20) return 'MEDIUM';
  return 'LARGE';
}

/**
 * Generate recommendations based on findings
 * @param {Array} findings - Array of findings
 * @returns {Array} Array of recommendations
 */
export function generateRecommendations(findings) {
  const recommendations = [];

  // Group by type and generate recommendations
  const byType = {};
  for (const finding of findings) {
    if (!byType[finding.type]) {
      byType[finding.type] = [];
    }
    byType[finding.type].push(finding);
  }

  // Create recommendations for each type
  for (const [type, typeFindings] of Object.entries(byType)) {
    if (typeFindings.length >= 3) {
      // Pattern detected
      recommendations.push({
        title: `Fix ${type} pattern`,
        description: `Found ${typeFindings.length} instances of ${type}`,
        impact: getImpact(typeFindings[0].severity),
        effort: estimateEffort(typeFindings.length)
      });
    }
  }

  return recommendations.slice(0, 5); // Top 5 recommendations
}

/**
 * Calculate confidence interval for low-confidence results
 * Uses heuristic bands for small samples, percentile bands for larger
 * @param {Array} findings - Array of findings
 * @returns {Object} Confidence interval
 */
export function calculateConfidenceInterval(findings) {
  const severityWeights = { critical: 4, high: 3, medium: 2, low: 1, info: 0.5 };
  const n = findings.length || 1;

  // Calculate severity-weighted average
  let weightedSum = 0;
  let totalWeight = 0;
  for (const finding of findings) {
    const weight = severityWeights[finding.severity] || 1;
    weightedSum += (finding.confidence || 0.5) * weight;
    totalWeight += weight;
  }
  const weightedAvg = totalWeight > 0 ? weightedSum / totalWeight : 0.5;

  // For small samples (n < 5), use heuristic bands
  if (n < 5) {
    const margin = 0.15 * (5 - n) / 4;
    return {
      lower: Math.max(0, weightedAvg - margin),
      upper: Math.min(1, weightedAvg + margin),
      center: weightedAvg,
      method: 'heuristic_small_sample',
      inputs: { n, weightedAvg, margin_factor: (5 - n) / 4 }
    };
  }

  // For n >= 5, use percentile bands
  const confidences = findings.map(f => f.confidence || 0.5);
  const sorted = [...confidences].sort((a, b) => a - b);
  const p10 = sorted[Math.floor(n * 0.1)] || sorted[0];
  const p90 = sorted[Math.floor(n * 0.9)] || sorted[n - 1];

  return {
    lower: Math.max(0, Math.min(weightedAvg, p10)),
    upper: Math.min(1, Math.max(weightedAvg, p90)),
    center: weightedAvg,
    method: 'percentile_bands',
    inputs: { n, weightedAvg, p10, p90 }
  };
}

/**
 * Generate standard output format
 * @param {Object} params - Output parameters
 * @param {string} params.agentName - Name of the agent
 * @param {number} params.score - Calculated score
 * @param {Array} params.findings - Array of findings
 * @param {Array} params.uncertainties - Array of uncertainties
 * @param {Object} params.metrics - Metrics object
 * @param {Object} params.metadata - Metadata object
 * @param {Object} params.auditResults - Optional audit results
 * @param {Array} params.rejectedHypotheses - Optional rejected hypotheses
 * @returns {Object} Standard output object
 */
export function generateStandardOutput({
  agentName,
  score,
  findings,
  uncertainties,
  metrics,
  metadata,
  auditResults = null,
  rejectedHypotheses = []
}) {
  // Group findings by severity (HIGH-CONFIDENCE only)
  const bySeverity = {
    critical: [],
    high: [],
    medium: [],
    low: [],
    info: []
  };

  for (const finding of findings) {
    if (bySeverity[finding.severity]) {
      bySeverity[finding.severity].push(finding);
    }
  }

  const output = {
    agent: agentName,
    score,
    status: getStatus(score),
    summary: generateSummary(findings),
    findings: findings,                // HIGH-CONFIDENCE only
    uncertainties: uncertainties,      // LOW-CONFIDENCE - separate array
    findingsBySeverity: bySeverity,
    metrics: metrics,
    metadata: metadata,
    recommendations: generateRecommendations(findings)
  };

  // Add audit results if available
  if (auditResults) {
    output.claim_evidence_audit = {
      passed: auditResults.passed,
      audit_score: auditResults.audit_score,
      action: auditResults.action,
      checks_run: auditResults.checks_run,
      checks_skipped: auditResults.checks_skipped,
      issues: auditResults.issues,
      rewards: auditResults.rewards
    };

    // Add confidence interval if confidence < 80%
    if (auditResults.overall_confidence !== undefined &&
        auditResults.overall_confidence < 0.80) {
      output.confidence_interval = calculateConfidenceInterval(findings);
    }

    // Add rejected hypotheses for complex tasks
    if (rejectedHypotheses?.length > 0) {
      output.rejected_hypotheses = rejectedHypotheses;
    }
  }

  return output;
}

/**
 * Handle errors and generate error output
 * @param {Error} error - Error object
 * @param {string} agentName - Name of the agent
 * @param {Object} metrics - Metrics object
 * @param {Object} metadata - Metadata object
 * @returns {Object} Error output object
 */
export function handleError(error, agentName, metrics, metadata) {
  return {
    agent: agentName,
    score: 0,
    status: 'ERROR',
    error: error.message,
    findings: [],
    findingsBySeverity: {
      critical: [],
      high: [],
      medium: [],
      low: [],
      info: []
    },
    metrics: metrics,
    metadata: metadata
  };
}

/**
 * Apply degrade policy to output
 * @param {Object} output - Output object
 * @param {Object} auditResults - Audit results
 * @returns {Object} Degraded output
 */
export function applyDegradePolicy(output, auditResults) {
  // Cap confidences at 0.7
  for (const finding of output.findings || []) {
    if (finding.confidence > 0.7) {
      finding.confidence = 0.7;
      finding.metadata = finding.metadata || {};
      finding.metadata.confidence_capped = true;
      finding.metadata.cap_reason = 'audit_degrade_policy';
    }
  }

  // Move low-confidence findings to uncertainties
  const demoted = (output.findings || []).filter(f => f.confidence < 0.5);
  output.uncertainties = output.uncertainties || [];
  output.uncertainties.push(...demoted.map(f => ({ ...f, demoted_from_findings: true })));
  output.findings = (output.findings || []).filter(f => f.confidence >= 0.5);

  // Reduce score
  const penalty = Math.max(0, 100 - auditResults.audit_score) * 0.5;
  output.score = Math.max(0, output.score - penalty);

  // Attach audit results
  output.claim_evidence_audit = auditResults;
  output.claim_evidence_audit.degraded = true;

  return output;
}

/**
 * Handle claim/evidence audit failure
 * @param {Error} error - Audit error
 * @param {string} agentName - Name of the agent
 * @param {Array} uncertainties - Array of uncertainties
 * @param {Object} metrics - Metrics object
 * @param {Object} metadata - Metadata object
 * @returns {Object} Audit failure output
 */
export function handleAuditFailure(error, agentName, uncertainties, metrics, metadata) {
  return {
    agent: agentName,
    score: 0,
    status: 'AUDIT_FAILED',
    error: error.message,
    audit_results: error.auditResults,
    findings: [],
    uncertainties: uncertainties,
    findingsBySeverity: { critical: [], high: [], medium: [], low: [], info: [] },
    metrics: metrics,
    metadata: {
      ...metadata,
      audit_failed: true,
      audit_failure_reason: error.auditResults?.action_reason
    },
    recommendations: []
  };
}

/**
 * Utility: Get source files from a directory
 * @param {string} basePath - Base path to scan
 * @param {Array} extensions - File extensions to include
 * @returns {Promise<Array>} Array of file paths
 */
export async function getSourceFiles(basePath, extensions = ['.js', '.jsx', '.ts', '.tsx']) {
  const files = [];

  async function scan(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip node_modules and hidden directories
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }

      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        files.push(fullPath);
      }
    }
  }

  await scan(basePath);
  return files;
}
