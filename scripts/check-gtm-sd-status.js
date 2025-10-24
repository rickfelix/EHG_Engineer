#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

console.log('\n📊 SD Status: SD-GTM-INTEL-DISCOVERY-001');
console.log('='.repeat(70));

const { data: sd, error: sdError } = await supabase
  .from('strategic_directives_v2')
  .select('id, title, status, current_phase, progress_percentage')
  .eq('id', 'SD-GTM-INTEL-DISCOVERY-001')
  .single();

if (sdError) {
  console.log('❌ SD Error:', sdError.message);
  process.exit(1);
}

console.log('\n✅ Strategic Directive:');
console.log('   ID:', sd.id);
console.log('   Title:', sd.title);
console.log('   Status:', sd.status);
console.log('   Phase:', sd.current_phase);
console.log('   Progress:', sd.progress_percentage + '%');

const { data: handoffs, error: handoffError } = await supabase
  .from('sd_phase_handoffs')
  .select('id, handoff_type, from_phase, to_phase, status, created_at')
  .eq('sd_id', 'SD-GTM-INTEL-DISCOVERY-001')
  .order('created_at', { ascending: false });

if (handoffError) {
  console.log('\n❌ Handoff Error:', handoffError.message);
  process.exit(1);
}

console.log('\n📋 Handoffs (' + handoffs.length + ' total):');
handoffs.forEach((h, i) => {
  console.log('   ' + (i+1) + '. ' + h.handoff_type + ': ' + h.from_phase + ' → ' + h.to_phase);
  console.log('      Status: ' + h.status + ', ID: ' + h.id.substring(0, 13) + '...');
});
console.log('');
