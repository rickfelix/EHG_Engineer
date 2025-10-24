#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔍 Checking blocking items for SD-INFRA-VALIDATION\n');

// User stories
const { data: stories, error: storiesError } = await supabase
  .from('user_stories')
  .select('story_id, status, validation_status')
  .eq('sd_id', 'SD-INFRA-VALIDATION');

console.log('User Stories:');
if (storiesError) {
  console.log('  ❌ Error:', storiesError.message);
} else if (!stories || stories.length === 0) {
  console.log('  ⚠️  No user stories found');
} else {
  const completed = stories.filter(s => s.status === 'completed').length;
  const validated = stories.filter(s => s.validation_status === 'validated').length;
  console.log('  Total:', stories.length);
  console.log('  Completed:', completed + '/' + stories.length);
  console.log('  Validated:', validated + '/' + stories.length);
}

// Handoffs
const { data: handoffs, error: handoffsError } = await supabase
  .from('sd_phase_handoffs')
  .select('from_phase, to_phase, status')
  .eq('sd_id', 'SD-INFRA-VALIDATION');

console.log('\nHandoffs:');
if (handoffsError) {
  console.log('  ❌ Error:', handoffsError.message);
} else if (!handoffs || handoffs.length === 0) {
  console.log('  ⚠️  No handoffs found');
} else {
  console.log('  Total:', handoffs.length);
  handoffs.forEach(h => {
    console.log('  ' + h.from_phase + '→' + h.to_phase + ': ' + h.status);
  });

  const accepted = handoffs.filter(h => h.status === 'accepted').length;
  console.log('  Accepted:', accepted + '/' + handoffs.length);
}

// Deliverables
const { data: delivs, error: delivsError } = await supabase
  .from('sd_deliverables')
  .select('deliverable_id, deliverable_type, status')
  .eq('sd_id', 'SD-INFRA-VALIDATION');

console.log('\nDeliverables:');
if (delivsError) {
  console.log('  ❌ Error:', delivsError.message);
} else if (!delivs || delivs.length === 0) {
  console.log('  ⚠️  No deliverables tracked');
} else {
  console.log('  Total:', delivs.length);
  delivs.forEach(d => {
    console.log('  ' + d.deliverable_type + ': ' + d.status);
  });
}

console.log('\n═══════════════════════════════════════════════════════════\n');
