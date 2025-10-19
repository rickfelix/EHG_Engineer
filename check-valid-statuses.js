#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Query existing SDs to see what statuses are used
const { data: sds } = await supabase
  .from('strategic_directives_v2')
  .select('status')
  .limit(100);

const statuses = [...new Set(sds.map(sd => sd.status))];
console.log('Valid status values found in database:');
console.log(statuses.join(', '));

process.exit(0);
