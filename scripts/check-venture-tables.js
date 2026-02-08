import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const VENTURE_ID = 'f88e4d4f-4f81-43ec-b53f-766e3cea25ce';

async function checkVentureTables() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const tables = [
    'venture_stage_work',
    'venture_stage_history',
    'venture_documents',
    'venture_artifacts',
    'venture_workflow_log',
    'venture_brand_variants',
    'venture_deployment_configs'
  ];

  console.log(`Checking tables for venture ${VENTURE_ID}:\n`);

  for (const table of tables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('venture_id', VENTURE_ID);

      if (error) {
        console.log(`${table}: Table not found or error - ${error.message}`);
      } else {
        console.log(`${table}: ${count || 0} records`);
      }
    } catch (e) {
      console.log(`${table}: Error - ${e.message}`);
    }
  }
}

checkVentureTables();
