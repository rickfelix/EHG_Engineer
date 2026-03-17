#!/usr/bin/env node

/**
 * Check sub-agent personas for validation framework updates
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function checkSubAgents() {
  console.log('🔍 Checking sub-agent personas...\n');

  const { data: subAgents, error } = await supabase
    .from('leo_sub_agents')
    .select('*')
    .order('code');

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  console.log(`Found ${subAgents.length} sub-agents:\n`);

  // Keywords to check for in personas
  const validationKeywords = [
    'validation', 'gate', 'threshold', 'testing', 
    'handoff', 'quality', 'fidelity', 'traceability'
  ];

  subAgents.forEach((agent, idx) => {
    const persona = agent.backstory || agent.persona || '';
    const hasValidationRefs = validationKeywords.some(kw => 
      persona.toLowerCase().includes(kw)
    );

    console.log(`${idx + 1}. ${agent.code} - ${agent.name}`);
    console.log(`   Active: ${agent.is_active ? '✅' : '❌'}`);
    console.log(`   Phase: ${agent.execution_phase || 'N/A'}`);
    
    if (hasValidationRefs) {
      console.log('   ⚠️  Contains validation-related content');
      const matches = validationKeywords.filter(kw => 
        persona.toLowerCase().includes(kw)
      );
      console.log(`   Keywords: ${matches.join(', ')}`);
    }
    
    console.log(`   Persona length: ${persona.length} chars`);
    console.log('');
  });

  // Check for specific sub-agents that might need updates
  const criticalAgents = ['TESTING', 'VALIDATION', 'DATABASE', 'DESIGN'];
  
  console.log('\n🎯 Critical sub-agents for validation framework:\n');
  
  criticalAgents.forEach(code => {
    const agent = subAgents.find(a => a.code === code);
    if (agent) {
      console.log(`✅ ${code} exists (${agent.is_active ? 'ACTIVE' : 'INACTIVE'})`);
      const persona = agent.backstory || agent.persona || '';
      
      // Check for specific validation framework terms
      const hasAdaptiveThreshold = persona.includes('adaptive') || persona.includes('threshold');
      const hasGateSystem = persona.includes('gate') && persona.includes('validation');
      const hasPhaseAware = persona.includes('phase-aware') || persona.includes('phase aware');
      
      if (hasAdaptiveThreshold) console.log('   📊 Mentions adaptive/threshold');
      if (hasGateSystem) console.log('   🚪 Mentions gate validation');
      if (hasPhaseAware) console.log('   📈 Mentions phase-aware');
      
      if (!hasAdaptiveThreshold && !hasGateSystem && !hasPhaseAware) {
        console.log('   ⚠️  MAY NEED UPDATE - No validation framework mentions');
      }
    } else {
      console.log(`❌ ${code} not found`);
    }
  });
}

checkSubAgents().then(() => process.exit(0));
