#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

await supabase
  .from('strategic_directives_v2')
  .update({ progress: 10 })
  .eq('id', 'SD-AGENT-ADMIN-001');

console.log('✅ Progress updated to 10% (PRD Created)');
