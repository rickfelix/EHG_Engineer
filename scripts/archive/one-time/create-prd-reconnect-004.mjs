import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Read the PRD JSON
const prdData = JSON.parse(await fs.readFile('/tmp/reconnect-004-prd.json', 'utf-8'));

const timestamp = Date.now();
const prdId = `PRD-${timestamp}`;

// Map to correct schema
const { data, error } = await supabase
  .from('product_requirements_v2')
  .insert({
    id: prdId,
    sd_id: prdData.sd_id,
    title: prdData.title,
    executive_summary: prdData.overview,
    business_context: prdData.problem_statement,
    functional_requirements: prdData.requirements.functional,
    non_functional_requirements: prdData.requirements.non_functional,
    technical_requirements: prdData.technical_design,
    implementation_approach: prdData.technical_design.implementation_approach,
    technology_stack: prdData.technical_design.technology_stack,
    test_scenarios: prdData.testing_plan,
    acceptance_criteria: prdData.success_criteria,
    plan_checklist: prdData.requirements.functional.flatMap(r =>
      r.acceptance_criteria.map(ac => ({
        item: ac,
        requirement_id: r.id,
        status: 'pending'
      }))
    ),
    exec_checklist: [
      { item: 'Week 1: Chairman Dashboard Personalization (REQ-001)', status: 'pending' },
      { item: 'Week 2: Executive Reporting System (REQ-002)', status: 'pending' },
      { item: 'Week 3: Performance Cycle Tracking (REQ-003)', status: 'pending' },
      { item: 'Week 4: Synergy Opportunity Management (REQ-004)', status: 'pending' },
      { item: 'Week 5: Exit Workflow Execution (REQ-005)', status: 'pending' }
    ],
    validation_checklist: [
      { item: '5 new routes added and accessible', status: 'pending' },
      { item: '8 critical tables have UI integration', status: 'pending' },
      { item: 'All 5 integration tests pass', status: 'pending' },
      { item: 'All 4 validation tests pass', status: 'pending' },
      { item: 'table-ui-mapping.md created', status: 'pending' },
      { item: 'Zero TypeScript/console errors', status: 'pending' }
    ],
    status: 'approved',
    priority: 'high',
    category: 'feature_development',
    phase: 'EXEC',
    created_by: 'PLAN_AGENT',
    created_at: new Date().toISOString(),
    metadata: {
      user_stories: prdData.user_stories,
      out_of_scope: prdData.out_of_scope,
      simplified_scope: true,
      original_timeline: '10 weeks',
      reduced_timeline: '5 weeks',
      tables_in_scope: 8,
      routes_to_add: 5
    }
  })
  .select();

if (error) {
  console.error('Error creating PRD:', error);
} else {
  console.log('✅ PRD created successfully');
  console.log('PRD ID:', data[0].id);
  console.log('Title:', data[0].title);
  console.log('Requirements: 5 functional, 2 non-functional');
  console.log('PLAN checklist items:', data[0].plan_checklist.length);
  console.log('EXEC checklist items:', data[0].exec_checklist.length);
  console.log('Routes to add: 5');
  console.log('Tables in scope: 8');
  console.log('Status: approved, ready for EXEC');

  // Update SD phase
  await supabase
    .from('strategic_directives_v2')
    .update({ current_phase: 'PLAN_TO_EXEC_HANDOFF' })
    .eq('id', 'SD-RECONNECT-004');

  console.log('\n✅ Phase: PLAN_PRD_CREATION → PLAN_TO_EXEC_HANDOFF');
}
