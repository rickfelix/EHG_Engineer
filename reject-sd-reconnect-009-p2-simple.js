#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('LEAD Decision: Rejecting SD-RECONNECT-009-P2\n');

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .update({
    status: 'rejected',
    notes: 'LEAD REJECTION (SIMPLICITY FIRST): Too tactical for full SD. HelpTooltip integration is tech debt cleanup from incomplete SD-RECONNECT-009 Phase 1 (retrospective noted "HelpTooltip built but not integrated"). Estimated 2-4 hours work. Recommended: Convert to GitHub issue instead.',
    updated_at: new Date().toISOString()
  })
  .eq('id', 'SD-RECONNECT-009-P2')
  .select();

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

console.log('✅ SD-RECONNECT-009-P2 rejected');
console.log('   Status: rejected');
console.log('   Reason: Too tactical - tech debt cleanup, not strategic');
console.log('   Alternative: GitHub issue for 2-4 hour task');
console.log('\n📋 Moving to next draft SD for LEAD evaluation');

process.exit(0);
