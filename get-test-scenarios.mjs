#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const { data: prd } = await supabase
  .from('product_requirements_v2')
  .select('test_scenarios, acceptance_criteria')
  .eq('sd_key', 'SD-RECONNECT-011')
  .single();

console.log('\n📋 TEST SCENARIOS FROM PRD:\n');
console.log(JSON.stringify(prd?.test_scenarios, null, 2));

console.log('\n✅ ACCEPTANCE CRITERIA:\n');
console.log(JSON.stringify(prd?.acceptance_criteria, null, 2));
