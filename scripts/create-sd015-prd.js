import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log('Creating comprehensive PRD for SD-015 (Quality Assurance)...');

  // First get the SD details
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', 'SD-015')
    .single();

  if (sdError || !sd) {
    console.error('Error fetching SD:', sdError);
    return;
  }

  // Create a comprehensive PRD for Quality Assurance consolidated SD
  const prdContent = {
    id: 'PRD-SD-015',
    title: 'PRD: Stage 25 - Quality Assurance: Consolidated',
    is_consolidated: true,
    backlog_items: 10,
    priority_distribution: {
      'HIGH': 4,
      'MEDIUM': 3,
      'LOW': 3
    },
    user_stories: [
      {
        id: 'US-SD-015-001',
        title: 'Automated Test Suite Management',
        description: 'As a QA engineer, I want a comprehensive automated test suite management system to orchestrate unit, integration, and E2E tests across all environments',
        priority: 'HIGH',
        acceptance_criteria: [
          'Support for multiple test frameworks (Jest, Cypress, Playwright)',
          'Parallel test execution with auto-scaling',
          'Test result aggregation and reporting',
          'Code coverage tracking with thresholds',
          'Integration with CI/CD pipelines'
        ]
      },
      {
        id: 'US-SD-015-002',
        title: 'Real-time Quality Metrics Dashboard',
        description: 'As a QA manager, I want real-time visibility into quality metrics to monitor test health, coverage, and defect trends',
        priority: 'HIGH',
        acceptance_criteria: [
          'Live test execution status and results',
          'Code coverage trends and heatmaps',
          'Defect density and distribution analysis',
          'Test reliability and flakiness metrics',
          'Quality gates and threshold monitoring'
        ]
      },
      {
        id: 'US-SD-015-003',
        title: 'Intelligent Test Generation',
        description: 'As a developer, I want AI-powered test generation to automatically create test cases based on code changes and usage patterns',
        priority: 'HIGH',
        acceptance_criteria: [
          'ML-based test case generation from code analysis',
          'Mutation testing for test quality assessment',
          'Property-based testing support',
          'Test prioritization based on risk analysis',
          'Automatic test maintenance and updates'
        ]
      },
      {
        id: 'US-SD-015-004',
        title: 'Performance Testing Platform',
        description: 'As a performance engineer, I want comprehensive performance testing capabilities to ensure system scalability and reliability',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Load testing with configurable scenarios',
          'Stress testing and breaking point analysis',
          'Performance regression detection',
          'Resource utilization monitoring',
          'Performance benchmark comparisons'
        ]
      },
      {
        id: 'US-SD-015-005',
        title: 'Security Testing Automation',
        description: 'As a security engineer, I want automated security testing integrated into the QA pipeline to identify vulnerabilities early',
        priority: 'HIGH',
        acceptance_criteria: [
          'SAST and DAST integration',
          'Dependency vulnerability scanning',
          'Security regression testing',
          'Compliance validation (OWASP, PCI, etc.)',
          'Automated penetration testing'
        ]
      },
      {
        id: 'US-SD-015-006',
        title: 'Visual Regression Testing',
        description: 'As a UI developer, I want visual regression testing to catch unintended UI changes automatically',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Pixel-perfect screenshot comparisons',
          'Cross-browser visual testing',
          'Responsive design validation',
          'Visual diff reporting with approval workflow',
          'Integration with design systems'
        ]
      },
      {
        id: 'US-SD-015-007',
        title: 'Test Data Management System',
        description: 'As a test engineer, I want intelligent test data management to ensure consistent and realistic test scenarios',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Test data generation and synthesis',
          'Data masking and anonymization',
          'Test environment provisioning',
          'Data versioning and rollback',
          'GDPR-compliant test data handling'
        ]
      },
      {
        id: 'US-SD-015-008',
        title: 'Defect Intelligence Platform',
        description: 'As a QA lead, I want AI-powered defect analysis to predict, prevent, and prioritize quality issues',
        priority: 'LOW',
        acceptance_criteria: [
          'Defect prediction based on code changes',
          'Automatic defect categorization and routing',
          'Root cause analysis suggestions',
          'Defect clustering and pattern recognition',
          'Integration with issue tracking systems'
        ]
      },
      {
        id: 'US-SD-015-009',
        title: 'API Contract Testing',
        description: 'As a backend developer, I want contract testing to ensure API compatibility across services',
        priority: 'LOW',
        acceptance_criteria: [
          'Consumer-driven contract testing',
          'Schema validation and versioning',
          'Breaking change detection',
          'Mock service generation',
          'API documentation validation'
        ]
      },
      {
        id: 'US-SD-015-010',
        title: 'Accessibility Testing Suite',
        description: 'As an accessibility advocate, I want automated accessibility testing to ensure compliance with WCAG standards',
        priority: 'LOW',
        acceptance_criteria: [
          'WCAG 2.1 AA/AAA compliance checking',
          'Screen reader compatibility testing',
          'Keyboard navigation validation',
          'Color contrast analysis',
          'Accessibility report generation'
        ]
      }
    ],
    metadata: {
      backlog_evidence: [
        'Quality gates requirement from enterprise clients',
        'Test automation initiatives from engineering roadmap',
        'Security compliance requirements',
        'Performance SLA commitments',
        'Accessibility requirements for public sector'
      ]
    }
  };

  // Insert the PRD
  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .insert({
      id: `PRD-SD-015-${Date.now()}`,
      directive_id: 'SD-015',
      title: 'PRD: Stage 25 - Quality Assurance: Consolidated',
      content: prdContent,
      status: 'approved',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (prdError) {
    console.error('Error creating PRD:', prdError);
  } else {
    console.log('✅ PRD created successfully!');
    console.log('   ID:', prd.id);
    console.log('   User Stories:', prdContent.user_stories.length);
    console.log('   Is Consolidated:', prdContent.is_consolidated);
    console.log('   Priority Distribution:', JSON.stringify(prdContent.priority_distribution));
  }
}

createPRD().catch(console.error);