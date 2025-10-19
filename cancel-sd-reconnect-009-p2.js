#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('═══════════════════════════════════════════════════════════');
console.log('   LEAD DECISION: CANCEL SD-RECONNECT-009-P2');
console.log('═══════════════════════════════════════════════════════════\n');

const rejectionNote = `

---
**LEAD REJECTION (SIMPLICITY FIRST GATE)**: 
- **Too Tactical**: HelpTooltip integration (2-4 hours) not strategic scope
- **Existing Infrastructure**: Component already exists from Phase 1
- **Tech Debt Cleanup**: Phase 1 retrospective noted "HelpTooltip built but not integrated"
- **Recommended Alternative**: GitHub issue instead of full SD
- **Estimated Effort**: 2-4 hours (15 UI integrations + analytics)
- **Why Cancelled**: Full LEO Protocol overhead (PRD, handoffs, retrospective) not justified for tactical task
`;

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .update({
    status: 'cancelled',
    updated_at: new Date().toISOString()
  })
  .eq('id', 'SD-RECONNECT-009-P2')
  .select('id, status, title');

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

console.log('✅ CANCELLED: SD-RECONNECT-009-P2');
console.log(`   Title: ${data[0].title}`);
console.log('   Status: cancelled');
console.log('\nReason: SIMPLICITY FIRST violation');
console.log('  - Too tactical (2-4 hours work)');
console.log('  - Component exists, just needs integration');
console.log('  - Tech debt cleanup, not strategic initiative');
console.log('\nRecommended: Convert to GitHub issue');
console.log('\n📋 Moving to next draft SD...\n');

process.exit(0);
