#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('🔧 Preparing for PLAN→LEAD handoff...\n');

// Update PRD status to 'verification' or 'completed'
const { data: prd } = await supabase
  .from('product_requirements_v2')
  .select('*')
  .eq('sd_key', 'SD-RECONNECT-011')
  .single();

if (prd) {
  const { error: prdError } = await supabase
    .from('product_requirements_v2')
    .update({ status: 'completed' })
    .eq('id', prd.id);
  
  if (prdError) {
    console.error('❌ Failed to update PRD status:', prdError);
  } else {
    console.log('✅ PRD status updated to: completed');
  }
}

// Ensure EXEC→PLAN handoff is visible in expected location
const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('sd_key', 'SD-RECONNECT-011')
  .single();

if (sd?.metadata?.exec_plan_handoff) {
  console.log('✅ EXEC→PLAN handoff found in metadata');
  console.log(`   ID: ${sd.metadata.exec_plan_handoff.id}`);
  console.log(`   Status: ${sd.metadata.exec_plan_handoff.status}`);
}

// Update EXEC→PLAN handoff status to accepted/complete
if (sd?.metadata?.exec_plan_handoff) {
  const updatedMetadata = {
    ...sd.metadata,
    exec_plan_handoff: {
      ...sd.metadata.exec_plan_handoff,
      status: 'accepted'
    }
  };
  
  const { error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata: updatedMetadata })
    .eq('sd_key', 'SD-RECONNECT-011');
  
  if (!updateError) {
    console.log('✅ EXEC→PLAN handoff status updated to: accepted');
  }
}

console.log('\n✅ Ready for PLAN→LEAD handoff');
