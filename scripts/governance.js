#!/usr/bin/env node

/**
 * AEGIS Governance CLI
 *
 * Commands:
 * - list: List rules by constitution/severity
 * - validate: Validate context against rules
 * - violations: List violations with filters
 * - stats: Compliance statistics
 *
 * Usage:
 *   npm run governance:list [--constitution=PROTOCOL] [--severity=CRITICAL]
 *   npm run governance:validate --context='{"target_table":"ventures"}'
 *   npm run governance:violations [--status=open] [--limit=10]
 *   npm run governance:stats [--period=30]
 *
 * @module scripts/governance
 * @version 1.0.0
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment
dotenv.config();

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0];
  const options = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      options[key] = value || true;
    }
  }

  return { command, options };
}

// Create Supabase client
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error('Error: Supabase credentials not found in environment');
    process.exit(1);
  }

  return createClient(url, key);
}

// Format table output
function formatTable(data, columns) {
  if (!data || data.length === 0) {
    console.log('No data found.');
    return;
  }

  // Calculate column widths
  const widths = {};
  for (const col of columns) {
    widths[col] = col.length;
    for (const row of data) {
      const val = String(row[col] || '');
      widths[col] = Math.max(widths[col], val.length);
    }
  }

  // Print header
  const header = columns.map(c => c.padEnd(widths[c])).join(' | ');
  console.log(header);
  console.log('-'.repeat(header.length));

  // Print rows
  for (const row of data) {
    const line = columns.map(c => String(row[c] || '').padEnd(widths[c])).join(' | ');
    console.log(line);
  }
}

// ===== COMMANDS =====

/**
 * List rules command
 */
async function listRules(options) {
  const supabase = getSupabase();

  console.log('\n=== AEGIS Rules ===\n');

  let query = supabase
    .from('aegis_rules')
    .select(`
      rule_code,
      rule_name,
      category,
      severity,
      enforcement_action,
      constitution:aegis_constitutions(code)
    `)
    .eq('is_active', true)
    .order('severity')
    .order('rule_code');

  if (options.constitution) {
    // Need to join to filter by constitution code
    const { data: constData } = await supabase
      .from('aegis_constitutions')
      .select('id')
      .eq('code', options.constitution)
      .single();

    if (constData) {
      query = query.eq('constitution_id', constData.id);
    }
  }

  if (options.severity) {
    query = query.eq('severity', options.severity.toUpperCase());
  }

  if (options.category) {
    query = query.eq('category', options.category);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  // Flatten constitution code
  const rows = data.map(r => ({
    ...r,
    constitution_code: r.constitution?.code || 'N/A'
  }));

  formatTable(rows, ['constitution_code', 'rule_code', 'rule_name', 'severity', 'enforcement_action']);

  console.log(`\nTotal: ${data.length} rules`);
}

/**
 * Validate context command
 */
async function validateContext(options) {
  if (!options.context) {
    console.error('Error: --context is required');
    console.log('Usage: npm run governance:validate --context=\'{"target_table":"ventures"}\'');
    return;
  }

  let context;
  try {
    context = JSON.parse(options.context);
  } catch (_e) {
    console.error('Error: Invalid JSON in --context');
    return;
  }

  console.log('\n=== AEGIS Validation ===\n');
  console.log('Context:', JSON.stringify(context, null, 2));
  console.log();

  // Dynamically import the enforcer
  const { getAegisEnforcer } = await import('../lib/governance/aegis/index.js');
  const enforcer = getAegisEnforcer();

  const constitutionCode = options.constitution || null;

  try {
    let result;
    if (constitutionCode) {
      result = await enforcer.validate(constitutionCode, context, { recordViolations: false });
    } else {
      result = await enforcer.validateAll(context, { recordViolations: false });
    }

    console.log('Result:', result.passed ? 'PASSED' : 'FAILED');
    console.log(`Rules checked: ${result.rulesChecked || result.constitutionsChecked || 0}`);
    console.log(`Violations: ${result.violationCount || result.totalViolations || 0}`);
    console.log(`Warnings: ${result.warningCount || result.totalWarnings || 0}`);

    if (result.violations?.length > 0 || result.allViolations?.length > 0) {
      console.log('\nViolations:');
      for (const v of (result.violations || result.allViolations || [])) {
        console.log(`  [${v.severity}] ${v.rule_code}: ${v.message}`);
      }
    }

    if (result.warnings?.length > 0 || result.allWarnings?.length > 0) {
      console.log('\nWarnings:');
      for (const w of (result.warnings || result.allWarnings || [])) {
        console.log(`  [${w.severity}] ${w.rule_code}: ${w.message}`);
      }
    }
  } catch (err) {
    console.error('Validation error:', err.message);
  }
}

/**
 * List violations command
 */
async function listViolations(options) {
  const supabase = getSupabase();

  console.log('\n=== AEGIS Violations ===\n');

  let query = supabase
    .from('aegis_violations')
    .select(`
      id,
      severity,
      message,
      status,
      sd_key,
      actor_role,
      created_at,
      rule:aegis_rules(rule_code),
      constitution:aegis_constitutions(code)
    `)
    .order('created_at', { ascending: false });

  if (options.status) {
    query = query.eq('status', options.status);
  } else {
    // Default to open violations
    query = query.eq('status', 'open');
  }

  if (options.severity) {
    query = query.eq('severity', options.severity.toUpperCase());
  }

  if (options['sd-key']) {
    query = query.eq('sd_key', options['sd-key']);
  }

  const limit = parseInt(options.limit) || 20;
  query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  // Flatten nested data
  const rows = data.map(v => ({
    id: v.id.slice(0, 8) + '...',
    constitution: v.constitution?.code || 'N/A',
    rule: v.rule?.rule_code || 'N/A',
    severity: v.severity,
    status: v.status,
    sd_key: v.sd_key || '-',
    created: new Date(v.created_at).toLocaleDateString()
  }));

  formatTable(rows, ['id', 'constitution', 'rule', 'severity', 'status', 'sd_key', 'created']);

  console.log(`\nShowing ${data.length} violations (limit: ${limit})`);
}

/**
 * Statistics command
 */
async function showStats(options) {
  const supabase = getSupabase();
  const periodDays = parseInt(options.period) || 30;

  console.log('\n=== AEGIS Statistics ===\n');
  console.log(`Period: Last ${periodDays} days\n`);

  // Get constitution summary
  const { data: constitutions, error: constError } = await supabase
    .from('v_aegis_constitution_summary')
    .select('*');

  if (constError) {
    console.error('Error fetching constitution summary:', constError.message);
  } else {
    console.log('Constitution Summary:');
    formatTable(constitutions, ['code', 'enforcement_mode', 'active_rules', 'critical_rules', 'open_violations']);
    console.log();
  }

  // Get violation stats
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - periodDays);

  const { data: violations, error: violError } = await supabase
    .from('aegis_violations')
    .select('severity, status')
    .gte('created_at', startDate.toISOString());

  if (violError) {
    console.error('Error fetching violations:', violError.message);
    return;
  }

  // Count by severity
  const bySeverity = {};
  const byStatus = {};

  for (const v of violations) {
    bySeverity[v.severity] = (bySeverity[v.severity] || 0) + 1;
    byStatus[v.status] = (byStatus[v.status] || 0) + 1;
  }

  console.log('Violations by Severity:');
  for (const [sev, count] of Object.entries(bySeverity)) {
    console.log(`  ${sev}: ${count}`);
  }

  console.log('\nViolations by Status:');
  for (const [status, count] of Object.entries(byStatus)) {
    console.log(`  ${status}: ${count}`);
  }

  console.log(`\nTotal violations in period: ${violations.length}`);
}

/**
 * Show constitutions command
 */
async function listConstitutions() {
  const supabase = getSupabase();

  console.log('\n=== AEGIS Constitutions ===\n');

  const { data, error } = await supabase
    .from('aegis_constitutions')
    .select('code, name, domain, enforcement_mode, is_active, version')
    .order('code');

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  formatTable(data, ['code', 'name', 'domain', 'enforcement_mode', 'is_active', 'version']);

  console.log(`\nTotal: ${data.length} constitutions`);
}

/**
 * Main entry point
 */
async function main() {
  const { command, options } = parseArgs();

  if (!command || command === 'help') {
    console.log(`
AEGIS Governance CLI

Commands:
  list          List governance rules
  validate      Validate context against rules
  violations    List violations
  stats         Show compliance statistics
  constitutions List all constitutions

Options:
  --constitution=CODE  Filter by constitution (PROTOCOL, FOUR_OATHS, etc.)
  --severity=LEVEL     Filter by severity (CRITICAL, HIGH, MEDIUM, LOW)
  --category=CAT       Filter by category
  --status=STATUS      Filter violations by status (open, acknowledged, etc.)
  --limit=N            Limit results
  --period=DAYS        Stats period in days
  --context=JSON       JSON context for validation

Examples:
  npm run governance list --constitution=PROTOCOL
  npm run governance validate --context='{"risk_tier":"GOVERNED","auto_applicable":true}'
  npm run governance violations --status=open --limit=5
  npm run governance stats --period=7
`);
    return;
  }

  switch (command) {
    case 'list':
      await listRules(options);
      break;

    case 'validate':
      await validateContext(options);
      break;

    case 'violations':
      await listViolations(options);
      break;

    case 'stats':
      await showStats(options);
      break;

    case 'constitutions':
      await listConstitutions();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log('Run "npm run governance help" for usage');
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
