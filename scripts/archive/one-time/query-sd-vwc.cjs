require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

(async () => {
  // Get user stories for this SD
  const { data: stories, error: storiesError } = await supabase
    .from('user_stories')
    .select('story_key, title, status, checkpoint, e2e_test_mapped')
    .eq('sd_id', 'SD-VWC-INTUITIVE-FLOW-001')
    .order('checkpoint', { ascending: true })
    .order('story_key', { ascending: true });

  if (storiesError) {
    console.error('Stories Error:', storiesError);
  } else {
    console.log('\n=== USER STORIES BY CHECKPOINT ===');
    const byCheckpoint = {};
    stories.forEach(s => {
      const cp = s.checkpoint || 'no_checkpoint';
      if (!byCheckpoint[cp]) byCheckpoint[cp] = [];
      byCheckpoint[cp].push(s);
    });

    Object.keys(byCheckpoint).sort().forEach(cp => {
      console.log(`\n📍 ${cp.toUpperCase()}: ${byCheckpoint[cp].length} stories`);
      byCheckpoint[cp].forEach(s => {
        console.log(`  - [${s.status}] ${s.story_key}: ${s.title}`);
        console.log(`    E2E Mapped: ${s.e2e_test_mapped ? 'YES ✅' : 'NO ❌'}`);
      });
    });
  }

  // Get handoffs
  const { data: handoffs, error: handoffsError } = await supabase
    .from('sd_phase_handoffs')
    .select('from_phase, to_phase, created_at, status')
    .eq('sd_id', 'SD-VWC-INTUITIVE-FLOW-001')
    .order('created_at', { ascending: true });

  if (handoffsError) {
    console.error('\nHandoffs Error:', handoffsError);
  } else {
    console.log('\n\n=== HANDOFFS ===');
    if (handoffs.length === 0) {
      console.log('No handoffs found');
    } else {
      handoffs.forEach(h => {
        console.log(`${h.from_phase} → ${h.to_phase} (${h.status}) - ${new Date(h.created_at).toISOString().split('T')[0]}`);
      });
    }
  }

  // Get PRD
  const { data: prds, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('id, research_confidence_score, created_at')
    .eq('sd_id', 'SD-VWC-INTUITIVE-FLOW-001')
    .order('created_at', { ascending: false });

  if (prdError) {
    console.log('\n\n=== PRD ===');
    console.log('No PRD found or error:', prdError.message);
  } else if (!prds || prds.length === 0) {
    console.log('\n\n=== PRD ===');
    console.log('No PRDs found');
  } else {
    console.log('\n\n=== PRD ===');
    console.log(`Found ${prds.length} PRD(s)`);
    prds.forEach((prd, i) => {
      console.log(`\nPRD ${i + 1}:`);
      console.log(`  ID: ${prd.id}`);
      console.log(`  Confidence Score: ${prd.research_confidence_score || 'N/A'}`);
      console.log(`  Created: ${new Date(prd.created_at).toISOString().split('T')[0]}`);
    });
  }
})();
