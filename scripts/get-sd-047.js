#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function getSD() {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('sd_key', 'SD-047');

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.error('SD-047 not found');
    process.exit(1);
  }

  console.log(JSON.stringify(data[0], null, 2));
}

getSD();
