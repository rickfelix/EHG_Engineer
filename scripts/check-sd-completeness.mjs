#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_ANON_KEY
);

async function checkCompleteness() {
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', 'SD-VIDEO-VARIANT-001')
    .single();

  console.log('📊 SD COMPLETENESS CHECK');
  console.log('='.repeat(80));
  
  const fields = [
    'title', 'description', 'business_objectives', 'success_metrics',
    'constraints', 'assumptions', 'risks', 'priority', 'target_application',
    'category', 'scope'
  ];

  fields.forEach(field => {
    const value = sd[field];
    const status = value && (Array.isArray(value) ? value.length > 0 : value.trim().length > 0) ? '✅' : '❌';
    console.log(`${status} ${field}: ${Array.isArray(value) ? `${value.length} items` : value ? `${String(value).substring(0, 50)}...` : 'MISSING'}`);
  });

  console.log('\n' + '='.repeat(80));
}

checkCompleteness();
