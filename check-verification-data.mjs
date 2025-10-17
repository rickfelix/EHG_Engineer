#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('sd_key', 'SD-RECONNECT-011')
  .single();

console.log('Metadata structure:', JSON.stringify(sd.metadata, null, 2));
