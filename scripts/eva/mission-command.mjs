#!/usr/bin/env node
/**
 * EVA Mission Command - Organizational Mission Management
 * SD: SD-EHG-ORCH-GOVERNANCE-STACK-001-A
 *
 * Manages organizational mission statements in the missions table.
 * Follows the pattern of vision-command.mjs.
 *
 * Subcommands:
 *   view    [--venture <name>]           Show active mission (default: EHG)
 *   history [--venture <name>]           List all mission versions
 *   propose --text <mission_text>        Create a draft mission revision
 *           [--venture <name>]
 *           [--proposed-by <name>]
 *
 * Usage:
 *   node scripts/eva/mission-command.mjs view
 *   node scripts/eva/mission-command.mjs history
 *   node scripts/eva/mission-command.mjs propose --text "New mission statement"
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
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  return createClient(url, key);
}

// ============================================================================
// Venture lookup (optional - defaults to NULL for no-venture queries)
// ============================================================================

async function resolveVentureId(supabase, ventureName) {
  if (!ventureName) return null;
  const { data } = await supabase
    .from('ventures')
    .select('id, name')
    .ilike('name', `%${ventureName}%`)
    .limit(1)
    .single();
  return data?.id || null;
}

// ============================================================================
// Subcommand: view
// ============================================================================

async function cmdView(supabase, opts) {
  const ventureId = await resolveVentureId(supabase, opts.venture);

  let query = supabase
    .from('missions')
    .select('id, venture_id, mission_text, version, status, approved_by, created_at')
    .eq('status', 'active');

  if (ventureId) {
    query = query.eq('venture_id', ventureId);
  }

  const { data, error } = await query.limit(1).single();

  if (error || !data) {
    console.log('\n  No active mission found.\n');
    return;
  }

  console.log('');
  console.log('  ═══════════════════════════════════════════════════════');
  console.log('  ACTIVE MISSION');
  console.log('  ═══════════════════════════════════════════════════════');
  console.log('');
  console.log(`  "${data.mission_text}"`);
  console.log('');
  console.log(`  Version:     ${data.version}`);
  console.log(`  Status:      ${data.status}`);
  console.log(`  Approved by: ${data.approved_by || 'N/A'}`);
  console.log(`  Created:     ${new Date(data.created_at).toLocaleDateString()}`);
  console.log(`  ID:          ${data.id}`);
  console.log('');
}

// ============================================================================
// Subcommand: history
// ============================================================================

async function cmdHistory(supabase, opts) {
  const ventureId = await resolveVentureId(supabase, opts.venture);

  let query = supabase
    .from('missions')
    .select('id, mission_text, version, status, proposed_by, approved_by, created_at')
    .order('version', { ascending: false });

  if (ventureId) {
    query = query.eq('venture_id', ventureId);
  }

  const { data, error } = await query;

  if (error || !data || data.length === 0) {
    console.log('\n  No mission history found.\n');
    return;
  }

  console.log('');
  console.log('  ═══════════════════════════════════════════════════════');
  console.log(`  MISSION HISTORY (${data.length} version${data.length > 1 ? 's' : ''})`);
  console.log('  ═══════════════════════════════════════════════════════');

  for (const m of data) {
    const statusIcon = m.status === 'active' ? '✅' : m.status === 'draft' ? '📝' : '📦';
    console.log('');
    console.log(`  ${statusIcon} Version ${m.version} [${m.status.toUpperCase()}]`);
    console.log(`     "${m.mission_text.substring(0, 120)}${m.mission_text.length > 120 ? '...' : ''}"`);
    console.log(`     Proposed: ${m.proposed_by || 'N/A'} | Approved: ${m.approved_by || 'N/A'} | ${new Date(m.created_at).toLocaleDateString()}`);
  }
  console.log('');
}

// ============================================================================
// Subcommand: propose
// ============================================================================

async function cmdPropose(supabase, opts) {
  const missionText = opts.text;
  if (!missionText || missionText === true) {
    console.error('Error: --text <mission_text> is required');
    process.exit(1);
  }

  const ventureId = await resolveVentureId(supabase, opts.venture);

  // Get current max version
  let versionQuery = supabase
    .from('missions')
    .select('version')
    .order('version', { ascending: false })
    .limit(1);

  if (ventureId) {
    versionQuery = versionQuery.eq('venture_id', ventureId);
  }

  const { data: versionData } = await versionQuery.single();
  const nextVersion = (versionData?.version || 0) + 1;

  const { data, error } = await supabase
    .from('missions')
    .insert({
      venture_id: ventureId,
      mission_text: missionText,
      version: nextVersion,
      status: 'draft',
      proposed_by: opts.proposedBy || 'chairman'
    })
    .select('id, version, status')
    .single();

  if (error) {
    console.error(`Error creating mission draft: ${error.message}`);
    process.exit(1);
  }

  console.log('');
  console.log('  ═══════════════════════════════════════════════════════');
  console.log('  MISSION DRAFT CREATED');
  console.log('  ═══════════════════════════════════════════════════════');
  console.log('');
  console.log(`  Version: ${data.version}`);
  console.log(`  Status:  ${data.status}`);
  console.log(`  ID:      ${data.id}`);
  console.log('');
  console.log('  To activate, update status to "active" (archives current active mission).');
  console.log('');
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const { subcommand, opts } = parseArgs(process.argv);
  const supabase = getSupabase();

  switch (subcommand) {
    case 'view':
      await cmdView(supabase, opts);
      break;
    case 'history':
      await cmdHistory(supabase, opts);
      break;
    case 'propose':
      await cmdPropose(supabase, opts);
      break;
    default:
      console.log('');
      console.log('  EVA Mission Command');
      console.log('  ───────────────────');
      console.log('  Usage:');
      console.log('    node scripts/eva/mission-command.mjs view              Show active mission');
      console.log('    node scripts/eva/mission-command.mjs history           List all versions');
      console.log('    node scripts/eva/mission-command.mjs propose --text "..."  Create draft');
      console.log('');
      console.log('  Options:');
      console.log('    --venture <name>       Filter by venture name (default: all)');
      console.log('    --proposed-by <name>   Set proposer name (default: chairman)');
      console.log('');
      process.exit(subcommand ? 1 : 0);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
