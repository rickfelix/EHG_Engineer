#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('Checking SD-RECONNECT-009 (Original Phase 1)\n');

const { data: sd, error } = await supabase
  .from('strategic_directives_v2')
  .select('id, title, status, scope, progress')
  .eq('id', 'SD-RECONNECT-009')
  .single();

if (error) {
  console.log('SD-RECONNECT-009 not found in database');
  process.exit(0);
}

console.log(`SD: ${sd.id}`);
console.log(`Title: ${sd.title}`);
console.log(`Status: ${sd.status}`);
console.log(`Progress: ${sd.progress}%`);
console.log('\nScope:');
console.log(sd.scope);

process.exit(0);
