#!/usr/bin/env node

/**
 * Generate Comprehensive PRD for SD-UAT-001
 * Creates a detailed PRD with 50+ user stories for deep and broad UAT testing
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Comprehensive user stories covering all test layers
const generateUserStories = () => {
  const stories = [];
  let storyId = 1;

  // Authentication & Authorization Testing (8 stories)
  const authStories = [
    {
      module: 'Authentication',
      title: 'Login with valid credentials',
      description: 'User should be able to login with correct username and password',
      acceptance_criteria: [
        'Login form is accessible at /login',
        'Valid credentials grant access to dashboard',
        'Session token is properly stored',
        'User is redirected to intended page after login'
      ],
      test_types: ['functional', 'security'],
      priority: 'CRITICAL'
    },
    {
      module: 'Authentication',
      title: 'Login with invalid credentials',
      description: 'System should reject invalid login attempts',
      acceptance_criteria: [
        'Error message displays for wrong credentials',
        'Account lockout after 5 failed attempts',
        'Lockout duration is 15 minutes',
        'Error messages do not reveal user existence'
      ],
      test_types: ['functional', 'security'],
      priority: 'CRITICAL'
    },
    {
      module: 'Authentication',
      title: 'Password reset flow',
      description: 'User can reset forgotten password',
      acceptance_criteria: [
        'Reset link sent to registered email',
        'Token expires after 1 hour',
        'Password complexity requirements enforced',
        'Old password no longer works after reset'
      ],
      test_types: ['functional', 'security'],
      priority: 'HIGH'
    },
    {
      module: 'Authentication',
      title: 'Session timeout',
      description: 'Inactive sessions should expire',
      acceptance_criteria: [
        'Session expires after 30 minutes of inactivity',
        'Warning shown 5 minutes before expiry',
        'User can extend session',
        'Expired session redirects to login'
      ],
      test_types: ['functional', 'security'],
      priority: 'HIGH'
    },
    {
      module: 'Authentication',
      title: 'Multi-factor authentication',
      description: 'Support for 2FA when enabled',
      acceptance_criteria: [
        '2FA code required after password',
        'Backup codes available',
        'Remember device option works',
        'Invalid codes are rejected'
      ],
      test_types: ['functional', 'security'],
      priority: 'HIGH'
    },
    {
      module: 'Authentication',
      title: 'OAuth integration',
      description: 'Login via third-party providers',
      acceptance_criteria: [
        'Google OAuth works correctly',
        'GitHub OAuth works correctly',
        'Profile data properly mapped',
        'Logout clears OAuth session'
      ],
      test_types: ['functional', 'integration'],
      priority: 'MEDIUM'
    },
    {
      module: 'Authentication',
      title: 'CSRF protection',
      description: 'Prevent cross-site request forgery',
      acceptance_criteria: [
        'CSRF tokens present in forms',
        'Requests without tokens rejected',
        'Tokens regenerated per session',
        'Double submit cookie implemented'
      ],
      test_types: ['security'],
      priority: 'CRITICAL'
    },
    {
      module: 'Authentication',
      title: 'XSS prevention',
      description: 'Prevent cross-site scripting attacks',
      acceptance_criteria: [
        'Input sanitization works',
        'Output encoding implemented',
        'CSP headers configured',
        'Script injection attempts blocked'
      ],
      test_types: ['security'],
      priority: 'CRITICAL'
    }
  ];

  // Dashboard Testing (10 stories)
  const dashboardStories = [
    {
      module: 'Dashboard',
      title: 'Dashboard initial load',
      description: 'Dashboard loads with all widgets',
      acceptance_criteria: [
        'Page loads in under 3 seconds',
        'All widgets render correctly',
        'Data is current and accurate',
        'No console errors'
      ],
      test_types: ['functional', 'performance'],
      priority: 'CRITICAL'
    },
    {
      module: 'Dashboard',
      title: 'Widget interactions',
      description: 'All dashboard widgets are interactive',
      acceptance_criteria: [
        'Charts respond to hover',
        'Filters update data',
        'Drill-down navigation works',
        'Export functions work'
      ],
      test_types: ['functional', 'ui'],
      priority: 'HIGH'
    },
    {
      module: 'Dashboard',
      title: 'Real-time updates',
      description: 'Dashboard shows live data',
      acceptance_criteria: [
        'WebSocket connection established',
        'Updates appear within 2 seconds',
        'Connection recovery works',
        'Offline mode handles gracefully'
      ],
      test_types: ['functional', 'integration'],
      priority: 'HIGH'
    },
    {
      module: 'Dashboard',
      title: 'Responsive layout',
      description: 'Dashboard adapts to screen sizes',
      acceptance_criteria: [
        'Mobile layout at <768px',
        'Tablet layout at 768-1024px',
        'Desktop layout at >1024px',
        'Touch gestures work on mobile'
      ],
      test_types: ['ui', 'accessibility'],
      priority: 'HIGH'
    },
    {
      module: 'Dashboard',
      title: 'Dark mode support',
      description: 'Dashboard supports theme switching',
      acceptance_criteria: [
        'Toggle switches themes',
        'Charts adapt to theme',
        'Preference persists',
        'No contrast issues'
      ],
      test_types: ['ui', 'accessibility'],
      priority: 'MEDIUM'
    },
    {
      module: 'Dashboard',
      title: 'Widget customization',
      description: 'Users can customize dashboard layout',
      acceptance_criteria: [
        'Drag and drop works',
        'Resize handles function',
        'Layout saves properly',
        'Reset to default option'
      ],
      test_types: ['functional', 'ui'],
      priority: 'MEDIUM'
    },
    {
      module: 'Dashboard',
      title: 'Performance metrics',
      description: 'Dashboard shows performance KPIs',
      acceptance_criteria: [
        'Metrics calculate correctly',
        'Historical comparisons work',
        'Trends display properly',
        'Tooltips show details'
      ],
      test_types: ['functional', 'data'],
      priority: 'HIGH'
    },
    {
      module: 'Dashboard',
      title: 'Alert notifications',
      description: 'Dashboard displays system alerts',
      acceptance_criteria: [
        'Alerts appear in real-time',
        'Severity levels shown',
        'Dismissal works',
        'History accessible'
      ],
      test_types: ['functional', 'ui'],
      priority: 'HIGH'
    },
    {
      module: 'Dashboard',
      title: 'Data export',
      description: 'Export dashboard data',
      acceptance_criteria: [
        'CSV export works',
        'PDF export works',
        'Excel export works',
        'Data integrity maintained'
      ],
      test_types: ['functional', 'data'],
      priority: 'MEDIUM'
    },
    {
      module: 'Dashboard',
      title: 'Keyboard navigation',
      description: 'Dashboard fully keyboard accessible',
      acceptance_criteria: [
        'Tab order logical',
        'Focus indicators visible',
        'Shortcuts documented',
        'Screen reader compatible'
      ],
      test_types: ['accessibility'],
      priority: 'HIGH'
    }
  ];

  // Ventures Module Testing (12 stories)
  const ventureStories = [
    {
      module: 'Ventures',
      title: 'Venture list view',
      description: 'Display all ventures in list format',
      acceptance_criteria: [
        'Pagination works correctly',
        'Sorting by all columns',
        'Search filters data',
        'Bulk actions available'
      ],
      test_types: ['functional', 'ui'],
      priority: 'CRITICAL'
    },
    {
      module: 'Ventures',
      title: 'Create new venture',
      description: 'Add new venture to system',
      acceptance_criteria: [
        'Form validation works',
        'Required fields enforced',
        'Success message shown',
        'Venture appears in list'
      ],
      test_types: ['functional', 'data'],
      priority: 'CRITICAL'
    },
    {
      module: 'Ventures',
      title: 'Edit venture details',
      description: 'Modify existing venture information',
      acceptance_criteria: [
        'All fields editable',
        'Changes save properly',
        'Audit trail updated',
        'Optimistic UI updates'
      ],
      test_types: ['functional', 'data'],
      priority: 'HIGH'
    },
    {
      module: 'Ventures',
      title: 'Delete venture',
      description: 'Remove venture from system',
      acceptance_criteria: [
        'Confirmation dialog appears',
        'Soft delete implemented',
        'Related data handled',
        'Undo option available'
      ],
      test_types: ['functional', 'data'],
      priority: 'HIGH'
    },
    {
      module: 'Ventures',
      title: 'Venture status workflow',
      description: 'Manage venture lifecycle states',
      acceptance_criteria: [
        'Status transitions validated',
        'Permissions checked',
        'History tracked',
        'Notifications sent'
      ],
      test_types: ['functional', 'workflow'],
      priority: 'HIGH'
    },
    {
      module: 'Ventures',
      title: 'Venture documents',
      description: 'Manage venture documentation',
      acceptance_criteria: [
        'File upload works',
        'Preview available',
        'Download functions',
        'Version control active'
      ],
      test_types: ['functional', 'integration'],
      priority: 'MEDIUM'
    },
    {
      module: 'Ventures',
      title: 'Venture team management',
      description: 'Assign team members to ventures',
      acceptance_criteria: [
        'User search works',
        'Role assignment correct',
        'Permissions applied',
        'Notifications sent'
      ],
      test_types: ['functional', 'security'],
      priority: 'HIGH'
    },
    {
      module: 'Ventures',
      title: 'Venture analytics',
      description: 'View venture performance metrics',
      acceptance_criteria: [
        'Metrics calculate correctly',
        'Charts render properly',
        'Drill-down works',
        'Export available'
      ],
      test_types: ['functional', 'data'],
      priority: 'MEDIUM'
    },
    {
      module: 'Ventures',
      title: 'Venture timeline',
      description: 'Display venture activity timeline',
      acceptance_criteria: [
        'Events chronological',
        'Filtering works',
        'Details expandable',
        'Infinite scroll works'
      ],
      test_types: ['functional', 'ui'],
      priority: 'LOW'
    },
    {
      module: 'Ventures',
      title: 'Venture collaboration',
      description: 'Enable team collaboration features',
      acceptance_criteria: [
        'Comments system works',
        'Mentions notify users',
        'Real-time updates',
        'Markdown supported'
      ],
      test_types: ['functional', 'integration'],
      priority: 'MEDIUM'
    },
    {
      module: 'Ventures',
      title: 'Venture templates',
      description: 'Use templates for new ventures',
      acceptance_criteria: [
        'Template library accessible',
        'Preview available',
        'Customization works',
        'Save as template option'
      ],
      test_types: ['functional', 'ui'],
      priority: 'LOW'
    },
    {
      module: 'Ventures',
      title: 'Venture search',
      description: 'Advanced search capabilities',
      acceptance_criteria: [
        'Full-text search works',
        'Filters combinable',
        'Search history saved',
        'Results relevant'
      ],
      test_types: ['functional', 'performance'],
      priority: 'HIGH'
    }
  ];

  // Form Validation Testing (8 stories)
  const formStories = [
    {
      module: 'Forms',
      title: 'Required field validation',
      description: 'Enforce required fields in all forms',
      acceptance_criteria: [
        'Empty required fields show error',
        'Error messages clear',
        'Submit blocked until valid',
        'Asterisk marks required'
      ],
      test_types: ['functional', 'ui'],
      priority: 'CRITICAL'
    },
    {
      module: 'Forms',
      title: 'Email validation',
      description: 'Validate email format',
      acceptance_criteria: [
        'Invalid emails rejected',
        'Valid formats accepted',
        'Real-time validation',
        'Clear error messages'
      ],
      test_types: ['functional', 'data'],
      priority: 'HIGH'
    },
    {
      module: 'Forms',
      title: 'Number field validation',
      description: 'Validate numeric inputs',
      acceptance_criteria: [
        'Only numbers accepted',
        'Min/max values enforced',
        'Decimal places limited',
        'Format masks work'
      ],
      test_types: ['functional', 'data'],
      priority: 'HIGH'
    },
    {
      module: 'Forms',
      title: 'Date field validation',
      description: 'Validate date inputs',
      acceptance_criteria: [
        'Date picker works',
        'Format validated',
        'Range restrictions work',
        'Timezone handling correct'
      ],
      test_types: ['functional', 'data'],
      priority: 'MEDIUM'
    },
    {
      module: 'Forms',
      title: 'File upload validation',
      description: 'Validate file uploads',
      acceptance_criteria: [
        'File type restrictions work',
        'Size limits enforced',
        'Multiple files handled',
        'Progress indicator shown'
      ],
      test_types: ['functional', 'ui'],
      priority: 'HIGH'
    },
    {
      module: 'Forms',
      title: 'Cross-field validation',
      description: 'Validate related fields',
      acceptance_criteria: [
        'Conditional fields work',
        'Dependencies checked',
        'Date ranges validated',
        'Sum totals verified'
      ],
      test_types: ['functional', 'data'],
      priority: 'MEDIUM'
    },
    {
      module: 'Forms',
      title: 'Async validation',
      description: 'Server-side validation',
      acceptance_criteria: [
        'Uniqueness checks work',
        'Loading state shown',
        'Debouncing implemented',
        'Error handling works'
      ],
      test_types: ['functional', 'integration'],
      priority: 'HIGH'
    },
    {
      module: 'Forms',
      title: 'Form submission',
      description: 'Handle form submission',
      acceptance_criteria: [
        'Success message shown',
        'Error handling works',
        'Duplicate submission prevented',
        'Data persisted correctly'
      ],
      test_types: ['functional', 'data'],
      priority: 'CRITICAL'
    }
  ];

  // Performance Testing (6 stories)
  const performanceStories = [
    {
      module: 'Performance',
      title: 'Page load times',
      description: 'Ensure fast page loads',
      acceptance_criteria: [
        'Homepage loads <2 seconds',
        'Dashboard loads <3 seconds',
        'Forms load <1 second',
        'Images optimized'
      ],
      test_types: ['performance'],
      priority: 'HIGH'
    },
    {
      module: 'Performance',
      title: 'API response times',
      description: 'Fast API responses',
      acceptance_criteria: [
        'GET requests <200ms',
        'POST requests <500ms',
        'Batch operations <2s',
        'Pagination efficient'
      ],
      test_types: ['performance', 'api'],
      priority: 'HIGH'
    },
    {
      module: 'Performance',
      title: 'Memory usage',
      description: 'Prevent memory leaks',
      acceptance_criteria: [
        'No memory leaks detected',
        'Memory <200MB normal use',
        'Garbage collection works',
        'Long sessions stable'
      ],
      test_types: ['performance'],
      priority: 'MEDIUM'
    },
    {
      module: 'Performance',
      title: 'Concurrent users',
      description: 'Handle multiple users',
      acceptance_criteria: [
        'Supports 100 concurrent',
        'No race conditions',
        'Database locks managed',
        'Load balancing works'
      ],
      test_types: ['performance', 'load'],
      priority: 'HIGH'
    },
    {
      module: 'Performance',
      title: 'Large data sets',
      description: 'Handle large amounts of data',
      acceptance_criteria: [
        '10k records paginate well',
        'Virtual scrolling works',
        'Exports handle large data',
        'Search remains fast'
      ],
      test_types: ['performance', 'data'],
      priority: 'MEDIUM'
    },
    {
      module: 'Performance',
      title: 'Network resilience',
      description: 'Handle poor network conditions',
      acceptance_criteria: [
        'Offline mode works',
        'Retry logic implemented',
        'Timeout handling correct',
        'Progressive loading used'
      ],
      test_types: ['performance', 'integration'],
      priority: 'MEDIUM'
    }
  ];

  // Accessibility Testing (6 stories)
  const accessibilityStories = [
    {
      module: 'Accessibility',
      title: 'Screen reader support',
      description: 'Full screen reader compatibility',
      acceptance_criteria: [
        'All content readable',
        'ARIA labels present',
        'Landmarks defined',
        'Skip links work'
      ],
      test_types: ['accessibility'],
      priority: 'HIGH'
    },
    {
      module: 'Accessibility',
      title: 'Keyboard navigation',
      description: 'Complete keyboard control',
      acceptance_criteria: [
        'All interactive elements reachable',
        'Tab order logical',
        'Focus visible',
        'Shortcuts documented'
      ],
      test_types: ['accessibility'],
      priority: 'HIGH'
    },
    {
      module: 'Accessibility',
      title: 'Color contrast',
      description: 'WCAG AA compliance',
      acceptance_criteria: [
        'Text contrast 4.5:1',
        'Large text 3:1',
        'Focus indicators visible',
        'Error states clear'
      ],
      test_types: ['accessibility', 'ui'],
      priority: 'HIGH'
    },
    {
      module: 'Accessibility',
      title: 'Responsive text',
      description: 'Text scales properly',
      acceptance_criteria: [
        'Zoom to 200% works',
        'No horizontal scroll',
        'Text remains readable',
        'Layout maintains'
      ],
      test_types: ['accessibility', 'ui'],
      priority: 'MEDIUM'
    },
    {
      module: 'Accessibility',
      title: 'Form accessibility',
      description: 'Accessible form controls',
      acceptance_criteria: [
        'Labels associated',
        'Error messages linked',
        'Instructions clear',
        'Fieldsets used'
      ],
      test_types: ['accessibility'],
      priority: 'HIGH'
    },
    {
      module: 'Accessibility',
      title: 'Media accessibility',
      description: 'Accessible media content',
      acceptance_criteria: [
        'Alt text present',
        'Captions available',
        'Transcripts provided',
        'Audio descriptions'
      ],
      test_types: ['accessibility'],
      priority: 'MEDIUM'
    }
  ];

  // Error Handling Testing (4 stories)
  const errorStories = [
    {
      module: 'ErrorHandling',
      title: '404 page handling',
      description: 'Handle missing pages',
      acceptance_criteria: [
        'Custom 404 page shown',
        'Navigation available',
        'Search suggested',
        'Analytics tracked'
      ],
      test_types: ['functional', 'ui'],
      priority: 'HIGH'
    },
    {
      module: 'ErrorHandling',
      title: 'Network error handling',
      description: 'Handle network failures',
      acceptance_criteria: [
        'Error message shown',
        'Retry option available',
        'Offline mode activated',
        'Data not lost'
      ],
      test_types: ['functional', 'integration'],
      priority: 'HIGH'
    },
    {
      module: 'ErrorHandling',
      title: 'Validation error display',
      description: 'Show validation errors clearly',
      acceptance_criteria: [
        'Inline errors shown',
        'Summary available',
        'Focus on first error',
        'Clear instructions'
      ],
      test_types: ['functional', 'ui'],
      priority: 'HIGH'
    },
    {
      module: 'ErrorHandling',
      title: 'Server error handling',
      description: 'Handle 500 errors gracefully',
      acceptance_criteria: [
        'Friendly error page',
        'Error ID shown',
        'Support contact info',
        'Auto-recovery attempted'
      ],
      test_types: ['functional', 'integration'],
      priority: 'HIGH'
    }
  ];

  // Combine all stories
  const allStories = [
    ...authStories,
    ...dashboardStories,
    ...ventureStories,
    ...formStories,
    ...performanceStories,
    ...accessibilityStories,
    ...errorStories
  ];

  // Format stories with proper IDs
  return allStories.map((story, index) => ({
    id: `US-UAT-${String(index + 1).padStart(3, '0')}`,
    title: story.title,
    description: story.description,
    module: story.module,
    priority: story.priority,
    acceptance_criteria: story.acceptance_criteria,
    test_types: story.test_types,
    estimated_test_cases: story.acceptance_criteria.length * 2, // Multiple test cases per criterion
    automation_eligible: true
  }));
};

async function generatePRD() {
  console.log('Generating comprehensive PRD for SD-UAT-001...\n');

  const userStories = generateUserStories();

  // Calculate statistics
  const stats = {
    total_stories: userStories.length,
    critical: userStories.filter(s => s.priority === 'CRITICAL').length,
    high: userStories.filter(s => s.priority === 'HIGH').length,
    medium: userStories.filter(s => s.priority === 'MEDIUM').length,
    low: userStories.filter(s => s.priority === 'LOW').length,
    total_test_cases: userStories.reduce((sum, s) => sum + s.estimated_test_cases, 0),
    modules: [...new Set(userStories.map(s => s.module))].length
  };

  // PRD content structure
  const prdContent = {
    id: 'PRD-SD-UAT-001',
    sd_id: 'SD-UAT-001',
    title: 'Automated UAT Testing Framework - Product Requirements',
    version: '1.0',
    status: 'draft',

    executive_summary: `
      This PRD defines comprehensive automated User Acceptance Testing requirements for the EHG platform.
      The framework will provide deep and broad test coverage across ${stats.total_stories} user stories,
      resulting in approximately ${stats.total_test_cases} automated test cases.
    `,

    objectives: [
      'Achieve 95%+ automated test coverage across all UI components and user flows',
      'Implement multi-layer testing architecture covering functional, performance, security, and accessibility',
      'Enable continuous testing with every code commit',
      'Provide real-time test results and comprehensive reporting',
      'Automatically generate fix directives for failed tests'
    ],

    scope: {
      in_scope: [
        'All user-facing features and workflows',
        'API endpoint testing',
        'Cross-browser compatibility',
        'Performance benchmarking',
        'Security vulnerability scanning',
        'Accessibility compliance (WCAG 2.1 AA)',
        'Data integrity validation',
        'Error handling and edge cases'
      ],
      out_of_scope: [
        'Infrastructure testing',
        'Third-party service testing',
        'Manual exploratory testing',
        'Subjective UX evaluation'
      ]
    },

    user_stories: userStories,

    test_coverage_matrix: {
      by_priority: {
        critical: `${stats.critical} stories (${Math.round(stats.critical/stats.total_stories*100)}%)`,
        high: `${stats.high} stories (${Math.round(stats.high/stats.total_stories*100)}%)`,
        medium: `${stats.medium} stories (${Math.round(stats.medium/stats.total_stories*100)}%)`,
        low: `${stats.low} stories (${Math.round(stats.low/stats.total_stories*100)}%)`
      },
      by_module: userStories.reduce((acc, story) => {
        if (!acc[story.module]) {
          acc[story.module] = { count: 0, test_cases: 0 };
        }
        acc[story.module].count++;
        acc[story.module].test_cases += story.estimated_test_cases;
        return acc;
      }, {}),
      total_modules: stats.modules,
      total_stories: stats.total_stories,
      total_test_cases: stats.total_test_cases
    },

    technical_requirements: {
      testing_framework: 'Playwright + Vision QA Agent',
      browsers: ['Chrome', 'Firefox', 'Safari', 'Edge'],
      devices: ['Desktop', 'Tablet', 'Mobile'],
      environments: ['Development', 'Staging', 'Production'],
      parallel_execution: true,
      ci_cd_integration: 'GitHub Actions',
      reporting: 'Real-time dashboard + PDF/HTML reports',
      data_management: 'Supabase for test tracking and results'
    },

    acceptance_criteria: [
      'All user stories have automated tests',
      'Tests execute in under 30 minutes',
      'Pass rate maintains ≥85%',
      'Zero false positives',
      'Reports generated automatically',
      'Issues create fix directives',
      'Tests run on every commit'
    ],

    success_metrics: [
      'Test coverage: ≥95%',
      'Execution time: <30 minutes',
      'Pass rate: ≥85%',
      'Bug detection rate: 100% for critical paths',
      'Mean time to detection: <5 minutes',
      'False positive rate: <1%',
      'Test maintenance time: <10 hours/month'
    ],

    timeline: {
      phase_1: {
        name: 'Foundation Setup',
        duration: '1 week',
        deliverables: [
          'Database schema created',
          'Test framework configured',
          'CI/CD pipeline setup'
        ]
      },
      phase_2: {
        name: 'Test Generation',
        duration: '2 weeks',
        deliverables: [
          'Authentication tests (8 stories)',
          'Dashboard tests (10 stories)',
          'Core module tests'
        ]
      },
      phase_3: {
        name: 'Extended Coverage',
        duration: '2 weeks',
        deliverables: [
          'Ventures tests (12 stories)',
          'Form validation tests (8 stories)',
          'Performance tests (6 stories)'
        ]
      },
      phase_4: {
        name: 'Polish & Optimization',
        duration: '1 week',
        deliverables: [
          'Accessibility tests (6 stories)',
          'Error handling tests (4 stories)',
          'Test optimization and parallelization'
        ]
      }
    },

    metadata: {
      created_at: new Date().toISOString(),
      created_by: 'UAT Framework Generator',
      last_modified: new Date().toISOString(),
      total_pages_if_printed: Math.ceil(stats.total_stories * 2),
      estimated_total_effort_hours: stats.total_test_cases * 0.5 // 30 min per test case average
    }
  };

  try {
    // Check if PRD already exists
    const { data: existing } = await supabase
      .from('product_requirements_v2')
      .select('id')
      .eq('directive_id', 'SD-UAT-001')
      .single();

    if (existing) {
      console.log('⚠️  PRD already exists. Updating...');

      const { data, error } = await supabase
        .from('product_requirements_v2')
        .update({
          content: prdContent,
          updated_at: new Date().toISOString()
        })
        .eq('directive_id', 'SD-UAT-001')
        .select()
        .single();

      if (error) throw error;
      console.log('✅ PRD updated successfully!');
    } else {
      // Create new PRD with all required fields
      const { data, error } = await supabase
        .from('product_requirements_v2')
        .insert({
          id: crypto.randomUUID(),
          directive_id: 'SD-UAT-001',
          sd_id: 'SD-UAT-001',
          title: 'Automated UAT Testing Framework - Product Requirements',
          version: '1.0',
          status: 'draft',
          category: 'technical',
          priority: 'critical',
          executive_summary: prdContent.executive_summary,
          content: prdContent,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: 'system',
          phase: 'planning'
        })
        .select()
        .single();

      if (error) throw error;
      console.log('✅ PRD created successfully!');
    }

    // Display summary
    console.log('\n📊 PRD Summary:');
    console.log('=====================================');
    console.log(`Total User Stories: ${stats.total_stories}`);
    console.log(`Total Test Cases: ${stats.total_test_cases}`);
    console.log(`Modules Covered: ${stats.modules}`);
    console.log('\n📈 Priority Distribution:');
    console.log(`  CRITICAL: ${stats.critical} stories`);
    console.log(`  HIGH: ${stats.high} stories`);
    console.log(`  MEDIUM: ${stats.medium} stories`);
    console.log(`  LOW: ${stats.low} stories`);
    console.log('\n🎯 Module Coverage:');
    Object.entries(prdContent.test_coverage_matrix.by_module).forEach(([module, data]) => {
      console.log(`  ${module}: ${data.count} stories, ${data.test_cases} test cases`);
    });
    console.log('\n⏱️  Estimated Timeline: 6 weeks');
    console.log(`💪 Estimated Effort: ${Math.round(prdContent.metadata.estimated_total_effort_hours)} hours`);

    return prdContent;

  } catch (error) {
    console.error('❌ Error generating PRD:', error.message);
    throw error;
  }
}

// Run if executed directly
generatePRD()
  .then(() => {
    console.log('\n🚀 Next steps:');
    console.log('1. Create database schema: node scripts/create-uat-database-schema.js');
    console.log('2. Generate test suites: node scripts/generate-test-suites.js');
    console.log('3. Run UAT campaign: node scripts/run-uat-campaign.js');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

export { generatePRD };