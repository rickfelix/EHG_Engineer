#!/usr/bin/env node

/**
 * Auto-Trigger Sub-Agents Script
 * Purpose: Identify and trigger required sub-agents based on SD scope
 * Usage: node scripts/auto-trigger-subagents.mjs <SD-ID> [--execute]
 *
 * This script:
 * 1. Queries check_required_sub_agents() function from database
 * 2. Identifies missing sub-agent verifications
 * 3. Provides CLI commands to trigger them
 * 4. Optionally executes sub-agents (with --execute flag)
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');

const SUPABASE_URL = envContent.match(/SUPABASE_URL="?(.*?)"?$/m)?.[1].replace(/"/g, '');
const SUPABASE_ANON_KEY = envContent.match(/SUPABASE_ANON_KEY="?(.*?)"?$/m)?.[1].replace(/"/g, '');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Sub-agent script mapping
const SUB_AGENT_SCRIPTS = {
  TESTING: 'scripts/qa-engineering-director-enhanced.js',
  DATABASE: 'scripts/database-architect-schema-review.mjs',
  DESIGN: 'scripts/design-subagent-ui-ux-specs.mjs',
  SECURITY: 'scripts/security-architect-admin-requirements.mjs',
  PERFORMANCE: 'scripts/performance-lead-requirements.mjs',
  VALIDATION: 'scripts/systems-analyst-codebase-audit.mjs',
  RETRO: 'scripts/generate-comprehensive-retrospective.js',
};

/**
 * Query database for required sub-agents
 */
async function checkRequiredSubAgents(sd_id) {
  const { data, error } = await supabase.rpc('check_required_sub_agents', {
    sd_id_param: sd_id,
  });

  if (error) {
    console.error('❌ Error checking required sub-agents:', error);
    return null;
  }

  return data;
}

/**
 * Execute a sub-agent script
 */
async function executeSubAgent(agentCode, sd_id) {
  const scriptPath = SUB_AGENT_SCRIPTS[agentCode];

  if (!scriptPath) {
    console.log(`   ⚠️  No script found for ${agentCode} - manual verification required`);
    return { success: false, reason: 'No script available' };
  }

  const fullPath = path.join(__dirname, '..', scriptPath);

  if (!fs.existsSync(fullPath)) {
    console.log(`   ⚠️  Script not found: ${scriptPath}`);
    return { success: false, reason: 'Script file not found' };
  }

  try {
    console.log(`   🔄 Executing: node ${scriptPath} ${sd_id}`);

    const output = execSync(`node ${fullPath} ${sd_id}`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    console.log(`   ✅ Completed: ${agentCode}`);
    return { success: true, output };
  } catch (error) {
    console.error(`   ❌ Error executing ${agentCode}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Main function
 */
async function main() {
  const sd_id = process.argv[2];
  const shouldExecute = process.argv.includes('--execute');

  if (!sd_id) {
    console.error('❌ Usage: node auto-trigger-subagents.mjs <SD-ID> [--execute]');
    console.error('   --execute: Actually run sub-agent scripts (default: show commands only)');
    process.exit(1);
  }

  console.log(`\n🔍 Checking required sub-agents for SD: ${sd_id}\n`);

  // Query SD
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', sd_id)
    .single();

  if (sdError || !sd) {
    console.error(`❌ SD not found: ${sd_id}`);
    console.error(sdError);
    process.exit(1);
  }

  console.log(`📄 SD: ${sd.title}`);
  console.log(`📊 Status: ${sd.status}`);
  console.log(`🎯 Priority: ${sd.priority}`);
  console.log(`📝 Scope preview: ${sd.scope?.substring(0, 200)}...\n`);

  // Check required sub-agents
  const verification = await checkRequiredSubAgents(sd_id);

  if (!verification) {
    console.error('❌ Failed to check sub-agents');
    process.exit(1);
  }

  console.log(`✅ Sub-agent verification results:\n`);
  console.log(`   Total required: ${verification.total_required}`);
  console.log(`   Verified: ${verification.verified_count}`);
  console.log(`   Missing: ${verification.missing_count}\n`);

  // Show verified agents
  if (verification.verified_agents && verification.verified_agents.length > 0) {
    console.log(`✅ Already verified (${verification.verified_count}):\n`);
    verification.verified_agents.forEach((agent) => {
      console.log(`   ✓ ${agent.name} (${agent.code})`);
      console.log(`     Verdict: ${agent.verdict}`);
      console.log(`     Confidence: ${agent.confidence || 'N/A'}`);
      console.log(`     Executed: ${agent.executed_at || 'N/A'}\n`);
    });
  }

  // Show missing agents
  if (verification.missing_agents && verification.missing_agents.length > 0) {
    console.log(`❌ Missing verifications (${verification.missing_count}):\n`);

    verification.missing_agents.forEach((agent, i) => {
      console.log(`${i + 1}. ${agent.name} (${agent.code})`);
      console.log(`   Reason: ${agent.reason}`);
      console.log(`   Priority: ${agent.priority}`);
      console.log(`   Triggers: ${agent.trigger_keywords?.join(', ') || 'N/A'}\n`);

      const scriptPath = SUB_AGENT_SCRIPTS[agent.code];
      if (scriptPath) {
        console.log(`   Command: node ${scriptPath} ${sd_id}\n`);
      } else {
        console.log(`   ⚠️  No automated script - manual verification required\n`);
      }
    });

    // Execute if --execute flag provided
    if (shouldExecute) {
      console.log(`\n🚀 Executing missing sub-agents...\n`);

      for (const agent of verification.missing_agents) {
        console.log(`\n📋 ${agent.name} (${agent.code})`);
        await executeSubAgent(agent.code, sd_id);
      }

      console.log(`\n✅ Sub-agent execution complete\n`);

      // Re-check verification
      const recheck = await checkRequiredSubAgents(sd_id);
      console.log(`\n🔄 Re-verification results:`);
      console.log(`   Total required: ${recheck.total_required}`);
      console.log(`   Verified: ${recheck.verified_count}`);
      console.log(`   Missing: ${recheck.missing_count}`);

      if (recheck.can_proceed) {
        console.log(`\n✅ All required sub-agents verified! SD can proceed to next phase.\n`);
      } else {
        console.log(`\n⚠️  Still missing ${recheck.missing_count} sub-agent verifications\n`);
      }
    } else {
      console.log(`\n💡 To execute all missing sub-agents automatically:`);
      console.log(`   node scripts/auto-trigger-subagents.mjs ${sd_id} --execute\n`);
    }
  } else {
    console.log(`\n✅ All required sub-agents have verified this SD!\n`);
  }

  // Summary
  console.log(`\n📊 Summary:`);
  console.log(`   Can proceed: ${verification.can_proceed ? '✅ YES' : '❌ NO'}`);

  if (!verification.can_proceed) {
    console.log(`\n🚨 PLAN→LEAD handoff BLOCKED until all sub-agents verify\n`);
  } else {
    console.log(`\n✅ PLAN→LEAD handoff ready (all sub-agents verified)\n`);
  }

  // Get sub-agent recommendations
  const { data: recommendations, error: recError } = await supabase.rpc('get_subagent_recommendations', {
    sd_id_param: sd_id,
  });

  if (!recError && recommendations && recommendations.has_missing) {
    console.log(`\n🔧 Recommended commands:\n`);
    recommendations.recommendations.forEach((rec, i) => {
      console.log(`${i + 1}. ${rec.agent_name} (${rec.priority} priority)`);
      console.log(`   ${rec.command}\n`);
    });
  }
}

main().catch(console.error);
