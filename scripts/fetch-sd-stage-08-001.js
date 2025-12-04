import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjUxMTkzNywiZXhwIjoyMDcyMDg3OTM3fQ.tYGfVTDQWQDje4ZPSl5UsprYK9J15Fa-XdGFVScrRZg'
);

async function fetchSDDetails() {
  console.log('=== SD-STAGE-08-001 Complete Details ===\n');

  // 1. Strategic Directive
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('legacy_id', 'SD-STAGE-08-001')
    .single();

  if (sdError) {
    console.log('Error fetching SD:', sdError.message);
  } else {
    console.log('## STRATEGIC DIRECTIVE');
    console.log('ID:', sd.id);
    console.log('Legacy ID:', sd.legacy_id);
    console.log('Title:', sd.title);
    console.log('Description:', sd.description);
    console.log('Status:', sd.status);
    console.log('Current Phase:', sd.current_phase);
    console.log('Track:', sd.track);
    console.log('Priority Rank:', sd.priority_rank);
    console.log('Version:', sd.version);
    console.log('Stage Number:', sd.stage_number);
    console.log('Created:', sd.created_at);
    console.log('Updated:', sd.updated_at);
    console.log('Target Date:', sd.target_date);
    console.log('Strategic Objectives:', JSON.stringify(sd.strategic_objectives, null, 2));
    console.log('Success Criteria:', JSON.stringify(sd.success_criteria, null, 2));
    console.log('Dependencies:', JSON.stringify(sd.dependencies, null, 2));
    console.log('Context:', JSON.stringify(sd.context, null, 2));
    console.log('Metadata:', JSON.stringify(sd.metadata, null, 2));
  }

  // 2. PRDs
  const { data: prds, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('sd_id', 'SD-STAGE-08-001');

  console.log('\n## PRODUCT REQUIREMENTS (PRDs)');
  if (prdError) {
    console.log('Error:', prdError.message);
  } else if (!prds || prds.length === 0) {
    console.log('No PRDs found');
  } else {
    prds.forEach((prd, idx) => {
      console.log(`\n### PRD ${idx + 1}`);
      console.log('ID:', prd.id);
      console.log('Status:', prd.status);
      console.log('Created:', prd.created_at);
      console.log('Requirements:', JSON.stringify(prd.requirements, null, 2));
    });
  }

  // 3. User Stories
  const { data: stories, error: storiesError } = await supabase
    .from('user_stories')
    .select('*')
    .eq('sd_id', 'SD-STAGE-08-001');

  console.log('\n## USER STORIES');
  if (storiesError) {
    console.log('Error:', storiesError.message);
  } else if (!stories || stories.length === 0) {
    console.log('No user stories found');
  } else {
    console.log(`Found ${stories.length} user stories:`);
    stories.forEach((story, idx) => {
      console.log(`\n### Story ${idx + 1}`);
      console.log('ID:', story.id);
      console.log('Title:', story.title);
      console.log('Status:', story.status);
      console.log('Priority:', story.priority);
      console.log('Story Points:', story.story_points);
      console.log('Description:', story.description);
      console.log('Acceptance Criteria:', JSON.stringify(story.acceptance_criteria, null, 2));
    });
  }

  // 4. Scope Deliverables
  const { data: deliverables, error: deliverablesError } = await supabase
    .from('sd_scope_deliverables')
    .select('*')
    .eq('sd_id', 'SD-STAGE-08-001');

  console.log('\n## DELIVERABLES');
  if (deliverablesError) {
    console.log('Error:', deliverablesError.message);
  } else if (!deliverables || deliverables.length === 0) {
    console.log('No deliverables found');
  } else {
    console.log(`Found ${deliverables.length} deliverables:`);
    deliverables.forEach((d, idx) => {
      console.log(`\n### Deliverable ${idx + 1}`);
      console.log('ID:', d.id);
      console.log('Type:', d.deliverable_type);
      console.log('Title:', d.title);
      console.log('Description:', d.description);
      console.log('Status:', d.status);
      console.log('Acceptance Criteria:', JSON.stringify(d.acceptance_criteria, null, 2));
    });
  }
}

fetchSDDetails().catch(console.error);
