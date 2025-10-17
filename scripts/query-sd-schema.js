#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function querySample() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .limit(1)
    .single();
  
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Sample SD fields:');
    console.log(JSON.stringify(data, null, 2));
  }
}

querySample();
