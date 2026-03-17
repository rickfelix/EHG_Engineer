#!/usr/bin/env node

/**
 * Archive SD-2025-09-11: Ventures List Consolidated
 * Reason: User requested split into focused SDs (SD-047A Timeline, SD-047B Documents)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function archiveSD() {
  console.log('📋 Archiving SD-2025-09-11: Ventures List Consolidated\n');

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({
      status: 'cancelled',
      metadata: {
        cancellation_reason: 'User requested split into focused Strategic Directives',
        replacement_sds: [
          'SD-047A: Venture Timeline Tab (25-30h)',
          'SD-047B: Venture Documents Tab (30-35h)'
        ],
        original_scope_preserved: true,
        cancelled_date: new Date().toISOString(),
        lead_handoff_preserved: true,
        note: 'User wanted both Timeline and Documents built properly, not deferred'
      }
    })
    .eq('sd_key', 'SD-2025-09-11-ventures-list-consolidated')
    .select();

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.error('❌ SD-2025-09-11 not found');
    process.exit(1);
  }

  console.log('✅ SD-2025-09-11 archived successfully\n');
  console.log('📊 Details:');
  console.log('   Status: cancelled');
  console.log('   Reason: Split into focused SDs for proper planning');
  console.log('   Replacement SDs: SD-047A (Timeline), SD-047B (Documents)');
  console.log('\n✅ Ready to create new Strategic Directives\n');
}

archiveSD();
