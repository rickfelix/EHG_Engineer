#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkFormat() {
  const { data, error } = await supabase
    .from('product_requirements_v2')
    .select('id, functional_requirements')
    .limit(3);

  if (error) {
    console.error('Error:', error);
    return;
  }

  data.forEach(prd => {
    console.log(`\n${prd.id}:`);
    console.log('Type:', typeof prd.functional_requirements);
    console.log('Is Array:', Array.isArray(prd.functional_requirements));
    if (prd.functional_requirements) {
      console.log('First 100 chars:', prd.functional_requirements.toString().substring(0, 100));
    }
  });
}

checkFormat();
