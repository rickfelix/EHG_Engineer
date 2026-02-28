#!/usr/bin/env node
/**
 * SD Query - CLI tool for querying strategic directives
 * SD-MAN-GEN-CORRECTIVE-VISION-GAP-004 (V06: cli_authoritative_workflow)
 *
 * Usage:
 *   npm run sd:query -- --status completed
 *   npm run sd:query -- --type fix --since 2026-02-01
 *   npm run sd:query -- --phase EXEC --json
 *   npm run sd:query -- --sd-id SD-LEARN-FIX-001
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
    if (arg.startsWith('--') && i + 1 < argv.length) {
      args[arg.slice(2)] = argv[++i];
    }
  }
  return args;
}

function showHelp() {
  console.log(`
SD Query - Query strategic directives from database

Usage: npm run sd:query -- [options]

Filters:
  --status <status>    Filter by status (draft, planning, in_progress, completed)
  --type <type>        Filter by SD type (feature, fix, infrastructure, refactor, enhancement)
  --phase <phase>      Filter by current phase (LEAD, PLAN, EXEC)
  --since <date>       Show SDs created on or after date (YYYY-MM-DD)
  --until <date>       Show SDs created before date (YYYY-MM-DD)
  --sd-id <key>        Look up specific SD by key
  --parent <key>       Show children of a parent SD
  --limit <n>          Max results (default: 20)

Output:
  --json               Output as JSON instead of table
  --help, -h           Show this help

Examples:
  npm run sd:query -- --status completed --since 2026-02-01
  npm run sd:query -- --type fix --json
  npm run sd:query -- --sd-id SD-LEARN-FIX-001
  npm run sd:query -- --parent SD-MAN-ORCH-001
`);
}

function formatTable(rows) {
  if (rows.length === 0) { console.log('  No results found.'); return; }

  const widths = {
    sd_key: Math.max(8, ...rows.map(r => (r.sd_key || '').length)),
    title: Math.min(50, Math.max(5, ...rows.map(r => (r.title || '').length))),
    status: 12,
    phase: 12,
    progress: 8,
    type: 15,
  };

  const header = [
    'SD Key'.padEnd(widths.sd_key),
    'Title'.padEnd(widths.title),
    'Status'.padEnd(widths.status),
    'Phase'.padEnd(widths.phase),
    'Prog'.padEnd(widths.progress),
    'Type'.padEnd(widths.type),
  ].join(' | ');

  const separator = '-'.repeat(header.length);

  console.log(separator);
  console.log(header);
  console.log(separator);

  for (const row of rows) {
    const title = (row.title || '').substring(0, widths.title);
    console.log([
      (row.sd_key || '').padEnd(widths.sd_key),
      title.padEnd(widths.title),
      (row.status || '').padEnd(widths.status),
      (row.current_phase || '').padEnd(widths.phase),
      (`${row.progress || 0}%`).padEnd(widths.progress),
      (row.sd_type || '').padEnd(widths.type),
    ].join(' | '));
  }

  console.log(separator);
  console.log(`  ${rows.length} result(s)`);
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) { showHelp(); return; }

  let query = supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, status, current_phase, progress, sd_type, priority, created_at, completion_date')
    .order('created_at', { ascending: false });

  // Apply filters
  if (args.status) query = query.eq('status', args.status);
  if (args.type) query = query.eq('sd_type', args.type);
  if (args.phase) query = query.ilike('current_phase', `%${args.phase}%`);
  if (args.since) query = query.gte('created_at', args.since);
  if (args.until) query = query.lte('created_at', args.until);
  if (args['sd-id']) query = query.eq('sd_key', args['sd-id']);
  if (args.parent) {
    // Find parent UUID first, then query children
    const { data: parent } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('sd_key', args.parent)
      .single();
    if (parent) query = query.eq('parent_sd_id', parent.id);
  }

  const limit = parseInt(args.limit) || 20;
  query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    console.error('Query error:', error.message);
    process.exit(1);
  }

  if (args.json) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(`\n  SD Query Results${args.status ? ` (status: ${args.status})` : ''}${args.type ? ` (type: ${args.type})` : ''}\n`);
    formatTable(data || []);
  }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
