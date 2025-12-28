#!/usr/bin/env node
/**
 * LEO Protocol Summary Generator
 *
 * Generates compliance reports for completed Strategic Directives,
 * measuring how well the SD run followed the LEO Protocol.
 *
 * Usage:
 *   node scripts/leo-summary.mjs              # Auto-detect most recent completed SD
 *   node scripts/leo-summary.mjs SD-XXX-001   # Specific SD
 *
 * Output:
 *   - Terminal display with compliance scores
 *   - Markdown report saved to docs/summaries/compliance/
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';
import { aggregateSDData, resolveTargetSD } from './modules/leo-summary/sd-aggregator.js';
import { calculateComplianceScores } from './modules/leo-summary/compliance-scorer.js';
import { displayTerminalReport } from './modules/leo-summary/terminal-display.js';
import { generateMarkdownReport } from './modules/leo-summary/markdown-generator.js';

async function main() {
  const args = process.argv.slice(2);
  const specifiedSdId = args[0];

  console.log('\n');
  console.log('='.repeat(70));
  console.log('LEO PROTOCOL COMPLIANCE SUMMARY');
  console.log('='.repeat(70));

  try {
    // Initialize Supabase client
    const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

    // Resolve target SD (auto-detect or specified)
    console.log('\nResolving target SD...');
    const targetSD = await resolveTargetSD(supabase, specifiedSdId);

    if (!targetSD) {
      console.error('\nNo completed Strategic Directive found.');
      if (!specifiedSdId) {
        console.error('Try specifying an SD ID: node scripts/leo-summary.mjs SD-XXX-001');
      } else {
        console.error(`SD "${specifiedSdId}" not found or not completed.`);
      }
      process.exit(1);
    }

    console.log(`Target: ${targetSD.id} - ${targetSD.title}`);

    // Aggregate SD data (includes children for orchestrators)
    console.log('\nAggregating data...');
    const aggregatedData = await aggregateSDData(supabase, targetSD);

    // Calculate compliance scores
    console.log('Calculating compliance scores...');
    const scores = calculateComplianceScores(aggregatedData);

    // Display terminal report
    displayTerminalReport(targetSD, aggregatedData, scores);

    // Generate and save markdown report
    const reportPath = await generateMarkdownReport(targetSD, aggregatedData, scores);

    console.log('\n' + '='.repeat(70));
    console.log(`Report saved: ${reportPath}`);
    console.log('='.repeat(70) + '\n');

  } catch (error) {
    console.error('\nError generating LEO summary:', error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
