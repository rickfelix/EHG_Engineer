#!/usr/bin/env node

/**
 * LEAD Approval for SD-QUALITY-002
 * Test Coverage Policy by LOC Threshold
 *
 * Over-Engineering Score: 7/30 (LOW RISK)
 * Decision: APPROVE
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔍 LEAD APPROVAL: SD-QUALITY-002');
console.log('═'.repeat(60));
console.log('');

// Update SD to active status
const { data: sd, error: sdError } = await supabase
  .from('strategic_directives_v2')
  .update({
    status: 'active',
    approved_by: 'LEAD Agent',
    approval_date: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: {
      ...((await supabase.from('strategic_directives_v2').select('metadata').eq('sd_key', 'SD-QUALITY-002').single()).data.metadata),
      lead_approval: {
        approved_at: new Date().toISOString(),
        approved_by: 'LEAD Agent',
        decision: 'APPROVED',
        over_engineering_score: '7/30',
        risk_level: 'LOW',
        rationale: [
          'Simple scope: Create policy table with 3 tiers',
          'Uses existing infrastructure: QA sub-agent already exists',
          'Clear LOC thresholds: <20 optional, 20-50 recommended, >50 required',
          'Minimal dependencies: Just database migration + QA integration',
          'Quick win: 1 hour estimated effort',
          'High value: Eliminates test coverage ambiguity'
        ],
        simplicity_checks: [
          '✓ No new frameworks or libraries',
          '✓ No complex algorithms or state management',
          '✓ Database-first: Single table with 3 rows',
          '✓ YAGNI compliant: Solves real problem from retrospectives',
          '✓ Pragmatic: Policy-driven decisions reduce debate'
        ]
      }
    }
  })
  .eq('sd_key', 'SD-QUALITY-002')
  .select();

if (sdError) {
  console.error('❌ Error updating SD:', sdError);
  process.exit(1);
}

console.log('✅ SD-QUALITY-002 APPROVED');
console.log('');
console.log('📊 APPROVAL SUMMARY');
console.log('─'.repeat(60));
console.log('  Status:', sd[0].status);
console.log('  Approved By:', sd[0].approved_by);
console.log('  Approval Date:', sd[0].approval_date);
console.log('  Over-Engineering Score: 7/30 (LOW RISK)');
console.log('');
console.log('🎯 NEXT STEP: Create LEAD→PLAN handoff');
console.log('   Command: node scripts/unified-handoff-system.js LEAD-to-PLAN ' + sd[0].id);
console.log('');
