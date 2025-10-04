import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const handoff = {
  from_agent: 'EXEC',
  to_agent: 'PLAN',
  sd_id: 'SD-RECONNECT-005',
  prd_id: 'PRD-1759442739287',
  handoff_type: 'implementation_to_verification',
  handoff_data: {
    "1_executive_summary": {
      overview: "Component Directory Consolidation complete. 3 duplicate pairs eliminated (not 4 as expected). venture/ directory removed. All TypeScript compilation passes.",
      implementation_completed: "5 phases executed: Audit, VentureCreateDialog, Directory merge, AgentStatusCard, NotificationSettings",
      deviations: "VentureCreateDialog stub was 47 LOC (not 48), full version 361 LOC (matches PRD). Found 3 duplicate pairs instead of expected 4."
    },
    "2_completeness_report": {
      phases_completed: [
        "Phase 1: Duplicate Component Audit - Found 3 pairs: AgentStatusCard, NotificationSettings, VentureCreateDialog",
        "Phase 2: VentureCreateDialog Consolidation - Updated VenturesPage.tsx, removed stub",
        "Phase 3: Directory Structure Consolidation - Moved ChairmanDashboard + VentureGrid to ventures/, updated App.tsx + Ventures.tsx, removed venture/",
        "Phase 4: AgentStatusCard Consolidation - Kept agents/ version (229 LOC), removed ai-agents/ version (150 LOC)",
        "Phase 5: NotificationSettings Consolidation - Updated Notifications.tsx import, removed notifications/ version (251 LOC), kept settings/ version (501 LOC)"
      ],
      files_modified: [
        "src/pages/VenturesPage.tsx - Updated import and component usage",
        "src/App.tsx - Updated ChairmanDashboard lazy import path",
        "src/pages/Ventures.tsx - Updated VentureGrid import path",
        "src/pages/Notifications.tsx - Updated NotificationSettings import path"
      ],
      files_moved: [
        "src/components/venture/ChairmanDashboard.tsx → src/components/ventures/ChairmanDashboard.tsx (git mv)",
        "src/components/venture/VentureGrid.tsx → src/components/ventures/VentureGrid.tsx (git mv)"
      ],
      files_deleted: [
        "src/components/ventures/VentureCreateDialog.tsx (stub, 47 LOC)",
        "src/components/ai-agents/AgentStatusCard.tsx (duplicate, 150 LOC)",
        "src/components/notifications/NotificationSettings.tsx (duplicate, 251 LOC)"
      ],
      directories_removed: [
        "src/components/venture/ (empty after file moves)"
      ]
    },
    "3_deliverables_manifest": {
      primary_deliverables: [
        {
          item: "Zero duplicate component basenames",
          location: "src/components",
          status: "verified",
          notes: "find command returns no duplicates"
        },
        {
          item: "venture/ directory removed",
          location: "src/components",
          status: "verified",
          notes: "ls command returns 'No such file or directory'"
        },
        {
          item: "TypeScript compilation passes",
          location: "entire codebase",
          status: "verified",
          notes: "tsc --noEmit returns zero errors"
        },
        {
          item: "All import paths updated",
          location: "4 files",
          status: "complete",
          notes: "VenturesPage.tsx, App.tsx, Ventures.tsx, Notifications.tsx"
        }
      ]
    },
    "4_key_decisions_and_rationale": {
      decisions: [
        {
          decision: "Kept agents/AgentStatusCard.tsx as canonical",
          rationale: "229 LOC vs 150 LOC, imports from @/types/agents, has more features (onConfigure, onRestart), more complete implementation",
          impact: "No imports found so no updates needed"
        },
        {
          decision: "Kept settings/NotificationSettings.tsx as canonical",
          rationale: "501 LOC vs 251 LOC (2x larger), 18K vs 8.4K file size, more comprehensive features",
          impact: "Updated Notifications.tsx import, settings.tsx already used canonical"
        },
        {
          decision: "Used git mv for file moves",
          rationale: "Preserves git history and blame information as required by NFR-002",
          impact: "History accessible via git log --follow"
        },
        {
          decision: "Consolidated to VentureCreationDialog (full 361 LOC version)",
          rationale: "Stub missing VoiceCapture, ChairmanFeedbackDisplay, EVA validation features",
          impact: "Restores full functionality to /ventures page"
        }
      ]
    },
    "5_known_issues_and_risks": {
      risks: [],
      issues: [],
      notes: [
        "No runtime testing performed yet - requires dev server restart and manual verification",
        "Found 3 duplicate pairs instead of expected 4 - audit was accurate"
      ]
    },
    "6_resource_utilization": {
      effort_actual: {
        phase_1: "Audit complete - 3 duplicates found",
        phase_2: "VentureCreateDialog - 2 file edits, 1 file deletion",
        phase_3: "Directory consolidation - 2 git mv, 2 import updates, 1 directory removal",
        phase_4: "AgentStatusCard - 1 file deletion",
        phase_5: "NotificationSettings - 1 import update, 1 file deletion"
      },
      total_changes: {
        files_modified: 4,
        files_moved: 2,
        files_deleted: 3,
        directories_removed: 1
      },
      timeline: "Completed within single session"
    },
    "7_action_items_for_receiver": {
      immediate_verification: [
        "Run integration tests from PRD IT-001 through IT-004",
        "Navigate to /ventures and verify VentureCreationDialog appears (not stub)",
        "Navigate to /chairman and verify dashboard loads",
        "Navigate to /notifications and verify settings work",
        "Restart dev server and perform visual regression checks"
      ],
      validation_checklist: [
        "✅ Zero duplicate basenames (verified via find command)",
        "✅ venture/ directory removed (verified via ls)",
        "✅ tsc --noEmit passes (verified - zero errors)",
        "⏳ All affected workflows tested (PENDING - needs manual testing)"
      ],
      recommended_tests: [
        "IT-001: Verify venture creation with VentureCreationDialog",
        "IT-002: Verify ChairmanDashboard loads from ventures/",
        "IT-004: Verify NotificationSettings from settings/",
        "VT-001: TypeScript compilation validation (PASSED)",
        "VT-002: Duplicate detection validation (PASSED)",
        "VT-003: Build validation (NOT RUN)"
      ],
      completion_gate: {
        ready_for_approval: false,
        reason: "Manual testing and integration tests required before LEAD approval",
        next_phase: "PLAN supervisor verification with manual testing results"
      }
    }
  },
  created_at: new Date().toISOString(),
  status: 'active'
};

const { data: currentSD, error: fetchError } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('id', 'SD-RECONNECT-005')
  .single();

if (fetchError) {
  console.error('Error fetching SD:', fetchError);
  process.exit(1);
}

const { error } = await supabase
  .from('strategic_directives_v2')
  .update({
    current_phase: 'EXEC_TO_PLAN_HANDOFF',
    metadata: {
      ...currentSD.metadata,
      exec_to_plan_handoff: handoff,
      handoff_timestamp: new Date().toISOString(),
      implementation_summary: {
        duplicates_eliminated: 3,
        files_consolidated: 6,
        directories_removed: 1,
        zero_typescript_errors: true
      }
    }
  })
  .eq('id', 'SD-RECONNECT-005');

if (error) {
  console.error('Error creating handoff:', error);
} else {
  console.log('✅ EXEC→PLAN Handoff Created');
  console.log('SD: SD-RECONNECT-005');
  console.log('PRD: PRD-1759442739287');
  console.log('Handoff Type: implementation_to_verification');
  console.log('All 7 mandatory elements included');
  console.log('\n📊 Implementation Results:');
  console.log('- 3 duplicate pairs eliminated');
  console.log('- 4 files modified, 2 moved, 3 deleted');
  console.log('- venture/ directory removed');
  console.log('- TypeScript compilation: PASS');
  console.log('\n✅ Phase: EXEC → EXEC_TO_PLAN_HANDOFF');
  console.log('\n🔍 PLAN Agent: Run supervisor verification and integration tests');
}
