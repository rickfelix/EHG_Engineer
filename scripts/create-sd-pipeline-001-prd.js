import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log('Creating comprehensive PRD for SD-PIPELINE-001: CI/CD Pipeline Hardening...');

  const sdId = 'SD-PIPELINE-001';

  // Create a comprehensive PRD for the CI/CD Pipeline Hardening
  
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
    title: 'PRD: CI/CD Pipeline Hardening System',
    is_consolidated: false,
    backlog_items: 0,
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
        title: 'Automated Build Pipeline',
        description: 'As a developer, I want automated build pipelines that compile, test, and package code on every commit to ensure consistent and reliable builds',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Automatic trigger on git push to any branch',
          'Parallel execution of build tasks',
          'Build artifact caching for performance',
          'Build status notifications to developers',
          'Support for multiple programming languages',
          'Build logs with detailed error reporting'
        ]
      },
      {
        id: `US-${sdId}-002`,
        title: 'Comprehensive Test Automation',
        description: 'As a QA engineer, I want automated testing at multiple levels (unit, integration, e2e) to catch bugs before deployment',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Unit test execution with coverage reports',
          'Integration test suite execution',
          'End-to-end test automation',
          'Test result visualization and trends',
          'Failure notifications with stack traces',
          'Parallel test execution for speed'
        ]
      },
      {
        id: `US-${sdId}-003`,
        title: 'Security Scanning Pipeline',
        description: 'As a security officer, I want automated security scanning in the pipeline to identify vulnerabilities before production',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Static code analysis (SAST)',
          'Dependency vulnerability scanning',
          'Container image scanning',
          'Secret detection and prevention',
          'Security report generation',
          'Break build on critical vulnerabilities'
        ]
      },
      {
        id: `US-${sdId}-004`,
        title: 'Multi-Environment Deployment',
        description: 'As a DevOps engineer, I want automated deployments to multiple environments with proper promotion workflows',
        priority: 'HIGH',
        acceptance_criteria: [
          'Deployment to dev, staging, and production',
          'Environment-specific configuration management',
          'Blue-green deployment support',
          'Canary release capabilities',
          'Automated rollback on failure',
          'Deployment approval gates'
        ]
      },
      {
        id: `US-${sdId}-005`,
        title: 'Pipeline Quality Gates',
        description: 'As a release manager, I want configurable quality gates that prevent bad code from reaching production',
        priority: 'HIGH',
        acceptance_criteria: [
          'Code coverage thresholds',
          'Performance benchmark gates',
          'Security scan gates',
          'Manual approval gates for production',
          'Automated gate status reporting',
          'Gate override with justification'
        ]
      },
      {
        id: `US-${sdId}-006`,
        title: 'Infrastructure as Code (IaC)',
        description: 'As a platform engineer, I want infrastructure provisioning through code to ensure consistent and reproducible environments',
        priority: 'HIGH',
        acceptance_criteria: [
          'Terraform/CloudFormation integration',
          'Environment provisioning automation',
          'Infrastructure validation and testing',
          'Cost estimation before deployment',
          'State management and locking',
          'Drift detection and remediation'
        ]
      },
      {
        id: `US-${sdId}-007`,
        title: 'Pipeline Monitoring and Observability',
        description: 'As an operations engineer, I want comprehensive monitoring of pipeline health and performance metrics',
        priority: 'HIGH',
        acceptance_criteria: [
          'Real-time pipeline execution monitoring',
          'Build time metrics and trends',
          'Success/failure rate tracking',
          'Resource utilization metrics',
          'Custom alerting rules',
          'Dashboard with key pipeline KPIs'
        ]
      },
      {
        id: `US-${sdId}-008`,
        title: 'Artifact Management',
        description: 'As a developer, I want centralized artifact storage and management for all build outputs',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Versioned artifact storage',
          'Artifact retention policies',
          'Artifact promotion between environments',
          'Vulnerability scanning of stored artifacts',
          'Access control and audit logging',
          'Artifact metadata and tagging'
        ]
      },
      {
        id: `US-${sdId}-009`,
        title: 'Pipeline Configuration as Code',
        description: 'As a DevOps engineer, I want pipeline definitions stored as code for version control and review',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'YAML/JSON pipeline definitions',
          'Pipeline template library',
          'Reusable pipeline components',
          'Pipeline validation and linting',
          'Branch-specific pipeline configs',
          'Pipeline versioning and rollback'
        ]
      },
      {
        id: `US-${sdId}-010`,
        title: 'Compliance and Audit Trail',
        description: 'As a compliance officer, I want complete audit trails of all pipeline activities for regulatory requirements',
        priority: 'LOW',
        acceptance_criteria: [
          'Comprehensive audit logging',
          'Deployment approval tracking',
          'Change tracking and attribution',
          'Compliance report generation',
          'Data retention policies',
          'Integration with compliance tools'
        ]
      }
    ],
    metadata: {
      implementation_notes: [
        'Critical infrastructure component for all deployments',
        'Must support both EHG and EHG_Engineer applications',
        'Integration with GitHub Actions preferred',
        'Zero-downtime deployment requirement',
        'Must include disaster recovery procedures'
      ],
      technical_requirements: [
        'GitHub Actions or Jenkins',
        'Docker/Kubernetes support',
        'Cloud provider agnostic',
        'High availability setup'
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

createPRD().catch(console.error);