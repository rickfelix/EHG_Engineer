#!/usr/bin/env node
/**
 * EVA Constitution Command - Protocol Constitution Management
 * SD: SD-EHG-ORCH-GOVERNANCE-STACK-001-B
 *
 * Manages protocol constitution rules (CONST-001 through CONST-011)
 * and constitutional amendments. Follows the EVA CLI pattern.
 *
 * Subcommands:
 *   view                             List all constitution rules
 *   rule <code>                      Show full detail for a single rule
 *   amend --code <code>              Propose a draft amendment
 *         --text <proposed_text>
 *         --rationale <reason>
 *         [--proposed-by <name>]
 *   history [--code <code>]          Show amendment history
 *
 * Usage:
 *   node scripts/eva/constitution-command.mjs view
 *   node scripts/eva/constitution-command.mjs rule CONST-001
 *   node scripts/eva/constitution-command.mjs amend --code CONST-005 --text "New text" --rationale "Why"
 *   node scripts/eva/constitution-command.mjs history
 *   node scripts/eva/constitution-command.mjs history --code CONST-001
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
  const positional = [];
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      opts[key] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    } else {
      positional.push(args[i]);
    }
  }
  return { subcommand, opts, positional };
}

// ============================================================================
// Supabase client
// ============================================================================

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  return createClient(url, key);
}

// ============================================================================
// Category icons
// ============================================================================

const CATEGORY_ICONS = {
  safety: '🛡️',
  governance: '⚖️',
  audit: '📋'
};

// ============================================================================
// Subcommand: view
// ============================================================================

async function cmdView(supabase) {
  const { data, error } = await supabase
    .from('protocol_constitution')
    .select('rule_code, rule_text, category, rationale')
    .order('rule_code');

  if (error || !data || data.length === 0) {
    console.log('\n  No constitution rules found.\n');
    return;
  }

  console.log('');
  console.log('  ═══════════════════════════════════════════════════════');
  console.log('  PROTOCOL CONSTITUTION');
  console.log(`  ═══════════════════════════════════════════════════════`);
  console.log(`  ${data.length} rules loaded`);

  for (const r of data) {
    const icon = CATEGORY_ICONS[r.category] || '📌';
    const truncated = r.rule_text.length > 90
      ? r.rule_text.substring(0, 90) + '...'
      : r.rule_text;
    console.log('');
    console.log(`  ${icon} ${r.rule_code} [${r.category.toUpperCase()}]`);
    console.log(`     ${truncated}`);
  }
  console.log('');
  console.log('  Use: constitution-command.mjs rule <CODE> for full detail');
  console.log('');
}

// ============================================================================
// Subcommand: rule
// ============================================================================

async function cmdRule(supabase, ruleCode) {
  if (!ruleCode) {
    console.error('Error: rule code required (e.g., CONST-001)');
    process.exit(1);
  }

  const code = ruleCode.toUpperCase();

  const { data, error } = await supabase
    .from('protocol_constitution')
    .select('id, rule_code, rule_text, category, rationale, created_at')
    .eq('rule_code', code)
    .single();

  if (error || !data) {
    console.log(`\n  Rule ${code} not found.\n`);
    return;
  }

  const icon = CATEGORY_ICONS[data.category] || '📌';

  console.log('');
  console.log('  ═══════════════════════════════════════════════════════');
  console.log(`  ${icon} ${data.rule_code} [${data.category.toUpperCase()}]`);
  console.log('  ═══════════════════════════════════════════════════════');
  console.log('');
  console.log(`  Rule Text:`);
  console.log(`  "${data.rule_text}"`);
  console.log('');
  console.log(`  Rationale:`);
  console.log(`  ${data.rationale}`);
  console.log('');
  console.log(`  Created:  ${new Date(data.created_at).toLocaleDateString()}`);
  console.log(`  ID:       ${data.id}`);
  console.log('');
}

// ============================================================================
// Subcommand: amend
// ============================================================================

async function cmdAmend(supabase, opts) {
  const code = opts.code;
  const proposedText = opts.text;
  const rationale = opts.rationale;

  if (!code || code === true) {
    console.error('Error: --code <CONST-XXX> is required');
    process.exit(1);
  }
  if (!proposedText || proposedText === true) {
    console.error('Error: --text <proposed_text> is required');
    process.exit(1);
  }
  if (!rationale || rationale === true) {
    console.error('Error: --rationale <reason> is required');
    process.exit(1);
  }

  const ruleCode = code.toUpperCase();

  // Verify the rule exists and get original text
  const { data: existing, error: fetchErr } = await supabase
    .from('protocol_constitution')
    .select('rule_code, rule_text')
    .eq('rule_code', ruleCode)
    .single();

  if (fetchErr || !existing) {
    console.error(`Error: Rule ${ruleCode} not found in protocol_constitution`);
    process.exit(1);
  }

  // Get current max version for this rule's amendments
  const { data: versionData } = await supabase
    .from('constitutional_amendments')
    .select('version')
    .eq('rule_code', ruleCode)
    .order('version', { ascending: false })
    .limit(1);

  const nextVersion = (versionData?.[0]?.version || 0) + 1;

  // Insert draft amendment
  const { data: amendment, error: insertErr } = await supabase
    .from('constitutional_amendments')
    .insert({
      rule_code: ruleCode,
      original_text: existing.rule_text,
      proposed_text: proposedText,
      rationale,
      version: nextVersion,
      status: 'draft',
      proposed_by: opts.proposedBy || 'chairman'
    })
    .select('id, version, status')
    .single();

  if (insertErr) {
    console.error(`Error creating amendment: ${insertErr.message}`);
    process.exit(1);
  }

  console.log('');
  console.log('  ═══════════════════════════════════════════════════════');
  console.log('  AMENDMENT DRAFT CREATED');
  console.log('  ═══════════════════════════════════════════════════════');
  console.log('');
  console.log(`  Rule:     ${ruleCode}`);
  console.log(`  Version:  ${amendment.version}`);
  console.log(`  Status:   ${amendment.status}`);
  console.log(`  ID:       ${amendment.id}`);
  console.log('');
  console.log('  Original: "' + existing.rule_text.substring(0, 80) + (existing.rule_text.length > 80 ? '...' : '') + '"');
  console.log('  Proposed: "' + proposedText.substring(0, 80) + (proposedText.length > 80 ? '...' : '') + '"');
  console.log('');
  console.log('  To activate, update status to "active" and apply to protocol_constitution.');
  console.log('');
}

// ============================================================================
// Subcommand: history
// ============================================================================

async function cmdHistory(supabase, opts) {
  let query = supabase
    .from('constitutional_amendments')
    .select('id, rule_code, original_text, proposed_text, rationale, version, status, proposed_by, approved_by, created_at')
    .order('created_at', { ascending: false });

  if (opts.code) {
    query = query.eq('rule_code', opts.code.toUpperCase());
  }

  const { data, error } = await query;

  if (error || !data || data.length === 0) {
    const filter = opts.code ? ` for ${opts.code.toUpperCase()}` : '';
    console.log(`\n  No amendment history found${filter}.\n`);
    return;
  }

  const filter = opts.code ? ` — ${opts.code.toUpperCase()}` : '';
  console.log('');
  console.log('  ═══════════════════════════════════════════════════════');
  console.log(`  AMENDMENT HISTORY${filter} (${data.length} record${data.length > 1 ? 's' : ''})`);
  console.log('  ═══════════════════════════════════════════════════════');

  for (const a of data) {
    const statusIcon = a.status === 'active' ? '✅' : a.status === 'draft' ? '📝' : a.status === 'rejected' ? '❌' : '📦';
    console.log('');
    console.log(`  ${statusIcon} ${a.rule_code} v${a.version} [${a.status.toUpperCase()}]`);
    console.log(`     Proposed: "${a.proposed_text.substring(0, 100)}${a.proposed_text.length > 100 ? '...' : ''}"`);
    console.log(`     Rationale: ${a.rationale.substring(0, 100)}${a.rationale.length > 100 ? '...' : ''}`);
    console.log(`     By: ${a.proposed_by || 'N/A'} | Approved: ${a.approved_by || 'N/A'} | ${new Date(a.created_at).toLocaleDateString()}`);
  }
  console.log('');
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const { subcommand, opts, positional } = parseArgs(process.argv);
  const supabase = getSupabase();

  switch (subcommand) {
    case 'view':
      await cmdView(supabase);
      break;
    case 'rule':
      await cmdRule(supabase, positional[0] || opts.code);
      break;
    case 'amend':
      await cmdAmend(supabase, opts);
      break;
    case 'history':
      await cmdHistory(supabase, opts);
      break;
    default:
      console.log('');
      console.log('  EVA Constitution Command');
      console.log('  ───────────────────────');
      console.log('  Usage:');
      console.log('    node scripts/eva/constitution-command.mjs view                  List all rules');
      console.log('    node scripts/eva/constitution-command.mjs rule CONST-001        Show rule detail');
      console.log('    node scripts/eva/constitution-command.mjs amend --code CONST-001 --text "..." --rationale "..."');
      console.log('    node scripts/eva/constitution-command.mjs history               All amendments');
      console.log('    node scripts/eva/constitution-command.mjs history --code CONST-001');
      console.log('');
      console.log('  Options:');
      console.log('    --code <CONST-XXX>     Target rule code');
      console.log('    --text <text>          Proposed amendment text');
      console.log('    --rationale <reason>   Why the amendment is needed');
      console.log('    --proposed-by <name>   Proposer name (default: chairman)');
      console.log('');
      process.exit(subcommand ? 1 : 0);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
