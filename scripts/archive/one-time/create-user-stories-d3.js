#!/usr/bin/env node

/**
 * Create User Stories for SD-VISION-TRANSITION-001D5
 * Phase 5: THE BUILD LOOP - Stages 17-20
 *
 * Coverage:
 * - Stage 17: Environment & Agent Config
 * - Stage 18: MVP Development Loop
 * - Stage 19: Integration & API Layer
 * - Stage 20: Security & Performance
 * - Navigation: Phase 5 workflow
 *
 * INVEST Criteria: All stories follow Independent, Negotiable, Valuable, Estimable, Small, Testable
 * E2E Mapping: Each story includes e2e_test_path for automated mapping
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createUserStories() {
  console.log('\n📋 Creating User Stories for Phase 5: THE BUILD LOOP (Stages 17-20)');
  console.log('='.repeat(80));

  const sdId = 'SD-VISION-TRANSITION-001D5';
  const prdId = 'PRD-SD-VISION-TRANSITION-001D5';

  const userStories = [
    // ============================================
    // US-001: Stage 17 - Environment & Agent Config
    // ============================================
    {
      story_key: `${sdId}:US-001`,
      sd_id: sdId,
      prd_id: prdId,
      title: 'Stage 17: Environment & Agent Config Interface',
      user_role: 'venture owner',
      user_want: 'configure system prompts, CI/CD settings, and agent parameters for my venture',
      user_benefit: 'I can customize the AI agents and automation to match my venture needs',
      acceptance_criteria: [
        'Given I am on Stage 17, When I view the interface, Then I see System Prompt Editor, CI/CD Config, and Agent Parameters sections',
        'Given I edit a system prompt, When I save changes, Then the prompt is saved to venture_stage_work and marked as modified',
        'Given I configure CI/CD settings, When I enable/disable features, Then settings are persisted and validated',
        'Given I adjust agent parameters, When I change values, Then parameters are validated against allowed ranges',
        'Given I complete all configurations, When I click Next, Then system validates completeness and saves artifacts',
        'Given I have artifacts, When I view the stage, Then I see artifact count badge and can download config files'
      ],
      priority: 'high',
      story_points: 8,
      depends_on: [],
      test_scenarios: [
        'Happy path: Complete all configuration sections',
        'Error path: Invalid system prompt syntax',
        'Error path: CI/CD config missing required fields',
        'Edge case: Agent parameter out of range',
        'Edge case: Very long system prompt (>10k chars)',
        'Integration: Save to venture_stage_work with correct artifact_type',
        'Integration: Download artifact as JSON/YAML file',
        'Accessibility: Keyboard navigation through all editors',
        'Accessibility: Screen reader announces validation errors'
      ],
      technical_notes: 'Components: Stage17EnvironmentConfig.tsx, SystemPromptEditor.tsx, CICDConfigForm.tsx, AgentParametersPanel.tsx. Database: venture_stage_work (artifact_type: "system_prompt", "cicd_config", "agent_params"). Validation: JSON schema for CI/CD, parameter range validation. Estimated: 5-6 hours. FR-17.',
      implementation_context: `**Architecture References**:
- Similar: Stage 14 (Technical Stack) - multi-section configuration
- Pattern: Form state management with react-hook-form + zod validation
- Storage: venture_stage_work table with artifact_metadata JSONB

**Example Code Patterns**:
\`\`\`typescript
// System Prompt Editor (Monaco or CodeMirror)
const SystemPromptEditor = ({ ventureId, stageId }) => {
  const { data: artifact } = useVentureStageWork(ventureId, stageId, 'system_prompt');
  const saveMutation = useSaveArtifact();

  const handleSave = (promptContent: string) => {
    saveMutation.mutate({
      venture_id: ventureId,
      stage_id: stageId,
      artifact_type: 'system_prompt',
      artifact_data: { content: promptContent, version: '1.0' },
      status: 'completed'
    });
  };

  return <MonacoEditor value={artifact?.content} onChange={handleSave} />;
};
\`\`\`

**Integration Points**:
- src/hooks/useVentureStageWork.ts - CRUD operations
- src/components/ventures/stage-work/ - Reusable artifact components
- database/schema/venture_stage_work table - Artifact storage

**Testing Scenarios**:
- E2E: tests/e2e/phase5-build-loop/US-001-stage17-config.spec.ts
- Unit: Validation logic for system prompts, CI/CD config
- Integration: Artifact save/load, download functionality`,
      e2e_test_path: 'tests/e2e/phase5-build-loop/US-001-stage17-config.spec.ts',
      e2e_test_status: 'not_created',
      status: 'draft'
    },

    // ============================================
    // US-002: Stage 18 - MVP Development Loop
    // ============================================
    {
      story_key: `${sdId}:US-002`,
      sd_id: sdId,
      prd_id: prdId,
      title: 'Stage 18: MVP Development Loop Tracking',
      user_role: 'venture owner',
      user_want: 'track user stories, sprint progress, and technical debt during MVP development',
      user_benefit: 'I can monitor development velocity and maintain code quality',
      acceptance_criteria: [
        'Given I am on Stage 18, When I view the interface, Then I see User Story Board, Sprint Tracker, and Technical Debt Log',
        'Given I create a user story, When I fill required fields (title, role, want, benefit), Then story is saved with status "draft"',
        'Given I have user stories, When I drag-and-drop between columns, Then status updates (todo → in_progress → done)',
        'Given I view sprint tracker, When sprint is active, Then I see burndown chart and velocity metrics',
        'Given I log technical debt, When I add debt item, Then it is categorized (code_smell, duplication, complexity) and prioritized',
        'Given I complete all stories in sprint, When I click Next, Then system calculates completion percentage and saves progress'
      ],
      priority: 'high',
      story_points: 13,
      test_scenarios: [
        'Happy path: Create and complete full sprint cycle',
        'Error path: User story missing required fields',
        'Error path: Invalid status transition (done → todo)',
        'Edge case: Sprint with 0 story points',
        'Edge case: Technical debt item with no category',
        'Integration: Real-time updates when multiple users edit',
        'Integration: Link user story to technical debt item',
        'Accessibility: Keyboard-only drag-and-drop',
        'Accessibility: Screen reader announces status changes'
      ],
      technical_notes: 'Components: Stage18MVPDevLoop.tsx, UserStoryBoard.tsx (Kanban), SprintTracker.tsx, TechnicalDebtLog.tsx. Database: user_stories table integration, venture_stage_work (artifact_type: "sprint_data", "debt_log"). Libraries: @dnd-kit/core for drag-and-drop, recharts for burndown. Estimated: 8-10 hours. FR-18.',
      implementation_context: `**Architecture References**:
- Similar: Existing user_stories table schema
- Pattern: Kanban board with drag-and-drop (@dnd-kit)
- Visualization: Burndown chart (recharts)

**Example Code Patterns**:
\`\`\`typescript
// User Story Board with Drag-and-Drop
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

const UserStoryBoard = ({ ventureId, stageId }) => {
  const { data: stories } = useUserStories(ventureId);
  const updateStatusMutation = useUpdateUserStoryStatus();

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (over) {
      updateStatusMutation.mutate({
        story_id: active.id,
        new_status: over.id // 'todo', 'in_progress', 'done'
      });
    }
  };

  return (
    <DndContext onDragEnd={handleDragEnd} collisionDetection={closestCenter}>
      <div className="grid grid-cols-3 gap-4">
        {['todo', 'in_progress', 'done'].map(status => (
          <Column key={status} status={status} stories={stories.filter(s => s.status === status)} />
        ))}
      </div>
    </DndContext>
  );
};
\`\`\`

**Integration Points**:
- src/hooks/useUserStories.ts - Fetch user stories by venture
- src/hooks/useUpdateUserStoryStatus.ts - Update story status
- database/schema/user_stories table - Story persistence
- src/components/charts/BurndownChart.tsx - Sprint visualization

**Testing Scenarios**:
- E2E: tests/e2e/phase5-build-loop/US-002-stage18-mvp-loop.spec.ts
- Unit: Status transition validation, burndown calculation
- Integration: Drag-and-drop state updates, real-time sync`,
      e2e_test_path: 'tests/e2e/phase5-build-loop/US-002-stage18-mvp-loop.spec.ts',
      e2e_test_status: 'not_created',
      status: 'draft'
    },

    // ============================================
    // US-003: Stage 19 - Integration & API Layer
    // ============================================
    {
      story_key: `${sdId}:US-003`,
      sd_id: sdId,
      prd_id: prdId,
      title: 'Stage 19: Integration & API Contract Management',
      user_role: 'venture owner',
      user_want: 'define API contracts, track integrations, and monitor coverage',
      user_benefit: 'I ensure my MVP integrates correctly with external services and internal APIs',
      acceptance_criteria: [
        'Given I am on Stage 19, When I view the interface, Then I see API Contract Display, Integration Checklist, and Coverage Metrics',
        'Given I define an API contract, When I specify endpoint/method/schema, Then contract is validated and saved',
        'Given I have API contracts, When I view list, Then I see endpoint, method, status (draft/implemented/tested)',
        'Given I work on integrations, When I check off items, Then checklist progress updates and saves',
        'Given I view coverage metrics, When data loads, Then I see API coverage %, integration status, and test results',
        'Given I complete all integrations, When I click Next, Then system validates 100% coverage and generates integration report'
      ],
      priority: 'high',
      story_points: 10,
      test_scenarios: [
        'Happy path: Define contract, implement, test, mark complete',
        'Error path: Invalid API contract schema (malformed JSON)',
        'Error path: Incomplete integration checklist',
        'Edge case: API contract with no authentication',
        'Edge case: Integration with circular dependencies',
        'Integration: OpenAPI/Swagger import',
        'Integration: Generate Postman collection from contracts',
        'Accessibility: Keyboard navigation through contract list',
        'Accessibility: Screen reader announces coverage percentage'
      ],
      technical_notes: 'Components: Stage19IntegrationAPI.tsx, APIContractDisplay.tsx, IntegrationChecklist.tsx, CoverageMetrics.tsx. Database: venture_stage_work (artifact_type: "api_contract", "integration_checklist"). Validation: OpenAPI schema validator. Libraries: swagger-ui-react for contract preview. Estimated: 6-7 hours. FR-19.',
      implementation_context: `**Architecture References**:
- Similar: Stage 14 (Technical Stack) - list/detail view
- Pattern: API contract DSL (OpenAPI 3.0 format)
- Visualization: Coverage donut chart

**Example Code Patterns**:
\`\`\`typescript
// API Contract Schema (Zod)
const apiContractSchema = z.object({
  endpoint: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  request_schema: z.object({}).passthrough(),
  response_schema: z.object({}).passthrough(),
  authentication: z.enum(['none', 'api_key', 'oauth2', 'jwt']),
  status: z.enum(['draft', 'implemented', 'tested'])
});

// API Contract Display
const APIContractDisplay = ({ ventureId, stageId }) => {
  const { data: contracts } = useAPIContracts(ventureId, stageId);
  const [selectedContract, setSelectedContract] = useState(null);

  return (
    <div className="grid grid-cols-2 gap-4">
      <APIContractList
        contracts={contracts}
        onSelect={setSelectedContract}
      />
      <SwaggerUIPreview contract={selectedContract} />
    </div>
  );
};
\`\`\`

**Integration Points**:
- src/hooks/useAPIContracts.ts - CRUD for API contracts
- src/lib/openapi-validator.ts - OpenAPI schema validation
- src/components/ventures/stage-work/SwaggerUIPreview.tsx
- database/schema/venture_stage_work - Contract storage

**Testing Scenarios**:
- E2E: tests/e2e/phase5-build-loop/US-003-stage19-integration.spec.ts
- Unit: API contract validation, coverage calculation
- Integration: OpenAPI import, Postman export`,
      e2e_test_path: 'tests/e2e/phase5-build-loop/US-003-stage19-integration.spec.ts',
      e2e_test_status: 'not_created',
      status: 'draft'
    },

    // ============================================
    // US-004: Stage 20 - Security & Performance
    // ============================================
    {
      story_key: `${sdId}:US-004`,
      sd_id: sdId,
      prd_id: prdId,
      title: 'Stage 20: Security & Performance Audit',
      user_role: 'venture owner',
      user_want: 'conduct OWASP security checks, monitor performance, and ensure accessibility',
      user_benefit: 'I launch a secure, fast, and accessible MVP',
      acceptance_criteria: [
        'Given I am on Stage 20, When I view the interface, Then I see OWASP Checklist, Performance Metrics, and Accessibility Report',
        'Given I review OWASP checklist, When I check items, Then I see categories (Injection, XSS, Auth, etc.) and completion %',
        'Given I view performance metrics, When data loads, Then I see Lighthouse scores (Performance, SEO, Best Practices)',
        'Given I run accessibility audit, When scan completes, Then I see WCAG compliance level and violation count',
        'Given I fix all critical issues, When I mark stage complete, Then system validates minimum thresholds (OWASP 90%, Perf 85%, A11y AA)',
        'Given I generate audit report, When I download, Then I receive PDF with all findings and remediation steps'
      ],
      priority: 'high',
      story_points: 13,
      test_scenarios: [
        'Happy path: Pass all audits and complete stage',
        'Error path: OWASP checklist below 90% threshold',
        'Error path: Performance score below 85%',
        'Error path: Accessibility violations (A/AA/AAA)',
        'Edge case: Lighthouse timeout or error',
        'Edge case: No performance data available',
        'Integration: Lighthouse CI integration',
        'Integration: axe-core accessibility scanner',
        'Accessibility: Audit report keyboard-navigable',
        'Accessibility: WCAG 2.1 AA compliance for Stage 20 itself'
      ],
      technical_notes: 'Components: Stage20SecurityPerf.tsx, OWASPChecklist.tsx, PerformanceMetrics.tsx, AccessibilityReport.tsx. Database: venture_stage_work (artifact_type: "owasp_audit", "perf_metrics", "a11y_report"). APIs: Lighthouse CI, axe-core. Libraries: @axe-core/react, lighthouse. Estimated: 8-10 hours. FR-20.',
      implementation_context: `**Architecture References**:
- Similar: Stage 18 (MVP Dev Loop) - checklist pattern
- Pattern: Automated audit integration (Lighthouse, axe-core)
- Visualization: Score gauges (Lighthouse style)

**Example Code Patterns**:
\`\`\`typescript
// OWASP Checklist (OWASP Top 10 2021)
const owaspCategories = [
  { id: 'A01', name: 'Broken Access Control', items: 5 },
  { id: 'A02', name: 'Cryptographic Failures', items: 4 },
  { id: 'A03', name: 'Injection', items: 6 },
  // ... all 10 categories
];

const OWASPChecklist = ({ ventureId, stageId }) => {
  const { data: audit } = useOWASPAudit(ventureId, stageId);
  const updateMutation = useUpdateOWASPItem();

  const completionRate = useMemo(() => {
    const total = owaspCategories.reduce((sum, cat) => sum + cat.items, 0);
    const completed = audit?.checkedItems?.length || 0;
    return (completed / total) * 100;
  }, [audit]);

  return (
    <div>
      <ProgressBar value={completionRate} threshold={90} />
      {owaspCategories.map(category => (
        <CategorySection key={category.id} category={category} audit={audit} />
      ))}
    </div>
  );
};

// Performance Metrics (Lighthouse)
const PerformanceMetrics = ({ ventureId, stageId }) => {
  const runLighthouse = useRunLighthouse();
  const { data: metrics } = usePerformanceMetrics(ventureId, stageId);

  return (
    <div className="grid grid-cols-4 gap-4">
      <ScoreGauge label="Performance" score={metrics?.performance} />
      <ScoreGauge label="Accessibility" score={metrics?.accessibility} />
      <ScoreGauge label="Best Practices" score={metrics?.bestPractices} />
      <ScoreGauge label="SEO" score={metrics?.seo} />
    </div>
  );
};
\`\`\`

**Integration Points**:
- src/hooks/useOWASPAudit.ts - OWASP checklist CRUD
- src/hooks/useRunLighthouse.ts - Trigger Lighthouse audit
- src/lib/lighthouse-runner.ts - Lighthouse API wrapper
- src/lib/axe-scanner.ts - axe-core integration
- database/schema/venture_stage_work - Audit results storage

**Testing Scenarios**:
- E2E: tests/e2e/phase5-build-loop/US-004-stage20-security-perf.spec.ts
- Unit: Completion rate calculation, threshold validation
- Integration: Lighthouse API, axe-core scanner`,
      e2e_test_path: 'tests/e2e/phase5-build-loop/US-004-stage20-security-perf.spec.ts',
      e2e_test_status: 'not_created',
      status: 'draft'
    },

    // ============================================
    // US-005: Phase 5 Navigation & Workflow
    // ============================================
    {
      story_key: `${sdId}:US-005`,
      sd_id: sdId,
      prd_id: prdId,
      title: 'Phase 5: Navigation & Stage Dependency Management',
      user_role: 'venture owner',
      user_want: 'navigate between Stages 17-20 with clear workflow and dependency enforcement',
      user_benefit: 'I complete THE BUILD LOOP in the correct sequence without missing steps',
      acceptance_criteria: [
        'Given I am in Phase 5, When I view navigation, Then I see stages 17→18→19→20 with status indicators',
        'Given I am on Stage 17, When Stage 17 is incomplete, Then Stage 18 is locked',
        'Given I complete Stage 17, When I click Next, Then I navigate to Stage 18 and it becomes unlocked',
        'Given I am on Stage 20, When I complete all audits, Then I see "Complete Phase 5" button',
        'Given I click "Complete Phase 5", When validation passes, Then phase marked complete and I navigate to Phase 6',
        'Given I am on any stage, When I use breadcrumbs, Then I can navigate to unlocked stages'
      ],
      priority: 'medium',
      story_points: 5,
      test_scenarios: [
        'Happy path: Complete all stages in sequence',
        'Error path: Try to skip to Stage 19 from Stage 17',
        'Error path: Try to complete Phase 5 with Stage 18 incomplete',
        'Edge case: Navigate back to earlier stage',
        'Edge case: Refresh page mid-stage',
        'Integration: Stage completion updates venture_stage_work',
        'Integration: Breadcrumb navigation',
        'Accessibility: Keyboard navigation through stages',
        'Accessibility: Screen reader announces locked/unlocked status'
      ],
      technical_notes: 'Components: Phase5Navigation.tsx, StageDependencyGuard.tsx, PhaseCompletionButton.tsx. Database: venture_stage_work (status: "not_started", "in_progress", "completed"). Logic: Dependency chain validation. Estimated: 3-4 hours. FR-NAV.',
      implementation_context: `**Architecture References**:
- Similar: Existing phase navigation (Phases 1-4)
- Pattern: Linear workflow with dependency locking
- State: venture_stage_work tracks completion

**Example Code Patterns**:
\`\`\`typescript
// Stage Dependency Logic
const useStageDependencies = (ventureId: string, phaseId: number) => {
  const { data: stages } = useVentureStageWork(ventureId, phaseId);

  const isStageUnlocked = (stageId: number) => {
    if (stageId === 17) return true; // First stage always unlocked

    const previousStage = stages?.find(s => s.stage_id === stageId - 1);
    return previousStage?.status === 'completed';
  };

  const canCompletePhase = () => {
    return stages?.every(s => s.status === 'completed');
  };

  return { isStageUnlocked, canCompletePhase };
};

// Phase 5 Navigation
const Phase5Navigation = ({ ventureId, currentStage }) => {
  const { isStageUnlocked } = useStageDependencies(ventureId, 5);

  const stages = [
    { id: 17, name: 'Environment & Agent Config', icon: Settings },
    { id: 18, name: 'MVP Development Loop', icon: Code },
    { id: 19, name: 'Integration & API Layer', icon: Link },
    { id: 20, name: 'Security & Performance', icon: Shield }
  ];

  return (
    <nav className="flex space-x-4">
      {stages.map(stage => (
        <StageButton
          key={stage.id}
          stage={stage}
          active={currentStage === stage.id}
          locked={!isStageUnlocked(stage.id)}
        />
      ))}
    </nav>
  );
};
\`\`\`

**Integration Points**:
- src/hooks/useVentureStageWork.ts - Fetch stage completion status
- src/hooks/useStageDependencies.ts - Dependency logic
- src/components/ventures/PhaseNavigation.tsx - Reusable nav component
- database/schema/venture_stage_work - Status tracking

**Testing Scenarios**:
- E2E: tests/e2e/phase5-build-loop/US-005-phase5-navigation.spec.ts
- Unit: Dependency logic, completion validation
- Integration: Navigation state persistence`,
      e2e_test_path: 'tests/e2e/phase5-build-loop/US-005-phase5-navigation.spec.ts',
      e2e_test_status: 'not_created',
      status: 'draft'
    },

    // ============================================
    // US-006: Phase 5 Summary & Completion Report
    // ============================================
    {
      story_key: `${sdId}:US-006`,
      sd_id: sdId,
      prd_id: prdId,
      title: 'Phase 5: Summary Dashboard & Completion Report',
      user_role: 'venture owner',
      user_want: 'view a summary of all Phase 5 work and generate a completion report',
      user_benefit: 'I have a comprehensive overview of my BUILD LOOP progress and a shareable report',
      acceptance_criteria: [
        'Given I view Phase 5 Summary, When data loads, Then I see stage completion %, artifact count, and key metrics',
        'Given I click on a stage card, When stage has artifacts, Then I see artifact list with download links',
        'Given I view Build Loop Metrics, When data loads, Then I see sprint velocity, API coverage, security score, performance score',
        'Given I click "Generate Report", When all stages complete, Then I receive PDF with all artifacts and metrics',
        'Given I click "Generate Report", When stages incomplete, Then I see warning and list of incomplete items',
        'Given I view historical data, When I select date range, Then I see progress over time chart'
      ],
      priority: 'medium',
      story_points: 8,
      test_scenarios: [
        'Happy path: View complete Phase 5 summary',
        'Error path: No artifacts available',
        'Error path: Report generation fails',
        'Edge case: Phase 5 just started (0% complete)',
        'Edge case: Very large artifact list (>100 items)',
        'Integration: Aggregate data from all stages',
        'Integration: PDF generation with charts',
        'Accessibility: Summary cards keyboard-navigable',
        'Accessibility: Report accessible (PDF/UA)'
      ],
      technical_notes: 'Components: Phase5SummaryDashboard.tsx, StageArtifactList.tsx, BuildLoopMetrics.tsx, ReportGenerator.tsx. Database: Aggregate queries on venture_stage_work, user_stories. Libraries: jsPDF or puppeteer for report generation, recharts for progress charts. Estimated: 5-6 hours. FR-NAV.',
      implementation_context: `**Architecture References**:
- Similar: Dashboard patterns from Phase 1-4 summaries
- Pattern: Aggregation queries for metrics
- Export: PDF generation with charts/tables

**Example Code Patterns**:
\`\`\`typescript
// Phase 5 Summary Metrics
const Phase5SummaryDashboard = ({ ventureId }) => {
  const { data: summary } = usePhase5Summary(ventureId);

  const metrics = [
    {
      label: 'Environment Config',
      stage: 17,
      completion: summary?.stage17?.completion || 0,
      artifacts: summary?.stage17?.artifact_count || 0
    },
    {
      label: 'MVP Dev Loop',
      stage: 18,
      completion: summary?.stage18?.completion || 0,
      artifacts: summary?.stage18?.artifact_count || 0
    },
    {
      label: 'Integration & API',
      stage: 19,
      completion: summary?.stage19?.completion || 0,
      artifacts: summary?.stage19?.artifact_count || 0
    },
    {
      label: 'Security & Perf',
      stage: 20,
      completion: summary?.stage20?.completion || 0,
      artifacts: summary?.stage20?.artifact_count || 0
    }
  ];

  return (
    <div className="grid grid-cols-2 gap-6">
      {metrics.map(metric => (
        <StageMetricCard key={metric.stage} metric={metric} />
      ))}
      <BuildLoopMetrics summary={summary} />
      <ReportGenerator ventureId={ventureId} phaseId={5} />
    </div>
  );
};

// Report Generation
const generatePhase5Report = async (ventureId: string) => {
  const data = await fetchPhase5Data(ventureId);

  const pdf = new jsPDF();

  // Title page
  pdf.setFontSize(20);
  pdf.text('Phase 5: THE BUILD LOOP - Completion Report', 20, 20);

  // Stage summaries
  data.stages.forEach((stage, index) => {
    pdf.addPage();
    pdf.setFontSize(16);
    pdf.text(\`Stage \${stage.id}: \${stage.name}\`, 20, 20);
    pdf.setFontSize(12);
    pdf.text(\`Completion: \${stage.completion}%\`, 20, 30);
    pdf.text(\`Artifacts: \${stage.artifact_count}\`, 20, 40);
    // ... add charts, tables
  });

  return pdf.save(\`Phase5_Report_\${ventureId}.pdf\`);
};
\`\`\`

**Integration Points**:
- src/hooks/usePhase5Summary.ts - Aggregate phase data
- src/lib/report-generator.ts - PDF generation
- src/components/ventures/StageMetricCard.tsx
- database/schema/venture_stage_work - All phase 5 data

**Testing Scenarios**:
- E2E: tests/e2e/phase5-build-loop/US-006-phase5-summary.spec.ts
- Unit: Metric aggregation, completion calculation
- Integration: PDF generation, artifact download`,
      e2e_test_path: 'tests/e2e/phase5-build-loop/US-006-phase5-summary.spec.ts',
      e2e_test_status: 'not_created',
      status: 'draft'
    }
  ];

  console.log(`\n📊 Inserting ${userStories.length} user stories...\n`);

  for (const story of userStories) {
    const { data: _data, error } = await supabase
      .from('user_stories')
      .upsert(story, { onConflict: 'story_key' })
      .select('story_key, title');

    if (error) {
      console.error(`   ❌ Failed to insert ${story.story_key}:`, error.message);
    } else {
      console.log(`   ✅ ${story.story_key}`);
      console.log(`      ${story.title}`);
      console.log(`      Priority: ${story.priority} | Points: ${story.story_points}`);
      console.log(`      AC: ${story.acceptance_criteria.length} | Tests: ${story.test_scenarios.length}`);
      console.log(`      E2E: ${story.e2e_test_path}`);
      console.log('');
    }
  }

  console.log('='.repeat(80));
  console.log('✅ USER STORIES CREATED FOR PHASE 5: THE BUILD LOOP');
  console.log('='.repeat(80));
  console.log('\n📊 Summary:');
  console.log('   - US-001: Stage 17 - Environment & Agent Config (8 pts, 5-6h)');
  console.log('   - US-002: Stage 18 - MVP Development Loop (13 pts, 8-10h)');
  console.log('   - US-003: Stage 19 - Integration & API Layer (10 pts, 6-7h)');
  console.log('   - US-004: Stage 20 - Security & Performance (13 pts, 8-10h)');
  console.log('   - US-005: Phase 5 Navigation & Workflow (5 pts, 3-4h)');
  console.log('   - US-006: Phase 5 Summary & Completion Report (8 pts, 5-6h)');
  console.log('');
  console.log(`   📈 Total Story Points: ${userStories.reduce((sum, s) => sum + s.story_points, 0)}`);
  console.log('   ⏱️  Total Estimated Effort: 35-43 hours');
  console.log('   🎯 Coverage: Stages 17-20 + Navigation + Summary');
  console.log('');
  console.log('📋 INVEST Criteria Compliance:');
  console.log('   ✅ Independent: Each story can be developed separately');
  console.log('   ✅ Negotiable: Details can be refined during EXEC');
  console.log('   ✅ Valuable: Clear user benefit for each story');
  console.log('   ✅ Estimable: Story points assigned to all stories');
  console.log('   ✅ Small: Largest story is 13 points (within sprint)');
  console.log('   ✅ Testable: E2E test paths mapped for all stories');
  console.log('');
  console.log('🧪 E2E Test Coverage:');
  console.log('   - tests/e2e/phase5-build-loop/US-001-stage17-config.spec.ts');
  console.log('   - tests/e2e/phase5-build-loop/US-002-stage18-mvp-loop.spec.ts');
  console.log('   - tests/e2e/phase5-build-loop/US-003-stage19-integration.spec.ts');
  console.log('   - tests/e2e/phase5-build-loop/US-004-stage20-security-perf.spec.ts');
  console.log('   - tests/e2e/phase5-build-loop/US-005-phase5-navigation.spec.ts');
  console.log('   - tests/e2e/phase5-build-loop/US-006-phase5-summary.spec.ts');
  console.log('');
  console.log('📋 Next Steps:');
  console.log('1. Review user stories for completeness');
  console.log('2. Create PLAN→EXEC handoff for SD-VISION-TRANSITION-001D5');
  console.log('3. Begin EXEC phase implementation');
  console.log('4. Create E2E tests following US-XXX naming convention');
  console.log('5. Run auto-validation on EXEC completion\n');
}

createUserStories();
