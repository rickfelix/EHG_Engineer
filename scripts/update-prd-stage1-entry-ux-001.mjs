#!/usr/bin/env node
/**
 * Update PRD-SD-STAGE1-ENTRY-UX-001 with missing fields
 * Fixes quality gate failures for:
 * - system_architecture (missing)
 * - implementation_approach (missing)
 * - risks (empty array)
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';

const PRD_ID = 'PRD-SD-STAGE1-ENTRY-UX-001';

const systemArchitecture = {
  components: [
    {
      name: 'EntryPathSelector',
      type: 'React Component',
      location: 'src/components/ventures/VentureCreationPage/EntryPathSelector.tsx',
      description: 'New Step 0 component presenting three path cards'
    }
  ],
  data_flow: 'User clicks Create New Venture -> EntryPathSelector (Step 0) -> User selects path -> Route to appropriate sub-flow -> All paths -> Stage1Readiness Gate -> Unified Stage1Output',
  integrations: ['VentureCreationPage.tsx', 'CreateVentureDialog.tsx', 'VenturesPage.tsx']
};

const implementationApproach = {
  strategy: 'Incremental Enhancement',
  phases: [
    {
      name: 'Phase 1: Entry Path Selector',
      stories: ['US-001'],
      deliverables: ['EntryPathSelector component', 'Three path cards UI']
    },
    {
      name: 'Phase 2: Path Integration',
      stories: ['US-002', 'US-003', 'US-004'],
      deliverables: ['Route integration', 'Form prefill logic']
    },
    {
      name: 'Phase 3: Output Unification',
      stories: ['US-005'],
      deliverables: ['Stage1Output schema', 'Readiness gate validation']
    }
  ],
  dependencies: ['SD-BLUEPRINT-ENGINE-001 for Option 3 blueprints'],
  constraints: ['Must not break existing VentureCreationPage flow']
};

const risks = [
  {
    id: 'RISK-001',
    description: 'Path divergence - users may not understand path differences',
    probability: 'medium',
    impact: 'medium',
    mitigation: 'Clear labels, hover tooltips, visual icons for each path'
  },
  {
    id: 'RISK-002',
    description: 'Blueprint unavailability - Option 3 depends on SD-BLUEPRINT-ENGINE-001',
    probability: 'low',
    impact: 'high',
    mitigation: 'Graceful degradation with disabled state and message'
  },
  {
    id: 'RISK-003',
    description: 'Scope creep into implementation details',
    probability: 'medium',
    impact: 'low',
    mitigation: 'SD explicitly excludes UI specs, schemas, algorithms'
  }
];

async function main() {
  console.log('Updating PRD:', PRD_ID);
  console.log('Using SERVICE_ROLE_KEY to bypass RLS...\n');

  const supabase = await createSupabaseServiceClient('engineer', { verbose: true });

  // First, check current state (using 'id' column, not 'prd_id')
  console.log('\n--- Current PRD State ---');
  const { data: currentPrd, error: fetchError } = await supabase
    .from('product_requirements_v2')
    .select('id, sd_id, title, system_architecture, implementation_approach, risks, confidence_score')
    .eq('id', PRD_ID)
    .single();

  if (fetchError) {
    console.error('Error fetching PRD:', fetchError.message);
    process.exit(1);
  }

  console.log('PRD ID:', currentPrd.id);
  console.log('SD ID:', currentPrd.sd_id);
  console.log('Title:', currentPrd.title);
  console.log('Current system_architecture:', currentPrd.system_architecture ? 'EXISTS' : 'MISSING');
  console.log('Current implementation_approach:', currentPrd.implementation_approach ? 'EXISTS' : 'MISSING');
  console.log('Current risks:', Array.isArray(currentPrd.risks) && currentPrd.risks.length > 0 ? `${currentPrd.risks.length} risks` : 'EMPTY');
  console.log('Current confidence_score:', currentPrd.confidence_score);

  // Update the PRD
  console.log('\n--- Updating PRD ---');
  const { data: updatedPrd, error: updateError } = await supabase
    .from('product_requirements_v2')
    .update({
      system_architecture: systemArchitecture,
      implementation_approach: implementationApproach,
      risks: risks,
      updated_at: new Date().toISOString()
    })
    .eq('id', PRD_ID)
    .select('id, sd_id, title, system_architecture, implementation_approach, risks, confidence_score')
    .single();

  if (updateError) {
    console.error('Error updating PRD:', updateError.message);
    process.exit(1);
  }

  console.log('\nUpdate successful!');
  console.log('Updated system_architecture:', updatedPrd.system_architecture ? 'SET' : 'MISSING');
  console.log('Updated implementation_approach:', updatedPrd.implementation_approach ? 'SET' : 'MISSING');
  console.log('Updated risks:', Array.isArray(updatedPrd.risks) ? `${updatedPrd.risks.length} risks` : 'EMPTY');
  console.log('Confidence score:', updatedPrd.confidence_score);

  // Verify all required fields are now present
  console.log('\n--- Verification ---');
  const hasSystemArch = updatedPrd.system_architecture &&
                        updatedPrd.system_architecture.components &&
                        updatedPrd.system_architecture.components.length > 0;
  const hasImplApproach = updatedPrd.implementation_approach &&
                          updatedPrd.implementation_approach.phases &&
                          updatedPrd.implementation_approach.phases.length > 0;
  const hasRisks = Array.isArray(updatedPrd.risks) && updatedPrd.risks.length > 0;

  console.log('system_architecture valid:', hasSystemArch ? 'YES' : 'NO');
  console.log('implementation_approach valid:', hasImplApproach ? 'YES' : 'NO');
  console.log('risks valid:', hasRisks ? 'YES' : 'NO');

  if (hasSystemArch && hasImplApproach && hasRisks) {
    console.log('\n*** All required fields now populated ***');
    console.log('Quality gate failures should be resolved.');
  } else {
    console.log('\n*** WARNING: Some fields still missing ***');
  }

  // Output final verification of data
  console.log('\n--- Final PRD Data Summary ---');
  console.log('system_architecture.components:', updatedPrd.system_architecture?.components?.length || 0, 'component(s)');
  console.log('implementation_approach.phases:', updatedPrd.implementation_approach?.phases?.length || 0, 'phase(s)');
  console.log('risks:', updatedPrd.risks?.length || 0, 'risk(s)');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
