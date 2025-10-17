#!/usr/bin/env node

/**
 * Sub-Agent Report Compression Library
 * Part of Context Management Improvements - Week 3
 *
 * Provides priority-based tiered compression for sub-agent reports
 * to reduce context usage while preserving critical information.
 *
 * Usage:
 *   import { getCompressionTier, compressSubAgentReport } from './lib/context/sub-agent-compressor.js';
 *
 *   const tier = getCompressionTier(report, currentPhase);
 *   const compressed = compressSubAgentReport(report, tier);
 */

/**
 * Compression Tiers
 */
export const COMPRESSION_TIERS = {
  TIER_1_CRITICAL: 'TIER_1_CRITICAL',           // No compression - full detail
  TIER_2_IMPORTANT: 'TIER_2_IMPORTANT',         // Structured summary
  TIER_3_INFORMATIONAL: 'TIER_3_INFORMATIONAL'  // Reference only
};

/**
 * Determine compression tier based on report status and current phase
 *
 * @param {Object} report - Sub-agent execution report
 * @param {string} currentPhase - Current SD phase (EXEC, PLAN_VERIFICATION, LEAD_APPROVAL)
 * @returns {string} Compression tier
 */
export function getCompressionTier(report, currentPhase = 'EXEC') {
  // TIER 1: Critical - Never compress
  // Always keep full detail for blocking issues or critical problems
  if (report.critical_issues?.length > 0 ||
      report.verdict === 'BLOCKED' ||
      report.verdict === 'FAIL') {
    return COMPRESSION_TIERS.TIER_1_CRITICAL;
  }

  // TIER 2: Important - Structured summary
  // Keep structured detail for warnings or phase-relevant sub-agents
  if (report.warnings?.length > 0 ||
      report.verdict === 'CONDITIONAL_PASS' ||
      isRelevantToCurrentPhase(report, currentPhase)) {
    return COMPRESSION_TIERS.TIER_2_IMPORTANT;
  }

  // TIER 3: Informational - Reference only
  // Compress to one-liner for passed reports without issues
  return COMPRESSION_TIERS.TIER_3_INFORMATIONAL;
}

/**
 * Determine if sub-agent is relevant to current phase
 *
 * @param {Object} report - Sub-agent execution report
 * @param {string} phase - Current phase
 * @returns {boolean} True if sub-agent is phase-relevant
 */
function isRelevantToCurrentPhase(report, phase) {
  const relevanceMap = {
    'EXEC': [
      'QA Engineering Director',
      'Principal Database Architect',
      'Chief Security Architect',
      'TESTING',
      'DATABASE',
      'SECURITY'
    ],
    'PLAN_VERIFICATION': 'ALL', // PLAN supervisor needs all reports
    'LEAD_APPROVAL': 'BLOCKED_OR_WARNINGS_ONLY'
  };

  const relevant = relevanceMap[phase];

  if (relevant === 'ALL') {
    return true;
  }

  if (relevant === 'BLOCKED_OR_WARNINGS_ONLY') {
    return report.verdict !== 'PASS' || report.warnings?.length > 0;
  }

  // Check if sub-agent name or code matches relevant list
  return relevant?.some(name =>
    report.agent?.includes(name) ||
    report.sub_agent_code?.includes(name)
  ) || false;
}

/**
 * Compress sub-agent report based on tier
 *
 * @param {Object} report - Full sub-agent report
 * @param {string} tier - Compression tier
 * @returns {Object} Compressed report
 */
export function compressSubAgentReport(report, tier) {
  switch (tier) {
    case COMPRESSION_TIERS.TIER_1_CRITICAL:
      return compressTier1Critical(report);

    case COMPRESSION_TIERS.TIER_2_IMPORTANT:
      return compressTier2Important(report);

    case COMPRESSION_TIERS.TIER_3_INFORMATIONAL:
      return compressTier3Informational(report);

    default:
      console.warn(`Unknown compression tier: ${tier}, using TIER_3`);
      return compressTier3Informational(report);
  }
}

/**
 * Tier 1: Critical - No compression, return full report
 */
function compressTier1Critical(report) {
  return {
    ...report,
    _compression_tier: 'TIER_1_CRITICAL',
    _compression_note: 'Full detail preserved - critical issues present'
  };
}

/**
 * Tier 2: Important - Structured summary with key findings
 */
function compressTier2Important(report) {
  return {
    agent: report.agent || report.sub_agent_code,
    verdict: report.verdict,
    confidence: report.confidence,

    // Keep all critical issues (full detail)
    critical_issues: report.critical_issues || [],

    // Keep warnings with key fields
    warnings: (report.warnings || []).map(w => ({
      issue: w.issue || w.description,
      severity: w.severity,
      recommendation: w.recommendation || w.action,
      location: w.location || w.file_path
    })),

    // Keep top 5 recommendations
    recommendations: (report.recommendations || []).slice(0, 5),

    // Key metrics only
    key_metrics: extractKeyMetrics(report),

    // Reference to full report
    full_report_id: report.id,

    _compression_tier: 'TIER_2_IMPORTANT',
    _compression_note: 'Structured summary - full report available via ID'
  };
}

/**
 * Tier 3: Informational - Reference only with one-line summary
 */
function compressTier3Informational(report) {
  return {
    agent: report.agent || report.sub_agent_code,
    verdict: report.verdict,
    confidence: report.confidence,

    // One-line summary
    summary: generateOneLinerSummary(report),

    // Only the most critical metrics
    key_metrics: extractKeyMetrics(report),

    // Reference to full report
    full_report_id: report.id,

    _compression_tier: 'TIER_3_INFORMATIONAL',
    _compression_note: 'Compressed to summary - retrieve full report if needed'
  };
}

/**
 * Generate intelligent one-line summary based on report type
 *
 * @param {Object} report - Sub-agent report
 * @returns {string} One-line summary
 */
function generateOneLinerSummary(report) {
  // QA Director pattern
  if (report.tests_passed !== undefined && report.tests_total !== undefined) {
    return `${report.tests_passed}/${report.tests_total} tests passed. No blockers identified.`;
  }

  // Database Architect pattern
  if (report.tables_validated !== undefined) {
    return `${report.tables_validated} tables validated. Schema compliant.`;
  }

  // Security Architect pattern
  if (report.vulnerabilities !== undefined) {
    return `Security scan complete. ${report.vulnerabilities} vulnerabilities found (${report.critical_vulnerabilities || 0} critical).`;
  }

  // Performance Lead pattern
  if (report.load_time !== undefined) {
    return `Performance: ${report.load_time}ms load time. Within acceptable range.`;
  }

  // Generic pattern
  const confidence = report.confidence || 0;
  const issueCount = (report.critical_issues?.length || 0) + (report.warnings?.length || 0);

  if (issueCount === 0) {
    return `${report.verdict} with ${confidence}% confidence. No issues identified.`;
  } else {
    return `${report.verdict} with ${issueCount} issue(s) noted.`;
  }
}

/**
 * Extract only the most important metrics from report
 *
 * @param {Object} report - Sub-agent report
 * @returns {Object} Key metrics
 */
function extractKeyMetrics(report) {
  const metrics = {};

  // Common metrics
  if (report.execution_time !== undefined) {
    metrics.execution_time = report.execution_time;
  }

  if (report.confidence !== undefined) {
    metrics.confidence = report.confidence;
  }

  // QA metrics
  if (report.tests_passed !== undefined) {
    metrics.tests_passed = report.tests_passed;
    metrics.tests_total = report.tests_total;
  }

  if (report.coverage !== undefined) {
    metrics.coverage = report.coverage;
  }

  // Database metrics
  if (report.tables_validated !== undefined) {
    metrics.tables_validated = report.tables_validated;
  }

  // Security metrics
  if (report.vulnerabilities !== undefined) {
    metrics.vulnerabilities = report.vulnerabilities;
    metrics.critical_vulnerabilities = report.critical_vulnerabilities || 0;
  }

  // Performance metrics
  if (report.load_time !== undefined) {
    metrics.load_time = report.load_time;
  }

  if (report.response_time !== undefined) {
    metrics.response_time = report.response_time;
  }

  return metrics;
}

/**
 * Calculate token savings from compression
 *
 * @param {Object} original - Original report
 * @param {Object} compressed - Compressed report
 * @returns {Object} Savings statistics
 */
export function calculateTokenSavings(original, compressed) {
  const originalStr = JSON.stringify(original, null, 2);
  const compressedStr = JSON.stringify(compressed, null, 2);

  const originalTokens = Math.ceil(originalStr.length / 4);
  const compressedTokens = Math.ceil(compressedStr.length / 4);
  const saved = originalTokens - compressedTokens;
  const percentage = Math.round((saved / originalTokens) * 100);

  return {
    original_tokens: originalTokens,
    compressed_tokens: compressedTokens,
    tokens_saved: saved,
    percentage_saved: percentage,
    compression_ratio: `${compressedTokens}:${originalTokens}`
  };
}

/**
 * Compress multiple sub-agent reports
 *
 * @param {Array} reports - Array of sub-agent reports
 * @param {string} currentPhase - Current SD phase
 * @returns {Object} Compressed reports with statistics
 */
export function compressBatch(reports, currentPhase = 'EXEC') {
  const compressed = [];
  let totalOriginal = 0;
  let totalCompressed = 0;

  for (const report of reports) {
    const tier = getCompressionTier(report, currentPhase);
    const compressedReport = compressSubAgentReport(report, tier);

    const savings = calculateTokenSavings(report, compressedReport);
    totalOriginal += savings.original_tokens;
    totalCompressed += savings.compressed_tokens;

    compressed.push(compressedReport);
  }

  return {
    compressed_reports: compressed,
    statistics: {
      total_reports: reports.length,
      original_tokens: totalOriginal,
      compressed_tokens: totalCompressed,
      tokens_saved: totalOriginal - totalCompressed,
      percentage_saved: Math.round(((totalOriginal - totalCompressed) / totalOriginal) * 100)
    }
  };
}

export default {
  COMPRESSION_TIERS,
  getCompressionTier,
  compressSubAgentReport,
  calculateTokenSavings,
  compressBatch
};
