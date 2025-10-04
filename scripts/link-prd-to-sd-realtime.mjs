#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔗 Linking PRD to SD-REALTIME-001...');

const { data, error } = await supabase
  .from('product_requirements_v2')
  .update({
    directive_id: 'SD-REALTIME-001',
    phase: 'planning',
    updated_at: new Date().toISOString()
  })
  .eq('id', 'PRD-d4703d1e-4b2c-43ec-a1df-586d80077a6c')
  .select();

if (error) {
  console.error('❌ Error:', error);
  process.exit(1);
}

console.log('✅ PRD linked to SD-REALTIME-001');
console.log('   PRD ID:', data[0].id);
console.log('   Directive:', data[0].directive_id);
console.log('   Title:', data[0].title);
console.log('   Status:', data[0].status);
console.log('   Phase:', data[0].phase);
