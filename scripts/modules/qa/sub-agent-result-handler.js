#!/usr/bin/env node

/**
 * Sub-Agent Result Handler with Compression
 * Integrates sub-agent-compressor.js and sub-agent-retrieval.js
 *
 * Handles:
 * 1. Storing full reports in database
 * 2. Applying compression based on phase
 * 3. Returning compressed version for context
 */

import { getCompressionTier, compressSubAgentReport, calculateTokenSavings } from '../../../lib/context/sub-agent-compressor.js';

/**
 * Store sub-agent execution results with compression
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sd_id - Strategic Directive ID
 * @param {Object} fullReport - Full sub-agent report
 * @param {string} currentPhase - Current phase (EXEC, PLAN_VERIFICATION, LEAD_APPROVAL)
 * @returns {Promise<Object>} Compressed report with storage metadata
 */
export async function storeAndCompressResults(supabase, sd_id, fullReport, currentPhase = 'EXEC') {
  console.log('\n📦 Sub-Agent Result Handler - Compression Pipeline');
  console.log('─'.repeat(60));

  // 1. Prepare full report for database storage
  const fullReportRecord = {
    sd_id,
    sub_agent_code: fullReport.sub_agent_code || 'QA',
    sub_agent_name: fullReport.sub_agent_name || 'QA Engineering Director',
    verdict: fullReport.verdict,
    confidence: fullReport.confidence,
    critical_issues: fullReport.critical_issues || [],
    warnings: fullReport.warnings || [],
    recommendations: fullReport.recommendations || [],
    detailed_analysis: JSON.stringify(fullReport.phases || {}),
    execution_time: fullReport.execution_time_seconds || 0,
    metadata: {
      target_app: fullReport.targetApp,
      time_saved: fullReport.time_saved,
      summary: fullReport.summary
    }
  };

  // 2. Store full report in database
  const { data: storedReport, error: storeError } = await supabase
    .from('sub_agent_execution_results')
    .insert(fullReportRecord)
    .select()
    .single();

  if (storeError) {
    console.log(`   ❌ Database storage failed: ${storeError.message}`);
    // Continue with compression even if storage fails
  } else {
    console.log(`   ✅ Full report stored (ID: ${storedReport.id})`);
  }

  // 3. Determine compression tier
  const tier = getCompressionTier(fullReport, currentPhase);
  console.log(`   🎯 Compression tier: ${tier}`);

  // 4. Apply compression
  const compressedReport = compressSubAgentReport(fullReport, tier);

  // Add reference to full report if stored
  if (storedReport) {
    compressedReport.full_report_id = storedReport.id;
  }

  // 5. Calculate token savings
  const savings = calculateTokenSavings(fullReport, compressedReport);
  console.log(`   💰 Token savings: ${savings.tokens_saved} tokens (${savings.percentage_saved}% reduction)`);
  console.log(`   📊 Compression ratio: ${savings.compressed_tokens}:${savings.original_tokens}`);
  console.log('─'.repeat(60) + '\n');

  return {
    compressed: compressedReport,
    full_report_id: storedReport?.id,
    tier,
    savings
  };
}

/**
 * Store multiple sub-agent results with batch compression
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sd_id - Strategic Directive ID
 * @param {Array<Object>} reports - Array of full reports
 * @param {string} currentPhase - Current phase
 * @returns {Promise<Object>} Compressed reports with statistics
 */
export async function storeBatchAndCompress(supabase, sd_id, reports, currentPhase = 'EXEC') {
  console.log('\n📦 Batch Sub-Agent Result Handler');
  console.log('─'.repeat(60));
  console.log(`   Processing ${reports.length} sub-agent reports\n`);

  const results = [];
  let totalOriginalTokens = 0;
  let totalCompressedTokens = 0;

  for (const report of reports) {
    const result = await storeAndCompressResults(supabase, sd_id, report, currentPhase);
    results.push(result);
    totalOriginalTokens += result.savings.original_tokens;
    totalCompressedTokens += result.savings.compressed_tokens;
  }

  const totalSaved = totalOriginalTokens - totalCompressedTokens;
  const percentageSaved = Math.round((totalSaved / totalOriginalTokens) * 100);

  console.log('═'.repeat(60));
  console.log('📊 BATCH COMPRESSION SUMMARY');
  console.log('─'.repeat(60));
  console.log(`   Reports processed: ${reports.length}`);
  console.log(`   Original tokens: ${totalOriginalTokens}`);
  console.log(`   Compressed tokens: ${totalCompressedTokens}`);
  console.log(`   Total saved: ${totalSaved} tokens (${percentageSaved}%)`);
  console.log('═'.repeat(60) + '\n');

  return {
    compressed_reports: results.map(r => r.compressed),
    full_report_ids: results.map(r => r.full_report_id),
    statistics: {
      reports_count: reports.length,
      original_tokens: totalOriginalTokens,
      compressed_tokens: totalCompressedTokens,
      tokens_saved: totalSaved,
      percentage_saved: percentageSaved
    }
  };
}

/**
 * Generate compressed summary for handoff
 *
 * @param {Array<Object>} compressedReports - Array of compressed reports
 * @returns {string} Formatted summary for handoff
 */
export function generateHandoffSummary(compressedReports) {
  let summary = '## Sub-Agent Execution Summary\n\n';

  for (const report of compressedReports) {
    const icon = report.verdict === 'PASS' ? '✅' :
                 report.verdict === 'BLOCKED' ? '❌' :
                 report.verdict === 'CONDITIONAL_PASS' ? '⚠️' : '❓';

    summary += `${icon} **${report.agent}**: ${report.verdict} (${report.confidence}% confidence)\n`;

    if (report._compression_tier === 'TIER_1_CRITICAL') {
      // Show critical issues in full
      if (report.critical_issues?.length > 0) {
        summary += `   🔴 **Critical Issues (${report.critical_issues.length})**:\n`;
        for (const issue of report.critical_issues) {
          summary += `   - ${issue.severity}: ${issue.issue}\n`;
        }
      }
    } else if (report._compression_tier === 'TIER_2_IMPORTANT') {
      // Show warnings summary
      if (report.warnings?.length > 0) {
        summary += `   ⚠️ **Warnings**: ${report.warnings.length} issue(s) - see full report\n`;
      }
    } else {
      // Show one-liner
      summary += `   ${report.summary}\n`;
    }

    summary += `   📄 Full report: ${report.full_report_id}\n\n`;
  }

  return summary;
}

export default {
  storeAndCompressResults,
  storeBatchAndCompress,
  generateHandoffSummary
};
