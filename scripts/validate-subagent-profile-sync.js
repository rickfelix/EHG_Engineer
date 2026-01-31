#!/usr/bin/env node

/**
 * Validate Sub-Agent Profile Sync
 * SD-LEO-INFRA-SUBAGENT-ORCHESTRATION-001: US-004
 *
 * Ensures all sub-agents referenced in sd_type_validation_profiles.required_sub_agents
 * exist in the leo_sub_agents table and are active.
 *
 * Usage:
 *   node scripts/validate-subagent-profile-sync.js
 *   node scripts/validate-subagent-profile-sync.js --fix  # Auto-fix by removing invalid references
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PHASE_KEYS = ['LEAD', 'PLAN', 'EXEC'];

async function validateSync() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║       SUB-AGENT / VALIDATION PROFILE SYNC CHECK           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const issues = [];
  const warnings = [];

  // Step 1: Get all active sub-agents from database
  console.log('Step 1: Querying active sub-agents...');
  const { data: subAgents, error: saError } = await supabase
    .from('leo_sub_agents')
    .select('code, name, active')
    .order('code');

  if (saError) {
    console.error('   ERROR: Failed to query sub-agents:', saError.message);
    process.exit(1);
  }

  const activeAgents = new Set(subAgents.filter(a => a.active).map(a => a.code));
  const inactiveAgents = new Set(subAgents.filter(a => !a.active).map(a => a.code));
  console.log(`   Found ${activeAgents.size} active sub-agents`);
  console.log(`   Found ${inactiveAgents.size} inactive sub-agents`);

  // Step 2: Get all validation profiles with required_sub_agents
  console.log('\nStep 2: Querying validation profiles...');
  const { data: profiles, error: vpError } = await supabase
    .from('sd_type_validation_profiles')
    .select('sd_type, required_sub_agents')
    .order('sd_type');

  if (vpError) {
    console.error('   ERROR: Failed to query validation profiles:', vpError.message);
    process.exit(1);
  }

  const profilesWithRequirements = profiles.filter(p =>
    p.required_sub_agents && Object.keys(p.required_sub_agents).length > 0
  );
  console.log(`   Found ${profiles.length} total profiles`);
  console.log(`   Found ${profilesWithRequirements.length} profiles with required_sub_agents`);

  // Step 3: Validate each profile's sub-agent references
  console.log('\nStep 3: Validating sub-agent references...\n');

  for (const profile of profilesWithRequirements) {
    const sdType = profile.sd_type;
    const requirements = profile.required_sub_agents;

    console.log(`   SD Type: ${sdType}`);

    for (const phase of PHASE_KEYS) {
      const phaseAgents = requirements[phase];
      if (!phaseAgents || !Array.isArray(phaseAgents)) continue;

      for (const agentCode of phaseAgents) {
        if (!activeAgents.has(agentCode)) {
          if (inactiveAgents.has(agentCode)) {
            issues.push({
              type: 'INACTIVE_REFERENCE',
              sdType,
              phase,
              agentCode,
              message: `${sdType}.${phase} references INACTIVE sub-agent: ${agentCode}`
            });
            console.log(`      ❌ ${phase}: ${agentCode} (INACTIVE)`);
          } else {
            issues.push({
              type: 'MISSING_REFERENCE',
              sdType,
              phase,
              agentCode,
              message: `${sdType}.${phase} references NON-EXISTENT sub-agent: ${agentCode}`
            });
            console.log(`      ❌ ${phase}: ${agentCode} (NOT FOUND)`);
          }
        } else {
          console.log(`      ✓ ${phase}: ${agentCode}`);
        }
      }
    }
    console.log('');
  }

  // Step 4: Check for profiles without required_sub_agents
  console.log('Step 4: Checking profiles without requirements...');
  const emptyProfiles = profiles.filter(p =>
    !p.required_sub_agents || Object.keys(p.required_sub_agents).length === 0
  );

  if (emptyProfiles.length > 0) {
    console.log(`   Found ${emptyProfiles.length} profiles without required_sub_agents:`);
    for (const profile of emptyProfiles) {
      console.log(`      ⚠ ${profile.sd_type} (will use fallback config)`);
      warnings.push({
        type: 'EMPTY_PROFILE',
        sdType: profile.sd_type,
        message: `${profile.sd_type} has no required_sub_agents - will use phase-config.js fallback`
      });
    }
  } else {
    console.log('   All profiles have required_sub_agents configured');
  }

  // Step 5: Summary
  console.log('\n' + '═'.repeat(60));
  console.log('VALIDATION SUMMARY');
  console.log('═'.repeat(60));

  if (issues.length === 0 && warnings.length === 0) {
    console.log('\n✅ All validations passed!');
    console.log('   - All referenced sub-agents exist and are active');
    console.log('   - All SD types have required_sub_agents configured');
    process.exit(0);
  }

  if (issues.length > 0) {
    console.log(`\n❌ Found ${issues.length} ISSUE(S):`);
    for (const issue of issues) {
      console.log(`   - ${issue.message}`);
    }
  }

  if (warnings.length > 0) {
    console.log(`\n⚠ Found ${warnings.length} WARNING(S):`);
    for (const warning of warnings) {
      console.log(`   - ${warning.message}`);
    }
  }

  // Handle --fix flag
  if (process.argv.includes('--fix') && issues.length > 0) {
    console.log('\n' + '─'.repeat(60));
    console.log('AUTO-FIX MODE');
    console.log('─'.repeat(60));
    await autoFix(issues);
  } else if (issues.length > 0) {
    console.log('\n💡 Run with --fix to automatically remove invalid references');
  }

  process.exit(issues.length > 0 ? 1 : 0);
}

async function autoFix(issues) {
  const profileUpdates = {};

  // Group issues by SD type
  for (const issue of issues) {
    if (!profileUpdates[issue.sdType]) {
      profileUpdates[issue.sdType] = { phases: {} };
    }
    if (!profileUpdates[issue.sdType].phases[issue.phase]) {
      profileUpdates[issue.sdType].phases[issue.phase] = [];
    }
    profileUpdates[issue.sdType].phases[issue.phase].push(issue.agentCode);
  }

  // Apply fixes
  for (const [sdType, update] of Object.entries(profileUpdates)) {
    console.log(`\nFixing ${sdType}...`);

    // Get current profile
    const { data: profile } = await supabase
      .from('sd_type_validation_profiles')
      .select('required_sub_agents')
      .eq('sd_type', sdType)
      .single();

    if (!profile) {
      console.log('   ⚠ Profile not found, skipping');
      continue;
    }

    const updatedRequirements = { ...profile.required_sub_agents };

    // Remove invalid agents from each phase
    for (const [phase, invalidAgents] of Object.entries(update.phases)) {
      if (updatedRequirements[phase]) {
        updatedRequirements[phase] = updatedRequirements[phase].filter(
          a => !invalidAgents.includes(a)
        );
        console.log(`   Removed from ${phase}: ${invalidAgents.join(', ')}`);
      }
    }

    // Update database
    const { error } = await supabase
      .from('sd_type_validation_profiles')
      .update({ required_sub_agents: updatedRequirements })
      .eq('sd_type', sdType);

    if (error) {
      console.log(`   ❌ Failed to update: ${error.message}`);
    } else {
      console.log('   ✅ Updated successfully');
    }
  }

  console.log('\n✅ Auto-fix complete. Run validation again to verify.');
}

// Run validation
validateSync().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
