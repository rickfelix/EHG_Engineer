#!/usr/bin/env node

/**
 * AUTO-RUN SUB-AGENTS (Simple Version)
 * Works WITHOUT database triggers
 * Manually detects and runs required sub-agents
 */

import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);

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

async function runSubAgent(agent, script, sdId, sdKey) {
  console.log(`\n🤖 Running: ${agent}`);
  console.log(`   Script: ${script}`);
  console.log(`   SD: ${sdKey}`);

  try {
    const { stdout, stderr } = await execAsync(`node ${script} ${sdId}`);

    // Try to parse JSON output
    let result;
    try {
      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        result = { stdout, success: !stderr };
      }
    } catch {
      result = { stdout, stderr, success: !stderr };
    }

    if (result.success) {
      console.log(`   ✅ Success`);
    } else {
      console.log(`   ⚠️  Warning: Check output`);
    }

    return { success: true, result };
  } catch (error) {
    console.error(`   ❌ Failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function autoRunSubAgents(sdId, triggerEvent) {
  console.log(`\n🚀 AUTO-RUN SUB-AGENTS`);
  console.log(`═`.repeat(60));
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

    const result = await runSubAgent(subAgent.agent, scriptToUse, sdId, sd.sd_key);
    results.push({ ...subAgent, ...result });
  }

  // Summary
  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`\n═`.repeat(60));
  console.log(`📊 SUMMARY`);
  console.log(`   Required: ${required.length}`);
  console.log(`   Succeeded: ${succeeded}`);
  console.log(`   Failed: ${failed}`);
  console.log(`═`.repeat(60));

  if (failed > 0) {
    console.log(`\n⚠️  Some sub-agents failed. Review output above.`);
  } else {
    console.log(`\n✅ All sub-agents completed successfully!`);
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
