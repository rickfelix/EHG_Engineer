#!/usr/bin/env node

/**
 * SD-STAGE-08-001 Duplicate Cleanup Script
 * Removes duplicate remediation handoffs since originals already existed
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjUxMTkzNywiZXhwIjoyMDcyMDg3OTM3fQ.tYGfVTDQWQDje4ZPSl5UsprYK9J15Fa-XdGFVScrRZg';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const SD_LEGACY_ID = 'SD-STAGE-08-001';

async function main() {
  console.log('🧹 Cleaning up duplicate handoffs for SD-STAGE-08-001...\n');

  // Get all remediation handoffs
  const { data: remediationHandoffs, error: fetchError } = await supabase
    .from('sd_phase_handoffs')
    .select('id, handoff_type, status, created_at, metadata')
    .eq('sd_id', SD_LEGACY_ID)
    .eq('created_by', 'UNIFIED-HANDOFF-SYSTEM-REMEDIATION')
    .order('created_at', { ascending: true });

  if (fetchError) {
    console.error('❌ Failed to fetch handoffs:', fetchError.message);
    process.exit(1);
  }

  if (!remediationHandoffs || remediationHandoffs.length === 0) {
    console.log('✅ No remediation handoffs found. Nothing to clean up.');
    return;
  }

  console.log(`Found ${remediationHandoffs.length} remediation handoffs:\n`);

  // Get all non-remediation handoffs to check what already existed
  const { data: originalHandoffs, error: originalError } = await supabase
    .from('sd_phase_handoffs')
    .select('handoff_type, status')
    .eq('sd_id', SD_LEGACY_ID)
    .neq('created_by', 'UNIFIED-HANDOFF-SYSTEM-REMEDIATION')
    .eq('status', 'accepted');

  if (originalError) {
    console.error('❌ Failed to fetch original handoffs:', originalError.message);
    process.exit(1);
  }

  const originalTypes = new Set(originalHandoffs?.map(h => h.handoff_type) || []);
  console.log('Original handoffs (accepted):', Array.from(originalTypes).join(', '));
  console.log('');

  // Identify which remediation handoffs are truly duplicates
  const toDelete = remediationHandoffs.filter(h => originalTypes.has(h.handoff_type));

  if (toDelete.length === 0) {
    console.log('✅ No duplicate handoffs to remove.');
    console.log('   All remediation handoffs fill gaps in the original workflow.');
    return;
  }

  console.log(`Found ${toDelete.length} duplicate handoffs to remove:\n`);
  toDelete.forEach(h => {
    console.log(`   - ${h.handoff_type} (${h.status})`);
  });

  console.log('');
  console.log('⚠️  NOTE: Keeping remediation handoffs that fill gaps.');
  console.log('');

  // Delete duplicates
  const idsToDelete = toDelete.map(h => h.id);

  const { error: deleteError } = await supabase
    .from('sd_phase_handoffs')
    .delete()
    .in('id', idsToDelete);

  if (deleteError) {
    console.error('❌ Failed to delete duplicates:', deleteError.message);
    process.exit(1);
  }

  console.log(`✅ Deleted ${idsToDelete.length} duplicate handoff(s)`);
  console.log('');
  console.log('🎉 Cleanup complete!');
}

main();
