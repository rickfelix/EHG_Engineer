#!/usr/bin/env node
/**
 * Self-Audit CLI
 * SD-LEO-SELF-IMPROVE-002B: Phase 2 - Self-Discovery Infrastructure
 *
 * CLI for running LEO self-discovery routines to detect drift,
 * orphaned rules, and other issues in the codebase.
 *
 * Usage:
 *   node scripts/self-audit.js [options]
 *
 * Options:
 *   --all               Run all registered routines (default)
 *   --routines <list>   Run specific routines (comma-separated)
 *   --mode <mode>       Discovery mode: finding, proposal, or both (default: finding)
 *   --dry-run           Don't persist findings to database
 *   --format <format>   Output format: json, table, or summary (default: table)
 *   --verbose           Enable verbose output
 *   --help              Show this help message
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  runDiscoveryRoutines,
  getGitInfo,
  routineRegistry,
  DISCOVERY_MODES
} from '../lib/self-audit/routineFramework.js';

// Import routines to register them
import '../lib/self-audit/routines/specDrift.js';
import '../lib/self-audit/routines/orphanRules.js';

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    all: true,
    routines: null,
    mode: DISCOVERY_MODES.FINDING,
    dryRun: false,
    format: 'table',
    verbose: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--all':
        options.all = true;
        break;
      case '--routines':
        options.routines = args[++i]?.split(',').map(r => r.trim());
        options.all = false;
        break;
      case '--mode':
        options.mode = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--format':
        options.format = args[++i];
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
    }
  }

  return options;
}

// Show help message
function showHelp() {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  LEO Self-Audit CLI                                               ║
║  SD-LEO-SELF-IMPROVE-002B: Self-Discovery Infrastructure          ║
╚══════════════════════════════════════════════════════════════════╝

USAGE:
  node scripts/self-audit.js [options]

OPTIONS:
  --all               Run all registered routines (default)
  --routines <list>   Run specific routines (comma-separated)
                      Available: ${routineRegistry.keys().join(', ')}
  --mode <mode>       Discovery mode (default: finding)
                      - finding: Output findings only
                      - proposal: Output improvement proposals
                      - both: Output both findings and proposals
  --dry-run           Don't persist findings to database
  --format <format>   Output format (default: table)
                      - json: JSON output
                      - table: Formatted table
                      - summary: Brief summary only
  --verbose           Enable verbose output
  --help, -h          Show this help message

EXAMPLES:
  # Run all routines
  node scripts/self-audit.js

  # Run specific routines
  node scripts/self-audit.js --routines spec_drift,orphan_rules

  # Dry run with JSON output
  node scripts/self-audit.js --dry-run --format json

  # Run in proposal mode
  node scripts/self-audit.js --mode proposal

REGISTERED ROUTINES:
`);

  for (const routine of routineRegistry.getAll()) {
    console.log(`  ${routine.key.padEnd(15)} - ${routine.name}`);
    console.log(`                  ${routine.description}`);
  }

  console.log('');
}

// Format findings as table
function formatTable(findings) {
  if (findings.length === 0) {
    console.log('\n✅ No findings detected\n');
    return;
  }

  console.log('\n┌─────────────────────────────────────────────────────────────────┐');
  console.log('│  SELF-AUDIT FINDINGS                                            │');
  console.log('├─────────────────────────────────────────────────────────────────┤');

  for (const finding of findings) {
    const severityIcon = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🟢'
    }[finding.severity] || '⚪';

    console.log(`│ ${severityIcon} ${finding.title.slice(0, 60).padEnd(60)} │`);
    console.log(`│   Routine: ${finding.routine_key.padEnd(15)} Confidence: ${(finding.confidence * 100).toFixed(0)}%`.padEnd(66) + '│');
    console.log(`│   ${finding.summary.slice(0, 62)}`.padEnd(66) + '│');
    console.log('├─────────────────────────────────────────────────────────────────┤');
  }

  console.log('└─────────────────────────────────────────────────────────────────┘\n');
}

// Format findings as summary
function formatSummary(findings) {
  const bySeverity = {
    critical: findings.filter(f => f.severity === 'critical').length,
    high: findings.filter(f => f.severity === 'high').length,
    medium: findings.filter(f => f.severity === 'medium').length,
    low: findings.filter(f => f.severity === 'low').length
  };

  const byRoutine = {};
  for (const finding of findings) {
    byRoutine[finding.routine_key] = (byRoutine[finding.routine_key] || 0) + 1;
  }

  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║  SELF-AUDIT SUMMARY                               ║');
  console.log('╠═══════════════════════════════════════════════════╣');
  console.log(`║  Total Findings: ${findings.length.toString().padEnd(32)}║`);
  console.log('║                                                   ║');
  console.log('║  By Severity:                                     ║');
  console.log(`║    🔴 Critical: ${bySeverity.critical.toString().padEnd(33)}║`);
  console.log(`║    🟠 High:     ${bySeverity.high.toString().padEnd(33)}║`);
  console.log(`║    🟡 Medium:   ${bySeverity.medium.toString().padEnd(33)}║`);
  console.log(`║    🟢 Low:      ${bySeverity.low.toString().padEnd(33)}║`);
  console.log('║                                                   ║');
  console.log('║  By Routine:                                      ║');

  for (const [routine, count] of Object.entries(byRoutine)) {
    console.log(`║    ${routine.padEnd(15)} ${count.toString().padEnd(29)}║`);
  }

  console.log('╚═══════════════════════════════════════════════════╝\n');
}

// Persist findings to database
async function persistFindings(findings, supabase) {
  if (findings.length === 0) return { inserted: 0, duplicates: 0 };

  let inserted = 0;
  let duplicates = 0;

  for (const finding of findings) {
    const { error } = await supabase
      .from('self_audit_findings')
      .insert(finding);

    if (error) {
      if (error.code === '23505') {
        // Duplicate (unique constraint violation)
        duplicates++;
      } else {
        console.error(`Error inserting finding: ${error.message}`);
      }
    } else {
      inserted++;
    }
  }

  return { inserted, duplicates };
}

// Main execution
async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  // Validate mode
  if (!Object.values(DISCOVERY_MODES).includes(options.mode)) {
    console.error(`Invalid mode: ${options.mode}`);
    console.error(`Valid modes: ${Object.values(DISCOVERY_MODES).join(', ')}`);
    process.exit(1);
  }

  // Validate format
  if (!['json', 'table', 'summary'].includes(options.format)) {
    console.error(`Invalid format: ${options.format}`);
    console.error('Valid formats: json, table, summary');
    process.exit(1);
  }

  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  LEO Self-Audit - Running Discovery Routines                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  // Get git info
  const { repoRef, commitSha } = await getGitInfo();
  console.log(`\n📍 Repository: ${repoRef}`);
  console.log(`📍 Commit: ${commitSha.slice(0, 8)}`);
  console.log(`📍 Mode: ${options.mode}`);
  console.log(`📍 Dry Run: ${options.dryRun ? 'Yes' : 'No'}`);
  console.log('');

  // Initialize Supabase
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Run routines
  const startTime = Date.now();

  const findings = await runDiscoveryRoutines({
    routines: options.routines,
    mode: options.mode,
    repoRef,
    commitSha,
    dryRun: options.dryRun
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  // Output results
  switch (options.format) {
    case 'json':
      console.log(JSON.stringify(findings, null, 2));
      break;
    case 'table':
      formatTable(findings);
      break;
    case 'summary':
      formatSummary(findings);
      break;
  }

  // Persist to database (unless dry run)
  if (!options.dryRun && findings.length > 0) {
    console.log('💾 Persisting findings to database...');
    const { inserted, duplicates } = await persistFindings(findings, supabase);
    console.log(`   Inserted: ${inserted}, Duplicates skipped: ${duplicates}`);
  }

  console.log(`\n⏱️  Completed in ${duration}s`);

  // Exit code based on severity
  const hasCritical = findings.some(f => f.severity === 'critical');
  const hasHigh = findings.some(f => f.severity === 'high');

  if (hasCritical) {
    process.exit(2);
  } else if (hasHigh) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
