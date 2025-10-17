#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data: retro } = await supabase
  .from('retrospectives')
  .select('*')
  .eq('sd_id', 'SD-RECONNECT-009')
  .single();

if (retro) {
  console.log('SD-RECONNECT-009 Retrospective:\n');
  console.log(JSON.stringify(retro, null, 2));
} else {
  console.log('No retrospective found');
}

process.exit(0);
