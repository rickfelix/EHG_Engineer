#!/usr/bin/env node
/**
 * E2E Stage Runner - Sweeps all 25 EVA venture stages.
 *
 * For each stage: loads template, validates structure, runs validate()
 * with valid + invalid data, runs computeDerived(), checks cross-stage
 * contracts, and reports findings.
 *
 * Usage: node scripts/e2e-stage-runner.mjs [--stage N] [--json]
 */

import { getTemplate, getAllTemplates } from '../lib/eva/stage-templates/index.js';

// ───────────────────────────────────────────────────────────────────
// Silent logger to suppress validation warnings during test
// ───────────────────────────────────────────────────────────────────
const silentLogger = { warn() {}, info() {}, error() {}, debug() {}, log() {} };

// ───────────────────────────────────────────────────────────────────
// Test data generators per stage
// ───────────────────────────────────────────────────────────────────

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
      scores[c.name] = 60 + Math.floor(Math.random() * 30);
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
    incident_response_plan: 'On-call rotation with 15-minute response SLA. Escalation path: Dev → SRE → CTO.',
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

const TEST_DATA_GENERATORS = {
  1: genStage01, 2: genStage02, 3: genStage03, 4: genStage04, 5: genStage05,
  6: genStage06, 7: genStage07, 8: genStage08, 9: genStage09,
  10: genStage10, 11: genStage11, 12: genStage12,
  13: genStage13, 14: genStage14, 15: genStage15, 16: genStage16,
  17: genStage17, 18: genStage18, 19: genStage19, 20: genStage20, 21: genStage21, 22: genStage22,
  23: genStage23, 24: genStage24, 25: genStage25,
};

// Stages that accept prerequisites as second arg to validate()
const STAGES_WITH_PREREQUISITES_VALIDATE = new Set([2, 3, 4, 5, 6, 7, 8, 9]);

// Stages that accept an extra arg to computeDerived()
const STAGES_WITH_EXTRA_COMPUTE = new Set([1, 9, 12, 15, 16, 22, 23, 25]);

// ───────────────────────────────────────────────────────────────────
// Core test runner
// ───────────────────────────────────────────────────────────────────

function testTemplateStructure(stageNum, template) {
  const findings = [];
  const required = ['id', 'slug', 'title', 'schema', 'defaultData', 'validate'];
  for (const key of required) {
    if (template[key] === undefined) {
      findings.push({ severity: 'critical', check: 'structure', message: `Missing required property: ${key}` });
    }
  }
  if (typeof template.validate !== 'function') {
    findings.push({ severity: 'critical', check: 'structure', message: 'validate is not a function' });
  }
  if (typeof template.computeDerived !== 'function') {
    findings.push({ severity: 'high', check: 'structure', message: 'computeDerived is not a function' });
  }
  if (template.analysisStep === undefined) {
    findings.push({ severity: 'high', check: 'structure', message: 'analysisStep is not defined' });
  } else if (typeof template.analysisStep !== 'function') {
    findings.push({ severity: 'high', check: 'structure', message: 'analysisStep is not a function' });
  }
  if (!template.id || !template.id.startsWith('stage-')) {
    findings.push({ severity: 'medium', check: 'structure', message: `Expected id to start with 'stage-', got '${template.id}'` });
  }
  const expectedId = `stage-${String(stageNum).padStart(2, '0')}`;
  if (template.id !== expectedId) {
    findings.push({ severity: 'medium', check: 'structure', message: `Expected id '${expectedId}', got '${template.id}'` });
  }
  return findings;
}

function testValidateWithValidData(stageNum, template) {
  const findings = [];
  const data = TEST_DATA_GENERATORS[stageNum]();
  try {
    let result;
    if (STAGES_WITH_PREREQUISITES_VALIDATE.has(stageNum)) {
      result = template.validate(data, {}, { logger: silentLogger });
    } else {
      result = template.validate(data, { logger: silentLogger });
    }
    if (!result || typeof result.valid !== 'boolean') {
      findings.push({ severity: 'critical', check: 'validate_valid', message: 'validate() did not return { valid: boolean, errors: string[] }' });
    } else if (!result.valid) {
      findings.push({
        severity: 'high', check: 'validate_valid',
        message: `validate() FAILED with valid test data: ${result.errors?.join('; ') || 'unknown'}`,
      });
    }
  } catch (err) {
    findings.push({ severity: 'critical', check: 'validate_valid', message: `validate() threw: ${err.message}` });
  }
  return findings;
}

function testValidateWithInvalidData(stageNum, template) {
  const findings = [];
  // Test with null/empty data
  try {
    let result;
    if (STAGES_WITH_PREREQUISITES_VALIDATE.has(stageNum)) {
      result = template.validate(null, {}, { logger: silentLogger });
    } else {
      result = template.validate(null, { logger: silentLogger });
    }
    if (!result || typeof result.valid !== 'boolean') {
      findings.push({ severity: 'critical', check: 'validate_invalid', message: 'validate(null) did not return { valid: boolean }' });
    } else if (result.valid) {
      findings.push({ severity: 'high', check: 'validate_invalid', message: 'validate(null) returned valid=true (should reject null data)' });
    }
  } catch (err) {
    findings.push({ severity: 'critical', check: 'validate_invalid', message: `validate(null) threw: ${err.message}` });
  }

  // Test with empty object
  try {
    let result;
    if (STAGES_WITH_PREREQUISITES_VALIDATE.has(stageNum)) {
      result = template.validate({}, {}, { logger: silentLogger });
    } else {
      result = template.validate({}, { logger: silentLogger });
    }
    if (!result || typeof result.valid !== 'boolean') {
      findings.push({ severity: 'critical', check: 'validate_empty', message: 'validate({}) did not return { valid: boolean }' });
    } else if (result.valid) {
      findings.push({ severity: 'high', check: 'validate_empty', message: 'validate({}) returned valid=true (should reject empty data)' });
    }
  } catch (err) {
    findings.push({ severity: 'critical', check: 'validate_empty', message: `validate({}) threw: ${err.message}` });
  }

  return findings;
}

function testComputeDerived(stageNum, template) {
  const findings = [];
  const data = TEST_DATA_GENERATORS[stageNum]();
  try {
    let result;
    if (STAGES_WITH_EXTRA_COMPUTE.has(stageNum)) {
      result = template.computeDerived(data, null, { logger: silentLogger });
    } else {
      result = template.computeDerived(data, { logger: silentLogger });
    }
    if (!result || typeof result !== 'object') {
      findings.push({ severity: 'critical', check: 'computeDerived', message: 'computeDerived() did not return an object' });
    }
  } catch (err) {
    findings.push({ severity: 'critical', check: 'computeDerived', message: `computeDerived() threw: ${err.message}` });
  }
  return findings;
}

function testDefaultDataSchema(stageNum, template) {
  const findings = [];
  if (!template.schema || typeof template.schema !== 'object') {
    findings.push({ severity: 'high', check: 'schema', message: 'schema is missing or not an object' });
    return findings;
  }
  if (!template.defaultData || typeof template.defaultData !== 'object') {
    findings.push({ severity: 'high', check: 'defaultData', message: 'defaultData is missing or not an object' });
    return findings;
  }

  // Check that non-derived schema fields exist in defaultData
  for (const [field, spec] of Object.entries(template.schema)) {
    if (spec?.derived) continue; // skip derived
    if (!(field in template.defaultData)) {
      findings.push({ severity: 'medium', check: 'schema_default_mismatch', message: `Schema field '${field}' not in defaultData` });
    }
  }

  // Check that defaultData fields exist in schema
  for (const field of Object.keys(template.defaultData)) {
    if (!(field in template.schema)) {
      findings.push({ severity: 'low', check: 'default_extra_field', message: `defaultData field '${field}' not in schema` });
    }
  }

  return findings;
}

// ───────────────────────────────────────────────────────────────────
// Gate tests
// ───────────────────────────────────────────────────────────────────

async function testKillGates() {
  const findings = [];

  // Stage 3 kill gate
  try {
    const { evaluateKillGate } = await import('../lib/eva/stage-templates/stage-03.js');
    // PASS case
    const passResult = evaluateKillGate({ overallScore: 75, metrics: { marketFit: 75, customerNeed: 80, momentum: 65, revenuePotential: 70, competitiveBarrier: 60, executionFeasibility: 72 } });
    if (passResult.decision !== 'pass') findings.push({ severity: 'high', check: 'gate_stage03', message: `Expected pass, got ${passResult.decision}` });
    // KILL case
    const killResult = evaluateKillGate({ overallScore: 40, metrics: { marketFit: 30, customerNeed: 80, momentum: 65, revenuePotential: 70, competitiveBarrier: 60, executionFeasibility: 72 } });
    if (killResult.decision !== 'kill') findings.push({ severity: 'high', check: 'gate_stage03', message: `Expected kill, got ${killResult.decision}` });
    // REVISE case
    const reviseResult = evaluateKillGate({ overallScore: 60, metrics: { marketFit: 55, customerNeed: 65, momentum: 55, revenuePotential: 60, competitiveBarrier: 55, executionFeasibility: 70 } });
    if (reviseResult.decision !== 'revise') findings.push({ severity: 'high', check: 'gate_stage03', message: `Expected revise, got ${reviseResult.decision}` });
  } catch (err) {
    findings.push({ severity: 'critical', check: 'gate_stage03', message: `Stage 3 kill gate threw: ${err.message}` });
  }

  // Stage 5 kill gate
  try {
    const { evaluateKillGate } = await import('../lib/eva/stage-templates/stage-05.js');
    // PASS case: ROI >= 25%, breakeven <= 24mo, LTV/CAC >= 2, payback <= 18mo
    const passResult = evaluateKillGate({ roi3y: 0.30, breakEvenMonth: 12, ltvCacRatio: 3, paybackMonths: 10 });
    if (passResult.decision !== 'pass') findings.push({ severity: 'high', check: 'gate_stage05', message: `Expected pass, got ${passResult.decision}` });
    // KILL case: ROI < 15%
    const killResult = evaluateKillGate({ roi3y: 0.10, breakEvenMonth: 30, ltvCacRatio: 1, paybackMonths: 24 });
    if (killResult.decision !== 'kill') findings.push({ severity: 'high', check: 'gate_stage05', message: `Expected kill, got ${killResult.decision}` });
    // CONDITIONAL case: 15% <= ROI < 25% with strong supplementary
    const condResult = evaluateKillGate({ roi3y: 0.20, breakEvenMonth: 18, ltvCacRatio: 4, paybackMonths: 8 });
    if (condResult.decision !== 'conditional_pass') findings.push({ severity: 'high', check: 'gate_stage05', message: `Expected conditional_pass, got ${condResult.decision}` });
  } catch (err) {
    findings.push({ severity: 'critical', check: 'gate_stage05', message: `Stage 5 kill gate threw: ${err.message}` });
  }

  // Stage 13 kill gate
  try {
    const stage13 = getTemplate(13);
    const data = genStage13();
    const derived = stage13.computeDerived(data, { logger: silentLogger });
    if (derived.decision === 'kill') {
      findings.push({ severity: 'medium', check: 'gate_stage13', message: `Valid data triggered kill: ${derived.reasons?.map(r => r.message).join('; ')}` });
    }
  } catch (err) {
    findings.push({ severity: 'critical', check: 'gate_stage13', message: `Stage 13 kill gate threw: ${err.message}` });
  }

  // Stage 23 kill gate
  try {
    const stage23 = getTemplate(23);
    const data = genStage23();
    const derived = stage23.computeDerived(data, null, { logger: silentLogger });
    if (derived.decision === 'kill') {
      findings.push({ severity: 'medium', check: 'gate_stage23', message: `Valid go data triggered kill: ${derived.reasons?.map(r => r.message).join('; ')}` });
    }
    // Test no-go kill
    const noGoData = { ...data, go_decision: 'no-go' };
    const noGoDerived = stage23.computeDerived(noGoData, null, { logger: silentLogger });
    if (noGoDerived.decision !== 'kill') {
      findings.push({ severity: 'high', check: 'gate_stage23', message: `no-go should trigger kill, got ${noGoDerived.decision}` });
    }
  } catch (err) {
    findings.push({ severity: 'critical', check: 'gate_stage23', message: `Stage 23 kill gate threw: ${err.message}` });
  }

  return findings;
}

async function testRealityGates() {
  const findings = [];

  // Stage 9 local reality gate
  try {
    const { evaluateRealityGate } = await import('../lib/eva/stage-templates/stage-09.js');
    const BMC_BLOCKS = (await import('../lib/eva/stage-templates/stage-08.js')).BMC_BLOCKS;

    // PASS case: all prerequisites met
    const stage08Data = {};
    for (const block of BMC_BLOCKS) {
      stage08Data[block] = { items: [{ text: 'item', priority: 1 }] };
    }
    const passResult = evaluateRealityGate({
      stage06: { risks: Array(10).fill({ title: 'r', description: 'd', category: 'Market', probability: 3, impact: 3, mitigation: 'm', status: 'open' }) },
      stage07: { tiers: [{ name: 'Basic' }], ltv: 300, payback_months: 6 },
      stage08: stage08Data,
    });
    if (!passResult.pass) findings.push({ severity: 'high', check: 'gate_stage09_reality', message: `Expected pass, got fail: ${passResult.blockers?.join('; ')}` });

    // FAIL case: insufficient risks
    const failResult = evaluateRealityGate({
      stage06: { risks: [{ title: 'r' }] },
      stage07: { tiers: [{ name: 'Basic' }], ltv: 300, payback_months: 6 },
      stage08: stage08Data,
    });
    if (failResult.pass) findings.push({ severity: 'high', check: 'gate_stage09_reality', message: 'Expected fail with insufficient risks, got pass' });
  } catch (err) {
    findings.push({ severity: 'critical', check: 'gate_stage09_reality', message: `Stage 9 reality gate threw: ${err.message}` });
  }

  // Stage 16 promotion gate
  try {
    const { evaluatePromotionGate } = await import('../lib/eva/stage-templates/stage-16.js');
    const passResult = evaluatePromotionGate({
      stage13: { milestones: [{ name: 'M1' }, { name: 'M2' }, { name: 'M3' }], decision: 'pass' },
      stage14: { layers: { presentation: {}, api: {}, business_logic: {}, data: {}, infrastructure: {} } },
      stage15: { risks: [{ title: 'R1', severity: 'medium', priority: 'short_term', mitigationPlan: 'Plan' }] },
      stage16: { initial_capital: 100000, revenue_projections: Array(6).fill({ month: 1, revenue: 5000, costs: 3000 }) },
    });
    if (!passResult.pass) findings.push({ severity: 'high', check: 'gate_stage16_promotion', message: `Expected pass, got fail: ${passResult.blockers?.join('; ')}` });
  } catch (err) {
    findings.push({ severity: 'critical', check: 'gate_stage16_promotion', message: `Stage 16 promotion gate threw: ${err.message}` });
  }

  // Stage 22 promotion gate
  try {
    const { evaluatePromotionGate } = await import('../lib/eva/stage-templates/stage-22.js');
    const passResult = evaluatePromotionGate({
      stage17: { buildReadiness: { decision: 'go', rationale: 'Ready' } },
      stage18: { items: [{ title: 'Item 1' }] },
      stage19: { sprintCompletion: { decision: 'complete', rationale: 'Done' } },
      stage20: { qualityDecision: { decision: 'pass', rationale: 'All passing' } },
      stage21: { reviewDecision: { decision: 'approve', rationale: 'Approved' } },
      stage22: { releaseDecision: { decision: 'release', rationale: 'All approved' }, release_items: [{ status: 'approved' }] },
    });
    if (!passResult.pass) findings.push({ severity: 'high', check: 'gate_stage22_promotion', message: `Expected pass, got fail: ${passResult.blockers?.join('; ')}` });
  } catch (err) {
    findings.push({ severity: 'critical', check: 'gate_stage22_promotion', message: `Stage 22 promotion gate threw: ${err.message}` });
  }

  return findings;
}

async function testDecisionFilterEngine() {
  const findings = [];
  try {
    const { evaluateDecision } = await import('../lib/eva/decision-filter-engine.js');

    // Clean pass
    const cleanResult = evaluateDecision({}, { logger: silentLogger });
    if (!cleanResult.auto_proceed) findings.push({ severity: 'high', check: 'filter_engine', message: 'Empty input should auto_proceed' });

    // Cost threshold
    const costResult = evaluateDecision({ cost: 50000 }, { preferences: { 'filter.cost_max_usd': 10000 }, logger: silentLogger });
    if (costResult.auto_proceed) findings.push({ severity: 'high', check: 'filter_engine', message: 'Cost over threshold should NOT auto_proceed' });
    if (!costResult.triggers.some(t => t.type === 'cost_threshold')) findings.push({ severity: 'high', check: 'filter_engine', message: 'Missing cost_threshold trigger' });

    // Low score
    const scoreResult = evaluateDecision({ score: 3 }, { preferences: { 'filter.min_score': 7 }, logger: silentLogger });
    if (scoreResult.auto_proceed) findings.push({ severity: 'high', check: 'filter_engine', message: 'Low score should NOT auto_proceed' });

    // Strategic pivot
    const pivotResult = evaluateDecision({ description: 'We need to pivot our strategy' }, { preferences: { 'filter.pivot_keywords': ['pivot'] }, logger: silentLogger });
    if (pivotResult.auto_proceed) findings.push({ severity: 'high', check: 'filter_engine', message: 'Pivot detected should NOT auto_proceed' });

  } catch (err) {
    findings.push({ severity: 'critical', check: 'filter_engine', message: `Decision filter engine threw: ${err.message}` });
  }
  return findings;
}

async function testRealityGateModule() {
  const findings = [];
  try {
    const { evaluateRealityGate, getBoundaryConfig, isGatedBoundary, BOUNDARY_CONFIG } = await import('../lib/eva/reality-gates.js');

    // Check boundaries exist
    const expectedBoundaries = ['5->6', '9->10', '12->13', '16->17', '22->23'];
    for (const b of expectedBoundaries) {
      if (!BOUNDARY_CONFIG[b]) findings.push({ severity: 'high', check: 'reality_gates', message: `Missing boundary config for ${b}` });
      const [from, to] = b.split('->').map(Number);
      if (!isGatedBoundary(from, to)) findings.push({ severity: 'high', check: 'reality_gates', message: `isGatedBoundary(${from}, ${to}) returned false` });
      const config = getBoundaryConfig(from, to);
      if (!config) findings.push({ severity: 'high', check: 'reality_gates', message: `getBoundaryConfig(${from}, ${to}) returned null` });
    }

    // Non-gated boundary
    if (isGatedBoundary(1, 2)) findings.push({ severity: 'medium', check: 'reality_gates', message: 'isGatedBoundary(1, 2) should be false' });

    // NOT_APPLICABLE for non-gated boundary
    const naResult = await evaluateRealityGate({ ventureId: 'test', fromStage: 1, toStage: 2, supabase: {}, logger: silentLogger });
    if (naResult.status !== 'NOT_APPLICABLE') findings.push({ severity: 'high', check: 'reality_gates', message: `Expected NOT_APPLICABLE, got ${naResult.status}` });

    // FAIL on missing ventureId
    const failResult = await evaluateRealityGate({ ventureId: null, fromStage: 5, toStage: 6, supabase: {}, logger: silentLogger });
    if (failResult.status !== 'FAIL') findings.push({ severity: 'high', check: 'reality_gates', message: `Expected FAIL on null ventureId, got ${failResult.status}` });

    // FAIL on missing supabase
    const failResult2 = await evaluateRealityGate({ ventureId: 'test', fromStage: 5, toStage: 6, supabase: null, logger: silentLogger });
    if (failResult2.status !== 'FAIL') findings.push({ severity: 'high', check: 'reality_gates', message: `Expected FAIL on null supabase, got ${failResult2.status}` });

  } catch (err) {
    findings.push({ severity: 'critical', check: 'reality_gates', message: `Reality gates module threw: ${err.message}` });
  }
  return findings;
}

// ───────────────────────────────────────────────────────────────────
// Main runner
// ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const stageArg = args.find(a => a.startsWith('--stage='));
  const singleStage = stageArg ? parseInt(stageArg.split('=')[1]) : null;

  const allFindings = [];
  const stageResults = {};

  // Phase labels
  const phases = {
    1: 'THE TRUTH', 2: 'THE TRUTH', 3: 'THE TRUTH', 4: 'THE TRUTH', 5: 'THE TRUTH',
    6: 'THE ENGINE', 7: 'THE ENGINE', 8: 'THE ENGINE', 9: 'THE ENGINE',
    10: 'THE IDENTITY', 11: 'THE IDENTITY', 12: 'THE IDENTITY',
    13: 'THE BLUEPRINT', 14: 'THE BLUEPRINT', 15: 'THE BLUEPRINT', 16: 'THE BLUEPRINT',
    17: 'THE BUILD LOOP', 18: 'THE BUILD LOOP', 19: 'THE BUILD LOOP', 20: 'THE BUILD LOOP', 21: 'THE BUILD LOOP', 22: 'THE BUILD LOOP',
    23: 'LAUNCH & LEARN', 24: 'LAUNCH & LEARN', 25: 'LAUNCH & LEARN',
  };

  const stagesToTest = singleStage ? [singleStage] : Array.from({ length: 25 }, (_, i) => i + 1);

  if (!jsonOutput) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  EVA E2E Stage Runner — 25-Stage Template Sweep');
    console.log('═══════════════════════════════════════════════════════════\n');
  }

  // Test each stage
  for (const n of stagesToTest) {
    const template = getTemplate(n);
    const findings = [];

    if (!template) {
      findings.push({ severity: 'critical', check: 'load', message: `getTemplate(${n}) returned null` });
      stageResults[n] = { phase: phases[n], findings };
      allFindings.push(...findings.map(f => ({ stage: n, ...f })));
      continue;
    }

    // Run test suites
    findings.push(...testTemplateStructure(n, template));
    findings.push(...testValidateWithValidData(n, template));
    findings.push(...testValidateWithInvalidData(n, template));
    findings.push(...testComputeDerived(n, template));
    findings.push(...testDefaultDataSchema(n, template));

    stageResults[n] = { phase: phases[n], title: template.title, findings };
    allFindings.push(...findings.map(f => ({ stage: n, ...f })));

    if (!jsonOutput) {
      const icon = findings.some(f => f.severity === 'critical') ? '✗'
        : findings.some(f => f.severity === 'high') ? '!'
        : findings.length > 0 ? '~'
        : '✓';
      console.log(`  [${icon}] Stage ${String(n).padStart(2, '0')} (${phases[n]}) — ${template.title}: ${findings.length === 0 ? 'PASS' : `${findings.length} finding(s)`}`);
      for (const f of findings) {
        console.log(`       [${f.severity.toUpperCase()}] ${f.check}: ${f.message}`);
      }
    }
  }

  // Gate tests
  if (!jsonOutput) console.log('\n───────── Gate Tests ─────────\n');
  const killGateFindings = await testKillGates();
  allFindings.push(...killGateFindings.map(f => ({ stage: 'gates', ...f })));
  if (!jsonOutput) {
    console.log(`  Kill Gates: ${killGateFindings.length === 0 ? 'PASS' : `${killGateFindings.length} finding(s)`}`);
    for (const f of killGateFindings) console.log(`       [${f.severity.toUpperCase()}] ${f.check}: ${f.message}`);
  }

  const realityGateFindings = await testRealityGates();
  allFindings.push(...realityGateFindings.map(f => ({ stage: 'gates', ...f })));
  if (!jsonOutput) {
    console.log(`  Reality/Promotion Gates: ${realityGateFindings.length === 0 ? 'PASS' : `${realityGateFindings.length} finding(s)`}`);
    for (const f of realityGateFindings) console.log(`       [${f.severity.toUpperCase()}] ${f.check}: ${f.message}`);
  }

  const filterFindings = await testDecisionFilterEngine();
  allFindings.push(...filterFindings.map(f => ({ stage: 'filter', ...f })));
  if (!jsonOutput) {
    console.log(`  Decision Filter Engine: ${filterFindings.length === 0 ? 'PASS' : `${filterFindings.length} finding(s)`}`);
    for (const f of filterFindings) console.log(`       [${f.severity.toUpperCase()}] ${f.check}: ${f.message}`);
  }

  const realityModuleFindings = await testRealityGateModule();
  allFindings.push(...realityModuleFindings.map(f => ({ stage: 'reality', ...f })));
  if (!jsonOutput) {
    console.log(`  Reality Gate Module: ${realityModuleFindings.length === 0 ? 'PASS' : `${realityModuleFindings.length} finding(s)`}`);
    for (const f of realityModuleFindings) console.log(`       [${f.severity.toUpperCase()}] ${f.check}: ${f.message}`);
  }

  // Summary
  const criticalCount = allFindings.filter(f => f.severity === 'critical').length;
  const highCount = allFindings.filter(f => f.severity === 'high').length;
  const mediumCount = allFindings.filter(f => f.severity === 'medium').length;
  const lowCount = allFindings.filter(f => f.severity === 'low').length;
  const passCount = stagesToTest.filter(n => (stageResults[n]?.findings?.length || 0) === 0).length;

  if (jsonOutput) {
    console.log(JSON.stringify({ stageResults, allFindings, summary: { total: allFindings.length, critical: criticalCount, high: highCount, medium: mediumCount, low: lowCount, stages_passed: passCount, stages_tested: stagesToTest.length } }, null, 2));
  } else {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Stages tested: ${stagesToTest.length}`);
    console.log(`  Stages passed: ${passCount} / ${stagesToTest.length}`);
    console.log(`  Total findings: ${allFindings.length}`);
    console.log(`    Critical: ${criticalCount}`);
    console.log(`    High:     ${highCount}`);
    console.log(`    Medium:   ${mediumCount}`);
    console.log(`    Low:      ${lowCount}`);
    console.log('═══════════════════════════════════════════════════════════\n');
  }

  // Exit code: 1 if any critical/high, 0 otherwise
  process.exit(criticalCount > 0 || highCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(2);
});
