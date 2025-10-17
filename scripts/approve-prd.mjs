#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('✅ Approving PRD for PLAN→EXEC Handoff');

const { error } = await supabase
  .from('product_requirements_v2')
  .update({ status: 'approved' })
  .eq('id', 'PRD-SD-AGENT-ADMIN-001');

if (error) {
  console.error('❌ Error:', error);
  process.exit(1);
}

console.log('✅ PRD status updated to approved');
