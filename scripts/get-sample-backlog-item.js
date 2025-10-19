#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function getSample() {
  const { data, error } = await supabase
    .from('sd_backlog_map')
    .select('*')
    .not('sd_id', 'is', null)
    .limit(1);

  if (error) {
    console.error('Error:', error);
  } else if (data && data.length > 0) {
    console.log(JSON.stringify(data[0], null, 2));
  } else {
    console.log('No data found');
  }
}

getSample();
