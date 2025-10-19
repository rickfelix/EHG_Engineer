#!/usr/bin/env node

/**
 * Sub-Agent Report Retrieval Helper
 * Part of Context Management Improvements - Week 3
 *
 * Provides on-demand retrieval of full sub-agent reports from database
 * when compressed reports need to be expanded for detailed analysis.
 *
 * Usage:
 *   import { retrieveFullSubAgentReport, retrieveAllSubAgentReports } from './lib/context/sub-agent-retrieval.js';
 *
 *   const fullReport = await retrieveFullSubAgentReport(reportId);
 *   const allReports = await retrieveAllSubAgentReports(sdId);
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Retrieve a single full sub-agent report by ID
 *
 * @param {string} reportId - Sub-agent execution result ID
 * @returns {Promise<Object>} Full sub-agent report
 */
export async function retrieveFullSubAgentReport(reportId) {
  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .select('*')
    .eq('id', reportId)
    .single();

  if (error) {
    throw new Error(`Failed to retrieve report ${reportId}: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Report ${reportId} not found`);
  }

  return data;
}

/**
 * Retrieve all sub-agent reports for a Strategic Directive
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of sub-agent reports
 */
export async function retrieveAllSubAgentReports(sdId, options = {}) {
  const {
    orderBy = 'created_at',
    ascending = false,
    limit = null,
    subAgentCode = null
  } = options;

  let query = supabase
    .from('sub_agent_execution_results')
    .select('*')
    .eq('sd_id', sdId)
    .order(orderBy, { ascending });

  // Filter by specific sub-agent if requested
  if (subAgentCode) {
    query = query.eq('sub_agent_code', subAgentCode);
  }

  // Apply limit if specified
  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to retrieve reports for ${sdId}: ${error.message}`);
  }

  return data || [];
}

/**
 * Retrieve sub-agent reports by verdict (e.g., all BLOCKED reports)
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {string} verdict - Verdict to filter by (PASS, CONDITIONAL_PASS, BLOCKED, etc.)
 * @returns {Promise<Array>} Array of sub-agent reports matching verdict
 */
export async function retrieveReportsByVerdict(sdId, verdict) {
  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .select('*')
    .eq('sd_id', sdId)
    .eq('verdict', verdict)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to retrieve ${verdict} reports for ${sdId}: ${error.message}`);
  }

  return data || [];
}

/**
 * Retrieve sub-agent reports with critical issues
 *
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<Array>} Array of reports with critical issues
 */
export async function retrieveCriticalReports(sdId) {
  const allReports = await retrieveAllSubAgentReports(sdId);

  // Filter for reports with critical issues
  return allReports.filter(report =>
    report.critical_issues?.length > 0 ||
    report.verdict === 'BLOCKED' ||
    report.verdict === 'FAIL'
  );
}

/**
 * Retrieve sub-agent reports with warnings
 *
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<Array>} Array of reports with warnings
 */
export async function retrieveReportsWithWarnings(sdId) {
  const allReports = await retrieveAllSubAgentReports(sdId);

  // Filter for reports with warnings
  return allReports.filter(report =>
    report.warnings?.length > 0 ||
    report.verdict === 'CONDITIONAL_PASS'
  );
}

/**
 * Get summary statistics for all sub-agent reports
 *
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<Object>} Summary statistics
 */
export async function getReportStatistics(sdId) {
  const allReports = await retrieveAllSubAgentReports(sdId);

  const statistics = {
    total_reports: allReports.length,
    by_verdict: {},
    critical_count: 0,
    warnings_count: 0,
    average_confidence: 0,
    sub_agents_executed: new Set()
  };

  let totalConfidence = 0;

  for (const report of allReports) {
    // Count by verdict
    const verdict = report.verdict || 'UNKNOWN';
    statistics.by_verdict[verdict] = (statistics.by_verdict[verdict] || 0) + 1;

    // Count critical issues
    if (report.critical_issues?.length > 0) {
      statistics.critical_count++;
    }

    // Count warnings
    if (report.warnings?.length > 0) {
      statistics.warnings_count++;
    }

    // Accumulate confidence
    if (report.confidence) {
      totalConfidence += report.confidence;
    }

    // Track unique sub-agents
    if (report.sub_agent_code) {
      statistics.sub_agents_executed.add(report.sub_agent_code);
    }
  }

  // Calculate average confidence
  if (allReports.length > 0) {
    statistics.average_confidence = Math.round(totalConfidence / allReports.length);
  }

  // Convert Set to count
  statistics.unique_sub_agents = statistics.sub_agents_executed.size;
  delete statistics.sub_agents_executed;

  return statistics;
}

/**
 * Retrieve most recent report for a specific sub-agent
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {string} subAgentCode - Sub-agent code
 * @returns {Promise<Object|null>} Most recent report or null
 */
export async function retrieveLatestReportForSubAgent(sdId, subAgentCode) {
  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .select('*')
    .eq('sd_id', sdId)
    .eq('sub_agent_code', subAgentCode)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    throw new Error(`Failed to retrieve latest report for ${subAgentCode}: ${error.message}`);
  }

  return data || null;
}

/**
 * Retrieve reports for PLAN supervisor verification
 * Gets all reports with full details for comprehensive review
 *
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<Object>} Organized reports by priority
 */
export async function retrieveForPlanSupervisor(sdId) {
  const allReports = await retrieveAllSubAgentReports(sdId);

  return {
    critical: allReports.filter(r =>
      r.critical_issues?.length > 0 || r.verdict === 'BLOCKED'
    ),
    warnings: allReports.filter(r =>
      r.warnings?.length > 0 || r.verdict === 'CONDITIONAL_PASS'
    ),
    passed: allReports.filter(r =>
      r.verdict === 'PASS' && !r.warnings?.length && !r.critical_issues?.length
    ),
    all: allReports
  };
}

/**
 * Check if full report retrieval is needed
 * Based on compression tier and current context
 *
 * @param {Object} compressedReport - Compressed sub-agent report
 * @param {string} context - Current context (verification, debugging, retrospective)
 * @returns {boolean} True if full report should be retrieved
 */
export function shouldRetrieveFullReport(compressedReport, context) {
  // Always retrieve for critical issues
  if (compressedReport._compression_tier === 'TIER_1_CRITICAL') {
    return false; // Already has full detail
  }

  // Retrieve for PLAN supervisor verification
  if (context === 'plan_supervisor_verification') {
    return true;
  }

  // Retrieve for retrospective generation
  if (context === 'retrospective_generation') {
    return true;
  }

  // Retrieve for debugging
  if (context === 'debugging') {
    return true;
  }

  // Retrieve if there are warnings (TIER_2)
  if (compressedReport.warnings?.length > 0) {
    return context === 'verification';
  }

  // Don't retrieve TIER_3 unless specifically needed
  return false;
}

export default {
  retrieveFullSubAgentReport,
  retrieveAllSubAgentReports,
  retrieveReportsByVerdict,
  retrieveCriticalReports,
  retrieveReportsWithWarnings,
  getReportStatistics,
  retrieveLatestReportForSubAgent,
  retrieveForPlanSupervisor,
  shouldRetrieveFullReport
};
