#!/usr/bin/env node

/**
 * User Stories Generator for SD-VISION-V2-006
 * Vision V2: Chairman Dashboard UI
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

const PRD_KEY = 'PRD-SD-VISION-V2-006';
const SD_ID = 'SD-VISION-V2-006';

// ============================================================================
// User Stories Data (mapped from PRD functional requirements)
// Schema: story_key, prd_id, sd_id, title, user_role, user_want, user_benefit,
//         priority, story_points, status, acceptance_criteria, definition_of_done,
//         technical_notes, implementation_approach, implementation_context,
//         architecture_references, testing_scenarios, created_by
// ============================================================================

const userStories = [
  {
    story_key: 'SD-VISION-V2-006:US-001',
    prd_id: PRD_KEY,
    sd_id: SD_ID,
    title: 'Chairman Dashboard Main View with EVAGreeting and QuickStatCards',
    user_role: 'Chairman (Grant)',
    user_want: 'A focused BriefingDashboard at /chairman with EVA greeting, portfolio stats, and decision summary',
    user_benefit: 'Can assess portfolio health in under 30 seconds without diving into details, reducing decision latency',
    priority: 'critical',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'Happy path - Dashboard initial load',
        given: 'User is authenticated as Chairman AND navigates to /chairman route',
        when: 'Page loads with all dashboard widgets',
        then: 'EVAGreeting displays personalized time-based message AND 4 QuickStatCards render (Active Ventures, Token Budget, Pending Decisions, Risk Score) AND responsive grid shows 2 cols mobile, 3 cols tablet, 4 cols desktop'
      },
      {
        id: 'AC-001-2',
        scenario: 'Loading state - Async data fetch',
        given: 'User navigates to /chairman AND data fetch is in progress',
        when: 'React Query is fetching ventures and agent_messages data',
        then: 'Loading skeleton states display for QuickStatCards AND no flash of empty content'
      },
      {
        id: 'AC-001-3',
        scenario: 'Error path - Data fetch failure',
        given: 'User is on /chairman AND Supabase query fails',
        when: 'Network error or database unavailable',
        then: 'Error boundary catches error AND displays fallback UI with retry button AND dashboard does not crash'
      },
      {
        id: 'AC-001-4',
        scenario: 'Responsive layout - Mobile viewport',
        given: 'User is on /chairman at 375px viewport (mobile)',
        when: 'Responsive grid recalculates layout',
        then: 'QuickStatCards stack in 2 columns AND touch targets are minimum 44x44px AND no horizontal overflow'
      }
    ],
    definition_of_done: [
      'BriefingDashboard renders at /chairman route with all widgets',
      'EVAGreeting component displays time-based personalized greeting',
      '4 QuickStatCards visible with correct data from Supabase',
      'Responsive grid works at mobile (375px), tablet (768px), desktop (1280px)',
      'Loading skeletons display during data fetch',
      'Error boundary prevents dashboard crashes',
      'E2E test passes for dashboard load'
    ],
    technical_notes: 'Component structure: BriefingDashboard > EVAGreeting + QuickStatGrid > 4x QuickStatCard. Data from React Query hooks: useVentures(), useAgentMessages(). Responsive: grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
    implementation_approach: 'Phase 1: Create ChairmanLayout wrapper. Phase 2: Build BriefingDashboard with grid. Phase 3: Implement QuickStatCard reusable component. Phase 4: Wire React Query hooks. Phase 5: Add loading states and error boundaries.',
    implementation_context: 'FR-1: Foundation dashboard view. Integrates with EVA orchestration layer (SD-VISION-V2-003) and Venture CEO runtime (SD-VISION-V2-005). Glass Cockpit design philosophy - show only what matters.',
    architecture_references: [
      'src/components/chairman/BriefingDashboard.tsx',
      'src/components/chairman/EVAGreeting.tsx',
      'src/components/chairman/QuickStatCard.tsx',
      'src/hooks/useVentures.ts',
      'src/hooks/useAgentMessages.ts',
      'src/app/chairman/page.tsx'
    ],
    testing_scenarios: [
      { scenario: 'Dashboard loads with all widgets', type: 'integration', priority: 'P0' },
      { scenario: 'Loading skeletons during data fetch', type: 'integration', priority: 'P1' },
      { scenario: 'Error boundary catches failures', type: 'integration', priority: 'P0' },
      { scenario: 'Responsive at 375px mobile', type: 'visual', priority: 'P1' }
    ],
    created_by: 'STORIES-AGENT'
  },

  {
    story_key: 'SD-VISION-V2-006:US-002',
    prd_id: PRD_KEY,
    sd_id: SD_ID,
    title: 'DecisionStack with Priority-Ordered Pending Decisions',
    user_role: 'Chairman (Grant)',
    user_want: 'A DecisionStack widget showing my top 5 pending decisions ordered by priority and deadline',
    user_benefit: 'Can quickly identify and act on the most urgent items, preventing important decisions from being buried',
    priority: 'critical',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'Happy path - Pending decisions displayed',
        given: 'Chairman has 5+ pending decisions in agent_messages table with requires_response=true',
        when: 'DecisionStack component renders',
        then: 'Top 5 decisions displayed in DecisionCard components AND ordered by: critical > high > deadline AND each card shows: venture name, decision type, urgency badge, deadline countdown'
      },
      {
        id: 'AC-002-2',
        scenario: 'Interaction - Click to drill down',
        given: 'User is viewing DecisionStack with pending decisions',
        when: 'User clicks on a DecisionCard',
        then: 'Navigation to /chairman/decisions/:id route with correct decision context'
      },
      {
        id: 'AC-002-3',
        scenario: 'Edge case - More than 5 decisions',
        given: 'Chairman has 12 pending decisions',
        when: 'DecisionStack renders top 5',
        then: 'Maximum 5 decisions visible AND "View All (7 more)" link shown at bottom AND link navigates to /chairman/decisions'
      },
      {
        id: 'AC-002-4',
        scenario: 'Empty state - No pending decisions',
        given: 'Chairman has zero pending decisions (requires_response=false for all)',
        when: 'DecisionStack renders',
        then: 'Empty state message: "No pending decisions. All clear!" AND optional illustration/icon'
      },
      {
        id: 'AC-002-5',
        scenario: 'Mobile interaction - Swipeable cards',
        given: 'User is on mobile viewport (<640px) with 3+ decisions',
        when: 'User swipes left/right on DecisionCard',
        then: 'Card slides to reveal next/previous decision AND snap points for smooth navigation'
      }
    ],
    definition_of_done: [
      'DecisionStack renders pending agent_messages (requires_response=true)',
      'Priority ordering: critical > high > medium > low, then by deadline',
      'DecisionCard shows venture name, type, urgency badge, deadline',
      'Click navigation to /chairman/decisions/:id works',
      'Empty state handles zero pending decisions',
      'Mobile swipe gestures implemented',
      'E2E test passes for decision interactions'
    ],
    technical_notes: 'Priority sort logic: ORDER BY priority DESC, deadline ASC. Mobile gestures via framer-motion or react-swipeable. Touch targets: 44x44px minimum.',
    implementation_approach: 'Phase 1: Build DecisionStack container. Phase 2: Create DecisionCard component. Phase 3: Implement UrgencyBadge and DeadlineCountdown. Phase 4: Wire React Query for agent_messages. Phase 5: Add mobile swipe gestures.',
    implementation_context: 'FR-2: Decision management widget. Queries agent_messages where to_agent_id=CHAIRMAN_ID, requires_response=true, status=pending. Integrates with EVA messaging system.',
    architecture_references: [
      'src/components/chairman/DecisionStack.tsx',
      'src/components/chairman/DecisionCard.tsx',
      'src/components/chairman/UrgencyBadge.tsx',
      'src/hooks/usePendingDecisions.ts',
      'src/lib/utils/prioritySort.ts'
    ],
    testing_scenarios: [
      { scenario: 'Top 5 decisions ordered by priority', type: 'integration', priority: 'P0' },
      { scenario: 'Click navigates to detail view', type: 'integration', priority: 'P0' },
      { scenario: 'Empty state when no decisions', type: 'integration', priority: 'P1' },
      { scenario: 'Mobile swipe gestures', type: 'interaction', priority: 'P2' }
    ],
    created_by: 'STORIES-AGENT'
  },

  {
    story_key: 'SD-VISION-V2-006:US-003',
    prd_id: PRD_KEY,
    sd_id: SD_ID,
    title: 'PortfolioSummary with 25-Stage Timeline Visualization',
    user_role: 'Chairman (Grant)',
    user_want: 'A PortfolioSummary at /chairman/portfolio showing all ventures positioned on a 25-stage timeline grouped by 6 lifecycle phases',
    user_benefit: 'Can quickly identify which ventures are progressing and which are stalled across the entire portfolio',
    priority: 'critical',
    story_points: 8,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'Happy path - Timeline renders all stages',
        given: 'User navigates to /chairman/portfolio AND database has 5+ ventures at various stages',
        when: 'StageTimeline component renders',
        then: '25 stages displayed in 6 phase groups (THE_TRUTH: 1-4, THE_ENGINE: 5-9, THE_IDENTITY: 10-12, THE_BLUEPRINT: 13-16, THE_BUILD_LOOP: 17-20, LAUNCH_LEARN: 21-25) AND each venture shown as colored dot at current stage AND phase labels match spec'
      },
      {
        id: 'AC-003-2',
        scenario: 'Health indicators - Color-coded badges',
        given: 'Ventures have health_score values: 90 (green), 65 (amber), 40 (red)',
        when: 'StageTimeline renders venture dots',
        then: 'Green dot for health_score >= 75 AND Amber dot for 50-74 AND Red dot for < 50 AND tooltip shows exact health_score on hover'
      },
      {
        id: 'AC-003-3',
        scenario: 'Interaction - Click venture dot for details',
        given: 'User hovers over a venture dot on timeline',
        when: 'User clicks the dot',
        then: 'Navigation to /ventures/:id detail page OR modal opens with venture summary'
      },
      {
        id: 'AC-003-4',
        scenario: 'Responsive - Mobile horizontal scroll',
        given: 'User is on mobile viewport (<640px)',
        when: 'StageTimeline renders 25 stages',
        then: 'Timeline scrolls horizontally with snap points at each phase AND phase labels remain visible during scroll AND touch swipe gestures work smoothly'
      },
      {
        id: 'AC-003-5',
        scenario: 'Edge case - No ventures in database',
        given: 'Database has zero ventures',
        when: 'PortfolioSummary loads',
        then: 'Empty state message: "No ventures yet. Create your first venture to get started." AND StageTimeline shows empty stages'
      }
    ],
    definition_of_done: [
      'StageTimeline renders 25 stages grouped into 6 phases',
      'Phase labels: THE_TRUTH (Problem), THE_ENGINE (Market), THE_IDENTITY (Identity), THE_BLUEPRINT (Blueprint), THE_BUILD_LOOP (Build), LAUNCH_LEARN (Launch)',
      'Ventures positioned as colored dots at current_lifecycle_stage',
      'Health badges: green (>=75), amber (50-74), red (<50)',
      'Mobile horizontal scroll with snap points',
      'Click dot navigates to venture details',
      'Empty state handles zero ventures',
      'E2E test passes for timeline visualization'
    ],
    technical_notes: 'Phase grouping: const PHASES = { THE_TRUTH: [1,2,3,4], THE_ENGINE: [5,6,7,8,9], ... }. Health color: if (score >= 75) return "green"; if (score >= 50) return "amber"; return "red";. Mobile scroll: overflow-x-auto + scroll-snap-type: x mandatory.',
    implementation_approach: 'Phase 1: Build PortfolioSummary page. Phase 2: Create StageTimeline with 25 stages. Phase 3: Implement PhaseGroup component. Phase 4: Build VentureDot with health badges. Phase 5: Add mobile horizontal scroll with snap. Phase 6: Wire React Query for venture_stage_work data.',
    implementation_context: 'FR-3: Portfolio-wide lifecycle visualization. 25-stage journey from Problem Discovery to Launch & Learn. Queries ventures table (current_lifecycle_stage) and venture_stage_work (health_score). Glass Cockpit principle: at-a-glance portfolio health.',
    architecture_references: [
      'src/components/chairman/PortfolioSummary.tsx',
      'src/components/chairman/StageTimeline.tsx',
      'src/components/chairman/PhaseGroup.tsx',
      'src/components/chairman/VentureDot.tsx',
      'src/hooks/useVentureStageData.ts',
      'src/lib/constants/lifecycleStages.ts'
    ],
    testing_scenarios: [
      { scenario: 'Timeline renders all 25 stages in 6 phases', type: 'integration', priority: 'P0' },
      { scenario: 'Ventures positioned correctly', type: 'integration', priority: 'P0' },
      { scenario: 'Health badges color-coded', type: 'visual', priority: 'P1' },
      { scenario: 'Mobile horizontal scroll with snap', type: 'interaction', priority: 'P1' }
    ],
    created_by: 'STORIES-AGENT'
  },

  {
    story_key: 'SD-VISION-V2-006:US-004',
    prd_id: PRD_KEY,
    sd_id: SD_ID,
    title: 'QuickStatCard Reusable Widget Component',
    user_role: 'Developer implementing Chairman Dashboard',
    user_want: 'A reusable QuickStatCard component that displays label, value, trend indicator, and optional sparkline',
    user_benefit: 'Maintains consistent stat card styling across the dashboard and reduces code duplication',
    priority: 'high',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-004-1',
        scenario: 'Happy path - Stat card with trend',
        given: 'QuickStatCard receives props: label="Active Ventures", value=12, trend={ direction: "up", percentage: 15 }',
        when: 'Component renders',
        then: 'Label displayed as heading AND value shown in large font AND trend arrow (up) with "+15%" in green color'
      },
      {
        id: 'AC-004-2',
        scenario: 'Number formatting - Large values',
        given: 'QuickStatCard receives value=1500000 (1.5 million)',
        when: 'Component formats the number',
        then: 'Display "1.5M" instead of "1500000" AND tooltip shows exact value on hover'
      },
      {
        id: 'AC-004-3',
        scenario: 'Trend direction - Color coding',
        given: 'QuickStatCard receives trend with direction: "up" (green), "down" (red), "neutral" (gray)',
        when: 'Trend indicator renders',
        then: 'Green color for "up" AND Red color for "down" AND Gray color for "neutral"'
      },
      {
        id: 'AC-004-4',
        scenario: 'Optional sparkline - Chart visualization',
        given: 'QuickStatCard receives sparklineData=[10, 15, 12, 18, 20, 17, 22]',
        when: 'Component renders sparkline',
        then: 'Mini line chart displayed below value AND chart shows trend over time'
      },
      {
        id: 'AC-004-5',
        scenario: 'Edge case - No trend data',
        given: 'QuickStatCard receives no trend prop',
        when: 'Component renders',
        then: 'Label and value displayed AND trend indicator not shown'
      }
    ],
    definition_of_done: [
      'QuickStatCard component created with TypeScript interface',
      'Props: label, value, trend, sparklineData, icon, onClick',
      'Number formatting: 1K, 1.5K, 1M, 1.2B',
      'Trend colors: green (up), red (down), gray (neutral)',
      'Optional sparkline chart (recharts or victory)',
      'Unit tests for all scenarios',
      'Storybook story for component variations'
    ],
    technical_notes: 'Number format: if (value >= 1M) return `${(value/1M).toFixed(1)}M`; if (value >= 1K) return `${(value/1K).toFixed(1)}K`;. Trend colors: const trendColors = { up: "text-green-500", down: "text-red-500", neutral: "text-gray-500" };',
    implementation_approach: 'Phase 1: Create QuickStatCard.tsx with TypeScript interface. Phase 2: Implement number formatting utility. Phase 3: Add trend indicator with color mapping. Phase 4: Integrate optional sparkline. Phase 5: Write unit tests.',
    implementation_context: 'FR-4: Reusable component for dashboard stats. Used in BriefingDashboard (4 cards), DecisionStack (decision count), PortfolioSummary (venture count). Ensures visual consistency.',
    architecture_references: [
      'src/components/chairman/QuickStatCard.tsx',
      'src/lib/utils/numberFormat.ts',
      'src/components/ui/Sparkline.tsx',
      'docs/vision/specs/03-ui-components.md#quickstatcard'
    ],
    testing_scenarios: [
      { scenario: 'QuickStatCard renders label, value, trend', type: 'unit', priority: 'P0' },
      { scenario: 'Number formatting: 1M, 1.5K', type: 'unit', priority: 'P1' },
      { scenario: 'Trend colors: green/red/gray', type: 'unit', priority: 'P1' },
      { scenario: 'Sparkline renders when data provided', type: 'unit', priority: 'P2' }
    ],
    created_by: 'STORIES-AGENT'
  },

  {
    story_key: 'SD-VISION-V2-006:US-005',
    prd_id: PRD_KEY,
    sd_id: SD_ID,
    title: 'TokenBudgetBar with Color-Coded Utilization Thresholds',
    user_role: 'Chairman (Grant)',
    user_want: 'A TokenBudgetBar showing portfolio-wide token consumption as a visual progress bar with color-coded thresholds',
    user_benefit: 'Can quickly identify if we are approaching budget limits and take proactive action',
    priority: 'high',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-005-1',
        scenario: 'Happy path - Budget bar with utilization',
        given: 'Portfolio has total_budget=1000000 tokens AND total_consumed=650000 tokens (65%)',
        when: 'TokenBudgetBar renders',
        then: 'Progress bar shows 65% filled AND percentage label "65%" displayed AND color is GREEN (<70% threshold)'
      },
      {
        id: 'AC-005-2',
        scenario: 'Threshold - Amber warning (70-90%)',
        given: 'Portfolio has 850000 consumed / 1000000 budget (85%)',
        when: 'TokenBudgetBar renders',
        then: 'Progress bar shows 85% filled AND color is AMBER (warning threshold)'
      },
      {
        id: 'AC-005-3',
        scenario: 'Threshold - Red critical (>90%)',
        given: 'Portfolio has 950000 consumed / 1000000 budget (95%)',
        when: 'TokenBudgetBar renders',
        then: 'Progress bar shows 95% filled AND color is RED (critical threshold)'
      },
      {
        id: 'AC-005-4',
        scenario: 'Tooltip - Exact numbers on hover',
        given: 'User hovers over TokenBudgetBar',
        when: 'Tooltip appears',
        then: 'Tooltip shows exact values: "650,000 / 1,000,000 tokens (65%)" AND remains visible while hovering'
      },
      {
        id: 'AC-005-5',
        scenario: 'Edge case - Zero consumption',
        given: 'Portfolio has 0 consumed / 1000000 budget (0%)',
        when: 'TokenBudgetBar renders',
        then: 'Progress bar shows 0% filled AND color is GREEN AND tooltip shows "0 / 1,000,000 tokens"'
      },
      {
        id: 'AC-005-6',
        scenario: 'Edge case - Over budget (>100%)',
        given: 'Portfolio has 1100000 consumed / 1000000 budget (110%)',
        when: 'TokenBudgetBar renders',
        then: 'Progress bar clamped at 100% visual fill AND color is RED AND tooltip shows "1,100,000 / 1,000,000 tokens (110% - OVER BUDGET)"'
      }
    ],
    definition_of_done: [
      'TokenBudgetBar component renders progress bar',
      'Color thresholds: green (<70%), amber (70-90%), red (>90%)',
      'Percentage label centered inside bar',
      'Tooltip shows exact consumed/budget numbers',
      'Handle zero consumption gracefully',
      'Handle over-budget (>100%) with warning',
      'Unit tests for all thresholds',
      'E2E test for budget visualization'
    ],
    technical_notes: 'Color logic: if (percentage > 90) return "bg-red-500"; if (percentage >= 70) return "bg-amber-500"; return "bg-green-500";. Data aggregation: total_consumed = SUM(agent_registry.token_consumed), total_budget = SUM(ventures.token_budget).',
    implementation_approach: 'Phase 1: Create TokenBudgetBar component. Phase 2: Implement color threshold logic. Phase 3: Add tooltip with exact numbers. Phase 4: Wire React Query for budget aggregation. Phase 5: Handle edge cases (zero, over-budget).',
    implementation_context: 'FR-5: Token budget resource utilization widget. Aggregates token_consumed from agent_registry and token_budget from ventures. Provides early warning when approaching limits.',
    architecture_references: [
      'src/components/chairman/TokenBudgetBar.tsx',
      'src/hooks/useTokenBudget.ts',
      'src/lib/utils/budgetCalculations.ts',
      'src/components/ui/ProgressBar.tsx'
    ],
    testing_scenarios: [
      { scenario: 'TokenBudgetBar shows correct percentage', type: 'unit', priority: 'P0' },
      { scenario: 'Color changes at 70% and 90%', type: 'unit', priority: 'P0' },
      { scenario: 'Tooltip displays exact numbers', type: 'integration', priority: 'P1' },
      { scenario: 'Handle over-budget (>100%)', type: 'unit', priority: 'P2' }
    ],
    created_by: 'STORIES-AGENT'
  },

  {
    story_key: 'SD-VISION-V2-006:US-006',
    prd_id: PRD_KEY,
    sd_id: SD_ID,
    title: 'EVA Integration Panel with Proactive Insights',
    user_role: 'Chairman (Grant)',
    user_want: 'An EVA Integration Panel showing proactive insights, recent messages, and quick action buttons',
    user_benefit: 'Stay informed of EVA recommendations without manually querying, reducing cognitive load',
    priority: 'high',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-006-1',
        scenario: 'Happy path - EVA greeting and latest insight',
        given: 'Chairman logs in at 9:00 AM AND EVA has sent latest insight message',
        when: 'EVAGreeting component renders',
        then: 'Time-appropriate greeting displays: "Good morning, Grant" AND latest EVA insight shown below greeting AND "View All Messages" and "Send to EVA" action buttons visible'
      },
      {
        id: 'AC-006-2',
        scenario: 'Greeting personalization - Time-based',
        given: 'Current time is: 6:00 AM (morning), 1:00 PM (afternoon), 7:00 PM (evening)',
        when: 'EVAGreeting renders',
        then: 'Greeting shows: "Good morning, Grant" (6 AM-11:59 AM) OR "Good afternoon, Grant" (12 PM-5:59 PM) OR "Good evening, Grant" (6 PM-5:59 AM)'
      },
      {
        id: 'AC-006-3',
        scenario: 'Realtime updates - New EVA message arrives',
        given: 'User is viewing dashboard AND EVA sends new message via SSE',
        when: 'agent_messages table receives INSERT event',
        then: 'EVA panel updates with new message content AND visual indicator (badge or animation) shows new message arrived'
      },
      {
        id: 'AC-006-4',
        scenario: 'Quick actions - View All Messages',
        given: 'User clicks "View All Messages" button',
        when: 'Navigation triggered',
        then: 'Navigate to /chairman/messages route showing full EVA message history'
      },
      {
        id: 'AC-006-5',
        scenario: 'Quick actions - Send to EVA',
        given: 'User clicks "Send to EVA" button',
        when: 'Modal or input field opens',
        then: 'Message composition UI displays AND user can type message AND submit sends to agent_messages table with to_agent_id=EVA_COO_ID'
      },
      {
        id: 'AC-006-6',
        scenario: 'Edge case - No EVA messages',
        given: 'EVA has not sent any messages to Chairman',
        when: 'EVAGreeting renders',
        then: 'Greeting still displays AND placeholder text: "No recent insights from EVA." AND "Send to EVA" button still available'
      }
    ],
    definition_of_done: [
      'EVAGreeting displays time-appropriate greeting (morning/afternoon/evening)',
      'Latest EVA insight displayed from agent_messages table',
      'Quick action buttons: View All Messages, Send to EVA',
      'Realtime SSE subscription for live EVA message updates',
      'ComposeMessageModal for sending messages to EVA',
      'Empty state handles zero EVA messages',
      'E2E test for EVA integration and realtime updates'
    ],
    technical_notes: 'Time greeting: if (hour >= 6 && hour < 12) return "Good morning"; if (hour >= 12 && hour < 18) return "Good afternoon"; return "Good evening";. SSE: Supabase Realtime channel for agent_messages INSERT events. Filter: to_agent_id=CHAIRMAN_ID, from_agent_id=EVA_COO_ID.',
    implementation_approach: 'Phase 1: Create EVAGreeting with time-based logic. Phase 2: Build EVAInsightCard for latest message. Phase 3: Implement EVAQuickActions buttons. Phase 4: Add ComposeMessageModal. Phase 5: Wire SSE subscription for realtime updates.',
    implementation_context: 'FR-6: EVA COO integration for proactive insights. Surfaces EVA recommendations without manual querying. Integrates with agent_messages table and Supabase Realtime (SSE).',
    architecture_references: [
      'src/components/chairman/EVAGreeting.tsx',
      'src/components/chairman/EVAInsightCard.tsx',
      'src/components/chairman/EVAQuickActions.tsx',
      'src/components/chairman/ComposeMessageModal.tsx',
      'src/hooks/useEVAMessages.ts',
      'src/lib/realtime/useAgentMessagesSubscription.ts'
    ],
    testing_scenarios: [
      { scenario: 'EVAGreeting shows time-appropriate greeting', type: 'unit', priority: 'P0' },
      { scenario: 'Latest EVA insight displays', type: 'integration', priority: 'P0' },
      { scenario: 'Realtime update on new message', type: 'integration', priority: 'P1' },
      { scenario: 'Send to EVA modal submits', type: 'integration', priority: 'P1' }
    ],
    created_by: 'STORIES-AGENT'
  },

  {
    story_key: 'SD-VISION-V2-006:US-007',
    prd_id: PRD_KEY,
    sd_id: SD_ID,
    title: 'Responsive Mobile-First Dashboard Layout',
    user_role: 'Chairman (Grant) using mobile device',
    user_want: 'A responsive mobile-first layout with collapsible sections and touch-friendly interactions',
    user_benefit: 'Can make decisions from anywhere using mobile devices with an optimized touch-friendly interface',
    priority: 'high',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-007-1',
        scenario: 'Mobile viewport - Single column layout',
        given: 'User accesses /chairman on mobile viewport (375px width)',
        when: 'BriefingDashboard renders',
        then: 'QuickStatCards stack in single or dual column (max 2 cols) AND DecisionStack cards are full-width AND all touch targets are minimum 44x44px'
      },
      {
        id: 'AC-007-2',
        scenario: 'Tablet viewport - Multi-column layout',
        given: 'User accesses /chairman on tablet viewport (768px width)',
        when: 'BriefingDashboard renders',
        then: 'QuickStatCards display in 2-column grid AND DecisionStack shows 2 cards side-by-side'
      },
      {
        id: 'AC-007-3',
        scenario: 'Desktop viewport - Full dashboard layout',
        given: 'User accesses /chairman on desktop viewport (1280px width)',
        when: 'BriefingDashboard renders',
        then: 'QuickStatCards display in 4-column grid AND DecisionStack shows 3+ cards side-by-side AND all sections visible without scroll'
      },
      {
        id: 'AC-007-4',
        scenario: 'Touch interactions - Swipe gestures',
        given: 'User is on mobile with DecisionStack showing 3+ decisions',
        when: 'User swipes left/right on DecisionCard',
        then: 'Card slides to reveal next/previous decision AND snap points ensure smooth navigation'
      },
      {
        id: 'AC-007-5',
        scenario: 'Collapsible sections - Mobile optimization',
        given: 'User is on mobile viewport AND clicks section header (e.g., "Pending Decisions")',
        when: 'Section toggles',
        then: 'Section content collapses/expands with smooth animation AND collapse state persisted in Zustand'
      },
      {
        id: 'AC-007-6',
        scenario: 'Touch targets - Minimum size validation',
        given: 'User is on mobile viewport',
        when: 'Rendering interactive elements (buttons, cards, links)',
        then: 'All touch targets are minimum 44x44px (iOS guideline) AND adequate spacing between targets (8px minimum)'
      }
    ],
    definition_of_done: [
      'Responsive breakpoints: mobile (<640px), tablet (640-1024px), desktop (>1024px)',
      'Mobile: single/dual column layout with touch targets >= 44x44px',
      'Tablet: 2-column QuickStatCards, 2-column DecisionStack',
      'Desktop: 4-column QuickStatCards, 3+ column DecisionStack',
      'Touch gestures work on mobile (swipe for cards)',
      'Collapsible sections with Zustand persistence',
      'No horizontal overflow on any viewport',
      'E2E tests at all three breakpoints'
    ],
    technical_notes: 'Tailwind breakpoints: sm:640px, md:768px, lg:1024px, xl:1280px. Responsive classes: grid-cols-1 sm:grid-cols-2 lg:grid-cols-4. Touch targets: min-h-[44px] min-w-[44px]. Mobile gestures: framer-motion or react-swipeable.',
    implementation_approach: 'Phase 1: Define Tailwind responsive grid classes. Phase 2: Test at 375px, 768px, 1280px viewports. Phase 3: Implement touch target validation. Phase 4: Add collapsible sections with Zustand. Phase 5: Implement swipe gestures for mobile.',
    implementation_context: 'FR-7: Mobile-responsive design. Glass Cockpit aesthetic must work on all devices. Chairman should access critical info on-the-go.',
    architecture_references: [
      'src/components/chairman/BriefingDashboard.tsx',
      'src/components/ui/CollapsibleSection.tsx',
      'src/hooks/useMediaQuery.ts',
      'src/lib/utils/touchTargets.ts',
      'tailwind.config.js'
    ],
    testing_scenarios: [
      { scenario: 'Mobile viewport renders 1-2 column layout', type: 'visual', priority: 'P0' },
      { scenario: 'Tablet viewport renders 2-column layout', type: 'visual', priority: 'P1' },
      { scenario: 'Desktop viewport renders 4-column layout', type: 'visual', priority: 'P1' },
      { scenario: 'Touch targets are minimum 44x44px', type: 'accessibility', priority: 'P0' },
      { scenario: 'Swipe gestures work on mobile', type: 'interaction', priority: 'P2' }
    ],
    created_by: 'STORIES-AGENT'
  }
];

// ============================================================================
// Main Function
// ============================================================================

async function createUserStories() {
  console.log('\n📋 Creating User Stories for SD-VISION-V2-006');
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
