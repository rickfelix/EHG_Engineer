#!/usr/bin/env node
/**
 * Accept PLAN→LEAD Handoff for SD-INFRA-VALIDATION
 * Uses accept_phase_handoff() RPC function
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const HANDOFF_ID = '8207802c-a9fb-4012-8e35-c7de8dff3f4a';

console.log('🔄 ACCEPTING PLAN→LEAD HANDOFF');
console.log('═══════════════════════════════════════════════════════════\n');
console.log('Handoff ID:', HANDOFF_ID);
console.log('SD: SD-INFRA-VALIDATION\n');

const { data, error } = await supabase.rpc('accept_phase_handoff', {
  handoff_id_param: HANDOFF_ID
});

if (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

console.log('✅ PLAN→LEAD HANDOFF ACCEPTED');
console.log('═══════════════════════════════════════════════════════════');
console.log('   Status:', data.status);
console.log('   Accepted At:', data.accepted_at);
console.log('\n📌 NEXT: LEAD Final Approval actions\n');
