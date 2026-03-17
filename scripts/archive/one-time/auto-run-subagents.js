#!/usr/bin/env node

/**
 * AUTO-RUN SUB-AGENTS (Simple Version)
 * Works WITHOUT database triggers
 * Manually detects and runs required sub-agents
 *
 * LEO v4.4 Updates:
 * - Added DB audit logging to subagent_activations table
 * - Added file-based IPC for reliable result passing
 * - Removed fragile stdout JSON parsing
 */

import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);

// LEO v4.4: IPC temp directory for result passing
const IPC_DIR = path.join(process.cwd(), '.leo-ipc');
if (!fs.existsSync(IPC_DIR)) {
  fs.mkdirSync(IPC_DIR, { recursive: true });
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Sub-agent trigger rules
const TRIGGER_RULES = {
  'SD_STATUS_COMPLETED': [
    { agent: 'CONTINUOUS_IMPROVEMENT_COACH', script: 'scripts/generate-retrospective.js', comprehensiveScript: 'scripts/generate-comprehensive-retrospective.js', priority: 9 },
    { agent: 'DEVOPS_PLATFORM_ARCHITECT', script: 'scripts/devops-verification.js', priority: 8 }
  ],
  'EXEC_IMPLEMENTATION_COMPLETE': [
    { agent: 'DEVOPS_PLATFORM_ARCHITECT', script: 'scripts/devops-verification.js', priority: 8 }
  ],
  'PLAN_VERIFICATION_PASS': [
    { agent: 'DEVOPS_PLATFORM_ARCHITECT', script: 'scripts/devops-verification.js', priority: 7 }
  ]
};

/**
 * LEO v4.4: Log sub-agent activation to database for audit trail
 */
async function logActivation(agent, sdId, triggerEvent, status = 'started') {
  try {
    const { data, error } = await supabase
      .from('subagent_activations')
      .insert({
        sub_agent_code: agent,
        sd_id: sdId,
        trigger_event: triggerEvent,
        status: status,
        triggered_at: new Date().toISOString(),
        metadata: {
          source: 'auto-run-subagents.js',
          leo_version: '4.4'
        }
      })
      .select()
      .single();

    if (error) {
      // Non-fatal: log but continue
      console.log(`   ⚠️  Audit log failed (non-fatal): ${error.message}`);
      return null;
    }

    return data?.id || null;
  } catch (err) {
    console.log(`   ⚠️  Audit log exception (non-fatal): ${err.message}`);
    return null;
  }
}

/**
 * LEO v4.4: Update activation status in database
 */
async function updateActivation(activationId, status, result = null) {
  if (!activationId) return;

  try {
    await supabase
      .from('subagent_activations')
      .update({
        status: status,
        completed_at: new Date().toISOString(),
        result: result ? {
          success: result.success,
          verdict: result.verdict || null,
          error: result.error || null
        } : null
      })
      .eq('id', activationId);
  } catch (err) {
    // Non-fatal
    console.log(`   ⚠️  Activation update failed (non-fatal): ${err.message}`);
  }
}

/**
 * LEO v4.4: Generate IPC file path for result passing
 */
function getIPCPath(agent, sdId) {
  const hash = crypto.createHash('md5').update(`${agent}-${sdId}-${Date.now()}`).digest('hex').slice(0, 8);
  return path.join(IPC_DIR, `result-${agent}-${hash}.json`);
}

/**
 * LEO v4.4: Read result from IPC file
 */
function readIPCResult(ipcPath) {
  try {
    if (fs.existsSync(ipcPath)) {
      const content = fs.readFileSync(ipcPath, 'utf8');
      fs.unlinkSync(ipcPath); // Clean up after reading
      return JSON.parse(content);
    }
  } catch (err) {
    console.log(`   ⚠️  IPC read failed: ${err.message}`);
  }
  return null;
}

async function runSubAgent(agent, script, sdId, sdKey, triggerEvent) {
  console.log(`\n🤖 Running: ${agent}`);
  console.log(`   Script: ${script}`);
  console.log(`   SD: ${sdKey}`);

  // LEO v4.4: Log activation to database
  const activationId = await logActivation(agent, sdId, triggerEvent);
  if (activationId) {
    console.log(`   📝 Activation logged: ${activationId}`);
  }

  // LEO v4.4: Set up IPC file for result passing
  const ipcPath = getIPCPath(agent, sdId);

  try {
    // Pass IPC path as environment variable for child process
    const env = {
      ...process.env,
      LEO_IPC_RESULT_PATH: ipcPath
    };

    const { stdout, stderr } = await execAsync(`node ${script} ${sdId}`, {
      env,
      timeout: 300000 // 5 minute timeout
    });

    // LEO v4.4: Try to read result from IPC file first (preferred method)
    let result = readIPCResult(ipcPath);

    // Fallback: Try to parse JSON from stdout (legacy support)
    if (!result) {
      try {
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
          console.log('   📄 Result from stdout (legacy mode)');
        } else {
          result = { stdout: stdout.slice(0, 500), success: !stderr };
        }
      } catch {
        result = { stdout: stdout.slice(0, 500), stderr: stderr?.slice(0, 200), success: !stderr };
      }
    } else {
      console.log('   📄 Result from IPC file');
    }

    const success = result.success !== false && result.verdict !== 'FAIL';

    if (success) {
      console.log('   ✅ Success');
      await updateActivation(activationId, 'completed', { success: true, verdict: result.verdict });
    } else {
      console.log('   ⚠️  Warning: Check output');
      await updateActivation(activationId, 'completed_with_warnings', result);
    }

    return { success, result };
  } catch (error) {
    console.error(`   ❌ Failed: ${error.message}`);

    // LEO v4.4: Log failure to database
    await updateActivation(activationId, 'failed', { success: false, error: error.message });

    // Clean up IPC file on error
    if (fs.existsSync(ipcPath)) {
      fs.unlinkSync(ipcPath);
    }

    return { success: false, error: error.message };
  }
}

async function autoRunSubAgents(sdId, triggerEvent) {
  console.log('\n🚀 AUTO-RUN SUB-AGENTS');
  console.log('═'.repeat(60));
  console.log(`Event: ${triggerEvent}`);
  console.log(`SD: ${sdId}`);

  // Get SD details
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', sdId)
    .single();

  if (sdError || !sd) {
    console.error(`❌ SD not found: ${sdId}`);
    process.exit(1);
  }

  console.log(`   ${sd.sd_key} - ${sd.title}`);
  console.log(`   Status: ${sd.status}, Progress: ${sd.progress}%`);

  // Get required sub-agents for this trigger
  const required = TRIGGER_RULES[triggerEvent] || [];

  if (required.length === 0) {
    console.log(`\n✅ No sub-agents required for ${triggerEvent}`);
    return { required: 0, succeeded: 0, failed: 0 };
  }

  console.log(`\n📋 Required sub-agents: ${required.length}`);
  required.forEach((r, i) => {
    console.log(`   ${i + 1}. ${r.agent} (priority ${r.priority})`);
  });

  // Check for --comprehensive flag
  const useComprehensive = process.argv.includes('--comprehensive');

  // Run each sub-agent
  const results = [];
  for (const subAgent of required) {
    // Use comprehensive script if available and flag is set
    const scriptToUse = (useComprehensive && subAgent.comprehensiveScript)
      ? subAgent.comprehensiveScript
      : subAgent.script;

    if (useComprehensive && subAgent.comprehensiveScript) {
      console.log(`   📊 Using comprehensive version for ${subAgent.agent}`);
    }

    // LEO v4.4: Pass triggerEvent for DB audit logging
    const result = await runSubAgent(subAgent.agent, scriptToUse, sdId, sd.sd_key, triggerEvent);
    results.push({ ...subAgent, ...result });
  }

  // Summary
  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log('\n═'.repeat(60));
  console.log('📊 SUMMARY');
  console.log(`   Required: ${required.length}`);
  console.log(`   Succeeded: ${succeeded}`);
  console.log(`   Failed: ${failed}`);
  console.log('═'.repeat(60));

  if (failed > 0) {
    console.log('\n⚠️  Some sub-agents failed. Review output above.');
  } else {
    console.log('\n✅ All sub-agents completed successfully!');
  }

  return { required: required.length, succeeded, failed, results };
}

// CLI usage
async function main() {
  const triggerEvent = process.argv[2];
  const sdId = process.argv[3];

  if (!triggerEvent || !sdId) {
    console.log('Usage: node auto-run-subagents.js <TRIGGER_EVENT> <SD_UUID>');
    console.log('');
    console.log('Examples:');
    console.log('  node auto-run-subagents.js SD_STATUS_COMPLETED ccf6484d-9182-4879-a36a-33c7bbb1796c');
    console.log('  node auto-run-subagents.js EXEC_IMPLEMENTATION_COMPLETE <SD_UUID>');
    console.log('');
    console.log('Available trigger events:');
    Object.keys(TRIGGER_RULES).forEach(event => {
      console.log(`  - ${event}`);
    });
    process.exit(1);
  }

  const result = await autoRunSubAgents(sdId, triggerEvent);
  process.exit(result.failed > 0 ? 1 : 0);
}

main();
