#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔍 Checking product_requirements_v2 Schema\n');

// Query an existing PRD to see what columns are available
const { data: existingPRDs, error } = await supabase
  .from('product_requirements_v2')
  .select('*')
  .limit(1);

if (error) {
  console.error('❌ Error querying PRDs:', error);
  process.exit(1);
}

if (existingPRDs && existingPRDs.length > 0) {
  console.log('📋 Available Columns in product_requirements_v2:');
  console.log(Object.keys(existingPRDs[0]).join(', '));
  console.log('\n📝 Example PRD Structure:');
  console.log(JSON.stringify(existingPRDs[0], null, 2).substring(0, 1000) + '...');
} else {
  console.log('⚠️ No existing PRDs found. Cannot determine schema.');
}
