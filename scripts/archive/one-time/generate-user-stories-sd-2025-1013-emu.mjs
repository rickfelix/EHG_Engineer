#!/usr/bin/env node

/**
 * Generate User Stories for SD-2025-1013-EMU (User Analytics Dashboard)
 *
 * This script creates INVEST-compliant user stories based on PRD functional requirements
 * and saves them to the user_stories table in the database.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// SD and PRD references
const SD_ID = 'SD-2025-1013-EMU';
const PRD_ID = 'PRD-SD-2025-1013-EMU';

// User stories based on PRD functional requirements
const userStories = [
  {
    story_key: `${SD_ID}:US-001`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'View Engagement Metrics Dashboard',
    user_role: 'Product Manager',
    user_want: 'view a dashboard displaying key engagement metrics including clicks, time on page, conversion rates, and session duration',
    user_benefit: 'I can quickly assess user engagement patterns and make data-driven decisions about product improvements',
    story_points: 5,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'Dashboard displays all engagement metrics',
        given: 'User is authenticated and on the Analytics page',
        when: 'Dashboard loads',
        then: 'All 4 metrics (clicks, time on page, conversion rates, session duration) are displayed as metric cards with values and trend indicators'
      },
      {
        id: 'AC-001-2',
        scenario: 'Metrics show visual trend indicators',
        given: 'Dashboard has loaded with metric data',
        when: 'User views the metric cards',
        then: 'Each metric shows a trend indicator (up/down arrow with percentage change) compared to previous period'
      },
      {
        id: 'AC-001-3',
        scenario: 'Dashboard loads within performance threshold',
        given: 'User navigates to Analytics Dashboard',
        when: 'Dashboard starts loading',
        then: 'All metrics are visible within 2 seconds of navigation'
      }
    ],
    definition_of_done: [
      'All 4 metric cards implemented and displaying data',
      'Trend indicators showing period-over-period changes',
      'Unit tests for metric calculation logic (>80% coverage)',
      'E2E test verifying dashboard loads with all metrics',
      'Component follows 300-600 LOC guideline'
    ],
    technical_notes: 'Reuse KPI card pattern from ExecutiveDecisionSupport.tsx. Use Recharts for any chart elements. Implement using React Query pattern from useAnalyticsData.ts for data fetching.',
    implementation_approach: 'Create UserAnalyticsDashboard.tsx component with MetricCard subcomponents. Implement useUserEngagementMetrics hook using React Query. Reference PortfolioAnalyticsView.tsx for chart styling patterns.',
    test_scenarios: [
      { id: 'TS-001-1', scenario: 'Dashboard renders all metric cards', test_type: 'e2e', priority: 'P0' },
      { id: 'TS-001-2', scenario: 'Metric values computed correctly from raw data', test_type: 'unit', priority: 'P0' },
      { id: 'TS-001-3', scenario: 'Trend calculations are accurate', test_type: 'unit', priority: 'P1' }
    ],
    implementation_context: JSON.stringify({
      files: ['src/components/analytics/UserAnalyticsDashboard.tsx', 'src/hooks/useUserEngagementMetrics.ts'],
      dependencies: ['@tanstack/react-query', 'recharts'],
      apis: ['Supabase analytics tables'],
      patterns: ['React Query hook pattern', 'KPI card component pattern from ExecutiveDecisionSupport']
    }),
    architecture_references: [
      { path: 'src/components/executive/ExecutiveDecisionSupport.tsx', reason: 'KPI card pattern' },
      { path: 'src/hooks/useAnalyticsData.ts', reason: 'React Query hook pattern' },
      { path: 'src/components/portfolio/PortfolioAnalyticsView.tsx', reason: 'Chart styling patterns' }
    ],
    example_code_patterns: [
      {
        pattern: 'React Query data hook',
        code: `const useUserEngagementMetrics = (timeRange: TimeRange) => {
  return useQuery({
    queryKey: ['engagement-metrics', timeRange],
    queryFn: () => fetchEngagementMetrics(timeRange),
    staleTime: 30000
  });
};`
      }
    ],
    testing_scenarios: [
      { input: 'Time range: 7d', expected_output: 'Metrics for last 7 days displayed' },
      { input: 'No data available', expected_output: 'Empty state with "No data" message' }
    ],
    maps_to_requirement: 'FR-1'
  },
  {
    story_key: `${SD_ID}:US-002`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'View User Journey Flow Visualization',
    user_role: 'Product Manager',
    user_want: 'see a visual representation of user journey flows showing common paths users take through the application',
    user_benefit: 'I can identify the most frequent user paths and optimize the user experience for those journeys',
    story_points: 8,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'Journey flow visualization renders',
        given: 'User is on the Analytics Dashboard',
        when: 'User views the User Journey section',
        then: 'A Sankey or flow diagram displays showing aggregated user paths'
      },
      {
        id: 'AC-002-2',
        scenario: 'Common paths are highlighted',
        given: 'Journey visualization has loaded',
        when: 'User views the diagram',
        then: 'The most common paths (top 10 by frequency) are visually highlighted with thicker lines or distinct colors'
      },
      {
        id: 'AC-002-3',
        scenario: 'Visualization renders within performance threshold',
        given: 'User navigates to the Journey section',
        when: 'Visualization starts loading',
        then: 'The aggregated view renders within 2 seconds'
      }
    ],
    definition_of_done: [
      'Sankey/flow diagram component implemented',
      'Top 10 journeys displayed by default',
      'Common paths visually distinguished',
      'Unit tests for journey aggregation logic',
      'E2E test verifying visualization renders correctly',
      'Performance: <2s render time'
    ],
    technical_notes: 'Consider using Recharts Sankey component or a specialized flow visualization library. Data aggregation should happen server-side or in a dedicated hook to avoid client-side performance issues.',
    implementation_approach: 'Create UserJourneyAggregatedView.tsx component. Implement useUserJourneyData hook for fetching and aggregating journey data. Use existing chart patterns from PortfolioAnalyticsView.tsx.',
    test_scenarios: [
      { id: 'TS-002-1', scenario: 'Journey visualization renders correctly', test_type: 'e2e', priority: 'P0' },
      { id: 'TS-002-2', scenario: 'Journey aggregation groups paths correctly', test_type: 'unit', priority: 'P0' },
      { id: 'TS-002-3', scenario: 'Top 10 paths are correctly identified', test_type: 'unit', priority: 'P1' }
    ],
    implementation_context: JSON.stringify({
      files: ['src/components/analytics/UserJourneyAggregatedView.tsx', 'src/hooks/useUserJourneyData.ts'],
      dependencies: ['recharts'],
      apis: ['Supabase user_sessions, page_views tables'],
      patterns: ['Sankey diagram pattern', 'Data aggregation pattern']
    }),
    architecture_references: [
      { path: 'src/components/portfolio/PortfolioAnalyticsView.tsx', reason: 'Chart component patterns' }
    ],
    example_code_patterns: [
      {
        pattern: 'Journey aggregation',
        code: `const aggregateJourneys = (sessions: Session[]) => {
  const pathCounts = new Map<string, number>();
  sessions.forEach(session => {
    const pathKey = session.pageSequence.join(' -> ');
    pathCounts.set(pathKey, (pathCounts.get(pathKey) || 0) + 1);
  });
  return Array.from(pathCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
};`
      }
    ],
    testing_scenarios: [
      { input: '100 sessions with various paths', expected_output: 'Top 10 aggregated paths displayed' }
    ],
    maps_to_requirement: 'FR-2'
  },
  {
    story_key: `${SD_ID}:US-003`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Drill Down into Individual User Journeys',
    user_role: 'Product Manager',
    user_want: 'click on an aggregated journey path to see detailed information about individual user sessions that followed that path',
    user_benefit: 'I can investigate specific user behaviors and understand the context behind aggregate patterns',
    story_points: 5,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'Drill-down interaction works',
        given: 'User is viewing the aggregated journey visualization',
        when: 'User clicks on a specific path',
        then: 'A detail panel opens showing individual sessions that followed that path'
      },
      {
        id: 'AC-003-2',
        scenario: 'Individual sessions are listed',
        given: 'Drill-down panel is open',
        when: 'User views the session list',
        then: 'Sessions are listed with timestamp, user ID (anonymized), and duration'
      },
      {
        id: 'AC-003-3',
        scenario: 'Session timeline is available',
        given: 'Drill-down panel showing sessions',
        when: 'User clicks on an individual session',
        then: 'A timeline view shows the exact page sequence with timestamps for that session'
      }
    ],
    definition_of_done: [
      'Clickable paths in journey visualization',
      'Detail panel with session list',
      'Session timeline view component',
      'Unit tests for session data transformation',
      'E2E test verifying drill-down flow works end-to-end'
    ],
    technical_notes: 'Use Radix UI Dialog or Sheet component for the detail panel. Consider pagination for sessions list if there are many results.',
    implementation_approach: 'Add click handlers to UserJourneyAggregatedView paths. Create JourneyDrillDownPanel.tsx with SessionList and SessionTimeline subcomponents.',
    test_scenarios: [
      { id: 'TS-003-1', scenario: 'Clicking path opens drill-down panel', test_type: 'e2e', priority: 'P0' },
      { id: 'TS-003-2', scenario: 'Session list displays correctly', test_type: 'e2e', priority: 'P1' },
      { id: 'TS-003-3', scenario: 'Session timeline renders correctly', test_type: 'e2e', priority: 'P1' }
    ],
    implementation_context: JSON.stringify({
      files: ['src/components/analytics/JourneyDrillDownPanel.tsx', 'src/components/analytics/SessionTimeline.tsx'],
      dependencies: ['@radix-ui/react-dialog'],
      apis: ['Supabase sessions API with path filter'],
      patterns: ['Detail panel pattern', 'Timeline visualization']
    }),
    architecture_references: [
      { path: 'src/components/ui/dialog.tsx', reason: 'Dialog pattern for drill-down panel' }
    ],
    example_code_patterns: [],
    testing_scenarios: [
      { input: 'Click on path with 15 sessions', expected_output: 'Panel shows 15 sessions with pagination if needed' }
    ],
    maps_to_requirement: 'FR-3'
  },
  {
    story_key: `${SD_ID}:US-004`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Filter Analytics by Time Range',
    user_role: 'Product Manager',
    user_want: 'filter the analytics dashboard data by different time ranges including preset options (24h, 7d, 30d) and custom date ranges',
    user_benefit: 'I can analyze user behavior patterns across different time periods to identify trends and seasonality',
    story_points: 3,
    priority: 'medium',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-004-1',
        scenario: 'Preset time range buttons work',
        given: 'User is on the Analytics Dashboard',
        when: 'User clicks 24h, 7d, or 30d button',
        then: 'Dashboard data updates to reflect the selected time range'
      },
      {
        id: 'AC-004-2',
        scenario: 'Custom date picker available',
        given: 'User wants to select a custom date range',
        when: 'User opens the date picker',
        then: 'User can select start and end dates, and data updates accordingly'
      },
      {
        id: 'AC-004-3',
        scenario: 'Filter persists during session',
        given: 'User has selected a time range',
        when: 'User navigates away and returns to dashboard',
        then: 'The previously selected time range is still active'
      }
    ],
    definition_of_done: [
      'Preset buttons (24h/7d/30d) implemented',
      'Custom date picker component integrated',
      'Filter state persists in session storage',
      'All dashboard components respond to filter changes',
      'Unit tests for date range calculations',
      'E2E test verifying filter updates data'
    ],
    technical_notes: 'Use existing date picker pattern from the codebase. Store filter state in session storage or URL params for persistence.',
    implementation_approach: 'Create TimeRangeFilter.tsx component with ButtonGroup for presets and DatePicker for custom. Use React Context or URL state for filter persistence.',
    test_scenarios: [
      { id: 'TS-004-1', scenario: 'Preset buttons update dashboard data', test_type: 'e2e', priority: 'P0' },
      { id: 'TS-004-2', scenario: 'Custom date range updates dashboard', test_type: 'e2e', priority: 'P1' },
      { id: 'TS-004-3', scenario: 'Date range validation works correctly', test_type: 'unit', priority: 'P1' }
    ],
    implementation_context: JSON.stringify({
      files: ['src/components/analytics/TimeRangeFilter.tsx'],
      dependencies: ['date-fns', '@radix-ui/react-popover'],
      apis: [],
      patterns: ['Filter component pattern', 'Date picker pattern']
    }),
    architecture_references: [],
    example_code_patterns: [
      {
        pattern: 'Time range calculation',
        code: `const getDateRange = (preset: '24h' | '7d' | '30d') => {
  const end = new Date();
  const start = new Date();
  if (preset === '24h') start.setHours(start.getHours() - 24);
  else if (preset === '7d') start.setDate(start.getDate() - 7);
  else if (preset === '30d') start.setDate(start.getDate() - 30);
  return { start, end };
};`
      }
    ],
    testing_scenarios: [
      { input: 'Select 7d preset', expected_output: 'Data shows last 7 days only' }
    ],
    maps_to_requirement: 'FR-4'
  },
  {
    story_key: `${SD_ID}:US-005`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Export Analytics Data to CSV',
    user_role: 'Product Manager',
    user_want: 'export the currently displayed analytics data to a CSV file',
    user_benefit: 'I can share data with stakeholders and perform additional analysis in spreadsheet applications',
    story_points: 3,
    priority: 'medium',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-005-1',
        scenario: 'CSV export button is visible',
        given: 'User is on the Analytics Dashboard',
        when: 'User views the export options',
        then: 'A CSV export button is clearly visible'
      },
      {
        id: 'AC-005-2',
        scenario: 'CSV export downloads successfully',
        given: 'User clicks the CSV export button',
        when: 'Export process completes',
        then: 'A CSV file downloads containing all displayed metrics and data'
      },
      {
        id: 'AC-005-3',
        scenario: 'CSV filename includes date range',
        given: 'User exports data with 7d filter selected',
        when: 'File downloads',
        then: 'Filename includes the date range (e.g., analytics_2025-01-01_to_2025-01-07.csv)'
      }
    ],
    definition_of_done: [
      'Export button in dashboard toolbar',
      'CSV includes all displayed metrics',
      'Filename includes date range',
      'Unit tests for CSV generation logic',
      'E2E test verifying export produces valid CSV'
    ],
    technical_notes: 'Use native Blob API for CSV generation. Ensure proper escaping of special characters in data.',
    implementation_approach: 'Create exportToCSV utility function. Add export button to dashboard toolbar. Format data as CSV with proper headers.',
    test_scenarios: [
      { id: 'TS-005-1', scenario: 'CSV export button triggers download', test_type: 'e2e', priority: 'P0' },
      { id: 'TS-005-2', scenario: 'CSV format is valid', test_type: 'unit', priority: 'P0' },
      { id: 'TS-005-3', scenario: 'Special characters are escaped correctly', test_type: 'unit', priority: 'P1' }
    ],
    implementation_context: JSON.stringify({
      files: ['src/utils/exportToCSV.ts'],
      dependencies: [],
      apis: [],
      patterns: ['File download pattern using Blob API']
    }),
    architecture_references: [],
    example_code_patterns: [
      {
        pattern: 'CSV export utility',
        code: `const exportToCSV = (data: any[], filename: string) => {
  const headers = Object.keys(data[0]).join(',');
  const rows = data.map(row => Object.values(row).join(','));
  const csv = [headers, ...rows].join('\\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
};`
      }
    ],
    testing_scenarios: [
      { input: 'Data with 100 rows', expected_output: 'CSV file with 101 lines (header + data)' }
    ],
    maps_to_requirement: 'FR-5'
  },
  {
    story_key: `${SD_ID}:US-006`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Export Analytics Report to PDF',
    user_role: 'Product Manager',
    user_want: 'export the analytics dashboard as a professionally formatted PDF report',
    user_benefit: 'I can create presentation-ready reports for executive stakeholders and offline review',
    story_points: 5,
    priority: 'medium',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-006-1',
        scenario: 'PDF export button is visible',
        given: 'User is on the Analytics Dashboard',
        when: 'User views the export options',
        then: 'A PDF export button is clearly visible alongside CSV export'
      },
      {
        id: 'AC-006-2',
        scenario: 'PDF includes charts as images',
        given: 'User clicks PDF export',
        when: 'PDF is generated',
        then: 'All charts from the dashboard are rendered as images in the PDF'
      },
      {
        id: 'AC-006-3',
        scenario: 'PDF includes summary statistics',
        given: 'PDF export completes',
        when: 'User opens the PDF',
        then: 'PDF contains a summary section with key metrics and statistics'
      },
      {
        id: 'AC-006-4',
        scenario: 'PDF has professional formatting',
        given: 'PDF is generated',
        when: 'User reviews the document',
        then: 'PDF has proper headers, pagination, and consistent styling'
      }
    ],
    definition_of_done: [
      'PDF export using jsPDF and html2canvas',
      'Charts rendered as images in PDF',
      'Summary statistics included',
      'Professional formatting with headers/footers',
      'Unit tests for PDF generation logic',
      'E2E test verifying PDF download works'
    ],
    technical_notes: 'Use jsPDF for PDF generation (already in package.json). Use html2canvas to capture chart elements as images before embedding in PDF.',
    implementation_approach: 'Create exportToPDF utility using jsPDF. Use html2canvas to capture chart DOM elements. Add export button to toolbar next to CSV.',
    test_scenarios: [
      { id: 'TS-006-1', scenario: 'PDF export button triggers download', test_type: 'e2e', priority: 'P0' },
      { id: 'TS-006-2', scenario: 'Charts are captured correctly', test_type: 'unit', priority: 'P1' },
      { id: 'TS-006-3', scenario: 'PDF structure is correct', test_type: 'unit', priority: 'P1' }
    ],
    implementation_context: JSON.stringify({
      files: ['src/utils/exportToPDF.ts'],
      dependencies: ['jspdf', 'html2canvas'],
      apis: [],
      patterns: ['PDF generation pattern', 'DOM-to-image capture']
    }),
    architecture_references: [],
    example_code_patterns: [
      {
        pattern: 'PDF export with chart capture',
        code: `import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const exportToPDF = async (elementId: string, filename: string) => {
  const element = document.getElementById(elementId);
  const canvas = await html2canvas(element!);
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF('p', 'mm', 'a4');
  pdf.addImage(imgData, 'PNG', 10, 10, 190, 0);
  pdf.save(filename);
};`
      }
    ],
    testing_scenarios: [
      { input: 'Dashboard with 3 charts', expected_output: 'PDF with all 3 charts visible' }
    ],
    maps_to_requirement: 'FR-6'
  },
  {
    story_key: `${SD_ID}:US-007`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Refresh Dashboard Data Manually and Automatically',
    user_role: 'Product Manager',
    user_want: 'manually refresh the dashboard data and have it auto-refresh every 30 seconds when enabled',
    user_benefit: 'I can see the latest data without leaving the page and ensure I am always looking at current information',
    story_points: 2,
    priority: 'low',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-007-1',
        scenario: 'Manual refresh button works',
        given: 'User is on the Analytics Dashboard',
        when: 'User clicks the refresh button',
        then: 'Dashboard data reloads and shows updated information'
      },
      {
        id: 'AC-007-2',
        scenario: 'Auto-refresh can be toggled',
        given: 'User is on the dashboard',
        when: 'User toggles the auto-refresh switch',
        then: 'Auto-refresh is enabled/disabled accordingly'
      },
      {
        id: 'AC-007-3',
        scenario: 'Auto-refresh triggers at 30-second interval',
        given: 'Auto-refresh is enabled',
        when: '30 seconds elapse',
        then: 'Dashboard data automatically refreshes'
      }
    ],
    definition_of_done: [
      'Manual refresh button implemented',
      'Auto-refresh toggle switch',
      '30-second interval timer',
      'Visual indicator when refresh is in progress',
      'Unit tests for refresh timer logic',
      'E2E test verifying manual refresh works'
    ],
    technical_notes: 'Use React Query refetch capability for manual refresh. Use setInterval for auto-refresh with proper cleanup on unmount.',
    implementation_approach: 'Add refresh button and toggle to dashboard toolbar. Use useInterval hook for auto-refresh. Show loading indicator during refresh.',
    test_scenarios: [
      { id: 'TS-007-1', scenario: 'Manual refresh button triggers data reload', test_type: 'e2e', priority: 'P0' },
      { id: 'TS-007-2', scenario: 'Auto-refresh interval is correct', test_type: 'unit', priority: 'P1' },
      { id: 'TS-007-3', scenario: 'Auto-refresh cleanup on unmount', test_type: 'unit', priority: 'P1' }
    ],
    implementation_context: JSON.stringify({
      files: ['src/components/analytics/RefreshControl.tsx', 'src/hooks/useAutoRefresh.ts'],
      dependencies: [],
      apis: [],
      patterns: ['useInterval hook pattern', 'React Query refetch']
    }),
    architecture_references: [],
    example_code_patterns: [
      {
        pattern: 'Auto-refresh hook',
        code: `const useAutoRefresh = (callback: () => void, enabled: boolean, interval = 30000) => {
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(callback, interval);
    return () => clearInterval(id);
  }, [callback, enabled, interval]);
};`
      }
    ],
    testing_scenarios: [
      { input: 'Enable auto-refresh and wait 30s', expected_output: 'Data refreshes automatically' }
    ],
    maps_to_requirement: 'FR-7'
  }
];

async function main() {
  console.log('=== Generating User Stories for SD-2025-1013-EMU ===\n');

  // Check if stories already exist
  const { data: existingStories, error: checkError } = await supabase
    .from('user_stories')
    .select('story_key')
    .eq('sd_id', SD_ID);

  if (checkError) {
    console.error('Error checking existing stories:', checkError.message);
    process.exit(1);
  }

  if (existingStories && existingStories.length > 0) {
    console.log(`Found ${existingStories.length} existing stories for ${SD_ID}:`);
    existingStories.forEach(s => console.log(`  - ${s.story_key}`));
    console.log('\nDeleting existing stories to regenerate...');

    const { error: deleteError } = await supabase
      .from('user_stories')
      .delete()
      .eq('sd_id', SD_ID);

    if (deleteError) {
      console.error('Error deleting existing stories:', deleteError.message);
      process.exit(1);
    }
    console.log('Existing stories deleted.\n');
  }

  // Insert new stories
  const results = [];

  for (const story of userStories) {
    console.log(`Creating: ${story.story_key} - ${story.title}`);

    const { data, error } = await supabase
      .from('user_stories')
      .insert({
        story_key: story.story_key,
        prd_id: story.prd_id,
        sd_id: story.sd_id,
        title: story.title,
        user_role: story.user_role,
        user_want: story.user_want,
        user_benefit: story.user_benefit,
        story_points: story.story_points,
        priority: story.priority,
        status: story.status,
        acceptance_criteria: story.acceptance_criteria,
        definition_of_done: story.definition_of_done,
        technical_notes: story.technical_notes,
        implementation_approach: story.implementation_approach,
        test_scenarios: story.test_scenarios,
        implementation_context: story.implementation_context,
        architecture_references: story.architecture_references,
        example_code_patterns: story.example_code_patterns,
        testing_scenarios: story.testing_scenarios,
        created_by: 'PLAN Agent',
        validation_status: 'pending',
        e2e_test_status: 'not_created'
      })
      .select()
      .single();

    if (error) {
      console.error(`  ERROR: ${error.message}`);
      results.push({ story_key: story.story_key, success: false, error: error.message });
    } else {
      console.log(`  SUCCESS: Created with ID ${data.id}`);
      results.push({ story_key: story.story_key, success: true, id: data.id });
    }
  }

  // Print summary
  console.log('\n=== SUMMARY ===');
  console.log(`Total stories: ${userStories.length}`);
  console.log(`Successful: ${results.filter(r => r.success).length}`);
  console.log(`Failed: ${results.filter(r => !r.success).length}`);

  if (results.some(r => !r.success)) {
    console.log('\nFailed stories:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.story_key}: ${r.error}`);
    });
  }

  // Print story overview
  console.log('\n=== GENERATED USER STORIES ===\n');
  userStories.forEach((story, idx) => {
    const result = results[idx];
    const status = result.success ? '[OK]' : '[FAIL]';
    console.log(`${status} ${story.story_key}`);
    console.log(`    Title: As a ${story.user_role}, I want to ${story.user_want}`);
    console.log(`    Priority: ${story.priority.toUpperCase()} | Points: ${story.story_points}`);
    console.log(`    Maps to: ${story.maps_to_requirement}`);
    console.log(`    Acceptance Criteria: ${story.acceptance_criteria.length} scenarios`);
    console.log('');
  });

  // Update PRD with story count
  const { error: updateError } = await supabase
    .from('product_requirements_v2')
    .update({
      metadata: {
        user_stories_generated: true,
        user_story_count: results.filter(r => r.success).length,
        user_stories_generated_at: new Date().toISOString()
      }
    })
    .eq('id', PRD_ID);

  if (updateError) {
    console.log('Warning: Could not update PRD metadata:', updateError.message);
  }
}

main().catch(console.error);
