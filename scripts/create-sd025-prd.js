import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log('Creating consolidated PRD for SD-025...');

  // First get the SD details
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', 'SD-025')
    .single();

  if (sdError || !sd) {
    console.error('Error fetching SD:', sdError);
    return;
  }

  // Create a comprehensive PRD for Analytics & Insights consolidated SD
  const prdContent = {
    id: 'PRD-SD-025',
    title: 'PRD: Insights: Consolidated',
    is_consolidated: true,
    backlog_items: 10,
    priority_distribution: {
      'HIGH': 4,
      'MEDIUM': 3,
      'LOW': 3
    },
    user_stories: [
      {
        id: 'US-SD-025-001',
        title: 'Real-time Analytics Dashboard',
        description: 'As a business user, I want to view real-time analytics with customizable widgets so that I can monitor KPIs and make data-driven decisions',
        priority: 'HIGH',
        acceptance_criteria: [
          'Dashboard loads within 2 seconds',
          'Supports at least 10 widget types',
          'Auto-refresh at configurable intervals',
          'Responsive design for mobile and desktop',
          'Export dashboard as PDF or image'
        ]
      },
      {
        id: 'US-SD-025-002',
        title: 'Predictive Insights Engine',
        description: 'As an analyst, I want AI-powered predictive insights to forecast trends and identify opportunities before they become apparent',
        priority: 'HIGH',
        acceptance_criteria: [
          'ML models for trend forecasting',
          'Anomaly detection with alerts',
          'Confidence scores for predictions',
          'Historical accuracy tracking',
          'Integration with existing data sources'
        ]
      },
      {
        id: 'US-SD-025-003',
        title: 'Custom Report Builder',
        description: 'As a report creator, I want a drag-and-drop interface to build custom reports without technical knowledge',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Intuitive drag-and-drop interface',
          'Pre-built report templates',
          'Schedule report generation',
          'Multiple export formats (PDF, Excel, CSV)',
          'Report sharing and permissions'
        ]
      },
      {
        id: 'US-SD-025-004',
        title: 'Data Visualization Library',
        description: 'As a data analyst, I want comprehensive visualization options to present data in the most effective format',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Support for 20+ chart types',
          'Interactive visualizations',
          'Custom color schemes and branding',
          'Drill-down capabilities',
          'Animation and transition effects'
        ]
      },
      {
        id: 'US-SD-025-005',
        title: 'Automated Insights Generation',
        description: 'As an executive, I want automated insights generated from data patterns without manual analysis',
        priority: 'HIGH',
        acceptance_criteria: [
          'Natural language insights generation',
          'Pattern recognition algorithms',
          'Contextual recommendations',
          'Daily/weekly insight summaries',
          'Actionable recommendations with confidence scores'
        ]
      },
      {
        id: 'US-SD-025-006',
        title: 'Performance Benchmarking',
        description: 'As a manager, I want to benchmark performance against industry standards and historical data',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Industry benchmark database',
          'Historical comparison views',
          'Percentile rankings',
          'Gap analysis reports',
          'Improvement tracking over time'
        ]
      },
      {
        id: 'US-SD-025-007',
        title: 'Alert and Notification System',
        description: 'As a stakeholder, I want configurable alerts for critical metrics and thresholds',
        priority: 'HIGH',
        acceptance_criteria: [
          'Threshold-based alerting',
          'Multiple notification channels (email, SMS, in-app)',
          'Alert prioritization and routing',
          'Alert history and acknowledgment',
          'Escalation procedures'
        ]
      },
      {
        id: 'US-SD-025-008',
        title: 'Data Integration Hub',
        description: 'As a data engineer, I want seamless integration with multiple data sources',
        priority: 'LOW',
        acceptance_criteria: [
          'Support for 10+ data source types',
          'Real-time and batch processing',
          'Data transformation pipelines',
          'Error handling and retry logic',
          'Data quality monitoring'
        ]
      },
      {
        id: 'US-SD-025-009',
        title: 'Mobile Analytics App',
        description: 'As a mobile user, I want full analytics capabilities on my mobile device',
        priority: 'LOW',
        acceptance_criteria: [
          'Native mobile app for iOS/Android',
          'Offline viewing capabilities',
          'Push notifications for alerts',
          'Touch-optimized interactions',
          'Biometric authentication'
        ]
      },
      {
        id: 'US-SD-025-010',
        title: 'Collaborative Analytics Workspace',
        description: 'As a team member, I want to collaborate on analytics projects with my colleagues',
        priority: 'LOW',
        acceptance_criteria: [
          'Shared workspaces and dashboards',
          'Comments and annotations',
          'Version control for reports',
          'Real-time collaboration',
          'Activity audit trail'
        ]
      }
    ],
    metadata: {
      backlog_evidence: [
        'Real-time monitoring requirements from Q4 planning',
        'AI/ML initiatives from strategic roadmap',
        'Customer feedback on reporting limitations',
        'Mobile-first strategy alignment',
        'Collaboration needs from remote teams'
      ]
    }
  };

  // Insert the PRD
  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .insert({
      id: `PRD-SD-025-${Date.now()}`,
      directive_id: 'SD-025',
      title: 'PRD: Insights: Consolidated',
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