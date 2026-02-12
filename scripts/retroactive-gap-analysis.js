#!/usr/bin/env node

/**
 * Retroactive Gap Analysis CLI
 *
 * Analyzes completed SDs to detect gaps between PRD scope and deliverables.
 *
 * Usage:
 *   node scripts/retroactive-gap-analysis.js --sd SD-KEY          # Single SD
 *   node scripts/retroactive-gap-analysis.js --all --limit 5      # Batch mode
 *   node scripts/retroactive-gap-analysis.js --sd SD-KEY --json   # JSON output
 *   node scripts/retroactive-gap-analysis.js --sd SD-KEY --verbose # Detailed output
 *   node scripts/retroactive-gap-analysis.js --sd SD-KEY --create-sds # Create corrective SDs
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { runGapAnalysis } from '../lib/gap-detection/index.js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    sd: null,
    all: false,
    limit: 10,
    json: false,
    verbose: false,
    createSds: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--sd': opts.sd = args[++i]; break;
      case '--all': opts.all = true; break;
      case '--limit': opts.limit = parseInt(args[++i], 10) || 10; break;
      case '--json': opts.json = true; break;
      case '--verbose': opts.verbose = true; break;
      case '--create-sds': opts.createSds = true; break;
      case '--help': case '-h': printHelp(); process.exit(0);
      default:
        if (!args[i].startsWith('--')) {
          // Positional argument - treat as SD key
          opts.sd = args[i];
        }
    }
  }

  return opts;
}

function printHelp() {
  console.log(`
Retroactive Gap Analysis - Detect gaps between PRD scope and deliverables

USAGE:
  node scripts/retroactive-gap-analysis.js --sd <SD-KEY>           Single SD analysis
  node scripts/retroactive-gap-analysis.js --all [--limit N]       Batch analysis
  node scripts/retroactive-gap-analysis.js --sd <SD-KEY> --json    JSON output
  node scripts/retroactive-gap-analysis.js --sd <SD-KEY> --verbose Detailed output
  node scripts/retroactive-gap-analysis.js --sd <SD-KEY> --create-sds Create corrective SDs

OPTIONS:
  --sd <SD-KEY>     Analyze specific SD
  --all             Analyze all completed SDs
  --limit <N>       Limit batch analysis (default: 10)
  --json            Output as JSON
  --verbose         Show detailed analysis steps
  --create-sds      Create corrective SDs for critical/high gaps
  --help, -h        Show this help
`);
}

async function analyzeSingle(sdKey, opts) {
  if (opts.verbose) {
    console.log(`\nAnalyzing ${sdKey}...`);
    console.log('─'.repeat(60));
  }

  const result = await runGapAnalysis(sdKey, {
    createCorrectiveSDs: opts.createSds,
    verbose: opts.verbose,
    analysisType: 'retroactive'
  });

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  // Table output
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Gap Analysis Report: ${sdKey}`);
  console.log(`${'═'.repeat(60)}`);

  if (result.error) {
    console.log(`  ERROR: ${result.error}`);
    return result;
  }

  console.log(`  PRD Status:    ${result.analysis_metadata.prd_status || 'unknown'}`);
  console.log(`  Requirements:  ${result.total_requirements}`);
  console.log(`  Matched:       ${result.matched_requirements}`);
  console.log(`  Coverage:      ${result.coverage_score !== null ? result.coverage_score + '%' : 'N/A (no PRD)'}`);
  console.log(`  Gaps Found:    ${result.gap_findings.length}`);
  console.log(`  Duration:      ${result.analysis_metadata.timing_ms}ms`);
  console.log(`  Files Analyzed: ${result.analysis_metadata.files_analyzed}`);
  if (result.analysis_metadata.strategy) {
    console.log(`  Strategy:      ${result.analysis_metadata.strategy}`);
  }

  if (result.gap_findings.length > 0) {
    console.log(`\n  ${'─'.repeat(56)}`);
    console.log('  GAPS:');
    console.log(`  ${'─'.repeat(56)}`);

    for (const gap of result.gap_findings) {
      const sevIcon = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' }[gap.severity] || '⚪';
      console.log(`  ${sevIcon} [${gap.severity.toUpperCase()}] ${gap.requirement_id}: ${gap.requirement.slice(0, 50)}`);
      console.log(`     Type: ${gap.gap_type} | Root Cause: ${gap.root_cause_category || 'unclassified'}`);
      console.log(`     Confidence: ${(gap.confidence * 100).toFixed(0)}%`);
      if (gap.corrective_sd_key) {
        console.log(`     Corrective SD: ${gap.corrective_sd_key}`);
      }
    }
  }

  if (result.corrective_sds_created.length > 0) {
    console.log(`\n  Corrective SDs Created: ${result.corrective_sds_created.join(', ')}`);
  }

  console.log(`${'═'.repeat(60)}\n`);
  return result;
}

async function analyzeBatch(opts) {
  // Query completed SDs
  const { data: sds, error } = await sb
    .from('strategic_directives_v2')
    .select('sd_key, title, status')
    .eq('status', 'completed')
    .order('updated_at', { ascending: false })
    .limit(opts.limit);

  if (error) {
    console.error(`Error querying SDs: ${error.message}`);
    process.exit(1);
  }

  if (!sds || sds.length === 0) {
    console.log('No completed SDs found.');
    process.exit(0);
  }

  console.log(`\nBatch Gap Analysis - ${sds.length} SDs`);
  console.log('═'.repeat(60));

  const results = [];
  for (const sd of sds) {
    if (opts.verbose) {
      console.log(`\n  Analyzing ${sd.sd_key}...`);
    } else {
      process.stdout.write(`  ${sd.sd_key}... `);
    }

    const result = await runGapAnalysis(sd.sd_key, {
      createCorrectiveSDs: opts.createSds,
      verbose: opts.verbose,
      analysisType: 'retroactive'
    });

    results.push(result);

    if (!opts.verbose) {
      const coverage = result.coverage_score !== null ? `${result.coverage_score}%` : 'N/A';
      console.log(`coverage: ${coverage}, gaps: ${result.gap_findings.length}`);
    }
  }

  if (opts.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  // Summary table
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  BATCH SUMMARY');
  console.log(`${'═'.repeat(60)}`);

  const withPrd = results.filter(r => r.coverage_score !== null);
  const withoutPrd = results.filter(r => r.coverage_score === null);
  const totalGaps = results.reduce((sum, r) => sum + r.gap_findings.length, 0);
  const avgCoverage = withPrd.length > 0
    ? Math.round(withPrd.reduce((sum, r) => sum + r.coverage_score, 0) / withPrd.length)
    : null;

  console.log(`  SDs Analyzed:     ${results.length}`);
  console.log(`  With PRD:         ${withPrd.length}`);
  console.log(`  Without PRD:      ${withoutPrd.length}`);
  console.log(`  Average Coverage: ${avgCoverage !== null ? avgCoverage + '%' : 'N/A'}`);
  console.log(`  Total Gaps:       ${totalGaps}`);

  // Root cause distribution
  const rootCauses = {};
  for (const r of results) {
    for (const gap of r.gap_findings) {
      const rc = gap.root_cause_category || 'unclassified';
      rootCauses[rc] = (rootCauses[rc] || 0) + 1;
    }
  }

  if (Object.keys(rootCauses).length > 0) {
    console.log('\n  Root Cause Distribution:');
    for (const [cause, count] of Object.entries(rootCauses).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${cause}: ${count}`);
    }
  }

  // Severity distribution
  const severities = {};
  for (const r of results) {
    for (const gap of r.gap_findings) {
      severities[gap.severity] = (severities[gap.severity] || 0) + 1;
    }
  }

  if (Object.keys(severities).length > 0) {
    console.log('\n  Severity Distribution:');
    for (const [sev, count] of Object.entries(severities).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${sev}: ${count}`);
    }
  }

  const correctiveSds = results.flatMap(r => r.corrective_sds_created);
  if (correctiveSds.length > 0) {
    console.log(`\n  Corrective SDs Created: ${correctiveSds.length}`);
    for (const sd of correctiveSds) {
      console.log(`    • ${sd}`);
    }
  }

  console.log(`${'═'.repeat(60)}\n`);
}

// Main
const opts = parseArgs();

if (!opts.sd && !opts.all) {
  console.error('Error: Specify --sd <SD-KEY> or --all');
  printHelp();
  process.exit(1);
}

try {
  if (opts.sd) {
    const result = await analyzeSingle(opts.sd, opts);
    process.exit(result.error ? 1 : 0);
  } else {
    await analyzeBatch(opts);
    process.exit(0);
  }
} catch (err) {
  console.error(`Fatal error: ${err.message}`);
  if (opts.verbose) console.error(err.stack);
  process.exit(1);
}
