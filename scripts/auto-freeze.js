#!/usr/bin/env node
/**
 * AUTO-FREEZE CLI
 * SD: SD-LEO-SELF-IMPROVE-002A
 *
 * Manages AUTO_FREEZE state via database functions.
 *
 * Usage:
 *   node scripts/auto-freeze.js status              # Get current freeze status (JSON)
 *   node scripts/auto-freeze.js enable --reason "maintenance" --actor "ops"
 *   node scripts/auto-freeze.js disable --actor "ops"
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parseArgs(args) {
  const result = { command: args[0] };
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--reason' && args[i + 1]) {
      result.reason = args[++i];
    } else if (args[i] === '--actor' && args[i + 1]) {
      result.actor = args[++i];
    }
  }
  return result;
}

async function getStatus() {
  const { data, error } = await supabase
    .from('system_settings')
    .select('value_json, updated_at, updated_by')
    .eq('key', 'AUTO_FREEZE')
    .single();

  if (error) {
    console.error(JSON.stringify({ error: error.message }));
    process.exit(1);
  }

  const status = {
    enabled: data.value_json.enabled,
    reason: data.value_json.reason,
    since: data.value_json.since,
    updated_at: data.updated_at,
    updated_by: data.updated_by
  };

  console.log(JSON.stringify(status));
  process.exit(0);
}

async function enableFreeze(reason, actor) {
  if (!actor) {
    console.error(JSON.stringify({ error: '--actor is required' }));
    process.exit(1);
  }

  const newValue = {
    enabled: true,
    reason: reason || null,
    since: new Date().toISOString()
  };

  const { error } = await supabase
    .from('system_settings')
    .update({
      value_json: newValue,
      updated_at: new Date().toISOString(),
      updated_by: actor
    })
    .eq('key', 'AUTO_FREEZE');

  if (error) {
    console.error(JSON.stringify({ error: error.message }));
    process.exit(1);
  }

  console.log(JSON.stringify({
    success: true,
    action: 'enabled',
    reason: reason || null,
    actor: actor
  }));
  process.exit(0);
}

async function disableFreeze(actor) {
  if (!actor) {
    console.error(JSON.stringify({ error: '--actor is required' }));
    process.exit(1);
  }

  const newValue = {
    enabled: false,
    reason: null,
    since: null
  };

  const { error } = await supabase
    .from('system_settings')
    .update({
      value_json: newValue,
      updated_at: new Date().toISOString(),
      updated_by: actor
    })
    .eq('key', 'AUTO_FREEZE');

  if (error) {
    console.error(JSON.stringify({ error: error.message }));
    process.exit(1);
  }

  console.log(JSON.stringify({
    success: true,
    action: 'disabled',
    actor: actor
  }));
  process.exit(0);
}

function showHelp() {
  console.log(`
AUTO-FREEZE CLI - Manage AUTO-tier freeze state

USAGE:
  node scripts/auto-freeze.js <command> [options]

COMMANDS:
  status              Get current freeze status (JSON output)
  enable              Enable AUTO freeze (blocks all AUTO-tier applies)
  disable             Disable AUTO freeze (resumes AUTO-tier applies)

OPTIONS:
  --reason <text>     Reason for enabling freeze (used with 'enable')
  --actor <text>      Who is making the change (required for enable/disable)

EXAMPLES:
  node scripts/auto-freeze.js status
  node scripts/auto-freeze.js enable --reason "scheduled maintenance" --actor "ops-team"
  node scripts/auto-freeze.js disable --actor "ops-team"

OUTPUT:
  All commands output JSON for machine parsing.
  Exit code 0 = success, 1 = error.
`);
  process.exit(0);
}

// Main
const args = process.argv.slice(2);
const { command, reason, actor } = parseArgs(args);

switch (command) {
  case 'status':
    getStatus();
    break;
  case 'enable':
    enableFreeze(reason, actor);
    break;
  case 'disable':
    disableFreeze(actor);
    break;
  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;
  default:
    console.error(JSON.stringify({ error: `Unknown command: ${command}. Use 'help' for usage.` }));
    process.exit(1);
}
