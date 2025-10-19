#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

// Check SD metadata for handoff storage pattern
const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('sd_key', 'SD-RECONNECT-011')
  .single();

console.log('EXEC→PLAN handoff from metadata:');
console.log(JSON.stringify(sd.metadata?.exec_plan_handoff, null, 2));

// Check if handoff data is stored in metadata only
if (sd.metadata?.exec_plan_handoff) {
  console.log('\n✅ Handoffs are stored in SD metadata, not separate table');
  console.log('Field: metadata.exec_plan_handoff');
}
