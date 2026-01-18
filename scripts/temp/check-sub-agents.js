import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSubAgents() {
  // Check for existing sub-agent executions for this SD
  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .select('*')
    .eq('sd_id', 'SD-QUALITY-UI-001')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  console.log('Sub-agent executions for SD-QUALITY-UI-001:');
  if (!data || data.length === 0) {
    console.log('  No sub-agent executions found - need to run DESIGN and DATABASE');
  } else {
    data.forEach(row => {
      console.log('  -', row.sub_agent_code, '|', row.verdict || 'no verdict', '|', row.created_at);
    });
  }
}

checkSubAgents();
