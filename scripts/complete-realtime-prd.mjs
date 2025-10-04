#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('📝 Updating PRD status to completed...');

const { data, error } = await supabase
  .from('product_requirements_v2')
  .update({
    status: 'completed',
    phase: 'verification',
    progress: 100,
    actual_end: new Date().toISOString(),
    phase_progress: {
      phase_1_audit: 'completed',
      phase_2_documentation: 'deferred',
      phase_3_template: 'deferred',
      phase_4_migration: 'deferred',
      completion_rationale: 'Scope reduced by LEAD to audit-only. Template development deferred to future SD based on demonstrated need.',
      audit_completion: new Date().toISOString()
    },
    updated_at: new Date().toISOString()
  })
  .eq('id', 'PRD-d4703d1e-4b2c-43ec-a1df-586d80077a6c')
  .select();

if (error) {
  console.error('❌ Error updating PRD:', error);
  process.exit(1);
}

console.log('✅ PRD updated successfully');
console.log('   Status:', data[0].status);
console.log('   Phase:', data[0].phase);
console.log('   Progress:', data[0].progress + '%');
console.log('   Completion Date:', data[0].actual_end);
