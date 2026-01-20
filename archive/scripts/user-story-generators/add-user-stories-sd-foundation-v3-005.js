#!/usr/bin/env node
/**
 * Add User Stories for SD-FOUNDATION-V3-005
 * EVA Directive Execution Engine
 *
 * Creates user stories for building Chairman directive execution system.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'SD-FOUNDATION-V3-005';
const PRD_ID = 'PRD-SD-FOUNDATION-V3-005';

const userStories = [
  {
    story_key: `${SD_ID}:US-001`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Create Command Parser Service to extract intent from natural language directives',
    user_role: 'System',
    user_want: 'Parse Chairman directive text (e.g., "analyze venture X budget") into structured intent objects with action, target, and parameters',
    user_benefit: 'EVA can understand and process natural language commands without hardcoded parsing logic',
    priority: 'critical',
    story_points: 8,
    status: 'draft',
    acceptance_criteria: [
      'GIVEN Chairman enters "analyze venture TechCorp financials" WHEN DirectiveParser.parse() is called THEN returns structured intent with action=analyze, target=venture, entity=TechCorp, subject=financials',
      'GIVEN complex directive "create budget report for Q4 2024 for all technology ventures" WHEN parsed THEN extracts parameters: quarter=Q4, year=2024, filter.category=technology',
      'GIVEN multi-step directive "analyze venture X budget and generate recommendation" WHEN parsed THEN detects multiple steps with hasMultipleSteps=true',
      'GIVEN ambiguous directive "check the status" WHEN parsed THEN returns confidence < 0.7 AND clarificationNeeded=true with suggested clarifications',
      'GIVEN unsupported directive "deploy to production" WHEN parsed THEN returns supported=false with reason and suggested alternatives',
      'GIVEN directive with venture name WHEN parsed WITH database lookup THEN resolves entity with type=venture, id=uuid, name=resolved'
    ],
    definition_of_done: [
      'File created: src/services/directiveParser.ts',
      'DirectiveParser class with parse() method implemented',
      'Intent extraction for actions: analyze, create, generate, update, check',
      'Target identification: venture, agent, budget, report, portfolio',
      'Parameter extraction from natural language',
      'Entity resolution with database lookups (Supabase)',
      'Confidence scoring for parsed intents (0.0-1.0)',
      'Ambiguity detection with clarification suggestions',
      'TypeScript interfaces: DirectiveIntent, ParseResult, EntityReference',
      'Unit tests for 10+ directive patterns',
      'Integration test with real Supabase entity lookups'
    ],
    
    
    technical_notes: 'Use NLP libraries (compromise, natural, or OpenAI API) for parsing. Pattern matching for common directive structures. Database lookups for entity resolution using Supabase. Confidence scoring based on match quality. Consider caching common patterns for performance.',
    implementation_approach: 'Create DirectiveParser class with async parse() method. Implement pattern-based parsing using regex + NLP library. Add entity resolution using Supabase queries to ventures, agents tables. Return structured DirectiveIntent objects with confidence scores. Include clarification logic for low-confidence parses.',
    implementation_context: 'Core foundation of directive execution engine. Must be accurate (>80% confidence for common directives) and fast (<500ms). Should handle most Chairman directives without clarification. Extensible for future directive types.',
    architecture_references: [
      'src/services/evaOrchestrator.ts - Will integrate parser',
      'database/schema/ventures - Entity resolution source',
      'database/schema/agents - Agent entity lookups'
    ],
    testing_scenarios: [
      { scenario: 'Parse simple directive with action + target + entity', type: 'unit', priority: 'P0' },
      { scenario: 'Extract parameters from complex directive', type: 'unit', priority: 'P0' },
      { scenario: 'Detect ambiguous directives and suggest clarifications', type: 'unit', priority: 'P1' },
      { scenario: 'Resolve entities from database', type: 'integration', priority: 'P0' },
      { scenario: 'Parse multi-step directives', type: 'unit', priority: 'P2' },
      { scenario: 'Performance test: parse 100 directives in <500ms avg', type: 'performance', priority: 'P1' }
    ],
    e2e_test_path: 'tests/integration/services/US-001-directive-parser.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },

  {
    story_key: `${SD_ID}:US-002`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Extend Command Parser with directive validation and pre-execution checks',
    user_role: 'System',
    user_want: 'Validate parsed directives against business rules, permissions, and prerequisites before execution',
    user_benefit: 'Prevents invalid directives from executing, ensuring Chairman only receives actionable results',
    priority: 'high',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      'GIVEN Chairman owns venture "TechCorp" WHEN directive "analyze TechCorp budget" validated THEN permissionCheck=true AND proceedWithExecution=true',
      'GIVEN Chairman does NOT own venture "OtherCorp" WHEN directive validated THEN permissionCheck=false AND error="Access denied" AND proceedWithExecution=false',
      'GIVEN venture has no budget data WHEN directive validated THEN prerequisitesMet=false AND warning="No budget data" AND suggestedAction="Create budget first"',
      'GIVEN invalid parameter "Q5 2024" WHEN directive validated THEN businessRulesValid=false AND error="Invalid quarter: Q5"',
      'GIVEN 5 directives currently executing WHEN new directive validated THEN concurrencyLimit=true AND error="Maximum concurrent directives reached"'
    ],
    definition_of_done: [
      'DirectiveParser.validate() method implemented',
      'Permission checks against venture ownership using RLS',
      'Prerequisite validation for data availability',
      'Business rule validation (parameter ranges, valid values)',
      'Concurrency limit enforcement (max 5 concurrent)',
      'ValidationResult interface with detailed checks breakdown',
      'Unit tests for 5+ validation scenarios',
      'Integration test with real Supabase RLS checks'
    ],
    
    
    technical_notes: 'Use RLS policies for permission checks. Query database for prerequisite data existence. Define business rules in config object. Track concurrent directives in chairman_directives table. Return detailed ValidationResult with actionable error messages.',
    implementation_approach: 'Add validate(intent, chairmanId) method to DirectiveParser. Check permissions using Supabase RLS (ventures.chairman_id). Validate prerequisites by querying data existence. Enforce business rules from config. Query running directives count. Return ValidationResult with detailed breakdown.',
    implementation_context: 'Validation prevents wasted execution and poor UX. Must be fast (<200ms). Should provide actionable error messages and suggested fixes. Critical for security (RLS enforcement). Prevents Chairman frustration from failed executions.',
    architecture_references: [
      'src/services/directiveParser.ts - Add validation method',
      'database/schema/ventures - RLS policies for ownership',
      'database/schema/venture_budgets - Prerequisite data checks'
    ],
    testing_scenarios: [
      { scenario: 'Permission check passes for owned venture', type: 'integration', priority: 'P0' },
      { scenario: 'Permission check fails for unowned venture', type: 'integration', priority: 'P0' },
      { scenario: 'Prerequisite validation detects missing data', type: 'integration', priority: 'P1' },
      { scenario: 'Business rule validation catches invalid parameters', type: 'unit', priority: 'P0' },
      { scenario: 'Concurrency limit enforced', type: 'integration', priority: 'P1' }
    ],
    e2e_test_path: 'tests/integration/services/US-002-directive-validation.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },

  {
    story_key: `${SD_ID}:US-003`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Create Directive Router to map intents to execution handlers',
    user_role: 'System',
    user_want: 'Route parsed and validated directives to appropriate execution handlers based on action and target type',
    user_benefit: 'Enables extensible directive execution with dedicated handlers for each directive type',
    priority: 'critical',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      'GIVEN intent { action="analyze", target="venture" } WHEN route() called THEN returns AnalyzeVentureHandler with correct config',
      'GIVEN intent { action="create", target="report" } WHEN route() called THEN returns CreateReportHandler with reportType config',
      'GIVEN intent { action="check", target="venture" } WHEN route() called THEN returns CheckVentureStatusHandler',
      'GIVEN unsupported action="deploy" WHEN route() called THEN throws error "No handler found" OR returns UnsupportedDirectiveHandler',
      'GIVEN multiple handlers for same action-target WHEN route() called THEN selects highest priority handler'
    ],
    definition_of_done: [
      'File created: src/services/directiveRouter.ts',
      'DirectiveRouter class with route() method',
      'Handler registry Map for action-target combinations',
      'Handler interfaces: DirectiveHandler, HandlerConfig, ExecutionResult',
      'Routing logic with priority support',
      'Error handling for unsupported directives',
      'registerHandler() method for extensibility',
      'Unit tests for 5+ routing scenarios',
      'Handler registration system with priority'
    ],
    
    
    technical_notes: 'Use Map<string, HandlerRegistration[]> for handler registry. Key = "action:target" pattern. Support handler priority for overlapping registrations. Return handler instance + config object. Consider async handler initialization for future extensibility.',
    implementation_approach: 'Create DirectiveRouter class. Implement handler registry using Map with "action:target" keys. Add registerHandler(action, target, handler, priority) method. Implement route(intent) method with lookup logic. Return { handler, config } object. Add error handling for missing handlers.',
    implementation_context: 'Router decouples parsing from execution. Enables adding new handlers without modifying parser. Critical for extensibility and maintainability. Foundation for plugin-based directive execution in future.',
    architecture_references: [
      'src/services/directiveParser.ts - Provides intent input',
      'src/services/handlers/ - Directory for handler implementations',
      'src/services/executionDispatcher.ts - Will consume router output'
    ],
    testing_scenarios: [
      { scenario: 'Route analyze-venture to AnalyzeVentureHandler', type: 'unit', priority: 'P0' },
      { scenario: 'Route create-report to CreateReportHandler', type: 'unit', priority: 'P0' },
      { scenario: 'Throw error for unsupported action-target', type: 'unit', priority: 'P1' },
      { scenario: 'Select highest priority handler when multiple registered', type: 'unit', priority: 'P1' },
      { scenario: 'Build correct HandlerConfig from intent', type: 'unit', priority: 'P0' }
    ],
    e2e_test_path: 'tests/integration/services/US-003-directive-router.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },

  {
    story_key: `${SD_ID}:US-004`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Create Execution Dispatcher to create and dispatch task contracts',
    user_role: 'System',
    user_want: 'Convert directive execution into task contracts and dispatch to target agents with tracking',
    user_benefit: 'Enables asynchronous directive execution with agent task contracts and progress monitoring',
    priority: 'critical',
    story_points: 8,
    status: 'draft',
    acceptance_criteria: [
      'GIVEN directive "analyze TechCorp budget" routed WHEN dispatch() called THEN task contract created with taskId, directiveId, status=pending, persisted to DB',
      'GIVEN directive requires PLAN and EXEC agents WHEN dispatch() called THEN creates 2 task contracts with dependencies AND EXEC depends on PLAN',
      'GIVEN directive urgency="high" WHEN task created THEN includes deadline=now+1hour AND priority=high AND agent notified',
      'GIVEN agent queue unavailable WHEN dispatch() attempted THEN logs error AND status=dispatch_failed AND retries after 5s with exponential backoff',
      'GIVEN directive with 3 tasks WHEN getExecutionState() called THEN returns { totalTasks:3, completed:X, running:Y, failed:Z, progress:% }'
    ],
    definition_of_done: [
      'File created: src/services/executionDispatcher.ts',
      'ExecutionDispatcher class with dispatch() method',
      'Task contract creation and persistence to chairman_directive_tasks table',
      'Agent task dispatching via event bus or direct messaging',
      'Multi-agent task orchestration with dependencies',
      'Dispatch retry logic with exponential backoff',
      'Execution state tracking (getExecutionState method)',
      'Database schema: chairman_directive_tasks table',
      'Unit tests for task creation and dispatch',
      'Integration test with real agent messaging'
    ],
    
    
    technical_notes: 'Use chairman_directive_tasks table for contract persistence. Agent messaging via event bus (if available) or direct API calls. Implement retry logic with exponential backoff (5s, 10s, 20s). Track task dependencies for multi-agent workflows. Ensure idempotency for retries.',
    implementation_approach: 'Create ExecutionDispatcher class. Implement createTaskContract() to generate and persist contracts. Implement dispatchToAgent() for messaging with retry logic. Add getExecutionState() for progress tracking. Support task dependencies for sequential execution. Use event bus or fallback to direct agent calls.',
    implementation_context: 'Dispatcher is core of async execution. Must be reliable (retries) and observable (tracking). Critical for Chairman UX (no hanging directives). Foundation for multi-agent orchestration. Handles failures gracefully to prevent lost work.',
    architecture_references: [
      'src/services/directiveRouter.ts - Provides handler to execute',
      'database/schema/chairman_directives - Parent directive tracking',
      'database/schema/chairman_directive_tasks - Task contract storage (NEW)',
      'src/lib/eventBus.ts - Agent messaging (if available)',
      'database/schema/agent_registry - Agent lookup for dispatching'
    ],
    testing_scenarios: [
      { scenario: 'Create and persist task contract', type: 'integration', priority: 'P0' },
      { scenario: 'Dispatch task to agent via event bus', type: 'integration', priority: 'P0' },
      { scenario: 'Retry dispatch on failure with exponential backoff', type: 'unit', priority: 'P1' },
      { scenario: 'Track execution state across multiple tasks', type: 'integration', priority: 'P0' },
      { scenario: 'Handle multi-agent task dependencies', type: 'integration', priority: 'P2' }
    ],
    e2e_test_path: 'tests/integration/services/US-004-execution-dispatcher.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },

  {
    story_key: `${SD_ID}:US-005`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Implement task dependency orchestration for multi-agent workflows',
    user_role: 'System',
    user_want: 'Execute multi-step directives with agent task dependencies (e.g., PLAN → EXEC sequence)',
    user_benefit: 'Enables complex workflows where agent tasks must execute in specific order',
    priority: 'high',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      'GIVEN directive requires PLAN→EXEC sequence WHEN tasks created THEN PLAN dispatched with status=dispatched AND EXEC created with status=waiting_dependency',
      'GIVEN PLAN completes successfully AND EXEC waiting WHEN completion detected THEN EXEC status=pending AND EXEC dispatched with PLAN result in context',
      'GIVEN PLAN fails AND EXEC depends on PLAN WHEN failure detected THEN EXEC status=dependency_failed AND NOT dispatched AND directive status=failed',
      'GIVEN directive with parallel tasks (no dependencies) WHEN created THEN both dispatched immediately with status=pending',
      'GIVEN complex DAG: LEAD→(PLAN1||PLAN2)→EXEC WHEN created THEN LEAD first, PLAN parallel after LEAD, EXEC waits for both PLAN tasks'
    ],
    definition_of_done: [
      'ExecutionDispatcher.createDependentTasks() method implemented',
      'Dependency graph creation from directive workflow',
      'Task status: waiting_dependency, dependency_failed',
      'Dependency resolution trigger on task completion',
      'Pass predecessor results to dependent tasks in context',
      'Support parallel task execution (no dependencies)',
      'Support DAG workflows (complex dependencies)',
      'Topological sort for execution order validation',
      'Unit tests for sequential, parallel, and DAG workflows',
      'Integration test with real task execution'
    ],
    
    
    technical_notes: 'Use topological sort for DAG execution order validation (detect cycles). Store dependency graph (dependsOn array) in task contracts. Listen to task completion events to trigger dependent tasks. Pass predecessor results as context to dependent tasks. Validate no circular dependencies before execution.',
    implementation_approach: 'Add createDependentTasks(workflow) to ExecutionDispatcher. Implement dependency graph creation with topological sort. Add onTaskCompletion listener to resolve dependencies. Update task status based on dependency state (waiting→pending→running→completed). Pass predecessor results to dependent tasks in config.predecessorResults.',
    implementation_context: 'Multi-agent orchestration is critical for complex directives. Must handle dependencies correctly to avoid orphaned tasks. Foundation for advanced Chairman workflows like "analyze X then create report". Enables LEO protocol LEAD→PLAN→EXEC pattern.',
    architecture_references: [
      'src/services/executionDispatcher.ts - Add dependency orchestration',
      'database/schema/chairman_directive_tasks - Store dependency graph (depends_on column)',
      'src/lib/eventBus.ts - Listen to task completion events'
    ],
    testing_scenarios: [
      { scenario: 'Sequential task execution (PLAN → EXEC)', type: 'integration', priority: 'P0' },
      { scenario: 'Parallel task execution (no dependencies)', type: 'integration', priority: 'P0' },
      { scenario: 'Dependency failure cascades to dependent tasks', type: 'integration', priority: 'P1' },
      { scenario: 'Complex DAG workflow execution', type: 'integration', priority: 'P1' },
      { scenario: 'Circular dependency detection throws error', type: 'unit', priority: 'P1' }
    ],
    e2e_test_path: 'tests/integration/services/US-005-task-dependencies.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },

  {
    story_key: `${SD_ID}:US-006`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Create Status Polling API endpoint for real-time directive execution tracking',
    user_role: 'Frontend Developer',
    user_want: 'API endpoint to fetch real-time status of directive execution and agent task progress',
    user_benefit: 'Chairman can see live updates on directive execution without page refresh',
    priority: 'critical',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      'GIVEN directive "dir-123" executing with 3 tasks (1 completed, 2 running) WHEN GET /api/v2/directives/dir-123/status THEN returns 200 with { directiveId, status=running, progress=33, tasks, estimatedCompletion }',
      'GIVEN directive with tasks from multiple agents WHEN status called THEN response includes task array with taskId, agentType, handlerName, status, progress for each',
      'GIVEN completed directive WHEN status called THEN returns { status=completed, progress=100, completedAt, result }',
      'GIVEN failed directive WHEN status called THEN returns { status=failed, failedAt, error, failedTask }',
      'GIVEN request from Chairman A for directive owned by Chairman B WHEN status called THEN returns 403 Forbidden with error="Access denied"',
      'GIVEN status unchanged since last poll WHEN status called with If-None-Match THEN returns 304 Not Modified with ETag'
    ],
    definition_of_done: [
      'File created: pages/api/v2/directives/[directiveId]/status.ts',
      'GET endpoint handler implemented',
      'Authentication middleware integrated (JWT validation)',
      'Authorization check (chairman owns directive)',
      'Query directive and task status from database',
      'Calculate progress percentage (completed/total)',
      'Estimate completion time based on task velocity',
      'ETag support for polling optimization (304 responses)',
      'Error handling for non-existent directives (404)',
      'Unit tests for API endpoint',
      'E2E test for status polling flow'
    ],
    
    
    technical_notes: 'Use Supabase query to fetch directive + tasks in single query. Calculate progress from task statuses. Use ETag (MD5 hash of status+progress+completedAt) for 304 responses. Response time critical (<100ms). Consider caching for frequently polled directives (Redis).',
    implementation_approach: 'Create Next.js API route at pages/api/v2/directives/[directiveId]/status.ts. Authenticate chairman using JWT. Verify ownership (directive.chairman_id === user.id). Query directive and tasks. Calculate progress and estimated completion. Build response object. Add ETag header (MD5 hash). Return JSON with 200/304/403/404.',
    implementation_context: 'Status polling is critical for Chairman UX. Must be fast and efficient. ETag optimization reduces bandwidth for unchanged status (typical in polling). Foundation for real-time UI updates. Enables progress bars and task breakdowns in Chairman dashboard.',
    architecture_references: [
      'pages/api/v2/chairman/insights.ts - Reference API pattern',
      'database/schema/chairman_directives - Directive table',
      'database/schema/chairman_directive_tasks - Task tracking',
      'src/services/executionDispatcher.ts - Execution state logic (reference)'
    ],
    testing_scenarios: [
      { scenario: 'Fetch directive status with task details', type: 'e2e', priority: 'P0' },
      { scenario: 'Authorization check prevents unauthorized access', type: 'e2e', priority: 'P0' },
      { scenario: 'ETag optimization returns 304 for unchanged status', type: 'e2e', priority: 'P1' },
      { scenario: 'Progress calculation accurate across task states', type: 'unit', priority: 'P0' },
      { scenario: 'Estimated completion time calculated correctly', type: 'unit', priority: 'P1' }
    ],
    e2e_test_path: 'tests/e2e/api/directives/US-006-status-polling.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },

  {
    story_key: `${SD_ID}:US-007`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Create Result Aggregator to collect and summarize execution outcomes',
    user_role: 'System',
    user_want: 'Aggregate results from all agent tasks and generate executive summary for Chairman',
    user_benefit: 'Chairman receives concise, actionable summary instead of raw agent output',
    priority: 'high',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      'GIVEN directive with 1 task result { budgetUtilization:85%, status:"at_risk" } WHEN aggregate() called THEN returns summary with executiveSummary, keyFindings, recommendations',
      'GIVEN directive with 3 tasks (budget, risk, performance) WHEN aggregate() called THEN synthesizes unified summary with 2-3 sentence executiveSummary, 3-5 keyFindings, 2-3 recommendations',
      'GIVEN directive with 2 successful + 1 failed task WHEN aggregate() called THEN returns status=partial_success with successfulTasks=2, failedTasks=1, partialResults',
      'GIVEN tasks with varying importance WHEN summary generated THEN key findings prioritized by severity (critical>high>medium>low>info)',
      'GIVEN task results contain implicit recommendations WHEN aggregate() called THEN extracts actionable recommendations formatted as action items with priority and impact'
    ],
    definition_of_done: [
      'File created: src/services/resultAggregator.ts',
      'ResultAggregator class with aggregate() method',
      'Multi-task result synthesis algorithm',
      'Executive summary generation (2-3 sentences)',
      'Key findings extraction and prioritization by severity',
      'Actionable recommendations generation',
      'Partial failure handling (mixed success/failure)',
      'TypeScript interfaces: AggregatedResult, Finding, Recommendation',
      'Unit tests for single, multi, and partial results',
      'Integration test with real task results'
    ],
    
    
    technical_notes: 'Use template-based or NLP summary generation. Prioritize findings by severity enum (critical>high>medium>low>info). Extract recommendations from task.result.recommendations arrays. Handle partial failures gracefully (status=partial_success). Consider using AI (OpenAI) for intelligent summarization in future.',
    implementation_approach: 'Create ResultAggregator class. Implement aggregate(directiveId, tasks) to collect task results. Synthesize multi-task results by category. Generate 2-3 sentence executive summary. Extract top 5 key findings sorted by severity. Generate top 3 recommendations sorted by priority. Return structured AggregatedResult object.',
    implementation_context: 'Result aggregation is critical for Chairman UX. Raw agent output is too verbose and technical. Executive summary must be actionable and concise. Foundation for intelligent reporting. Enables Chairman to quickly understand outcomes without reading detailed logs.',
    architecture_references: [
      'database/schema/chairman_directive_tasks - Task results source (result column)',
      'src/services/executionDispatcher.ts - Provides task completion events',
      'database/schema/chairman_directives - Store aggregated result (result column)'
    ],
    testing_scenarios: [
      { scenario: 'Aggregate single task result', type: 'unit', priority: 'P0' },
      { scenario: 'Synthesize multi-task results', type: 'unit', priority: 'P0' },
      { scenario: 'Handle partial failure with mixed results', type: 'unit', priority: 'P1' },
      { scenario: 'Extract and prioritize findings by severity', type: 'unit', priority: 'P0' },
      { scenario: 'Generate actionable recommendations', type: 'unit', priority: 'P1' }
    ],
    e2e_test_path: 'tests/integration/services/US-007-result-aggregator.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },

  {
    story_key: `${SD_ID}:US-008`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Integrate Result Aggregator with directive completion workflow',
    user_role: 'Chairman',
    user_want: 'See aggregated summary automatically when directive execution completes',
    user_benefit: 'I receive clear, actionable insights without manually reviewing individual task outputs',
    priority: 'high',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      'GIVEN directive completes with all tasks done WHEN last task completion detected THEN ResultAggregator.aggregate() called automatically AND result stored in chairman_directives.result AND status=completed',
      'GIVEN directive completed with aggregated result WHEN Chairman views directive THEN UI displays executiveSummary, top 5 keyFindings, top 3 recommendations with "View Detailed Results" link',
      'GIVEN ResultAggregator fails WHEN aggregation attempted THEN error logged AND directive marked completed_with_errors AND Chairman sees individual task results AND retry button shown',
      'GIVEN Chairman clicks re-aggregate WHEN button clicked THEN ResultAggregator re-runs AND updates stored result AND UI refreshes with new summary'
    ],
    definition_of_done: [
      'ExecutionDispatcher calls ResultAggregator on directive completion',
      'Aggregated result stored in chairman_directives.result column (JSONB)',
      'UI component: DirectiveResultView for displaying aggregated results',
      'Error handling for aggregation failures (status=completed_with_errors)',
      'Re-aggregation endpoint: POST /api/v2/directives/[id]/re-aggregate',
      'Chairman notification on completion (event bus or email)',
      'E2E test for complete directive workflow (parse→route→dispatch→complete→aggregate)',
      'UI test for result display component'
    ],
    
    
    technical_notes: 'Listen to directive completion events via onTaskCompletion. Call ResultAggregator.aggregate(). Store result in chairman_directives.result (JSONB column). Update directive status. Trigger Chairman notification via event bus. UI should gracefully handle missing aggregation (show raw tasks).',
    implementation_approach: 'Add completion listener to ExecutionDispatcher.onTaskCompletion(). Check if all directive tasks complete. Call ResultAggregator.aggregate(). Store result in database. Update status to completed. Create DirectiveResultView.tsx component for UI. Add re-aggregation API endpoint. Send Chairman notification.',
    implementation_context: 'Integration completes the directive execution loop. Auto-aggregation ensures Chairman always gets summary without manual action. Critical for seamless UX. Foundation for directive notifications and dashboard insights. Enables Chairman to stay informed of outcomes.',
    architecture_references: [
      'src/services/executionDispatcher.ts - Add completion listener',
      'src/services/resultAggregator.ts - Aggregation service',
      'database/schema/chairman_directives - Store aggregated result (result column)',
      'src/components/directives/DirectiveResultView.tsx - UI component (NEW)'
    ],
    testing_scenarios: [
      { scenario: 'Auto-aggregate on directive completion', type: 'e2e', priority: 'P0' },
      { scenario: 'Display aggregated result in UI', type: 'e2e', priority: 'P0' },
      { scenario: 'Handle aggregation failure gracefully', type: 'integration', priority: 'P1' },
      { scenario: 'Chairman notification sent on completion', type: 'integration', priority: 'P1' },
      { scenario: 'Re-aggregation updates stored result', type: 'e2e', priority: 'P2' }
    ],
    e2e_test_path: 'tests/e2e/directives/US-008-result-integration.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  }
];

async function addUserStories() {
  console.log(`Adding ${userStories.length} user stories for ${SD_ID} to database...\n`);

  try {
    // Verify SD exists
    const { data: sdData, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('id, legacy_id, title')
      .or(`id.eq.${SD_ID},legacy_id.eq.${SD_ID}`)
      .single();

    if (sdError || !sdData) {
      console.log(`ERROR: Strategic Directive ${SD_ID} not found in database`);
      console.log('Error:', sdError?.message);
      console.log('Create SD first before adding user stories');
      process.exit(1);
    }

    const sdUuid = sdData.id;

    console.log(`Found SD: ${sdData.title}`);
    console.log(`UUID: ${sdUuid}`);
    console.log(`Legacy ID: ${sdData.legacy_id || 'N/A'}\n`);

    let successCount = 0;
    let errorCount = 0;
    let skipCount = 0;

    for (const story of userStories) {
      try {
        // Check if story already exists
        const { data: existing } = await supabase
          .from('user_stories')
          .select('story_key')
          .eq('story_key', story.story_key)
          .single();

        if (existing) {
          console.log(`WARNING: ${story.story_key} already exists, skipping...`);
          skipCount++;
          continue;
        }

        // Use UUID for sd_id foreign key
        const storyWithUuid = {
          ...story,
          sd_id: sdUuid
        };

        const { data: _data, error } = await supabase
          .from('user_stories')
          .insert(storyWithUuid)
          .select()
          .single();

        if (error) {
          console.error(`ERROR adding ${story.story_key}:`, error.message);
          console.error(`Code: ${error.code}, Details: ${error.details}`);
          errorCount++;
        } else {
          console.log(`SUCCESS: Added ${story.story_key}: ${story.title}`);
          successCount++;
        }
      } catch (err) {
        console.error(`EXCEPTION adding ${story.story_key}:`, err.message);
        errorCount++;
      }
    }

    console.log('\n=== SUMMARY ===');
    console.log(`Success: ${successCount}/${userStories.length}`);
    console.log(`Skipped: ${skipCount}/${userStories.length}`);
    console.log(`Errors: ${errorCount}/${userStories.length}`);

    if (errorCount === 0 && successCount > 0) {
      console.log(`\nAll user stories added successfully for ${SD_ID}!`);
      console.log('\n=== NEXT STEPS ===');
      console.log(`1. Review stories: SELECT * FROM user_stories WHERE sd_id = '${sdUuid}'`);
      console.log('2. Validate INVEST criteria');
      console.log(`3. Create PRD (if not exists): npm run prd:create ${SD_ID}`);
      console.log('4. Begin EXEC implementation');
      console.log('\n=== IMPLEMENTATION ORDER ===');
      console.log('Phase 1 (Foundation): US-001 → US-002 → US-003');
      console.log('Phase 2 (Execution): US-004 → US-005');
      console.log('Phase 3 (Observability): US-006 → US-007 → US-008');
    }
  } catch (err) {
    console.error('FATAL ERROR:', err);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  addUserStories()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('FATAL ERROR:', err);
      process.exit(1);
    });
}

export { userStories, addUserStories };
