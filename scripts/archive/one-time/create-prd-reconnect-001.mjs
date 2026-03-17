import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Read the PRD JSON
const prdData = JSON.parse(await fs.readFile('/tmp/reconnect-005-prd.json', 'utf-8'));

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
      { item: 'Phase 1: Duplicate Component Audit (6 steps)', status: 'pending' },
      { item: 'Phase 2: VentureCreateDialog Consolidation (6 steps)', status: 'pending' },
      { item: 'Phase 3: Directory Structure Consolidation (8 steps)', status: 'pending' },
      { item: 'Phase 4: AgentStatusCard Consolidation (7 steps)', status: 'pending' },
      { item: 'Phase 5: NotificationSettings Consolidation (6 steps)', status: 'pending' }
    ],
    validation_checklist: [
      { item: 'Zero duplicate component basenames', status: 'pending' },
      { item: 'venture/ directory removed', status: 'pending' },
      { item: 'tsc --noEmit passes', status: 'pending' },
      { item: 'All affected workflows tested', status: 'pending' }
    ],
    status: 'approved',
    priority: 'critical',
    category: 'technical_debt',
    phase: 'EXEC',
    created_by: 'PLAN_AGENT',
    created_at: new Date().toISOString(),
    metadata: {
      user_stories: prdData.user_stories,
      out_of_scope: prdData.out_of_scope,
      simplified_scope: true,
      original_timeline: '6 weeks',
      reduced_timeline: '4 weeks'
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
  console.log('Status: approved, ready for EXEC');

  // Update SD phase
  await supabase
    .from('strategic_directives_v2')
    .update({ current_phase: 'PLAN_TO_EXEC_HANDOFF' })
    .eq('id', 'SD-RECONNECT-005');

  console.log('\n✅ Phase: PLAN_PRD_CREATION → PLAN_TO_EXEC_HANDOFF');
}
