#!/usr/bin/env node
/**
 * Strategy Objectives CRUD Operations
 *
 * CLI script to create, read, update, delete, and list strategy objectives.
 *
 * Usage:
 *   node scripts/pipeline/strategy-objectives-crud.js create --title "..." --time-horizon now [--description "..."]
 *   node scripts/pipeline/strategy-objectives-crud.js read <id>
 *   node scripts/pipeline/strategy-objectives-crud.js update <id> --status paused [--title "..."]
 *   node scripts/pipeline/strategy-objectives-crud.js delete <id>
 *   node scripts/pipeline/strategy-objectives-crud.js list [--status active]
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VALID_TIME_HORIZONS = ['now', 'next', 'later', 'eventually'];
const VALID_STATUSES = ['active', 'paused', 'completed', 'killed'];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].replace(/^--/, '').replace(/-/g, '_');
      const nextVal = argv[i + 1];
      if (nextVal && !nextVal.startsWith('--')) {
        args[key] = nextVal;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

async function createObjective(args) {
  if (!args.title) {
    console.error('Error: --title is required');
    process.exit(1);
  }
  if (!args.time_horizon || !VALID_TIME_HORIZONS.includes(args.time_horizon)) {
    console.error(`Error: --time-horizon must be one of: ${VALID_TIME_HORIZONS.join(', ')}`);
    process.exit(1);
  }

  const obj = {
    id: randomUUID(),
    title: args.title,
    description: args.description || null,
    time_horizon: args.time_horizon,
    status: args.status || 'active',
    target_capabilities: args.target_capabilities ? JSON.parse(args.target_capabilities) : null,
    success_criteria: args.success_criteria ? JSON.parse(args.success_criteria) : null,
  };

  const { data, error } = await supabase
    .from('strategy_objectives')
    .insert(obj)
    .select('id, title, time_horizon, status');

  if (error) {
    console.error('Create error:', error.message);
    process.exit(1);
  }

  console.log('Created strategy objective:');
  console.log(`  ID: ${data[0].id}`);
  console.log(`  Title: ${data[0].title}`);
  console.log(`  Time Horizon: ${data[0].time_horizon}`);
  console.log(`  Status: ${data[0].status}`);
}

async function readObjective(id) {
  if (!id) {
    console.error('Error: <id> is required');
    process.exit(1);
  }

  const { data, error } = await supabase
    .from('strategy_objectives')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Read error:', error.message);
    process.exit(1);
  }

  console.log('Strategy Objective:');
  console.log(`  ID: ${data.id}`);
  console.log(`  Title: ${data.title}`);
  console.log(`  Description: ${data.description || '(none)'}`);
  console.log(`  Time Horizon: ${data.time_horizon}`);
  console.log(`  Status: ${data.status}`);
  console.log(`  Target Capabilities: ${data.target_capabilities ? JSON.stringify(data.target_capabilities) : '(none)'}`);
  console.log(`  Success Criteria: ${data.success_criteria ? JSON.stringify(data.success_criteria) : '(none)'}`);
  console.log(`  Created: ${data.created_at}`);
  console.log(`  Updated: ${data.updated_at}`);
}

async function updateObjective(id, args) {
  if (!id) {
    console.error('Error: <id> is required');
    process.exit(1);
  }

  const updates = {};
  if (args.title) updates.title = args.title;
  if (args.description) updates.description = args.description;
  if (args.time_horizon) {
    if (!VALID_TIME_HORIZONS.includes(args.time_horizon)) {
      console.error(`Error: --time-horizon must be one of: ${VALID_TIME_HORIZONS.join(', ')}`);
      process.exit(1);
    }
    updates.time_horizon = args.time_horizon;
  }
  if (args.status) {
    if (!VALID_STATUSES.includes(args.status)) {
      console.error(`Error: --status must be one of: ${VALID_STATUSES.join(', ')}`);
      process.exit(1);
    }
    updates.status = args.status;
    if (args.status === 'killed') {
      updates.killed_at = new Date().toISOString();
      updates.killed_reason = args.killed_reason || 'Killed via CLI';
    }
  }
  if (args.target_capabilities) updates.target_capabilities = JSON.parse(args.target_capabilities);
  if (args.success_criteria) updates.success_criteria = JSON.parse(args.success_criteria);

  if (Object.keys(updates).length === 0) {
    console.error('Error: No update fields provided');
    process.exit(1);
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('strategy_objectives')
    .update(updates)
    .eq('id', id)
    .select('id, title, time_horizon, status');

  if (error) {
    console.error('Update error:', error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.error(`Error: Objective ${id} not found`);
    process.exit(1);
  }

  console.log('Updated strategy objective:');
  console.log(`  ID: ${data[0].id}`);
  console.log(`  Title: ${data[0].title}`);
  console.log(`  Time Horizon: ${data[0].time_horizon}`);
  console.log(`  Status: ${data[0].status}`);
}

async function deleteObjective(id) {
  if (!id) {
    console.error('Error: <id> is required');
    process.exit(1);
  }

  // Soft delete via status=killed
  const { data, error } = await supabase
    .from('strategy_objectives')
    .update({
      status: 'killed',
      killed_at: new Date().toISOString(),
      killed_reason: 'Deleted via CLI',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, title, status');

  if (error) {
    console.error('Delete error:', error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.error(`Error: Objective ${id} not found`);
    process.exit(1);
  }

  console.log(`Deleted (killed) objective: ${data[0].id} - ${data[0].title}`);
}

async function listObjectives(args) {
  let query = supabase
    .from('strategy_objectives')
    .select('id, title, time_horizon, status, created_at')
    .order('created_at', { ascending: false });

  if (args.status) {
    query = query.eq('status', args.status);
  }

  const { data, error } = await query;

  if (error) {
    console.error('List error:', error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('No strategy objectives found.');
    return;
  }

  console.log(`Strategy Objectives (${data.length} total):`);
  console.log('─'.repeat(80));
  console.log('ID'.padEnd(38) + 'Title'.padEnd(30) + 'Horizon'.padEnd(12) + 'Status');
  console.log('─'.repeat(80));

  for (const obj of data) {
    const id = obj.id.substring(0, 36).padEnd(38);
    const title = (obj.title || '').substring(0, 28).padEnd(30);
    const horizon = (obj.time_horizon || '').padEnd(12);
    console.log(`${id}${title}${horizon}${obj.status}`);
  }

  console.log('─'.repeat(80));
}

// CLI dispatch
const command = process.argv[2];
const entityId = process.argv[3]?.startsWith('--') ? null : process.argv[3];
const args = parseArgs(process.argv.slice(entityId ? 4 : 3));

switch (command) {
  case 'create':
    createObjective(args);
    break;
  case 'read':
    readObjective(entityId);
    break;
  case 'update':
    updateObjective(entityId, args);
    break;
  case 'delete':
    deleteObjective(entityId);
    break;
  case 'list':
    listObjectives(args);
    break;
  default:
    console.log('Strategy Objectives CRUD');
    console.log('');
    console.log('Usage:');
    console.log('  create  --title "..." --time-horizon now|next|later|eventually [--description "..."]');
    console.log('  read    <id>');
    console.log('  update  <id> --status active|paused|completed|killed [--title "..."] [--time-horizon ...]');
    console.log('  delete  <id>');
    console.log('  list    [--status active]');
    break;
}
