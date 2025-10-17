#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('Examining SD-026 for actual scope...\n');

const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('id', 'SD-026')
  .single();

console.log(`SD-026: ${sd.title}`);
console.log(`Status: ${sd.status}`);
console.log(`Phase: ${sd.current_phase}`);
console.log(`Created: ${new Date(sd.created_at).toLocaleDateString()}`);
console.log(`\nScope:`);
console.log(sd.scope ? sd.scope.substring(0, 500) : 'No scope defined');

// Check for PRD
const { data: prd } = await supabase
  .from('product_requirements_v2')
  .select('id, title')
  .eq('directive_id', 'SD-026')
  .single();

console.log('\nPRD:', prd ? `Exists: ${prd.title}` : 'Not found');

// Check for backlog
const { data: backlog } = await supabase
  .from('sd_backlog_map')
  .select('id')
  .eq('sd_id', 'SD-026');

console.log('Backlog Items:', backlog ? backlog.length : 0);

console.log('\n─── ASSESSMENT ───');
if (!sd.scope || sd.scope.length < 50) {
  console.log('❌ Placeholder SD - No real scope defined');
} else if (!prd) {
  console.log('⚠️  Has scope but no PRD - Stuck at PLAN_DESIGN');
} else {
  console.log('✅ Valid SD with scope and PRD');
}

process.exit(0);
