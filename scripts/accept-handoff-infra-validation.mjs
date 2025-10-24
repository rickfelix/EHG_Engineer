#!/usr/bin/env node
/**
 * Accept EXEC→PLAN Handoff for SD-INFRA-VALIDATION
 *
 * Uses accept_phase_handoff() RPC function to bypass RLS
 * SD: SD-INFRA-VALIDATION
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const HANDOFF_ID = 'af6fc12d-f352-491b-9ff7-58b3c268a951';

console.log('🔄 ACCEPTING EXEC→PLAN HANDOFF');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('Handoff ID:', HANDOFF_ID);
console.log('SD: SD-INFRA-VALIDATION');
console.log('Method: accept_phase_handoff() RPC function\n');

// Accept handoff using RPC function
console.log('📝 Calling accept_phase_handoff()...\n');

const { data, error } = await supabase.rpc('accept_phase_handoff', {
  handoff_id_param: HANDOFF_ID
});

if (error) {
  console.error('❌ Error accepting handoff:', error.message);
  console.error('   Code:', error.code);
  console.error('   Details:', error.details);
  process.exit(1);
}

console.log('✅ HANDOFF ACCEPTED SUCCESSFULLY');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('📋 Accepted Handoff Details:');
console.log('   ID:', data.id);
console.log('   SD:', data.sd_id);
console.log('   From→To:', `${data.from_phase}→${data.to_phase}`);
console.log('   Status:', data.status);
console.log('   Accepted At:', data.accepted_at);
console.log('');

console.log('📌 NEXT STEPS (PLAN Verification Phase):');
console.log('   1. Run verification sub-agents');
console.log('      - TESTING: node scripts/execute-subagent.js --code TESTING --sd-id SD-INFRA-VALIDATION');
console.log('      - GITHUB: node scripts/execute-subagent.js --code GITHUB --sd-id SD-INFRA-VALIDATION');
console.log('      - DOCMON: node scripts/execute-subagent.js --code DOCMON --sd-id SD-INFRA-VALIDATION');
console.log('   2. Aggregate verification results (≥85% confidence)');
console.log('   3. Run comprehensive verification: node scripts/verify-sd-infra-validation.mjs');
console.log('   4. Create PLAN→LEAD handoff');
console.log('');

console.log('═══════════════════════════════════════════════════════════\n');
