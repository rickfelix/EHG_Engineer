#!/usr/bin/env node

/**
 * LEO Protocol v4.0 Mandatory Checklist Validator
 * Ensures compliance before agent handoffs
 */

import fs from 'fs';
import readline from 'readline';

const CHECKLISTS = {
  LEAD: [
    'SD created and saved',
    'Business objectives defined',
    'Success metrics measurable', 
    'Constraints documented',
    'Risks identified',
    'Feasibility confirmed',
    'Environment health checked',
    'Context usage < 30%',
    'Summary created (500 tokens)'
  ],
  PLAN: [
    'PRD created and saved',
    'SD requirements mapped',
    'Technical specs complete',
    'Prerequisites verified', 
    'Test requirements defined',
    'Acceptance criteria clear',
    'Risk mitigation planned',
    'Context usage < 40%',
    'Summary created (500 tokens)'
  ],
  EXEC: [
    'PRD requirements met',
    'Tests passing',
    'Lint checks passing', 
    'Type checks passing',
    'Build successful',
    'CI/CD green',
    'Documentation updated',
    'Context usage < 60%',
    'Summary created (500 tokens)'
  ]
};

async function validateChecklist(agent) {
  console.log(`\n🔍 LEO Protocol v4.0 - ${agent} Agent Handoff Validation`);
  console.log('=' .repeat(60));
  
  const checklist = CHECKLISTS[agent.toUpperCase()];
  if (!checklist) {
    console.error(`❌ Invalid agent: ${agent}`);
    process.exit(1);
  }
  
  let completed = 0;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  for (let i = 0; i < checklist.length; i++) {
    const item = checklist[i];
    
    const answer = await new Promise((resolve) => {
      rl.question(`\n[${i+1}/9] ✅ ${item}\nCompleted? (y/n): `, resolve);
    });
    
    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      completed++;
      console.log('   ✅ COMPLETE');
    } else {
      console.log('   ❌ INCOMPLETE');
    }
  }
  
  rl.close();
  
  console.log('\n' + '=' .repeat(60));
  console.log(`📊 CHECKLIST RESULTS: ${completed}/9 items completed`);
  
  if (completed === 9) {
    console.log('✅ HANDOFF APPROVED - All checklist items complete');
    console.log(`🚀 ${agent} Agent may proceed to handoff`);
    return true;
  } else {
    console.log('❌ HANDOFF BLOCKED - Incomplete checklist');
    console.log(`⚠️  Missing ${9 - completed} required items`);
    console.log('\n📋 LEO Protocol v4.0 requires 9/9 items before handoff');
    console.log('💡 Complete remaining items or request exception approval');
    return false;
  }
}

async function quickValidate(agent) {
  console.log(`\n🔍 ${agent} Agent Quick Validation:`);
  
  // Check for required files
  const checks = {
    LEAD: () => fs.existsSync('strategic_directives') || fs.existsSync('docs/strategic-directives'),
    PLAN: () => fs.existsSync('docs/prds') && fs.readdirSync('docs/prds').some(f => f.startsWith('PRD-')),
    EXEC: () => fs.existsSync('package.json') && fs.existsSync('dist')
  };
  
  const check = checks[agent.toUpperCase()];
  if (check && check()) {
    console.log('✅ Required files present');
  } else {
    console.log('❌ Missing required files');
  }
}

// CLI Interface
const args = process.argv.slice(2);
const command = args[0];
const agent = args[1];

if (!command) {
  console.log(`
🦁 LEO Protocol v4.0 Checklist Validator

Usage:
  node leo-checklist.js validate <LEAD|PLAN|EXEC>  # Interactive validation
  node leo-checklist.js quick <LEAD|PLAN|EXEC>     # Quick file check
  node leo-checklist.js list <LEAD|PLAN|EXEC>      # Show checklist items

Examples:
  node leo-checklist.js validate LEAD
  node leo-checklist.js quick EXEC
  `);
  process.exit(1);
}

switch (command) {
  case 'validate':
    if (!agent) {
      console.error('❌ Please specify agent: LEAD, PLAN, or EXEC');
      process.exit(1);
    }
    validateChecklist(agent);
    break;
    
  case 'quick':
    if (!agent) {
      console.error('❌ Please specify agent: LEAD, PLAN, or EXEC');  
      process.exit(1);
    }
    quickValidate(agent);
    break;
    
  case 'list':
    if (!agent) {
      console.error('❌ Please specify agent: LEAD, PLAN, or EXEC');
      process.exit(1);
    }
    console.log(`\n📋 ${agent.toUpperCase()} Agent Checklist:`);
    CHECKLISTS[agent.toUpperCase()].forEach((item, i) => {
      console.log(`${i+1}. ${item}`);
    });
    break;
    
  default:
    console.error(`❌ Unknown command: ${command}`);
    process.exit(1);
}