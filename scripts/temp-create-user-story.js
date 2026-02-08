require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

function generateUUID() {
  return crypto.randomUUID();
}

(async () => {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Check if story already exists
  const { data: existingStory } = await supabase
    .from('user_stories')
    .select('story_key, title, status')
    .eq('story_key', 'US-SD-LEARN-FIX-ADDRESS-SAL-RISK-001-001')
    .maybeSingle();

  if (existingStory) {
    console.log('✅ User story already exists:', existingStory.story_key);
    console.log('   Status:', existingStory.status);
    process.exit(0);
  }

  // Create User Story
  const story = {
    id: generateUUID(),
    sd_id: 'SD-LEARN-FIX-ADDRESS-SAL-RISK-001',
    story_key: 'US-SD-LEARN-FIX-ADDRESS-SAL-RISK-001-001',
    title: 'Filter RISK Sub-Agent Boilerplate from /learn SAL Output',
    status: 'completed',
    validation_status: 'validated',
    acceptance_criteria: [
      'RISK boilerplate warnings (error handling, indexes, rollback, testing) are excluded from SAL output',
      'Genuine RISK learnings that are NOT boilerplate appear in SAL output',
      'Existing non-actionable SAL filters continue to work',
      'No performance degradation in /learn pipeline'
    ],
    implementation_context: 'Pre-resolved in SD-016. Implementation added 4 regex patterns to NON_ACTIONABLE_SAL_PATTERNS in scripts/modules/learn/context-builder.js: /Risk:\\s*Ensure proper error handling/i, /Consider adding indexes/i, /Risk:\\s*Test.*rollback/i, /Mitigation:\\s*Add comprehensive tests/i. These patterns match common RISK sub-agent boilerplate generated during database migration reviews.',
    given_when_then: {
      given: 'The /learn pipeline processes completed SDs with RISK sub-agent migration reviews containing boilerplate warnings',
      when: 'Strategic Action Learnings are extracted from retrospective data',
      then: 'RISK boilerplate patterns (error handling, indexes, rollback, testing) are filtered out while genuine learnings are preserved'
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { data: storyData, error: storyError } = await supabase
    .from('user_stories')
    .insert(story)
    .select()
    .single();

  if (storyError) {
    console.error('❌ User story creation failed:', storyError.message);
    process.exit(1);
  }

  console.log('✅ User story created:', storyData.story_key);
  console.log('');
  console.log('📋 Summary for SD-LEARN-FIX-ADDRESS-SAL-RISK-001:');
  console.log('  PRD: Filter RISK Sub-Agent Boilerplate from /learn Pipeline (already exists)');
  console.log('  Story: US-SD-LEARN-FIX-ADDRESS-SAL-RISK-001-001 (created)');
  console.log('  Status: Pre-resolved in SD-016');
  console.log('  Implementation: 4 regex patterns in NON_ACTIONABLE_SAL_PATTERNS');
  console.log('  Location: scripts/modules/learn/context-builder.js');
})();
