#!/usr/bin/env node

/**
 * SUB-AGENT WORKER
 * Automatically processes queued sub-agent activations
 * Runs continuously or as cron job
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';

dotenv.config();

const execAsync = promisify(exec);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Map sub-agent codes to their execution scripts
const SUB_AGENT_SCRIPTS = {
  'CONTINUOUS_IMPROVEMENT_COACH': 'scripts/generate-retrospective.js',
  'DEVOPS_PLATFORM_ARCHITECT': 'scripts/devops-verification.js',
  'DESIGN_SUB_AGENT': 'scripts/design-analysis.js',
  'QA_ENGINEERING_DIRECTOR': 'scripts/qa-code-analysis.js',
  'PRINCIPAL_DATABASE_ARCHITECT': 'scripts/database-impact-analysis.js',
  'PRINCIPAL_SYSTEMS_ANALYST': 'scripts/systems-analysis.js'
};

/**
 * Process one sub-agent activation from the queue
 */
async function processSubAgentTask(task) {
  console.log(`\n🤖 Processing: ${task.sub_agent_code}`);
  console.log(`   SD: ${task.sd_key}`);
  console.log(`   Trigger: ${task.trigger_event}`);

  try {
    // Mark as in_progress
    await supabase
      .from('sub_agent_queue')
      .update({ status: 'in_progress', started_at: new Date().toISOString() })
      .eq('id', task.queue_id);

    // Get script for this sub-agent
    const script = SUB_AGENT_SCRIPTS[task.sub_agent_code];

    if (!script) {
      throw new Error(`No script defined for ${task.sub_agent_code}`);
    }

    // Execute the sub-agent script
    console.log(`   Running: node ${script} ${task.sd_id}`);
    const { stdout, stderr } = await execAsync(`node ${script} ${task.sd_id}`);

    // Parse result (assuming JSON output)
    let result;
    try {
      result = JSON.parse(stdout);
    } catch {
      result = { stdout, stderr, success: !stderr };
    }

    // Mark as completed
    await supabase
      .from('sub_agent_queue')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        result
      })
      .eq('id', task.queue_id);

    console.log(`   ✅ Completed: ${task.sub_agent_code}`);

    return { success: true, result };

  } catch (error) {
    console.error(`   ❌ Failed: ${error.message}`);

    // Mark as failed
    await supabase
      .from('sub_agent_queue')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error.message
      })
      .eq('id', task.queue_id);

    return { success: false, error: error.message };
  }
}

/**
 * Get pending tasks from queue (highest priority first)
 */
async function getPendingTasks(limit = 10) {
  const { data, error } = await supabase
    .from('v_pending_subagent_work')
    .select('*')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Error fetching tasks:', error);
    return [];
  }

  return data || [];
}

/**
 * Process all pending tasks
 */
async function processPendingTasks() {
  const tasks = await getPendingTasks();

  if (tasks.length === 0) {
    console.log('✅ No pending sub-agent tasks');
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  console.log(`\n📋 Found ${tasks.length} pending sub-agent tasks`);

  let succeeded = 0;
  let failed = 0;

  for (const task of tasks) {
    const result = await processSubAgentTask(task);
    if (result.success) {
      succeeded++;
    } else {
      failed++;
    }
  }

  return { processed: tasks.length, succeeded, failed };
}

/**
 * Run worker in continuous mode
 */
async function runContinuous(intervalSeconds = 60) {
  console.log('🤖 SUB-AGENT WORKER - CONTINUOUS MODE');
  console.log(`   Polling every ${intervalSeconds} seconds`);
  console.log('   Press Ctrl+C to stop\n');

  while (true) {
    try {
      const result = await processPendingTasks();

      if (result.processed > 0) {
        console.log(`\n📊 Batch complete: ${result.succeeded} succeeded, ${result.failed} failed`);
      }
    } catch (error) {
      console.error('Worker error:', error);
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, intervalSeconds * 1000));
  }
}

/**
 * Run worker once (for cron jobs)
 */
async function runOnce() {
  console.log('🤖 SUB-AGENT WORKER - SINGLE RUN\n');

  const result = await processPendingTasks();

  console.log('\n📊 Summary:');
  console.log(`   Processed: ${result.processed}`);
  console.log(`   Succeeded: ${result.succeeded}`);
  console.log(`   Failed: ${result.failed}`);

  process.exit(result.failed > 0 ? 1 : 0);
}

/**
 * Check queue status
 */
async function checkStatus() {
  const { data, error } = await supabase
    .from('sub_agent_queue')
    .select('status, count(*)', { count: 'exact' })
    .group('status');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('📊 Sub-Agent Queue Status:');
  console.log('═'.repeat(40));

  const statusCounts = data.reduce((acc, row) => {
    acc[row.status] = row.count;
    return acc;
  }, {});

  console.log(`   Pending:     ${statusCounts.pending || 0}`);
  console.log(`   In Progress: ${statusCounts.in_progress || 0}`);
  console.log(`   Completed:   ${statusCounts.completed || 0}`);
  console.log(`   Failed:      ${statusCounts.failed || 0}`);
  console.log('═'.repeat(40));
}

// CLI interface
async function main() {
  const command = process.argv[2] || 'once';

  switch (command) {
    case 'continuous':
      const interval = parseInt(process.argv[3]) || 60;
      await runContinuous(interval);
      break;

    case 'once':
      await runOnce();
      break;

    case 'status':
      await checkStatus();
      break;

    default:
      console.log('Usage:');
      console.log('  node subagent-worker.js once              # Process queue once');
      console.log('  node subagent-worker.js continuous [sec]  # Run continuously');
      console.log('  node subagent-worker.js status            # Check queue status');
      process.exit(1);
  }
}

main();
