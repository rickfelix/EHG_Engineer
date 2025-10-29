#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function checkAgents() {
  const { data: agents, error } = await supabase
    .from('leo_sub_agents')
    .select('*')
    .in('code', ['TESTING', 'VALIDATION', 'DATABASE', 'DESIGN']);

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  console.log('🔍 Checking sub-agents relevant to validation framework:\n');
  console.log('='.repeat(70));

  const validationTerms = [
    'gate', 'validation', 'threshold', 'adaptive', 'fidelity',
    'traceability', 'pattern', 'handoff', 'phase-aware', 'non-negotiable'
  ];

  agents.forEach(agent => {
    console.log(`\n📋 ${agent.code} - ${agent.name}`);
    console.log(`   Active: ${agent.active ? '✅' : '❌'}`);
    console.log(`   Priority: ${agent.priority}`);
    
    const description = agent.description || '';
    console.log(`   Description length: ${description.length} chars`);
    
    // Check for validation framework terms
    const foundTerms = validationTerms.filter(term => 
      description.toLowerCase().includes(term)
    );
    
    if (foundTerms.length > 0) {
      console.log(`   ✅ Mentions: ${foundTerms.join(', ')}`);
    } else {
      console.log('   ⚠️  NO validation framework terms found');
    }

    // Check metadata for updates
    if (agent.metadata) {
      console.log(`   Last updated: ${agent.metadata.last_updated || 'N/A'}`);
      console.log(`   Version: ${agent.metadata.version || 'N/A'}`);
      
      // Check success/failure patterns
      const successPatterns = agent.metadata.success_patterns || [];
      const failurePatterns = agent.metadata.failure_patterns || [];
      
      const hasValidationPatterns = [...successPatterns, ...failurePatterns].some(p => 
        validationTerms.some(term => p.toLowerCase().includes(term))
      );
      
      if (hasValidationPatterns) {
        console.log('   ✅ Has validation-related patterns in metadata');
      }
    }

    // Show excerpt of description
    if (description.length > 0) {
      console.log('\n   📝 Description excerpt:');
      console.log(`   "${description.substring(0, 200)}..."`);
    }
  });

  console.log('\n' + '='.repeat(70));
  console.log('\n🎯 Recommendation:\n');
  
  agents.forEach(agent => {
    const description = agent.description || '';
    const foundTerms = validationTerms.filter(term => 
      description.toLowerCase().includes(term)
    );
    
    if (foundTerms.length === 0 && agent.active) {
      console.log(`⚠️  ${agent.code}: Consider updating to mention validation framework`);
      
      if (agent.code === 'TESTING') {
        console.log('   - Should reference Gate 2 (implementation fidelity)');
        console.log('   - BLOCKED verdict for zero test execution (not CONDITIONAL_PASS)');
        console.log('   - Mention non-negotiable testing requirements');
      }
      
      if (agent.code === 'VALIDATION') {
        console.log('   - Should reference 4-gate validation system');
        console.log('   - Adaptive thresholds (70-100%)');
        console.log('   - Phase-aware weighting');
      }
      
      if (agent.code === 'DATABASE') {
        console.log('   - Should reference Gate 1 (DESIGN→DATABASE validation)');
        console.log('   - Migration execution verification');
      }
      
      if (agent.code === 'DESIGN') {
        console.log('   - Should reference Gate 1 (DESIGN→DATABASE validation)');
        console.log('   - Design fidelity checks in Gate 2');
      }
    }
  });
}

checkAgents().then(() => process.exit(0));
