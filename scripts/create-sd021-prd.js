import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log('Creating comprehensive PRD for SD-021: Gap Analysis System...');

  const sdId = 'SD-021';

  // Create a comprehensive PRD for the Gap Analysis System
  const prdContent = {
    id: `PRD-${sdId}`,
    title: 'PRD: Stage 9 - Gap Analysis Consolidated System',
    is_consolidated: true,
    backlog_items: 1,
    priority_distribution: {
      'CRITICAL': 2,
      'HIGH': 3,
      'MEDIUM': 3,
      'LOW': 2
    },
    user_stories: [
      {
        id: `US-${sdId}-001`,
        title: 'Current State Assessment',
        description: 'As a business analyst, I want to document and analyze the current state of our systems and processes to establish a baseline for gap identification',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Capture current system architecture and capabilities',
          'Document existing business processes and workflows',
          'Inventory current tools and technologies',
          'Map existing data flows and integrations',
          'Identify performance metrics and KPIs'
        ]
      },
      {
        id: `US-${sdId}-002`,
        title: 'Future State Definition',
        description: 'As a strategic planner, I want to define the desired future state with clear objectives and success criteria',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Define target architecture and capabilities',
          'Specify desired business processes',
          'Identify required tools and technologies',
          'Design optimal data flows',
          'Set target performance metrics'
        ]
      },
      {
        id: `US-${sdId}-003`,
        title: 'Gap Identification Engine',
        description: 'As a project manager, I want an automated system to identify and categorize gaps between current and future states',
        priority: 'HIGH',
        acceptance_criteria: [
          'Automated gap detection algorithms',
          'Gap categorization by type and severity',
          'Impact assessment for each gap',
          'Dependency mapping between gaps',
          'Priority scoring system'
        ]
      },
      {
        id: `US-${sdId}-004`,
        title: 'Gap Analysis Dashboard',
        description: 'As an executive, I want a visual dashboard showing all identified gaps with their status and priority',
        priority: 'HIGH',
        acceptance_criteria: [
          'Interactive visualization of gaps',
          'Filterable by category, priority, and status',
          'Heat map showing gap concentration areas',
          'Progress tracking for gap resolution',
          'Executive summary view'
        ]
      },
      {
        id: `US-${sdId}-005`,
        title: 'Remediation Planning',
        description: 'As a solution architect, I want to create detailed remediation plans for addressing identified gaps',
        priority: 'HIGH',
        acceptance_criteria: [
          'Remediation plan templates',
          'Resource estimation tools',
          'Timeline generation',
          'Risk assessment for remediation',
          'Success criteria definition'
        ]
      },
      {
        id: `US-${sdId}-006`,
        title: 'Cost-Benefit Analysis',
        description: 'As a financial analyst, I want to perform cost-benefit analysis for gap remediation efforts',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Cost estimation models',
          'Benefit quantification methods',
          'ROI calculations',
          'Payback period analysis',
          'Alternative solution comparison'
        ]
      },
      {
        id: `US-${sdId}-007`,
        title: 'Stakeholder Impact Assessment',
        description: 'As a change manager, I want to assess how gaps and their remediation will impact different stakeholders',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Stakeholder mapping',
          'Impact severity ratings',
          'Communication plan templates',
          'Training needs assessment',
          'Change readiness evaluation'
        ]
      },
      {
        id: `US-${sdId}-008`,
        title: 'Progress Tracking System',
        description: 'As a PMO lead, I want to track progress on gap closure activities with real-time updates',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Real-time progress updates',
          'Milestone tracking',
          'Deviation alerts',
          'Burndown charts',
          'Completion forecasting'
        ]
      },
      {
        id: `US-${sdId}-009`,
        title: 'Gap Analysis Reporting',
        description: 'As a compliance officer, I want comprehensive reports on gap analysis findings and remediation status',
        priority: 'LOW',
        acceptance_criteria: [
          'Customizable report templates',
          'Automated report generation',
          'Export to multiple formats',
          'Audit trail maintenance',
          'Regulatory compliance tracking'
        ]
      },
      {
        id: `US-${sdId}-010`,
        title: 'Historical Gap Trending',
        description: 'As a continuous improvement manager, I want to analyze historical gap patterns to prevent future occurrences',
        priority: 'LOW',
        acceptance_criteria: [
          'Historical gap database',
          'Trend analysis algorithms',
          'Pattern recognition',
          'Predictive analytics',
          'Lessons learned repository'
        ]
      }
    ],
    metadata: {
      stage: 9,
      implementation_notes: [
        'Consolidated from EHG Backlog analysis',
        'Critical for Stage 9 completion',
        'Integrates with existing assessment tools',
        'Supports continuous improvement initiatives'
      ],
      backlog_evidence: [
        'Gap analysis requirements from backlog review',
        'Stage 9 completion criteria'
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

createPRD().catch(console.error);