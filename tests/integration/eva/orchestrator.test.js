/**
 * EVA Orchestrator Pipeline Integration Tests
 *
 * Tests the full processStage() pipeline from lib/eva/eva-orchestrator.js
 * with mocked Supabase and mock templates. Validates artifact persistence,
 * gate enforcement, error handling, and full 25-stage pipeline execution.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock sd-key-generator (has shebang that vitest can't transform)
vi.mock('../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn().mockReturnValue('SD-TEST-ORCH-001'),
  generateChildKey: vi.fn().mockReturnValue('SD-TEST-ORCH-001-A'),
  normalizeVenturePrefix: vi.fn().mockReturnValue('TEST'),
}));

import { processStage } from '../../../lib/eva/eva-orchestrator.js';

// ── Test Data Generators (all 25 stages) ────────────────────────

function genStage01() {
  return {
    description: 'A platform that connects local artisans with global buyers through AI-powered matching and logistics',
    problemStatement: 'Artisans struggle to reach global markets due to high logistics costs',
    valueProp: 'AI-powered marketplace that reduces logistics cost by 40%',
    targetMarket: 'Small artisan businesses in developing economies',
    archetype: 'marketplace',
    keyAssumptions: ['Global demand for artisan goods is growing', 'AI can optimize logistics routes'],
    moatStrategy: 'Network effects and proprietary logistics AI',
    successCriteria: ['10K active sellers in 12 months', '$1M GMV in 6 months'],
    sourceProvenance: {},
  };
}

function genStage02() {
  return {
    analysis: {
      strategic: 'The marketplace model aligns well with the growing artisan economy trend',
      technical: 'AI-powered matching is technically feasible with current NLP capabilities',
      tactical: 'Start with 3 high-density artisan regions for initial supply acquisition',
    },
    metrics: {
      marketFit: 75, customerNeed: 80, momentum: 65,
      revenuePotential: 70, competitiveBarrier: 60, executionFeasibility: 72,
    },
    evidence: {
      market: 'TAM analysis shows $50B global artisan goods market growing at 8% CAGR',
      customer: '200 artisan interviews confirm logistics as top pain point',
      competitive: 'No AI-powered artisan marketplace exists; closest is Etsy (manual matching)',
      execution: 'Team has relevant marketplace and AI experience from prior ventures',
    },
    suggestions: [
      { type: 'immediate', text: 'Validate pricing with 50 target artisan users in pilot region' },
      { type: 'strategic', text: 'Build early partnerships with logistics providers in key regions' },
    ],
  };
}

function genStage03() {
  return {
    marketFit: 75, customerNeed: 80, momentum: 65,
    revenuePotential: 70, competitiveBarrier: 60, executionFeasibility: 72,
    competitorEntities: [
      { name: 'CompetitorA', positioning: 'Market leader', threat_level: 'H' },
      { name: 'CompetitorB', positioning: 'Niche player', threat_level: 'M' },
    ],
    confidenceScores: { marketFit: 0.8, customerNeed: 0.9 },
  };
}

function genStage04() {
  return {
    competitors: [
      {
        name: 'CompetitorA', position: 'Market leader in artisan goods', threat: 'H',
        pricingModel: 'subscription', marketPosition: 'Dominant',
        strengths: ['Strong brand recognition', 'Large user base'],
        weaknesses: ['Slow to innovate', 'High fees'],
        swot: { strengths: ['Brand'], weaknesses: ['Slow'], opportunities: ['New markets'], threats: ['Disruption'] },
      },
      {
        name: 'CompetitorB', position: 'Niche artisan marketplace', threat: 'M',
        pricingModel: 'freemium', marketPosition: 'Growing',
        strengths: ['Agile development', 'Low fees'],
        weaknesses: ['Small team', 'Limited reach'],
        swot: { strengths: ['Agile'], weaknesses: ['Small team'], opportunities: ['Growth'], threats: ['Funding'] },
      },
      {
        name: 'CompetitorC', position: 'Emerging logistics platform', threat: 'L',
        pricingModel: 'usage_based', marketPosition: 'New entrant',
        strengths: ['Advanced tech stack', 'AI capabilities'],
        weaknesses: ['Unknown brand', 'No marketplace'],
        swot: { strengths: ['Tech'], weaknesses: ['Unknown'], opportunities: ['Partnership'], threats: ['Regulation'] },
      },
    ],
    blueOceanAnalysis: { eliminate: ['High fees'], reduce: ['Complexity'], raise: ['AI matching'], create: ['Global logistics'] },
  };
}

function genStage05() {
  return {
    initialInvestment: 100000,
    year1: { revenue: 200000, cogs: 80000, opex: 60000 },
    year2: { revenue: 400000, cogs: 140000, opex: 100000 },
    year3: { revenue: 700000, cogs: 200000, opex: 150000 },
    unitEconomics: { cac: 50, ltv: 300, churnRate: 0.05, paybackMonths: 6, grossMargin: 0.6 },
    scenarioAnalysis: { pessimisticMultiplier: 0.7, optimisticMultiplier: 1.3, robustness: 'normal' },
    assumptions: { growthRate: 0.15, retentionRate: 0.95 },
  };
}

function genStage06() {
  const categories = ['Market', 'Product', 'Technical', 'Legal/Compliance', 'Financial', 'Operational'];
  const risks = [];
  for (let i = 0; i < 6; i++) {
    risks.push({
      id: `RISK-${String(i + 1).padStart(3, '0')}`,
      category: categories[i % 6],
      description: `Detailed description of risk number ${i + 1} that exceeds minimum length`,
      severity: Math.min(5, (i % 5) + 1),
      probability: Math.min(5, (i % 5) + 1),
      impact: Math.min(5, (i % 5) + 1),
      mitigation: `Detailed mitigation strategy for risk number ${i + 1} exceeding minimum`,
      owner: `Risk Owner ${i + 1}`,
      status: ['open', 'mitigated', 'accepted', 'open', 'open', 'closed'][i],
      review_date: '2026-06-01',
      residual_severity: Math.max(1, (i % 5)),
      residual_probability: Math.max(1, (i % 5)),
      residual_impact: Math.max(1, (i % 5)),
    });
  }
  return { risks };
}

function genStage07() {
  return {
    currency: 'USD',
    pricing_model: 'subscription',
    primaryValueMetric: 'active users',
    priceAnchor: 29.99,
    competitiveContext: 'Mid-market pricing aligned with value delivery',
    tiers: [
      { name: 'Starter', price: 9.99, billing_period: 'monthly', included_units: '100 users', target_segment: 'Small businesses' },
      { name: 'Pro', price: 29.99, billing_period: 'monthly', included_units: '500 users', target_segment: 'Mid-market' },
      { name: 'Enterprise', price: 99.99, billing_period: 'monthly', included_units: 'Unlimited', target_segment: 'Enterprise' },
    ],
    gross_margin_pct: 75,
    churn_rate_monthly: 5,
    cac: 50,
    arpa: 29.99,
  };
}

function genStage08() {
  const blocks = {};
  const BMC_BLOCKS = [
    'customerSegments', 'valuePropositions', 'channels', 'customerRelationships',
    'revenueStreams', 'keyResources', 'keyActivities', 'keyPartnerships', 'costStructure',
  ];
  for (const block of BMC_BLOCKS) {
    blocks[block] = {
      items: [
        { text: `${block} item 1`, priority: 1, evidence: 'Market research' },
        { text: `${block} item 2`, priority: 2, evidence: 'User interviews' },
      ],
    };
  }
  return blocks;
}

function genStage09() {
  return {
    exit_thesis: 'Strategic acquisition by a major marketplace platform within 5-7 years after reaching $10M ARR',
    exit_horizon_months: 72,
    exit_paths: [
      { type: 'Acquisition', description: 'Strategic acquisition by marketplace platform', probability_pct: 60 },
      { type: 'IPO', description: 'Public offering after sustained growth', probability_pct: 20 },
    ],
    target_acquirers: [
      { name: 'Amazon', rationale: 'Logistics synergy', fit_score: 4 },
      { name: 'Etsy', rationale: 'Artisan marketplace alignment', fit_score: 5 },
      { name: 'Shopify', rationale: 'SMB commerce platform', fit_score: 3 },
    ],
    milestones: [
      { date: '2027-Q1', success_criteria: 'Reach $1M ARR' },
      { date: '2028-Q1', success_criteria: 'Reach $5M ARR' },
    ],
  };
}

function genStage10() {
  const criteria = [
    { name: 'memorability', weight: 25 },
    { name: 'relevance', weight: 25 },
    { name: 'uniqueness', weight: 20 },
    { name: 'pronounceability', weight: 15 },
    { name: 'availability', weight: 15 },
  ];
  const candidates = [];
  for (let i = 0; i < 5; i++) {
    const scores = {};
    for (const c of criteria) {
      scores[c.name] = 70 + i * 3; // deterministic scores
    }
    candidates.push({
      name: `BrandName${i + 1}`,
      rationale: `Rationale for candidate ${i + 1}`,
      scores,
    });
  }
  return {
    brandGenome: {
      archetype: 'marketplace',
      values: ['trust', 'craft'],
      tone: 'Warm and professional',
      audience: 'Small artisan businesses',
      differentiators: ['AI logistics', 'Global reach'],
    },
    scoringCriteria: criteria,
    candidates,
    narrativeExtension: { vision: 'Empower artisans globally', mission: 'Connect craft to commerce', brandVoice: 'Warm, authentic, empowering' },
    namingStrategy: 'descriptive',
    chairmanGate: { status: 'approved', rationale: 'Brand direction approved', decision_id: 'test-decision-10' },
  };
}

function genStage11() {
  const tiers = [];
  for (let i = 0; i < 3; i++) {
    tiers.push({
      name: `Tier ${i + 1}`,
      description: `Target market tier ${i + 1} description`,
      persona: `Persona ${i + 1}`,
      painPoints: [`Pain ${i + 1}a`, `Pain ${i + 1}b`],
      tam: 1000000 * (i + 1),
      sam: 500000 * (i + 1),
      som: 100000 * (i + 1),
    });
  }
  const channels = [];
  const channelNames = ['Organic Search', 'Paid Search', 'Social Media', 'Content Marketing', 'Email Marketing', 'Partnerships', 'Events', 'Direct Sales'];
  const channelTypes = ['organic', 'paid', 'organic', 'owned', 'owned', 'earned', 'earned', 'paid'];
  for (let i = 0; i < 8; i++) {
    channels.push({
      name: channelNames[i],
      channelType: channelTypes[i],
      primaryTier: `Tier ${(i % 3) + 1}`,
      monthly_budget: 1000 * (i + 1),
      expected_cac: 20 + i * 5,
      target_cac: 15 + i * 3,
      primary_kpi: `KPI for ${channelNames[i]}`,
    });
  }
  return {
    tiers,
    channels,
    launch_timeline: [
      { milestone: 'Soft launch', date: '2026-Q2', owner: 'Marketing' },
      { milestone: 'Full launch', date: '2026-Q3', owner: 'Marketing' },
    ],
  };
}

function genStage12() {
  return {
    sales_model: 'hybrid',
    sales_cycle_days: 30,
    deal_stages: [
      { name: 'Prospecting', description: 'Identify and qualify potential customers' },
      { name: 'Discovery', description: 'Understand needs and pain points', avg_duration_days: 7, mappedFunnelStage: 'Interest' },
      { name: 'Proposal', description: 'Present solution and pricing options', avg_duration_days: 5, mappedFunnelStage: 'Consideration' },
      { name: 'Closing', description: 'Negotiate and finalize the deal', avg_duration_days: 10, mappedFunnelStage: 'Purchase' },
    ],
    funnel_stages: [
      { name: 'Awareness', metric: 'impressions', target_value: 100000, conversionRateEstimate: 0.02 },
      { name: 'Interest', metric: 'visits', target_value: 2000, conversionRateEstimate: 0.15 },
      { name: 'Consideration', metric: 'signups', target_value: 300, conversionRateEstimate: 0.15 },
      { name: 'Purchase', metric: 'customers', target_value: 45, conversionRateEstimate: 0.15 },
    ],
    customer_journey: [
      { step: 'Discovery', funnel_stage: 'Awareness', touchpoint: 'SEO and social media' },
      { step: 'Evaluation', funnel_stage: 'Interest', touchpoint: 'Website and product demo' },
      { step: 'Onboarding', funnel_stage: 'Consideration', touchpoint: 'Email nurture sequence' },
      { step: 'Activation', funnel_stage: 'Purchase', touchpoint: 'In-app guided setup' },
      { step: 'Advocacy', funnel_stage: 'Purchase', touchpoint: 'Review and referral program' },
    ],
  };
}

function genStage13() {
  return {
    vision_statement: 'Build the leading AI-powered artisan marketplace connecting global buyers with local craft producers',
    milestones: [
      { name: 'MVP Launch', date: '2026-03-01', deliverables: ['Core marketplace', 'Payment integration'], priority: 'now', dependencies: [] },
      { name: 'AI Matching Engine', date: '2026-06-15', deliverables: ['Matching algorithm', 'Recommendation engine'], priority: 'next', dependencies: ['MVP Launch'] },
      { name: 'Logistics Integration', date: '2026-09-30', deliverables: ['Shipping API', 'Tracking dashboard'], priority: 'later', dependencies: ['MVP Launch'] },
    ],
    phases: [
      { name: 'Phase 1: Foundation', start_date: '2026-03-01', end_date: '2026-06-14' },
      { name: 'Phase 2: Intelligence', start_date: '2026-06-15', end_date: '2026-09-30' },
    ],
  };
}

function genStage14() {
  const layers = {};
  for (const l of ['presentation', 'api', 'business_logic', 'data', 'infrastructure']) {
    layers[l] = {
      technology: `${l} tech`,
      components: [`${l}-component-1`, `${l}-component-2`],
      rationale: `Rationale for ${l} technology choice`,
    };
  }
  return {
    architecture_summary: 'Microservices architecture with React frontend, Node.js API, PostgreSQL data layer',
    layers,
    security: {
      authStrategy: 'JWT with refresh tokens',
      dataClassification: 'PII-sensitive with encryption at rest',
      complianceRequirements: ['GDPR', 'PCI-DSS'],
    },
    dataEntities: [
      { name: 'User', description: 'Platform users', relationships: ['Order', 'Product'], estimatedVolume: '100K' },
      { name: 'Product', description: 'Artisan products', relationships: ['User', 'Order'], estimatedVolume: '500K' },
    ],
    integration_points: [
      { name: 'Payment Gateway', source_layer: 'api', target_layer: 'infrastructure', protocol: 'REST' },
      { name: 'Search Engine', source_layer: 'business_logic', target_layer: 'data', protocol: 'gRPC' },
    ],
    constraints: [
      { name: 'Response time', description: 'API responses under 200ms p95', category: 'performance' },
    ],
  };
}

function genStage15() {
  return {
    risks: [
      {
        title: 'Data breach risk', description: 'PII exposure through API vulnerability',
        owner: 'Security Lead', severity: 'critical', priority: 'immediate',
        mitigationPlan: 'Implement WAF and regular pen testing',
        contingencyPlan: 'Incident response plan and customer notification',
      },
      {
        title: 'Vendor lock-in', description: 'Heavy dependence on single cloud provider',
        owner: 'CTO', severity: 'medium', priority: 'long_term',
        mitigationPlan: 'Use container abstraction and multi-cloud strategy',
      },
    ],
  };
}

function genStage16() {
  const projections = [];
  for (let i = 1; i <= 12; i++) {
    projections.push({
      month: i,
      revenue: 5000 * i,
      costs: 15000 + 1000 * i,
      cost_breakdown: { personnel: 8000, infrastructure: 3000, marketing: 2000 + 500 * i, other: 2000 },
    });
  }
  return {
    initial_capital: 200000,
    monthly_burn_rate: 20000,
    revenue_projections: projections,
    funding_rounds: [
      { round_name: 'Seed', target_amount: 500000, target_date: '2026-Q3' },
    ],
  };
}

function genStage17() {
  const checklist = {};
  for (const cat of ['architecture', 'team_readiness', 'tooling', 'environment', 'dependencies']) {
    checklist[cat] = [
      { name: `${cat} item 1`, status: 'complete', owner: 'Tech Lead', notes: '' },
      { name: `${cat} item 2`, status: 'complete', owner: 'DevOps', notes: '' },
    ];
  }
  return { checklist, blockers: [] };
}

function genStage18() {
  return {
    sprint_name: 'Sprint 1 - MVP Core',
    sprint_duration_days: 14,
    sprint_goal: 'Deliver core marketplace features: product listing, search, and checkout',
    items: [
      {
        title: 'Product listing page', description: 'Create CRUD for product listings',
        priority: 'critical', type: 'feature', scope: 'Marketplace core',
        success_criteria: 'Users can list and browse products',
        dependencies: [], risks: ['API latency'],
        target_application: 'web-app', story_points: 8,
      },
      {
        title: 'Search functionality', description: 'Implement product search with filters',
        priority: 'high', type: 'feature', scope: 'Search module',
        success_criteria: 'Search returns results in under 200ms',
        dependencies: ['Product listing page'], risks: [],
        target_application: 'web-app', story_points: 5,
      },
    ],
  };
}

function genStage19() {
  return {
    tasks: [
      { name: 'Build product listing API', status: 'done', assignee: 'Dev 1', sprint_item_ref: 'item-1' },
      { name: 'Build search API', status: 'done', assignee: 'Dev 2', sprint_item_ref: 'item-2' },
      { name: 'Build checkout flow', status: 'in_progress', assignee: 'Dev 1', sprint_item_ref: 'item-3' },
    ],
    issues: [
      { description: 'Search index slow on large datasets', severity: 'medium', status: 'investigating' },
    ],
  };
}

function genStage20() {
  return {
    test_suites: [
      { name: 'Unit Tests', type: 'unit', total_tests: 150, passing_tests: 148, coverage_pct: 82 },
      { name: 'Integration Tests', type: 'integration', total_tests: 45, passing_tests: 44, coverage_pct: 70 },
      { name: 'E2E Tests', type: 'e2e', total_tests: 20, passing_tests: 19, coverage_pct: 65 },
    ],
    known_defects: [
      { description: 'Minor UI alignment on mobile', severity: 'low', status: 'open' },
    ],
  };
}

function genStage21() {
  return {
    integrations: [
      { name: 'Payment Gateway', source: 'api', target: 'stripe', status: 'pass' },
      { name: 'Search Engine', source: 'api', target: 'elasticsearch', status: 'pass' },
      { name: 'Email Service', source: 'api', target: 'sendgrid', status: 'pass' },
    ],
    environment: 'staging',
  };
}

function genStage22() {
  return {
    release_items: [
      { name: 'Product Listing Feature', category: 'feature', status: 'approved', approver: 'PM' },
      { name: 'Search Feature', category: 'feature', status: 'approved', approver: 'PM' },
      { name: 'Security Patch', category: 'security', status: 'approved', approver: 'Security Lead' },
    ],
    release_notes: 'MVP release with core marketplace features including product listing, search, and checkout',
    target_date: '2026-06-01',
    sprintRetrospective: {
      wentWell: ['Good velocity', 'Clean code reviews'],
      wentPoorly: ['Late requirement changes'],
      actionItems: ['Lock requirements before sprint'],
    },
    sprintSummary: { sprintGoal: 'MVP Core', itemsPlanned: 5, itemsCompleted: 5, qualityAssessment: 'Good', integrationStatus: 'Passing' },
    chairmanGate: { status: 'approved', rationale: 'Release approved', decision_id: 'test-decision-22' },
  };
}

function genStage23() {
  return {
    go_decision: 'go',
    launchType: 'soft_launch',
    incident_response_plan: 'On-call rotation with 15-minute response SLA. Escalation path: Dev -> SRE -> CTO.',
    monitoring_setup: 'Datadog APM with custom dashboards for key metrics: latency, error rate, throughput.',
    rollback_plan: 'Blue-green deployment with instant rollback capability. Database migrations are backward compatible.',
    launch_tasks: [
      { name: 'Deploy to production', status: 'complete', owner: 'DevOps' },
      { name: 'Enable feature flags', status: 'complete', owner: 'Dev Lead' },
    ],
    launch_date: '2026-06-15',
    planned_launch_date: '2026-06-15',
    actual_launch_date: '2026-06-15',
    successCriteria: [
      { metric: 'DAU', target: '500', measurementWindow: '30 days', priority: 'primary' },
      { metric: 'Error Rate', target: '<1%', measurementWindow: '7 days', priority: 'primary' },
    ],
    rollbackTriggers: [
      { trigger: 'Error rate spike', threshold: '>5% for 10 minutes', action: 'Auto-rollback' },
    ],
  };
}

function genStage24() {
  const aarrr = {};
  for (const cat of ['acquisition', 'activation', 'retention', 'revenue', 'referral']) {
    aarrr[cat] = [
      { name: `${cat} metric 1`, value: 100, target: 120, previousValue: 80, trendDirection: 'up', trend_window_days: 30 },
      { name: `${cat} metric 2`, value: 50, target: 60, previousValue: 45, trendDirection: 'up', trend_window_days: 30 },
    ];
  }
  return {
    aarrr,
    funnels: [
      {
        name: 'User Acquisition Funnel',
        steps: [
          { name: 'Visit', count: 10000 },
          { name: 'Signup', count: 500 },
          { name: 'Activation', count: 250 },
        ],
      },
    ],
    learnings: [
      { insight: 'Organic search drives highest quality traffic', action: 'Double SEO investment', category: 'acquisition', impactLevel: 'high' },
    ],
  };
}

function genStage25() {
  const initiatives = {};
  for (const cat of ['product', 'market', 'technical', 'financial', 'team']) {
    initiatives[cat] = [
      { title: `${cat} initiative 1`, status: 'completed', outcome: `${cat} outcome achieved` },
    ];
  }
  return {
    review_summary: 'Comprehensive venture review after MVP launch phase showing strong product-market fit signals',
    initiatives,
    current_vision: 'AI-powered artisan marketplace connecting global buyers with local craft',
    drift_justification: null,
    next_steps: [
      { action: 'Scale marketing spend', owner: 'CMO', timeline: 'Q3 2026', priority: 'high' },
      { action: 'Hire additional engineers', owner: 'CTO', timeline: 'Q3 2026', priority: 'medium' },
    ],
    chairmanGate: { status: 'approved', rationale: 'Venture review approved', decision_id: 'test-decision-25' },
    financialComparison: {
      projectedRevenue: '$500K', actualRevenue: '$480K', projectedCosts: '$300K', actualCosts: '$310K',
      revenueVariancePct: -4, financialTrajectory: 'on_plan', variance: 'Minor', assessment: 'Within acceptable range',
    },
    ventureHealth: {
      overallRating: 'viable',
      dimensions: {
        product: { score: 75, rationale: 'Strong MVP' },
        market: { score: 70, rationale: 'Growing demand' },
        technical: { score: 80, rationale: 'Solid architecture' },
        financial: { score: 65, rationale: 'Runway adequate' },
        team: { score: 72, rationale: 'Core team in place' },
      },
    },
  };
}

// ── Stage generator lookup ──────────────────────────────────────

const generators = {
  1: genStage01, 2: genStage02, 3: genStage03, 4: genStage04, 5: genStage05,
  6: genStage06, 7: genStage07, 8: genStage08, 9: genStage09,
  10: genStage10, 11: genStage11, 12: genStage12,
  13: genStage13, 14: genStage14, 15: genStage15, 16: genStage16,
  17: genStage17, 18: genStage18, 19: genStage19, 20: genStage20,
  21: genStage21, 22: genStage22, 23: genStage23, 24: genStage24, 25: genStage25,
};

// ── Mock template factory ───────────────────────────────────────

function createMockTemplate(stageNum, fixtureData) {
  return {
    analysisSteps: [{
      id: `mock-stage-${stageNum}`,
      artifactType: 'stage_output',
      execute: async () => ({
        artifactType: 'stage_output',
        payload: fixtureData,
        source: `test-mock-stage-${stageNum}`,
      }),
    }],
  };
}

// ── Mock Supabase Factory ────────────────────────────────────────

function createMockSupabase(ventureOverrides = {}) {
  const venture = {
    id: 'v-test-pipeline-1',
    name: 'E2E Orchestrator Test Venture',
    status: 'active',
    current_lifecycle_stage: 1,
    archetype: 'marketplace',
    created_at: '2026-01-01',
    ...ventureOverrides,
  };
  const insertedArtifacts = [];

  const mock = {
    _insertedArtifacts: insertedArtifacts,
    from: vi.fn((table) => {
      if (table === 'ventures') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: venture, error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      }
      if (table === 'venture_artifacts') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: insertedArtifacts, error: null }),
          insert: vi.fn((rows) => {
            const items = Array.isArray(rows) ? rows : [rows];
            items.forEach((r, i) => insertedArtifacts.push({ ...r, id: `art-${insertedArtifacts.length + i}` }));
            // Support .insert().select().single() chain used by persistArtifacts
            const artId = `art-${insertedArtifacts.length - 1}`;
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: artId }, error: null }),
              }),
              then: (resolve) => resolve({ data: items, error: null }),
            };
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      }
      if (table === 'strategic_directives_v2') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          insert: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      // Fallback for eva_traces, chairman_preferences, etc.
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      };
    }),
  };
  return mock;
}

// ── Shared test state ───────────────────────────────────────────

const TEST_VENTURE_ID = 'v-test-pipeline-1';
const silentLogger = { warn() {}, info() {}, error() {}, debug() {}, log() {} };
const alwaysPassGate = async () => ({ passed: true, results: [] });

// ── Tests ───────────────────────────────────────────────────────

describe('EVA Orchestrator Pipeline Integration', () => {
  describe('Stage Processing Pipeline', () => {
    it('processes stage 1 with mock template', async () => {
      const mockSb = createMockSupabase();
      const result = await processStage(
        {
          ventureId: TEST_VENTURE_ID,
          stageId: 1,
          options: { stageTemplate: createMockTemplate(1, genStage01()), dryRun: true },
        },
        {
          supabase: mockSb,
          logger: silentLogger,
          validateStageGateFn: alwaysPassGate,
          evaluateRealityGateFn: async () => ({ passed: true, status: 'PASS' }),
        },
      );

      expect(result).toBeDefined();
      expect(result.status).not.toBe('FAILED');
      expect(result.ventureId).toBe(TEST_VENTURE_ID);
      expect(result.stageId).toBe(1);
      expect(result.artifacts.length).toBeGreaterThan(0);
      expect(result.artifacts[0].artifactType).toBe('stage_output');
      expect(result.correlationId).toBeDefined();
      expect(result.startedAt).toBeDefined();
      expect(result.completedAt).toBeDefined();
    }, 30000);

    it('processes stages 2-5 sequentially (THE TRUTH phase)', async () => {
      for (const stageNum of [2, 3, 4, 5]) {
        const mockSb = createMockSupabase();
        const result = await processStage(
          {
            ventureId: TEST_VENTURE_ID,
            stageId: stageNum,
            options: { stageTemplate: createMockTemplate(stageNum, generators[stageNum]()), dryRun: true },
          },
          {
            supabase: mockSb,
            logger: silentLogger,
            validateStageGateFn: alwaysPassGate,
            evaluateRealityGateFn: async () => ({ passed: true, status: 'PASS' }),
          },
        );

        expect(result).toBeDefined();
        expect(result.status).not.toBe('FAILED');
        expect(result.stageId).toBe(stageNum);
      }
    }, 60000);
  });

  describe('Gate Enforcement', () => {
    it('blocks stage progression when gate fails', async () => {
      const mockSb = createMockSupabase();
      const blockingGate = async () => ({
        passed: false,
        results: [{ gate: 'kill', decision: 'kill', reason: 'Test kill gate' }],
      });

      const result = await processStage(
        {
          ventureId: TEST_VENTURE_ID,
          stageId: 3,
          options: { stageTemplate: createMockTemplate(3, genStage03()), dryRun: true },
        },
        {
          supabase: mockSb,
          logger: silentLogger,
          validateStageGateFn: blockingGate,
          evaluateRealityGateFn: async () => ({ passed: true, status: 'PASS' }),
        },
      );

      expect(result.status).toBe('BLOCKED');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.gateResults).toBeDefined();
      expect(result.gateResults.some(g => !g.passed)).toBe(true);
    }, 30000);

    it('includes gate results in successful processing', async () => {
      const mockSb = createMockSupabase();
      const result = await processStage(
        {
          ventureId: TEST_VENTURE_ID,
          stageId: 2,
          options: { stageTemplate: createMockTemplate(2, genStage02()), dryRun: true },
        },
        {
          supabase: mockSb,
          logger: silentLogger,
          validateStageGateFn: alwaysPassGate,
          evaluateRealityGateFn: async () => ({ passed: true, status: 'PASS' }),
        },
      );

      expect(result.status).toBe('COMPLETED');
      expect(result.gateResults).toBeDefined();
      expect(Array.isArray(result.gateResults)).toBe(true);
    }, 30000);
  });

  describe('Artifact Persistence', () => {
    it('persists artifacts when not in dryRun mode', async () => {
      const mockSb = createMockSupabase();
      const result = await processStage(
        {
          ventureId: TEST_VENTURE_ID,
          stageId: 1,
          options: { stageTemplate: createMockTemplate(1, genStage01()) },
        },
        {
          supabase: mockSb,
          logger: silentLogger,
          validateStageGateFn: alwaysPassGate,
          evaluateRealityGateFn: async () => ({ passed: true, status: 'PASS' }),
        },
      );

      expect(result.status).toBe('COMPLETED');
      // Verify insert was called on venture_artifacts
      const artifactCalls = mockSb.from.mock.calls.filter(c => c[0] === 'venture_artifacts');
      expect(artifactCalls.length).toBeGreaterThan(0);
      expect(mockSb._insertedArtifacts.length).toBeGreaterThan(0);
    }, 30000);

    it('skips persistence in dryRun mode', async () => {
      const mockSb = createMockSupabase();
      const result = await processStage(
        {
          ventureId: TEST_VENTURE_ID,
          stageId: 1,
          options: { stageTemplate: createMockTemplate(1, genStage01()), dryRun: true },
        },
        {
          supabase: mockSb,
          logger: silentLogger,
          validateStageGateFn: alwaysPassGate,
          evaluateRealityGateFn: async () => ({ passed: true, status: 'PASS' }),
        },
      );

      expect(result.status).toBe('COMPLETED');
      // In dryRun, no artifacts should be inserted
      expect(mockSb._insertedArtifacts.length).toBe(0);
    }, 30000);
  });

  describe('Error Handling', () => {
    it('returns FAILED when analysis step throws', async () => {
      const mockSb = createMockSupabase();
      const failingTemplate = {
        analysisSteps: [{
          id: 'failing-step',
          execute: async () => { throw new Error('Test analysis failure'); },
        }],
      };

      const result = await processStage(
        {
          ventureId: TEST_VENTURE_ID,
          stageId: 1,
          options: { stageTemplate: failingTemplate, dryRun: true },
        },
        {
          supabase: mockSb,
          logger: silentLogger,
          validateStageGateFn: alwaysPassGate,
          evaluateRealityGateFn: async () => ({ passed: true, status: 'PASS' }),
        },
      );

      expect(result.status).toBe('FAILED');
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('ANALYSIS_STEP_FAILED');
      expect(result.errors[0].message).toContain('Test analysis failure');
    }, 30000);

    it('returns FAILED when supabase is missing', async () => {
      const result = await processStage(
        {
          ventureId: TEST_VENTURE_ID,
          stageId: 1,
          options: { stageTemplate: createMockTemplate(1, genStage01()) },
        },
        {
          supabase: null,
          logger: silentLogger,
        },
      );

      expect(result.status).toBe('FAILED');
      expect(result.errors[0].code).toBe('MISSING_DEPENDENCY');
    }, 10000);

    it('returns FAILED for non-existent venture', async () => {
      // Create mock that returns null venture (not found)
      const notFoundMock = {
        from: vi.fn((table) => {
          if (table === 'ventures') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Venture not found' } }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
      };

      const result = await processStage(
        {
          ventureId: '00000000-0000-0000-0000-000000000000',
          stageId: 1,
          options: { stageTemplate: createMockTemplate(1, genStage01()) },
        },
        {
          supabase: notFoundMock,
          logger: silentLogger,
          validateStageGateFn: alwaysPassGate,
          evaluateRealityGateFn: async () => ({ passed: true, status: 'PASS' }),
        },
      );

      expect(result.status).toBe('FAILED');
      expect(result.errors[0].code).toBe('CONTEXT_LOAD_FAILED');
    }, 30000);
  });

  describe('Result Shape', () => {
    it('returns all expected fields in result object', async () => {
      const mockSb = createMockSupabase();
      const result = await processStage(
        {
          ventureId: TEST_VENTURE_ID,
          stageId: 1,
          options: { stageTemplate: createMockTemplate(1, genStage01()), dryRun: true },
        },
        {
          supabase: mockSb,
          logger: silentLogger,
          validateStageGateFn: alwaysPassGate,
          evaluateRealityGateFn: async () => ({ passed: true, status: 'PASS' }),
        },
      );

      expect(result).toHaveProperty('ventureId');
      expect(result).toHaveProperty('stageId');
      expect(result).toHaveProperty('startedAt');
      expect(result).toHaveProperty('completedAt');
      expect(result).toHaveProperty('correlationId');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('artifacts');
      expect(result).toHaveProperty('filterDecision');
      expect(result).toHaveProperty('gateResults');
      expect(result).toHaveProperty('nextStageId');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('devilsAdvocateReview');
      expect(result).toHaveProperty('traceId');
    }, 30000);
  });

  describe('Full 25-Stage Pipeline', () => {
    it('processes all 25 stages with mock templates', async () => {
      const results = [];
      for (let stage = 1; stage <= 25; stage++) {
        const mockSb = createMockSupabase({ current_lifecycle_stage: stage });
        const result = await processStage(
          {
            ventureId: TEST_VENTURE_ID,
            stageId: stage,
            options: { stageTemplate: createMockTemplate(stage, generators[stage]()), dryRun: true },
          },
          {
            supabase: mockSb,
            logger: silentLogger,
            validateStageGateFn: alwaysPassGate,
            evaluateRealityGateFn: async () => ({ passed: true, status: 'PASS' }),
          },
        );
        results.push({ stage, status: result.status });
        expect(result.status).not.toBe('FAILED');
      }

      expect(results).toHaveLength(25);
      for (const r of results) {
        expect(['COMPLETED', 'BLOCKED']).toContain(r.status);
      }
    }, 300000);
  });
});
