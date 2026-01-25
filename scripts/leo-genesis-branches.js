#!/usr/bin/env node

/**
 * LEO Genesis Branch Lifecycle CLI
 *
 * Commands:
 *   list                           List all simulation branches
 *   incinerate <simulation_id>     Incinerate a simulation
 *   extend <simulation_id>         Extend TTL for a simulation
 *   check-expired                  Check for expired simulations
 *
 * Usage:
 *   node scripts/leo-genesis-branches.js list
 *   node scripts/leo-genesis-branches.js incinerate abc-123
 *   node scripts/leo-genesis-branches.js extend abc-123 --days=30 --reason="Need more time"
 *   node scripts/leo-genesis-branches.js check-expired
 *
 * Part of SD-GENESIS-V31-MASON-BRANCH
 */

import 'dotenv/config';
import {
  listSimulationBranches,
  incinerateBranch,
  extendTTL,
  checkExpiredSimulations,
  getSimulationBranch
} from '../lib/genesis/branch-lifecycle.js';

const COMMANDS = {
  list: {
    description: 'List all simulation branches',
    usage: 'list [--status=simulation|archived|incinerated]'
  },
  incinerate: {
    description: 'Incinerate a simulation',
    usage: 'incinerate <simulation_id> [--immediate]'
  },
  extend: {
    description: 'Extend TTL for a simulation',
    usage: 'extend <simulation_id> --days=<days> --reason="<reason>"'
  },
  'check-expired': {
    description: 'Check for expired simulations',
    usage: 'check-expired [--auto-incinerate]'
  }
};

function printUsage() {
  console.log('\n=== LEO Genesis Branch Lifecycle CLI ===\n');
  console.log('Usage: node scripts/leo-genesis-branches.js <command> [options]\n');
  console.log('Commands:');
  for (const [cmd, info] of Object.entries(COMMANDS)) {
    console.log(`  ${cmd.padEnd(15)} ${info.description}`);
    console.log(`                  Usage: ${info.usage}\n`);
  }
}

function parseArgs(args) {
  const result = {
    command: args[0],
    positional: [],
    flags: {}
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      result.flags[key] = value || true;
    } else {
      result.positional.push(arg);
    }
  }

  return result;
}

async function handleList(flags) {
  console.log('\n=== Simulation Branches ===\n');

  const filters = {};
  if (flags.status) {
    filters.status = flags.status;
  }

  const branches = await listSimulationBranches(filters);

  if (branches.length === 0) {
    console.log('No simulation branches found.');
    return;
  }

  console.log(`Found ${branches.length} simulation(s):\n`);

  for (const branch of branches) {
    const age = Math.floor((Date.now() - branch.createdAt.getTime()) / (24 * 60 * 60 * 1000));
    const remaining = branch.ttlDays - age;

    console.log(`ID: ${branch.id}`);
    console.log(`  Status:    ${branch.status}`);
    console.log(`  Created:   ${branch.createdAt.toISOString().split('T')[0]} (${age} days ago)`);
    console.log(`  TTL:       ${branch.ttlDays} days (${remaining > 0 ? `${remaining} remaining` : 'EXPIRED'})`);
    console.log(`  Preview:   ${branch.previewUrl || '(not deployed)'}`);
    console.log(`  Repo:      ${branch.repoUrl || '(not created)'}`);
    console.log(`  Seed:      ${branch.seedText}`);
    console.log('');
  }
}

async function handleIncinerate(positional, flags) {
  if (positional.length === 0) {
    console.error('Error: simulation_id is required');
    console.log('Usage: incinerate <simulation_id> [--immediate]');
    process.exit(1);
  }

  const simulationId = positional[0];
  const immediate = flags.immediate === true;

  // Verify simulation exists
  const branch = await getSimulationBranch(simulationId);
  if (!branch) {
    console.error(`Error: Simulation not found: ${simulationId}`);
    process.exit(1);
  }

  console.log(`\n=== Incineration: ${simulationId} ===\n`);
  console.log(`Current status: ${branch.status}`);
  console.log(`Mode: ${immediate ? 'IMMEDIATE' : 'SCHEDULED'}`);
  console.log('');

  if (branch.status === 'incinerated') {
    console.log('Simulation already incinerated.');
    return;
  }

  await incinerateBranch(simulationId, { immediate });

  console.log('\nIncineration sequence initiated.');
}

async function handleExtend(positional, flags) {
  if (positional.length === 0) {
    console.error('Error: simulation_id is required');
    console.log('Usage: extend <simulation_id> --days=<days> --reason="<reason>"');
    process.exit(1);
  }

  if (!flags.days) {
    console.error('Error: --days is required');
    process.exit(1);
  }

  if (!flags.reason) {
    console.error('Error: --reason is required');
    process.exit(1);
  }

  const simulationId = positional[0];
  const days = parseInt(flags.days, 10);
  const reason = flags.reason;

  if (isNaN(days) || days < 1) {
    console.error('Error: --days must be a positive integer');
    process.exit(1);
  }

  console.log(`\n=== Extending TTL: ${simulationId} ===\n`);
  console.log(`Additional days: ${days}`);
  console.log(`Reason: ${reason}`);
  console.log('');

  try {
    const updated = await extendTTL(simulationId, days, reason);
    console.log(`TTL extended. New TTL: ${updated.ttlDays} days`);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

async function handleCheckExpired(flags) {
  console.log('\n=== Checking for Expired Simulations ===\n');

  const expired = await checkExpiredSimulations();

  if (expired.length === 0) {
    console.log('No expired simulations found.');
    return;
  }

  console.log(`Found ${expired.length} expired simulation(s):\n`);

  for (const branch of expired) {
    console.log(`ID: ${branch.id}`);
    console.log(`  Overdue:  ${branch.daysOverdue} days`);
    console.log(`  Created:  ${branch.createdAt.toISOString().split('T')[0]}`);
    console.log(`  TTL:      ${branch.ttlDays} days`);
    console.log('');
  }

  if (flags['auto-incinerate']) {
    console.log('Auto-incinerating expired simulations...\n');
    for (const branch of expired) {
      console.log(`Incinerating: ${branch.id}`);
      await incinerateBranch(branch.id, { immediate: false });
    }
    console.log('\nAuto-incineration complete.');
  } else {
    console.log('Run with --auto-incinerate to automatically start incineration.');
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(0);
  }

  const { command, positional, flags } = parseArgs(args);

  try {
    switch (command) {
      case 'list':
        await handleList(flags);
        break;

      case 'incinerate':
        await handleIncinerate(positional, flags);
        break;

      case 'extend':
        await handleExtend(positional, flags);
        break;

      case 'check-expired':
        await handleCheckExpired(flags);
        break;

      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    if (process.env.DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main();
