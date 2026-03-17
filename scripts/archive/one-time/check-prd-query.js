#!/usr/bin/env node

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkPRD() {
  const SD_UUID = '0cbf032c-ddff-4ea3-9892-2871eeaff1a7';

  // Check all PRDs for this SD
  const { data, error } = await supabase
    .from('product_requirements_v2')
    .select('id, sd_id, directive_id, title, metadata')
    .or(`sd_id.eq.${SD_UUID},directive_id.eq.SD-VISION-V2-011`);

  console.log('PRDs found:', data?.length || 0);
  if (data) {
    data.forEach(p => {
      console.log('---');
      console.log('ID:', p.id);
      console.log('SD_ID:', p.sd_id);
      console.log('directive_id:', p.directive_id);
      console.log('Has design_analysis:', p.metadata?.design_analysis ? 'YES' : 'NO');
      console.log('Has database_analysis:', p.metadata?.database_analysis ? 'YES' : 'NO');
      console.log('sub_agent_execution:', JSON.stringify(p.metadata?.sub_agent_execution));
    });
  }
  if (error) console.log('Error:', error.message);
}

checkPRD();
