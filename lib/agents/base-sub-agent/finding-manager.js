/**
 * Finding Manager Module
 * Extracted from lib/agents/base-sub-agent.js (SD-LEO-REFAC-BASE-AGENT-003)
 *
 * Responsibilities:
 * - Finding creation and management
 * - Deduplication and confidence filtering
 * - Score calculation
 */

import crypto from 'crypto';

/**
 * Default confidence thresholds
 */
export const DEFAULT_CONFIDENCE_THRESHOLDS = {
  minimum: 0.6,     // Don't report below this
  high: 0.8,        // High confidence
  certain: 0.95     // Near certain
};

/**
 * Severity weights for scoring
 */
export const SEVERITY_WEIGHTS = {
  critical: 20,
  high: 10,
  medium: 5,
  low: 1,
  info: 0
};

/**
 * Generate unique ID for a finding
 * @param {Object} finding - Finding object
 * @returns {string} Hash-based unique ID
 */
export function generateFindingId(finding) {
  const content = `${finding.type}-${finding.file}-${finding.line}-${finding.description}`;
  return crypto.createHash('md5').update(content).digest('hex').substring(0, 8);
}

/**
 * Normalize severity levels to standard values
 * @param {string} severity - Input severity
 * @returns {string} Normalized severity
 */
export function normalizeSeverity(severity) {
  const normalized = String(severity).toLowerCase();
  const mapping = {
    'critical': 'critical',
    'high': 'high',
    'medium': 'medium',
    'low': 'low',
    'info': 'info',
    'error': 'critical',
    'warning': 'medium',
    'notice': 'low'
  };
  return mapping[normalized] || 'medium';
}

/**
 * Create a standardized finding structure
 * @param {Object} finding - Raw finding data
 * @param {string} agentName - Name of the agent
 * @returns {Object} Standardized finding
 */
export function createStandardFinding(finding, agentName) {
  const id = generateFindingId(finding);

  return {
    id,
    agent: agentName,
    type: finding.type || 'UNKNOWN',
    severity: normalizeSeverity(finding.severity),
    confidence: finding.confidence || 0.7,
    location: {
      file: finding.file || null,
      line: finding.line || null,
      column: finding.column || null,
      snippet: finding.snippet || null
    },
    description: finding.description || 'No description provided',
    recommendation: finding.recommendation || null,
    metadata: finding.metadata || {},
    timestamp: new Date().toISOString()
  };
}

/**
 * Deduplicate findings by location and type
 * @param {Array} findings - Array of findings
 * @param {Object} severityWeights - Severity weight mappings
 * @returns {Array} Deduplicated findings
 */
export function deduplicateFindings(findings, severityWeights = SEVERITY_WEIGHTS) {
  const seen = new Map();
  const deduplicated = [];

  for (const finding of findings) {
    // Create dedup key
    const key = `${finding.type}-${finding.location.file}-${finding.location.line}`;

    if (seen.has(key)) {
      // Merge with existing if higher severity or confidence
      const existing = seen.get(key);
      if (finding.confidence > existing.confidence ||
          severityWeights[finding.severity] > severityWeights[existing.severity]) {
        seen.set(key, finding);
      }
    } else {
      seen.set(key, finding);
    }
  }

  // Convert back to array and group similar issues
  for (const [_key, finding] of seen) {
    // Count similar issues
    const similarCount = findings.filter(f =>
      f.type === finding.type &&
      f.location.file === finding.location.file
    ).length;

    if (similarCount > 1) {
      finding.metadata = finding.metadata || {};
      finding.metadata.occurrences = similarCount;
      finding.description = `${finding.description} (${similarCount} occurrences in file)`;
    }

    deduplicated.push(finding);
  }

  return deduplicated;
}

/**
 * Create an uncertainty report for low-confidence findings
 * @param {Object} finding - The finding
 * @param {string} reason - Reason for uncertainty
 * @param {string} agentName - Name of the agent
 * @param {number} threshold - Confidence threshold used
 * @returns {Object} Uncertainty report
 */
export function createUncertaintyReport(finding, reason, agentName, threshold) {
  return {
    id: finding.id || generateFindingId({ ...finding, type: 'UNCERTAINTY' }),
    agent: agentName,
    type: 'UNCERTAINTY_REPORT',
    original_type: finding.type,
    timestamp: new Date().toISOString(),
    original_finding: {
      type: finding.type,
      description: finding.description,
      confidence: finding.confidence,
      location: finding.location
    },
    uncertainty: {
      reason: reason,
      confidence_at_report: finding.confidence,
      threshold_used: threshold,
      gap_from_threshold: threshold - (finding.confidence || 0)
    },
    recommendation: 'Review manually - confidence below threshold',
    severity: finding.severity || 'info'
  };
}

/**
 * Filter findings by confidence threshold
 * @param {Array} findings - Array of findings
 * @param {number} threshold - Minimum confidence threshold
 * @param {string} agentName - Name of the agent
 * @returns {{passed: Array, uncertainties: Array}} Filtered results
 */
export function filterByConfidence(findings, threshold, agentName) {
  const passed = [];
  const uncertainties = [];

  for (const finding of findings) {
    if (finding.confidence >= threshold) {
      passed.push(finding);
    } else {
      // Report uncertainty instead of silent discard
      const reason = `Confidence ${finding.confidence.toFixed(2)} below threshold ${threshold}`;
      uncertainties.push(createUncertaintyReport(finding, reason, agentName, threshold));
    }
  }

  return { passed, uncertainties };
}

/**
 * Calculate score based on severity-weighted findings
 * @param {Array} findings - Array of findings
 * @param {Object} severityWeights - Severity weight mappings
 * @returns {number} Calculated score (0-100)
 */
export function calculateScore(findings, severityWeights = SEVERITY_WEIGHTS) {
  let score = 100;

  // Group findings by severity
  const bySeverity = {};
  for (const finding of findings) {
    bySeverity[finding.severity] = (bySeverity[finding.severity] || 0) + 1;
  }

  // Apply severity weights
  for (const [severity, count] of Object.entries(bySeverity)) {
    const weight = severityWeights[severity] || 0;
    score -= Math.min(count * weight, 100); // Cap at 100 points deduction
  }

  return Math.max(0, score);
}
