#!/usr/bin/env node

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getSDDetails() {
  // Get SD details using legacy_id
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('legacy_id', 'SD-FOUNDATION-V3-006')
    .single();

  if (sdError) {
    console.log('SD Error:', sdError.message);
    // Try with id column
    const { data: sd2, error: sdError2 } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', 'SD-FOUNDATION-V3-006')
      .single();

    if (sdError2) {
      console.log('SD Error (id lookup):', sdError2.message);
      return;
    }

    console.log('=== SD DETAILS ===');
    console.log('ID:', sd2.id);
    console.log('Legacy ID:', sd2.legacy_id);
    console.log('Title:', sd2.title);
    console.log('Status:', sd2.status);
    console.log('Phase:', sd2.current_phase);
    console.log('\n');

    // Get PRD details
    const { data: prd, error: prdError } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('sd_id', sd2.id)
      .single();

    if (prdError) {
      console.log('PRD Error:', prdError.message);
      return;
    }

    console.log('=== PRD DETAILS ===');
    console.log('ID:', prd.id);
    console.log('Title:', prd.title);
    console.log('Executive Summary:', prd.executive_summary?.substring(0, 300) + '...');
    console.log('\nRequirements:');
    console.log(JSON.stringify(prd.requirements, null, 2));
    console.log('\nAcceptance Criteria:');
    console.log(JSON.stringify(prd.acceptance_criteria, null, 2));
    console.log('\n');

    // Check for existing user stories
    const { data: stories, error: storiesError } = await supabase
      .from('user_stories')
      .select('*')
      .eq('sd_id', sd2.id);

    console.log('=== EXISTING USER STORIES ===');
    console.log('Count:', stories?.length || 0);
    if (stories && stories.length > 0) {
      stories.forEach(s => {
        console.log(`- ${s.story_key}: ${s.title}`);
      });
    }
    return;
  }

  console.log('=== SD DETAILS ===');
  console.log('ID:', sd.id);
  console.log('Legacy ID:', sd.legacy_id);
  console.log('Title:', sd.title);
  console.log('Status:', sd.status);
  console.log('Phase:', sd.current_phase);
  console.log('\n');

  // Get PRD details
  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('sd_id', sd.id)
    .single();

  if (prdError) {
    console.log('PRD Error:', prdError.message);
    return;
  }

  console.log('=== PRD DETAILS ===');
  console.log('ID:', prd.id);
  console.log('Title:', prd.title);
  console.log('Executive Summary:', prd.executive_summary?.substring(0, 300) + '...');
  console.log('\nRequirements:');
  console.log(JSON.stringify(prd.requirements, null, 2));
  console.log('\nAcceptance Criteria:');
  console.log(JSON.stringify(prd.acceptance_criteria, null, 2));
  console.log('\n');

  // Check for existing user stories
  const { data: stories, error: storiesError } = await supabase
    .from('user_stories')
    .select('*')
    .eq('sd_id', sd.id);

  console.log('=== EXISTING USER STORIES ===');
  console.log('Count:', stories?.length || 0);
  if (stories && stories.length > 0) {
    stories.forEach(s => {
      console.log(`- ${s.story_key}: ${s.title}`);
    });
  }
}

getSDDetails();
