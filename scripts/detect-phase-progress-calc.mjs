#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔍 Detecting Current Phase for SD-PROGRESS-CALC-FIX\n');
console.log('═'.repeat(70));

// Check SD status
const { data: sd, error: sdError } = await supabase
  .from('strategic_directives_v2')
  .select('id, title, status, current_phase, progress')
  .eq('id', 'SD-PROGRESS-CALC-FIX')
  .single();

if (sdError) {
  console.error('Error:', sdError.message);
  process.exit(1);
}

console.log('📊 SD Status:');
console.log('   ID:', sd.id);
console.log('   Title:', sd.title);
console.log('   Status:', sd.status);
console.log('   Current Phase:', sd.current_phase);
console.log('   Progress:', sd.progress + '%');

// Check completed handoffs
console.log('\n📋 Completed Handoffs:');
const { data: handoffs, error: handoffsError } = await supabase
  .from('sd_phase_handoffs')
  .select('from_phase, to_phase, status, created_at')
  .eq('sd_id', 'SD-PROGRESS-CALC-FIX')
  .order('created_at', { ascending: false });

if (handoffs && handoffs.length > 0) {
  handoffs.forEach(h => {
    console.log('   -', h.from_phase, '→', h.to_phase, '(', h.status, ')');
  });
} else {
  console.log('   No handoffs found');
}

// Check PRD existence
console.log('\n📄 PRD Status:');
const { data: prds, error: prdError } = await supabase
  .from('product_requirements_v2')
  .select('id, title, status')
  .eq('sd_id', 'SD-PROGRESS-CALC-FIX');

if (prds && prds.length > 0) {
  console.log('   ✅ PRD exists:', prds[0].id);
  console.log('   Title:', prds[0].title);
  console.log('   Status:', prds[0].status);
} else {
  console.log('   ⚠️  No PRD found (expected for PLAN PRD Creation phase)');
}

console.log('\n═'.repeat(70));
console.log('🎯 PHASE DETERMINATION:');

if (sd.current_phase === 'LEAD' && sd.status === 'active' && (!prds || prds.length === 0)) {
  console.log('   Current Phase: PLAN PRD Creation (Phase 2)');
  console.log('   LEAD Pre-Approval completed, ready for PLAN to create PRD');
} else if (sd.current_phase === 'PLAN' && prds && prds.length > 0) {
  console.log('   Current Phase: EXEC Implementation (Phase 3) or later');
} else {
  console.log('   Current Phase:', sd.current_phase);
}

console.log('═'.repeat(70));
