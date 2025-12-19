#!/usr/bin/env node

/**
 * Query user stories for SD-HARDENING-V2-001A
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function queryUserStories() {
  const { data, error } = await supabase
    .from('user_stories')
    .select('id, story_key, title, user_role, user_want, user_benefit, acceptance_criteria')
    .ilike('prd_id', '%PRD-SD-HARDENING-V2-001A%')
    .order('story_key');

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  console.log(JSON.stringify(data, null, 2));
}

queryUserStories();
