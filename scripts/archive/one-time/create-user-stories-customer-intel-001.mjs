#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('📋 Product Requirements Expert: Creating User Stories for Customer Intelligence');
console.log('='.repeat(80));

const sdId = 'SD-CUSTOMER-INTEL-001';
const prdId = 'PRD-SD-CUSTOMER-INTEL-001';

const userStories = [
  // Subsystem 1: Persona Generation (US-001 to US-006)
  {
    id: 'US-CI-001',
    title: 'Generate customer personas from venture data',
    description: 'As a venture strategist, I want to generate AI-powered customer personas from my venture description so that I understand my target customers.',
    subsystem: 'Persona Generation',
    acceptance_criteria: [
      'Generate Customer Intelligence button visible in Stage 3',
      'AI agent executes persona generation task (5-10 minutes)',
      '3-5 personas generated per venture',
      'Each persona includes: name, type (primary/secondary), demographics, psychographics',
      'Personas stored in customer_personas database table',
      'Success notification when generation complete'
    ],
    story_points: 8,
    priority: 'critical',
    sprint: 1,
    test_scenario: 'User clicks Generate, agent runs, personas display in UI'
  },
  {
    id: 'US-CI-002',
    title: 'View persona demographics and psychographics',
    description: 'As a user, I want to view detailed demographics and psychographics for each persona so that I understand who my customers are.',
    subsystem: 'Persona Generation',
    acceptance_criteria: [
      'Persona card displays persona name and type',
      'Demographics tab shows: age range, job title, company size, location',
      'Psychographics tab shows: values, motivations, behaviors, preferences',
      'AI confidence score displayed (0.00-1.00)',
      'Data sourced from customer_personas.demographics and .psychographics JSONB columns'
    ],
    story_points: 5,
    priority: 'critical',
    sprint: 1,
    test_scenario: 'User selects persona, views demographics and psychographics tabs'
  },
  {
    id: 'US-CI-003',
    title: 'View persona pain points and jobs-to-be-done',
    description: 'As a product manager, I want to see what problems each persona faces so that I can validate my solution addresses real needs.',
    subsystem: 'Persona Generation',
    acceptance_criteria: [
      'Behavior tab displays pain points array (3-5 items)',
      'Jobs-to-be-done section lists functional and emotional jobs',
      'Current alternatives section shows competitive solutions',
      'Switching triggers identified',
      'Data sourced from customer_personas.pain_points and .jobs_to_be_done'
    ],
    story_points: 5,
    priority: 'high',
    sprint: 1,
    test_scenario: 'User views Behavior tab, sees pain points and JTBD'
  },
  {
    id: 'US-CI-004',
    title: 'View persona buying process',
    description: 'As a sales strategist, I want to understand how each persona makes buying decisions so that I can optimize my sales approach.',
    subsystem: 'Persona Generation',
    acceptance_criteria: [
      'Buying Process tab displays decision criteria (3-5 items)',
      'Decision makers identified with influence levels',
      'Budget authority and approval process documented',
      'Objections and concerns listed',
      'Data sourced from customer_personas JSONB fields'
    ],
    story_points: 3,
    priority: 'high',
    sprint: 2,
    test_scenario: 'User views Buying Process tab, sees decision criteria and objections'
  },
  {
    id: 'US-CI-005',
    title: 'Switch between multiple personas',
    description: 'As a user, I want to view all personas generated for my venture so that I can compare different customer segments.',
    subsystem: 'Persona Generation',
    acceptance_criteria: [
      'Persona selector dropdown shows all personas (3-5)',
      'Personas labeled by type (primary, secondary, tertiary)',
      'Priority rank displayed',
      'Active persona highlighted',
      'Switching updates all tabs instantly'
    ],
    story_points: 3,
    priority: 'medium',
    sprint: 2,
    test_scenario: 'User switches between personas via dropdown'
  },
  {
    id: 'US-CI-006',
    title: 'Regenerate personas',
    description: 'As a user, I want to regenerate personas if my venture description changes so that insights stay current.',
    subsystem: 'Persona Generation',
    acceptance_criteria: [
      'Regenerate button visible in Customer Intelligence tab',
      'Confirmation modal warns existing data will be replaced',
      'AI agent re-executes persona generation',
      'Old personas archived (soft delete pattern if implemented)',
      'New personas display after regeneration complete'
    ],
    story_points: 5,
    priority: 'medium',
    sprint: 3,
    test_scenario: 'User clicks Regenerate, confirms, new personas replace old'
  },

  // Subsystem 2: ICP Scoring (US-007 to US-010)
  {
    id: 'US-CI-007',
    title: 'View Ideal Customer Profile (ICP) score',
    description: 'As a venture strategist, I want to see my ICP score (0-100) so that I know how well-defined my target customer is.',
    subsystem: 'ICP Scoring',
    acceptance_criteria: [
      'ICP Score tab displays total score (0-100)',
      'Score breakdown shows: Company Size (30 pts), Industry Fit (25 pts), Decision Maker Access (20 pts), Buying Signals (25 pts)',
      'Progress bars for each component',
      'AI confidence score displayed',
      'Data sourced from icp_profiles table'
    ],
    story_points: 5,
    priority: 'critical',
    sprint: 1,
    test_scenario: 'User views ICP Score tab, sees 78/100 with breakdown'
  },
  {
    id: 'US-CI-008',
    title: 'View firmographics criteria',
    description: 'As a B2B strategist, I want to see firmographics for my ICP so that I understand company-level targeting.',
    subsystem: 'ICP Scoring',
    acceptance_criteria: [
      'Firmographics section displays: company size range, revenue range, industry verticals, geographic markets',
      'Technology stack preferences shown',
      'Growth stage indicators (startup, growth, enterprise)',
      'Data sourced from icp_profiles.firmographics JSONB'
    ],
    story_points: 3,
    priority: 'high',
    sprint: 2,
    test_scenario: 'User views ICP tab, sees firmographics criteria'
  },
  {
    id: 'US-CI-009',
    title: 'View ideal customer criteria',
    description: 'As a user, I want to see ideal customer criteria so that I can qualify leads effectively.',
    subsystem: 'ICP Scoring',
    acceptance_criteria: [
      'Ideal customer criteria section lists 5-7 must-have characteristics',
      'Nice-to-have criteria listed separately',
      'Disqualifying factors identified',
      'Data sourced from icp_profiles.ideal_customer_criteria'
    ],
    story_points: 3,
    priority: 'medium',
    sprint: 2,
    test_scenario: 'User views ideal customer criteria section'
  },
  {
    id: 'US-CI-010',
    title: 'View buying signals and triggers',
    description: 'As a sales professional, I want to see buying signals so that I know when prospects are ready to buy.',
    subsystem: 'ICP Scoring',
    acceptance_criteria: [
      'Buying signals section lists 3-5 key triggers',
      'Signal strength indicators (strong, moderate, weak)',
      'Timing considerations documented',
      'Data sourced from icp_profiles.buying_signals JSONB'
    ],
    story_points: 3,
    priority: 'medium',
    sprint: 3,
    test_scenario: 'User views buying signals in ICP tab'
  },

  // Subsystem 3: Customer Journey Mapping (US-011 to US-014)
  {
    id: 'US-CI-011',
    title: 'View 4-stage customer journey map',
    description: 'As a marketing strategist, I want to see the customer journey across 4 stages so that I can plan touchpoints at each stage.',
    subsystem: 'Customer Journey',
    acceptance_criteria: [
      'Journey Map tab displays 4 stages: Awareness → Consideration → Decision → Retention',
      'Visual flow with stage progression arrows',
      'Each stage clickable to expand details',
      'Data sourced from customer_journeys table (4 rows per persona)',
      'Stage order enforced (1-4) via CHECK constraint'
    ],
    story_points: 8,
    priority: 'critical',
    sprint: 2,
    test_scenario: 'User views Journey Map tab, sees 4 stages with navigation'
  },
  {
    id: 'US-CI-012',
    title: 'View touchpoints at each journey stage',
    description: 'As a marketer, I want to see touchpoints at each stage so that I can plan my content and campaigns.',
    subsystem: 'Customer Journey',
    acceptance_criteria: [
      'Each stage shows 3-5 touchpoint cards',
      'Touchpoint cards display: channel, content type, message',
      'Preferred channels highlighted',
      'Data sourced from customer_journeys.touchpoints array'
    ],
    story_points: 5,
    priority: 'high',
    sprint: 2,
    test_scenario: 'User expands stage, sees touchpoint cards'
  },
  {
    id: 'US-CI-013',
    title: 'View pain points and decision factors per stage',
    description: 'As a product strategist, I want to see stage-specific pain points and decision factors so that I can address concerns at each stage.',
    subsystem: 'Customer Journey',
    acceptance_criteria: [
      'Pain points section lists 2-4 pain points per stage',
      'Decision factors section lists 3-5 factors per stage',
      'Information needs documented',
      'Data sourced from customer_journeys.pain_points, .decision_factors, .information_needs'
    ],
    story_points: 5,
    priority: 'high',
    sprint: 3,
    test_scenario: 'User views pain points and decision factors for Consideration stage'
  },
  {
    id: 'US-CI-014',
    title: 'View critical path insights',
    description: 'As a venture lead, I want to see critical path insights so that I understand success factors and failure points.',
    subsystem: 'Customer Journey',
    acceptance_criteria: [
      'Critical Path section displays success factors (3-5 items)',
      'Failure points identified with severity',
      'Competitive advantages documented',
      'Opportunities for differentiation highlighted',
      'Data synthesized from all 4 journey stages'
    ],
    story_points: 5,
    priority: 'medium',
    sprint: 3,
    test_scenario: 'User views Critical Path section below journey map'
  },

  // Subsystem 4: Willingness to Pay (WTP) Analysis (US-015 to US-018)
  {
    id: 'US-CI-015',
    title: 'View willingness-to-pay price sensitivity analysis',
    description: 'As a pricing strategist, I want to see price sensitivity analysis so that I can set optimal pricing.',
    subsystem: 'WTP Analysis',
    acceptance_criteria: [
      'Pricing tab displays Van Westendorp Price Sensitivity Meter',
      'Price points shown: Too Cheap, Min Acceptable, Optimal, Max Acceptable, Too Expensive',
      'Sensitivity score displayed (0.00-1.00)',
      'Value perception indicator (high/medium/low)',
      'Data sourced from willingness_to_pay table'
    ],
    story_points: 8,
    priority: 'critical',
    sprint: 3,
    test_scenario: 'User views Pricing tab, sees price sensitivity chart'
  },
  {
    id: 'US-CI-016',
    title: 'View competitive pricing anchors',
    description: 'As a user, I want to see how competitors price similar solutions so that I can position my pricing.',
    subsystem: 'WTP Analysis',
    acceptance_criteria: [
      'Competitive anchors section lists 3-5 competitors',
      'Each competitor shows: name, price point, positioning',
      'Your pricing displayed in context of competitors',
      'Data sourced from willingness_to_pay.competitive_anchors array'
    ],
    story_points: 3,
    priority: 'high',
    sprint: 4,
    test_scenario: 'User views competitive anchors section in Pricing tab'
  },
  {
    id: 'US-CI-017',
    title: 'View 3-tier pricing recommendations',
    description: 'As a product manager, I want to see 3-tier pricing recommendations so that I can implement tiered pricing.',
    subsystem: 'WTP Analysis',
    acceptance_criteria: [
      'Pricing tiers section displays 3 tiers: Starter, Professional, Enterprise',
      'Each tier shows: price, target customer, feature set, value proposition',
      'Annual pricing discounts calculated',
      'Data sourced from willingness_to_pay.pricing_tiers JSONB'
    ],
    story_points: 5,
    priority: 'high',
    sprint: 4,
    test_scenario: 'User views 3-tier pricing recommendations'
  },
  {
    id: 'US-CI-018',
    title: 'View feature-value mapping',
    description: 'As a product strategist, I want to see which features drive value perception so that I can prioritize development.',
    subsystem: 'WTP Analysis',
    acceptance_criteria: [
      'Feature-value map displays features ranked by perceived value',
      'Value score for each feature (1-10)',
      'Must-have vs nice-to-have classification',
      'Data sourced from willingness_to_pay.feature_value_map JSONB'
    ],
    story_points: 5,
    priority: 'medium',
    sprint: 4,
    test_scenario: 'User views feature-value map in Pricing tab'
  },

  // Subsystem 5: Integration & UI (US-019 to US-022)
  {
    id: 'US-CI-019',
    title: 'Access Customer Intelligence from Stage 3',
    description: 'As a user, I want to access Customer Intelligence from Stage 3 Comprehensive Validation so that insights are available at the right workflow stage.',
    subsystem: 'Integration',
    acceptance_criteria: [
      'Customer Intelligence tab added to Stage 3 tabs (4th tab)',
      'Tab visible after Market Analysis, Technical Assessment, Financial Modeling',
      'Tab displays "Generate Customer Intelligence" button when no data exists',
      'Tab loads existing data if already generated',
      'Integration guide followed (STAGE3_CUSTOMER_INTEL_INTEGRATION_GUIDE.md)'
    ],
    story_points: 5,
    priority: 'critical',
    sprint: 1,
    test_scenario: 'User navigates to Stage 3, sees Customer Intelligence tab'
  },
  {
    id: 'US-CI-020',
    title: 'View loading states during AI generation',
    description: 'As a user, I want to see progress while AI generates insights so that I know the system is working.',
    subsystem: 'Integration',
    acceptance_criteria: [
      'Loading spinner displays during generation (5-10 minutes)',
      'Progress indicator shows: Market Research → Personas → ICP → Journey → WTP',
      'Estimated time remaining displayed',
      'Cancel button available (stops agent execution)',
      'Toast notifications for each phase completion'
    ],
    story_points: 5,
    priority: 'high',
    sprint: 2,
    test_scenario: 'User clicks Generate, sees loading states and progress'
  },
  {
    id: 'US-CI-021',
    title: 'Handle errors gracefully',
    description: 'As a user, I want to see clear error messages if generation fails so that I can retry or get help.',
    subsystem: 'Integration',
    acceptance_criteria: [
      'Error toast displays if agent fails',
      'Error message includes: failure reason, retry button, contact support link',
      'Partial results displayed if some tasks complete',
      'Error logged to sub_agent_execution_results table',
      'Retry button re-triggers agent'
    ],
    story_points: 3,
    priority: 'high',
    sprint: 3,
    test_scenario: 'Agent fails, user sees error message with retry option'
  },
  {
    id: 'US-CI-022',
    title: 'Persist data across page reloads',
    description: 'As a user, I want generated insights to persist so that I don\'t lose my work.',
    subsystem: 'Integration',
    acceptance_criteria: [
      'All persona data stored in database (5 tables)',
      'Data loaded from database on page load',
      'No data loss on browser refresh',
      'Data linked to venture_id via foreign keys',
      'RLS policies ensure multi-tenant data isolation'
    ],
    story_points: 3,
    priority: 'critical',
    sprint: 1,
    test_scenario: 'User generates data, refreshes page, data still displays'
  },

  // Subsystem 6: Downstream Integration (US-023 to US-026)
  {
    id: 'US-CI-023',
    title: 'Use personas in Stage 4 Competitive Intelligence',
    description: 'As a user, I want to see which competitors appeal to each persona so that I can differentiate effectively.',
    subsystem: 'Downstream Integration',
    acceptance_criteria: [
      'Stage 4 displays personas from customer_personas table',
      'Competitor analysis mapped to persona pain points',
      'Persona-competitor fit scores shown',
      'Data queried from customer_personas and competitors tables'
    ],
    story_points: 5,
    priority: 'medium',
    sprint: 5,
    test_scenario: 'User views Stage 4, sees persona-competitor mapping'
  },
  {
    id: 'US-CI-024',
    title: 'Pre-populate pricing in Stage 15 from WTP data',
    description: 'As a user, I want pricing recommendations from Stage 3 to pre-populate Stage 15 so that I don\'t duplicate work.',
    subsystem: 'Downstream Integration',
    acceptance_criteria: [
      'Stage 15 queries willingness_to_pay table for venture_id',
      'Pricing tiers pre-populated (Starter, Professional, Enterprise)',
      'Optimal price suggested as default',
      'Competitive anchors displayed as reference',
      'User can override AI recommendations'
    ],
    story_points: 5,
    priority: 'medium',
    sprint: 5,
    test_scenario: 'User reaches Stage 15, sees pricing pre-populated from Stage 3'
  },
  {
    id: 'US-CI-025',
    title: 'Use personas in Stage 17 GTM Strategy',
    description: 'As a GTM strategist, I want to use personas to prioritize channels so that I focus on where my customers are.',
    subsystem: 'Downstream Integration',
    acceptance_criteria: [
      'Stage 17 displays personas with preferred channels',
      'Channel prioritization based on persona touchpoints',
      'Messaging templates per persona',
      'Content strategy aligned with persona information needs',
      'Data queried from customer_personas and customer_journeys'
    ],
    story_points: 8,
    priority: 'medium',
    sprint: 6,
    test_scenario: 'User views Stage 17, sees persona-driven GTM strategy'
  },
  {
    id: 'US-CI-026',
    title: 'Use retention data in Stage 32 Customer Success',
    description: 'As a customer success manager, I want to use retention stage data to design onboarding and reduce churn.',
    subsystem: 'Downstream Integration',
    acceptance_criteria: [
      'Stage 32 displays retention stage from customer journey',
      'Onboarding flows based on persona jobs-to-be-done',
      'Churn prediction based on persona objections',
      'Success metrics aligned with persona value expectations',
      'Data queried from customer_journeys (stage 4: Retention)'
    ],
    story_points: 5,
    priority: 'low',
    sprint: 6,
    test_scenario: 'User views Stage 32, sees retention insights from Stage 3'
  }
];

// Calculate totals
const totalStoryPoints = userStories.reduce((sum, story) => sum + story.story_points, 0);
const bySprint = userStories.reduce((acc, story) => {
  acc[story.sprint] = (acc[story.sprint] || 0) + story.story_points;
  return acc;
}, {});

console.log(`\n🎯 Linking ${userStories.length} user stories to: ${sdId}\n`);

// Update SD metadata with user stories
const { error: updateSDError } = await supabase
  .from('strategic_directives_v2')
  .update({
    metadata: {
      lead_approval_date: new Date().toISOString(),
      estimated_story_points: totalStoryPoints,
      estimated_sprints: '4-6 sprints',
      lead_decision: 'APPROVED - Customer Intelligence & Persona System for Stage 3',
      user_directive: 'Add AI-powered customer research to venture workflow',
      subsystems: [
        { name: 'Persona Generation', story_points: 29, description: 'AI-powered customer personas with demographics, psychographics, JTBD' },
        { name: 'ICP Scoring', story_points: 14, description: 'Ideal Customer Profile scoring 0-100 with firmographics' },
        { name: 'Customer Journey', story_points: 23, description: '4-stage journey mapping with touchpoints and pain points' },
        { name: 'WTP Analysis', story_points: 21, description: 'Willingness-to-pay pricing analysis with tier recommendations' },
        { name: 'Integration & UI', story_points: 16, description: 'Stage 3 integration and loading states' },
        { name: 'Downstream Integration', story_points: 23, description: 'Integration with Stages 4, 15, 17, 32' }
      ],
      lead_notes: [
        'Applied SIMPLICITY FIRST evaluation - scope is appropriate for value delivered',
        'Database schema approved by DATABASE sub-agent (95% confidence PASS)',
        'All UI components already created during PLAN phase',
        'Customer Intelligence Agent architecture defined',
        '5 database tables: customer_personas, icp_profiles, customer_journeys, willingness_to_pay, market_segments'
      ],
      user_stories: userStories,
      database_schema: {
        tables: 5,
        migration_file: '20251011_customer_intelligence_schema.sql',
        database_architect_verdict: 'PASS (95% confidence)',
        review_document: 'DATABASE_SUBAGENT_REVIEW_SD-CUSTOMER-INTEL-001.md'
      }
    }
  })
  .eq('id', sdId);

if (updateSDError) {
  console.error('❌ Error updating SD with user stories:', updateSDError);
  process.exit(1);
}

// Update PRD with user stories
const { error: updatePRDError } = await supabase
  .from('product_requirements_v2')
  .update({
    backlog_items: userStories,
    metadata: {
      user_stories_count: userStories.length,
      total_story_points: totalStoryPoints,
      sprint_breakdown: bySprint,
      subsystems: 6
    }
  })
  .eq('id', prdId);

if (updatePRDError) {
  console.error('❌ Error updating PRD with user stories:', updatePRDError);
  process.exit(1);
}

console.log(`✅ User Stories Created and Linked`);
console.log(`\n📊 Summary:`);
console.log(`   Total User Stories: ${userStories.length}`);
console.log(`   Total Story Points: ${totalStoryPoints}`);
console.log(`\n📦 By Subsystem:`);
console.log(`     - Persona Generation: 6 stories (US-CI-001 to US-CI-006) - 29 points`);
console.log(`     - ICP Scoring: 4 stories (US-CI-007 to US-CI-010) - 14 points`);
console.log(`     - Customer Journey: 4 stories (US-CI-011 to US-CI-014) - 23 points`);
console.log(`     - WTP Analysis: 4 stories (US-CI-015 to US-CI-018) - 21 points`);
console.log(`     - Integration & UI: 4 stories (US-CI-019 to US-CI-022) - 16 points`);
console.log(`     - Downstream Integration: 4 stories (US-CI-023 to US-CI-026) - 23 points`);
console.log(`\n📈 Story Points by Sprint:`);
Object.keys(bySprint).sort().forEach(sprint => {
  console.log(`     - Sprint ${sprint}: ${bySprint[sprint]} points`);
});
console.log(`\n✅ Data stored in:`);
console.log(`   - strategic_directives_v2.metadata.user_stories`);
console.log(`   - product_requirements_v2.backlog_items`);
console.log('\n' + '='.repeat(80));
console.log('🎯 Ready for PLAN→EXEC handoff');
