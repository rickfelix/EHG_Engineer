/**
 * User Stories for Stage 21: QA & UAT
 * Part of SD-VISION-TRANSITION-001D6 (Stages 21-25: LAUNCH & LEARN)
 *
 * @module stage-21-stories
 */

export const stage21Stories = [
  {
    story_key: 'SD-VISION-TRANSITION-001D6:US-021001',
    title: 'QA Test Suite Management Interface',
    user_role: 'QA Engineer',
    user_want: 'create and manage test suites for venture validation',
    user_benefit: 'I can organize test cases by feature area and track testing progress systematically',
    story_points: 8,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: JSON.stringify([
      {
        id: 'AC-21-001-1',
        scenario: 'Happy path - Create test suite',
        given: 'QA Engineer is on the Test Management page AND venture is in QA stage',
        when: 'User clicks "Create Test Suite" AND enters suite name "User Authentication Tests" AND selects category "Security" AND clicks "Create"',
        then: 'Test suite is created in database AND suite appears in test suite list AND user sees success message'
      },
      {
        id: 'AC-21-001-2',
        scenario: 'Happy path - Add test cases to suite',
        given: 'Test suite exists AND user is viewing suite details',
        when: 'User clicks "Add Test Case" AND enters test name, steps, and expected result AND clicks "Save"',
        then: 'Test case is added to suite AND case appears in suite test list AND suite coverage updates'
      },
      {
        id: 'AC-21-001-3',
        scenario: 'Happy path - Execute test suite',
        given: 'Test suite has at least 3 test cases AND all required test data is available',
        when: 'User clicks "Run Test Suite" AND marks each test as pass/fail AND clicks "Complete Run"',
        then: 'Test results are recorded AND coverage metrics updated AND test execution timestamp recorded'
      },
      {
        id: 'AC-21-001-4',
        scenario: 'Error path - Create suite without name',
        given: 'User is on Create Test Suite form',
        when: 'User leaves suite name empty AND clicks "Create"',
        then: 'Form shows validation error "Suite name is required" AND suite NOT created'
      },
      {
        id: 'AC-21-001-5',
        scenario: 'Edge case - Test suite coverage calculation',
        given: 'Test suite has 10 test cases: 7 passed, 2 failed, 1 not run',
        when: 'User views suite details',
        then: 'Coverage shows 70% pass rate AND 20% fail rate AND 10% not run AND overall status "Incomplete"'
      }
    ]),
    definition_of_done: JSON.stringify([
      'UI components implemented and styled',
      'CRUD operations functional for test suites and test cases',
      'Real-time coverage calculation working',
      'E2E test US-D6-21-001 passing',
      'Code reviewed and merged'
    ]),
    implementation_context: 'Implement as new section in Venture detail view. Use existing venture_stage_work table to track test execution state. Test suite metadata stored in JSONB column. Follow pattern from ventures/UpdateFinancialsDialog.tsx for form handling.',
    architecture_references: JSON.stringify({
      similar_components: [
        'src/components/ventures/UpdateFinancialsDialog.tsx',
        'src/components/ventures/CreateVentureDialog.tsx'
      ],
      patterns_to_follow: [
        'Dialog pattern (shadcn/ui)',
        'Form validation (react-hook-form + zod)',
        'Supabase mutation pattern with optimistic updates'
      ],
      integration_points: [
        'src/lib/supabase.ts - Database client',
        'src/hooks/useVentures.ts - Data fetching',
        'venture_stage_work table - Test suite storage'
      ]
    }),
    example_code_patterns: JSON.stringify({
      database_insert: `
const { data, error } = await supabase
  .from('venture_stage_work')
  .insert({
    venture_id: ventureId,
    stage_number: 21,
    work_type: 'test_suite',
    work_data: {
      suite_name: 'User Authentication Tests',
      category: 'Security',
      test_cases: [],
      coverage: { pass: 0, fail: 0, not_run: 0 }
    }
  })
  .select()
  .single();
      `,
      form_validation: `
const testSuiteSchema = z.object({
  suite_name: z.string().min(3, 'Suite name must be at least 3 characters'),
  category: z.enum(['Security', 'Functionality', 'Performance', 'Integration']),
  test_cases: z.array(z.object({
    name: z.string(),
    steps: z.string(),
    expected_result: z.string()
  }))
});
      `
    }),
    testing_scenarios: JSON.stringify({
      e2e_test_location: 'tests/e2e/ventures/US-D6-21-001-test-suite-management.spec.ts',
      test_cases: [
        { id: 'TC-21-001-1', scenario: 'Create and execute test suite', priority: 'P0' },
        { id: 'TC-21-001-2', scenario: 'Test coverage calculation', priority: 'P1' },
        { id: 'TC-21-001-3', scenario: 'Validation error handling', priority: 'P2' }
      ]
    })
  },
  {
    story_key: 'SD-VISION-TRANSITION-001D6:US-021002',
    title: 'UAT Report Generation and Signoff',
    user_role: 'Product Manager',
    user_want: 'generate a comprehensive UAT report with test results and get stakeholder signoff',
    user_benefit: 'I can formally document QA completion and obtain approval to proceed to deployment',
    story_points: 5,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: JSON.stringify([
      {
        id: 'AC-21-002-1',
        scenario: 'Happy path - Generate UAT report',
        given: 'Venture has completed all test suites AND test coverage >= 80%',
        when: 'User clicks "Generate UAT Report" on QA Dashboard',
        then: 'uat_report artifact generated in venture_artifacts AND report includes test coverage, pass/fail rates, bug counts AND report visible in artifact list'
      },
      {
        id: 'AC-21-002-2',
        scenario: 'Happy path - UAT signoff workflow',
        given: 'UAT report exists AND user has approval authority',
        when: 'User reviews report AND clicks "Approve UAT" AND enters signoff notes AND clicks "Submit"',
        then: 'Signoff recorded in venture_stage_work AND venture status updated to "Ready for Deployment" AND signoff timestamp recorded'
      },
      {
        id: 'AC-21-002-3',
        scenario: 'Error path - Generate report with insufficient coverage',
        given: 'Venture test coverage is 75% (below 80% threshold)',
        when: 'User attempts to generate UAT report',
        then: 'System shows error "Test coverage must be >= 80%" AND report NOT generated AND user sees coverage gap details'
      },
      {
        id: 'AC-21-002-4',
        scenario: 'Edge case - Report includes bug resolution tracking',
        given: 'Test suite found 5 bugs: 3 resolved, 2 pending',
        when: 'UAT report is generated',
        then: 'Report shows bug summary with resolution status AND pending bugs highlighted AND impact assessment included'
      }
    ]),
    definition_of_done: JSON.stringify([
      'UAT report generation implemented',
      'Artifact stored in venture_artifacts table',
      'Signoff workflow functional',
      'Coverage validation enforced (>= 80%)',
      'E2E test US-D6-21-002 passing'
    ]),
    implementation_context: 'Generate UAT report as artifact_type = "uat_report" in venture_artifacts table. Report should aggregate data from all test suites in venture_stage_work. Use PDF generation library (puppeteer or similar) for formatted report output. Follow artifact pattern from existing Stage 1-20 implementations.',
    architecture_references: JSON.stringify({
      similar_artifacts: [
        'business_plan artifact generation',
        'financial_model artifact generation'
      ],
      patterns_to_follow: [
        'Artifact generation pattern',
        'venture_artifacts table schema',
        'Approval workflow pattern'
      ],
      integration_points: [
        'venture_artifacts table',
        'venture_stage_work table (test suite data)',
        'PDF generation service'
      ]
    }),
    example_code_patterns: JSON.stringify({
      artifact_generation: `
const uatReport = {
  artifact_type: 'uat_report',
  venture_id: ventureId,
  content: {
    test_coverage: { unit: 85, integration: 90, e2e: 82 },
    test_suites: [...],
    bugs: { total: 12, resolved: 10, pending: 2 },
    recommendation: 'APPROVED'
  }
};

const { data, error } = await supabase
  .from('venture_artifacts')
  .insert(uatReport)
  .select()
  .single();
      `,
      coverage_validation: `
if (testCoverage < 80) {
  throw new Error(\`Test coverage (\${testCoverage}%) must be >= 80%\`);
}
      `
    }),
    testing_scenarios: JSON.stringify({
      e2e_test_location: 'tests/e2e/ventures/US-D6-21-002-uat-report-generation.spec.ts',
      test_cases: [
        { id: 'TC-21-002-1', scenario: 'Generate UAT report with sufficient coverage', priority: 'P0' },
        { id: 'TC-21-002-2', scenario: 'Block report generation with low coverage', priority: 'P0' },
        { id: 'TC-21-002-3', scenario: 'UAT signoff workflow', priority: 'P1' }
      ]
    })
  },
  {
    story_key: 'SD-VISION-TRANSITION-001D6:US-021003',
    title: 'Test Coverage Dashboard',
    user_role: 'QA Engineer',
    user_want: 'view real-time test coverage metrics by component, story, and API endpoint',
    user_benefit: 'I can identify coverage gaps and prioritize remaining test work',
    story_points: 5,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: JSON.stringify([
      {
        id: 'AC-21-003-1',
        scenario: 'Happy path - View coverage dashboard',
        given: 'Venture has test data AND user is on QA Dashboard',
        when: 'Dashboard loads',
        then: 'Component coverage chart displayed AND user story coverage table shown AND API endpoint coverage list visible AND coverage trends graph rendered'
      },
      {
        id: 'AC-21-003-2',
        scenario: 'Happy path - Coverage by component',
        given: 'Venture has 3 components: Auth (90% coverage), Dashboard (75% coverage), Reports (60% coverage)',
        when: 'User views component coverage section',
        then: 'Auth shown in green (>80%) AND Dashboard shown in yellow (70-80%) AND Reports shown in red (<70%) AND visual bar chart displays coverage'
      },
      {
        id: 'AC-21-003-3',
        scenario: 'Happy path - Coverage trends over time',
        given: 'Test coverage data exists for past 7 days',
        when: 'User views coverage trends graph',
        then: 'Line chart shows daily coverage progression AND trend direction indicated (improving/declining) AND current vs target line shown'
      },
      {
        id: 'AC-21-003-4',
        scenario: 'Edge case - No test data available',
        given: 'Venture has no test suites created',
        when: 'User views coverage dashboard',
        then: 'Dashboard shows "No test data available" message AND guidance to create first test suite AND dashboard structure visible but empty'
      }
    ]),
    definition_of_done: JSON.stringify([
      'Coverage dashboard UI implemented',
      'Real-time data updates working',
      'Coverage metrics calculated correctly',
      'Visual charts rendering properly',
      'E2E test US-D6-21-003 passing'
    ]),
    implementation_context: 'Build dashboard using recharts library for visualizations. Aggregate coverage data from venture_stage_work test suites. Calculate coverage percentages by component, user story, and API endpoint. Update in real-time using Supabase subscriptions.',
    architecture_references: JSON.stringify({
      similar_components: [
        'src/components/ventures/VentureMetrics.tsx',
        'Analytics dashboard patterns'
      ],
      patterns_to_follow: [
        'Recharts visualization library',
        'Real-time Supabase subscriptions',
        'Metric calculation patterns'
      ],
      integration_points: [
        'venture_stage_work table (test data)',
        'user_stories table (story coverage)',
        'Supabase realtime subscriptions'
      ]
    }),
    example_code_patterns: JSON.stringify({
      coverage_calculation: `
const calculateCoverage = (testSuites) => {
  const total = testSuites.reduce((acc, suite) =>
    acc + suite.test_cases.length, 0);
  const passed = testSuites.reduce((acc, suite) =>
    acc + suite.test_cases.filter(tc => tc.status === 'passed').length, 0);
  return (passed / total) * 100;
};
      `,
      realtime_subscription: `
const subscription = supabase
  .channel('test_coverage')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'venture_stage_work',
    filter: \`venture_id=eq.\${ventureId}\`
  }, handleCoverageUpdate)
  .subscribe();
      `
    }),
    testing_scenarios: JSON.stringify({
      e2e_test_location: 'tests/e2e/ventures/US-D6-21-003-coverage-dashboard.spec.ts',
      test_cases: [
        { id: 'TC-21-003-1', scenario: 'Dashboard loads with test data', priority: 'P0' },
        { id: 'TC-21-003-2', scenario: 'Coverage metrics accurate', priority: 'P0' },
        { id: 'TC-21-003-3', scenario: 'Real-time updates working', priority: 'P1' }
      ]
    })
  }
];
