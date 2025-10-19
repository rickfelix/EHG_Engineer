import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createSD009PRD() {
  console.log('Creating comprehensive PRD for SD-009: Stage 14 - Development Preparation Consolidated...');

  const sdId = 'SD-009';

  // Create a comprehensive PRD for Development Preparation System
  
  // FIX: Get SD uuid_id to populate sd_uuid field (prevents handoff validation failures)
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, id')
    .eq('id', sdId)
    .single();

  if (sdError || !sdData) {
    console.log(`❌ Strategic Directive ${sdId} not found in database`);
    console.log('   Create SD first before creating PRD');
    process.exit(1);
  }

  const sdUuid = sdData.uuid_id;
  console.log(`   SD uuid_id: ${sdUuid}`);

const prdContent = {
    id: `PRD-${sdId}`,
    title: 'PRD: Stage 14 - Development Preparation Consolidated System',
    is_consolidated: true,
    backlog_items: 1,
    priority_distribution: {
      'CRITICAL': 3,
      'HIGH': 4,
      'MEDIUM': 2,
      'LOW': 1
    },
    // FIX: user_stories moved to separate table
    // user_stories: [
      {
        id: `US-${sdId}-001`,
        title: 'Development Environment Setup and Configuration',
        description: 'As a developer, I want a standardized development environment setup process to ensure consistent and productive development workflows',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Automated development environment provisioning',
          'Standard IDE configuration and extensions',
          'Git workflow setup with proper branching strategy',
          'Database setup with sample data and migrations',
          'Environment variable and secrets management',
          'Local testing and debugging configuration'
        ]
      },
      {
        id: `US-${sdId}-002`,
        title: 'Developer Onboarding and Documentation System',
        description: 'As a new team member, I want comprehensive onboarding documentation and tools to quickly become productive',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Interactive onboarding checklist and progress tracking',
          'Step-by-step setup guides with verification',
          'Code architecture and design pattern documentation',
          'Development workflow and contribution guidelines',
          'Troubleshooting guides and common issues',
          'Mentorship assignment and progress tracking'
        ]
      },
      {
        id: `US-${sdId}-003`,
        title: 'Code Quality and Standards Framework',
        description: 'As a development team, I want automated code quality enforcement to maintain high standards across the codebase',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Pre-commit hooks for code formatting and linting',
          'Automated code review checks and quality gates',
          'Code coverage requirements and reporting',
          'Security scanning and vulnerability detection',
          'Performance testing and benchmark validation',
          'Documentation generation and API docs'
        ]
      },
      {
        id: `US-${sdId}-004`,
        title: 'Development Toolchain and Build System',
        description: 'As a developer, I want optimized build tools and development utilities for efficient development cycles',
        priority: 'HIGH',
        acceptance_criteria: [
          'Fast development server with hot-reloading',
          'Optimized build pipeline with caching',
          'Package management and dependency resolution',
          'Development proxy and API mocking tools',
          'Asset optimization and bundling configuration',
          'Cross-platform compatibility and testing'
        ]
      },
      {
        id: `US-${sdId}-005`,
        title: 'Testing Infrastructure and Automation',
        description: 'As a QA engineer, I want comprehensive testing infrastructure to ensure reliable and maintainable test suites',
        priority: 'HIGH',
        acceptance_criteria: [
          'Unit testing framework with mocking capabilities',
          'Integration testing with database and API mocks',
          'End-to-end testing with browser automation',
          'Performance and load testing infrastructure',
          'Visual regression testing for UI components',
          'Test data management and factory patterns'
        ]
      },
      {
        id: `US-${sdId}-006`,
        title: 'Local Development Database and Services',
        description: 'As a developer, I want local database and service management for isolated development and testing',
        priority: 'HIGH',
        acceptance_criteria: [
          'Containerized database setup with Docker',
          'Sample data seeding and migration tools',
          'Local service discovery and configuration',
          'API mock servers and service virtualization',
          'Database backup and restore utilities',
          'Multi-environment data synchronization'
        ]
      },
      {
        id: `US-${sdId}-007`,
        title: 'Development Monitoring and Debugging Tools',
        description: 'As a developer, I want comprehensive monitoring and debugging tools for efficient problem resolution',
        priority: 'HIGH',
        acceptance_criteria: [
          'Application performance monitoring (APM) setup',
          'Real-time logging and log aggregation',
          'Error tracking and exception monitoring',
          'Database query analysis and optimization',
          'Memory and resource usage profiling',
          'Distributed tracing for microservices'
        ]
      },
      {
        id: `US-${sdId}-008`,
        title: 'Security and Compliance Development Tools',
        description: 'As a security-conscious developer, I want integrated security tools to identify and prevent vulnerabilities',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Static Application Security Testing (SAST) tools',
          'Dependency vulnerability scanning',
          'Secrets detection and management',
          'Security linting and best practice enforcement',
          'Compliance checking and audit trails',
          'Security testing automation and reporting'
        ]
      },
      {
        id: `US-${sdId}-009`,
        title: 'Development Team Collaboration Tools',
        description: 'As a team member, I want integrated collaboration tools to enhance communication and knowledge sharing',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Code review workflow and approval processes',
          'Knowledge sharing and documentation platform',
          'Team communication and notification systems',
          'Project planning and task management integration',
          'Code annotation and technical discussion tools',
          'Development metrics and team productivity insights'
        ]
      },
      {
        id: `US-${sdId}-010`,
        title: 'Development Environment Optimization and Maintenance',
        description: 'As a development lead, I want automated maintenance and optimization tools to keep development environments efficient',
        priority: 'LOW',
        acceptance_criteria: [
          'Automated dependency updates and vulnerability patching',
          'Development environment health monitoring',
          'Resource usage optimization and cleanup tools',
          'Configuration drift detection and correction',
          'Environment provisioning and deprovisioning automation',
          'Development toolchain update and migration assistance'
        ]
      }
    ],
    metadata: {
      implementation_notes: [
        'Foundation for efficient development workflows',
        'Supports both EHG and EHG_Engineer development',
        'Integrates with existing CI/CD and deployment systems',
        'Provides automation and developer experience optimization',
        'Establishes standards for development team scalability'
      ],
      backlog_evidence: [
        'Development preparation requirements from EHG backlog',
        'Developer experience optimization needs identified'
      ]
    }
  };

  // Insert the PRD
  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .insert({
      id: `PRD-${sdId}-${Date.now()}`,
      directive_id: sdId,
      title: prdContent.title,
      content: prdContent,
      status: 'approved',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    sd_uuid: sdUuid, // FIX: Added for handoff validation
    })
    .select()
    .single();

  if (prdError) {
    console.error('Error creating PRD:', prdError);
  } else {
    console.log('✅ PRD created successfully!');
    console.log('   ID:', prd.id);
    console.log('   Title:', prdContent.title);
    console.log('   User Stories:', prdContent.user_stories.length);
    console.log('   Priority Distribution:', JSON.stringify(prdContent.priority_distribution));
  }
}

createSD009PRD().catch(console.error);