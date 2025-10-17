#!/usr/bin/env node

/**
 * Test Sub-Agent Compression on Single SD
 *
 * Measures token savings by applying compression to existing sub-agent reports
 *
 * Usage: node scripts/test-compression-on-sd.js <SD-ID> [phase]
 * Example: node scripts/test-compression-on-sd.js SD-RECONNECT-011 EXEC
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { getCompressionTier, compressSubAgentReport, calculateTokenSavings } from '../lib/context/sub-agent-compressor.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Test compression on a single SD's sub-agent reports
 */
async function testCompressionOnSD(sdId, currentPhase = 'EXEC') {
  console.log('\n' + '═'.repeat(70));
  console.log('🧪 SUB-AGENT COMPRESSION TEST');
  console.log('═'.repeat(70));
  console.log(`   SD: ${sdId}`);
  console.log(`   Phase: ${currentPhase}`);
  console.log('═'.repeat(70) + '\n');

  // 1. Query sub-agent execution results for this SD
  console.log('📊 Step 1: Querying sub-agent execution results...\n');

  const { data: reports, error: queryError } = await supabase
    .from('sub_agent_execution_results')
    .select('*')
    .eq('sd_id', sdId)
    .order('created_at', { ascending: false });

  if (queryError) {
    console.error('❌ Query error:', queryError.message);
    process.exit(1);
  }

  if (!reports || reports.length === 0) {
    console.log('⚠️  No sub-agent execution results found for this SD');
    console.log('   This could mean:');
    console.log('   1. SD has not been executed yet');
    console.log('   2. Sub-agents did not store results in database');
    console.log('   3. SD-ID is incorrect\n');

    // Try to find the SD to verify it exists
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status')
      .eq('id', sdId)
      .single();

    if (sd) {
      console.log(`✅ SD exists: ${sd.title} (${sd.status})`);
      console.log('   Recommendation: Run sub-agents first, then test compression\n');
    } else {
      console.log('❌ SD not found. Please check SD-ID.\n');
    }

    process.exit(0);
  }

  console.log(`✅ Found ${reports.length} sub-agent report(s)\n`);

  // 2. Display reports summary
  console.log('─'.repeat(70));
  console.log('📋 REPORTS SUMMARY');
  console.log('─'.repeat(70) + '\n');

  for (const report of reports) {
    console.log(`   Sub-Agent: ${report.sub_agent_name || report.sub_agent_code}`);
    console.log(`   Verdict: ${report.verdict}`);
    console.log(`   Confidence: ${report.confidence}%`);
    console.log(`   Critical Issues: ${report.critical_issues?.length || 0}`);
    console.log(`   Warnings: ${report.warnings?.length || 0}`);
    console.log(`   Created: ${new Date(report.created_at).toLocaleString()}`);
    console.log('');
  }

  // 3. Apply compression and measure savings
  console.log('─'.repeat(70));
  console.log('🗜️  COMPRESSION ANALYSIS');
  console.log('─'.repeat(70) + '\n');

  let totalOriginalTokens = 0;
  let totalCompressedTokens = 0;
  const compressionResults = [];

  for (const report of reports) {
    // Determine compression tier
    const tier = getCompressionTier(report, currentPhase);

    // Apply compression
    const compressed = compressSubAgentReport(report, tier);

    // Calculate savings
    const savings = calculateTokenSavings(report, compressed);

    totalOriginalTokens += savings.original_tokens;
    totalCompressedTokens += savings.compressed_tokens;

    compressionResults.push({
      sub_agent: report.sub_agent_name || report.sub_agent_code,
      verdict: report.verdict,
      tier,
      original_tokens: savings.original_tokens,
      compressed_tokens: savings.compressed_tokens,
      tokens_saved: savings.tokens_saved,
      percentage_saved: savings.percentage_saved,
      compressed_report: compressed
    });

    // Display individual result
    console.log(`   ${report.sub_agent_name || report.sub_agent_code}`);
    console.log(`   └─ Verdict: ${report.verdict}`);
    console.log(`   └─ Tier: ${tier}`);
    console.log(`   └─ Original: ${savings.original_tokens} tokens`);
    console.log(`   └─ Compressed: ${savings.compressed_tokens} tokens`);
    console.log(`   └─ Saved: ${savings.tokens_saved} tokens (${savings.percentage_saved}%)`);

    if (tier === 'TIER_1_CRITICAL') {
      console.log(`   └─ ⚠️  No compression (critical issues preserved)`);
    } else if (tier === 'TIER_2_IMPORTANT') {
      console.log(`   └─ 📋 Structured summary (warnings preserved)`);
    } else {
      console.log(`   └─ 📝 Reference only (one-line summary)`);
    }
    console.log('');
  }

  // 4. Calculate totals
  const totalSaved = totalOriginalTokens - totalCompressedTokens;
  const percentageSaved = totalOriginalTokens > 0
    ? Math.round((totalSaved / totalOriginalTokens) * 100)
    : 0;

  console.log('═'.repeat(70));
  console.log('📊 COMPRESSION SUMMARY');
  console.log('═'.repeat(70));
  console.log(`   Reports Analyzed: ${reports.length}`);
  console.log(`   Original Size: ${totalOriginalTokens.toLocaleString()} tokens`);
  console.log(`   Compressed Size: ${totalCompressedTokens.toLocaleString()} tokens`);
  console.log(`   Tokens Saved: ${totalSaved.toLocaleString()} tokens`);
  console.log(`   Compression Rate: ${percentageSaved}%`);
  console.log('═'.repeat(70) + '\n');

  // 5. Tier distribution
  const tierCounts = {
    TIER_1_CRITICAL: 0,
    TIER_2_IMPORTANT: 0,
    TIER_3_INFORMATIONAL: 0
  };

  for (const result of compressionResults) {
    tierCounts[result.tier]++;
  }

  console.log('─'.repeat(70));
  console.log('🎯 TIER DISTRIBUTION');
  console.log('─'.repeat(70));
  console.log(`   TIER 1 (Critical): ${tierCounts.TIER_1_CRITICAL} reports (no compression)`);
  console.log(`   TIER 2 (Important): ${tierCounts.TIER_2_IMPORTANT} reports (structured summary)`);
  console.log(`   TIER 3 (Informational): ${tierCounts.TIER_3_INFORMATIONAL} reports (reference only)`);
  console.log('─'.repeat(70) + '\n');

  // 6. Sample compressed output
  if (compressionResults.length > 0) {
    console.log('─'.repeat(70));
    console.log('📄 SAMPLE COMPRESSED OUTPUT');
    console.log('─'.repeat(70) + '\n');

    // Show first compressed report
    const sample = compressionResults[0];
    console.log(`   Sub-Agent: ${sample.sub_agent}`);
    console.log(`   Tier: ${sample.tier}`);
    console.log('');
    console.log('   Compressed Report:');
    console.log(JSON.stringify(sample.compressed_report, null, 2)
      .split('\n')
      .map(line => '   ' + line)
      .join('\n'));
    console.log('\n' + '─'.repeat(70) + '\n');
  }

  // 7. Recommendations
  console.log('─'.repeat(70));
  console.log('💡 RECOMMENDATIONS');
  console.log('─'.repeat(70));

  if (percentageSaved >= 80) {
    console.log('   ✅ Excellent compression rate (≥80%)');
    console.log('   ✅ Context savings are significant');
    console.log('   ✅ Ready for production use');
  } else if (percentageSaved >= 50) {
    console.log('   ⚠️  Good compression rate (50-79%)');
    console.log('   ℹ️  Some reports have critical issues (preserved)');
    console.log('   ✅ Working as intended');
  } else if (percentageSaved >= 20) {
    console.log('   ⚠️  Moderate compression rate (20-49%)');
    console.log('   ℹ️  Many reports have critical/warning issues');
    console.log('   ✅ Preserving important context (correct behavior)');
  } else {
    console.log('   ❗ Low compression rate (<20%)');
    console.log('   ℹ️  Most/all reports have critical issues');
    console.log('   ✅ Full context preserved (correct for critical SDs)');
  }

  console.log('─'.repeat(70) + '\n');

  return {
    sd_id: sdId,
    reports_count: reports.length,
    original_tokens: totalOriginalTokens,
    compressed_tokens: totalCompressedTokens,
    tokens_saved: totalSaved,
    percentage_saved: percentageSaved,
    tier_distribution: tierCounts,
    compression_results: compressionResults
  };
}

// CLI Execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const sdId = process.argv[2];
  const phase = process.argv[3] || 'EXEC';

  if (!sdId) {
    console.error('\n❌ Error: SD-ID required\n');
    console.log('Usage: node scripts/test-compression-on-sd.js <SD-ID> [phase]');
    console.log('Example: node scripts/test-compression-on-sd.js SD-RECONNECT-011 EXEC\n');
    console.log('Valid phases:');
    console.log('  - EXEC (default)');
    console.log('  - PLAN_VERIFICATION');
    console.log('  - LEAD_APPROVAL\n');
    process.exit(1);
  }

  testCompressionOnSD(sdId, phase)
    .then(results => {
      console.log('✅ Compression test complete!\n');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Fatal error:', error.message);
      console.error(error.stack);
      process.exit(1);
    });
}

export default testCompressionOnSD;
