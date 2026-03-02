#!/usr/bin/env node

/**
 * Create Strategic Directive: SD-CUSTOMER-INTEL-001
 * Customer Intelligence & Persona System (Stage 3 Enhancement)
 *
 * Build an AI-powered customer intelligence system that automates persona creation,
 * ICP scoring, customer journey mapping, and willingness-to-pay analysis.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createCustomerIntelSD() {
  console.log('🎯 Creating Strategic Directive: Customer Intelligence & Persona System');
  console.log('===================================================================================\n');

  const strategicDirective = {
    id: 'SD-CUSTOMER-INTEL-001',
    sd_key: 'SD-CUSTOMER-INTEL-001',
    title: 'Customer Intelligence & Persona System (Stage 3 Enhancement)',
    description: `Enhance Stage 3 (Comprehensive Validation) with a dedicated Customer Intelligence Agent that eliminates manual customer interviews by automating:
    - Deep market research via Reddit, forums, G2/Capterra, LinkedIn intelligence
    - AI-powered persona generation (demographics, psychographics, pain points, jobs-to-be-done)
    - ICP (Ideal Customer Profile) scoring with firmographic analysis
    - Customer journey mapping (awareness → consideration → decision → retention)
    - Willingness-to-pay analysis and pricing sensitivity modeling
    - Market segmentation with behavioral clustering and TAM/SAM/SOM breakdowns

    Integrates with CrewAI agent platform to provide structured, research-backed personas that inform all downstream stages (pricing, GTM, competitive analysis).`,
    priority: 'critical',
    status: 'draft',
    category: 'AI Platform Enhancement',
    rationale: `Customer understanding is the foundation of all venture success, yet the current workflow has:
    (1) NO dedicated stage for customer persona creation
    (2) NO structured database schema for personas, ICP profiles, or customer journeys
    (3) FRAGMENTED customer insights across stages 3, 17, and 32
    (4) MANUAL research burden that's slow and inconsistent
    (5) NO integration between existing Customer Segmentation Agent and workflow

    This creates:
    - Weak competitive analysis (Stage 4) without persona-competitor mapping
    - Poor pricing decisions (Stage 15) without willingness-to-pay data
    - Unfocused GTM strategies (Stage 17) without clear target personas
    - Reactive customer success (Stage 32) instead of proactive journey design

    Solution: Build a Customer Intelligence Agent that automates research and generates structured personas BEFORE competitive analysis, ensuring all downstream stages have strong customer foundations.`,
    scope: `MVP (1.5-2 weeks):
    - Customer Intelligence Agent (CrewAI) with 5 specialized tasks
    - Stage 3 UI enhancement with 4 new tabs (Personas, ICP, Journey, WTP)
    - Database schema: 5 new tables (customer_personas, icp_profiles, customer_journeys, willingness_to_pay, market_segments)
    - Integration with existing validation framework
    - E2E test: "Generate personas for B2B SaaS venture" → 3-5 personas with ICP scores >70

    Excludes (Future Phases):
    - Real-time persona updates from live customer data → SD-CUSTOMER-INTEL-002
    - Multi-persona A/B testing → SD-CUSTOMER-INTEL-003
    - Persona validation via actual customer interviews → SD-CUSTOMER-INTEL-004`,
    strategic_objectives: `1. RESEARCH AUTOMATION: Build Customer Intelligence Agent with web scraping (Reddit, G2, forums), sentiment analysis, and competitive intelligence gathering
2. PERSONA GENERATION: Create AI-powered persona builder that generates 3-5 personas per venture with 85%+ confidence scores
3. ICP SCORING: Implement firmographic analysis and ICP scoring (0-100 scale) with buying signal detection
4. JOURNEY MAPPING: Build customer journey mapper tracking awareness → consideration → decision → retention touchpoints
5. WTP ANALYSIS: Deploy willingness-to-pay analyzer using competitive pricing benchmarks and value perception modeling
6. DATABASE FOUNDATION: Design and implement 5-table schema with RLS policies, indexes, and foreign key constraints (via Database Architect)
7. STAGE 3 INTEGRATION: Enhance validation UI with 4 new tabs, real-time persona updates, and validation gates
8. DOWNSTREAM INTEGRATION: Connect personas to Stages 4 (competitive), 15 (pricing), 17 (GTM), 32 (customer success)
9. TESTING VALIDATION: E2E tests proving persona generation accuracy, ICP scoring reliability, journey map completeness`,
    success_criteria: [
      'Customer Intelligence Agent deployed in CrewAI platform with 5 tasks (research, personas, ICP, journey, WTP)',
      'Agent generates 3-5 personas per venture in <60 seconds with 85%+ confidence scores',
      'Database schema deployed with 5 tables, indexes, RLS policies, foreign keys (via Database Architect)',
      'Stage 3 UI enhanced with 4 new tabs: Persona Builder, ICP Score Card, Journey Map, WTP Matrix',
      'ICP scoring algorithm produces scores 0-100 with clear rationale and buying signals',
      'Customer journey maps include 4 stages (awareness, consideration, decision, retention) with touchpoints',
      'Willingness-to-pay analysis identifies acceptable price range and optimal pricing point',
      'Personas flow to downstream stages: Stage 4 (competitor-persona mapping), Stage 15 (WTP → pricing), Stage 17 (personas → target markets)',
      'E2E test passes: "Generate personas for B2B project management SaaS" → 3 personas (PM Manager, Team Lead, Executive Sponsor), ICP scores 75-90, journey maps complete, WTP range $15-$50/user/month',
      'Performance: Persona generation <60s, UI rendering <500ms, database queries <200ms'
    ],
    key_principles: `1. AI-FIRST RESEARCH: No manual interviews required, AI scrapes public data sources
2. DATABASE-DRIVEN: All personas, journeys, ICP data in Supabase (no markdown files)
3. CONFIDENCE SCORING: Every persona has AI confidence score (0-1), surface data quality
4. INTEGRATION-READY: Personas designed for downstream stage consumption
5. VALIDATION GATES: Minimum persona quality required to advance (ICP >70, confidence >0.85)
6. EXTENSIBLE: Architecture supports future persona validation via real customer interviews`,
    implementation_guidelines: `PHASE 1 - LEAD Strategic Planning (Days 1-2):
- Define research sources priority (Reddit > G2 > LinkedIn > Forums)
- Map B2B vs. B2C persona templates
- Design ICP scoring algorithm criteria
- Prioritize downstream integration points

PHASE 2 - PLAN Technical Design (Days 2-4):
- Design Customer Intelligence Agent task flow
- **Engage Database Architect sub-agent** for schema design:
  * customer_personas (demographics, psychographics, pain_points, jobs_to_be_done)
  * icp_profiles (firmographics, decision_makers, icp_score, buying_signals)
  * customer_journeys (persona_id FK, stage, touchpoints, pain_points_per_stage)
  * willingness_to_pay (segment_name, price_sensitivity_score, acceptable_price_range)
  * market_segments (segment_name, size, priority, persona_fit)
- Design Stage 3 UI wireframes (4 new tabs)
- Define validation gates (minimum ICP score, confidence thresholds)

PHASE 3 - EXEC Implementation (Days 5-10):
- Build Customer Intelligence Agent (CrewAI):
  * Task 1: Market Research (scrape Reddit, G2, forums, LinkedIn)
  * Task 2: Persona Generation (demographics, psychographics, JTBD)
  * Task 3: ICP Scoring (firmographics, buying signals)
  * Task 4: Journey Mapping (4 stages with touchpoints)
  * Task 5: WTP Analysis (price sensitivity, competitive anchors)
- **Database Architect executes migrations** (5 tables with RLS, indexes)
- Enhance Stage 3 UI:
  * PersonaBuilderTab.tsx (persona cards with AI confidence)
  * ICPScoreCard.tsx (0-100 score breakdown)
  * CustomerJourneyVisualization.tsx (interactive flowchart)
  * WTPMatrix.tsx (price range heat map)
- Create API endpoints:
  * POST /api/customer-intelligence/research
  * GET /api/customer-intelligence/:ventureId/personas
  * POST /api/customer-intelligence/icp-score
- Write E2E tests:
  * customer-intelligence-persona-generation.spec.ts
  * customer-intelligence-icp-scoring.spec.ts
  * customer-intelligence-stage3-integration.spec.ts

PHASE 4 - Testing & Integration (Days 11-12):
- E2E test suite (3 test scenarios)
- Performance testing (persona generation latency)
- Downstream integration testing (personas → Stage 4, 15, 17)
- User acceptance testing (persona quality validation)

PHASE 5 - Documentation & Handoff (Day 13):
- Agent documentation (task descriptions, research sources)
- UI documentation (how to use persona builder)
- Database schema documentation (table relationships)
- Downstream integration guide (how stages consume persona data)`,
    dependencies: `INTERNAL:
- Supabase database access (EHG application DB)
- CrewAI agent platform
- Stage 3 validation framework
- Database Architect sub-agent (for schema design/migration)

EXTERNAL:
- Reddit API (for forum research)
- G2 API or web scraping (for product reviews)
- LinkedIn Sales Navigator or similar (for ICP data)
- Web scraping tools (Playwright, BeautifulSoup)

TECHNICAL:
- TypeScript 5.x, React 18+
- CrewAI framework (Python 3.11+)
- PostgreSQL 15+ (Supabase)
- Recharts 2.x (for journey visualization)
- React Flow (for customer journey diagrams)`,
    risks: `RISK 1: AI-generated personas may be inaccurate without real customer validation
- MITIGATION: Confidence scoring, multiple data sources, human review required for high-stakes ventures

RISK 2: Web scraping rate limits and blocking (Reddit, G2, LinkedIn)
- MITIGATION: Implement backoff/retry logic, use multiple data sources, cache results

RISK 3: ICP scoring algorithm may not generalize across B2B/B2C/marketplace models
- MITIGATION: Configurable scoring weights per venture type, fallback to manual scoring

RISK 4: Database schema changes may impact existing validation framework
- MITIGATION: Database Architect reviews schema, backward compatibility checks, rollback plan

RISK 5: Stage 3 UI complexity increases (4 new tabs may overwhelm users)
- MITIGATION: Progressive disclosure, default to "Enhanced Framework" mode, skip option for simple ventures`,
    success_metrics: `BASELINE (before enhancement):
- NO structured personas → AFTER: 3-5 personas per venture with 85%+ confidence
- NO ICP scoring → AFTER: ICP scores 0-100 with buying signal identification
- NO customer journey maps → AFTER: 4-stage journeys with touchpoint analysis
- NO WTP analysis → AFTER: Price range recommendations with competitive anchors

TARGETS:
- Persona generation success rate: >90% (agent produces valid personas 90%+ of time)
- ICP scoring accuracy: >80% (scores correlate with actual customer fit)
- Journey map completeness: 100% (all 4 stages mapped with ≥3 touchpoints each)
- WTP accuracy: Within ±20% of actual market pricing
- Agent performance: <60 seconds for full research cycle
- UI performance: <500ms tab rendering, <200ms database queries
- Downstream adoption: >70% of ventures use persona data in Stages 4, 15, 17 within 2 weeks

PASS CRITERIA: All 10 success criteria met, E2E tests pass, performance targets achieved, Database Architect approves schema`,
    metadata: {
      timeline: {
        start_date: null,
        target_completion: '1.5-2 weeks',
        milestones: [
          'Days 1-2: LEAD strategic planning and source prioritization',
          'Days 2-4: PLAN technical design + Database Architect schema review',
          'Days 5-10: EXEC agent build + database migrations + UI enhancement',
          'Days 11-12: Testing + downstream integration validation',
          'Day 13: Documentation + handoff'
        ]
      },
      business_impact: 'CRITICAL - Customer understanding is foundational to all downstream stages (competitive, pricing, GTM)',
      technical_impact: 'Establishes reusable customer intelligence infrastructure, first AI-powered research agent in workflow',
      related_sds: [
        'SD-EVA-CONTENT-001 (may leverage content catalogue for persona storage)',
        'Future: SD-CUSTOMER-INTEL-002 (real-time persona updates)',
        'Future: SD-CUSTOMER-INTEL-003 (multi-persona A/B testing)'
      ],
      technical_details: {
        database_tables: [
          {
            name: 'customer_personas',
            purpose: 'Store AI-generated customer personas with demographics, psychographics, pain points, JTBD',
            estimated_rows: '3000+ (3-5 personas per venture × 1000 ventures)'
          },
          {
            name: 'icp_profiles',
            purpose: 'Ideal Customer Profile data with firmographics, decision makers, ICP scores',
            estimated_rows: '1000+ (1 ICP profile per venture)'
          },
          {
            name: 'customer_journeys',
            purpose: 'Customer journey maps per persona (4 stages: awareness, consideration, decision, retention)',
            estimated_rows: '3000+ (1 journey per persona)'
          },
          {
            name: 'willingness_to_pay',
            purpose: 'Price sensitivity analysis per market segment',
            estimated_rows: '2000+ (2-3 segments per venture)'
          },
          {
            name: 'market_segments',
            purpose: 'Market segmentation data (TAM/SAM/SOM, behavioral clusters)',
            estimated_rows: '3000+ (3 segments per venture average)'
          }
        ],
        agent_tasks: [
          {
            name: 'Market Research Task',
            input: 'Venture description, industry, target market',
            output: 'Structured research data (pain points, desires, objections)',
            sources: 'Reddit, G2, forums, LinkedIn, competitor reviews'
          },
          {
            name: 'Persona Generation Task',
            input: 'Research data from Task 1',
            output: '3-5 personas with demographics, psychographics, JTBD',
            ai_model: 'GPT-4 or Claude 3.5 Sonnet (structured JSON output)'
          },
          {
            name: 'ICP Scoring Task',
            input: 'Personas + firmographic data',
            output: 'ICP scores 0-100 with buying signal identification',
            algorithm: 'Weighted scoring: company size (30%), industry fit (25%), decision maker access (20%), buying signals (25%)'
          },
          {
            name: 'Journey Mapping Task',
            input: 'Personas + research data',
            output: 'Customer journey maps (4 stages with touchpoints)',
            visualization: 'React Flow diagram with pain points per stage'
          },
          {
            name: 'WTP Analysis Task',
            input: 'Personas + competitive pricing data',
            output: 'Acceptable price range, optimal price point, sensitivity score',
            methodology: 'Van Westendorp Price Sensitivity Meter + competitive anchoring'
          }
        ],
        ui_components: [
          {
            name: 'PersonaBuilderTab.tsx',
            purpose: 'Display AI-generated personas with edit capability',
            features: 'Persona cards, confidence scoring, demographic charts'
          },
          {
            name: 'ICPScoreCard.tsx',
            purpose: 'Show ICP score 0-100 with breakdown',
            features: 'Score gauge, rationale text, buying signal badges'
          },
          {
            name: 'CustomerJourneyVisualization.tsx',
            purpose: 'Interactive customer journey flowchart',
            features: 'React Flow diagram, touchpoint nodes, pain point annotations'
          },
          {
            name: 'WTPMatrix.tsx',
            purpose: 'Willingness-to-pay heat map',
            features: 'Price range slider, sensitivity visualization, competitive anchors'
          }
        ],
        performance_optimizations: [
          'Cache research results per industry (reduce redundant scraping)',
          'Parallel task execution in agent (research + scraping simultaneously)',
          'Database indexes on venture_id, persona_id for fast joins',
          'Lazy load persona details (only fetch when tab opened)',
          'Debounce UI updates during persona editing'
        ]
      },
      resource_requirements: [
        'Full-stack developer (primary) - 10 days full-time',
        'AI/ML engineer (CrewAI agent) - 5 days',
        'Database Architect (schema design) - 2 days',
        'QA engineer (E2E testing) - 2 days',
        'External API costs: $50-100/month (Reddit API, web scraping proxies)'
      ],
      estimated_loc: {
        agent_code: '~600 lines (5 tasks × 120 lines)',
        database_migration: '~300 lines SQL (5 tables)',
        ui_components: '~800 lines (4 components × 200 lines)',
        services: '~400 lines (API endpoints, data fetching)',
        tests: '~300 lines (E2E + unit tests)',
        total: '~2400 lines'
      }
    },
    target_application: 'EHG',
    created_by: 'Chairman',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    // Check if SD already exists
    const { data: existing } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('id', 'SD-CUSTOMER-INTEL-001')
      .maybeSingle();

    if (existing) {
      const { data: _data, error } = await supabase
        .from('strategic_directives_v2')
        .update(strategicDirective)
        .eq('id', 'SD-CUSTOMER-INTEL-001')
        .select()
        .single();

      if (error) throw error;
      console.log('✅ Strategic Directive updated successfully!');
    } else {
      const { data: _data, error } = await supabase
        .from('strategic_directives_v2')
        .insert(strategicDirective)
        .select()
        .single();

      if (error) throw error;
      console.log('✅ Strategic Directive created successfully!');
    }

    console.log('\n📊 SD Details:');
    console.log('   ID: SD-CUSTOMER-INTEL-001');
    console.log('   Title: Customer Intelligence & Persona System (Stage 3 Enhancement)');
    console.log('   Priority: CRITICAL (90+)');
    console.log('   Status: DRAFT (awaiting LEAD approval)');
    console.log('   Timeline: 1.5-2 weeks');
    console.log('   Impact: Foundational customer understanding for all downstream stages');

    console.log('\n🎯 MVP Scope:');
    console.log('   - Customer Intelligence Agent (5 CrewAI tasks)');
    console.log('   - 5 database tables (personas, ICP, journey, WTP, segments)');
    console.log('   - Stage 3 UI: 4 new tabs');
    console.log('   - Downstream integration (Stages 4, 15, 17, 32)');

    console.log('\n📈 Success Criteria:');
    console.log('   - 3-5 personas per venture in <60s with 85%+ confidence');
    console.log('   - ICP scores 0-100 with buying signal identification');
    console.log('   - Customer journey maps (4 stages, ≥3 touchpoints each)');
    console.log('   - WTP analysis with acceptable price range');

    console.log('\n📦 Deliverables:');
    console.log('   - CrewAI agent with 5 specialized tasks');
    console.log('   - 5 database tables (via Database Architect)');
    console.log('   - 4 new Stage 3 UI tabs');
    console.log('   - ~2400 lines of code');

    console.log('\n🔗 Downstream Integration:');
    console.log('   - Stage 4: Persona-competitor mapping');
    console.log('   - Stage 15: WTP data → pricing tiers');
    console.log('   - Stage 17: Personas → target markets, channels');
    console.log('   - Stage 32: Journey maps → onboarding flows');

    console.log('\n===================================================================================');
    console.log('Next steps:');
    console.log('1. Review and approve SD (LEAD agent)');
    console.log('2. Engage Database Architect for schema design');
    console.log('3. Create PRD with detailed technical specifications');
    console.log('4. Begin PLAN phase technical design');

    return strategicDirective;
  } catch (error) {
    console.error('❌ Error creating Strategic Directive:', error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    process.exit(1);
  }
}

// Export for use in other scripts
export { createCustomerIntelSD };

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  createCustomerIntelSD();
}
