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
    .eq('sd_key', 'SD-2025-09-11-ventures-list-consolidated')
    .single();

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  console.log('=== SD-2025-09-11: Ventures List Consolidated ===\n');
  console.log('Title:', data.title);
  console.log('Status:', data.status);
  console.log('Priority:', data.priority);
  console.log('\nDescription:');
  console.log(data.description);
  console.log('\nScope:');
  console.log(data.scope);
  console.log('\nStrategic Objectives:');
  console.log(data.strategic_objectives);
}

getSD();
