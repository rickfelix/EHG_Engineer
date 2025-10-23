#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data: prd } = await supabase
  .from('product_requirements_v2')
  .select('*')
  .eq('sd_id', 'SD-VWC-A11Y-002')
  .single();

console.log('Available PRD columns:');
const columns = Object.keys(prd);
columns.forEach(col => console.log('  -', col));
