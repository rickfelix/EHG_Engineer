#!/usr/bin/env node
/**
 * Decision Audit Trail - CLI viewer for automated decisions
 * SD-MAN-GEN-CORRECTIVE-VISION-GAP-004 (V04: decision_filter_engine_escalation)
 *
 * Usage:
 *   npm run decision:audit
 *   npm run decision:audit -- --type cost_threshold --since 2026-02-01
 *   npm run decision:audit -- --sd-id SD-LEARN-FIX-001 --json
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') { args.json = true; continue; }
    if (arg === '--help' || arg === '-h') { args.help = true; continue; }
    if (arg === '--verbose' || arg === '-v') { args.verbose = true; continue; }
    if (arg.startsWith('--') && i + 1 < argv.length) {
      args[arg.slice(2)] = argv[++i];
    }
  }
  return args;
}

function showHelp() {
  console.log(`
Decision Audit Trail - View automated decision history

Usage: npm run decision:audit -- [options]

Filters:
  --type <trigger>     Filter by trigger type (cost_threshold, low_score, etc.)
  --since <date>       Show decisions from date (YYYY-MM-DD)
  --until <date>       Show decisions before date (YYYY-MM-DD)
  --sd-id <key>        Filter decisions for a specific SD
  --status <status>    Filter by decision status (approved, rejected, pending)
  --limit <n>          Max results (default: 25)

Output:
  --json               Output as JSON
  --verbose, -v        Show full decision context
  --help, -h           Show this help

Trigger Types:
  cost_threshold       Cost exceeds configured maximum
  budget_exceeded      Token budget at/over limit
  new_tech_vendor      Unapproved technology/vendor introduced
  strategic_pivot      Deviation from venture direction
  low_score            Quality/confidence below threshold
  novel_pattern        Pattern not seen in prior stages
  constraint_drift     Parameters drift from approved values
  vision_score_signal  Vision alignment score below threshold
`);
}

function formatTimestamp(ts) {
  if (!ts) return 'N/A';
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function formatDecision(d, verbose) {
  const meta = d.metadata || {};
  const triggers = meta.triggers || meta.violations || [];
  const triggerTypes = Array.isArray(triggers)
    ? triggers.map(t => t.type || t.ruleType || 'unknown')
    : [];

  const lines = [
    `  ${d.status === 'approved' ? '+' : d.status === 'rejected' ? 'x' : '?'} [${formatTimestamp(d.created_at)}] ${d.decision_type || 'decision'}`,
    `    Status: ${d.status || 'unknown'}`,
  ];

  if (triggerTypes.length > 0) {
    lines.push(`    Triggers: ${triggerTypes.join(', ')}`);
  }

  if (d.escalation_level) {
    lines.push(`    Escalation: L${d.escalation_level}`);
  }

  if (meta.sd_key || meta.sd_id) {
    lines.push(`    SD: ${meta.sd_key || meta.sd_id}`);
  }

  if (meta.reasoning) {
    lines.push(`    Reasoning: ${meta.reasoning.substring(0, 80)}${meta.reasoning.length > 80 ? '...' : ''}`);
  }

  if (verbose) {
    if (triggers.length > 0) {
      lines.push('    Trigger Details:');
      for (const t of triggers) {
        const severity = t.severity || 'unknown';
        const detail = t.details ? JSON.stringify(t.details).substring(0, 80) : '';
        lines.push(`      - ${t.type}: severity=${severity} ${detail}`);
      }
    }
    if (meta.dfe_context) {
      lines.push(`    DFE Context: ${JSON.stringify(meta.dfe_context).substring(0, 120)}`);
    }
  }

  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) { showHelp(); return; }

  let query = supabase
    .from('chairman_decisions')
    .select('id, decision_type, status, metadata, created_at, venture_id')
    .order('created_at', { ascending: false });

  if (args.status) query = query.eq('status', args.status);
  if (args.since) query = query.gte('created_at', args.since);
  if (args.until) query = query.lte('created_at', args.until);

  const limit = parseInt(args.limit) || 25;
  query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    console.error('Query error:', error.message);
    process.exit(1);
  }

  let results = data || [];

  // Post-filter by trigger type or SD key (these are in JSONB metadata)
  if (args.type) {
    results = results.filter(d => {
      const triggers = d.metadata?.triggers || d.metadata?.violations || [];
      return triggers.some(t => (t.type || t.ruleType) === args.type);
    });
  }

  if (args['sd-id']) {
    const sdKey = args['sd-id'];
    results = results.filter(d =>
      d.metadata?.sd_key === sdKey || d.metadata?.sd_id === sdKey
    );
  }

  if (args.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  // Table output
  console.log(`\n  Decision Audit Trail (${results.length} decisions)\n`);

  if (results.length === 0) {
    console.log('  No decisions found matching criteria.\n');
    return;
  }

  // Summary stats
  const approved = results.filter(d => d.status === 'approved').length;
  const rejected = results.filter(d => d.status === 'rejected').length;
  const pending = results.filter(d => d.status === 'pending').length;

  console.log(`  Summary: ${approved} approved, ${rejected} rejected, ${pending} pending\n`);

  for (const d of results) {
    console.log(formatDecision(d, args.verbose));
    console.log();
  }

  // Trigger type breakdown
  const triggerCounts = {};
  for (const d of results) {
    const triggers = d.metadata?.triggers || d.metadata?.violations || [];
    for (const t of triggers) {
      const type = t.type || t.ruleType || 'unknown';
      triggerCounts[type] = (triggerCounts[type] || 0) + 1;
    }
  }

  if (Object.keys(triggerCounts).length > 0) {
    console.log('  Trigger Type Breakdown:');
    for (const [type, count] of Object.entries(triggerCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${type.padEnd(25)} ${count}`);
    }
    console.log();
  }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
