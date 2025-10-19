#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Check sub-agent executions
const { data: subAgents, error } = await supabase
  .from('sub_agent_execution_results')
  .select('*')
  .eq('sd_id', 'SD-AGENT-MIGRATION-001')
  .order('created_at', { ascending: false });

if (error) {
  console.log('⚠️  Sub-agent table error:', error.message);
} else if (!subAgents || subAgents.length === 0) {
  console.log('❌ ROOT CAUSE #5: NO SUB-AGENT VERIFICATIONS\n');
  console.log('CRITICAL: No sub-agents verified this SD!\n');
  console.log('Missing verifications:');
  console.log('  - QA Director: Should verify all features work');
  console.log('  - Design Agent: Should verify all 4 UI features exist');
  console.log('  - Systems Analyst: Should check for missing components');
  console.log('  - Database Architect: Should verify schema + seed data\n');
} else {
  console.log(`✅ Found ${subAgents.length} sub-agent executions:\n`);
  subAgents.forEach((sa, idx) => {
    console.log(`${idx + 1}. ${sa.sub_agent_code}: ${sa.verdict}`);
    console.log(`   Created: ${new Date(sa.created_at).toLocaleString()}`);
    console.log(`   Confidence: ${sa.confidence_score}%`);

    if (sa.phase_results) {
      console.log(`   Phase Results:`, JSON.stringify(sa.phase_results, null, 2));
    }

    if (sa.recommendations && sa.recommendations.length > 0) {
      console.log(`   Recommendations:`);
      sa.recommendations.forEach((rec, i) => {
        console.log(`     ${i + 1}. ${rec}`);
      });
    }
    console.log('');
  });
}
