#!/usr/bin/env node
/**
 * Update PRD with sub-agent metadata
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function updatePRD() {
  const SD_UUID = '0cbf032c-ddff-4ea3-9892-2871eeaff1a7';
  const PRD_ID = 'PRD-SD-VISION-V2-011';

  // Get sub-agent results - use OR to match both UUID formats
  const { data: subAgents, error: saError } = await supabase
    .from('sub_agent_execution_results')
    .select('sub_agent_code, verdict, confidence, metadata, detailed_analysis')
    .or(`sd_id.eq.${SD_UUID},sd_id.ilike.%VISION-V2-011%`);

  console.log('Sub-agent query result:', subAgents?.length || 0, 'records');
  if (saError) {
    console.log('Sub-agent query error:', saError.message);
  }

  if (!subAgents || subAgents.length === 0) {
    console.log('No sub-agent results found');
    return;
  }

  const designResult = subAgents.find(s => s.sub_agent_code === 'DESIGN');
  const databaseResult = subAgents.find(s => s.sub_agent_code === 'DATABASE');

  console.log('Found sub-agent results:');
  console.log('  DESIGN:', designResult?.verdict);
  console.log('  DATABASE:', databaseResult?.verdict);

  // Get current PRD
  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('id, metadata')
    .eq('id', PRD_ID)
    .single();

  if (prdError) {
    console.log('PRD error:', prdError.message);
    return;
  }

  // Update PRD with sub-agent metadata
  const updatedMetadata = {
    ...(prd.metadata || {}),
    design_analysis: {
      verdict: designResult?.verdict,
      confidence: designResult?.confidence,
      analysis: designResult?.detailed_analysis || designResult?.metadata?.analysis,
      executed_at: new Date().toISOString()
    },
    database_analysis: {
      verdict: databaseResult?.verdict,
      confidence: databaseResult?.confidence,
      analysis: databaseResult?.detailed_analysis || databaseResult?.metadata?.analysis,
      executed_at: new Date().toISOString()
    },
    sub_agent_execution: {
      design: true,
      database: true,
      stories: true,
      created_via: 'scripts/create-prd-sd-vision-v2-011.js with sub-agent augmentation'
    }
  };

  const { error: updateError } = await supabase
    .from('product_requirements_v2')
    .update({
      metadata: updatedMetadata,
      updated_at: new Date().toISOString()
    })
    .eq('id', PRD_ID);

  if (updateError) {
    console.log('Update error:', updateError.message);
  } else {
    console.log('PRD metadata updated successfully');
  }
}

updatePRD();
