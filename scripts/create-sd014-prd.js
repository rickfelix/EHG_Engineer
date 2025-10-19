import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log('Creating comprehensive PRD for SD-014 (Feedback Loops)...');

  // First get the SD details
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', 'SD-014')
    .single();

  if (sdError || !sd) {
    console.error('Error fetching SD:', sdError);
    return;
  }

  // Create a comprehensive PRD for Feedback Loops consolidated SD
  
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
    id: 'PRD-SD-014',
    title: 'PRD: Stage 23 - Feedback Loops: Consolidated',
    is_consolidated: true,
    backlog_items: 10,
    priority_distribution: {
      'HIGH': 4,
      'MEDIUM': 3,
      'LOW': 3
    },
    // FIX: user_stories moved to separate table
    // user_stories: [
      {
        id: 'US-SD-014-001',
        title: 'Real-time User Feedback Collection',
        description: 'As a product manager, I want real-time user feedback collection across all touchpoints to understand user sentiment and issues immediately',
        priority: 'HIGH',
        acceptance_criteria: [
          'Multi-channel feedback collection (in-app, email, SMS, web)',
          'Real-time sentiment analysis and categorization',
          'Automatic issue prioritization and routing',
          'Feedback widget with minimal friction',
          'Anonymous feedback option available'
        ]
      },
      {
        id: 'US-SD-014-002',
        title: 'Customer Satisfaction Tracking Dashboard',
        description: 'As a customer success manager, I want a comprehensive dashboard to track CSAT, NPS, and CES scores with trend analysis',
        priority: 'HIGH',
        acceptance_criteria: [
          'Real-time CSAT, NPS, and CES metrics',
          'Historical trend analysis and comparisons',
          'Segment-based satisfaction analysis',
          'Alert system for satisfaction drops',
          'Export capabilities for reporting'
        ]
      },
      {
        id: 'US-SD-014-003',
        title: 'Automated Feedback Loop Closure',
        description: 'As a support agent, I want automated feedback loop closure to ensure every customer issue is resolved and communicated',
        priority: 'HIGH',
        acceptance_criteria: [
          'Automatic follow-up scheduling',
          'Resolution confirmation workflows',
          'Customer notification system',
          'Escalation paths for unresolved issues',
          'Feedback loop metrics and reporting'
        ]
      },
      {
        id: 'US-SD-014-004',
        title: 'AI-Powered Feedback Analysis',
        description: 'As an analyst, I want AI-powered analysis to extract insights from unstructured feedback data',
        priority: 'HIGH',
        acceptance_criteria: [
          'Natural language processing for text analysis',
          'Theme and pattern extraction',
          'Sentiment scoring and emotion detection',
          'Trend identification and predictions',
          'Actionable insight generation'
        ]
      },
      {
        id: 'US-SD-014-005',
        title: 'Product Feature Request System',
        description: 'As a product owner, I want a system to collect, prioritize, and track feature requests from customers',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Feature request submission portal',
          'Voting and prioritization system',
          'Status tracking and updates',
          'Integration with development roadmap',
          'Customer notification on feature releases'
        ]
      },
      {
        id: 'US-SD-014-006',
        title: 'Continuous Survey Management',
        description: 'As a research manager, I want to manage continuous surveys for ongoing customer insights',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Survey builder with multiple question types',
          'Scheduled and triggered survey deployment',
          'Response rate optimization',
          'Statistical analysis tools',
          'Integration with CRM and analytics'
        ]
      },
      {
        id: 'US-SD-014-007',
        title: 'Customer Journey Feedback Mapping',
        description: 'As a UX designer, I want to map feedback to specific customer journey stages',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Journey stage identification',
          'Feedback correlation with touchpoints',
          'Pain point visualization',
          'Journey optimization recommendations',
          'A/B testing integration'
        ]
      },
      {
        id: 'US-SD-014-008',
        title: 'Team Performance Feedback System',
        description: 'As a team lead, I want a 360-degree feedback system for continuous team improvement',
        priority: 'LOW',
        acceptance_criteria: [
          'Peer review and feedback collection',
          'Manager and subordinate feedback',
          'Anonymous feedback options',
          'Performance trend tracking',
          'Development plan integration'
        ]
      },
      {
        id: 'US-SD-014-009',
        title: 'Feedback API and Integrations',
        description: 'As a developer, I want APIs to integrate feedback collection into any application',
        priority: 'LOW',
        acceptance_criteria: [
          'RESTful and GraphQL APIs',
          'SDK for major platforms',
          'Webhook support for real-time events',
          'Third-party integration marketplace',
          'Rate limiting and security'
        ]
      },
      {
        id: 'US-SD-014-010',
        title: 'Feedback Analytics and Reporting',
        description: 'As an executive, I want comprehensive analytics and reporting on all feedback metrics',
        priority: 'LOW',
        acceptance_criteria: [
          'Executive dashboards with KPIs',
          'Custom report builder',
          'Automated report scheduling',
          'Benchmark comparisons',
          'Predictive analytics and forecasting'
        ]
      }
    ],
    metadata: {
      backlog_evidence: [
        'Customer retention challenges requiring better feedback',
        'Product development needs user input integration',
        'Support team requires feedback tracking',
        'Management needs visibility into satisfaction metrics',
        'Compliance requirements for customer communication'
      ]
    }
  };

  // Insert the PRD
  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .insert({
      id: `PRD-SD-014-${Date.now()}`,
      directive_id: 'SD-014',
      title: 'PRD: Stage 23 - Feedback Loops: Consolidated',
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
    console.log('   User Stories:', prdContent.user_stories.length);
    console.log('   Is Consolidated:', prdContent.is_consolidated);
    console.log('   Priority Distribution:', JSON.stringify(prdContent.priority_distribution));
  }
}

createPRD().catch(console.error);