#!/usr/bin/env node
/**
 * EVA Autonomy CLI — manage venture autonomy levels (L0-L4)
 *
 * Usage:
 *   node scripts/eva-autonomy.js status  --venture <id>
 *   node scripts/eva-autonomy.js promote --venture <id> --to <L1-L4> --reason "..."
 *   node scripts/eva-autonomy.js demote  --venture <id> --to <L0-L3> --reason "..."
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  AUTONOMY_LEVELS,
  LEVEL_ORDER,
  GATE_BEHAVIOR_MATRIX,
  validateLevelTransition,
} from '../lib/eva/autonomy-model.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0];
  const flags = {};
  for (let i = 1; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '');
    flags[key] = args[i + 1];
  }
  return { command, ...flags };
}

async function statusCommand(ventureId) {
  const { data, error } = await supabase
    .from('eva_ventures')
    .select('id, name, autonomy_level')
    .eq('id', ventureId)
    .single();

  if (error || !data) {
    console.error(`Venture not found: ${ventureId}`);
    process.exit(1);
  }

  const level = data.autonomy_level || 'L0';
  const info = AUTONOMY_LEVELS[level];
  const matrix = GATE_BEHAVIOR_MATRIX[level];

  console.log(`\nVenture: ${data.name || data.id}`);
  console.log(`Autonomy Level: ${level} (${info?.name})`);
  console.log(`Description: ${info?.description}`);
  console.log(`\nGate Behavior:`);
  console.log(`  Stage Gates:      ${matrix.stage_gate}`);
  console.log(`  Reality Gates:    ${matrix.reality_gate}`);
  console.log(`  Devil's Advocate: ${matrix.devils_advocate}`);
}

async function changeLevelCommand(ventureId, targetLevel, reason, direction) {
  if (!reason) {
    console.error('--reason is required for autonomy level changes');
    process.exit(1);
  }

  // Get current level
  const { data: venture, error } = await supabase
    .from('eva_ventures')
    .select('id, name, autonomy_level')
    .eq('id', ventureId)
    .single();

  if (error || !venture) {
    console.error(`Venture not found: ${ventureId}`);
    process.exit(1);
  }

  const currentLevel = venture.autonomy_level || 'L0';
  const validation = validateLevelTransition(currentLevel, targetLevel);
  if (!validation.valid) {
    console.error(`Invalid transition: ${validation.reason}`);
    process.exit(1);
  }

  // Check direction
  const currentIdx = LEVEL_ORDER.indexOf(currentLevel);
  const targetIdx = LEVEL_ORDER.indexOf(targetLevel);
  if (direction === 'promote' && targetIdx <= currentIdx) {
    console.error(`Cannot promote: ${targetLevel} is not higher than ${currentLevel}`);
    process.exit(1);
  }
  if (direction === 'demote' && targetIdx >= currentIdx) {
    console.error(`Cannot demote: ${targetLevel} is not lower than ${currentLevel}`);
    process.exit(1);
  }

  // Update level
  const { error: updateErr } = await supabase
    .from('eva_ventures')
    .update({ autonomy_level: targetLevel })
    .eq('id', ventureId);

  if (updateErr) {
    console.error(`Failed to update: ${updateErr.message}`);
    process.exit(1);
  }

  // Write audit log
  const { error: auditErr } = await supabase
    .from('eva_audit_log')
    .insert({
      venture_id: ventureId,
      action_type: `autonomy_${direction}`,
      details: {
        from_level: currentLevel,
        to_level: targetLevel,
        reason,
        direction,
      },
      actor: 'cli',
    });

  if (auditErr) {
    console.warn(`Audit log failed (non-blocking): ${auditErr.message}`);
  }

  const info = AUTONOMY_LEVELS[targetLevel];
  console.log(`\n${direction === 'promote' ? '⬆️' : '⬇️'}  Venture ${direction}d: ${currentLevel} → ${targetLevel}`);
  console.log(`   Level: ${info?.name} — ${info?.description}`);
  console.log(`   Reason: ${reason}`);
  console.log(`   Audit: logged`);
}

async function main() {
  const { command, venture, to, reason } = parseArgs();

  if (!command || !['status', 'promote', 'demote'].includes(command)) {
    console.log('Usage:');
    console.log('  node scripts/eva-autonomy.js status  --venture <id>');
    console.log('  node scripts/eva-autonomy.js promote --venture <id> --to <L1-L4> --reason "..."');
    console.log('  node scripts/eva-autonomy.js demote  --venture <id> --to <L0-L3> --reason "..."');
    console.log('\nLevels:');
    for (const [key, val] of Object.entries(AUTONOMY_LEVELS)) {
      console.log(`  ${key}: ${val.name} — ${val.description}`);
    }
    process.exit(0);
  }

  if (!venture) {
    console.error('--venture is required');
    process.exit(1);
  }

  if (command === 'status') {
    await statusCommand(venture);
  } else {
    if (!to || !LEVEL_ORDER.includes(to)) {
      console.error(`--to must be one of: ${LEVEL_ORDER.join(', ')}`);
      process.exit(1);
    }
    await changeLevelCommand(venture, to, reason, command);
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
