#!/usr/bin/env node
/**
 * Query SD-VISION-TRANSITION-001D1 and related data
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';

(async () => {
  try {
    console.log('Creating Supabase service client...');
    const supabase = await createSupabaseServiceClient('engineer', { verbose: true });

    console.log('\n=== 1. STRATEGIC DIRECTIVE INFO ===');
    const { data: sdData, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('sd_key', 'SD-VISION-TRANSITION-001D1')
      .single();

    if (sdError) {
      console.log('SD Error:', sdError.message);
      console.log('SD Error Details:', sdError);
    } else if (!sdData) {
      console.log('No SD found with key SD-VISION-TRANSITION-001D1');
    } else {
      console.log(JSON.stringify(sdData, null, 2));

      // Get parent if exists
      if (sdData.parent_sd_key) {
        console.log('\n=== 2. PARENT SD INFO ===');
        const { data: parentData, error: parentError } = await supabase
          .from('strategic_directives_v2')
          .select('*')
          .eq('sd_key', sdData.parent_sd_key)
          .single();

        if (parentError) {
          console.log('Parent Error:', parentError.message);
        } else {
          console.log(JSON.stringify(parentData, null, 2));
        }
      } else {
        console.log('\n=== 2. PARENT SD INFO ===');
        console.log('No parent SD');
      }
    }

    console.log('\n=== 3. LIFECYCLE STAGES 1-5 ===');
    const { data: stagesData, error: stagesError } = await supabase
      .from('lifecycle_stage_config')
      .select('*')
      .gte('stage_number', 1)
      .lte('stage_number', 5)
      .order('stage_number');

    if (stagesError) {
      console.log('Stages Error:', stagesError.message);
    } else if (!stagesData || stagesData.length === 0) {
      console.log('No lifecycle stages found');
    } else {
      stagesData.forEach(stage => {
        console.log(JSON.stringify(stage, null, 2));
      });
    }

    console.log('\n=== 4. LINKED PRD INFO ===');
    const { data: prdData, error: prdError } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('sd_key', 'SD-VISION-TRANSITION-001D1');

    if (prdError) {
      console.log('PRD Error:', prdError.message);
    } else if (!prdData || prdData.length === 0) {
      console.log('No PRD found linked to SD-VISION-TRANSITION-001D1');
    } else {
      prdData.forEach(prd => {
        console.log(JSON.stringify(prd, null, 2));
      });
    }

    console.log('\n=== QUERY COMPLETE ===');

  } catch (error) {
    console.error('Fatal error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
})();
