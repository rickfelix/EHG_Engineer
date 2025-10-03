import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createSD029PRD() {
  console.log('Creating comprehensive PRD for SD-029: Orchestration Consolidated...');

  const sdId = 'SD-029';

  // Create a comprehensive PRD for Orchestration System
  const prdContent = {
    id: `PRD-${sdId}`,
    title: 'PRD: Orchestration Consolidated System',
    is_consolidated: true,
    backlog_items: 3,
    priority_distribution: {
      'CRITICAL': 3,
      'HIGH': 4,
      'MEDIUM': 2,
      'LOW': 1
    },
    user_stories: [
      {
        id: `US-${sdId}-001`,
        title: 'Workflow Orchestration Engine',
        description: 'As a process manager, I want a centralized workflow orchestration engine to automate complex business processes and task sequences',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Visual workflow designer with drag-and-drop interface',
          'Support for sequential, parallel, and conditional workflows',
          'Integration with external APIs and services',
          'Real-time workflow execution monitoring',
          'Error handling and retry mechanisms',
          'Workflow versioning and rollback capabilities'
        ]
      },
      {
        id: `US-${sdId}-002`,
        title: 'Task Queue and Job Management',
        description: 'As a system administrator, I want robust task queue management for handling background jobs and asynchronous operations',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Priority-based task queue with scheduling',
          'Distributed task processing across multiple workers',
          'Task status tracking and progress monitoring',
          'Failed task retry and dead letter queue handling',
          'Resource allocation and load balancing',
          'Task dependencies and conditional execution'
        ]
      },
      {
        id: `US-${sdId}-003`,
        title: 'Event-Driven Orchestration Platform',
        description: 'As a developer, I want an event-driven orchestration platform to handle complex system integrations and reactive workflows',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Event bus with publish-subscribe messaging',
          'Event filtering and routing capabilities',
          'Saga pattern support for distributed transactions',
          'Event sourcing and replay functionality',
          'Circuit breaker and fault tolerance patterns',
          'Real-time event monitoring and alerting'
        ]
      },
      {
        id: `US-${sdId}-004`,
        title: 'API Gateway and Service Orchestration',
        description: 'As an API architect, I want service orchestration capabilities to manage microservice interactions and API compositions',
        priority: 'HIGH',
        acceptance_criteria: [
          'API gateway with request routing and load balancing',
          'Service composition and choreography patterns',
          'Rate limiting and throttling mechanisms',
          'Authentication and authorization integration',
          'API versioning and backward compatibility',
          'Service health checks and failover handling'
        ]
      },
      {
        id: `US-${sdId}-005`,
        title: 'Business Process Automation (BPA)',
        description: 'As a business analyst, I want business process automation tools to digitize and optimize manual workflows',
        priority: 'HIGH',
        acceptance_criteria: [
          'Business process modeling notation (BPMN) support',
          'Form-based user task automation',
          'Document and data processing workflows',
          'Approval and escalation process automation',
          'Integration with existing business systems',
          'Process analytics and optimization insights'
        ]
      },
      {
        id: `US-${sdId}-006`,
        title: 'Data Pipeline Orchestration',
        description: 'As a data engineer, I want data pipeline orchestration for ETL/ELT processes and data workflow management',
        priority: 'HIGH',
        acceptance_criteria: [
          'Data pipeline definition and scheduling',
          'Support for batch and streaming data processing',
          'Data quality validation and monitoring',
          'Pipeline dependency management and lineage tracking',
          'Integration with data storage and processing systems',
          'Data pipeline performance optimization and scaling'
        ]
      },
      {
        id: `US-${sdId}-007`,
        title: 'Infrastructure Orchestration and IaC',
        description: 'As a DevOps engineer, I want infrastructure orchestration capabilities for automated provisioning and deployment',
        priority: 'HIGH',
        acceptance_criteria: [
          'Infrastructure as Code (IaC) template management',
          'Multi-cloud deployment orchestration',
          'Container orchestration and Kubernetes integration',
          'Blue-green and canary deployment strategies',
          'Resource scaling and auto-scaling policies',
          'Infrastructure monitoring and compliance checking'
        ]
      },
      {
        id: `US-${sdId}-008`,
        title: 'Monitoring and Observability Platform',
        description: 'As a site reliability engineer, I want comprehensive monitoring and observability for all orchestrated processes',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Real-time dashboard with workflow and task metrics',
          'Distributed tracing across orchestrated services',
          'Custom alerting rules and notification channels',
          'Performance analytics and bottleneck identification',
          'Log aggregation and correlation analysis',
          'SLA monitoring and reporting capabilities'
        ]
      },
      {
        id: `US-${sdId}-009`,
        title: 'Security and Compliance Orchestration',
        description: 'As a security officer, I want security orchestration capabilities for automated threat response and compliance management',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Security incident response automation',
          'Compliance workflow automation and reporting',
          'Vulnerability scanning and remediation workflows',
          'Access control and permission management automation',
          'Security policy enforcement and monitoring',
          'Audit trail and forensic analysis capabilities'
        ]
      },
      {
        id: `US-${sdId}-010`,
        title: 'Multi-Tenant Orchestration Management',
        description: 'As a platform operator, I want multi-tenant orchestration capabilities for managing workflows across different organizations',
        priority: 'LOW',
        acceptance_criteria: [
          'Tenant isolation and resource quotas',
          'Per-tenant workflow customization and branding',
          'Centralized management with tenant-specific dashboards',
          'Cross-tenant analytics and reporting',
          'Tenant onboarding and lifecycle management',
          'Billing and usage tracking per tenant'
        ]
      }
    ],
    metadata: {
      implementation_notes: [
        'Core orchestration platform for all automated processes',
        'Supports both EHG and EHG_Engineer orchestration needs',
        'Integrates with existing LEO Protocol and sub-agent systems',
        'Provides scalable and fault-tolerant orchestration capabilities',
        'Establishes foundation for enterprise process automation'
      ],
      backlog_evidence: [
        'Orchestration requirements from EHG backlog',
        'Process automation needs identified across systems',
        'Integration with LEO Protocol orchestration requirements'
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

createSD029PRD().catch(console.error);