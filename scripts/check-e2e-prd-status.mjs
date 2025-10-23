#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Check SD metadata
const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('id', 'SD-E2E-INFRASTRUCTURE-001')
  .single();

console.log('📋 SD Metadata:');
console.log(JSON.stringify(sd?.metadata, null, 2));
console.log('');

// Check all E2E PRDs
const { data: prds } = await supabase
  .from('product_requirements_v2')
  .select('id, title, status')
  .or('title.ilike.%E2E%,id.ilike.%E2E%');

console.log('📄 E2E-related PRDs:');
prds?.forEach(prd => {
  console.log(`  - ${prd.id}`);
  console.log(`    Title: ${prd.title}`);
  console.log(`    Status: ${prd.status}`);
  console.log('');
});
