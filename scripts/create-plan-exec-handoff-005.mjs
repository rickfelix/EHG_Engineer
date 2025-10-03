import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const handoff = {
  from_agent: 'PLAN',
  to_agent: 'EXEC',
  sd_id: 'SD-RECONNECT-005',
  prd_id: 'PRD-1759442739287',
  handoff_type: 'technical_to_implementation',
  handoff_data: {
    "1_executive_summary": {
      overview: "Component Directory Consolidation PRD approved. 4 duplicate components identified. Scope: 4 weeks, 5 phases, 22 steps. Success criteria: 0 duplicates, venture/ → ventures/, tsc passes.",
      scope_changes: "Reduced from 6 weeks (40 steps) to 4 weeks (22 steps). Deferred governance automation to SD-CODE-QUALITY-001/002.",
      critical_requirements: [
        "Zero duplicate component basenames (4 → 0)",
        "VentureCreateDialog: stub (48 LOC) → full (361 LOC)",
        "venture/ directory removed, all files in ventures/",
        "tsc --noEmit passes with zero errors"
      ]
    },
    "2_completeness_report": {
      deliverables_completed: [
        "PRD-1759442739287 created with 5 functional requirements",
        "33 PLAN checklist items generated from acceptance criteria",
        "5 EXEC checklist items (one per phase)",
        "4 validation checklist items (tsc, duplicates, directory, workflows)",
        "Comprehensive testing plan with integration and validation tests"
      ],
      artifacts_created: [
        "PRD in product_requirements_v2 table",
        "Technical design with file changes manifest",
        "Test scenarios for all 4 consolidations",
        "Success criteria and out-of-scope boundaries"
      ],
      outstanding_items: []
    },
    "3_deliverables_manifest": {
      primary_deliverables: [
        {
          item: "PRD-1759442739287",
          location: "product_requirements_v2 table",
          status: "complete",
          notes: "5 functional reqs, 2 non-functional reqs, 4-week timeline"
        },
        {
          item: "EXEC implementation checklist",
          location: "PRD exec_checklist field",
          status: "complete",
          notes: "5 phases with clear step counts"
        },
        {
          item: "Test plan",
          location: "PRD test_scenarios field",
          status: "complete",
          notes: "4 integration tests, 3 validation tests"
        }
      ]
    },
    "4_key_decisions_and_rationale": {
      decisions: [
        {
          decision: "Simplify scope from 6 weeks (40 steps) to 4 weeks (22 steps)",
          rationale: "Focus on immediate duplicate elimination. Defer governance automation (ESLint, hooks, docs) to future SDs.",
          impact: "Delivers 100% of duplicate elimination value with 67% of effort"
        },
        {
          decision: "Prioritize VentureCreateDialog consolidation",
          rationale: "VenturesPage currently imports stub (48 LOC) missing critical features. Full version (361 LOC) has VoiceCapture, EVA validation.",
          impact: "Restores missing functionality to ventures workflow"
        },
        {
          decision: "Use git mv for all file moves",
          rationale: "Preserves git history and blame information",
          impact: "Maintains code archaeology capabilities"
        },
        {
          decision: "Consolidate venture/ → ventures/",
          rationale: "venture/ has only 2 files, ventures/ has 28 files. Inconsistent import paths.",
          impact: "Eliminates directory fragmentation"
        }
      ]
    },
    "5_known_issues_and_risks": {
      risks: [
        {
          risk: "Breaking imports during consolidation",
          severity: "medium",
          mitigation: "Use grep -r to find all imports before changes. Run tsc --noEmit after each phase."
        },
        {
          risk: "Component feature incompatibility",
          severity: "low",
          mitigation: "Test all affected workflows (REQ-002 IT-001, REQ-003 IT-002, etc.)"
        },
        {
          risk: "More duplicates may exist beyond the 4 known",
          severity: "low",
          mitigation: "REQ-001 includes comprehensive audit: find src/components -name '*.tsx' | xargs basename -a | sort | uniq -d"
        }
      ],
      blockers: [],
      dependencies: [
        "EHG application must be at /mnt/c/_EHG/ehg/ (NOT EHG_Engineer)",
        "TypeScript compiler (tsc) must be available",
        "Dev server must be restarted after component changes"
      ]
    },
    "6_resource_utilization": {
      effort_breakdown: {
        phase_1_audit: "6 steps - discover all duplicates",
        phase_2_venture_dialog: "6 steps - consolidate VentureCreateDialog",
        phase_3_directory: "8 steps - merge venture/ into ventures/",
        phase_4_agent_status: "7 steps - consolidate AgentStatusCard",
        phase_5_notifications: "6 steps - consolidate NotificationSettings"
      },
      timeline: "4 weeks (reduced from 6 weeks)",
      tools_required: [
        "find, grep, wc (duplicate detection)",
        "git mv (file moves)",
        "tsc --noEmit (validation)",
        "npm run dev (testing)"
      ]
    },
    "7_action_items_for_receiver": {
      immediate_actions: [
        "Verify target app: cd /mnt/c/_EHG/ehg && pwd (NOT EHG_Engineer!)",
        "Verify current working directory before any file operations",
        "Start with Phase 1: Run duplicate audit command from REQ-001",
        "Document all duplicate basenames found",
        "Calculate complexity scores for each duplicate pair"
      ],
      phase_sequence: [
        "Phase 1: Complete audit before proceeding",
        "Phase 2: VentureCreateDialog consolidation (highest priority)",
        "Phase 3: Directory merge (venture/ → ventures/)",
        "Phase 4: AgentStatusCard consolidation",
        "Phase 5: NotificationSettings consolidation"
      ],
      validation_requirements: [
        "Run tsc --noEmit after EACH phase",
        "Test affected workflows after EACH consolidation",
        "Restart dev server after component changes",
        "Hard refresh browser (Ctrl+Shift+R) to clear cache"
      ],
      completion_criteria: [
        "Zero duplicate basenames in src/components",
        "venture/ directory no longer exists",
        "tsc --noEmit passes with 0 errors",
        "All integration tests pass (IT-001 through IT-004)",
        "EXEC→PLAN handoff created with results"
      ]
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
    current_phase: 'EXEC',
    metadata: {
      ...currentSD.metadata,
      plan_to_exec_handoff: handoff,
      handoff_timestamp: new Date().toISOString()
    }
  })
  .eq('id', 'SD-RECONNECT-005');

if (error) {
  console.error('Error creating handoff:', error);
} else {
  console.log('✅ PLAN→EXEC Handoff Created');
  console.log('SD: SD-RECONNECT-005');
  console.log('PRD: PRD-1759442739287');
  console.log('Handoff Type: technical_to_implementation');
  console.log('All 7 mandatory elements included');
  console.log('\n✅ Phase: PLAN_TO_EXEC_HANDOFF → EXEC');
  console.log('\n🎯 EXEC Agent: Start with Phase 1 duplicate audit at /mnt/c/_EHG/ehg/');
}
