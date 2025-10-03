#!/usr/bin/env node
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const prdId = 'PRD-' + randomUUID();
const prdData = {
  id: prdId,
  sd_id: 'SD-BACKEND-002C',
  title: 'Financial Analytics Backend - Modeling & Risk - PRD',
  status: 'approved',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

const { data, error} = await supabase
  .from('product_requirements_v2')
  .insert(prdData)
  .select()
  .single();

if (error) {
  console.error('Error:', error.message);
  process.exit(1);
}

console.log(`✅ PRD created: ${prdId}`);
console.log(`   SD: SD-BACKEND-002C`);
console.log(`   Title: ${data.title}`);
console.log(`   Status: ${data.status}`);
