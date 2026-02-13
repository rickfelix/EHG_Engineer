#!/usr/bin/env node

/**
 * eva decisions - CLI for Chairman Decision Management
 *
 * Commands:
 *   list                     List chairman decisions (default: pending)
 *   view <id>                View full decision details + venture brief
 *   approve <id>             Approve a pending decision
 *   reject <id>              Reject a pending decision
 *
 * Flags:
 *   --status <pending|approved|rejected|cancelled>   Filter by status
 *   --stage <0|10|22|25>                             Filter by stage
 *   --rationale "reason"                             Required for approve/reject
 *   --limit <n>                                      Max results (default 50)
 *   --json                                           Output as JSON
 *
 * Examples:
 *   node scripts/eva-decisions.js list
 *   node scripts/eva-decisions.js list --status approved
 *   node scripts/eva-decisions.js view abc-123
 *   node scripts/eva-decisions.js approve abc-123 --rationale "Strong market fit"
 *   node scripts/eva-decisions.js reject abc-123 --rationale "Insufficient traction"
 *
 * Part of SD-EVA-FEAT-CHAIRMAN-API-001
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// ── Argument Parsing ──────────────────────────────────────────

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

// ── Supabase Client ───────────────────────────────────────────

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    process.exit(1);
  }
  return createClient(url, key);
}

// ── Commands ──────────────────────────────────────────────────

async function listDecisions(supabase) {
  const status = getArg('status') || 'pending';
  const stage = getArg('stage');
  const limit = parseInt(getArg('limit') || '50', 10);
  const jsonOutput = hasFlag('json');

  const validStatuses = ['pending', 'approved', 'rejected', 'cancelled'];
  if (!validStatuses.includes(status)) {
    console.error(`Invalid status: ${status}. Valid: ${validStatuses.join(', ')}`);
    process.exit(2);
  }

  if (stage !== undefined) {
    const validStages = ['0', '10', '22', '25'];
    if (!validStages.includes(stage)) {
      console.error(`Invalid stage: ${stage}. Valid: ${validStages.join(', ')}`);
      process.exit(2);
    }
  }

  if (isNaN(limit) || limit < 1 || limit > 200) {
    console.error('Invalid limit. Must be 1-200.');
    process.exit(2);
  }

  let query = supabase
    .from('chairman_decisions')
    .select('id, venture_id, lifecycle_stage, status, created_at, summary, decision, health_score')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (stage !== undefined) {
    query = query.eq('lifecycle_stage', parseInt(stage, 10));
  }

  const { data, error } = await query;

  if (error) {
    console.error(`Database error: ${error.message}`);
    process.exit(1);
  }

  if (jsonOutput) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (!data || data.length === 0) {
    console.log(`\nNo ${status} decisions found.`);
    console.log('Use --status <pending|approved|rejected|cancelled> to filter.\n');
    return;
  }

  // Fetch venture names for display
  const ventureIds = [...new Set(data.map(d => d.venture_id).filter(Boolean))];
  let ventureMap = {};
  if (ventureIds.length > 0) {
    const { data: ventures } = await supabase
      .from('ventures')
      .select('id, name')
      .in('id', ventureIds);
    if (ventures) {
      ventureMap = Object.fromEntries(ventures.map(v => [v.id, v.name]));
    }
  }

  console.log(`\n  Chairman Decisions (${status.toUpperCase()})  [${data.length} result(s)]`);
  console.log('  ' + '─'.repeat(90));
  console.log('  ' + padRight('ID', 38) + padRight('Venture', 22) + padRight('Stage', 8) + padRight('Status', 12) + 'Created');
  console.log('  ' + '─'.repeat(90));

  for (const d of data) {
    const ventureName = ventureMap[d.venture_id] || d.venture_id?.substring(0, 8) || 'unknown';
    const created = new Date(d.created_at).toLocaleDateString();
    console.log(
      '  ' +
      padRight(d.id.substring(0, 36), 38) +
      padRight(truncate(ventureName, 20), 22) +
      padRight(String(d.lifecycle_stage), 8) +
      padRight(d.status, 12) +
      created
    );
    if (d.summary) {
      console.log('    ' + truncate(d.summary, 80));
    }
  }
  console.log('  ' + '─'.repeat(90));
  console.log();
}

async function viewDecision(supabase, decisionId) {
  const jsonOutput = hasFlag('json');

  if (!decisionId) {
    console.error('Usage: eva decisions view <decision-id>');
    process.exit(1);
  }

  const { data, error } = await supabase
    .from('chairman_decisions')
    .select('*')
    .eq('id', decisionId)
    .single();

  if (error || !data) {
    console.error(`Decision not found: ${decisionId}`);
    process.exit(1);
  }

  if (jsonOutput) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  // Fetch venture name
  let ventureName = 'unknown';
  if (data.venture_id) {
    const { data: venture } = await supabase
      .from('ventures')
      .select('name, description, current_lifecycle_stage')
      .eq('id', data.venture_id)
      .single();
    if (venture) ventureName = venture.name;
  }

  console.log('\n  Chairman Decision Details');
  console.log('  ' + '═'.repeat(60));
  console.log(`  ID:            ${data.id}`);
  console.log(`  Venture:       ${ventureName} (${data.venture_id || 'N/A'})`);
  console.log(`  Stage:         ${data.lifecycle_stage}`);
  console.log(`  Status:        ${data.status.toUpperCase()}`);
  console.log(`  Decision:      ${data.decision || 'N/A'}`);
  console.log(`  Health Score:  ${data.health_score || 'N/A'}`);
  console.log(`  Recommendation:${data.recommendation || 'N/A'}`);
  console.log(`  Created:       ${data.created_at}`);
  console.log(`  Updated:       ${data.updated_at || 'N/A'}`);

  if (data.rationale) {
    console.log(`  Rationale:     ${data.rationale}`);
  }
  if (data.summary) {
    console.log(`  Summary:       ${data.summary}`);
  }
  if (data.override_reason) {
    console.log(`  Override:      ${data.override_reason}`);
  }

  if (data.brief_data) {
    console.log('\n  Venture Brief');
    console.log('  ' + '─'.repeat(60));
    const b = data.brief_data;
    if (b.name) console.log(`  Name:          ${b.name}`);
    if (b.problem_statement) console.log(`  Problem:       ${truncate(b.problem_statement, 60)}`);
    if (b.solution) console.log(`  Solution:      ${truncate(b.solution, 60)}`);
    if (b.target_market) console.log(`  Market:        ${b.target_market}`);
    if (b.archetype) console.log(`  Archetype:     ${b.archetype}`);
  }

  if (data.risks_acknowledged) {
    console.log('\n  Risks Acknowledged');
    console.log('  ' + '─'.repeat(60));
    const risks = Array.isArray(data.risks_acknowledged) ? data.risks_acknowledged : [data.risks_acknowledged];
    risks.forEach((r, i) => {
      console.log(`  ${i + 1}. ${typeof r === 'string' ? r : JSON.stringify(r)}`);
    });
  }

  console.log('  ' + '═'.repeat(60));
  console.log();
}

async function approveDecision(supabase, decisionId) {
  const rationale = getArg('rationale');

  if (!decisionId) {
    console.error('Usage: eva decisions approve <decision-id> --rationale "reason"');
    process.exit(1);
  }
  if (!rationale) {
    console.error('Error: --rationale is required for approval');
    process.exit(1);
  }

  // Check current status
  const { data: existing, error: fetchErr } = await supabase
    .from('chairman_decisions')
    .select('id, status, venture_id, lifecycle_stage')
    .eq('id', decisionId)
    .single();

  if (fetchErr || !existing) {
    console.error(`Decision not found: ${decisionId}`);
    process.exit(1);
  }

  if (existing.status !== 'pending') {
    console.error(`Decision ${decisionId} is already ${existing.status.toUpperCase()}`);
    process.exit(1);
  }

  const { error } = await supabase
    .from('chairman_decisions')
    .update({
      status: 'approved',
      decision: 'proceed',
      rationale,
      updated_at: new Date().toISOString(),
    })
    .eq('id', decisionId);

  if (error) {
    console.error(`Failed to approve: ${error.message}`);
    process.exit(1);
  }

  console.log(`\n  ✅ Decision APPROVED: ${decisionId}`);
  console.log(`  Rationale: ${rationale}`);
  console.log(`  Venture: ${existing.venture_id}`);
  console.log(`  Stage: ${existing.lifecycle_stage}\n`);
}

async function rejectDecision(supabase, decisionId) {
  const rationale = getArg('rationale');

  if (!decisionId) {
    console.error('Usage: eva decisions reject <decision-id> --rationale "reason"');
    process.exit(1);
  }
  if (!rationale) {
    console.error('Error: --rationale is required for rejection');
    process.exit(1);
  }

  // Check current status
  const { data: existing, error: fetchErr } = await supabase
    .from('chairman_decisions')
    .select('id, status, venture_id, lifecycle_stage')
    .eq('id', decisionId)
    .single();

  if (fetchErr || !existing) {
    console.error(`Decision not found: ${decisionId}`);
    process.exit(1);
  }

  if (existing.status !== 'pending') {
    console.error(`Decision ${decisionId} is already ${existing.status.toUpperCase()}`);
    process.exit(1);
  }

  const { error } = await supabase
    .from('chairman_decisions')
    .update({
      status: 'rejected',
      decision: 'kill',
      rationale,
      updated_at: new Date().toISOString(),
    })
    .eq('id', decisionId);

  if (error) {
    console.error(`Failed to reject: ${error.message}`);
    process.exit(1);
  }

  console.log(`\n  ❌ Decision REJECTED: ${decisionId}`);
  console.log(`  Rationale: ${rationale}`);
  console.log(`  Venture: ${existing.venture_id}`);
  console.log(`  Stage: ${existing.lifecycle_stage}\n`);
}

// ── Helpers ───────────────────────────────────────────────────

function padRight(str, len) {
  return (str || '').padEnd(len);
}

function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen - 3) + '...' : str;
}

// ── Entry Point ───────────────────────────────────────────────

async function main() {
  const supabase = getSupabase();
  const command = process.argv[2];
  const arg = process.argv[3];

  switch (command) {
    case 'list':
      await listDecisions(supabase);
      break;
    case 'view':
      await viewDecision(supabase, arg);
      break;
    case 'approve':
      await approveDecision(supabase, arg);
      break;
    case 'reject':
      await rejectDecision(supabase, arg);
      break;
    case '--help':
    case '-h':
    case 'help':
    default:
      console.log(`
  EVA Chairman Decisions

  Usage:
    eva decisions list [--status pending] [--stage 0|10|22|25] [--limit 50]
    eva decisions view <decision-id>
    eva decisions approve <decision-id> --rationale "reason"
    eva decisions reject <decision-id> --rationale "reason"

  Flags:
    --status    Filter by: pending, approved, rejected, cancelled
    --stage     Filter by stage number: 0, 10, 22, 25
    --limit     Max results (1-200, default 50)
    --rationale Required reason for approve/reject
    --json      Output as JSON

  Examples:
    node scripts/eva-decisions.js list
    node scripts/eva-decisions.js list --status approved --stage 10
    node scripts/eva-decisions.js view abc-def-123
    node scripts/eva-decisions.js approve abc-def-123 --rationale "Strong market fit"
`);
      if (command && !['--help', '-h', 'help'].includes(command)) {
        console.error(`Unknown command: ${command}`);
        process.exit(1);
      }
      break;
  }
}

// Cross-platform entry point (Windows + Unix)
const isMain = import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;

if (isMain) {
  main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}

export { listDecisions, viewDecision, approveDecision, rejectDecision };
