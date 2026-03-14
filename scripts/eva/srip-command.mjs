#!/usr/bin/env node
/**
 * EVA SRIP Command - Site Replication Intelligence Protocol
 * SD: SD-MAN-ORCH-SRIP-CLONER-INTEGRATION-001-A
 *
 * CLI entry point for the SRIP pipeline modules.
 * Follows EVA module patterns (vision-command.mjs, archplan-command.mjs).
 *
 * Subcommands:
 *   audit     --url <url> [--screenshot <path>] [--venture-id <id>]
 *             Run Forensic Audit on a reference site, extract Site DNA
 *
 *   interview --site-dna-id <id> [--venture-id <id>]
 *             Run Brand Interview (pre-populates from venture data)
 *
 *   synthesize --site-dna-id <id> --brand-interview-id <id>
 *              Generate one-shot replication prompt from DNA + brand
 *
 *   check     --synthesis-prompt-id <id>
 *             Run Quality Check against built output
 *
 *   list      [--venture-id <id>] [--type <site_dna|interviews|prompts|checks>]
 *             List SRIP artifacts
 *
 * Usage:
 *   node scripts/eva/srip-command.mjs audit --url https://example.com --venture-id <uuid>
 *   node scripts/eva/srip-command.mjs interview --site-dna-id <uuid>
 *   node scripts/eva/srip-command.mjs list --venture-id <uuid>
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// Argument parsing
// ============================================================================

function parseArgs(argv) {
  const args = argv.slice(2);
  const subcommand = args[0];
  const opts = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      opts[key] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    }
  }
  return { subcommand, opts };
}

// ============================================================================
// Supabase client
// ============================================================================

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// ============================================================================
// Subcommand: list
// ============================================================================

async function handleList(opts) {
  const supabase = getSupabase();
  const ventureId = opts.ventureId;
  const type = opts.type || 'all';

  const tables = {
    site_dna: 'srip_site_dna',
    interviews: 'srip_brand_interviews',
    prompts: 'srip_synthesis_prompts',
    checks: 'srip_quality_checks',
  };

  const tablesToQuery = type === 'all' ? Object.entries(tables) : [[type, tables[type]]];

  for (const [label, table] of tablesToQuery) {
    if (!table) {
      console.error(`Unknown type: ${type}. Valid: site_dna, interviews, prompts, checks`);
      continue;
    }

    const cols = table === 'srip_quality_checks' ? 'id, venture_id, overall_score, created_at' : 'id, venture_id, status, created_at';
    let query = supabase.from(table).select(cols).order('created_at', { ascending: false }).limit(10);
    if (ventureId) query = query.eq('venture_id', ventureId);

    const { data, error } = await query;
    if (error) {
      console.error(`Error querying ${table}:`, error.message);
      continue;
    }

    console.log(`\n=== ${label.toUpperCase()} (${data?.length || 0} records) ===`);
    if (data && data.length > 0) {
      for (const row of data) {
        const statusOrScore = row.status || (row.overall_score !== undefined ? `score: ${row.overall_score}` : 'N/A');
        console.log(`  ${row.id} | venture: ${row.venture_id || 'N/A'} | ${statusOrScore} | ${new Date(row.created_at).toLocaleDateString()}`);
      }
    } else {
      console.log('  (no records)');
    }
  }
}

// ============================================================================
// Subcommand: audit
// ============================================================================

async function handleAudit(opts) {
  if (!opts.url) {
    console.error('Error: --url is required for audit subcommand');
    process.exit(1);
  }
  const { runForensicAudit } = await import('./srip/forensic-audit.mjs');
  await runForensicAudit({
    url: opts.url,
    screenshot: opts.screenshot || null,
    ventureId: opts.ventureId || null,
  });
}

// ============================================================================
// Subcommand: interview (placeholder - implemented in Child C)
// ============================================================================

async function handleInterview(opts) {
  if (!opts.siteDnaId) {
    console.error('Error: --site-dna-id is required for interview subcommand');
    process.exit(1);
  }
  console.log(`\n📝 SRIP Brand Interview`);
  console.log(`   Site DNA: ${opts.siteDnaId}`);
  console.log(`   Venture: ${opts.ventureId || 'auto-detect from site_dna'}`);
  console.log(`\n   ⚠️  Brand Interview module not yet implemented.`);
  console.log(`   This will be implemented in SD-MAN-ORCH-SRIP-CLONER-INTEGRATION-001-C.`);
}

// ============================================================================
// Subcommand: synthesize (placeholder - implemented in Child C)
// ============================================================================

async function handleSynthesize(opts) {
  if (!opts.siteDnaId || !opts.brandInterviewId) {
    console.error('Error: --site-dna-id and --brand-interview-id are required');
    process.exit(1);
  }
  console.log(`\n🔄 SRIP Synthesis`);
  console.log(`   Site DNA: ${opts.siteDnaId}`);
  console.log(`   Brand Interview: ${opts.brandInterviewId}`);
  console.log(`\n   ⚠️  Synthesis module not yet implemented.`);
  console.log(`   This will be implemented in SD-MAN-ORCH-SRIP-CLONER-INTEGRATION-001-C.`);
}

// ============================================================================
// Subcommand: check (SD-MAN-ORCH-SRIP-CLONER-INTEGRATION-001-D)
// ============================================================================

async function handleCheck(opts) {
  if (!opts.synthesisPromptId && !opts.ventureId) {
    console.error('Error: --synthesis-prompt-id or --venture-id is required for check subcommand');
    process.exit(1);
  }
  const { runQualityCheck } = await import('./srip/quality-checker.mjs');
  await runQualityCheck({
    synthesisPromptId: opts.synthesisPromptId || null,
    ventureId: opts.ventureId || null,
    builtOutputUrl: opts.url || null,
    passThreshold: opts.threshold ? Number(opts.threshold) : undefined,
  });
}

// ============================================================================
// Help
// ============================================================================

function showHelp() {
  console.log(`
SRIP - Site Replication Intelligence Protocol

Usage: node scripts/eva/srip-command.mjs <subcommand> [options]

Subcommands:
  audit       Run Forensic Audit on a reference site
              --url <url>              Reference site URL (required)
              --screenshot <path>      Manual screenshot path (optional)
              --venture-id <id>        Link to venture (optional)

  interview   Run Brand Interview
              --site-dna-id <id>       Site DNA to interview against (required)
              --venture-id <id>        Venture for data pre-population

  synthesize  Generate replication prompt
              --site-dna-id <id>       Site DNA source (required)
              --brand-interview-id <id> Brand data source (required)

  check       Run Quality Check (6-domain fidelity scoring)
              --synthesis-prompt-id <id> Prompt to validate against
              --venture-id <id>        Venture to check (uses latest DNA)
              --url <url>              Built output URL to evaluate
              --threshold <n>          Pass threshold (default: 70)

  list        List SRIP artifacts
              --venture-id <id>        Filter by venture (optional)
              --type <type>            Filter: site_dna|interviews|prompts|checks

Examples:
  node scripts/eva/srip-command.mjs audit --url https://stripe.com
  node scripts/eva/srip-command.mjs list --venture-id abc123
  node scripts/eva/srip-command.mjs list --type site_dna
`);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const { subcommand, opts } = parseArgs(process.argv);

  if (!subcommand || subcommand === 'help' || subcommand === '--help' || opts.help) {
    showHelp();
    return;
  }

  switch (subcommand) {
    case 'audit':
      await handleAudit(opts);
      break;
    case 'interview':
      await handleInterview(opts);
      break;
    case 'synthesize':
      await handleSynthesize(opts);
      break;
    case 'check':
      await handleCheck(opts);
      break;
    case 'list':
      await handleList(opts);
      break;
    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      showHelp();
      process.exit(1);
  }
}

main().catch(err => {
  console.error('SRIP command error:', err.message);
  process.exit(1);
});
