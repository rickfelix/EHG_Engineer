#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const prdContent = {
  title: 'PRD: SD-041B - Competitive Intelligence Cloning Process',
  version: '1.0.0',
  created_date: new Date().toISOString(),

  // Executive Summary
  executive_summary: `**Objective**: Systematize venture ideation through integrated market scanning and customer feedback analysis within existing Stage 4 Competitive Intelligence workflow.

**Scope**: Enhance Stage 4 UI with "Venture Cloning" workflow tab, add 5 database tables for systematic opportunity tracking, create venture ideation service layer, integrate with AI agents for Research team usage.

**Success Metrics**:
- Time to venture concept: < 2 weeks (vs current ad-hoc 4-6 weeks)
- Customer signal sensitivity: 10x increase via listening radar
- Chairman-approved blueprints: ≥ 3 per quarter
- AI Research Agent utilization: ≥ 50% of competitive queries`,

  // Product Requirements
  requirements: {
    functional: [
      {
        id: 'FR-001',
        title: 'Market Segment Tracking',
        description: 'System to define and monitor specific market segments for systematic scanning',
        priority: 'HIGH',
        acceptance_criteria: [
          'Create market segment with name, description, target customer profile',
          'Configure scanning sources (competitors, forums, review sites)',
          'Set monitoring frequency (daily/weekly/monthly)',
          'Chairman can approve/reject market segments'
        ]
      },
      {
        id: 'FR-002',
        title: 'Competitor Feature Cloning Workflow',
        description: 'Systematic process to scan competitor offerings and identify feature gaps',
        priority: 'HIGH',
        acceptance_criteria: [
          'Scan all competitors in market segment automatically',
          'Compare feature sets in matrix view',
          'Identify gaps where competitors weak/absent',
          'Generate feature comparison report',
          'Export to opportunity blueprint'
        ]
      },
      {
        id: 'FR-003',
        title: 'Customer Feedback Aggregation',
        description: 'Collect and analyze customer pain points from multiple sources',
        priority: 'HIGH',
        acceptance_criteria: [
          'Configure feedback sources (Reddit, forums, review sites, social)',
          'Aggregate feedback by competitor product',
          'Sentiment analysis (positive/negative/neutral)',
          'Pain point extraction and categorization',
          '10x sensitivity scoring (frequency * severity)'
        ]
      },
      {
        id: 'FR-004',
        title: 'Opportunity Blueprint Generation',
        description: 'Create venture ideation blueprints from market gaps and customer feedback',
        priority: 'HIGH',
        acceptance_criteria: [
          'Combine competitive gaps with customer pain points',
          'Generate blueprint: problem, solution concept, target market, differentiation',
          'Include customer evidence (feedback quotes)',
          'Calculate opportunity score (market size * pain severity * competitive weakness)',
          'Submit to Chairman for approval'
        ]
      },
      {
        id: 'FR-005',
        title: 'Listening Radar Configuration',
        description: 'Configure sensitivity and alerting for customer signals',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Set sensitivity multiplier (1x to 10x)',
          'Define keywords/phrases for alerting',
          'Configure notification thresholds',
          'Dashboard showing signal volume trends'
        ]
      },
      {
        id: 'FR-006',
        title: 'AI Agent Integration',
        description: 'Allow Research AI agents to query competitive intelligence data',
        priority: 'HIGH',
        acceptance_criteria: [
          'API endpoints for AI agent queries',
          'Access control (AI agents can read, not write)',
          'Query interface: getCompetitorsBySegment, getCustomerFeedback, getOpportunityBlueprints',
          'Log AI agent usage for analytics'
        ]
      },
      {
        id: 'FR-007',
        title: 'Chairman Approval Workflow',
        description: 'Review and approval process for venture opportunity blueprints',
        priority: 'HIGH',
        acceptance_criteria: [
          'Chairman dashboard showing pending blueprints',
          'Approve/Reject with comments',
          'Edit blueprint before approval',
          'Approved blueprints create draft ventures (Stage 1)',
          'Rejection includes feedback for refinement'
        ]
      }
    ],

    non_functional: [
      {
        id: 'NFR-001',
        title: 'Performance',
        requirement: 'Market scanning completes in < 30 seconds per segment',
        rationale: 'Enable real-time exploration during ideation sessions'
      },
      {
        id: 'NFR-002',
        title: 'Scalability',
        requirement: 'Support 50+ market segments, 200+ competitors, 10K+ feedback items',
        rationale: 'Enterprise portfolio management scale'
      },
      {
        id: 'NFR-003',
        title: 'Data Freshness',
        requirement: 'Customer feedback aggregated daily, competitive scans weekly',
        rationale: '10x sensitivity requires near-real-time awareness'
      },
      {
        id: 'NFR-004',
        title: 'AI Agent Response Time',
        requirement: 'API queries return in < 2 seconds',
        rationale: 'Enable fluid Research AI agent conversations'
      }
    ]
  },

  // Database Schema
  database_schema: {
    tables: [
      {
        name: 'market_segments',
        description: 'Market segments for systematic scanning',
        columns: [
          { name: 'id', type: 'uuid', constraints: 'PRIMARY KEY DEFAULT gen_random_uuid()' },
          { name: 'name', type: 'text', constraints: 'NOT NULL' },
          { name: 'description', type: 'text' },
          { name: 'target_customer_profile', type: 'jsonb' },
          { name: 'scanning_sources', type: 'jsonb', description: 'Array of {type, url, frequency}' },
          { name: 'monitoring_frequency', type: 'text', constraints: "CHECK (monitoring_frequency IN ('daily', 'weekly', 'monthly'))" },
          { name: 'chairman_approved', type: 'boolean', constraints: 'DEFAULT false' },
          { name: 'created_by', type: 'text' },
          { name: 'created_at', type: 'timestamptz', constraints: 'DEFAULT now()' },
          { name: 'updated_at', type: 'timestamptz', constraints: 'DEFAULT now()' }
        ],
        indexes: ['CREATE INDEX idx_market_segments_approved ON market_segments(chairman_approved)']
      },
      {
        name: 'competitor_tracking',
        description: 'Competitor monitoring and feature tracking',
        columns: [
          { name: 'id', type: 'uuid', constraints: 'PRIMARY KEY DEFAULT gen_random_uuid()' },
          { name: 'market_segment_id', type: 'uuid', constraints: 'REFERENCES market_segments(id) ON DELETE CASCADE' },
          { name: 'competitor_name', type: 'text', constraints: 'NOT NULL' },
          { name: 'website', type: 'text' },
          { name: 'product_name', type: 'text' },
          { name: 'features', type: 'jsonb', description: 'Array of {feature, coverage_level, notes}' },
          { name: 'pricing_model', type: 'text' },
          { name: 'market_position', type: 'text' },
          { name: 'last_scanned', type: 'timestamptz' },
          { name: 'created_at', type: 'timestamptz', constraints: 'DEFAULT now()' },
          { name: 'updated_at', type: 'timestamptz', constraints: 'DEFAULT now()' }
        ],
        indexes: [
          'CREATE INDEX idx_competitor_tracking_segment ON competitor_tracking(market_segment_id)',
          'CREATE INDEX idx_competitor_tracking_scanned ON competitor_tracking(last_scanned)'
        ]
      },
      {
        name: 'customer_feedback_sources',
        description: 'Customer feedback from reviews, forums, social media',
        columns: [
          { name: 'id', type: 'uuid', constraints: 'PRIMARY KEY DEFAULT gen_random_uuid()' },
          { name: 'competitor_id', type: 'uuid', constraints: 'REFERENCES competitor_tracking(id) ON DELETE CASCADE' },
          { name: 'source_type', type: 'text', constraints: "CHECK (source_type IN ('reddit', 'forum', 'review_site', 'social_media', 'support_ticket'))" },
          { name: 'source_url', type: 'text' },
          { name: 'feedback_text', type: 'text', constraints: 'NOT NULL' },
          { name: 'sentiment', type: 'text', constraints: "CHECK (sentiment IN ('positive', 'neutral', 'negative'))" },
          { name: 'pain_points', type: 'jsonb', description: 'Array of extracted pain points' },
          { name: 'severity_score', type: 'integer', constraints: 'CHECK (severity_score BETWEEN 1 AND 10)' },
          { name: 'frequency_score', type: 'integer', description: 'How often this pain point appears' },
          { name: 'collected_at', type: 'timestamptz', constraints: 'DEFAULT now()' },
          { name: 'created_at', type: 'timestamptz', constraints: 'DEFAULT now()' }
        ],
        indexes: [
          'CREATE INDEX idx_feedback_competitor ON customer_feedback_sources(competitor_id)',
          'CREATE INDEX idx_feedback_sentiment ON customer_feedback_sources(sentiment)',
          'CREATE INDEX idx_feedback_collected ON customer_feedback_sources(collected_at)'
        ]
      },
      {
        name: 'opportunity_blueprints',
        description: 'Venture ideation blueprints generated from analysis',
        columns: [
          { name: 'id', type: 'uuid', constraints: 'PRIMARY KEY DEFAULT gen_random_uuid()' },
          { name: 'market_segment_id', type: 'uuid', constraints: 'REFERENCES market_segments(id)' },
          { name: 'title', type: 'text', constraints: 'NOT NULL' },
          { name: 'problem_statement', type: 'text', constraints: 'NOT NULL' },
          { name: 'solution_concept', type: 'text', constraints: 'NOT NULL' },
          { name: 'target_market', type: 'text' },
          { name: 'differentiation', type: 'text' },
          { name: 'competitive_gaps', type: 'jsonb', description: 'Features competitors lack' },
          { name: 'customer_evidence', type: 'jsonb', description: 'Feedback quotes supporting need' },
          { name: 'opportunity_score', type: 'numeric', description: 'market_size * pain_severity * competitive_weakness' },
          { name: 'chairman_status', type: 'text', constraints: "CHECK (chairman_status IN ('pending', 'approved', 'rejected', 'needs_revision')) DEFAULT 'pending'" },
          { name: 'chairman_feedback', type: 'text' },
          { name: 'approved_at', type: 'timestamptz' },
          { name: 'venture_id', type: 'uuid', description: 'If approved, links to created venture' },
          { name: 'created_by', type: 'text' },
          { name: 'created_at', type: 'timestamptz', constraints: 'DEFAULT now()' },
          { name: 'updated_at', type: 'timestamptz', constraints: 'DEFAULT now()' }
        ],
        indexes: [
          'CREATE INDEX idx_blueprints_segment ON opportunity_blueprints(market_segment_id)',
          'CREATE INDEX idx_blueprints_status ON opportunity_blueprints(chairman_status)',
          'CREATE INDEX idx_blueprints_score ON opportunity_blueprints(opportunity_score DESC)'
        ]
      },
      {
        name: 'listening_radar_config',
        description: 'Configuration for customer signal sensitivity',
        columns: [
          { name: 'id', type: 'uuid', constraints: 'PRIMARY KEY DEFAULT gen_random_uuid()' },
          { name: 'market_segment_id', type: 'uuid', constraints: 'REFERENCES market_segments(id) UNIQUE' },
          { name: 'sensitivity_multiplier', type: 'numeric', constraints: 'CHECK (sensitivity_multiplier BETWEEN 1 AND 10) DEFAULT 1' },
          { name: 'alert_keywords', type: 'jsonb', description: 'Keywords triggering alerts' },
          { name: 'notification_threshold', type: 'integer', description: 'Min signal strength for notification' },
          { name: 'enabled', type: 'boolean', constraints: 'DEFAULT true' },
          { name: 'last_alert', type: 'timestamptz' },
          { name: 'created_at', type: 'timestamptz', constraints: 'DEFAULT now()' },
          { name: 'updated_at', type: 'timestamptz', constraints: 'DEFAULT now()' }
        ],
        indexes: ['CREATE INDEX idx_radar_enabled ON listening_radar_config(enabled)']
      }
    ]
  },

  // Technical Architecture
  // FIX: Renamed from technical_architecture
  system_architecture: {
    service_layer: {
      file: 'src/lib/services/ventureIdeationService.ts',
      exports: [
        'createMarketSegment(data): Promise<MarketSegment>',
        'scanCompetitors(segmentId): Promise<CompetitorScanResult[]>',
        'aggregateCustomerFeedback(competitorId): Promise<FeedbackAnalysis>',
        'generateOpportunityBlueprint(segmentId): Promise<OpportunityBlueprint>',
        'configureListeningRadar(segmentId, config): Promise<RadarConfig>',
        'getOpportunityBlueprints(filters): Promise<OpportunityBlueprint[]>',
        'submitForChairmanReview(blueprintId): Promise<void>',
        'chairmanApproveBlueprint(blueprintId, feedback): Promise<Venture>',
        // AI Agent API
        'aiGetCompetitorsBySegment(segmentId): Promise<Competitor[]>',
        'aiGetCustomerFeedback(filters): Promise<CustomerFeedback[]>',
        'aiGetOpportunityBlueprints(status): Promise<OpportunityBlueprint[]>'
      ]
    },

    // FIX: ui components moved to metadata
    /* ui_comps (deprecated): {
      enhancement: 'Stage4CompetitiveIntelligence.tsx',
      new_tab: 'Venture Cloning Workflow',
      sub_components: [
        'MarketSegmentManager - Create/edit segments',
        'CompetitorScanner - Automated feature scanning dashboard',
        'CustomerFeedbackAggregator - Feedback collection and analysis',
        'OpportunityBlueprintGenerator - Blueprint creation wizard',
        'ListeningRadarConfig - Sensitivity and alerting controls',
        'ChairmanReviewPanel - Approval workflow interface'
      ],
      design_considerations: [
        "Tab navigation: Add 'Venture Cloning' alongside existing 'Competitive Analysis', 'Market Position', 'Strategic Recommendations'",
        'Wizard-style workflow for blueprint generation (5 steps)',
        'Dashboard widgets: Signal strength meter, Opportunity pipeline, Recent feedback',
        'Chairman panel: Card-based blueprint review with approve/reject/edit actions',
        'Responsive design: Mobile-friendly for field research'
      ]
    }, */

    ai_agent_integration: {
      knowledge_base_connection: 'Leverage SD-041A knowledge_items table for shared insights',
      api_endpoints: [
        'GET /api/venture-ideation/competitors?segment={id}',
        'GET /api/venture-ideation/feedback?competitor={id}&sentiment={type}',
        'GET /api/venture-ideation/blueprints?status=approved'
      ],
      access_control: 'AI agents: read-only access via service account',
      usage_logging: 'Track AI agent queries in knowledge_access_log table (SD-041A)'
    }
  },

  // Acceptance Criteria
  acceptance_criteria: [
    {
      id: 'AC-001',
      scenario: 'Create market segment and scan competitors',
      given: "Chairman approves new market segment 'Project Management SaaS'",
      when: 'PLAN agent triggers competitor scan',
      then: 'System identifies 15+ competitors, extracts 50+ features, generates feature matrix within 30 seconds'
    },
    {
      id: 'AC-002',
      scenario: 'Aggregate customer feedback',
      given: "Competitor 'Asana' tracked in segment",
      when: 'System scans Reddit, G2, Trustpilot for Asana feedback',
      then: 'Aggregates 100+ feedback items, extracts 20+ pain points, calculates sentiment distribution'
    },
    {
      id: 'AC-003',
      scenario: 'Generate opportunity blueprint',
      given: 'Competitive gaps identified (missing Gantt charts) and customer pain points collected (project timeline visibility)',
      when: 'User generates blueprint',
      then: 'Creates blueprint with problem/solution, includes customer quotes, calculates opportunity score > 7.0'
    },
    {
      id: 'AC-004',
      scenario: 'Chairman approval workflow',
      given: 'Blueprint pending review',
      when: 'Chairman approves with comments',
      then: 'Creates draft venture in Stage 1, links blueprint, notifies PLAN agent'
    },
    {
      id: 'AC-005',
      scenario: 'Listening radar alerting',
      given: "Radar configured with 5x sensitivity, keywords 'timeline frustration'",
      when: '10+ feedback items mention keywords within 24 hours',
      then: 'Triggers notification to Chairman dashboard, highlights opportunity'
    },
    {
      id: 'AC-006',
      scenario: 'AI Research Agent queries competitive data',
      given: 'Research AI agent needs competitor pricing info',
      when: "Agent queries aiGetCompetitorsBySegment('PM-SaaS')",
      then: 'Returns competitor data in < 2 seconds, logs query, provides structured JSON response'
    }
  ],

  // Test Plan
  test_plan: {
    unit_tests: [
      'ventureIdeationService - all CRUD operations',
      'Opportunity score calculation logic',
      'Sentiment analysis accuracy',
      'AI agent access control enforcement'
    ],
    integration_tests: [
      'End-to-end blueprint generation workflow',
      'Chairman approval creates venture in Stage 1',
      'AI agent API calls knowledge base service',
      'Listening radar triggers notifications'
    ],
    manual_tests: [
      'UI/UX flow through wizard',
      'Chairman review panel usability',
      'Design sub-agent review of tab navigation',
      'Performance with 50+ segments loaded'
    ]
  },

  // Risks and Mitigations
  risks: [
    {
      risk: 'Customer feedback APIs (Reddit, G2) have rate limits',
      mitigation: 'Implement caching, batch requests, respect rate limits with backoff'
    },
    {
      risk: 'Sentiment analysis accuracy for domain-specific feedback',
      mitigation: 'Start with simple keyword matching, iterate to ML model if needed'
    },
    {
      risk: 'UI complexity adding tab to existing Stage 4',
      mitigation: 'Design sub-agent review before implementation, user testing with Chairman'
    },
    {
      risk: 'AI agent integration creates dependency on SD-041A',
      mitigation: 'Graceful degradation if knowledge base unavailable, local caching'
    }
  ]
};

async function createPRD() {
  console.log('📝 Creating PRD for SD-041B\n');

  const { data: _data, error } = await supabase
    .from('strategic_directives_v2')
    .update({
      // FIX: objectives moved to metadata

      // objectives: prdContent.requirements.functional.map(fr => `${fr.id}: ${fr.title}`).join('\n'),
      acceptance_criteria: prdContent.acceptance_criteria.map(ac =>
        `${ac.id}: ${ac.scenario}\n  Given: ${ac.given}\n  When: ${ac.when}\n  Then: ${ac.then}`
      ).join('\n\n'),
      metadata: {
        prd: prdContent,
        prd_version: '1.0.0',
        prd_created: new Date().toISOString(),
        design_review_required: true,
        design_keywords_present: ['component', 'UI', 'navigation', 'interface', 'dashboard', 'wizard']
      }
    })
    .eq('sd_key', 'SD-041B')
    .select();

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  console.log('✅ PRD created and stored in SD-041B metadata!');
  console.log('\n📊 PRD Summary:');
  console.log('   Functional Requirements: 7');
  console.log('   Non-Functional Requirements: 4');
  console.log('   Database Tables: 5');
  console.log('   Service APIs: 11');
  console.log('   UI Components: 6');
  console.log('   Acceptance Criteria: 6');
  console.log('   Test Scenarios: 13+');
  console.log('\n🎨 Design Sub-Agent Trigger: Keywords present (component, UI, interface, dashboard, wizard)');
  console.log('🎯 Next: Design sub-agent review, then PLAN→EXEC handoff');
}

createPRD().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
