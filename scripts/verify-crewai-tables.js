#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Connect to EHG database (customer-facing app)
const supabase = createClient(
  process.env.EHG_SUPABASE_URL,
  process.env.EHG_SUPABASE_ANON_KEY
);

async function verifyCrewAITables() {
  console.log('=== Verifying CrewAI Flows Tables in EHG Database ===\n');

  // Check crewai_flows table
  try {
    const { data: _flows, error: flowsError } = await supabase
      .from('crewai_flows')
      .select('id')
      .limit(1);

    if (flowsError) {
      console.log('❌ crewai_flows table: NOT FOUND or NO ACCESS');
      console.log('   Error:', flowsError.message);
    } else {
      console.log('✅ crewai_flows table: EXISTS and ACCESSIBLE');
    }
  } catch (err) {
    console.log('❌ crewai_flows table: ERROR');
    console.log('   Error:', err.message);
  }

  // Check crewai_flow_executions table
  try {
    const { data: _executions, error: executionsError } = await supabase
      .from('crewai_flow_executions')
      .select('id')
      .limit(1);

    if (executionsError) {
      console.log('❌ crewai_flow_executions table: NOT FOUND or NO ACCESS');
      console.log('   Error:', executionsError.message);
    } else {
      console.log('✅ crewai_flow_executions table: EXISTS and ACCESSIBLE');
    }
  } catch (err) {
    console.log('❌ crewai_flow_executions table: ERROR');
    console.log('   Error:', err.message);
  }

  // Check crewai_flow_templates table
  try {
    const { data: templates, error: templatesError } = await supabase
      .from('crewai_flow_templates')
      .select('id, template_name')
      .limit(5);

    if (templatesError) {
      console.log('❌ crewai_flow_templates table: NOT FOUND or NO ACCESS');
      console.log('   Error:', templatesError.message);
    } else {
      console.log('✅ crewai_flow_templates table: EXISTS and ACCESSIBLE');
      if (templates && templates.length > 0) {
        console.log(`   Found ${templates.length} templates:`);
        templates.forEach(t => console.log(`   - ${t.template_name}`));
      } else {
        console.log('   No templates found (table is empty)');
      }
    }
  } catch (err) {
    console.log('❌ crewai_flow_templates table: ERROR');
    console.log('   Error:', err.message);
  }

  console.log('\n=== Verification Complete ===');
}

verifyCrewAITables();
