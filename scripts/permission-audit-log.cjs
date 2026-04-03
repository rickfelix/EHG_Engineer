#!/usr/bin/env node
/**
 * permission-audit-log.cjs
 * CLI script for querying the permission_audit_log table.
 * SD: SD-LEO-INFRA-LEO-PRIMITIVE-PARITY-001-C
 *
 * Usage:
 *   node scripts/permission-audit-log.cjs [options]
 *
 * Options:
 *   --session <id>      Filter by session_id
 *   --since <datetime>  Filter created_at >= <datetime> (ISO 8601)
 *   --outcome <value>   Filter by outcome: allow | block | override | warn
 *   --rule <code>       Filter by rule_code
 *   --limit <n>         Max results (default: 20)
 *   --help              Show this help message
 *
 * Examples:
 *   node scripts/permission-audit-log.cjs --session abc123
 *   node scripts/permission-audit-log.cjs --since 2026-04-03T00:00:00Z --outcome block
 *   node scripts/permission-audit-log.cjs --rule NC-006 --limit 50
 */

'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// --- Argument parsing ---
const args = process.argv.slice(2);

function getArg(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1) return null;
  return args[idx + 1] || null;
}

function hasFlag(flag) {
  return args.includes(flag);
}

if (hasFlag('--help') || hasFlag('-h')) {
  console.log(`
permission-audit-log.cjs — Query the LEO permission audit log

Usage:
  node scripts/permission-audit-log.cjs [options]

Options:
  --session <id>      Filter by session_id
  --since <datetime>  Filter created_at >= <datetime> (ISO 8601)
  --outcome <value>   Filter by outcome: allow | block | override | warn
  --rule <code>       Filter by rule_code
  --limit <n>         Max results (default: 20)
  --help              Show this help

Examples:
  node scripts/permission-audit-log.cjs --session abc123
  node scripts/permission-audit-log.cjs --since 2026-04-03T00:00:00Z --outcome block
  node scripts/permission-audit-log.cjs --rule NC-006 --limit 50
`);
  process.exit(0);
}

const sessionFilter = getArg('--session');
const sinceFilter = getArg('--since');
const outcomeFilter = getArg('--outcome');
const ruleFilter = getArg('--rule');
const limitStr = getArg('--limit');
const limit = limitStr ? parseInt(limitStr, 10) : 20;

// Validate outcome if provided
const VALID_OUTCOMES = ['allow', 'block', 'override', 'warn'];
if (outcomeFilter && !VALID_OUTCOMES.includes(outcomeFilter)) {
  console.error('Error: --outcome must be one of: ' + VALID_OUTCOMES.join(', '));
  process.exit(1);
}

// Validate limit
if (isNaN(limit) || limit < 1) {
  console.error('Error: --limit must be a positive integer');
  process.exit(1);
}

// --- Supabase client ---
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

// --- Query execution ---
async function main() {
  let query = supabase
    .from('permission_audit_log')
    .select('created_at, session_id, tool_name, rule_code, rule_description, outcome, context_hash, metadata')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (sessionFilter) {
    query = query.eq('session_id', sessionFilter);
  }
  if (sinceFilter) {
    query = query.gte('created_at', sinceFilter);
  }
  if (outcomeFilter) {
    query = query.eq('outcome', outcomeFilter);
  }
  if (ruleFilter) {
    query = query.eq('rule_code', ruleFilter);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Query error:', error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('No results found.');
    process.exit(0);
  }

  // --- Formatted output ---
  console.log('\nPermission Audit Log');
  console.log('='.repeat(100));

  // Print applied filters
  const filters = [];
  if (sessionFilter) filters.push('session=' + sessionFilter);
  if (sinceFilter) filters.push('since=' + sinceFilter);
  if (outcomeFilter) filters.push('outcome=' + outcomeFilter);
  if (ruleFilter) filters.push('rule=' + ruleFilter);
  if (filters.length > 0) {
    console.log('Filters: ' + filters.join(', '));
  }
  console.log('Results: ' + data.length + ' row(s) (limit: ' + limit + ')');
  console.log('='.repeat(100));

  // Column widths
  const COL_TS = 24;
  const COL_SESSION = 28;
  const COL_TOOL = 28;
  const COL_RULE = 30;
  const COL_OUTCOME = 10;

  function pad(str, len) {
    const s = String(str || '').slice(0, len);
    return s + ' '.repeat(Math.max(0, len - s.length));
  }

  // Header
  console.log(
    pad('created_at', COL_TS) + ' | ' +
    pad('session_id', COL_SESSION) + ' | ' +
    pad('tool_name', COL_TOOL) + ' | ' +
    pad('rule_code', COL_RULE) + ' | ' +
    pad('outcome', COL_OUTCOME)
  );
  console.log('-'.repeat(COL_TS + COL_SESSION + COL_TOOL + COL_RULE + COL_OUTCOME + 12));

  // Rows
  for (const row of data) {
    const ts = row.created_at ? new Date(row.created_at).toISOString().replace('T', ' ').slice(0, 23) : '';
    console.log(
      pad(ts, COL_TS) + ' | ' +
      pad(row.session_id, COL_SESSION) + ' | ' +
      pad(row.tool_name, COL_TOOL) + ' | ' +
      pad(row.rule_code, COL_RULE) + ' | ' +
      pad(row.outcome, COL_OUTCOME)
    );

    // Show rule_description if present
    if (row.rule_description) {
      console.log('  desc: ' + row.rule_description);
    }
  }

  console.log('='.repeat(100));
  console.log('');
}

main().catch(err => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
