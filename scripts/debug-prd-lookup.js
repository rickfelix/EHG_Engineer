#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Check SD structure
const { data: sd, error: sdError } = await supabase
  .from('strategic_directives_v2')
  .select('id, uuid_id')
  .eq('id', 'SD-VISION-V2-006')
  .single();

console.log('SD lookup by id=SD-VISION-V2-006:');
console.log('  SD data:', sd);
console.log('  SD error:', sdError);

// Check PRD structure
const { data: prd, error: prdError } = await supabase
  .from('product_requirements_v2')
  .select('id, sd_id, directive_id')
  .eq('id', 'PRD-SD-VISION-V2-006')
  .single();
  
console.log('');
console.log('PRD lookup by id=PRD-SD-VISION-V2-006:');
console.log('  PRD data:', prd);
console.log('  PRD error:', prdError);

// Try query exactly as verification script does
if (sd) {
  console.log('');
  console.log('PRD lookup using sd.id (as verification script does):');
  const { data: prds, error } = await supabase
    .from('product_requirements_v2')
    .select('id, sd_id')
    .eq('sd_id', sd.id);
  console.log('  Query: .eq(sd_id, ' + sd.id + ')');
  console.log('  Result:', prds);
  console.log('  Error:', error);
}
