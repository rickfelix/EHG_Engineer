#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('═══════════════════════════════════════════════════════════');
console.log('   LEAD DECISION: CANCEL SELECT * Optimization SD');
console.log('═══════════════════════════════════════════════════════════\n');

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .update({
    status: 'cancelled',
    updated_at: new Date().toISOString()
  })
  .eq('id', '49b6062c-1e22-4f20-85b2-a368eca0a4cd')
  .select('id, status, title');

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

console.log('✅ CANCELLED: SELECT * Query Optimization Enforcement');
console.log('\nReason: SIMPLICITY FIRST - Too Tactical');
console.log('\n📊 SCOPE ANALYSIS:');
console.log('   - Phase 1: Analysis (0.5 hours)');
console.log('   - Phase 2: Migration (1 hour)');
console.log('   - Phase 3: Enforcement (0.5 hours)');
console.log('   Total: 2 hours');
console.log('\n❌ ISSUES:');
console.log('   - 2-hour task does not justify SD overhead');
console.log('   - Code cleanup/tech debt, not strategic');
console.log('   - No PRD/handoffs/retrospective needed');
console.log('   - SD ID is UUID instead of SD-XXX format');
console.log('\n✅ RECOMMENDED ALTERNATIVE:');
console.log('   - Create GitHub issue instead');
console.log('   - Add ESLint rule + pre-commit hook');
console.log('   - Close via regular PR (no LEO Protocol)');
console.log('\n📋 Summary: 3 draft SDs evaluated, 3 cancelled via SIMPLICITY FIRST');
console.log('   Checking for remaining active/pending SDs...\n');

process.exit(0);
