#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function checkFrameworkRefs() {
  const { data: agents, error } = await supabase
    .from('leo_sub_agents')
    .select('code, name, description, metadata')
    .in('code', ['TESTING', 'VALIDATION']);

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  console.log('🔍 Checking for NEW validation framework references:\n');
  
  const newFrameworkTerms = {
    'Gate 1': 'Gate 1 (DESIGN→DATABASE validation)',
    'Gate 2': 'Gate 2 (Implementation fidelity)',
    'Gate 3': 'Gate 3 (Traceability)',
    'Gate 4': 'Gate 4 (Workflow ROI)',
    'adaptive threshold': 'Adaptive thresholds (70-100%)',
    'phase-aware': 'Phase-aware weighting',
    'non-negotiable': 'Non-negotiable blockers',
    'pattern tracking': 'Pattern tracking / maturity bonuses',
    'hybrid validation': 'Hybrid validation (Phase 1/2)',
    'BLOCKED verdict': 'BLOCKED verdict (TESTING change)',
    '70-100%': 'Threshold range 70-100%',
    'validation-enforcement.md': 'New docs reference'
  };

  agents.forEach(agent => {
    console.log('='.repeat(70));
    console.log(`\n📋 ${agent.code} - ${agent.name}\n`);
    
    const fullText = (agent.description + JSON.stringify(agent.metadata)).toLowerCase();
    
    let foundCount = 0;
    let missingTerms = [];
    
    Object.entries(newFrameworkTerms).forEach(([term, description]) => {
      const found = fullText.includes(term.toLowerCase());
      if (found) {
        console.log(`✅ ${description}`);
        foundCount++;
      } else {
        missingTerms.push(description);
      }
    });
    
    console.log(`\n📊 Coverage: ${foundCount}/${Object.keys(newFrameworkTerms).length} terms found`);
    
    if (missingTerms.length > 0) {
      console.log('\n⚠️  Missing references:');
      missingTerms.forEach(term => console.log(`   - ${term}`));
    }

    // Check last update date
    const lastUpdated = agent.metadata?.last_updated;
    if (lastUpdated) {
      const updateDate = new Date(lastUpdated);
      const frameworkDate = new Date('2025-10-28'); // Today's date when framework was implemented
      
      if (updateDate < frameworkDate) {
        console.log(`\n⏰ Last updated: ${lastUpdated} (BEFORE validation framework)`);
        console.log('   ⚠️  NEEDS UPDATE to reflect new framework');
      } else {
        console.log(`\n⏰ Last updated: ${lastUpdated} (After validation framework)`);
        console.log('   ✅ Recently updated');
      }
    } else {
      console.log('\n⏰ Last updated: N/A');
    }
  });

  console.log('\n' + '='.repeat(70));
  console.log('\n🎯 RECOMMENDATION:\n');
  
  agents.forEach(agent => {
    const fullText = (agent.description + JSON.stringify(agent.metadata)).toLowerCase();
    
    const hasGate2 = fullText.includes('gate 2');
    const hasGate1to4 = fullText.includes('gate 1') || fullText.includes('gate 3') || fullText.includes('gate 4');
    const hasAdaptive = fullText.includes('adaptive');
    const hasBlocked = fullText.includes('blocked verdict');
    
    if (agent.code === 'TESTING') {
      console.log('\n📋 TESTING Sub-Agent:');
      if (!hasGate2) {
        console.log('   ⚠️  UPDATE NEEDED: Should reference Gate 2 (implementation fidelity)');
        console.log('      - TESTING sub-agent is called during Gate 2 EXEC→PLAN handoff');
        console.log('      - Gate 2 checks TESTING verdict (must be PASS, not BLOCKED)');
      }
      if (!hasBlocked) {
        console.log('   ⚠️  UPDATE NEEDED: Should mention BLOCKED verdict for zero tests');
        console.log('      - We changed testing.js to return BLOCKED (not CONDITIONAL_PASS)');
        console.log('      - This is a non-negotiable blocker in Gate 2');
      }
      if (hasGate2 && hasBlocked) {
        console.log('   ✅ Already references Gate 2 and BLOCKED verdict');
      }
    }
    
    if (agent.code === 'VALIDATION') {
      console.log('\n📋 VALIDATION Sub-Agent:');
      if (!hasGate1to4) {
        console.log('   ⚠️  UPDATE NEEDED: Should reference 4-gate validation system');
        console.log('      - Gate 1: DESIGN→DATABASE (readiness)');
        console.log('      - Gate 2: Implementation fidelity (UNIVERSAL)');
        console.log('      - Gate 3: Traceability');
        console.log('      - Gate 4: Workflow ROI & pattern effectiveness');
      }
      if (!hasAdaptive) {
        console.log('   ⚠️  UPDATE NEEDED: Should mention adaptive thresholds');
        console.log('      - Dynamic thresholds 70-100% based on risk/performance/maturity');
        console.log('      - Phase-aware weighting per gate');
        console.log('      - Non-negotiable blockers vs negotiable scoring');
      }
      if (hasGate1to4 && hasAdaptive) {
        console.log('   ✅ Already references gate system and adaptive thresholds');
      }
    }
  });
  
  console.log('\n');
}

checkFrameworkRefs().then(() => process.exit(0));
