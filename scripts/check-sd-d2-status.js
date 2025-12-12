#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjUxMTkzNywiZXhwIjoyMDcyMDg3OTM3fQ.tYGfVTDQWQDje4ZPSl5UsprYK9J15Fa-XdGFVScrRZg'
);

async function main() {
  // Get SD-D2 details
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', 'SD-VISION-TRANSITION-001D2')
    .single();

  if (error) { console.error('Error:', error); return; }
  console.log('SD-D2 Status:', JSON.stringify(sd, null, 2));

  // Get deliverables count
  const { data: deliverables } = await supabase
    .from('sd_scope_deliverables')
    .select('*')
    .eq('sd_id', sd.id);

  console.log('\nDeliverables count:', deliverables?.length || 0);

  // Get user stories
  const { data: prd } = await supabase
    .from('product_requirements')
    .select('id')
    .eq('sd_id', sd.id)
    .single();

  if (prd) {
    const { data: stories } = await supabase
      .from('prd_user_stories')
      .select('story_id, title, e2e_test_path, e2e_test_status')
      .eq('prd_id', prd.id);
    console.log('\nUser Stories (e2e status):', JSON.stringify(stories, null, 2));
  }

  // Get handoffs
  const { data: handoffs } = await supabase
    .from('sd_handoffs')
    .select('id, from_phase, to_phase, status, created_at')
    .eq('sd_id', sd.id);
  console.log('\nHandoffs:', JSON.stringify(handoffs, null, 2));

  // Get handoff count directly
  const { count: handoffCount } = await supabase
    .from('sd_handoffs')
    .select('*', { count: 'exact', head: true })
    .eq('sd_id', sd.id);
  console.log('\nHandoff count:', handoffCount);

  // Check for sd_handoffs table existence
  const { data: tables } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .ilike('table_name', '%handoff%');
  console.log('\nHandoff-related tables:', tables);

  // Check deliverables detail
  const { data: deliverableDetails } = await supabase
    .from('sd_scope_deliverables')
    .select('id, title, status, completed_at')
    .eq('sd_id', sd.id);
  console.log('\nDeliverables:', JSON.stringify(deliverableDetails, null, 2));

  // Check what's blocking progress
  console.log('\n=== PROGRESS ANALYSIS ===');
  console.log('SD progress field:', sd.progress);
  console.log('SD progress_percentage field:', sd.progress_percentage);
}
main();
