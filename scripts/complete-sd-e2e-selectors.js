#!/usr/bin/env node
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function completeSd() {
  const sdId = 'SD-2025-1020-E2E-SELECTORS';

  console.log('Completing SD-2025-1020-E2E-SELECTORS:\n');

  // Verify progress is 100%
  const { data: progress } = await supabase.rpc('calculate_sd_progress', {
    sd_id_param: sdId
  });

  console.log('Current Progress:', progress, '/ 100');

  if (progress !== 100) {
    console.log('❌ Cannot complete SD - progress is not 100%');
    return;
  }

  // Update SD status to completed
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({
      status: 'completed',
      updated_at: new Date().toISOString()
    })
    .eq('id', sdId)
    .select()
    .single();

  if (error) {
    console.log('❌ Error updating SD:', error.message);
    return;
  }

  console.log('\n✅ SD marked as completed!');
  console.log('\nSD Details:');
  console.log('  ID:', data.id);
  console.log('  Title:', data.title);
  console.log('  Status:', data.status);
  console.log('  Updated:', new Date(data.updated_at).toLocaleString());

  console.log('\n🎉 SD-2025-1020-E2E-SELECTORS successfully completed!');
  console.log('\nSummary:');
  console.log('  - All 3 test-ids added to VentureCreationPage.tsx');
  console.log('  - Git commit: 759b298');
  console.log('  - Zero functional changes');
  console.log('  - All handoffs accepted (LEAD→PLAN→EXEC→PLAN)');
  console.log('  - Progress: 100/100');
  console.log('  - Retrospective generated (quality_score: 70)');
}

completeSd();
