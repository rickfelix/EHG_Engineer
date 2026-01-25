#!/usr/bin/env node

/**
 * User Stories Generator for SD-VISION-V2-007
 * Vision V2: Integration Verification & Release Readiness
 *
 * Generates user stories from PRD functional requirements following:
 * - INVEST criteria (Independent, Negotiable, Valuable, Estimable, Small, Testable)
 * - Given-When-Then acceptance criteria format
 * - Rich implementation context (architecture refs, code patterns, test scenarios)
 * - Automatic E2E test path generation based on SD type
 *
 * Version: 2.0.0 (Lessons Learned Edition)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRD_KEY = 'PRD-SD-VISION-V2-007';
const SD_ID = 'SD-VISION-V2-007';

// ============================================================================
// User Stories Data (mapped from PRD functional requirements)
// Schema: story_key, prd_id, sd_id, title, user_role, user_want, user_benefit,
//         priority, story_points, status, acceptance_criteria, definition_of_done,
//         technical_notes, implementation_approach, implementation_context,
//         architecture_references, testing_scenarios, created_by
// ============================================================================

const userStories = [
  {
    story_key: 'SD-VISION-V2-007:US-001',
    prd_id: PRD_KEY,
    sd_id: SD_ID,
    title: 'Chairman Dashboard V2 Component E2E Tests',
    user_role: 'QA Engineer',
    user_want: 'Comprehensive E2E tests for all Chairman Dashboard V2 components (BriefingDashboard, DecisionStack, PortfolioSummary, QuickStatCard, TokenBudgetBar, StageTimeline, EVAGreeting)',
    user_benefit: 'Can verify that all Chairman Dashboard components render correctly, handle data properly, and provide expected user interactions before production deployment, reducing post-release defects by 80%',
    priority: 'critical',
    story_points: 8,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'Happy path - BriefingDashboard component test',
        given: 'Chairman Dashboard route /chairman exists AND test database has sample venture data',
        when: 'E2E test navigates to /chairman AND waits for BriefingDashboard to load',
        then: 'BriefingDashboard renders without errors AND all child components visible (EVAGreeting, QuickStatCards, DecisionStack) AND test passes with screenshot captured'
      },
      {
        id: 'AC-001-2',
        scenario: 'Happy path - QuickStatCard data validation',
        given: 'BriefingDashboard loaded AND QuickStatCards rendered',
        when: 'E2E test queries QuickStatCard elements',
        then: 'All 4 QuickStatCards display correct data (Active Ventures count, Token Budget percentage, Pending Decisions count, Risk Score) AND trend indicators show correct direction (up/down/neutral)'
      },
      {
        id: 'AC-001-3',
        scenario: 'Happy path - DecisionStack interaction test',
        given: 'Chairman has 3+ pending decisions in database',
        when: 'E2E test clicks on first DecisionCard in DecisionStack',
        then: 'Navigation to decision detail page occurs AND URL changes to /chairman/decisions/:id AND decision context loaded correctly'
      },
      {
        id: 'AC-001-4',
        scenario: 'Happy path - PortfolioSummary timeline rendering',
        given: 'Test database has ventures at stages 1, 5, 12, 17, 22',
        when: 'E2E test navigates to /chairman/portfolio AND StageTimeline renders',
        then: 'All 25 stages displayed in 6 phase groups AND venture dots positioned at correct stages AND health badge colors match health_score values (green>=75, amber 50-74, red<50)'
      },
      {
        id: 'AC-001-5',
        scenario: 'Edge case - Empty state handling',
        given: 'Test database has zero pending decisions AND zero ventures',
        when: 'E2E test loads BriefingDashboard',
        then: 'Empty state messages display correctly ("No pending decisions. All clear!", "No ventures yet.") AND no JavaScript errors thrown AND UI does not crash'
      },
      {
        id: 'AC-001-6',
        scenario: 'Responsive - Mobile viewport test',
        given: 'E2E test sets viewport to 375px width (iPhone SE)',
        when: 'BriefingDashboard renders at mobile size',
        then: 'QuickStatCards display in 2-column grid AND DecisionStack cards stack vertically AND no horizontal overflow AND touch targets are minimum 44x44px'
      },
      {
        id: 'AC-001-7',
        scenario: 'Performance - Component load time',
        given: 'E2E test measures component render performance',
        when: 'BriefingDashboard loads with 10 ventures and 5 decisions',
        then: 'Initial render completes in <2 seconds AND Time to Interactive (TTI) is <3 seconds AND Largest Contentful Paint (LCP) is <2.5 seconds'
      }
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/chairman-dashboard-v2.spec.ts',
      'Test covers all 7 components: BriefingDashboard, DecisionStack, PortfolioSummary, QuickStatCard, TokenBudgetBar, StageTimeline, EVAGreeting',
      'Happy path scenarios test component rendering and data display',
      'Edge case scenarios test empty states and error handling',
      'Responsive scenarios test mobile (375px), tablet (768px), desktop (1280px)',
      'Performance scenarios measure LCP, TTI, render time',
      'All tests pass locally and in CI/CD pipeline',
      'Test coverage report shows 100% component coverage for Chairman Dashboard V2'
    ],
    technical_notes: 'Use Playwright for E2E testing. Component selectors: data-testid="briefing-dashboard", data-testid="quick-stat-card-{index}", data-testid="decision-stack", data-testid="portfolio-summary". Performance metrics via Lighthouse API or Playwright Performance timing API.',
    implementation_approach: 'Phase 1: Create test file with Playwright setup. Phase 2: Write component rendering tests for each widget. Phase 3: Add data validation assertions. Phase 4: Implement interaction tests (click, navigation). Phase 5: Add responsive viewport tests. Phase 6: Add performance assertions.',
    implementation_context: 'FR-1: E2E tests for Chairman Dashboard V2 components. Validates SD-VISION-V2-006 deliverables are production-ready. Tests must cover all user journeys and edge cases.',
    architecture_references: [
      'tests/e2e/chairman-dashboard-v2.spec.ts',
      'src/components/chairman/BriefingDashboard.tsx',
      'src/components/chairman/DecisionStack.tsx',
      'src/components/chairman/PortfolioSummary.tsx',
      'src/components/chairman/QuickStatCard.tsx',
      'src/components/chairman/TokenBudgetBar.tsx',
      'src/components/chairman/StageTimeline.tsx',
      'src/components/chairman/EVAGreeting.tsx',
      'tests/fixtures/chairman-test-data.ts'
    ],
    testing_scenarios: [
      { scenario: 'BriefingDashboard renders all components', type: 'integration', priority: 'P0' },
      { scenario: 'QuickStatCards display correct data', type: 'integration', priority: 'P0' },
      { scenario: 'DecisionStack interaction navigates correctly', type: 'integration', priority: 'P0' },
      { scenario: 'PortfolioSummary timeline renders 25 stages', type: 'visual', priority: 'P0' },
      { scenario: 'Empty states handle zero data', type: 'edge-case', priority: 'P1' },
      { scenario: 'Mobile viewport responsive layout', type: 'responsive', priority: 'P1' },
      { scenario: 'Component load performance <3s', type: 'performance', priority: 'P2' }
    ],
    created_by: 'STORIES-AGENT'
  },

  {
    story_key: 'SD-VISION-V2-007:US-002',
    prd_id: PRD_KEY,
    sd_id: SD_ID,
    title: 'Full Flow Integration Test: Chairman → EVA → Venture CEO → VP → Crew → Briefing',
    user_role: 'Integration Test Engineer',
    user_want: 'A comprehensive E2E test that validates the complete agent orchestration flow from Chairman request through EVA coordination, Venture CEO delegation, VP/Crew execution, to final briefing delivery',
    user_benefit: 'Can verify that the entire Vision V2 agent orchestration system works end-to-end without manual intervention, ensuring all integration points are correct and reducing integration bugs by 90%',
    priority: 'critical',
    story_points: 13,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'Happy path - Chairman initiates request',
        given: 'Chairman is authenticated AND navigates to /chairman dashboard',
        when: 'Chairman creates a new strategic request "Analyze market opportunity for AI SaaS in healthcare" via EVA panel AND submits',
        then: 'Request recorded in agent_messages table with to_agent_id=EVA_COO_ID AND status=pending AND requires_response=true'
      },
      {
        id: 'AC-002-2',
        scenario: 'Happy path - EVA receives and routes request',
        given: 'Chairman request exists in agent_messages AND EVA orchestration layer is running',
        when: 'EVA processes the request AND determines target venture AND creates task for Venture CEO',
        then: 'New agent_message created with to_agent_id=VENTURE_CEO_ID AND task added to agent_tasks table AND venture_state transitions to "processing_request"'
      },
      {
        id: 'AC-002-3',
        scenario: 'Happy path - Venture CEO delegates to VP',
        given: 'Venture CEO receives task from EVA AND venture is at stage 5 (Market Research)',
        when: 'Venture CEO analyzes task AND delegates to VP Market Intelligence',
        then: 'New agent_message created with to_agent_id=VP_MARKET_INTEL_ID AND VP task added to agent_tasks AND delegation recorded in event_bus'
      },
      {
        id: 'AC-002-4',
        scenario: 'Happy path - VP assigns to Crew',
        given: 'VP Market Intelligence receives task',
        when: 'VP creates work assignments for Crew members (Market Analyst, Competitive Analyst)',
        then: 'Crew work_items created in crew_work table AND crew_members assigned AND work status=in_progress'
      },
      {
        id: 'AC-002-5',
        scenario: 'Happy path - Crew completes work and reports back',
        given: 'Crew members have work_items assigned',
        when: 'Crew completes market analysis AND submits findings to VP',
        then: 'work_items marked status=completed AND findings stored in work_item.result AND VP notified via agent_messages'
      },
      {
        id: 'AC-002-6',
        scenario: 'Happy path - VP consolidates and reports to CEO',
        given: 'All Crew work_items completed',
        when: 'VP consolidates crew findings AND creates executive summary AND sends to Venture CEO',
        then: 'Summary stored in agent_messages AND to_agent_id=VENTURE_CEO_ID AND summary includes all crew findings'
      },
      {
        id: 'AC-002-7',
        scenario: 'Happy path - CEO reports to EVA',
        given: 'VP summary received',
        when: 'Venture CEO reviews summary AND creates strategic recommendation AND sends to EVA',
        then: 'Recommendation stored in agent_messages AND to_agent_id=EVA_COO_ID AND includes CEO strategic perspective'
      },
      {
        id: 'AC-002-8',
        scenario: 'Happy path - EVA delivers briefing to Chairman',
        given: 'CEO recommendation received',
        when: 'EVA consolidates all intelligence AND creates executive briefing AND delivers to Chairman',
        then: 'Briefing appears in Chairman DecisionStack AND requires_response=true AND briefing includes full context chain (Crew→VP→CEO→EVA) AND Chairman sees notification on dashboard'
      },
      {
        id: 'AC-002-9',
        scenario: 'Edge case - Token budget exceeded during flow',
        given: 'Flow in progress AND venture approaches token soft cap (80%)',
        when: 'Token budget check runs during task execution',
        then: 'Circuit breaker triggers warning AND EVA notified AND flow continues but with rate limiting AND Chairman receives budget warning'
      },
      {
        id: 'AC-002-10',
        scenario: 'Performance - End-to-end flow completion time',
        given: 'Full flow test initiated',
        when: 'Flow completes from Chairman request to briefing delivery',
        then: 'Total elapsed time is <30 seconds AND all state transitions logged AND no performance bottlenecks identified'
      }
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/full-agent-orchestration-flow.spec.ts',
      'Test validates complete flow: Chairman → EVA → Venture CEO → VP → Crew → Briefing',
      'All agent_messages transitions verified in database',
      'All agent_tasks created and completed',
      'Event bus events logged for audit trail',
      'Token budget tracking verified throughout flow',
      'Circuit breaker integration tested',
      'Performance benchmarks established (<30s total)',
      'Test passes locally and in CI/CD pipeline',
      'Test data cleanup after execution'
    ],
    technical_notes: 'Full flow test requires mocking external LLM calls (use test fixtures). Database assertions verify state transitions. Event bus monitoring captures all events. Token budget calculations must match runtime logic. Use Playwright waitFor() with intelligent polling for async state transitions.',
    implementation_approach: 'Phase 1: Create test fixture data (ventures, agents, initial state). Phase 2: Implement Chairman request submission. Phase 3: Add EVA routing assertions. Phase 4: Verify CEO→VP→Crew delegation chain. Phase 5: Validate briefing delivery to Chairman. Phase 6: Add token budget and circuit breaker scenarios. Phase 7: Performance benchmarking.',
    implementation_context: 'FR-2: Full flow integration test. Most critical test in Vision V2 - validates entire orchestration system. Failure here indicates architectural issues. Success proves all integration points working correctly.',
    architecture_references: [
      'tests/e2e/full-agent-orchestration-flow.spec.ts',
      'tests/fixtures/agent-flow-test-data.ts',
      'src/lib/agents/eva-orchestration.ts',
      'src/lib/agents/venture-ceo-runtime.ts',
      'src/lib/agents/vp-runtime.ts',
      'src/lib/crew/crew-runtime.ts',
      'database/tables/agent_messages.sql',
      'database/tables/agent_tasks.sql',
      'database/tables/event_bus.sql'
    ],
    testing_scenarios: [
      { scenario: 'Chairman request creates agent_message', type: 'integration', priority: 'P0' },
      { scenario: 'EVA routes to correct Venture CEO', type: 'integration', priority: 'P0' },
      { scenario: 'CEO delegates to VP correctly', type: 'integration', priority: 'P0' },
      { scenario: 'VP assigns to Crew members', type: 'integration', priority: 'P0' },
      { scenario: 'Crew completes work and reports', type: 'integration', priority: 'P0' },
      { scenario: 'VP consolidates crew findings', type: 'integration', priority: 'P0' },
      { scenario: 'CEO reports to EVA', type: 'integration', priority: 'P0' },
      { scenario: 'EVA delivers briefing to Chairman', type: 'integration', priority: 'P0' },
      { scenario: 'Token budget exceeded triggers circuit breaker', type: 'edge-case', priority: 'P1' },
      { scenario: 'Full flow completes in <30s', type: 'performance', priority: 'P1' }
    ],
    created_by: 'STORIES-AGENT'
  },

  {
    story_key: 'SD-VISION-V2-007:US-003',
    prd_id: PRD_KEY,
    sd_id: SD_ID,
    title: 'Circuit Breaker Trigger Tests for Burn Rate Violations',
    user_role: 'Reliability Engineer',
    user_want: 'Automated tests that verify the circuit breaker activates correctly when burn rate violations occur (soft cap at 80%, hard cap at 100% of token budget)',
    user_benefit: 'Can ensure the system prevents runaway token consumption and protects budget constraints, avoiding unexpected costs and ensuring financial predictability',
    priority: 'critical',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'Happy path - Soft cap warning (80% threshold)',
        given: 'Venture has token_budget=10000 AND current token_consumed=8000 (80%)',
        when: 'Circuit breaker check runs during next task execution',
        then: 'Soft cap warning triggered AND EVA notified via agent_messages AND warning level="SOFT_CAP_WARNING" AND task execution continues with rate limiting AND Chairman receives budget alert notification'
      },
      {
        id: 'AC-003-2',
        scenario: 'Critical path - Hard cap block (100% threshold)',
        given: 'Venture has token_budget=10000 AND current token_consumed=10000 (100%)',
        when: 'Circuit breaker check runs before task execution',
        then: 'Hard cap violation detected AND task execution BLOCKED AND error="BUDGET_EXCEEDED" AND EVA notified with severity="CRITICAL" AND Chairman receives immediate escalation AND venture_state set to "budget_exceeded"'
      },
      {
        id: 'AC-003-3',
        scenario: 'Edge case - Budget increase resets circuit breaker',
        given: 'Venture in budget_exceeded state AND Chairman approves budget increase from 10000 to 15000',
        when: 'Budget updated in database AND circuit breaker check runs',
        then: 'Circuit breaker resets AND venture_state transitions from "budget_exceeded" to "active" AND blocked tasks can resume AND event_bus logs budget_reset event'
      },
      {
        id: 'AC-003-4',
        scenario: 'Performance - Circuit breaker check latency',
        given: 'Circuit breaker check runs before each task',
        when: 'Performance test executes 100 tasks with budget checking',
        then: 'Circuit breaker check adds <10ms latency per task AND total overhead <1 second for 100 tasks AND no database query bottlenecks'
      },
      {
        id: 'AC-003-5',
        scenario: 'Integration - Multi-venture budget tracking',
        given: 'Portfolio has 5 ventures with different budgets AND Venture A exceeds soft cap',
        when: 'Circuit breaker monitors all ventures',
        then: 'Only Venture A receives soft cap warning AND other ventures continue normally AND portfolio-wide budget aggregation correct AND Chairman sees per-venture budget status'
      },
      {
        id: 'AC-003-6',
        scenario: 'Edge case - Rapid token consumption spike',
        given: 'Venture at 50% budget utilization',
        when: 'Single large task consumes 45% budget (spike to 95%)',
        then: 'Circuit breaker detects spike AND triggers soft cap warning mid-task AND task allowed to complete AND subsequent tasks rate-limited AND spike event logged for analysis'
      }
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/circuit-breaker-burn-rate.spec.ts',
      'Test validates soft cap warning at 80% threshold',
      'Test validates hard cap block at 100% threshold',
      'Test verifies budget increase resets circuit breaker',
      'Test confirms circuit breaker adds <10ms latency',
      'Test validates multi-venture budget isolation',
      'Test handles rapid consumption spikes',
      'All tests pass locally and in CI/CD pipeline',
      'Event bus logs all circuit breaker events for audit'
    ],
    technical_notes: 'Circuit breaker logic in src/lib/circuit-breaker/token-budget-monitor.ts. Threshold config: SOFT_CAP=0.80, HARD_CAP=1.00. Budget calculation: (token_consumed / token_budget). Event types: SOFT_CAP_WARNING, HARD_CAP_VIOLATION, BUDGET_RESET. Rate limiting: exponential backoff on soft cap.',
    implementation_approach: 'Phase 1: Create test fixtures with ventures at various budget levels. Phase 2: Implement soft cap test with 80% threshold. Phase 3: Implement hard cap test with 100% threshold. Phase 4: Add budget reset scenario. Phase 5: Performance benchmarking for circuit breaker latency. Phase 6: Multi-venture isolation test.',
    implementation_context: 'FR-3: Circuit breaker trigger tests. Critical for financial governance. Prevents runaway costs. Integrates with EVA orchestration layer (SD-VISION-V2-003) token budget enforcement.',
    architecture_references: [
      'tests/e2e/circuit-breaker-burn-rate.spec.ts',
      'src/lib/circuit-breaker/token-budget-monitor.ts',
      'src/lib/circuit-breaker/budget-calculator.ts',
      'database/tables/ventures.sql (token_budget, token_consumed)',
      'database/tables/agent_registry.sql (token_consumed per agent)',
      'database/tables/event_bus.sql (circuit breaker events)',
      'src/components/chairman/TokenBudgetBar.tsx (UI visualization)'
    ],
    testing_scenarios: [
      { scenario: 'Soft cap warning at 80%', type: 'integration', priority: 'P0' },
      { scenario: 'Hard cap block at 100%', type: 'integration', priority: 'P0' },
      { scenario: 'Budget increase resets breaker', type: 'edge-case', priority: 'P1' },
      { scenario: 'Circuit breaker latency <10ms', type: 'performance', priority: 'P1' },
      { scenario: 'Multi-venture budget isolation', type: 'integration', priority: 'P1' },
      { scenario: 'Rapid consumption spike detection', type: 'edge-case', priority: 'P2' }
    ],
    created_by: 'STORIES-AGENT'
  },

  {
    story_key: 'SD-VISION-V2-007:US-004',
    prd_id: PRD_KEY,
    sd_id: SD_ID,
    title: 'RLS Security Verification: Unauthorized Access Blocking',
    user_role: 'Security Engineer',
    user_want: 'Comprehensive E2E tests that verify Row-Level Security (RLS) policies block unauthorized access to ventures, agent_messages, agent_tasks, and sensitive data',
    user_benefit: 'Can ensure that security policies are correctly enforced at the database level, preventing data leaks and ensuring compliance with security requirements, reducing security vulnerabilities by 95%',
    priority: 'critical',
    story_points: 8,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-004-1',
        scenario: 'Happy path - Authorized access allowed',
        given: 'User is authenticated as Chairman (user_id=CHAIRMAN_ID) AND ventures table has RLS policy venture_select_policy',
        when: 'Chairman queries SELECT * FROM ventures',
        then: 'Query returns all ventures in portfolio AND RLS policy allows access AND no permission errors'
      },
      {
        id: 'AC-004-2',
        scenario: 'Security - Unauthorized venture access blocked',
        given: 'User is authenticated as external_user (not Chairman, not Venture CEO) AND ventures table has RLS policy',
        when: 'External user attempts SELECT * FROM ventures',
        then: 'Query returns ZERO rows (RLS blocks all data) AND no error thrown (silent denial) AND access attempt logged in audit_log'
      },
      {
        id: 'AC-004-3',
        scenario: 'Security - Venture CEO can only access own venture',
        given: 'User is authenticated as Venture CEO for Venture A (venture_id=A) AND portfolio has Ventures A, B, C',
        when: 'Venture CEO queries SELECT * FROM ventures',
        then: 'Query returns ONLY Venture A AND Ventures B, C are filtered by RLS AND CEO cannot see other ventures'
      },
      {
        id: 'AC-004-4',
        scenario: 'Security - Agent messages privacy enforcement',
        given: 'agent_messages table has RLS policy messages_privacy_policy AND message with to_agent_id=VENTURE_CEO_A',
        when: 'User authenticated as VENTURE_CEO_B attempts SELECT * FROM agent_messages WHERE to_agent_id=VENTURE_CEO_A',
        then: 'Query returns ZERO rows AND CEO B cannot read messages intended for CEO A AND privacy violation prevented'
      },
      {
        id: 'AC-004-5',
        scenario: 'Security - Agent tasks isolation',
        given: 'agent_tasks table has RLS policy tasks_isolation_policy AND VP A has tasks in queue',
        when: 'VP B (different venture) attempts SELECT * FROM agent_tasks WHERE assigned_to=VP_A',
        then: 'Query returns ZERO rows AND VP B cannot see VP A tasks AND cross-venture task isolation enforced'
      },
      {
        id: 'AC-004-6',
        scenario: 'Edge case - Chairman override access',
        given: 'Chairman role has RLS bypass privileges',
        when: 'Chairman queries any table (ventures, agent_messages, agent_tasks, crew_work)',
        then: 'Chairman can access ALL data across all ventures AND RLS policy allows chairman_role to bypass restrictions AND full visibility for portfolio oversight'
      },
      {
        id: 'AC-004-7',
        scenario: 'Security - Anonymous user blocked completely',
        given: 'User is not authenticated (anonymous session) AND RLS policies require authentication',
        when: 'Anonymous user attempts SELECT * FROM ventures',
        then: 'Query returns ZERO rows OR throws permission error AND no data leaked AND anonymous access attempt logged AND potential security incident flagged'
      },
      {
        id: 'AC-004-8',
        scenario: 'Performance - RLS policy overhead',
        given: 'RLS policies enabled on ventures, agent_messages, agent_tasks',
        when: 'Performance test runs 1000 queries with RLS',
        then: 'RLS adds <5ms overhead per query AND total performance degradation <10% AND RLS policies do not cause significant bottlenecks'
      }
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/rls-security-verification.spec.ts',
      'Test validates authorized access allowed for Chairman',
      'Test validates unauthorized access blocked for external users',
      'Test validates Venture CEO can only access own venture',
      'Test validates agent_messages privacy enforcement',
      'Test validates agent_tasks isolation between ventures',
      'Test validates Chairman override access to all data',
      'Test validates anonymous users completely blocked',
      'Test measures RLS policy performance overhead (<5ms)',
      'All tests pass locally and in CI/CD pipeline',
      'Security audit log captures all access attempts'
    ],
    technical_notes: 'RLS policies in database/rls-policies/*.sql. Test uses multiple authenticated sessions (Chairman, CEO A, CEO B, VP A, VP B, anonymous). Supabase client auth switching via supabase.auth.signInWithPassword(). Performance measured via EXPLAIN ANALYZE. Audit log in security_audit_log table.',
    implementation_approach: 'Phase 1: Create test fixtures with multiple user roles and ventures. Phase 2: Implement authorized access tests (Chairman). Phase 3: Implement unauthorized access tests (external user, cross-venture). Phase 4: Add agent_messages and agent_tasks privacy tests. Phase 5: Test Chairman override privileges. Phase 6: Test anonymous user blocking. Phase 7: Performance benchmarking.',
    implementation_context: 'FR-4: RLS security verification. Critical for data privacy and compliance. Ensures multi-tenant isolation between ventures. Prevents data leaks. Required for SOC 2 compliance.',
    architecture_references: [
      'tests/e2e/rls-security-verification.spec.ts',
      'database/rls-policies/ventures-rls.sql',
      'database/rls-policies/agent-messages-rls.sql',
      'database/rls-policies/agent-tasks-rls.sql',
      'database/rls-policies/crew-work-rls.sql',
      'database/tables/security_audit_log.sql',
      'src/lib/auth/role-checker.ts',
      'docs/security/rls-policy-design.md'
    ],
    testing_scenarios: [
      { scenario: 'Authorized access allowed', type: 'security', priority: 'P0' },
      { scenario: 'Unauthorized access blocked', type: 'security', priority: 'P0' },
      { scenario: 'Venture CEO venture isolation', type: 'security', priority: 'P0' },
      { scenario: 'Agent messages privacy', type: 'security', priority: 'P0' },
      { scenario: 'Agent tasks isolation', type: 'security', priority: 'P0' },
      { scenario: 'Chairman override access', type: 'security', priority: 'P1' },
      { scenario: 'Anonymous user blocked', type: 'security', priority: 'P0' },
      { scenario: 'RLS performance overhead <5ms', type: 'performance', priority: 'P2' }
    ],
    created_by: 'STORIES-AGENT'
  },

  {
    story_key: 'SD-VISION-V2-007:US-005',
    prd_id: PRD_KEY,
    sd_id: SD_ID,
    title: 'Token Budget Enforcement Tests: Soft and Hard Cap Validation',
    user_role: 'Financial Governance Engineer',
    user_want: 'Automated tests that verify token budget enforcement at both soft cap (80% - warning) and hard cap (100% - block) thresholds across all agent types',
    user_benefit: 'Can ensure financial controls are enforced consistently, preventing budget overruns and providing early warnings for cost management, reducing unexpected token costs by 100%',
    priority: 'critical',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-005-1',
        scenario: 'Happy path - Budget under soft cap (normal operation)',
        given: 'Venture has token_budget=10000 AND token_consumed=5000 (50%) AND agent attempts task consuming 1000 tokens',
        when: 'Token budget check runs before task execution',
        then: 'Budget check passes (50% + 10% = 60% < 80%) AND task executes normally AND no warnings issued AND budget state=normal'
      },
      {
        id: 'AC-005-2',
        scenario: 'Warning - Soft cap threshold (80%)',
        given: 'Venture has token_budget=10000 AND token_consumed=7900 (79%) AND agent attempts task consuming 200 tokens',
        when: 'Token budget check runs AND projected consumption would reach 81%',
        then: 'Soft cap warning issued before task starts AND warning message="Approaching budget limit (81%)" AND EVA notified AND Chairman receives alert AND task STILL executes (warning only) AND budget state=soft_cap_warning'
      },
      {
        id: 'AC-005-3',
        scenario: 'Block - Hard cap threshold (100%)',
        given: 'Venture has token_budget=10000 AND token_consumed=9900 (99%) AND agent attempts task consuming 200 tokens',
        when: 'Token budget check runs AND projected consumption would reach 101%',
        then: 'Hard cap violation detected AND task execution BLOCKED AND error="BUDGET_HARD_CAP_EXCEEDED" AND EVA notified with severity=CRITICAL AND Chairman receives immediate escalation AND budget state=hard_cap_exceeded AND venture_state=suspended'
      },
      {
        id: 'AC-005-4',
        scenario: 'Integration - Multi-agent budget aggregation',
        given: 'Venture has EVA, CEO, 2 VPs, 4 Crew members AND each agent has token_consumed tracked in agent_registry',
        when: 'Budget check aggregates total_consumed = SUM(agent_registry.token_consumed WHERE venture_id=X)',
        then: 'Total consumption correctly aggregated across all agents AND budget percentage = total_consumed / venture.token_budget AND soft/hard cap checks use aggregated total AND no agent can exceed venture budget independently'
      },
      {
        id: 'AC-005-5',
        scenario: 'Edge case - Budget reallocated during execution',
        given: 'Venture at 85% budget (soft cap warning active) AND Chairman approves budget increase 10000 → 15000',
        when: 'Budget updated in database AND next budget check runs',
        then: 'Budget percentage recalculates (8500 / 15000 = 56.7%) AND soft cap warning clears AND budget state=normal AND suspended tasks can resume AND event logged: BUDGET_INCREASED'
      },
      {
        id: 'AC-005-6',
        scenario: 'Edge case - Concurrent task budget race condition',
        given: 'Venture at 95% budget AND two tasks submitted simultaneously, each consuming 6% (total 107%)',
        when: 'Both tasks check budget at same time (race condition)',
        then: 'Database-level token budget lock prevents race AND only ONE task allowed to proceed AND second task blocked at 101% AND no over-budget execution AND transaction isolation enforced'
      },
      {
        id: 'AC-005-7',
        scenario: 'Performance - Budget check latency',
        given: 'Performance test with 100 sequential tasks',
        when: 'Budget check runs before each task',
        then: 'Budget check adds <5ms overhead per task AND query uses index on (venture_id, token_consumed) AND total overhead <500ms for 100 tasks AND no query performance degradation'
      }
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/token-budget-enforcement.spec.ts',
      'Test validates normal operation under soft cap (<80%)',
      'Test validates soft cap warning at 80% threshold',
      'Test validates hard cap block at 100% threshold',
      'Test validates multi-agent budget aggregation',
      'Test validates budget reallocation clears warnings',
      'Test validates race condition prevention',
      'Test measures budget check performance (<5ms)',
      'All tests pass locally and in CI/CD pipeline',
      'Budget enforcement consistent across all agent types'
    ],
    technical_notes: 'Budget enforcement in src/lib/token-budget/budget-enforcer.ts. Thresholds: SOFT_CAP=0.80, HARD_CAP=1.00. Aggregation query: SELECT SUM(token_consumed) FROM agent_registry WHERE venture_id=X. Lock: SELECT ... FOR UPDATE to prevent race conditions. Event types: SOFT_CAP_WARNING, HARD_CAP_BLOCK, BUDGET_INCREASED.',
    implementation_approach: 'Phase 1: Create test fixtures with ventures at various budget levels. Phase 2: Implement normal operation test (<80%). Phase 3: Implement soft cap warning test (80%). Phase 4: Implement hard cap block test (100%). Phase 5: Multi-agent aggregation test. Phase 6: Budget reallocation test. Phase 7: Race condition prevention test. Phase 8: Performance benchmarking.',
    implementation_context: 'FR-5: Token budget enforcement tests. Critical for financial governance. Prevents cost overruns. Integrates with circuit breaker (US-003) and EVA orchestration. Shared responsibility: EVA monitors portfolio-wide, Venture CEO monitors per-venture.',
    architecture_references: [
      'tests/e2e/token-budget-enforcement.spec.ts',
      'src/lib/token-budget/budget-enforcer.ts',
      'src/lib/token-budget/budget-calculator.ts',
      'database/tables/ventures.sql (token_budget, token_consumed)',
      'database/tables/agent_registry.sql (token_consumed per agent)',
      'database/functions/calculate_venture_budget_percentage.sql',
      'src/components/chairman/TokenBudgetBar.tsx (UI visualization)',
      'docs/architecture/token-budget-governance.md'
    ],
    testing_scenarios: [
      { scenario: 'Normal operation <80% budget', type: 'integration', priority: 'P0' },
      { scenario: 'Soft cap warning at 80%', type: 'integration', priority: 'P0' },
      { scenario: 'Hard cap block at 100%', type: 'integration', priority: 'P0' },
      { scenario: 'Multi-agent budget aggregation', type: 'integration', priority: 'P1' },
      { scenario: 'Budget reallocation clears warnings', type: 'edge-case', priority: 'P1' },
      { scenario: 'Race condition prevention', type: 'edge-case', priority: 'P1' },
      { scenario: 'Budget check latency <5ms', type: 'performance', priority: 'P2' }
    ],
    created_by: 'STORIES-AGENT'
  },

  {
    story_key: 'SD-VISION-V2-007:US-006',
    prd_id: PRD_KEY,
    sd_id: SD_ID,
    title: 'Production Readiness Documentation: Ops Runbook, Deployment Checklist, Monitoring Guide',
    user_role: 'DevOps Engineer / SRE',
    user_want: 'Comprehensive production readiness documentation including operations runbook, deployment checklist, and monitoring guide',
    user_benefit: 'Can deploy Vision V2 to production confidently with clear operational procedures, reducing deployment risks and ensuring smooth operations, decreasing incident response time by 70%',
    priority: 'high',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-006-1',
        scenario: 'Documentation completeness - Operations runbook',
        given: 'Operations runbook document created at docs/ops/vision-v2-runbook.md',
        when: 'DevOps engineer reviews runbook for production deployment',
        then: 'Runbook contains: system architecture diagram, deployment steps, rollback procedures, incident response playbooks, escalation matrix, on-call procedures, troubleshooting guide (common issues + solutions), AND all procedures are testable and executable'
      },
      {
        id: 'AC-006-2',
        scenario: 'Documentation completeness - Deployment checklist',
        given: 'Deployment checklist created at docs/ops/vision-v2-deployment-checklist.md',
        when: 'DevOps engineer prepares for production release',
        then: 'Checklist contains: pre-deployment verification (database migrations, RLS policies, environment variables), deployment steps (zero-downtime deployment strategy, health check validation), post-deployment verification (E2E smoke tests, monitoring dashboard checks, performance baselines), rollback criteria and procedures, AND all items have clear pass/fail criteria'
      },
      {
        id: 'AC-006-3',
        scenario: 'Documentation completeness - Monitoring guide',
        given: 'Monitoring guide created at docs/ops/vision-v2-monitoring-guide.md',
        when: 'SRE configures monitoring for Vision V2 components',
        then: 'Guide contains: key metrics to monitor (token budget utilization, agent response times, circuit breaker triggers, RLS policy violations, error rates), alerting thresholds (soft cap 80%, hard cap 100%, response time >3s, error rate >1%), dashboard configurations (Chairman Dashboard uptime, agent orchestration flow health, database query performance), log aggregation setup (structured logging format, log retention policies), AND sample alerting rules for PagerDuty/Datadog/Grafana'
      },
      {
        id: 'AC-006-4',
        scenario: 'Documentation quality - Runbook procedures tested',
        given: 'Operations runbook contains 10 operational procedures',
        when: 'DevOps engineer executes each procedure in staging environment',
        then: 'All 10 procedures execute successfully AND produce expected results AND no steps are missing or ambiguous AND procedures include time estimates AND prerequisites clearly documented'
      },
      {
        id: 'AC-006-5',
        scenario: 'Documentation accessibility - Searchable and discoverable',
        given: 'All three documentation files published',
        when: 'New team member searches for "Vision V2 deployment" OR "production monitoring"',
        then: 'Documentation appears in search results AND linked from main docs/README.md AND included in onboarding materials AND version-controlled in git AND rendered correctly in documentation portal'
      },
      {
        id: 'AC-006-6',
        scenario: 'Documentation maintenance - Version tracking',
        given: 'Documentation includes version metadata',
        when: 'Vision V2 components updated (e.g., circuit breaker thresholds changed)',
        then: 'Documentation updated within same PR AND changelog documents what changed AND version number incremented AND outdated procedures marked deprecated'
      }
    ],
    definition_of_done: [
      'Operations runbook created: docs/ops/vision-v2-runbook.md',
      'Deployment checklist created: docs/ops/vision-v2-deployment-checklist.md',
      'Monitoring guide created: docs/ops/vision-v2-monitoring-guide.md',
      'All runbook procedures tested in staging environment',
      'All checklist items have clear pass/fail criteria',
      'Monitoring guide includes sample alerting rules',
      'Documentation linked from main docs/README.md',
      'Documentation reviewed by DevOps team and approved',
      'Documentation included in onboarding materials',
      'Version tracking and changelog included'
    ],
    technical_notes: 'Documentation format: Markdown with YAML frontmatter for metadata. Runbook sections: Architecture, Deployment, Rollback, Incident Response, Troubleshooting. Checklist format: checkbox list with verification commands. Monitoring guide: PromQL/Datadog query examples for metrics.',
    implementation_approach: 'Phase 1: Draft operations runbook outline based on Vision V2 architecture. Phase 2: Create deployment checklist from EXEC phase learnings. Phase 3: Document monitoring guide with key metrics and thresholds. Phase 4: Test all runbook procedures in staging. Phase 5: Review with DevOps team. Phase 6: Publish and link from main docs.',
    implementation_context: 'FR-6: Production readiness documentation. Required for safe production deployment. Ensures operational knowledge transfer. Reduces incident response time. Enables 24/7 support.',
    architecture_references: [
      'docs/ops/vision-v2-runbook.md',
      'docs/ops/vision-v2-deployment-checklist.md',
      'docs/ops/vision-v2-monitoring-guide.md',
      'docs/architecture/vision-v2-architecture.md',
      'docs/reference/circuit-breaker-design.md',
      'docs/reference/token-budget-governance.md',
      'database/migrations/vision-v2-*.sql',
      '.github/workflows/vision-v2-deploy.yml'
    ],
    testing_scenarios: [
      { scenario: 'Runbook procedures execute successfully', type: 'operational', priority: 'P0' },
      { scenario: 'Deployment checklist covers all critical steps', type: 'completeness', priority: 'P0' },
      { scenario: 'Monitoring guide provides actionable metrics', type: 'completeness', priority: 'P1' },
      { scenario: 'Documentation searchable and discoverable', type: 'usability', priority: 'P1' },
      { scenario: 'Version tracking maintained', type: 'maintenance', priority: 'P2' }
    ],
    created_by: 'STORIES-AGENT'
  }
];

// ============================================================================
// Main Function
// ============================================================================

async function createUserStories() {
  console.log('\n📋 Creating User Stories for SD-VISION-V2-007');
  console.log('='.repeat(70));

  // -------------------------------------------------------------------------
  // STEP 1: Verify PRD exists
  // -------------------------------------------------------------------------

  console.log('\n1️⃣  Verifying PRD exists...');

  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('id, title, sd_id')
    .eq('id', PRD_KEY)
    .single();

  if (prdError || !prd) {
    console.error(`❌ PRD ${PRD_KEY} not found in database`);
    console.error('   Please create the PRD first before generating user stories');
    if (prdError) console.error('   Error:', prdError.message);
    process.exit(1);
  }

  console.log(`✅ Found PRD: ${prd.title}`);
  console.log(`   SD ID: ${prd.sd_id}`);

  // -------------------------------------------------------------------------
  // STEP 2: Check for existing user stories
  // -------------------------------------------------------------------------

  console.log('\n2️⃣  Checking for existing user stories...');

  const { data: existing, error: existingError } = await supabase
    .from('user_stories')
    .select('story_key')
    .eq('prd_id', PRD_KEY);

  if (existingError) {
    console.error('❌ Error checking existing stories:', existingError.message);
    process.exit(1);
  }

  if (existing && existing.length > 0) {
    console.warn(`⚠️  Found ${existing.length} existing user stories for ${PRD_KEY}`);
    console.log('   Existing stories:', existing.map(s => s.story_key).join(', '));
    console.log('\n✅ Skipping story creation - stories already exist');
    process.exit(0);
  }

  // -------------------------------------------------------------------------
  // STEP 3: Insert user stories into database
  // -------------------------------------------------------------------------

  console.log('\n3️⃣  Inserting user stories into database...');

  const { data: insertedStories, error: insertError } = await supabase
    .from('user_stories')
    .insert(userStories)
    .select();

  if (insertError) {
    console.error('❌ Failed to insert user stories:', insertError.message);
    console.error('   Code:', insertError.code);
    console.error('   Details:', insertError.details);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // STEP 4: Success!
  // -------------------------------------------------------------------------

  console.log('\n✅ User stories created successfully!');
  console.log('='.repeat(70));
  console.log(`   Total Stories: ${insertedStories.length}`);
  console.log(`   PRD: ${PRD_KEY}`);
  console.log(`   SD: ${SD_ID}`);

  console.log('\n📊 Story Summary:');
  let totalPoints = 0;
  insertedStories.forEach((story, idx) => {
    console.log(`   ${idx + 1}. ${story.story_key}`);
    console.log(`      Title: ${story.title}`);
    console.log(`      Priority: ${story.priority} | Points: ${story.story_points}`);
    console.log(`      AC Count: ${story.acceptance_criteria?.length || 0}`);
    totalPoints += story.story_points || 0;
    console.log('');
  });

  console.log('='.repeat(70));
  console.log(`Total Story Points: ${totalPoints}`);

  console.log('\n📝 Next Steps:');
  console.log('   1. Review user stories in database');
  console.log('   2. Mark PRD plan_checklist item "User stories generated" as complete');
  console.log('   3. Proceed to EXEC phase implementation');
  console.log('');
}

// ============================================================================
// Execute
// ============================================================================

createUserStories().catch(error => {
  console.error('\n❌ Error creating user stories:', error.message);
  console.error(error.stack);
  process.exit(1);
});
