#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data: sds } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .limit(1);

if (sds && sds.length > 0) {
  const columns = Object.keys(sds[0]);
  console.log('strategic_directives_v2 columns:');
  columns.sort().forEach(col => {
    const value = sds[0][col];
    const type = Array.isArray(value) ? 'array' : typeof value;
    console.log(`  - ${col} (${type})`);
  });
}
