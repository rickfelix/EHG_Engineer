/**
 * Verify SD Status - Check if SDs are truly pending
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifySDs() {
  const sdIds = [
    'SD-MOCK-MUTATIONS',
    'SD-MOCK-STATES',
    'SD-MOCK-CONTRACTS',
    'SD-MOCK-SAFETY'
  ];

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  VERIFICATION: Are these SDs truly pending?');
  console.log('═══════════════════════════════════════════════════════════\n');

  for (const sdId of sdIds) {
    // Get SD details
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('id, legacy_id, title, status, progress, current_phase, parent_sd_id, created_at')
      .or(`legacy_id.eq.${sdId},sd_key.eq.${sdId}`)
      .single();

    if (!sd) {
      console.log('❓ ' + sdId + ': NOT FOUND IN DATABASE');
      continue;
    }

    // Check for handoffs
    const { data: handoffs } = await supabase
      .from('sd_phase_handoffs')
      .select('handoff_type, status, created_at')
      .eq('sd_id', sd.id)
      .order('created_at', { ascending: false });

    // Check for PRD
    const { data: prd } = await supabase
      .from('prd_documents')
      .select('id, title')
      .or(`sd_id.eq.${sd.id},directive_id.eq.${sd.id}`)
      .limit(1);

    console.log('📋 ' + sdId);
    console.log('   Status: ' + sd.status + ' | Progress: ' + sd.progress + '%');
    console.log('   Phase: ' + (sd.current_phase || 'N/A'));
    console.log('   Parent: ' + (sd.parent_sd_id || 'None'));
    console.log('   Created: ' + new Date(sd.created_at).toLocaleDateString());
    console.log('   Handoffs: ' + (handoffs?.length || 0));
    if (handoffs?.length > 0) {
      handoffs.forEach(h => console.log('     - ' + h.handoff_type + ': ' + h.status));
    }
    console.log('   PRD: ' + (prd?.length > 0 ? 'Yes' : 'No'));
    console.log('');
  }

  // Check parent relationship
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Checking children of SD-MOCK-DATA-2025-12...');
  console.log('═══════════════════════════════════════════════════════════\n');

  const { data: children } = await supabase
    .from('strategic_directives_v2')
    .select('legacy_id, title, status, progress')
    .eq('parent_sd_id', 'SD-MOCK-DATA-2025-12');

  console.log('Children of SD-MOCK-DATA-2025-12:');
  if (children?.length > 0) {
    children.forEach(c => {
      const icon = c.status === 'completed' ? '✅' : '❌';
      console.log('  ' + icon + ' ' + c.legacy_id + ': ' + c.status + ' (' + c.progress + '%)');
    });
  } else {
    console.log('  None found');
  }

  // Check if these mock SDs are related to a different parent
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Are SD-MOCK-* SDs orphaned or part of another orchestrator?');
  console.log('═══════════════════════════════════════════════════════════\n');

  const { data: mockSds } = await supabase
    .from('strategic_directives_v2')
    .select('legacy_id, title, status, parent_sd_id, created_at')
    .ilike('legacy_id', 'SD-MOCK-%')
    .not('legacy_id', 'ilike', '%DUPLICATE%')
    .order('created_at', { ascending: true });

  if (mockSds) {
    mockSds.forEach(sd => {
      console.log((sd.status === 'completed' ? '✅' : '⏳') + ' ' + sd.legacy_id);
      console.log('   Title: ' + sd.title?.substring(0, 50));
      console.log('   Status: ' + sd.status);
      console.log('   Parent: ' + (sd.parent_sd_id || 'ORPHANED'));
      console.log('');
    });
  }
}

verifySDs().catch(console.error);
