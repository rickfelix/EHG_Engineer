#!/usr/bin/env node
/**
 * Strategy Objectives CLI
 *
 * CRUD operations for the strategy_objectives table.
 * Strategy objectives represent company-level strategic goals
 * that drive baseline ordering via strategy_weight.
 *
 * Usage:
 *   node scripts/strategy-objectives.js list [--status active]
 *   node scripts/strategy-objectives.js create --title "..." --horizon now [--description "..."]
 *   node scripts/strategy-objectives.js update <id> --status achieved
 *   node scripts/strategy-objectives.js delete <id>
 *   node scripts/strategy-objectives.js link-okr <id> --okr-id <uuid>
 *   node scripts/strategy-objectives.js unlink-okr <id> --okr-id <uuid>
 *   node scripts/strategy-objectives.js show <id>
 */

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import 'dotenv/config';

const supabase = createSupabaseServiceClient();

function parseArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].replace(/^--/, '').replace(/-/g, '_');
      result[key] = args[i + 1] || true;
      i++;
    }
  }
  return result;
}

async function listObjectives(flags) {
  let query = supabase
    .from('strategy_objectives')
    .select('id, title, description, time_horizon, status, health_indicator, linked_okr_ids, created_at')
    .order('time_horizon', { ascending: true })
    .order('created_at', { ascending: false });

  if (flags.status) {
    query = query.eq('status', flags.status);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('No strategy objectives found.');
    return;
  }

  const horizonOrder = { now: 1, next: 2, later: 3, eventually: 4 };
  data.sort((a, b) => (horizonOrder[a.time_horizon] || 5) - (horizonOrder[b.time_horizon] || 5));

  console.log('Strategy Objectives');
  console.log('='.repeat(80));
  console.log(
    '  Horizon'.padEnd(14) +
    'Status'.padEnd(12) +
    'Health'.padEnd(10) +
    'OKRs'.padEnd(6) +
    'Title'
  );
  console.log('-'.repeat(80));

  for (const obj of data) {
    const horizon = (obj.time_horizon || '?').toUpperCase().padEnd(12);
    const status = (obj.status || '?').padEnd(12);
    const health = (obj.health_indicator || '?').padEnd(10);
    const okrCount = String((obj.linked_okr_ids || []).length).padEnd(6);
    const title = (obj.title || '').substring(0, 40);
    console.log(`  ${horizon}${status}${health}${okrCount}${title}`);
  }

  console.log('-'.repeat(80));
  console.log(`  Total: ${data.length} objective(s)`);
}

async function createObjective(flags) {
  if (!flags.title) {
    console.error('Error: --title is required');
    process.exit(1);
  }

  const validHorizons = ['now', 'next', 'later', 'eventually'];
  const horizon = (flags.horizon || 'later').toLowerCase();
  if (!validHorizons.includes(horizon)) {
    console.error(`Error: --horizon must be one of: ${validHorizons.join(', ')}`);
    process.exit(1);
  }

  const { data, error } = await supabase
    .from('strategy_objectives')
    .insert({
      title: flags.title,
      description: flags.description || null,
      time_horizon: horizon,
      status: 'active',
      health_indicator: 'green',
    })
    .select('id, title, time_horizon, status')
    .single();

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  console.log('Strategy objective created:');
  console.log(`  ID: ${data.id}`);
  console.log(`  Title: ${data.title}`);
  console.log(`  Horizon: ${data.time_horizon}`);
  console.log(`  Status: ${data.status}`);
}

async function updateObjective(id, flags) {
  const updates = {};
  if (flags.title) updates.title = flags.title;
  if (flags.description) updates.description = flags.description;
  if (flags.horizon) updates.time_horizon = flags.horizon.toLowerCase();
  if (flags.status) updates.status = flags.status;
  if (flags.health) updates.health_indicator = flags.health;
  updates.updated_at = new Date().toISOString();

  if (Object.keys(updates).length <= 1) {
    console.error('Error: Provide at least one field to update (--title, --description, --horizon, --status, --health)');
    process.exit(1);
  }

  const { data, error } = await supabase
    .from('strategy_objectives')
    .update(updates)
    .eq('id', id)
    .select('id, title, time_horizon, status, health_indicator');

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.error(`Error: Objective ${id} not found`);
    process.exit(1);
  }

  console.log('Strategy objective updated:');
  console.log(`  ID: ${data[0].id}`);
  console.log(`  Title: ${data[0].title}`);
  console.log(`  Horizon: ${data[0].time_horizon}`);
  console.log(`  Status: ${data[0].status}`);
  console.log(`  Health: ${data[0].health_indicator}`);
}

async function deleteObjective(id) {
  const { error } = await supabase
    .from('strategy_objectives')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  console.log(`Deleted strategy objective: ${id}`);
}

async function linkOkr(id, flags) {
  if (!flags.okr_id) {
    console.error('Error: --okr-id is required');
    process.exit(1);
  }

  const { data: obj, error: fetchErr } = await supabase
    .from('strategy_objectives')
    .select('id, linked_okr_ids')
    .eq('id', id)
    .single();

  if (fetchErr || !obj) {
    console.error(`Error: Objective ${id} not found`);
    process.exit(1);
  }

  const existing = obj.linked_okr_ids || [];
  if (existing.includes(flags.okr_id)) {
    console.log(`OKR ${flags.okr_id} is already linked.`);
    return;
  }

  const { error } = await supabase
    .from('strategy_objectives')
    .update({
      linked_okr_ids: [...existing, flags.okr_id],
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  console.log(`Linked OKR ${flags.okr_id} to objective ${id}`);
  console.log(`  Total linked OKRs: ${existing.length + 1}`);
}

async function unlinkOkr(id, flags) {
  if (!flags.okr_id) {
    console.error('Error: --okr-id is required');
    process.exit(1);
  }

  const { data: obj, error: fetchErr } = await supabase
    .from('strategy_objectives')
    .select('id, linked_okr_ids')
    .eq('id', id)
    .single();

  if (fetchErr || !obj) {
    console.error(`Error: Objective ${id} not found`);
    process.exit(1);
  }

  const updated = (obj.linked_okr_ids || []).filter(oid => oid !== flags.okr_id);

  const { error } = await supabase
    .from('strategy_objectives')
    .update({
      linked_okr_ids: updated,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  console.log(`Unlinked OKR ${flags.okr_id} from objective ${id}`);
  console.log(`  Remaining linked OKRs: ${updated.length}`);
}

async function showObjective(id) {
  const { data, error } = await supabase
    .from('strategy_objectives')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    console.error(`Error: Objective ${id} not found`);
    process.exit(1);
  }

  console.log('Strategy Objective');
  console.log('='.repeat(60));
  console.log(`  ID:          ${data.id}`);
  console.log(`  Title:       ${data.title}`);
  console.log(`  Description: ${data.description || '(none)'}`);
  console.log(`  Horizon:     ${data.time_horizon}`);
  console.log(`  Status:      ${data.status}`);
  console.log(`  Health:      ${data.health_indicator || 'unknown'}`);
  console.log(`  Linked OKRs: ${(data.linked_okr_ids || []).length}`);

  if (data.linked_okr_ids && data.linked_okr_ids.length > 0) {
    for (const okrId of data.linked_okr_ids) {
      console.log(`    - ${okrId}`);
    }
  }

  console.log(`  Created:     ${data.created_at}`);
  console.log(`  Updated:     ${data.updated_at}`);
}

// CLI dispatch
const [,, command, ...rest] = process.argv;
const positionalId = rest[0] && !rest[0].startsWith('--') ? rest[0] : null;
const flags = parseArgs(rest);

switch (command) {
  case 'list':
  case 'ls':
    listObjectives(flags).catch(err => { console.error('Fatal:', err); process.exit(1); });
    break;
  case 'create':
    createObjective(flags).catch(err => { console.error('Fatal:', err); process.exit(1); });
    break;
  case 'update':
    if (!positionalId) { console.error('Usage: strategy-objectives.js update <id> --field value'); process.exit(1); }
    updateObjective(positionalId, flags).catch(err => { console.error('Fatal:', err); process.exit(1); });
    break;
  case 'delete':
    if (!positionalId) { console.error('Usage: strategy-objectives.js delete <id>'); process.exit(1); }
    deleteObjective(positionalId).catch(err => { console.error('Fatal:', err); process.exit(1); });
    break;
  case 'link-okr':
    if (!positionalId) { console.error('Usage: strategy-objectives.js link-okr <id> --okr-id <uuid>'); process.exit(1); }
    linkOkr(positionalId, flags).catch(err => { console.error('Fatal:', err); process.exit(1); });
    break;
  case 'unlink-okr':
    if (!positionalId) { console.error('Usage: strategy-objectives.js unlink-okr <id> --okr-id <uuid>'); process.exit(1); }
    unlinkOkr(positionalId, flags).catch(err => { console.error('Fatal:', err); process.exit(1); });
    break;
  case 'show':
    if (!positionalId) { console.error('Usage: strategy-objectives.js show <id>'); process.exit(1); }
    showObjective(positionalId).catch(err => { console.error('Fatal:', err); process.exit(1); });
    break;
  default:
    console.log('Strategy Objectives CLI');
    console.log('');
    console.log('  list   [--status active]                    List all objectives');
    console.log('  create --title "..." --horizon now          Create new objective');
    console.log('  update <id> --status achieved               Update objective');
    console.log('  delete <id>                                 Delete objective');
    console.log('  link-okr <id> --okr-id <uuid>              Link OKR to objective');
    console.log('  unlink-okr <id> --okr-id <uuid>            Unlink OKR from objective');
    console.log('  show <id>                                   Show objective details');
    console.log('');
    console.log('  Time horizons: now, next, later, eventually');
    console.log('  Statuses: active, draft, achieved, deprecated');
    break;
}
