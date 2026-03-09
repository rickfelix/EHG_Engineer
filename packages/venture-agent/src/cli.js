#!/usr/bin/env node

import { Command } from 'commander';
import { createVentureClient } from './client.js';
import { pollTasks, displayPollResults } from './poll.js';
import { applyTask, claimTask, completeTask } from './apply.js';
import { getTaskReport, displayReport } from './report.js';

const program = new Command();

program
  .name('venture-agent')
  .description('CLI tool for ventures to interact with the EHG Shared Service Platform')
  .version('1.0.0');

// --- poll subcommand ---
program
  .command('poll')
  .description('Poll for pending service tasks')
  .option('-s, --service-id <id>', 'Filter by service ID')
  .option('-t, --task-type <type>', 'Filter by task type')
  .option('-l, --limit <n>', 'Maximum tasks to return', '20')
  .option('-o, --offset <n>', 'Offset for pagination', '0')
  .option('--json', 'Output raw JSON')
  .action(async (opts) => {
    try {
      const supabase = createVentureClient();
      const result = await pollTasks(supabase, {
        serviceId: opts.serviceId,
        taskType: opts.taskType,
        limit: parseInt(opts.limit, 10),
        offset: parseInt(opts.offset, 10),
      });

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        displayPollResults(result);
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// --- apply subcommand ---
program
  .command('apply')
  .description('Claim and process a service task')
  .argument('<task-id>', 'ID of the task to claim and process')
  .option('-c, --claimed-by <name>', 'Identifier for the claiming agent', 'venture-agent-cli')
  .option('--json', 'Output raw JSON')
  .action(async (taskId, opts) => {
    try {
      const supabase = createVentureClient();
      const result = await applyTask(supabase, taskId, opts.claimedBy);

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Task ${taskId} completed successfully.`);
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// --- report subcommand ---
program
  .command('report')
  .description('Generate a summary report of completed tasks')
  .option('-s, --service-id <id>', 'Filter by service ID')
  .option('-t, --task-type <type>', 'Filter by task type')
  .option('--since <date>', 'Only tasks created after this date (ISO 8601)')
  .option('-l, --limit <n>', 'Maximum tasks to include', '100')
  .option('--json', 'Output raw JSON')
  .action(async (opts) => {
    try {
      const supabase = createVentureClient();
      const tasks = await getTaskReport(supabase, {
        serviceId: opts.serviceId,
        taskType: opts.taskType,
        since: opts.since,
        limit: parseInt(opts.limit, 10),
      });

      if (opts.json) {
        console.log(JSON.stringify(tasks, null, 2));
      } else {
        displayReport(tasks);
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();
