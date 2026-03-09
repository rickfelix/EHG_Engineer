#!/usr/bin/env node

import { Command } from 'commander';
import { createVentureClient } from './client.js';
import { pollTasks, displayPollResults } from './poll.js';
import { claimTask, completeTask, failTask } from './apply.js';
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
  .description('Claim a service task atomically')
  .argument('<task-id>', 'ID of the task to claim')
  .option('-c, --claimed-by <name>', 'Identifier for the claiming agent', 'venture-agent-cli')
  .option('--json', 'Output raw JSON')
  .action(async (taskId, opts) => {
    try {
      const supabase = createVentureClient();
      const result = await claimTask(supabase, taskId, opts.claimedBy);

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        const task = result.task;
        console.log(`Task claimed successfully.`);
        console.log(`  ID:       ${task.id}`);
        console.log(`  Type:     ${task.task_type}`);
        console.log(`  Service:  ${task.service_id}`);
        console.log(`  Priority: ${task.priority ?? '-'}`);
        console.log(`\nUse 'venture-agent report ${taskId} --result <json> --confidence <score>' to complete.`);
      }
      process.exit(0);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(err.message.includes('already claimed') ? 1 : 1);
    }
  });

// --- report subcommand ---
program
  .command('report')
  .description('Complete a claimed task with results and confidence score')
  .argument('<task-id>', 'ID of the task to complete')
  .option('-r, --result <json>', 'Result payload (JSON string)')
  .option('-c, --confidence <score>', 'Confidence score (0.0 to 1.0)')
  .option('-f, --fail', 'Report task failure instead of completion')
  .option('-e, --error-message <msg>', 'Error message (required with --fail)')
  .option('--json', 'Output raw JSON')
  .action(async (taskId, opts) => {
    try {
      const supabase = createVentureClient();

      if (opts.fail) {
        if (!opts.errorMessage) {
          console.error('Error: --error-message is required when using --fail');
          process.exit(1);
        }
        const result = await failTask(supabase, taskId, opts.errorMessage);
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Task ${taskId} reported as failed.`);
        }
        return;
      }

      // Validate confidence score
      if (opts.confidence !== undefined) {
        const score = parseFloat(opts.confidence);
        if (isNaN(score) || score < 0 || score > 1) {
          console.error('Error: --confidence must be a number between 0.0 and 1.0');
          process.exit(1);
        }
      }

      // Parse result JSON
      let resultPayload = null;
      if (opts.result) {
        try {
          resultPayload = JSON.parse(opts.result);
        } catch {
          console.error('Error: --result must be valid JSON');
          process.exit(1);
        }
      }

      const confidence = opts.confidence !== undefined ? parseFloat(opts.confidence) : undefined;
      const result = await completeTask(supabase, taskId, resultPayload, confidence);

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Task ${taskId} completed successfully.`);
        if (confidence !== undefined) {
          console.log(`  Confidence: ${confidence}`);
        }
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// --- summary subcommand ---
program
  .command('summary')
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
