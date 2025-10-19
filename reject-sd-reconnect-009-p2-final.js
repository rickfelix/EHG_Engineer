#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('LEAD Decision: Rejecting SD-RECONNECT-009-P2\n');

// First, get current scope
const { data: current } = await supabase
  .from('strategic_directives_v2')
  .select('scope')
  .eq('id', 'SD-RECONNECT-009-P2')
  .single();

const rejectionNote = `

---
**LEAD REJECTION (SIMPLICITY FIRST)**: 
- Too tactical for full SD (2-4 hours work)
- HelpTooltip component already exists (built in Phase 1)
- Integration work is tech debt cleanup, not strategic initiative
- Phase 1 retrospective noted: "HelpTooltip built but not integrated"
- Recommended: Convert to GitHub issue instead
- Estimated effort: 2-4 hours (15 UI location integrations + analytics)
`;

const updatedScope = (current?.scope || '') + rejectionNote;

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .update({
    status: 'rejected',
    scope: updatedScope,
    updated_at: new Date().toISOString()
  })
  .eq('id', 'SD-RECONNECT-009-P2')
  .select('id, status');

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

console.log('✅ SD-RECONNECT-009-P2 rejected');
console.log('   Status: rejected');
console.log('   Reason: Too tactical - tech debt cleanup, not strategic');
console.log('\n📋 Moving to next draft SD for LEAD evaluation\n');

process.exit(0);
