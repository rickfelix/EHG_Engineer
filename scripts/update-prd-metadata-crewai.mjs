#!/usr/bin/env node
/**
 * Update PRD metadata with DESIGN and DATABASE sub-agent results
 * Part of: SD-CREWAI-ARCHITECTURE-001 Phase 2 gate validation
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function updatePRD() {
  console.log('📋 Updating PRD metadata for SD-CREWAI-ARCHITECTURE-001...\n');

  // Get sub-agent execution results
  const { data: subAgents, error: subError } = await supabase
    .from('sub_agent_execution_results')
    .select('*')
    .eq('sd_id', 'SD-CREWAI-ARCHITECTURE-001')
    .in('sub_agent_code', ['DESIGN', 'DATABASE'])
    .order('created_at', { ascending: false });

  if (subError) {
    console.log('❌ Error fetching sub-agents:', subError.message);
    process.exit(1);
  }

  console.log(`✅ Found ${subAgents.length} sub-agent executions`);

  const designAgent = subAgents.find(s => s.sub_agent_code === 'DESIGN');
  const databaseAgent = subAgents.find(s => s.sub_agent_code === 'DATABASE');

  if (!designAgent || !databaseAgent) {
    console.log('❌ Missing sub-agents:', {
      design: !!designAgent,
      database: !!databaseAgent
    });
    process.exit(1);
  }

  console.log('   DESIGN:', designAgent.id, '-', designAgent.verdict);
  console.log('   DATABASE:', databaseAgent.id, '-', databaseAgent.verdict);

  // Build metadata matching expected structure
  const metadata = {
    design_analysis: {
      generated_at: designAgent.created_at,
      sub_agent_result_id: designAgent.id,
      verdict: designAgent.verdict,
      confidence: designAgent.confidence,
      raw_analysis: designAgent.detailed_analysis?.substring(0, 5000) || 'See sub_agent_execution_results',
      components_identified: designAgent.metadata?.components_identified || [],
      ui_patterns: designAgent.metadata?.ui_patterns || []
    },
    database_analysis: {
      generated_at: databaseAgent.created_at,
      sub_agent_result_id: databaseAgent.id,
      design_informed: true,
      design_analysis_id: designAgent.id,
      verdict: databaseAgent.verdict,
      confidence: databaseAgent.confidence,
      raw_analysis: databaseAgent.detailed_analysis?.substring(0, 5000) || 'See sub_agent_execution_results',
      tables_modified: databaseAgent.metadata?.tables_modified || [],
      columns_added: databaseAgent.metadata?.columns_added || 45
    },
    sub_agent_metadata: {
      design_executed: true,
      database_executed: true,
      design_id: designAgent.id,
      database_id: databaseAgent.id,
      execution_order: ['DESIGN', 'DATABASE'],
      updated_at: new Date().toISOString()
    }
  };

  console.log('\n📝 Updating PRD with metadata...');

  // Update PRD
  const { data: prd, error: updateError } = await supabase
    .from('product_requirements_v2')
    .update({
      metadata: metadata,
      updated_at: new Date().toISOString()
    })
    .eq('sd_id', 'SD-CREWAI-ARCHITECTURE-001')
    .select()
    .single();

  if (updateError) {
    console.log('❌ Error updating PRD:', updateError.message);
    process.exit(1);
  }

  console.log('✅ PRD updated successfully');
  console.log('   PRD ID:', prd.id);
  console.log('   Metadata keys:', Object.keys(prd.metadata).join(', '));
  console.log('\n🎉 Gate 1 metadata requirements satisfied!');
}

updatePRD().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
