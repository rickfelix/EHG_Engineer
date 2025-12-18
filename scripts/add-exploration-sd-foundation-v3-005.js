#!/usr/bin/env node
/**
 * Add exploration_files to SD metadata for SD-FOUNDATION-V3-005
 * Discovery Gate requires ≥5 files documented before PLAN phase
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function addExplorationToSD() {
  const SD_ID = 'SD-FOUNDATION-V3-005';

  // Get current SD
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, metadata, legacy_id')
    .eq('legacy_id', SD_ID)
    .single();

  if (sdError) {
    console.log('SD error:', sdError.message);
    return;
  }

  console.log('Found SD:', sd.legacy_id, '(UUID:', sd.id, ')');

  // Exploration findings from Explore agent investigation
  const explorationFiles = [
    {
      file_path: 'ehg/src/pages/api/v2/chairman/directive.ts',
      purpose: 'Chairman directive API endpoint',
      findings: 'Creates chairman_directives record, returns 202 Accepted. Gap: No routing/execution - just stores and acknowledges',
      relevant_lines: 'Full file'
    },
    {
      file_path: 'ehg/src/services/evaTaskContracts.ts',
      purpose: 'Task contract lifecycle management',
      findings: 'Full contract lifecycle: create, claim, start, complete, fail. 6 crews configured with stage mappings. dispatchStageTask() ready but NOT called by directive endpoint',
      relevant_lines: 'Lines 1-400'
    },
    {
      file_path: 'ehg/src/services/evaStateMachines.ts',
      purpose: 'Venture and Stage state machines',
      findings: 'VentureStateMachine and StageStateMachine ready. Gate checking implemented. Needs directive router integration',
      relevant_lines: 'Full file'
    },
    {
      file_path: 'ehg/src/services/eva/index.ts',
      purpose: 'EVA Orchestration Layer facade',
      findings: 'EVAOrchestrator facade with startStage()/completeStage(). Not exposed to directive endpoint',
      relevant_lines: 'Full file'
    },
    {
      file_path: 'ehg/src/services/evaEventBus.ts',
      purpose: 'EVA Event Bus for publish/subscribe',
      findings: 'Event infrastructure ready but not integrated with directives. Has event types for stage, crew, and insight events',
      relevant_lines: 'Full file'
    },
    {
      file_path: 'ehg/src/services/evaAgentAssignment.ts',
      purpose: 'Agent assignment to ventures',
      findings: 'Can assign agents based on role. Could be used to route directive commands to appropriate agents',
      relevant_lines: 'Lines 1-200'
    },
    {
      file_path: 'ehg/src/types/eva.ts',
      purpose: 'EVA type definitions',
      findings: 'TaskContract, TaskContractInput, EVAConfig types defined. Need DirectiveExecutionPlan type',
      relevant_lines: 'Full file'
    },
    {
      file_path: 'ehg/src/types/vision-v2.ts',
      purpose: 'Vision V2 type definitions',
      findings: 'DirectiveRequest/DirectiveResponse types defined. Need DirectiveExecutionResult type',
      relevant_lines: 'Lines 522-534'
    },
    {
      file_path: 'ehg/src/services/evaEscalations.ts',
      purpose: 'EVA escalation handling',
      findings: 'Escalation patterns for when automated execution fails. Needed for directive execution errors',
      relevant_lines: 'Full file'
    },
    {
      file_path: 'ehg/src/pages/api/v2/chairman/briefing.ts',
      purpose: 'Chairman briefing API endpoint',
      findings: 'Pattern for session auth, error handling, response format. Used SD-FOUNDATION-V3-004 corrections (current_workflow_stage)',
      relevant_lines: 'Lines 1-500'
    }
  ];

  // Update SD metadata with exploration files
  const updatedMetadata = {
    ...(sd.metadata || {}),
    exploration_files: explorationFiles,
    exploration_completed_at: new Date().toISOString(),
    exploration_summary: {
      total_files: explorationFiles.length,
      infrastructure_status: '50% complete',
      working_systems: ['task contracts', 'state machines', 'event bus', 'escalations'],
      missing_systems: ['directive routing engine', 'command parsing', 'execution dispatch', 'status polling', 'result aggregation']
    }
  };

  const { error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({
      metadata: updatedMetadata,
      updated_at: new Date().toISOString()
    })
    .eq('id', sd.id);

  if (updateError) {
    console.log('Update error:', updateError.message);
  } else {
    console.log('✅ Exploration files added to SD successfully');
    console.log('   Files documented:', explorationFiles.length);
    console.log('   Discovery Gate requirement: ≥5 files');
    console.log('   Status: SHOULD PASS');
  }
}

addExplorationToSD();
