#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('id, status, current_phase, progress, phase_progress, metadata, governance_metadata')
  .eq('id', 'SD-KNOWLEDGE-001')
  .single();

console.log('📊 SD-KNOWLEDGE-001 Current State:\n');
console.log('Status:', sd.status);
console.log('Current Phase:', sd.current_phase);
console.log('Progress:', sd.progress);
console.log('Phase Progress:', sd.phase_progress);
console.log('\nMetadata:', JSON.stringify(sd.metadata, null, 2));
console.log('\nGovernance Metadata:', JSON.stringify(sd.governance_metadata, null, 2));

// Also check PRD
const { data: prds } = await supabase
  .from('product_requirements_v2')
  .select('id, status, phase, metadata')
  .eq('directive_id', 'SD-KNOWLEDGE-001');

if (prds && prds.length > 0) {
  console.log('\n📋 PRD Status:');
  prds.forEach(prd => {
    console.log(`  ID: ${prd.id}`);
    console.log(`  Status: ${prd.status}`);
    console.log(`  Phase: ${prd.phase}`);
    console.log('  Metadata:', JSON.stringify(prd.metadata, null, 2));
  });
}

// Check for retrospective
const { data: retros } = await supabase
  .from('retrospectives')
  .select('id, sd_id, status')
  .eq('sd_id', 'SD-KNOWLEDGE-001');

console.log('\n📚 Retrospectives:');
if (retros && retros.length > 0) {
  retros.forEach(r => console.log(`  - ${r.id} (${r.status})`));
} else {
  console.log('  None found');
}

// Check for handoffs
const { data: handoffs } = await supabase
  .from('sd_phase_handoffs')
  .select('id, from_phase, to_phase, status')
  .eq('sd_id', 'SD-KNOWLEDGE-001');

console.log('\n🔄 Handoffs:');
if (handoffs && handoffs.length > 0) {
  handoffs.forEach(h => console.log(`  - ${h.from_phase} → ${h.to_phase} (${h.status})`));
} else {
  console.log('  None found');
}
