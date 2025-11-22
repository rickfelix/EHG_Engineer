#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data } = await supabase
  .from('user_stories')
  .select('story_key, implementation_context')
  .eq('story_key', 'SD-STAGE4-UX-EDGE-CASES-001:US-001')
  .single();

console.log('\n📝 User Story US-001 Implementation Context:\n');
console.log(data?.implementation_context || 'No context found');
console.log('\n');
