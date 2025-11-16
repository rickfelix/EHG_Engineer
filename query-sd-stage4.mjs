#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '/mnt/c/_EHG/EHG_Engineer/.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Query PRD
const { data: prds, error: prdError } = await supabase
  .from('product_requirements_v2')
  .select('*')
  .eq('directive_id', 'SD-STAGE4-AGENT-PROGRESS-001');

if (prdError) {
  console.error('PRD Query Error:', prdError);
} else {
  console.log('='.repeat(80));
  console.log('PRD FOR SD-STAGE4-AGENT-PROGRESS-001');
  console.log('='.repeat(80));
  console.log(JSON.stringify(prds, null, 2));
}

// Query User Stories
const { data: stories, error: storyError } = await supabase
  .from('user_stories_v2')
  .select('*')
  .eq('sd_id', 'SD-STAGE4-AGENT-PROGRESS-001');

if (storyError) {
  console.error('User Stories Query Error:', storyError);
} else {
  console.log('\n' + '='.repeat(80));
  console.log('USER STORIES FOR SD-STAGE4-AGENT-PROGRESS-001');
  console.log('='.repeat(80));
  console.log(JSON.stringify(stories, null, 2));
}

// Query Deliverables
const { data: deliverables, error: delivError } = await supabase
  .from('sd_scope_deliverables')
  .select('*')
  .eq('sd_id', 'SD-STAGE4-AGENT-PROGRESS-001');

if (delivError) {
  console.error('Deliverables Query Error:', delivError);
} else {
  console.log('\n' + '='.repeat(80));
  console.log('DELIVERABLES FOR SD-STAGE4-AGENT-PROGRESS-001');
  console.log('='.repeat(80));
  console.log(JSON.stringify(deliverables, null, 2));
}
