#!/usr/bin/env node

/**
 * Update SD-RECONNECT-002 with comprehensive venture creation workflow integration strategy
 * to connect 3 duplicate creation dialogs, wire Stage1 to venture creation, implement workflow orchestration
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function updateSDRECONNECT002() {
  console.log('📋 Updating SD-RECONNECT-002 with comprehensive venture creation workflow integration...\n');

  const updatedSD = {
    description: `Unify 3 duplicate venture creation dialogs, integrate Stage1DraftIdea component with venture creation flow, implement workflow orchestration to transition new ventures through 40-stage lifecycle. Current state: 3 separate creation dialogs (598 LOC total), scaffoldStage1() is no-op stub, 63 stage components disconnected from creation, workflow integration references (322 instances) but broken connections.

**CURRENT STATE - FRAGMENTED VENTURE CREATION**:
- ❌ 3 duplicate creation dialogs exist simultaneously (CreateVentureDialog.tsx 190 LOC, VentureCreateDialog.tsx 47 LOC, VentureCreationDialog.tsx 361 LOC)
- ❌ scaffoldStage1() is empty stub: "Writes docs or DB scaffold later; no-op for now" (src/services/ventures.ts)
- ❌ Stage1DraftIdea.tsx (21 form inputs, voice capture, EVA validation) NOT called during venture creation
- ❌ No workflow orchestration: ventures created → stay at Stage 0 → never progress through 40 stages
- ❌ 322 workflow-stage references in code, but connections broken (ventures don't flow to stages automatically)
- ⚠️ VentureCreationDialog has EVA validation (calculateEVAQualityScore), but other 2 dialogs don't
- ⚠️ Voice capture exists (VoiceCapture component) but only in VentureCreationDialog, not others

**VENTURE CREATION DIALOG DUPLICATION (3 components, 598 LOC)**:

  **1. VentureCreationDialog.tsx (361 LOC, Most Complete)**:
  - Features: Title, description, category, assumptions, success criteria, voice capture, EVA validation
  - EVA Integration: calculateEVAQualityScore runs on form change (lines 69-84), quality feedback shown
  - Voice Capture: VoiceCapture component for chairman input
  - Validation: Comprehensive (3-120 char title, 20-2000 char description, required category)
  - Service Calls: createVenture() + scaffoldStage1() (but scaffoldStage1 is no-op)
  - Evidence: Lines 26, 82 - most feature-rich, should be canonical version
  - Gap: Doesn't navigate to Stage1 after creation, doesn't trigger workflow

  **2. CreateVentureDialog.tsx (190 LOC, Simplified)**:
  - Features: Basic form (title, description, category), no voice, no EVA validation
  - Validation: Basic required field checks
  - Service Calls: createVenture() only (no scaffoldStage1 call)
  - Evidence: Simpler version, likely older or alternative flow
  - Gap: Missing EVA quality scoring, no voice capture, creates "dumb" venture without Stage 1 data

  **3. VentureCreateDialog.tsx (47 LOC, Minimal Stub)**:
  - Features: Minimal placeholder, likely not used
  - Evidence: Very small, possibly unused or WIP
  - Recommendation: DELETE - consolidate to VentureCreationDialog

**STAGE1 COMPONENT DISCONNECT (Stage1DraftIdea.tsx, 21 form inputs)**:
- Purpose: Comprehensive idea capture (title, description, category, tags, company, voice, strategic context)
- Features: Voice recording (Mic icon), transcription, chairman feedback, strategic alignment (75%), performance phase
- Reality: Standalone component, NOT integrated with venture creation flow
- Problem: Users create venture via dialog (basic 3 fields) → venture created → Stage1DraftIdea never shown
- Expected: Create venture via basic dialog → redirect to Stage1DraftIdea → full idea capture → save to venture
- Evidence: VentureCreationDialog calls scaffoldStage1() but it's no-op, Stage1 data never captured
- Impact: Ventures missing rich Stage 1 metadata (tags, strategic context, voice, chairman feedback)

**WORKFLOW ORCHESTRATION GAP (40 stages, 63 components)**:
- Current: Venture created → sits at stage 0 or unknown stage → no automatic progression
- Components Exist:
  - CompleteWorkflowOrchestrator.tsx (916 LOC) - main orchestrator, not called
  - DynamicStageRenderer.tsx (14KB, 408 LOC) - renders stages dynamically, disconnected
  - WorkflowStageMap.tsx (8.9KB, 258 LOC) - visual workflow map, standalone
  - StageConfigurationForm.tsx (22KB, 665 LOC) - stage config, not integrated
  - WorkflowProgress.tsx (13KB, 382 LOC) - progress tracking, isolated
- Problem: All workflow components exist, but venture creation doesn't trigger workflow start
- Expected Flow:
  1. User creates venture (VentureCreationDialog)
  2. Venture saved to database with stage = 1
  3. Redirect to Stage1DraftIdea component
  4. User completes Stage 1 form (21 inputs + voice)
  5. Stage1 data saved to venture
  6. Workflow orchestrator kicks in → Stage 1 → Stage 2 → ... → Stage 40
  7. User guided through each stage automatically
- Current Flow:
  1. User creates venture (basic 3 fields)
  2. Venture saved with stage = 0
  3. User redirected to... nowhere? Venture grid?
  4. Stages 1-40 never triggered
  5. Workflow components unused
- Evidence: 322 "workflow.*stage" references but no createVenture → workflow connection

**SCAFFOLDSTAGE1 STUB (No-Op Function)**:
- Current Implementation: No-op function that returns true immediately without creating workflow data
- Called By: VentureCreationDialog.tsx line 26 (after createVenture)
- Purpose: Should scaffold Stage 1 data structure, create workflow entry, initialize stage progression
- Reality: Returns true immediately, does nothing
- Impact: Ventures created without workflow scaffolding, stages never initialized
- Needed Implementation:
  1. Create workflow_executions entry (venture_id, current_stage: 1, status: 'in_progress')
  2. Create stage_data entry for Stage 1 (venture_id, stage_number: 1, data: {})
  3. Set venture.current_stage = 1 in database
  4. Return stage 1 URL for redirect (/ventures/{id}/stage/1)

**NAVIGATION FLOW GAP**:
- After venture creation: Where does user go?
- VentureCreationDialog: onSuccess callback called, but no automatic navigation to Stage1
- Expected: onSuccess → navigate to /ventures/{ventureId}/stage/1 → Stage1DraftIdea component
- Current: onSuccess → refresh venture list → user sees new venture → clicks it → sees... what?
- Venture Detail Page: Shows venture info, but no "Start Stage 1" button visible
- Problem: Dead end after creation, user doesn't know next steps

**WORKFLOW COMPONENT INVENTORY (5 key components, 68KB, 2329 LOC)**:
- CompleteWorkflowOrchestrator.tsx: 31KB, 916 LOC - main workflow engine, multi-stage coordinator
- DynamicStageRenderer.tsx: 14KB, 408 LOC - dynamically loads stage components by number
- StageConfigurationForm.tsx: 22KB, 665 LOC - configure stage settings, validations
- WorkflowProgress.tsx: 13KB, 382 LOC - progress visualization, % complete, stage badges
- WorkflowStageMap.tsx: 8.9KB, 258 LOC - visual workflow map, stage dependencies
- Status: All components built, tested in isolation, NOT integrated with venture creation
- Integration Point: Need to call CompleteWorkflowOrchestrator after venture creation, pass ventureId`,

    scope: `**8-Week Venture Creation & Workflow Integration**:

**PHASE 1: Dialog Consolidation (Week 1)**
- Choose canonical dialog: VentureCreationDialog.tsx (361 LOC, most complete)
- Migrate features from other 2 dialogs if any unique
- Delete CreateVentureDialog.tsx, VentureCreateDialog.tsx
- Update all imports to use VentureCreationDialog

**PHASE 2: ScaffoldStage1 Implementation (Weeks 2-3)**
- Implement real scaffoldStage1() function:
  - Create workflow_executions entry
  - Initialize stage_data for Stage 1
  - Set venture.current_stage = 1
  - Return navigation URL
- Test: Create venture → scaffoldStage1 → verify workflow created

**PHASE 3: Stage1 Integration (Weeks 3-4)**
- Update VentureCreationDialog: After creation, navigate to /ventures/{id}/stage/1
- Ensure Stage1DraftIdea component loads at that route
- Pre-populate Stage1 form with data from creation dialog (title, description, category)
- Test: Create venture → redirected to Stage1 → form pre-filled → complete → data saved

**PHASE 4: Workflow Orchestration (Weeks 5-7)**
- Wire CompleteWorkflowOrchestrator to venture creation flow
- Implement stage progression logic: Stage1 complete → Stage2 → ... → Stage40
- Add workflow status to venture detail page (progress bar, current stage badge)
- Test: Complete Stage1 → verify Stage2 auto-triggers

**PHASE 5: Navigation & UX Polish (Week 8)**
- Add "Continue to Stage N" buttons on venture detail page
- Implement stage completion checkmarks
- Add workflow progress visualization
- Test: Full venture lifecycle (create → Stage1 → ... → Stage40 → complete)

**OUT OF SCOPE**:
- ❌ AI-driven stage progression (defer to separate SD)
- ❌ Multi-user workflow collaboration (covered in SD-REALTIME-001)
- ❌ Workflow templates/customization (defer to v2)`,

    strategic_objectives: [
      "Consolidate 3 duplicate venture creation dialogs into single canonical VentureCreationDialog (361 LOC), deleting 237 LOC of duplicate code, achieving 100% feature parity",
      "Implement scaffoldStage1() function to create workflow_executions, initialize stage_data, set venture.current_stage = 1, enabling automated workflow orchestration",
      "Integrate Stage1DraftIdea component into venture creation flow, redirecting users to /ventures/{id}/stage/1 after creation, capturing all 21 form inputs + voice + strategic context",
      "Wire CompleteWorkflowOrchestrator to venture lifecycle, implementing automatic stage progression (Stage1 → Stage2 → ... → Stage40), tracking completion status in database",
      "Build comprehensive navigation flow: Create venture → Stage1 form → Stage2-40 progression → Completion, with progress visualization and 'Continue to Stage N' CTAs",
      "Eliminate workflow component isolation: 68KB of workflow code (CompleteWorkflowOrchestrator, DynamicStageRenderer, WorkflowProgress, etc.) actively used vs currently dormant"
    ],

    success_criteria: [
      "✅ Dialog consolidation: 1 venture creation dialog remains (VentureCreationDialog), 0 duplicates, 100% features migrated, all imports updated",
      "✅ scaffoldStage1() implemented: Creates workflow_executions, stage_data, sets current_stage, returns navigation URL, 100% of new ventures have workflow initialized",
      "✅ Stage1 integration: 100% of venture creations redirect to Stage1DraftIdea, form pre-populated with basic data, 21 inputs + voice + strategic context captured",
      "✅ Workflow orchestration: CompleteWorkflowOrchestrator called on venture creation, stage progression works (Stage1 complete → Stage2 auto-loads), 100% of stages reachable",
      "✅ Navigation UX: Venture detail page shows current stage, 'Continue to Stage N' button visible, progress bar shows % complete, workflow map shows stage dependencies",
      "✅ End-to-end test: User can create venture, complete all 40 stages in sequence, venture marked complete, 0 dead ends or broken navigation",
      "✅ Code quality: 0 duplicate dialog code, 0 no-op stubs (scaffoldStage1 functional), 100% workflow components integrated, test coverage ≥80%",
      "✅ Data consistency: 100% of ventures have workflow_executions entry, current_stage field accurate, stage_data populated, 0 orphaned ventures (stage 0 or null)",
      "✅ User feedback: ≥90% of users successfully complete Stage1 after creation, ≥80% progress to Stage2+, ≤5% support tickets about 'venture created but can't find it'",
      "✅ Performance: Venture creation <2s, Stage1 redirect <500ms, workflow initialization <1s, 0 timeout errors"
    ],

    key_principles: [
      "**Single Source of Truth**: One canonical venture creation dialog (VentureCreationDialog), not 3 - reduce code duplication, eliminate inconsistencies",
      "**Progressive Disclosure**: Start simple (basic dialog), then deep dive (Stage1 21 inputs) - don't overwhelm users upfront, guide step-by-step",
      "**Workflow as First-Class Citizen**: Every venture MUST have workflow from creation - no orphans, no manual stage assignment, orchestrator is mandatory",
      "**Stage1 is Special**: Most detailed stage (21 inputs, voice, strategic context) - venture creation is gateway, Stage1 is foundation, can't skip",
      "**Navigation Continuity**: Create → Stage1 → Stage2 → ... → Stage40 → Complete - no dead ends, always show next step, clear progress indicators",
      "**Database-Driven Workflow**: workflow_executions table is source of truth for stage progression - not UI state, not local storage, always in sync",
      "**Fail-Safe Scaffolding**: scaffoldStage1() must succeed or roll back venture creation - no partial states, transaction integrity critical",
      "**Workflow Components Active, Not Dormant**: 68KB of orchestration code must be used, not just exist - justify investment, deliver value"
    ],

    implementation_guidelines: [
      "**PHASE 1: Dialog Consolidation (Week 1)**",
      "",
      "1. Audit 3 dialogs feature parity:",
      "   VentureCreationDialog: title, desc, category, assumptions, success criteria, voice, EVA",
      "   CreateVentureDialog: title, desc, category",
      "   VentureCreateDialog: minimal stub",
      "   Decision: Keep VentureCreationDialog (most features), delete other 2",
      "",
      "2. Find all imports of deprecated dialogs:",
      "   grep -r 'CreateVentureDialog\\|VentureCreateDialog' src --include='*.tsx' -l",
      "   Update to: import { VentureCreationDialog } from '@/components/ventures/VentureCreationDialog';",
      "",
      "3. Delete duplicate files:",
      "   rm src/components/ventures/CreateVentureDialog.tsx",
      "   rm src/components/ventures/VentureCreateDialog.tsx",
      "   Test: npm run build (verify no broken imports)",
      "",
      "4. Standardize usage across app:",
      "   All venture creation → VentureCreationDialog only",
      "   Consistent props: open, onClose, onSuccess(venture)",
      "",
      "**PHASE 2: ScaffoldStage1 Implementation (Weeks 2-3)**",
      "",
      "5. Implement scaffoldStage1() in src/services/ventures.ts:",
      "   export async function scaffoldStage1(ventureId: string): Promise<string> {",
      "     // 1. Create workflow execution",
      "     const { data: workflow, error: workflowError } = await supabase",
      "       .from('workflow_executions')",
      "       .insert({",
      "         venture_id: ventureId,",
      "         current_stage: 1,",
      "         status: 'in_progress',",
      "         started_at: new Date().toISOString()",
      "       })",
      "       .select()",
      "       .single();",
      "     if (workflowError) throw workflowError;",
      "     ",
      "     // 2. Initialize Stage 1 data",
      "     const { error: stageError } = await supabase",
      "       .from('stage_data')",
      "       .insert({",
      "         venture_id: ventureId,",
      "         stage_number: 1,",
      "         data: {},",
      "         status: 'pending'",
      "       });",
      "     if (stageError) throw stageError;",
      "     ",
      "     // 3. Update venture current_stage",
      "     const { error: updateError } = await supabase",
      "       .from('ventures')",
      "       .update({ current_stage: 1 })",
      "       .eq('id', ventureId);",
      "     if (updateError) throw updateError;",
      "     ",
      "     // 4. Return Stage 1 URL",
      "     return `/ventures/${ventureId}/stage/1`;",
      "   }",
      "",
      "6. Create database tables if not exist:",
      "   CREATE TABLE IF NOT EXISTS workflow_executions (",
      "     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),",
      "     venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,",
      "     current_stage INTEGER NOT NULL,",
      "     status TEXT NOT NULL, -- 'in_progress', 'completed', 'blocked'",
      "     started_at TIMESTAMPTZ NOT NULL,",
      "     completed_at TIMESTAMPTZ",
      "   );",
      "   ",
      "   CREATE TABLE IF NOT EXISTS stage_data (",
      "     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),",
      "     venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,",
      "     stage_number INTEGER NOT NULL,",
      "     data JSONB DEFAULT '{}',",
      "     status TEXT NOT NULL, -- 'pending', 'in_progress', 'completed'",
      "     completed_at TIMESTAMPTZ",
      "   );",
      "",
      "7. Test scaffoldStage1:",
      "   Create venture → scaffoldStage1(ventureId)",
      "   Verify: workflow_executions row created, stage_data row created, venture.current_stage = 1",
      "",
      "**PHASE 3: Stage1 Integration (Weeks 3-4)**",
      "",
      "8. Update VentureCreationDialog onSuccess:",
      "   const handleSubmit = async () => {",
      "     const venture = await createVenture({ title, description, category });",
      "     const stage1Url = await scaffoldStage1(venture.id);",
      "     ",
      "     onSuccess(venture);",
      "     navigate(stage1Url); // Redirect to Stage1",
      "   };",
      "",
      "9. Create Stage1 route if not exist:",
      "   // In router config",
      "   { path: '/ventures/:id/stage/:stageNumber', component: DynamicStageRenderer }",
      "",
      "10. Pre-populate Stage1DraftIdea with creation data:",
      "    const Stage1DraftIdea = ({ ventureId }) => {",
      "      const { data: venture } = useQuery(['venture', ventureId], () => getVenture(ventureId));",
      "      ",
      "      const [formData, setFormData] = useState({",
      "        title: venture?.title || '',",
      "        description: venture?.description || '',",
      "        category: venture?.category || '',",
      "        // ... rest of 21 fields",
      "      });",
      "",
      "11. Save Stage1 data on completion:",
      "    const handleStage1Complete = async (data) => {",
      "      await supabase",
      "        .from('stage_data')",
      "        .update({ data, status: 'completed', completed_at: new Date().toISOString() })",
      "        .eq('venture_id', ventureId)",
      "        .eq('stage_number', 1);",
      "      ",
      "      // Trigger Stage 2",
      "      navigate(`/ventures/${ventureId}/stage/2`);",
      "    };",
      "",
      "**PHASE 4: Workflow Orchestration (Weeks 5-7)**",
      "",
      "12. Wire CompleteWorkflowOrchestrator:",
      "    // In DynamicStageRenderer.tsx",
      "    import { CompleteWorkflowOrchestrator } from '@/components/stages/CompleteWorkflowOrchestrator';",
      "    ",
      "    return <CompleteWorkflowOrchestrator ventureId={ventureId} initialStage={stageNumber} />;",
      "",
      "13. Implement stage progression logic:",
      "    const handleStageComplete = async (stageNumber: number) => {",
      "      // Mark current stage complete",
      "      await supabase",
      "        .from('stage_data')",
      "        .update({ status: 'completed' })",
      "        .eq('venture_id', ventureId)",
      "        .eq('stage_number', stageNumber);",
      "      ",
      "      // Advance to next stage",
      "      const nextStage = stageNumber + 1;",
      "      if (nextStage <= 40) {",
      "        await supabase",
      "          .from('workflow_executions')",
      "          .update({ current_stage: nextStage })",
      "          .eq('venture_id', ventureId);",
      "        ",
      "        navigate(`/ventures/${ventureId}/stage/${nextStage}`);",
      "      } else {",
      "        // Workflow complete",
      "        await supabase",
      "          .from('workflow_executions')",
      "          .update({ status: 'completed', completed_at: new Date().toISOString() })",
      "          .eq('venture_id', ventureId);",
      "      }",
      "    };",
      "",
      "14. Add workflow status to venture detail page:",
      "    const { data: workflow } = useQuery(['workflow', ventureId], () =>",
      "      supabase.from('workflow_executions').select('*').eq('venture_id', ventureId).single()",
      "    );",
      "    ",
      "    <WorkflowProgress current={workflow?.current_stage} total={40} />",
      "",
      "**PHASE 5: Navigation & UX Polish (Week 8)**",
      "",
      "15. Add 'Continue to Stage N' button:",
      "    <Button onClick={() => navigate(`/ventures/${ventureId}/stage/${workflow.current_stage}`)}>",
      "      Continue to Stage {workflow.current_stage}",
      "    </Button>",
      "",
      "16. Implement stage completion checkmarks:",
      "    const { data: completedStages } = useQuery(['stages', ventureId], () =>",
      "      supabase.from('stage_data').select('stage_number').eq('status', 'completed')",
      "    );",
      "    ",
      "    {[...Array(40)].map((_, i) => (",
      "      <div key={i}>",
      "        Stage {i + 1}",
      "        {completedStages.includes(i + 1) && <CheckCircle />}",
      "      </div>",
      "    ))}",
      "",
      "17. Add workflow progress visualization:",
      "    <Progress value={(workflow.current_stage / 40) * 100} />",
      "    <p>{workflow.current_stage} of 40 stages complete ({Math.round((workflow.current_stage / 40) * 100)}%)</p>",
      "",
      "18. Test full lifecycle:",
      "    - Create venture → redirected to Stage1",
      "    - Complete Stage1 21 inputs → click Next → Stage2 loads",
      "    - Complete Stages 2-40 → workflow marked complete",
      "    - Venture detail shows 100% complete, all checkmarks green"
    ],

    risks: [
      {
        risk: "Dialog consolidation breaks existing flows: Deleting 2 dialogs may break pages that import them, runtime errors in production, user-facing bugs",
        probability: "Medium (40%)",
        impact: "High - Venture creation broken, users cannot create ventures, critical feature down",
        mitigation: "Comprehensive grep search for all imports before deletion, update all references, run build to catch TypeScript errors, E2E test all creation flows (VenturesPage, dashboard, quick actions), staged rollout (consolidate imports first, delete files later)"
      },
      {
        risk: "scaffoldStage1() database errors: workflow_executions or stage_data tables don't exist, foreign key constraints fail, transactions timeout",
        probability: "Medium (50%)",
        impact: "High - Ventures created but no workflow, users stuck, data inconsistency",
        mitigation: "Create migration scripts for tables, run migrations before deployment, add error handling + rollback logic (if workflow fails, delete venture), comprehensive testing (unit test scaffoldStage1, integration test full creation flow)"
      },
      {
        risk: "Stage1 navigation breaks: URL routing doesn't work, DynamicStageRenderer fails to load Stage1, 404 errors after creation",
        probability: "Low (30%)",
        impact: "Medium - Users redirected to broken page, must manually navigate, confusion",
        mitigation: "Test route exists (/ventures/:id/stage/:stageNumber), verify DynamicStageRenderer works, fallback route to venture detail if stage route fails, error boundary with helpful message ('Stage1 loading error, click here to return')"
      },
      {
        risk: "Workflow orchestrator performance: CompleteWorkflowOrchestrator loads all 40 stage components, slow initial render, memory issues",
        probability: "Medium (40%)",
        impact: "Medium - Slow UX, 3-5s load time, user frustration",
        mitigation: "Lazy load stages (only load current stage, not all 40), code split by stage chunk (Ideation, Planning, Build, Launch, Operate), monitor bundle size, implement loading states, optimize with React.memo"
      },
      {
        risk: "Stage progression logic bugs: Stage2 doesn't auto-load after Stage1, user stuck, workflow status incorrect",
        probability: "Medium (50%)",
        impact: "High - Broken workflow, users cannot progress, support burden",
        mitigation: "Comprehensive testing of stage transitions (1→2→3...→40), verify workflow_executions.current_stage updates, add 'Skip to Stage N' escape hatch for testing/debugging, monitor workflow completion rates (alert if <10% reach Stage5)"
      }
    ],

    success_metrics: [
      {
        metric: "Dialog consolidation",
        target: "1 venture creation dialog remains, 0 duplicates, 100% features migrated",
        measurement: "find src -name '*[Vv]enture*[Cc]reat*' -o -name '*[Cc]reate*[Vv]enture*' | wc -l (should be 1)"
      },
      {
        metric: "scaffoldStage1() success rate",
        target: "100% of venture creations have workflow initialized, 0 orphaned ventures",
        measurement: "SELECT COUNT(*) FROM ventures WHERE id NOT IN (SELECT venture_id FROM workflow_executions) (should be 0)"
      },
      {
        metric: "Stage1 completion rate",
        target: "≥90% of ventures created reach Stage1 form, ≥80% complete Stage1",
        measurement: "SELECT COUNT(*) FROM stage_data WHERE stage_number=1 AND status='completed' / COUNT(*) FROM ventures"
      },
      {
        metric: "Workflow progression",
        target: "≥70% of ventures progress to Stage2+, ≥50% to Stage5+, ≥30% to Stage10+",
        measurement: "SELECT current_stage, COUNT(*) FROM workflow_executions GROUP BY current_stage"
      },
      {
        metric: "Navigation continuity",
        target: "0 dead ends, 100% of stages have 'Next' button, venture detail shows current stage",
        measurement: "Manual test: Create venture, verify redirect to Stage1, complete Stage1, verify Stage2 loads, check venture detail shows progress"
      },
      {
        metric: "End-to-end completion",
        target: "≥10% of ventures reach Stage40 (full lifecycle complete) within 90 days",
        measurement: "SELECT COUNT(*) FROM workflow_executions WHERE status='completed' AND completed_at > NOW() - INTERVAL '90 days'"
      },
      {
        metric: "User support tickets",
        target: "≤5 tickets/month about 'venture created but can't find next step'",
        measurement: "Support ticket count with tags: venture-creation, workflow-navigation, stage-confusion"
      }
    ],

    metadata: {
      "duplicate_dialogs": {
        "VentureCreationDialog": "361 LOC, most complete (EVA validation, voice capture)",
        "CreateVentureDialog": "190 LOC, simplified (basic form only)",
        "VentureCreateDialog": "47 LOC, minimal stub (likely unused)",
        "decision": "Keep VentureCreationDialog, delete other 2"
      },
      "scaffold_stage1_stub": {
        "current_implementation": "returns true immediately, does nothing",
        "needed_implementation": "Create workflow_executions, stage_data, set current_stage, return URL"
      },
      "workflow_components": {
        "CompleteWorkflowOrchestrator": "31KB, 916 LOC, main engine (currently dormant)",
        "DynamicStageRenderer": "14KB, 408 LOC, loads stages by number",
        "WorkflowProgress": "13KB, 382 LOC, progress visualization",
        "WorkflowStageMap": "8.9KB, 258 LOC, visual map",
        "StageConfigurationForm": "22KB, 665 LOC, stage config",
        "status": "Built but not integrated with creation flow"
      },
      "stage1_integration": {
        "component": "Stage1DraftIdea.tsx",
        "inputs": 21,
        "features": "Voice capture, EVA validation, strategic context",
        "current_connection": "None - standalone component",
        "needed_connection": "Redirect after creation, pre-populate basic fields"
      },
      "implementation_plan": {
        "phase_1": "Dialog consolidation (Week 1)",
        "phase_2": "scaffoldStage1() (Weeks 2-3)",
        "phase_3": "Stage1 integration (Weeks 3-4)",
        "phase_4": "Workflow orchestration (Weeks 5-7)",
        "phase_5": "Navigation & UX polish (Week 8)"
      },
      "prd_readiness": {
        "scope_clarity": "95% - Clear 8-week plan with 18 implementation steps",
        "execution_readiness": "90% - Components exist, need wiring",
        "risk_coverage": "90% - 5 risks with mitigation strategies",
        "business_impact": "95% - Unblocks workflow, enables 40-stage lifecycle"
      }
    }
  };

  const { error } = await supabase
    .from('strategic_directives_v2')
    .update(updatedSD)
    .eq('sd_key', 'SD-RECONNECT-002');

  if (error) {
    console.error('❌ Error updating SD-RECONNECT-002:', error);
    process.exit(1);
  }

  console.log('✅ SD-RECONNECT-002 updated successfully!\n');
  console.log('📊 Summary of Updates:');
  console.log('  ✓ Enhanced description with venture creation flow analysis');
  console.log('  ✓ 8-week integration plan (18 implementation steps)');
  console.log('  ✓ 6 strategic objectives');
  console.log('  ✓ 10 success criteria');
  console.log('  ✓ 8 key principles');
  console.log('  ✓ 18 implementation guidelines across 5 phases');
  console.log('  ✓ 5 risks with mitigation');
  console.log('  ✓ 7 success metrics\n');

  console.log('🔧 Critical Integration Gaps:');
  console.log('  ✓ 3 duplicate creation dialogs (598 LOC total)');
  console.log('  ✓ scaffoldStage1() is no-op stub');
  console.log('  ✓ Stage1DraftIdea disconnected from creation');
  console.log('  ✓ Workflow orchestrator (68KB, 2329 LOC) dormant');
  console.log('  ✓ No automatic stage progression\n');

  console.log('✨ SD-RECONNECT-002 enhancement complete!');
}

updateSDRECONNECT002();
