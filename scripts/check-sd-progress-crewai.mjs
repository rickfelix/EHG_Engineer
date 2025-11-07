import { createSupabaseServiceClient } from './lib/supabase-connection.js';

const client = await createSupabaseServiceClient('engineer', { verbose: false });

console.log('\n=== SD Progress Calculation: SD-CREWAI-ARCHITECTURE-001 ===\n');

// Get SD record
const { data: sd, error: sdError } = await client
  .from('strategic_directives_v2')
  .select('*')
  .eq('id', 'SD-CREWAI-ARCHITECTURE-001')
  .single();

if (sdError) {
  console.error('❌ Error fetching SD:', sdError.message);
  process.exit(1);
}

console.log(`SD: ${sd.title}`);
console.log(`Status: ${sd.status}`);
console.log(`Progress: ${sd.progress}%`);
console.log(`Current Phase: ${sd.current_phase}`);

// Get handoffs
const { data: handoffs, error: handoffsError } = await client
  .from('sd_phase_handoffs')
  .select('*')
  .eq('sd_id', 'SD-CREWAI-ARCHITECTURE-001')
  .order('created_at');

console.log(`\n📋 Handoffs (${handoffs?.length || 0}):\n`);

const handoffPhases = {
  'LEAD-to-PLAN': { weight: 10, found: false },
  'PLAN-to-EXEC': { weight: 15, found: false },
  'EXEC-to-PLAN': { weight: 30, found: false },
  'PLAN-to-LEAD': { weight: 15, found: false },
  'LEAD-final': { weight: 30, found: false }
};

handoffs?.forEach(h => {
  const key = `${h.from_agent}-to-${h.to_agent}`;
  console.log(`   ${key}: ${h.status} (created: ${new Date(h.created_at).toLocaleString()})`);

  if (h.status === 'accepted') {
    if (key === 'LEAD-to-PLAN') handoffPhases['LEAD-to-PLAN'].found = true;
    if (key === 'PLAN-to-EXEC') handoffPhases['PLAN-to-EXEC'].found = true;
    if (key === 'EXEC-to-PLAN') handoffPhases['EXEC-to-PLAN'].found = true;
    if (key === 'PLAN-to-LEAD') handoffPhases['PLAN-to-LEAD'].found = true;
  }
});

// Calculate expected progress
let expectedProgress = 0;
console.log('\n📊 Progress Breakdown:\n');

Object.entries(handoffPhases).forEach(([phase, info]) => {
  const found = info.found ? '✅' : '❌';
  console.log(`   ${found} ${phase}: ${info.weight}%`);
  if (info.found) expectedProgress += info.weight;
});

console.log(`\n💯 Expected Progress: ${expectedProgress}%`);
console.log(`🔢 Actual Progress: ${sd.progress}%`);

if (expectedProgress !== sd.progress) {
  console.log(`\n⚠️  MISMATCH: Expected ${expectedProgress}% but database shows ${sd.progress}%`);
}

// Get user stories
const { data: stories, error: storiesError } = await client
  .from('user_stories')
  .select('status')
  .eq('sd_id', 'SD-CREWAI-ARCHITECTURE-001');

console.log(`\n📝 User Stories: ${stories?.length || 0} total`);
const completedStories = stories?.filter(s => s.status === 'completed').length || 0;
console.log(`   ✅ Completed: ${completedStories}/${stories?.length || 0}`);

// Get retrospective
const { data: retro, error: retroError } = await client
  .from('retrospectives')
  .select('quality_score, status')
  .eq('sd_id', 'SD-CREWAI-ARCHITECTURE-001')
  .single();

console.log(`\n🔄 Retrospective:`);
if (retro) {
  console.log(`   Status: ${retro.status}`);
  console.log(`   Quality Score: ${retro.quality_score}/100`);
} else {
  console.log(`   ❌ Not found`);
}
