#!/usr/bin/env node
/**
 * STORIES SUB-AGENT: Generate User Stories for SD-E2E-ADMIN-UI-009
 * PRD: PRD-SD-E2E-ADMIN-UI-009 - E2E Admin Console Testing
 *
 * Creates user stories following INVEST criteria with:
 * - Clear Given/When/Then acceptance criteria
 * - Story points estimation
 * - Priority alignment with FR priority
 * - Rich implementation context (architecture references, test scenarios)
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'SD-E2E-ADMIN-UI-009';
const PRD_ID = 'PRD-SD-E2E-ADMIN-UI-009';

// User stories mapped to functional requirements
const userStories = [
  // FR-001: Admin Sidebar Navigation Tests
  {
    story_key: `${SD_ID}:US-001`,
    title: 'Admin Sidebar Navigation - All Routes Accessible',
    user_role: 'QA Engineer',
    user_want: 'verify all 10 admin sidebar routes are accessible and render correctly',
    user_benefit: 'ensure no broken navigation links and all admin features are reachable',
    acceptance_criteria: [
      'GIVEN an admin user is authenticated',
      'WHEN the user navigates to /admin',
      'THEN all 10 sidebar navigation links are visible (Dashboard, SDs, PRDs, Ventures, Backlog, Lab, UAT, PRs, Protocol, Settings)',
      'AND clicking each link navigates to the correct route without errors',
      'AND the active route is highlighted in the sidebar',
      'AND each page renders its main content component'
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/admin/admin-sidebar-navigation.spec.ts',
      'Test covers all 10 admin routes',
      'Test verifies active link highlighting',
      'Test passes in CI/CD pipeline',
      'Page object AdminSidebar.ts created for reusability'
    ],
    priority: 'critical',
    
    
    status: 'todo',
    validation_status: 'pending',
    e2e_test_status: 'not_created',
    implementation_context: {
      test_file: 'tests/e2e/admin/admin-sidebar-navigation.spec.ts',
      page_objects: ['AdminSidebar.ts'],
      routes_to_test: [
        '/admin',
        '/admin/directives',
        '/admin/prds',
        '/admin/ventures',
        '/admin/backlog',
        '/admin/directive-lab',
        '/admin/uat',
        '/admin/pr-reviews',
        '/admin/protocol',
        '/admin/settings'
      ],
      components_under_test: ['AdminLayout.tsx', 'AdminSidebar navigation items'],
      auth_requirement: 'Admin role required'
    },
    architecture_references: [
      'src/components/admin/AdminLayout.tsx - Sidebar navigation structure',
      'src/components/auth/AdminRoute.tsx - Authorization wrapper',
      'tests/e2e/fixtures/ - Admin auth fixtures from FOUNDATION-001'
    ],
    testing_scenarios: [
      {
        scenario: 'All sidebar links are visible and clickable',
        priority: 'P0',
        test_type: 'navigation'
      },
      {
        scenario: 'Active route is highlighted correctly',
        priority: 'P1',
        test_type: 'UI state'
      },
      {
        scenario: 'Non-admin user sees access denied',
        priority: 'P1',
        test_type: 'authorization'
      }
    ]
  },

  // FR-002: SD Manager CRUD Operations
  {
    story_key: `${SD_ID}:US-002`,
    title: 'SD Manager - List View and Filters',
    user_role: 'QA Engineer',
    user_want: 'verify SD Manager displays all SDs and filtering works correctly',
    user_benefit: 'ensure admins can find and view strategic directives efficiently',
    acceptance_criteria: [
      'GIVEN the admin user is on /admin/directives',
      'WHEN the page loads',
      'THEN the SD list displays all active strategic directives with key metadata (title, status, priority, progress)',
      'WHEN user selects a status filter (active, completed, archived)',
      'THEN the list displays only SDs matching that status',
      'WHEN user selects a priority filter (critical, high, medium, low)',
      'THEN the list displays only SDs matching that priority',
      'AND filters can be combined (status AND priority)',
      'AND the filter state persists across navigation'
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/admin/admin-sd-manager.spec.ts',
      'Test covers list view rendering',
      'Test covers status filter (all options)',
      'Test covers priority filter (all options)',
      'Test covers combined filters',
      'Page object SDManagerPage.ts created',
      'All tests pass in CI/CD'
    ],
    priority: 'critical',
    
    
    status: 'todo',
    validation_status: 'pending',
    e2e_test_status: 'not_created',
    implementation_context: {
      test_file: 'tests/e2e/admin/admin-sd-manager.spec.ts',
      page_objects: ['SDManagerPage.ts'],
      api_endpoints: ['/api/sd'],
      filters_to_test: ['status', 'priority', 'category'],
      components_under_test: ['SDManager.tsx', 'SDManagerPage.tsx']
    },
    architecture_references: [
      'src/components/admin/sd-manager/SDManager.tsx - List and filter UI',
      'src/services/adminApi.ts - SD API integration',
      'src/hooks/useSortingState.ts - Filter state management'
    ],
    testing_scenarios: [
      {
        scenario: 'SD list displays with correct data',
        priority: 'P0',
        test_type: 'data display',
        mock_data: 'strategic_directives_v2 table records'
      },
      {
        scenario: 'Status filter returns correct results',
        priority: 'P0',
        test_type: 'filtering'
      },
      {
        scenario: 'Priority filter returns correct results',
        priority: 'P0',
        test_type: 'filtering'
      },
      {
        scenario: 'Combined filters work correctly',
        priority: 'P1',
        test_type: 'filtering'
      },
      {
        scenario: 'Empty state when no SDs match filter',
        priority: 'P2',
        test_type: 'edge case'
      }
    ]
  },

  {
    story_key: `${SD_ID}:US-003`,
    title: 'SD Manager - Detail View Navigation',
    user_role: 'QA Engineer',
    user_want: 'verify clicking an SD navigates to detail view with complete metadata',
    user_benefit: 'ensure admins can view full SD information for decision-making',
    acceptance_criteria: [
      'GIVEN the admin user is viewing the SD list at /admin/directives',
      'WHEN user clicks on an SD row',
      'THEN user navigates to /admin/directives/:id',
      'AND the detail view displays the SD title, status, current_phase, priority, category',
      'AND the detail view displays objectives, deliverables, and metadata',
      'AND the "Back to List" link returns to /admin/directives',
      'AND browser back button works correctly'
    ],
    definition_of_done: [
      'Detail navigation test added to admin-sd-manager.spec.ts',
      'Test covers navigation from list to detail',
      'Test verifies all SD metadata fields are displayed',
      'Test covers back navigation',
      'All tests pass'
    ],
    priority: 'critical',
    
    
    status: 'todo',
    validation_status: 'pending',
    e2e_test_status: 'not_created',
    implementation_context: {
      test_file: 'tests/e2e/admin/admin-sd-manager.spec.ts',
      page_objects: ['SDManagerPage.ts', 'SDDetailPage.ts'],
      routes: ['/admin/directives', '/admin/directives/:id'],
      data_fields_to_verify: [
        'title',
        'status',
        'current_phase',
        'priority',
        'category',
        'objectives',
        'deliverables',
        'metadata'
      ]
    },
    architecture_references: [
      'URL routing: /admin/directives/:id',
      'SD detail component (to be identified in SDManager.tsx)',
      'strategic_directives_v2 table schema'
    ],
    testing_scenarios: [
      {
        scenario: 'Click SD row navigates to detail view',
        priority: 'P0',
        test_type: 'navigation'
      },
      {
        scenario: 'Detail view displays all SD fields',
        priority: 'P0',
        test_type: 'data display'
      },
      {
        scenario: 'Back navigation returns to list',
        priority: 'P1',
        test_type: 'navigation'
      }
    ]
  },

  // FR-003: PRD Manager CRUD Operations
  {
    story_key: `${SD_ID}:US-004`,
    title: 'PRD Manager - List View and Filters',
    user_role: 'QA Engineer',
    user_want: 'verify PRD Manager displays all PRDs and filtering by status and SD works',
    user_benefit: 'ensure admins can find product requirements efficiently',
    acceptance_criteria: [
      'GIVEN the admin user is on /admin/prds',
      'WHEN the page loads',
      'THEN the PRD list displays all PRDs with title, status, SD link, and progress',
      'WHEN user filters by status (planning, approved, in_progress, completed)',
      'THEN only PRDs matching that status are displayed',
      'WHEN user filters by SD ID',
      'THEN only PRDs for that SD are displayed',
      'AND clicking "Clear Filters" resets to full list'
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/admin/admin-prd-manager.spec.ts',
      'Test covers PRD list rendering',
      'Test covers status filter',
      'Test covers SD filter',
      'Page object PRDManagerPage.ts created',
      'All tests pass'
    ],
    priority: 'high',
    
    
    status: 'todo',
    validation_status: 'pending',
    e2e_test_status: 'not_created',
    implementation_context: {
      test_file: 'tests/e2e/admin/admin-prd-manager.spec.ts',
      page_objects: ['PRDManagerPage.ts'],
      api_endpoints: ['/api/prd'],
      filters_to_test: ['status', 'sd_id'],
      components_under_test: ['PRDManager.tsx', 'PRDManagerPage.tsx']
    },
    architecture_references: [
      'src/components/admin/prd-manager/PRDManager.tsx',
      'src/services/adminApi.ts - PRD API endpoints',
      'product_requirements_v2 table schema'
    ],
    testing_scenarios: [
      {
        scenario: 'PRD list displays with correct data',
        priority: 'P0',
        test_type: 'data display'
      },
      {
        scenario: 'Status filter works correctly',
        priority: 'P0',
        test_type: 'filtering'
      },
      {
        scenario: 'SD filter shows only related PRDs',
        priority: 'P0',
        test_type: 'filtering'
      },
      {
        scenario: 'Empty state when no PRDs match',
        priority: 'P2',
        test_type: 'edge case'
      }
    ]
  },

  {
    story_key: `${SD_ID}:US-005`,
    title: 'PRD Manager - Detail View',
    user_role: 'QA Engineer',
    user_want: 'verify PRD detail view displays all requirements sections',
    user_benefit: 'ensure admins can review PRD specifications in detail',
    acceptance_criteria: [
      'GIVEN the admin user is viewing the PRD list at /admin/prds',
      'WHEN user clicks on a PRD row',
      'THEN user navigates to /admin/prds/:id',
      'AND the detail view displays executive summary',
      'AND functional requirements are displayed with acceptance criteria',
      'AND technical requirements are displayed',
      'AND test scenarios are displayed',
      'AND back navigation returns to list'
    ],
    definition_of_done: [
      'PRD detail navigation test added to admin-prd-manager.spec.ts',
      'Test verifies all PRD sections are displayed',
      'Test covers functional requirements rendering',
      'Test covers back navigation',
      'All tests pass'
    ],
    priority: 'high',
    
    
    status: 'todo',
    validation_status: 'pending',
    e2e_test_status: 'not_created',
    implementation_context: {
      test_file: 'tests/e2e/admin/admin-prd-manager.spec.ts',
      page_objects: ['PRDManagerPage.ts', 'PRDDetailPage.ts'],
      routes: ['/admin/prds/:id'],
      prd_sections_to_verify: [
        'executive_summary',
        'functional_requirements',
        'technical_requirements',
        'test_scenarios',
        'acceptance_criteria'
      ]
    },
    architecture_references: [
      'PRD detail component in PRDManager.tsx',
      'product_requirements_v2 JSONB fields structure'
    ],
    testing_scenarios: [
      {
        scenario: 'PRD detail view renders all sections',
        priority: 'P0',
        test_type: 'data display'
      },
      {
        scenario: 'Functional requirements display correctly',
        priority: 'P0',
        test_type: 'data structure'
      }
    ]
  },

  // FR-004: Ventures Manager Operations
  {
    story_key: `${SD_ID}:US-006`,
    title: 'Ventures Manager - List View with Health Indicators',
    user_role: 'QA Engineer',
    user_want: 'verify Ventures Manager displays all ventures with health and progress',
    user_benefit: 'ensure admins can monitor venture health at a glance',
    acceptance_criteria: [
      'GIVEN the admin user is on /admin/ventures',
      'WHEN the page loads',
      'THEN all ventures are displayed in a list/grid',
      'AND each venture shows name, health indicator, and stage progress',
      'AND health indicators use color coding (green/yellow/red)',
      'AND stage progress shows current stage out of total stages',
      'AND action menu (three dots) is visible for each venture'
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/admin/admin-ventures-manager.spec.ts',
      'Test covers venture list rendering',
      'Test verifies health indicator display',
      'Test verifies stage progress display',
      'Page object VenturesManagerPage.ts created',
      'All tests pass'
    ],
    priority: 'high',
    
    
    status: 'todo',
    validation_status: 'pending',
    e2e_test_status: 'not_created',
    implementation_context: {
      test_file: 'tests/e2e/admin/admin-ventures-manager.spec.ts',
      page_objects: ['VenturesManagerPage.ts'],
      components_under_test: ['VenturesManager.tsx', 'VenturesManagerPage.tsx'],
      data_to_verify: [
        'venture name',
        'health indicator',
        'stage progress',
        'action menu'
      ]
    },
    architecture_references: [
      'src/components/admin/ventures-manager/VenturesManager.tsx',
      'ventures table schema (health, current_stage, total_stages)'
    ],
    testing_scenarios: [
      {
        scenario: 'Ventures list displays all ventures',
        priority: 'P0',
        test_type: 'data display'
      },
      {
        scenario: 'Health indicators use correct colors',
        priority: 'P1',
        test_type: 'UI validation'
      },
      {
        scenario: 'Stage progress shows correctly',
        priority: 'P1',
        test_type: 'data display'
      }
    ]
  },

  {
    story_key: `${SD_ID}:US-007`,
    title: 'Ventures Manager - Action Menu and Detail Navigation',
    user_role: 'QA Engineer',
    user_want: 'verify venture action menu options work and detail view is accessible',
    user_benefit: 'ensure admins can perform actions on ventures',
    acceptance_criteria: [
      'GIVEN the admin user is viewing a venture in /admin/ventures',
      'WHEN user clicks the action menu (three dots)',
      'THEN action menu displays options (View Details, Edit, Archive, etc.)',
      'WHEN user selects "View Details"',
      'THEN user navigates to venture detail view',
      'AND detail view shows complete venture information',
      'AND back navigation returns to ventures list'
    ],
    definition_of_done: [
      'Action menu test added to admin-ventures-manager.spec.ts',
      'Test verifies menu opens and displays options',
      'Test covers detail navigation',
      'All tests pass'
    ],
    priority: 'high',
    
    
    status: 'todo',
    validation_status: 'pending',
    e2e_test_status: 'not_created',
    implementation_context: {
      test_file: 'tests/e2e/admin/admin-ventures-manager.spec.ts',
      page_objects: ['VenturesManagerPage.ts'],
      action_menu_options: ['View Details', 'Edit', 'Archive'],
      routes: ['/admin/ventures', 'venture detail view route']
    },
    architecture_references: [
      'Action menu component in VenturesManager.tsx',
      'Venture detail route configuration'
    ],
    testing_scenarios: [
      {
        scenario: 'Action menu opens on click',
        priority: 'P0',
        test_type: 'interaction'
      },
      {
        scenario: 'View Details navigates correctly',
        priority: 'P0',
        test_type: 'navigation'
      }
    ]
  },

  // FR-005: Backlog Manager Operations
  {
    story_key: `${SD_ID}:US-008`,
    title: 'Backlog Manager - Item List with Story Points',
    user_role: 'QA Engineer',
    user_want: 'verify Backlog Manager displays all backlog items with story points',
    user_benefit: 'ensure admins can view and prioritize backlog items',
    acceptance_criteria: [
      'GIVEN the admin user is on /admin/backlog',
      'WHEN the page loads',
      'THEN all backlog items are displayed in a list',
      'AND each item shows title, story points, priority, and status',
      'AND items are sortable by story points',
      'AND items are sortable by priority',
      'AND dependency links are visible (if items have dependencies)'
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/admin/admin-backlog-manager.spec.ts',
      'Test covers backlog list rendering',
      'Test verifies story points display',
      'Test covers priority sorting',
      'Page object BacklogManagerPage.ts created',
      'All tests pass'
    ],
    priority: 'high',
    
    
    status: 'todo',
    validation_status: 'pending',
    e2e_test_status: 'not_created',
    implementation_context: {
      test_file: 'tests/e2e/admin/admin-backlog-manager.spec.ts',
      page_objects: ['BacklogManagerPage.ts'],
      components_under_test: ['BacklogManager.tsx', 'BacklogManagerPage.tsx'],
      sorting_options: ['story_points', 'priority', 'status']
    },
    architecture_references: [
      'src/components/admin/backlog-manager/BacklogManager.tsx',
      'backlog items table/data structure'
    ],
    testing_scenarios: [
      {
        scenario: 'Backlog list displays all items',
        priority: 'P0',
        test_type: 'data display'
      },
      {
        scenario: 'Story points are displayed correctly',
        priority: 'P0',
        test_type: 'data display'
      },
      {
        scenario: 'Sorting by priority works',
        priority: 'P1',
        test_type: 'sorting'
      },
      {
        scenario: 'Dependency links are visible',
        priority: 'P2',
        test_type: 'data display'
      }
    ]
  },

  {
    story_key: `${SD_ID}:US-009`,
    title: 'Backlog Manager - Sprint Filter',
    user_role: 'QA Engineer',
    user_want: 'verify filtering backlog items by sprint status works correctly',
    user_benefit: 'ensure admins can view items for specific sprints',
    acceptance_criteria: [
      'GIVEN the admin user is on /admin/backlog',
      'WHEN user selects sprint filter (Current Sprint, Next Sprint, Backlog)',
      'THEN only items matching that sprint status are displayed',
      'AND the filter state is reflected in the URL or UI',
      'AND "Clear Filter" resets to show all items'
    ],
    definition_of_done: [
      'Sprint filter test added to admin-backlog-manager.spec.ts',
      'Test covers all sprint filter options',
      'Test verifies filtered results',
      'All tests pass'
    ],
    priority: 'high',
    
    
    status: 'todo',
    validation_status: 'pending',
    e2e_test_status: 'not_created',
    implementation_context: {
      test_file: 'tests/e2e/admin/admin-backlog-manager.spec.ts',
      page_objects: ['BacklogManagerPage.ts'],
      sprint_filter_options: ['Current Sprint', 'Next Sprint', 'Backlog', 'All']
    },
    architecture_references: [
      'Sprint filter component in BacklogManager.tsx',
      'Sprint status field in backlog data model'
    ],
    testing_scenarios: [
      {
        scenario: 'Current Sprint filter shows correct items',
        priority: 'P0',
        test_type: 'filtering'
      },
      {
        scenario: 'Clear filter resets to all items',
        priority: 'P1',
        test_type: 'filtering'
      }
    ]
  },

  // FR-006: Directive Lab Workflow
  {
    story_key: `${SD_ID}:US-010`,
    title: 'Directive Lab - Wizard Page Load and Navigation',
    user_role: 'QA Engineer',
    user_want: 'verify Directive Lab wizard loads and steps are navigable',
    user_benefit: 'ensure admins can create SDs using the wizard interface',
    acceptance_criteria: [
      'GIVEN the admin user navigates to /admin/directive-lab',
      'WHEN the page loads',
      'THEN the SD creation wizard is displayed',
      'AND wizard shows step indicators (Step 1/N)',
      'AND "Next" button is visible',
      'WHEN user clicks "Next"',
      'THEN wizard advances to next step',
      'AND "Previous" button becomes visible',
      'AND clicking "Previous" returns to previous step'
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/admin/admin-directive-lab.spec.ts',
      'Test covers wizard page load',
      'Test covers step navigation (Next/Previous)',
      'Page object DirectiveLabPage.ts created',
      'All tests pass'
    ],
    priority: 'medium',
    
    
    status: 'todo',
    validation_status: 'pending',
    e2e_test_status: 'not_created',
    implementation_context: {
      test_file: 'tests/e2e/admin/admin-directive-lab.spec.ts',
      page_objects: ['DirectiveLabPage.ts'],
      components_under_test: ['DirectiveLab.tsx', 'DirectiveLabPage.tsx'],
      wizard_steps: ['to be determined from component']
    },
    architecture_references: [
      'src/components/admin/directive-lab/DirectiveLab.tsx',
      'Wizard step management pattern'
    ],
    testing_scenarios: [
      {
        scenario: 'Wizard loads with step 1',
        priority: 'P0',
        test_type: 'page load'
      },
      {
        scenario: 'Next button advances to step 2',
        priority: 'P0',
        test_type: 'navigation'
      },
      {
        scenario: 'Previous button returns to step 1',
        priority: 'P1',
        test_type: 'navigation'
      }
    ]
  },

  {
    story_key: `${SD_ID}:US-011`,
    title: 'Directive Lab - Form Validation',
    user_role: 'QA Engineer',
    user_want: 'verify wizard form validation works correctly',
    user_benefit: 'ensure incomplete or invalid SD data is caught before submission',
    acceptance_criteria: [
      'GIVEN the admin user is on a wizard step with required fields',
      'WHEN user tries to proceed without filling required fields',
      'THEN validation error messages are displayed',
      'AND "Next" button is disabled or shows error',
      'WHEN user fills required fields correctly',
      'THEN validation errors clear',
      'AND "Next" button becomes enabled'
    ],
    definition_of_done: [
      'Form validation test added to admin-directive-lab.spec.ts',
      'Test covers required field validation',
      'Test covers error message display',
      'Test covers validation clearing on correct input',
      'All tests pass'
    ],
    priority: 'medium',
    
    
    status: 'todo',
    validation_status: 'pending',
    e2e_test_status: 'not_created',
    implementation_context: {
      test_file: 'tests/e2e/admin/admin-directive-lab.spec.ts',
      page_objects: ['DirectiveLabPage.ts'],
      validation_rules: ['required fields', 'field format validation']
    },
    architecture_references: [
      'Form validation logic in DirectiveLab.tsx',
      'react-hook-form or validation library used'
    ],
    testing_scenarios: [
      {
        scenario: 'Required field validation shows error',
        priority: 'P0',
        test_type: 'form validation'
      },
      {
        scenario: 'Valid input clears error',
        priority: 'P0',
        test_type: 'form validation'
      }
    ]
  },

  {
    story_key: `${SD_ID}:US-012`,
    title: 'Directive Lab - Preview Output',
    user_role: 'QA Engineer',
    user_want: 'verify wizard shows preview of SD before submission',
    user_benefit: 'ensure admins can review SD data before creating it',
    acceptance_criteria: [
      'GIVEN the admin user has completed all wizard steps',
      'WHEN user reaches the final "Preview" step',
      'THEN all entered SD data is displayed for review',
      'AND preview shows title, objectives, deliverables, metadata',
      'AND "Submit" button is visible',
      'AND "Edit" links allow returning to previous steps'
    ],
    definition_of_done: [
      'Preview test added to admin-directive-lab.spec.ts',
      'Test verifies preview displays all SD fields',
      'Test covers edit navigation',
      'All tests pass'
    ],
    priority: 'medium',
    
    
    status: 'todo',
    validation_status: 'pending',
    e2e_test_status: 'not_created',
    implementation_context: {
      test_file: 'tests/e2e/admin/admin-directive-lab.spec.ts',
      page_objects: ['DirectiveLabPage.ts'],
      preview_fields: ['title', 'objectives', 'deliverables', 'metadata']
    },
    architecture_references: [
      'Preview component in DirectiveLab.tsx',
      'SD data aggregation from wizard steps'
    ],
    testing_scenarios: [
      {
        scenario: 'Preview shows all entered data',
        priority: 'P0',
        test_type: 'data display'
      },
      {
        scenario: 'Edit link returns to correct step',
        priority: 'P1',
        test_type: 'navigation'
      }
    ]
  },

  // FR-007: UAT Dashboard Display
  {
    story_key: `${SD_ID}:US-013`,
    title: 'UAT Dashboard - Metrics Display',
    user_role: 'QA Engineer',
    user_want: 'verify UAT Dashboard displays test metrics correctly',
    user_benefit: 'ensure admins can see UAT test coverage and pass rates',
    acceptance_criteria: [
      'GIVEN the admin user navigates to /admin/uat',
      'WHEN the page loads',
      'THEN UAT metrics are displayed (total tests, pass rate, fail rate)',
      'AND metrics are displayed as KPI cards or charts',
      'AND metrics update based on latest test results',
      'AND "Last Updated" timestamp is shown'
    ],
    definition_of_done: [
      'E2E test file created: tests/e2e/admin/admin-uat-dashboard.spec.ts',
      'Test covers UAT metrics display',
      'Test verifies KPI card rendering',
      'Page object UATDashboardPage.ts created',
      'All tests pass'
    ],
    priority: 'medium',
    
    
    status: 'todo',
    validation_status: 'pending',
    e2e_test_status: 'not_created',
    implementation_context: {
      test_file: 'tests/e2e/admin/admin-uat-dashboard.spec.ts',
      page_objects: ['UATDashboardPage.ts'],
      components_under_test: ['UATDashboard.tsx', 'UATDashboardPage.tsx'],
      metrics_to_verify: ['total_tests', 'pass_rate', 'fail_rate', 'last_updated']
    },
    architecture_references: [
      'src/components/admin/uat-dashboard/UATDashboard.tsx',
      'UAT test results data source/API'
    ],
    testing_scenarios: [
      {
        scenario: 'UAT metrics display correctly',
        priority: 'P0',
        test_type: 'data display'
      },
      {
        scenario: 'KPI cards render with values',
        priority: 'P0',
        test_type: 'UI validation'
      }
    ]
  },

  {
    story_key: `${SD_ID}:US-014`,
    title: 'UAT Dashboard - Test Case List',
    user_role: 'QA Engineer',
    user_want: 'verify UAT Dashboard displays test case list with pass/fail status',
    user_benefit: 'ensure admins can see which test cases passed or failed',
    acceptance_criteria: [
      'GIVEN the admin user is on /admin/uat',
      'WHEN the page loads',
      'THEN test case list is displayed below metrics',
      'AND each test case shows name, status (pass/fail), and last run time',
      'AND pass status is indicated with green icon/color',
      'AND fail status is indicated with red icon/color',
      'AND clicking a test case navigates to detail view'
    ],
    definition_of_done: [
      'Test case list test added to admin-uat-dashboard.spec.ts',
      'Test verifies test case list rendering',
      'Test verifies status indicators (pass/fail)',
      'Test covers detail navigation',
      'All tests pass'
    ],
    priority: 'medium',
    
    
    status: 'todo',
    validation_status: 'pending',
    e2e_test_status: 'not_created',
    implementation_context: {
      test_file: 'tests/e2e/admin/admin-uat-dashboard.spec.ts',
      page_objects: ['UATDashboardPage.ts'],
      test_case_fields: ['name', 'status', 'last_run', 'result']
    },
    architecture_references: [
      'Test case list component in UATDashboard.tsx',
      'UAT test case data model'
    ],
    testing_scenarios: [
      {
        scenario: 'Test case list displays all cases',
        priority: 'P0',
        test_type: 'data display'
      },
      {
        scenario: 'Pass/fail status shows correct colors',
        priority: 'P1',
        test_type: 'UI validation'
      },
      {
        scenario: 'Click test case navigates to detail',
        priority: 'P1',
        test_type: 'navigation'
      }
    ]
  },

  {
    story_key: `${SD_ID}:US-015`,
    title: 'UAT Dashboard - Test Status Filter',
    user_role: 'QA Engineer',
    user_want: 'verify filtering test cases by status (pass/fail/all) works',
    user_benefit: 'ensure admins can focus on failed tests that need attention',
    acceptance_criteria: [
      'GIVEN the admin user is viewing the test case list',
      'WHEN user selects "Failed Tests" filter',
      'THEN only failed test cases are displayed',
      'WHEN user selects "Passed Tests" filter',
      'THEN only passed test cases are displayed',
      'WHEN user selects "All Tests" filter',
      'THEN all test cases are displayed'
    ],
    definition_of_done: [
      'Status filter test added to admin-uat-dashboard.spec.ts',
      'Test covers all filter options (pass, fail, all)',
      'Test verifies filtered results',
      'All tests pass'
    ],
    priority: 'medium',
    
    
    status: 'todo',
    validation_status: 'pending',
    e2e_test_status: 'not_created',
    implementation_context: {
      test_file: 'tests/e2e/admin/admin-uat-dashboard.spec.ts',
      page_objects: ['UATDashboardPage.ts'],
      filter_options: ['Passed', 'Failed', 'All']
    },
    architecture_references: [
      'Filter component in UATDashboard.tsx'
    ],
    testing_scenarios: [
      {
        scenario: 'Failed filter shows only failed tests',
        priority: 'P0',
        test_type: 'filtering'
      },
      {
        scenario: 'Passed filter shows only passed tests',
        priority: 'P0',
        test_type: 'filtering'
      },
      {
        scenario: 'All filter shows all tests',
        priority: 'P1',
        test_type: 'filtering'
      }
    ]
  },

  // Additional user stories for comprehensive coverage
  {
    story_key: `${SD_ID}:US-016`,
    title: 'Admin Authorization - Non-Admin Access Denied',
    user_role: 'QA Engineer',
    user_want: 'verify non-admin users cannot access admin routes',
    user_benefit: 'ensure admin functionality is protected from unauthorized access',
    acceptance_criteria: [
      'GIVEN a user is authenticated but NOT an admin',
      'WHEN user tries to access /admin or any admin route',
      'THEN user sees "Access Denied" message',
      'AND user is NOT able to view admin data',
      'AND user is redirected to home page or login',
      'AND no admin API calls are made'
    ],
    definition_of_done: [
      'Authorization test added to admin-sidebar-navigation.spec.ts',
      'Test covers non-admin user access attempt',
      'Test verifies access denied message',
      'Test verifies no data exposure',
      'All tests pass'
    ],
    priority: 'critical',
    
    
    status: 'todo',
    validation_status: 'pending',
    e2e_test_status: 'not_created',
    implementation_context: {
      test_file: 'tests/e2e/admin/admin-sidebar-navigation.spec.ts',
      page_objects: ['AdminSidebar.ts'],
      auth_scenarios: ['non-admin user', 'unauthenticated user']
    },
    architecture_references: [
      'src/components/auth/AdminRoute.tsx - Authorization logic',
      'Admin role check implementation'
    ],
    testing_scenarios: [
      {
        scenario: 'Non-admin user sees access denied',
        priority: 'P0',
        test_type: 'authorization'
      },
      {
        scenario: 'No admin data exposed to non-admin',
        priority: 'P0',
        test_type: 'security'
      }
    ]
  },

  {
    story_key: `${SD_ID}:US-017`,
    title: 'Page Objects - Reusable Admin Components',
    user_role: 'QA Engineer',
    user_want: 'create reusable page objects for all admin modules',
    user_benefit: 'ensure tests are maintainable and DRY (Don\'t Repeat Yourself)',
    acceptance_criteria: [
      'GIVEN E2E tests need to interact with admin components',
      'WHEN tests are written',
      'THEN each admin module has a corresponding page object class',
      'AND page objects encapsulate selectors and actions',
      'AND page objects are reusable across multiple test files',
      'AND page objects follow naming convention (e.g., SDManagerPage.ts)'
    ],
    definition_of_done: [
      'Page object files created in tests/e2e/page-objects/admin/',
      'AdminSidebar.ts created',
      'SDManagerPage.ts created',
      'PRDManagerPage.ts created',
      'VenturesManagerPage.ts created',
      'BacklogManagerPage.ts created',
      'DirectiveLabPage.ts created',
      'UATDashboardPage.ts created',
      'All page objects documented with JSDoc comments'
    ],
    priority: 'high',
    
    
    status: 'todo',
    validation_status: 'pending',
    e2e_test_status: 'not_created',
    implementation_context: {
      page_objects_directory: 'tests/e2e/page-objects/admin/',
      page_objects_to_create: [
        'AdminSidebar.ts',
        'SDManagerPage.ts',
        'PRDManagerPage.ts',
        'VenturesManagerPage.ts',
        'BacklogManagerPage.ts',
        'DirectiveLabPage.ts',
        'UATDashboardPage.ts'
      ],
      pattern: 'Page Object Pattern with encapsulated selectors and actions'
    },
    architecture_references: [
      'Page Object Pattern best practices',
      'Existing page objects from FOUNDATION-001 (if any)'
    ],
    testing_scenarios: [
      {
        scenario: 'Page objects encapsulate selectors',
        priority: 'P0',
        test_type: 'code quality'
      },
      {
        scenario: 'Page objects are reusable',
        priority: 'P0',
        test_type: 'maintainability'
      }
    ]
  }
];

async function generateUserStories() {
  console.log('\n=== STORIES SUB-AGENT: SD-E2E-ADMIN-UI-009 ===\n');
  console.log(`Generating ${userStories.length} user stories for E2E Admin Console Testing\n`);

  let created = 0;
  let failed = 0;

  for (const story of userStories) {
    const userStory = {
      id: randomUUID(),
      sd_id: SD_ID,
      prd_id: PRD_ID,
      ...story,
      created_at: new Date().toISOString(),
      created_by: 'STORIES',
      updated_at: new Date().toISOString(),
      updated_by: 'STORIES'
    };

    const { data, error } = await supabase
      .from('user_stories')
      .insert(userStory)
      .select()
      .single();

    if (error) {
      console.log(`❌ Failed to create ${story.story_key}: ${error.message}`);
      failed++;
    } else {
      console.log(`✅ Created ${story.story_key}: ${story.title}`);
      console.log(`   Priority: ${story.priority} | Story Points: ${story.story_points} | Complexity: ${story.complexity}`);
      created++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ USER STORY GENERATION COMPLETE\n');
  console.log(`   Total Stories: ${userStories.length}`);
  console.log(`   Created: ${created}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Success Rate: ${Math.round((created / userStories.length) * 100)}%`);

  // Summary by priority
  const criticalCount = userStories.filter(s => s.priority === 'critical').length;
  const highCount = userStories.filter(s => s.priority === 'high').length;
  const mediumCount = userStories.filter(s => s.priority === 'medium').length;

  console.log('\n📊 STORIES BY PRIORITY:');
  console.log(`   Critical: ${criticalCount} stories`);
  console.log(`   High: ${highCount} stories`);
  console.log(`   Medium: ${mediumCount} stories`);

  // Summary by FR
  console.log('\n📋 STORIES BY FUNCTIONAL REQUIREMENT:');
  console.log('   FR-001 (Sidebar Navigation): US-001, US-016');
  console.log('   FR-002 (SD Manager): US-002, US-003');
  console.log('   FR-003 (PRD Manager): US-004, US-005');
  console.log('   FR-004 (Ventures Manager): US-006, US-007');
  console.log('   FR-005 (Backlog Manager): US-008, US-009');
  console.log('   FR-006 (Directive Lab): US-010, US-011, US-012');
  console.log('   FR-007 (UAT Dashboard): US-013, US-014, US-015');
  console.log('   Infrastructure: US-017 (Page Objects)');

  console.log('\n🎯 TOTAL STORY POINTS: ' + userStories.reduce((sum, s) => sum + s.story_points, 0));

  console.log('\n✅ All user stories stored in database (user_stories table)');
  console.log('✅ Linked to SD-E2E-ADMIN-UI-009 and PRD-SD-E2E-ADMIN-UI-009');
}

generateUserStories().catch(console.error);
