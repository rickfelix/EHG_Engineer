/**
 * PRD Generation for UAT Testing Framework
 * Creates comprehensive PRD from user stories
 *
 * @module generate-prd
 */

import { createClient } from '@supabase/supabase-js';
import { authStories } from './auth-stories.js';
import { dashboardStories } from './dashboard-stories.js';
import { ventureStories } from './venture-stories.js';
import { formStories } from './form-stories.js';
import { performanceStories, accessibilityStories, errorStories } from './quality-stories.js';

/**
 * Generate all user stories with proper IDs
 * @returns {Array} Formatted user stories
 */
export function generateUserStories() {
  const allStories = [
    ...authStories,
    ...dashboardStories,
    ...ventureStories,
    ...formStories,
    ...performanceStories,
    ...accessibilityStories,
    ...errorStories
  ];

  return allStories.map((story, index) => ({
    id: `US-UAT-${String(index + 1).padStart(3, '0')}`,
    title: story.title,
    description: story.description,
    module: story.module,
    priority: story.priority,
    acceptance_criteria: story.acceptance_criteria,
    test_types: story.test_types,
    estimated_test_cases: story.acceptance_criteria.length * 2,
    automation_eligible: true
  }));
}

/**
 * Calculate statistics from user stories
 * @param {Array} userStories - Array of user stories
 * @returns {Object} Statistics object
 */
function calculateStats(userStories) {
  return {
    total_stories: userStories.length,
    critical: userStories.filter(s => s.priority === 'CRITICAL').length,
    high: userStories.filter(s => s.priority === 'HIGH').length,
    medium: userStories.filter(s => s.priority === 'MEDIUM').length,
    low: userStories.filter(s => s.priority === 'LOW').length,
    total_test_cases: userStories.reduce((sum, s) => sum + s.estimated_test_cases, 0),
    modules: [...new Set(userStories.map(s => s.module))].length
  };
}

/**
 * Build PRD content from user stories and stats
 * @param {Array} userStories - Array of user stories
 * @param {Object} stats - Statistics object
 * @returns {Object} PRD content
 */
function buildPRDContent(userStories, stats) {
  return {
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
      'Pass rate maintains >=85%',
      'Zero false positives',
      'Reports generated automatically',
      'Issues create fix directives',
      'Tests run on every commit'
    ],

    success_metrics: [
      'Test coverage: >=95%',
      'Execution time: <30 minutes',
      'Pass rate: >=85%',
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
      estimated_total_effort_hours: stats.total_test_cases * 0.5
    }
  };
}

/**
 * Generate comprehensive PRD for SD-UAT-001
 * @returns {Promise<Object>} PRD content
 */
export async function generatePRD() {
  console.log('Generating comprehensive PRD for SD-UAT-001...\n');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const userStories = generateUserStories();
  const stats = calculateStats(userStories);
  const prdContent = buildPRDContent(userStories, stats);

  try {
    const { data: existing } = await supabase
      .from('product_requirements_v2')
      .select('id')
      .eq('directive_id', 'SD-UAT-001')
      .single();

    if (existing) {
      console.log('Warning: PRD already exists. Updating...');

      const { error } = await supabase
        .from('product_requirements_v2')
        .update({
          content: prdContent,
          updated_at: new Date().toISOString()
        })
        .eq('directive_id', 'SD-UAT-001')
        .select()
        .single();

      if (error) throw error;
      console.log('PRD updated successfully!');
    } else {
      const { error } = await supabase
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
      console.log('PRD created successfully!');
    }

    printSummary(stats, prdContent);
    return prdContent;

  } catch (error) {
    console.error('Error generating PRD:', error.message);
    throw error;
  }
}

/**
 * Print PRD generation summary
 */
function printSummary(stats, prdContent) {
  console.log('\nPRD Summary:');
  console.log('=====================================');
  console.log(`Total User Stories: ${stats.total_stories}`);
  console.log(`Total Test Cases: ${stats.total_test_cases}`);
  console.log(`Modules Covered: ${stats.modules}`);
  console.log('\nPriority Distribution:');
  console.log(`  CRITICAL: ${stats.critical} stories`);
  console.log(`  HIGH: ${stats.high} stories`);
  console.log(`  MEDIUM: ${stats.medium} stories`);
  console.log(`  LOW: ${stats.low} stories`);
  console.log('\nModule Coverage:');
  Object.entries(prdContent.test_coverage_matrix.by_module).forEach(([module, data]) => {
    console.log(`  ${module}: ${data.count} stories, ${data.test_cases} test cases`);
  });
  console.log('\nEstimated Timeline: 6 weeks');
  console.log(`Estimated Effort: ${Math.round(prdContent.metadata.estimated_total_effort_hours)} hours`);
}
