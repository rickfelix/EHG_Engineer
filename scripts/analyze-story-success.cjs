const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjUxMTkzNywiZXhwIjoyMDcyMDg3OTM3fQ.tYGfVTDQWQDje4ZPSl5UsprYK9J15Fa-XdGFVScrRZg'
);

async function analyzeStorySuccess() {
  const { data: recentSD } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status')
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('=== User Story Implementation Success Analysis ===\n');

  for (const sd of recentSD) {
    console.log(`\n--- ${sd.id} ---`);
    console.log(`Title: ${sd.title}`);
    console.log(`SD Status: ${sd.status}`);

    const { data: stories } = await supabase
      .from('user_stories')
      .select('story_key, title, status, e2e_test_path, e2e_test_status, implementation_context, acceptance_criteria')
      .eq('sd_id', sd.id);

    if (!stories || stories.length === 0) {
      console.log('  ❌ NO USER STORIES FOUND');
      continue;
    }

    console.log(`\nTotal Stories: ${stories.length}`);

    // Status breakdown
    const statuses = {};
    stories.forEach(s => {
      statuses[s.status] = (statuses[s.status] || 0) + 1;
    });
    console.log('Status Breakdown:', statuses);

    // Quality metrics
    const withContext = stories.filter(s => s.implementation_context && s.implementation_context.length > 50).length;
    const withE2E = stories.filter(s => s.e2e_test_path).length;
    const withAC = stories.filter(s => s.acceptance_criteria && s.acceptance_criteria.length > 0).length;
    const implemented = stories.filter(s => ['completed', 'done', 'validated'].includes(s.status)).length;

    console.log(`\nImplementation Quality:`);
    console.log(`  ✓ Implemented: ${implemented}/${stories.length} (${(implemented/stories.length*100).toFixed(0)}%)`);
    console.log(`  ✓ Has Context: ${withContext}/${stories.length} (${(withContext/stories.length*100).toFixed(0)}%)`);
    console.log(`  ✓ Has E2E Test: ${withE2E}/${stories.length} (${(withE2E/stories.length*100).toFixed(0)}%)`);
    console.log(`  ✓ Has Accept Criteria: ${withAC}/${stories.length} (${(withAC/stories.length*100).toFixed(0)}%)`);

    // Sample stories
    console.log('\nSample Stories:');
    stories.slice(0, 3).forEach(s => {
      console.log(`  ${s.story_key}: ${s.title.substring(0, 50)}`);
      console.log(`    Status: ${s.status}`);
      console.log(`    E2E: ${s.e2e_test_path ? `✓ ${s.e2e_test_status}` : '✗ None'}`);
      console.log(`    Context: ${s.implementation_context ? `✓ ${s.implementation_context.length} chars` : '✗ None'}`);
    });
  }
}

analyzeStorySuccess().catch(console.error);
