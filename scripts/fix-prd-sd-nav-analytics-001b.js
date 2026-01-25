#!/usr/bin/env node
/**
 * Fix PRD-SD-NAV-ANALYTICS-001B content to pass quality validation
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function fixPRD() {
  console.log('Fixing PRD-SD-NAV-ANALYTICS-001B...\n');

  const prdUpdate = {
    // Detailed executive summary
    executive_summary: `This PRD addresses three navigation audit issues (NAV-19, NAV-20, NAV-27) in the Analytics section:

NAV-19 ISSUE: The useAnalyticsData.ts hook at ../ehg/src/hooks/useAnalyticsData.ts returns mock data unconditionally on lines 12-54, 62-176, and 184-263. This violates the established demo mode gating pattern from useVentureData.ts where mock data should only appear when localStorage ehg_demo_mode equals true.

NAV-20 ISSUE: The Competitive Intelligence page at ../ehg/src/pages/competitive-intelligence.tsx lacks a venture selector dropdown, preventing users from analyzing specific ventures. The ProfitabilityPage.tsx demonstrates the correct pattern using useState, useMemo, and the useVentures hook.

NAV-27 ISSUE: GTM Intelligence navigation placement in the sidebar requires verification to ensure it appears correctly under the Analytics section.

BUSINESS IMPACT: Users see fake analytics data in production mode, causing confusion about data accuracy. The lack of venture context means competitive intelligence analysis cannot be scoped to specific ventures.`,

    // Specific functional requirements
    functional_requirements: [
      {
        id: 'FR-NAV-19',
        requirement: 'Gate mock data in useAnalyticsData.ts behind demo mode check',
        description: 'At the start of usePortfolioAnalytics (line 9), useVentureAnalytics (line 59), and useAIInsights (line 181), add: const isDemoMode = localStorage.getItem("ehg_demo_mode") === "true"; If isDemoMode is false, return null for usePortfolioAnalytics and empty arrays for useVentureAnalytics and useAIInsights.',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Given ehg_demo_mode is false or unset in localStorage, when usePortfolioAnalytics is called, then it returns null instead of mock PortfolioAnalytics object',
          'Given ehg_demo_mode is false or unset in localStorage, when useVentureAnalytics is called, then it returns an empty VentureAnalytics array',
          'Given ehg_demo_mode is true in localStorage, when usePortfolioAnalytics is called, then it returns the existing mock data with totalValue 487300000'
        ]
      },
      {
        id: 'FR-NAV-20',
        requirement: 'Add venture selector to Competitive Intelligence page header',
        description: 'In competitive-intelligence.tsx, import useState and useMemo from React, import useVentures from useVentureData. Add state: const [selectedVentureId, setSelectedVentureId] = useState(""). Filter active ventures using useMemo. Add Select component from @/components/ui/select in the header area after the badges.',
        priority: 'HIGH',
        acceptance_criteria: [
          'Given the page loads with ventures in database, when user views the page, then a dropdown labeled "Select Venture" appears below the page badges',
          'Given ventures exist with status active, when dropdown is opened, then only active ventures are listed alphabetically by name',
          'Given user selects a venture, when selection changes, then selectedVentureId state updates to the venture id'
        ]
      },
      {
        id: 'FR-NAV-20B',
        requirement: 'Pass venture context to CompetitiveIntelligenceModule',
        description: 'Update CompetitiveIntelligenceModule component to accept an optional ventureId prop of type string. When ventureId is provided, display the venture name in the header. Pass selectedVentureId from competitive-intelligence.tsx to the module.',
        priority: 'HIGH',
        acceptance_criteria: [
          'Given ventureId prop is passed to CompetitiveIntelligenceModule, when component renders, then the venture name appears in the module header',
          'Given no ventureId is selected, when component renders, then show text "Select a venture to view competitive intelligence"'
        ]
      },
      {
        id: 'FR-NAV-27',
        requirement: 'Verify GTM Intelligence navigation placement',
        description: 'Check the sidebar navigation component to confirm GTM Intelligence link exists under Analytics section and routes to /gtm-intelligence page correctly.',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Given user views the sidebar navigation, when Analytics section is expanded, then GTM Intelligence link is visible',
          'Given user clicks GTM Intelligence link, when navigation occurs, then browser URL changes to /gtm-intelligence'
        ]
      }
    ],

    // Specific acceptance criteria (SD-level)
    acceptance_criteria: [
      'Demo mode check using localStorage.getItem("ehg_demo_mode") === "true" is present at the start of all three analytics hooks',
      'usePortfolioAnalytics returns null when demo mode is disabled, returns mock PortfolioAnalytics when enabled',
      'useVentureAnalytics returns empty array when demo mode is disabled, returns 3 mock VentureAnalytics when enabled',
      'useAIInsights returns empty array when demo mode is disabled, returns 4 mock AIInsight objects when enabled',
      'Competitive Intelligence page contains Select component with venture options populated from useVentures hook',
      'CompetitiveIntelligenceModule accepts ventureId prop and displays venture context in header',
      'TypeScript compilation succeeds with no errors on npm run build',
      'GTM Intelligence link is present in sidebar navigation under Analytics section'
    ],

    // Specific test scenarios
    test_scenarios: [
      {
        id: 'TS-NAV19-DEMO-OFF',
        scenario: 'Analytics hooks return empty data when demo mode disabled',
        description: 'Set localStorage ehg_demo_mode to false, call each analytics hook, verify return values are null or empty arrays',
        expected_result: 'usePortfolioAnalytics returns null, useVentureAnalytics returns [], useAIInsights returns []',
        test_type: 'unit',
        inputs: 'localStorage.setItem("ehg_demo_mode", "false")',
        outputs: 'null, [], []'
      },
      {
        id: 'TS-NAV19-DEMO-ON',
        scenario: 'Analytics hooks return mock data when demo mode enabled',
        description: 'Set localStorage ehg_demo_mode to true, call each analytics hook, verify mock data is returned',
        expected_result: 'usePortfolioAnalytics returns object with totalValue 487300000, useVentureAnalytics returns array of 3 items, useAIInsights returns array of 4 items',
        test_type: 'unit',
        inputs: 'localStorage.setItem("ehg_demo_mode", "true")',
        outputs: '{ totalValue: 487300000, ... }, [3 items], [4 items]'
      },
      {
        id: 'TS-NAV20-SELECTOR-VISIBLE',
        scenario: 'Venture selector appears on Competitive Intelligence page',
        description: 'Navigate to /competitive-intelligence, verify Select component is visible in page header',
        expected_result: 'Page contains Select element with placeholder "Select Venture" and venture options when clicked',
        test_type: 'e2e',
        inputs: 'Navigate to /competitive-intelligence',
        outputs: 'Select component visible with venture dropdown'
      },
      {
        id: 'TS-NAV27-NAV-LINK',
        scenario: 'GTM Intelligence link in sidebar navigation',
        description: 'Expand Analytics section in sidebar, verify GTM Intelligence link is present and navigates correctly',
        expected_result: 'GTM Intelligence link visible under Analytics, clicking it navigates to /gtm-intelligence',
        test_type: 'e2e',
        inputs: 'Click Analytics section, locate GTM Intelligence link',
        outputs: 'Link present, navigation works'
      }
    ],

    // Detailed implementation approach
    implementation_approach: `PHASE 1: Demo Mode Gating in useAnalyticsData.ts (FR-NAV-19)
Step 1.1: Open ../ehg/src/hooks/useAnalyticsData.ts
Step 1.2: In usePortfolioAnalytics (line 9), add before return: const isDemoMode = localStorage.getItem("ehg_demo_mode") === "true"; if (!isDemoMode) return useQuery({ queryKey: ["portfolio-analytics", timeframe], queryFn: async () => null });
Step 1.3: In useVentureAnalytics (line 59), add similar check returning empty array
Step 1.4: In useAIInsights (line 181), add similar check returning empty array
Step 1.5: Verify TypeScript compiles without errors

PHASE 2: Venture Selector in competitive-intelligence.tsx (FR-NAV-20)
Step 2.1: Import useState, useMemo from react; useVentures from @/hooks/useVentureData; Select components from @/components/ui/select
Step 2.2: Add state: const [selectedVentureId, setSelectedVentureId] = useState<string>("")
Step 2.3: Add ventures query: const { data: ventures } = useVentures()
Step 2.4: Add filtered ventures: const activeVentures = useMemo(() => ventures?.filter(v => v.status === "active") || [], [ventures])
Step 2.5: Add Select component in header below badges with venture options

PHASE 3: Venture Context in CompetitiveIntelligenceModule.tsx (FR-NAV-20B)
Step 3.1: Add ventureId prop to component interface
Step 3.2: Add conditional header showing venture name or "Select a venture" message
Step 3.3: Update competitive-intelligence.tsx to pass selectedVentureId to module

PHASE 4: Navigation Verification (FR-NAV-27)
Step 4.1: Check sidebar navigation file for GTM Intelligence link
Step 4.2: Verify route exists in router configuration
Step 4.3: Test link in browser`,

    // Detailed system architecture
    system_architecture: `COMPONENT ARCHITECTURE:
1. useAnalyticsData.ts (hooks layer)
   - usePortfolioAnalytics: Add isDemoMode check at line 10
   - useVentureAnalytics: Add isDemoMode check at line 60
   - useAIInsights: Add isDemoMode check at line 182

2. competitive-intelligence.tsx (page layer)
   - New state: selectedVentureId (string)
   - New hook: useVentures() from useVentureData
   - New UI: Select component for venture selection
   - Child component: CompetitiveIntelligenceModule receives ventureId

3. CompetitiveIntelligenceModule.tsx (component layer)
   - New prop: ventureId?: string
   - Conditional rendering based on ventureId presence

DATA FLOW:
localStorage["ehg_demo_mode"] → useAnalyticsData hooks → Return mock or null
useVentures → competitive-intelligence → Select → selectedVentureId → CompetitiveIntelligenceModule

FILE MODIFICATIONS:
- ehg/src/hooks/useAnalyticsData.ts: 3 hook modifications
- ehg/src/pages/competitive-intelligence.tsx: Add imports, state, selector
- ehg/src/components/competitive-intelligence/CompetitiveIntelligenceModule.tsx: Add ventureId prop`,

    // Specific data model
    data_model: {
      existing_tables: [
        {
          name: 'ventures',
          used_for: 'Populate venture selector dropdown',
          columns_used: ['id', 'name', 'status'],
          note: 'Filter by status = active'
        }
      ],
      no_new_tables: true,
      localStorage_keys: [
        {
          key: 'ehg_demo_mode',
          type: 'string',
          values: ['true', 'false'],
          purpose: 'Gate mock data display in analytics hooks'
        }
      ]
    },

    // Updated risks
    risks: [
      {
        category: 'Technical',
        risk: 'Type errors from null/empty returns in analytics hooks',
        severity: 'LOW',
        probability: 'LOW',
        impact: 'Components consuming analytics data may error if not checking for null',
        mitigation: 'Consuming components already use optional chaining and null checks'
      },
      {
        category: 'UX',
        risk: 'Users see empty analytics when demo mode is off and no real data exists',
        severity: 'LOW',
        probability: 'MEDIUM',
        impact: 'Empty state shown instead of mock data',
        mitigation: 'This is expected behavior - empty state is preferable to fake data'
      }
    ],

    // Updated constraints
    constraints: [
      {
        type: 'Pattern Consistency',
        constraint: 'Must match localStorage check pattern from useVentureData.ts line 11',
        impact: 'Consistent demo mode behavior across all data hooks'
      },
      {
        type: 'UI Consistency',
        constraint: 'Venture selector must match ProfitabilityPage.tsx implementation',
        impact: 'Consistent UX across analytics pages'
      }
    ],

    // Updated checklists
    plan_checklist: [
      { text: 'PRD created with specific requirements for NAV-19, NAV-20, NAV-27', checked: true },
      { text: 'Demo mode gating pattern documented from useVentureData.ts line 11-12', checked: true },
      { text: 'Venture selector pattern documented from ProfitabilityPage.tsx', checked: true },
      { text: 'DESIGN sub-agent executed', checked: true },
      { text: 'DATABASE sub-agent executed - confirmed no schema changes needed', checked: true }
    ],

    exec_checklist: [
      { text: 'Add isDemoMode check to usePortfolioAnalytics hook', checked: false },
      { text: 'Add isDemoMode check to useVentureAnalytics hook', checked: false },
      { text: 'Add isDemoMode check to useAIInsights hook', checked: false },
      { text: 'Add venture selector to competitive-intelligence.tsx', checked: false },
      { text: 'Add ventureId prop to CompetitiveIntelligenceModule', checked: false },
      { text: 'Verify GTM Intelligence navigation link placement', checked: false },
      { text: 'Run TypeScript compilation to verify no errors', checked: false }
    ],

    validation_checklist: [
      { text: 'Demo mode disabled: usePortfolioAnalytics returns null', checked: false },
      { text: 'Demo mode disabled: useVentureAnalytics returns empty array', checked: false },
      { text: 'Demo mode disabled: useAIInsights returns empty array', checked: false },
      { text: 'Demo mode enabled: all three hooks return mock data', checked: false },
      { text: 'Venture selector displays active ventures from database', checked: false },
      { text: 'GTM Intelligence link present in sidebar under Analytics', checked: false }
    ],

    // Progress tracking
    progress: 15,
    phase: 'planning',
    status: 'approved',

    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .update(prdUpdate)
    .eq('id', 'PRD-SD-NAV-ANALYTICS-001B')
    .select('id, title, status')
    .single();

  if (error) {
    console.error('Error updating PRD:', error);
    process.exit(1);
  }

  console.log('PRD updated successfully:');
  console.log(`  ID: ${data.id}`);
  console.log(`  Title: ${data.title}`);
  console.log(`  Status: ${data.status}`);
  console.log('\nAll boilerplate content replaced with specific, measurable requirements.');
}

fixPRD().catch(console.error);
