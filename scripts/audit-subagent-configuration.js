#!/usr/bin/env node

/**
 * Sub-Agent Configuration Audit
 * Identifies mismatches between database configuration and orchestrator behavior
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read actual configuration from orchestrate-phase-subagents.js
const orchestratorContent = fs.readFileSync(__dirname + '/orchestrate-phase-subagents.js', 'utf8');

// Extract PHASE_SUBAGENT_MAP
const phaseMapMatch = orchestratorContent.match(/const PHASE_SUBAGENT_MAP = \{([\s\S]*?)\n\};/);
let PHASE_SUBAGENT_MAP;
if (phaseMapMatch) {
  eval('PHASE_SUBAGENT_MAP = {' + phaseMapMatch[1] + '\n}');
} else {
  console.error('Could not extract PHASE_SUBAGENT_MAP from orchestrator');
  process.exit(1);
}

// Extract alwaysRequired (from inside isSubAgentRequired function)
const alwaysReqMatch = orchestratorContent.match(/const alwaysRequired = \{([\s\S]*?)\n  \};/);
let alwaysRequired;
if (alwaysReqMatch) {
  eval('alwaysRequired = {' + alwaysReqMatch[1] + '\n  }');
} else {
  console.error('Could not extract alwaysRequired from orchestrator');
  process.exit(1);
}

const automaticAgents = ['DOCMON', 'GITHUB', 'RETRO', 'API', 'DEPENDENCY', 'DESIGN', 'STORIES', 'RISK', 'SECURITY', 'DATABASE', 'TESTING', 'PERFORMANCE', 'VALIDATION'];

console.log('🚨 CONFIGURATION MISMATCH ANALYSIS\n');
console.log('═'.repeat(70));

// Issue 1: Agents in alwaysRequired but NOT in PHASE_SUBAGENT_MAP
console.log('\n❌ CRITICAL ISSUE #1: Agents marked as "always required" but NOT in phase pool');
console.log('   (These will NEVER trigger because they\'re not in the pool to select from)\n');

let issue1Count = 0;
Object.keys(alwaysRequired).forEach(phase => {
  const always = alwaysRequired[phase];
  const pool = PHASE_SUBAGENT_MAP[phase] || [];
  const missing = always.filter(a => !pool.includes(a));

  if (missing.length > 0) {
    console.log(`   ${phase}:`);
    missing.forEach(agent => {
      console.log(`     🔴 ${agent} - in alwaysRequired but NOT in PHASE_SUBAGENT_MAP`);
      issue1Count++;
    });
  }
});

if (issue1Count === 0) {
  console.log('   ✅ No issues found');
}

// Issue 2: Automatic agents in PHASE_SUBAGENT_MAP but NOT in alwaysRequired
console.log('\n⚠️  ISSUE #2: Automatic agents in phase pool but NOT always required');
console.log('   (These will only trigger if keywords match - not truly "automatic")\n');

let issue2Count = 0;
Object.keys(PHASE_SUBAGENT_MAP).forEach(phase => {
  const pool = PHASE_SUBAGENT_MAP[phase] || [];
  const always = alwaysRequired[phase] || [];
  const automaticInPool = pool.filter(a => automaticAgents.includes(a));
  const notAlwaysRequired = automaticInPool.filter(a => !always.includes(a));

  if (notAlwaysRequired.length > 0) {
    console.log(`   ${phase}:`);
    notAlwaysRequired.forEach(agent => {
      console.log(`     ⚠️  ${agent} - automatic but only triggers on keyword match`);
      issue2Count++;
    });
  }
});

if (issue2Count === 0) {
  console.log('   ✅ No issues found');
}

// Issue 3: Automatic agents not in ANY phase
console.log('\n🔍 ISSUE #3: Automatic agents not configured for ANY phase');
console.log('   (These will NEVER trigger automatically)\n');

const allPhaseAgents = new Set();
Object.values(PHASE_SUBAGENT_MAP).forEach(pool => {
  pool.forEach(a => allPhaseAgents.add(a));
});

const neverTriggered = automaticAgents.filter(a => !allPhaseAgents.has(a));
if (neverTriggered.length > 0) {
  neverTriggered.forEach(agent => {
    console.log(`   🔴 ${agent} - marked automatic but not in any phase configuration`);
  });
} else {
  console.log('   ✅ All automatic agents are configured for at least one phase');
}

console.log('\n═'.repeat(70));
console.log('\n📊 SUMMARY:');
console.log(`   Critical Issues (will never trigger): ${issue1Count}`);
console.log(`   Warning Issues (not truly automatic): ${issue2Count}`);
console.log(`   Orphaned Agents (not in any phase): ${neverTriggered.length}`);
console.log(`   Total Issues: ${issue1Count + issue2Count + neverTriggered.length}`);
console.log('═'.repeat(70));
