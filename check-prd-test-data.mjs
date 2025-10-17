#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const { data: prd } = await supabase
  .from('product_requirements_v2')
  .select('*')
  .eq('sd_key', 'SD-RECONNECT-011')
  .single();

// Check for test-related fields
const testFields = Object.keys(prd || {}).filter(k => 
  k.includes('test') || k.includes('accept') || k.includes('scenario') || k.includes('criteria')
);

console.log('Test-related fields in PRD:', testFields);

// Check metadata for test info
if (prd?.metadata) {
  console.log('\nMetadata keys:', Object.keys(prd.metadata));
}

// Check specific fields
if (prd?.testing_strategy) {
  console.log('\nTesting Strategy:', prd.testing_strategy);
}
