#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function completeDeliverables() {
  const sdId = process.argv[2] || 'SD-DOCS-LEO-001';

  console.log(`\n📦 Marking deliverables complete for ${sdId}...`);

  try {
    // Try sd_deliverables table first
    const { data: deliverables1, error: error1 } = await supabase
      .from('sd_deliverables')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('sd_id', sdId)
      .is('completed_at', null)
      .select();

    if (!error1 && deliverables1) {
      console.log(`✅ Updated ${deliverables1.length} deliverable(s) in sd_deliverables`);
    }

    // Try sd_scope_deliverables table
    const { data: deliverables2, error: error2 } = await supabase
      .from('sd_scope_deliverables')
      .update({
        completion_status: 'completed',
        completion_notes: 'Handoff chain completed',
        updated_at: new Date().toISOString()
      })
      .eq('sd_id', sdId)
      .select();

    if (!error2 && deliverables2) {
      console.log(`✅ Updated ${deliverables2.length} deliverable(s) in sd_scope_deliverables`);
    }

    console.log('\n✅ Deliverables marked complete!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

completeDeliverables();
