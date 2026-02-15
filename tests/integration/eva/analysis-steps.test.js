/**
 * Analysis Steps Integration Tests - All 25 EVA Stages
 * Layer 2b: Tests each analysis step function with mocked LLM.
 *
 * Validates:
 * - Each stage function processes LLM responses correctly
 * - Output schemas match expected shapes
 * - Input validation (throws on missing required data)
 * - Normalization of LLM output (enums, clamps, defaults)
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock LLM before importing analysis steps
const mockComplete = vi.fn();
vi.mock('../../../lib/llm/index.js', () => ({
  getLLMClient: () => ({ complete: mockComplete }),
}));

// Now import analysis steps (they'll use the mocked getLLMClient)
const {
  analyzeStage01, analyzeStage02, analyzeStage03, analyzeStage04, analyzeStage05,
  analyzeStage06, analyzeStage07, analyzeStage08, analyzeStage09, analyzeStage10,
  analyzeStage11, analyzeStage12, analyzeStage13, analyzeStage14, analyzeStage15,
  analyzeStage16, analyzeStage17, analyzeStage18, analyzeStage19, analyzeStage20,
  analyzeStage21, analyzeStage22, analyzeStage23, analyzeStage24, analyzeStage25,
} = await import('../../../lib/eva/stage-templates/analysis-steps/index.js');

const silentLogger = { warn() {}, info() {}, error() {}, debug() {}, log() {} };

// ---------------------------------------------------------------------------
// Upstream data generators (minimal valid shapes for each stage)
// ---------------------------------------------------------------------------

function genStage01() {
  return {
    description: 'A platform that connects local artisans with global buyers through AI-powered matching and logistics optimization',
    problemStatement: 'Artisans struggle to reach global markets due to high logistics costs and fragmented supply chains',
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
    critiques: [
      { model: 'market-strategist', summary: 'Strong market potential identified', strengths: ['Growing market'], risks: ['Competition'], score: 75 },
      { model: 'customer-advocate', summary: 'Clear customer pain point addressed', strengths: ['Clear need'], risks: ['Adoption'], score: 80 },
      { model: 'growth-hacker', summary: 'Viral potential through network effects', strengths: ['Network effects'], risks: ['Cold start'], score: 65 },
      { model: 'revenue-analyst', summary: 'Revenue model through marketplace commission', strengths: ['Transaction fee'], risks: ['Price sensitivity'], score: 70 },
      { model: 'moat-architect', summary: 'AI and data create defensibility', strengths: ['Data moat'], risks: ['Replication risk'], score: 60 },
      { model: 'ops-realist', summary: 'Logistics operations require partnerships', strengths: ['Scalable model'], risks: ['Logistics complexity'], score: 72 },
    ],
    compositeScore: 70,
  };
}

function genStage03() {
  return {
    marketFit: 72, customerNeed: 76, momentum: 60, revenuePotential: 68,
    competitiveBarrier: 55, executionFeasibility: 70, overallScore: 67,
    decision: 'pass', blockProgression: false, reasons: [],
    hybridBreakdown: { deterministic: {}, ai: {}, weights: { deterministic: 0.5, ai: 0.5 } },
  };
}

function genStage04() {
  return {
    competitors: [
      { name: 'Etsy', position: 'Global artisan marketplace', threat: 'H', strengths: ['Brand'], weaknesses: ['High fees'], swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] }, pricingModel: { type: 'marketplace', lowTier: '$0.20/listing', highTier: '$0.20/listing', freeOption: false, notes: 'Plus 6.5% transaction fee' } },
      { name: 'Amazon Handmade', position: 'Large platform sub-brand', threat: 'H', strengths: ['Reach'], weaknesses: ['Lost in catalog'], swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] }, pricingModel: { type: 'marketplace', lowTier: '$39.99/mo', highTier: '$39.99/mo', freeOption: false, notes: '15% referral' } },
      { name: 'Faire', position: 'Wholesale marketplace', threat: 'M', strengths: ['B2B focus'], weaknesses: ['Wholesale only'], swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] }, pricingModel: { type: 'marketplace', lowTier: '$0', highTier: '$0', freeOption: true, notes: 'Commission on sales' } },
    ],
    stage5Handoff: { avgMarketPrice: '$25/mo', pricingModels: ['marketplace'], priceRange: { low: 0, high: 40 }, competitiveDensity: 'high' },
  };
}

function genStage05() {
  return {
    initialInvestment: 50000, year1: { revenue: 120000, cogs: 36000, opex: 60000 },
    year2: { revenue: 360000, cogs: 108000, opex: 120000 }, year3: { revenue: 720000, cogs: 216000, opex: 180000 },
    grossProfitY1: 84000, grossProfitY2: 252000, grossProfitY3: 504000,
    netProfitY1: 24000, netProfitY2: 132000, netProfitY3: 324000,
    breakEvenMonth: 7, roi3y: 8.6, decision: 'pass', blockProgression: false, reasons: [],
    unitEconomics: { cac: 45, ltv: 540, ltvCacRatio: 12, paybackMonths: 3, monthlyChurn: 0.03 },
    roiBands: { pessimistic: 6.88, base: 8.6, optimistic: 11.18 },
    assumptions: ['5% monthly user growth', 'Average order $50', '15% commission rate'],
  };
}

function genStage07() {
  return {
    pricingModel: 'marketplace_commission', primaryValueMetric: 'per transaction',
    priceAnchor: { competitorAvg: 20, proposedPrice: 15, positioning: 'discount' },
    tiers: [
      { name: 'Basic', price: 0, billing_period: 'monthly', target_segment: 'New artisans', included_units: 'Up to 20 listings' },
      { name: 'Pro', price: 29, billing_period: 'monthly', target_segment: 'Active sellers', included_units: 'Unlimited listings + analytics' },
    ],
    unitEconomics: { gross_margin_pct: 70, churn_rate_monthly: 3, cac: 45, arpa: 15 },
    rationale: 'Marketplace commission model aligns with artisan needs',
  };
}

function genStage11() {
  return {
    tiers: [
      { name: 'Tier 1: Early Adopters', description: 'Tech-savvy craft buyers', tam: 1000000, sam: 500000, som: 50000, persona: 'Urban professionals 25-40', painPoints: ['Finding authentic crafts'] },
      { name: 'Tier 2: Mainstream', description: 'General craft buyers', tam: 5000000, sam: 2000000, som: 200000, persona: 'Gift shoppers', painPoints: ['Quality assurance'] },
      { name: 'Tier 3: Enterprise', description: 'Boutique retailers', tam: 500000, sam: 100000, som: 10000, persona: 'Store buyers', painPoints: ['Wholesale sourcing'] },
    ],
    channels: Array.from({ length: 8 }, (_, i) => ({
      name: `Channel ${i + 1}`, monthly_budget: i < 4 ? 1000 : 0, expected_cac: 50,
      primary_kpi: 'Signups', channelType: i % 2 === 0 ? 'paid' : 'organic', primaryTier: 'Tier 1: Early Adopters', status: i < 4 ? 'ACTIVE' : 'BACKLOG',
    })),
    launch_timeline: [{ milestone: 'Soft launch', date: '2026-03-01', owner: 'Founder' }],
    totalMonthlyBudget: 4000, avgCac: 50, tierCount: 3, channelCount: 8, activeChannelCount: 4, backlogChannelCount: 4,
  };
}

function genStage13() {
  return {
    vision_statement: 'Build an AI-powered marketplace that empowers artisans worldwide to reach global buyers efficiently',
    milestones: [
      { name: 'MVP Launch', date: '2026-04-01', deliverables: ['Core marketplace', 'AI matching v1'], dependencies: [], priority: 'now' },
      { name: 'Logistics Integration', date: '2026-06-01', deliverables: ['3PL API integration'], dependencies: ['MVP Launch'], priority: 'next' },
      { name: 'Mobile App', date: '2026-09-01', deliverables: ['iOS and Android apps'], dependencies: ['MVP Launch'], priority: 'later' },
    ],
    phases: [{ name: 'Phase 1: Foundation', start_date: '2026-03-01', end_date: '2026-09-01' }],
    priorityCounts: { now: 1, next: 1, later: 1 }, totalMilestones: 3, totalPhases: 1,
  };
}

function genStage14() {
  return {
    architecture_summary: 'Microservices architecture with React frontend, Node.js API, PostgreSQL data layer, and AWS infrastructure',
    layers: {
      presentation: { technology: 'React + Next.js', components: ['Marketplace UI', 'Seller Dashboard'], rationale: 'SSR for SEO and fast loads' },
      api: { technology: 'Node.js + Express', components: ['REST API', 'WebSocket'], rationale: 'JavaScript full-stack consistency' },
      business_logic: { technology: 'Node.js microservices', components: ['Matching Engine', 'Order Service'], rationale: 'Event-driven architecture' },
      data: { technology: 'PostgreSQL + Redis', components: ['Users', 'Products', 'Orders'], rationale: 'Relational data with caching' },
      infrastructure: { technology: 'AWS (ECS + RDS)', components: ['Container orchestration', 'Managed database'], rationale: 'Scalable cloud infrastructure' },
    },
    security: { authStrategy: 'JWT + OAuth2', dataClassification: 'confidential', complianceRequirements: ['GDPR', 'PCI-DSS'] },
    dataEntities: [{ name: 'User', description: 'Platform users', relationships: ['Order', 'Product'], estimatedVolume: '~5000/month' }],
    integration_points: [{ name: 'API Gateway', source_layer: 'presentation', target_layer: 'api', protocol: 'REST' }],
    constraints: [{ name: 'Response time', description: 'Sub-200ms API response', category: 'performance' }],
    layerCount: 5, totalComponents: 10, allLayersDefined: true, entityCount: 1,
  };
}

function genStage17() {
  return {
    readinessItems: [
      { name: 'Architecture Design', description: 'System architecture defined', status: 'complete', priority: 'critical', category: 'architecture' },
      { name: 'Dev Environment', description: 'Dev environment ready', status: 'complete', priority: 'high', category: 'environment' },
      { name: 'Dependency Audit', description: 'Dependencies reviewed', status: 'complete', priority: 'medium', category: 'dependencies' },
    ],
    blockers: [],
    buildReadiness: { decision: 'go', rationale: 'All critical items complete, ready to build', conditions: [] },
    totalItems: 3, completedItems: 3, blockerCount: 0,
  };
}

function genStage18() {
  return {
    sprintGoal: 'Deliver core marketplace MVP with AI matching',
    sprintItems: [
      { title: 'User Authentication', description: 'JWT-based auth system', type: 'feature', priority: 'critical', estimatedLoc: 300, acceptanceCriteria: 'Users can register, login, and manage sessions', architectureLayer: 'backend', milestoneRef: 'MVP Launch' },
      { title: 'Product Listing API', description: 'CRUD for artisan products', type: 'feature', priority: 'high', estimatedLoc: 250, acceptanceCriteria: 'Artisans can create, edit, and delete listings', architectureLayer: 'backend', milestoneRef: 'MVP Launch' },
    ],
    totalItems: 2, totalEstimatedLoc: 550,
  };
}

function genStage19() {
  return {
    tasks: [
      { name: 'User Authentication', description: 'JWT auth implemented', assignee: 'Dev 1', status: 'done' },
      { name: 'Product Listing API', description: 'CRUD endpoints built', assignee: 'Dev 2', status: 'done' },
    ],
    issues: [], sprintCompletion: { decision: 'complete', readyForQa: true, rationale: 'All tasks done' },
    totalTasks: 2, completedTasks: 2, blockedTasks: 0, openIssues: 0,
  };
}

function genStage20() {
  return {
    testSuites: [
      { name: 'Auth Tests', type: 'unit', totalTests: 20, passingTests: 19, coveragePct: 85, taskRefs: ['User Authentication'] },
      { name: 'API Tests', type: 'integration', totalTests: 15, passingTests: 15, coveragePct: 78, taskRefs: ['Product Listing API'] },
    ],
    knownDefects: [{ description: 'Edge case in token refresh', severity: 'medium', status: 'open', testSuiteRef: 'Auth Tests' }],
    qualityDecision: { decision: 'conditional_pass', rationale: '97% pass rate, 82% coverage, 1 medium defect' },
    overallPassRate: 97.14, coveragePct: 81.5, totalTests: 35, totalFailures: 1, totalDefects: 1, openDefects: 1,
  };
}

function genStage21() {
  return {
    integrations: [
      { name: 'Auth to API', source: 'Auth Service', target: 'API Gateway', status: 'pass', severity: 'critical', environment: 'staging', errorMessage: null },
      { name: 'API to DB', source: 'API', target: 'PostgreSQL', status: 'pass', severity: 'critical', environment: 'staging', errorMessage: null },
    ],
    reviewDecision: { decision: 'approve', rationale: 'All integrations passing', conditions: [] },
    totalIntegrations: 2, passingIntegrations: 2, failingIntegrations: [], passRate: 100, allPassing: true,
  };
}

function genStage22() {
  return {
    releaseItems: [{ name: 'MVP Core', category: 'feature', status: 'approved', approver: 'Product Owner' }],
    releaseNotes: 'Initial MVP with user auth and product listings',
    targetDate: '2026-04-01',
    releaseDecision: { decision: 'release', rationale: 'QA and review both pass', approver: 'Product Owner' },
    sprintRetrospective: { wentWell: ['Clean architecture'], wentPoorly: ['Token refresh edge case'], actionItems: ['Add refresh token tests'] },
    sprintSummary: { sprintGoal: 'Deliver MVP', itemsPlanned: 2, itemsCompleted: 2, qualityAssessment: '97% pass rate', integrationStatus: '2/2 passing' },
    totalItems: 1, approvedItems: 1, allApproved: true,
  };
}

function genStage23() {
  return {
    launchType: 'soft_launch', launchBrief: 'Soft launching marketplace MVP to early adopter segment',
    successCriteria: [
      { metric: 'User signups', target: '100 in 7 days', measurementWindow: '7 days', priority: 'primary' },
      { metric: 'Error rate', target: 'Below 5%', measurementWindow: '7 days', priority: 'secondary' },
    ],
    rollbackTriggers: [{ condition: 'Error rate exceeds 10% for 1 hour', severity: 'critical' }],
    launchTasks: [{ name: 'Deploy to production', owner: 'DevOps', status: 'done' }],
    plannedLaunchDate: '2026-04-01', totalTasks: 1, blockedTasks: 0, primaryCriteria: 1, totalCriteria: 2,
  };
}

function genStage24() {
  return {
    aarrr: {
      acquisition: [{ name: 'Signups', value: 120, target: 100, trendDirection: 'up' }],
      activation: [{ name: 'First listing', value: 40, target: 50, trendDirection: 'up' }],
      retention: [{ name: 'Week 2 return', value: 30, target: 40, trendDirection: 'flat' }],
      revenue: [{ name: 'GMV', value: 2000, target: 5000, trendDirection: 'up' }],
      referral: [{ name: 'Invites sent', value: 15, target: 10, trendDirection: 'up' }],
    },
    criteriaEvaluation: [
      { metric: 'User signups', target: '100 in 7 days', actual: '120', met: true, notes: 'Exceeded target' },
      { metric: 'Error rate', target: 'Below 5%', actual: '2.3%', met: true, notes: 'Well within target' },
    ],
    learnings: [{ insight: 'Artisan onboarding takes longer than expected', action: 'Simplify onboarding flow', impactLevel: 'high' }],
    launchOutcome: { assessment: 'success', criteriaMetRate: 100, summary: 'Launch successful: 100% of criteria met' },
    totalMetrics: 5, metricsOnTarget: 3, metricsBelowTarget: 2, categoriesComplete: true, totalLearnings: 1, highImpactLearnings: 1,
  };
}


// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Stage 01: analyzeStage01', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  it('produces valid stage-01 data from synthesis input', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      description: 'A platform that connects local artisans with global buyers through AI-powered matching and logistics optimization',
      problemStatement: 'Artisans struggle to reach global markets due to high logistics costs and fragmented supply chains',
      valueProp: 'AI-powered marketplace that reduces logistics cost by 40%',
      targetMarket: 'Small artisan businesses in developing economies',
      archetype: 'marketplace',
      keyAssumptions: ['Growing demand', 'AI can optimize'],
      moatStrategy: 'Network effects',
      successCriteria: ['10K sellers in 12mo'],
    }));

    const result = await analyzeStage01({
      synthesis: { description: 'An artisan marketplace platform', targetMarket: 'Artisans' },
      ventureName: 'Test Venture',
      logger: silentLogger,
    });

    expect(result).toHaveProperty('description');
    expect(result).toHaveProperty('problemStatement');
    expect(result).toHaveProperty('valueProp');
    expect(result).toHaveProperty('targetMarket');
    expect(result).toHaveProperty('archetype');
    expect(result).toHaveProperty('sourceProvenance');
    expect(typeof result.description).toBe('string');
    expect(result.description.length).toBeGreaterThanOrEqual(50);
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it('throws when synthesis is missing', async () => {
    await expect(analyzeStage01({ logger: silentLogger }))
      .rejects.toThrow('Stage 1 hydration requires Stage 0 synthesis data');
  });

  it('normalizes invalid archetype to default', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      description: 'A platform that connects local artisans with global buyers through AI-powered matching and logistics optimization',
      problemStatement: 'Artisans struggle to reach global markets due to costs',
      valueProp: 'AI-powered marketplace reducing costs significantly for small businesses',
      targetMarket: 'Small artisans in developing economies',
      archetype: 'invalid_type',
      keyAssumptions: [],
      moatStrategy: '',
      successCriteria: [],
    }));

    const result = await analyzeStage01({
      synthesis: { description: 'test idea for artisans' },
      logger: silentLogger,
    });

    expect(['saas', 'marketplace', 'deeptech', 'hardware', 'services', 'media', 'fintech']).toContain(result.archetype);
  });
});


describe('Stage 02: analyzeStage02', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  it('produces valid stage-02 data with 6 persona evaluations', async () => {
    const personas = ['market-strategist', 'customer-advocate', 'growth-hacker', 'revenue-analyst', 'moat-architect', 'ops-realist'];
    const scores = [75, 80, 65, 70, 60, 72];
    for (let i = 0; i < 6; i++) {
      mockComplete.mockResolvedValueOnce(JSON.stringify({
        model: personas[i],
        summary: `Assessment from ${personas[i]} perspective with sufficient detail for testing`,
        strengths: ['Strong market potential'],
        risks: ['Execution risk'],
        score: scores[i],
      }));
    }

    const result = await analyzeStage02({
      stage1Data: genStage01(),
      ventureName: 'Test Venture',
      logger: silentLogger,
    });

    expect(result).toHaveProperty('critiques');
    expect(result).toHaveProperty('compositeScore');
    expect(result.critiques).toHaveLength(6);
    expect(typeof result.compositeScore).toBe('number');
    expect(result.compositeScore).toBeGreaterThanOrEqual(0);
    expect(result.compositeScore).toBeLessThanOrEqual(100);
    expect(mockComplete).toHaveBeenCalledTimes(6);
  });

  it('throws when stage1Data.description is missing', async () => {
    await expect(analyzeStage02({ stage1Data: {}, logger: silentLogger }))
      .rejects.toThrow('Stage 02 requires Stage 1 data with description');
  });
});


describe('Stage 03: analyzeStage03', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  it('produces valid hybrid scores with kill gate evaluation', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      marketFit: 70, customerNeed: 75, momentum: 60, revenuePotential: 65,
      competitiveBarrier: 55, executionFeasibility: 68,
      reasoning: { marketFit: 'Good fit', customerNeed: 'Strong need', momentum: 'Moderate', revenuePotential: 'Promising', competitiveBarrier: 'Weak moat', executionFeasibility: 'Feasible' },
    }));

    const result = await analyzeStage03({
      stage1Data: genStage01(),
      stage2Data: genStage02(),
      ventureName: 'Test Venture',
      logger: silentLogger,
    });

    expect(result).toHaveProperty('marketFit');
    expect(result).toHaveProperty('customerNeed');
    expect(result).toHaveProperty('momentum');
    expect(result).toHaveProperty('revenuePotential');
    expect(result).toHaveProperty('competitiveBarrier');
    expect(result).toHaveProperty('executionFeasibility');
    expect(result).toHaveProperty('overallScore');
    expect(result).toHaveProperty('decision');
    expect(result).toHaveProperty('hybridBreakdown');
    expect(typeof result.overallScore).toBe('number');
    expect(['pass', 'kill']).toContain(result.decision);
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it('throws when stage2Data critiques missing', async () => {
    await expect(analyzeStage03({ stage1Data: genStage01(), stage2Data: {}, logger: silentLogger }))
      .rejects.toThrow('Stage 03 requires Stage 2 data with critiques array');
  });
});


describe('Stage 04: analyzeStage04', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  it('produces valid competitive landscape with stage5Handoff', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      competitors: [
        { name: 'Etsy', position: 'Global marketplace', threat: 'H', strengths: ['Scale'], weaknesses: ['Fees'], swot: { strengths: ['s'], weaknesses: ['w'], opportunities: ['o'], threats: ['t'] }, pricingModel: { type: 'marketplace', lowTier: '$0.20', highTier: '$0.20', freeOption: false, notes: '' } },
        { name: 'Amazon', position: 'Mega platform', threat: 'H', strengths: ['Reach'], weaknesses: ['Generic'], swot: { strengths: ['s'], weaknesses: ['w'], opportunities: ['o'], threats: ['t'] }, pricingModel: { type: 'marketplace', lowTier: '$39.99', highTier: '$39.99', freeOption: false, notes: '' } },
        { name: 'Faire', position: 'Wholesale', threat: 'M', strengths: ['B2B'], weaknesses: ['Niche'], swot: { strengths: ['s'], weaknesses: ['w'], opportunities: ['o'], threats: ['t'] }, pricingModel: { type: 'marketplace', lowTier: '$0', highTier: '$0', freeOption: true, notes: '' } },
      ],
      stage5Handoff: { avgMarketPrice: '$20/mo', pricingModels: ['marketplace'], priceRange: { low: 0, high: 40 }, competitiveDensity: 'high' },
    }));

    const result = await analyzeStage04({
      stage1Data: genStage01(),
      stage3Data: genStage03(),
      logger: silentLogger,
    });

    expect(result).toHaveProperty('competitors');
    expect(result).toHaveProperty('stage5Handoff');
    expect(result.competitors.length).toBeGreaterThanOrEqual(3);
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it('throws when stage1Data.description is missing', async () => {
    await expect(analyzeStage04({ stage1Data: {}, logger: silentLogger }))
      .rejects.toThrow('Stage 04 requires Stage 1 data with description');
  });
});


describe('Stage 05: analyzeStage05', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  it('produces valid financial model with unit economics', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      initialInvestment: 50000,
      year1: { revenue: 120000, cogs: 36000, opex: 60000 },
      year2: { revenue: 360000, cogs: 108000, opex: 120000 },
      year3: { revenue: 720000, cogs: 216000, opex: 180000 },
      unitEconomics: { cac: 45, ltv: 540, ltvCacRatio: 12, paybackMonths: 3, monthlyChurn: 0.03 },
      roiBands: { pessimistic: 6.88, base: 8.6, optimistic: 11.18 },
      assumptions: ['5% growth', 'Average order $50', '15% commission'],
    }));

    const result = await analyzeStage05({
      stage1Data: genStage01(),
      stage3Data: genStage03(),
      stage4Data: genStage04(),
      logger: silentLogger,
    });

    expect(result).toHaveProperty('initialInvestment');
    expect(result).toHaveProperty('year1');
    expect(result).toHaveProperty('year2');
    expect(result).toHaveProperty('year3');
    expect(result).toHaveProperty('unitEconomics');
    expect(result).toHaveProperty('roiBands');
    expect(result).toHaveProperty('roi3y');
    expect(result).toHaveProperty('decision');
    expect(typeof result.roi3y).toBe('number');
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it('throws when stage1Data.description is missing', async () => {
    await expect(analyzeStage05({ stage1Data: {}, logger: silentLogger }))
      .rejects.toThrow('Stage 05 requires Stage 1 data');
  });
});


describe('Stage 06: analyzeStage06', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  it('produces valid risk matrix with aggregate metrics', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      risks: Array.from({ length: 8 }, (_, i) => ({
        id: `RISK-${String(i + 1).padStart(3, '0')}`,
        category: ['Market', 'Product', 'Technical', 'Legal/Compliance', 'Financial', 'Operational', 'Market', 'Technical'][i],
        description: `Risk description ${i + 1} with enough detail`,
        probability: (i % 4) + 1,
        consequence: ((i + 1) % 4) + 1,
        mitigation: `Mitigation strategy for risk ${i + 1}`,
        source_stage: (i % 5) + 1,
        owner: 'Founder',
      })),
    }));

    const result = await analyzeStage06({
      stage1Data: genStage01(),
      stage5Data: genStage05(),
      logger: silentLogger,
    });

    expect(result).toHaveProperty('risks');
    expect(result).toHaveProperty('risksByCategory');
    expect(result).toHaveProperty('averageScore');
    expect(result).toHaveProperty('totalRisks');
    expect(result.risks.length).toBeGreaterThanOrEqual(8);
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it('throws when stage1Data.description is missing', async () => {
    await expect(analyzeStage06({ stage1Data: {}, logger: silentLogger }))
      .rejects.toThrow('Stage 06 risk matrix requires Stage 1 data with description');
  });
});


describe('Stage 07: analyzeStage07', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  it('produces valid pricing strategy with tiers', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      pricingModel: 'marketplace_commission',
      primaryValueMetric: 'per transaction',
      priceAnchor: { competitorAvg: 20, proposedPrice: 15, positioning: 'discount' },
      tiers: [
        { name: 'Basic', price: 0, billing_period: 'monthly', target_segment: 'New artisans', included_units: '20 listings' },
        { name: 'Pro', price: 29, billing_period: 'monthly', target_segment: 'Active sellers', included_units: 'Unlimited' },
      ],
      unitEconomics: { gross_margin_pct: 70, churn_rate_monthly: 3, cac: 45, arpa: 15 },
      rationale: 'Commission model aligns incentives',
    }));

    const result = await analyzeStage07({
      stage1Data: genStage01(),
      stage5Data: genStage05(),
      logger: silentLogger,
    });

    expect(result).toHaveProperty('pricingModel');
    expect(result).toHaveProperty('tiers');
    expect(result).toHaveProperty('unitEconomics');
    expect(result).toHaveProperty('priceAnchor');
    expect(['freemium', 'subscription', 'usage_based', 'per_seat', 'marketplace_commission', 'one_time']).toContain(result.pricingModel);
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it('throws when stage1Data.description is missing', async () => {
    await expect(analyzeStage07({ stage1Data: {}, logger: silentLogger }))
      .rejects.toThrow('Stage 07 pricing strategy requires Stage 1 data with description');
  });
});


describe('Stage 08: analyzeStage08', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  it('produces valid 9-block BMC', async () => {
    const blocks = {};
    for (const block of ['customerSegments', 'valuePropositions', 'channels', 'customerRelationships', 'revenueStreams', 'keyResources', 'keyActivities', 'keyPartnerships', 'costStructure']) {
      blocks[block] = {
        items: [
          { text: `${block} item 1 text`, priority: 1, evidence: 'Source: Stage 1' },
          { text: `${block} item 2 text`, priority: 2, evidence: 'Source: Stage 4' },
        ],
      };
    }
    mockComplete.mockResolvedValueOnce(JSON.stringify(blocks));

    const result = await analyzeStage08({
      stage1Data: genStage01(),
      stage7Data: genStage07(),
      logger: silentLogger,
    });

    const expectedBlocks = ['customerSegments', 'valuePropositions', 'channels', 'customerRelationships', 'revenueStreams', 'keyResources', 'keyActivities', 'keyPartnerships', 'costStructure'];
    for (const block of expectedBlocks) {
      expect(result).toHaveProperty(block);
      expect(result[block].items.length).toBeGreaterThanOrEqual(1);
    }
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it('throws when stage1Data.description is missing', async () => {
    await expect(analyzeStage08({ stage1Data: {}, logger: silentLogger }))
      .rejects.toThrow('Stage 08 BMC generation requires Stage 1 data with description');
  });
});


describe('Stage 09: analyzeStage09', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  it('produces valid exit strategy with valuation', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      exit_thesis: 'AI-powered artisan marketplace creates significant acquisition value for ecommerce platforms',
      exit_horizon_months: 60,
      exit_paths: [{ type: 'acquisition', description: 'Strategic acquisition', probability_pct: 70 }],
      target_acquirers: [
        { name: 'Shopify', rationale: 'Expand vertical', fit_score: 4 },
        { name: 'Amazon', rationale: 'Handmade expansion', fit_score: 3 },
        { name: 'Etsy', rationale: 'Competitive acquisition', fit_score: 5 },
      ],
      valuationEstimate: { method: 'revenue_multiple', revenueBase: 720000, multipleLow: 3, multipleBase: 5, multipleHigh: 8 },
      milestones: [{ date: 'Month 12', success_criteria: '10K active sellers' }],
    }));

    const result = await analyzeStage09({
      stage1Data: genStage01(),
      stage5Data: genStage05(),
      logger: silentLogger,
    });

    expect(result).toHaveProperty('exit_thesis');
    expect(result).toHaveProperty('exit_paths');
    expect(result).toHaveProperty('target_acquirers');
    expect(result).toHaveProperty('valuationEstimate');
    expect(result.target_acquirers.length).toBeGreaterThanOrEqual(3);
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it('throws when stage1Data.description is missing', async () => {
    await expect(analyzeStage09({ stage1Data: {}, logger: silentLogger }))
      .rejects.toThrow('Stage 09 exit strategy requires Stage 1 data with description');
  });
});


describe('Stage 10: analyzeStage10', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  it('produces valid brand naming analysis with candidates', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      brandGenome: { archetype: 'Explorer', values: ['Authenticity', 'Connection'], tone: 'Warm', audience: 'Craft enthusiasts', differentiators: ['AI matching'] },
      narrativeExtension: { vision: 'Connecting artisans worldwide', mission: 'Building craft bridges', brandVoice: 'Warm and authentic' },
      namingStrategy: 'metaphorical',
      scoringCriteria: [{ name: 'Memorability', weight: 30 }, { name: 'Relevance', weight: 30 }, { name: 'Uniqueness', weight: 20 }, { name: 'Pronounceability', weight: 20 }],
      candidates: [
        { name: 'Craftbridge', rationale: 'Connects artisans to buyers', scores: { Memorability: 85, Relevance: 90, Uniqueness: 75, Pronounceability: 80 } },
        { name: 'ArtisanLink', rationale: 'Direct artisan connection', scores: { Memorability: 70, Relevance: 85, Uniqueness: 60, Pronounceability: 90 } },
        { name: 'Makerly', rationale: 'Maker-focused brand', scores: { Memorability: 80, Relevance: 75, Uniqueness: 85, Pronounceability: 85 } },
        { name: 'Handcraft', rationale: 'Simple craft brand', scores: { Memorability: 75, Relevance: 80, Uniqueness: 50, Pronounceability: 95 } },
        { name: 'Loombridge', rationale: 'Weaving connections', scores: { Memorability: 78, Relevance: 70, Uniqueness: 88, Pronounceability: 72 } },
      ],
      decision: { selectedName: 'Craftbridge', workingTitle: true, rationale: 'Top scoring', availabilityChecks: { domain: 'pending', trademark: 'pending', social: 'pending' } },
    }));

    const result = await analyzeStage10({
      stage1Data: genStage01(),
      logger: silentLogger,
    });

    expect(result).toHaveProperty('brandGenome');
    expect(result).toHaveProperty('scoringCriteria');
    expect(result).toHaveProperty('candidates');
    expect(result).toHaveProperty('decision');
    expect(result.candidates.length).toBeGreaterThanOrEqual(5);
    expect(result.scoringCriteria.length).toBeGreaterThanOrEqual(3);
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it('throws when stage1Data.description is missing', async () => {
    await expect(analyzeStage10({ stage1Data: {}, logger: silentLogger }))
      .rejects.toThrow('Stage 10 naming/brand requires Stage 1 data with description');
  });
});


describe('Stage 11: analyzeStage11', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  it('produces valid GTM strategy with tiers and channels', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      tiers: [
        { name: 'Tier 1', description: 'Early adopters', tam: 1000000, sam: 500000, som: 50000, persona: 'Urban professionals', painPoints: ['Finding crafts'] },
        { name: 'Tier 2', description: 'Mainstream', tam: 5000000, sam: 2000000, som: 200000, persona: 'Gift shoppers', painPoints: ['Quality'] },
        { name: 'Tier 3', description: 'Enterprise', tam: 500000, sam: 100000, som: 10000, persona: 'Store buyers', painPoints: ['Sourcing'] },
      ],
      channels: Array.from({ length: 8 }, (_, i) => ({
        name: `Channel ${i + 1}`, monthly_budget: i < 4 ? 1000 : 0, expected_cac: 50,
        primary_kpi: 'Signups', channelType: i % 2 === 0 ? 'paid' : 'organic', primaryTier: 'Tier 1',
      })),
      launch_timeline: [
        { milestone: 'Soft launch', date: '2026-03-01', owner: 'Founder' },
        { milestone: 'Public launch', date: '2026-05-01', owner: 'Marketing' },
        { milestone: 'Growth phase', date: '2026-07-01', owner: 'Growth' },
      ],
    }));

    const result = await analyzeStage11({
      stage1Data: genStage01(),
      stage5Data: genStage05(),
      logger: silentLogger,
    });

    expect(result).toHaveProperty('tiers');
    expect(result).toHaveProperty('channels');
    expect(result).toHaveProperty('launch_timeline');
    expect(result.tiers).toHaveLength(3);
    expect(result.channels).toHaveLength(8);
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it('throws when stage1Data.description is missing', async () => {
    await expect(analyzeStage11({ stage1Data: {}, logger: silentLogger }))
      .rejects.toThrow('Stage 11 GTM requires Stage 1 data with description');
  });
});


describe('Stage 12: analyzeStage12', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  it('produces valid sales logic with funnel and journey', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      sales_model: 'self-serve', sales_cycle_days: 7,
      deal_stages: [
        { name: 'Awareness', description: 'User discovers platform', avg_duration_days: 2, mappedFunnelStage: 'Awareness' },
        { name: 'Trial', description: 'User signs up', avg_duration_days: 3, mappedFunnelStage: 'Interest' },
        { name: 'Conversion', description: 'First purchase', avg_duration_days: 2, mappedFunnelStage: 'Purchase' },
      ],
      funnel_stages: [
        { name: 'Awareness', metric: 'Visitors', target_value: 10000, conversionRateEstimate: 0.05 },
        { name: 'Interest', metric: 'Signups', target_value: 500, conversionRateEstimate: 0.1 },
        { name: 'Consideration', metric: 'Active', target_value: 200, conversionRateEstimate: 0.25 },
        { name: 'Purchase', metric: 'Buy', target_value: 50, conversionRateEstimate: 0.02 },
      ],
      customer_journey: [
        { step: 'Discovers via search', funnel_stage: 'Awareness', touchpoint: 'Google' },
        { step: 'Reads content', funnel_stage: 'Interest', touchpoint: 'Blog' },
        { step: 'Signs up', funnel_stage: 'Consideration', touchpoint: 'Website' },
        { step: 'Browses products', funnel_stage: 'Consideration', touchpoint: 'Platform' },
        { step: 'Makes purchase', funnel_stage: 'Purchase', touchpoint: 'Checkout' },
      ],
    }));

    const result = await analyzeStage12({
      stage1Data: genStage01(),
      stage7Data: genStage07(),
      stage11Data: genStage11(),
      logger: silentLogger,
    });

    expect(result).toHaveProperty('sales_model');
    expect(result).toHaveProperty('deal_stages');
    expect(result).toHaveProperty('funnel_stages');
    expect(result).toHaveProperty('customer_journey');
    expect(['self-serve', 'inside-sales', 'enterprise', 'hybrid', 'marketplace', 'channel']).toContain(result.sales_model);
    expect(result.deal_stages.length).toBeGreaterThanOrEqual(3);
    expect(result.funnel_stages.length).toBeGreaterThanOrEqual(4);
    expect(result.customer_journey.length).toBeGreaterThanOrEqual(5);
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it('throws when stage1Data.description is missing', async () => {
    await expect(analyzeStage12({ stage1Data: {}, logger: silentLogger }))
      .rejects.toThrow('Stage 12 sales logic requires Stage 1 data with description');
  });
});


describe('Stage 13: analyzeStage13', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  it('produces valid product roadmap with milestones', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      vision_statement: 'Build an AI-powered marketplace that empowers artisans worldwide to reach global buyers efficiently',
      milestones: [
        { name: 'MVP Launch', date: '2026-04-01', deliverables: ['Core marketplace', 'AI matching v1'], dependencies: [], priority: 'now' },
        { name: 'Logistics Integration', date: '2026-06-01', deliverables: ['3PL API integration'], dependencies: ['MVP Launch'], priority: 'next' },
        { name: 'Mobile App', date: '2026-09-01', deliverables: ['iOS and Android'], dependencies: ['MVP Launch'], priority: 'later' },
      ],
      phases: [{ name: 'Phase 1', start_date: '2026-03-01', end_date: '2026-09-01' }],
    }));

    const result = await analyzeStage13({
      stage1Data: genStage01(),
      stage5Data: genStage05(),
      logger: silentLogger,
    });

    expect(result).toHaveProperty('vision_statement');
    expect(result).toHaveProperty('milestones');
    expect(result).toHaveProperty('phases');
    expect(result).toHaveProperty('priorityCounts');
    expect(result.milestones.length).toBeGreaterThanOrEqual(3);
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it('throws when stage1Data.description is missing', async () => {
    await expect(analyzeStage13({ stage1Data: {}, logger: silentLogger }))
      .rejects.toThrow('Stage 13 product roadmap requires Stage 1 data with description');
  });
});


describe('Stage 14: analyzeStage14', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  it('produces valid technical architecture with all 5 layers', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      architecture_summary: 'Microservices architecture with React frontend, Node.js API, PostgreSQL, and AWS infrastructure for scalable marketplace',
      layers: {
        presentation: { technology: 'React', components: ['Marketplace UI', 'Dashboard'], rationale: 'Component-based' },
        api: { technology: 'Node.js', components: ['REST API'], rationale: 'Full-stack JS' },
        business_logic: { technology: 'Node.js', components: ['Matching Engine'], rationale: 'Event-driven' },
        data: { technology: 'PostgreSQL', components: ['Users', 'Orders'], rationale: 'Relational' },
        infrastructure: { technology: 'AWS', components: ['ECS', 'RDS'], rationale: 'Scalable' },
      },
      security: { authStrategy: 'JWT', dataClassification: 'confidential', complianceRequirements: ['GDPR'] },
      dataEntities: [{ name: 'User', description: 'Platform users', relationships: ['Order'], estimatedVolume: '~5K/mo' }],
      integration_points: [{ name: 'API Gateway', source_layer: 'presentation', target_layer: 'api', protocol: 'REST' }],
      constraints: [{ name: 'Latency', description: 'Sub-200ms responses', category: 'performance' }],
    }));

    const result = await analyzeStage14({
      stage1Data: genStage01(),
      stage13Data: genStage13(),
      logger: silentLogger,
    });

    expect(result).toHaveProperty('layers');
    expect(result).toHaveProperty('security');
    expect(result).toHaveProperty('dataEntities');
    expect(result).toHaveProperty('integration_points');
    for (const layer of ['presentation', 'api', 'business_logic', 'data', 'infrastructure']) {
      expect(result.layers).toHaveProperty(layer);
      expect(result.layers[layer]).toHaveProperty('technology');
      expect(result.layers[layer]).toHaveProperty('components');
    }
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it('throws when stage1Data.description is missing', async () => {
    await expect(analyzeStage14({ stage1Data: {}, logger: silentLogger }))
      .rejects.toThrow('Stage 14 technical architecture requires Stage 1 data with description');
  });
});


describe('Stage 15: analyzeStage15', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  it('produces valid risk register with severity breakdown', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      risks: [
        { title: 'Data breach', description: 'PII exposure risk', owner: 'CTO', severity: 'critical', priority: 'immediate', phaseRef: 'Phase 1', mitigationPlan: 'Encrypt all data', contingencyPlan: 'Incident response' },
        { title: 'Scale issues', description: 'DB under load', owner: 'Engineering', severity: 'high', priority: 'short_term', phaseRef: 'Phase 1', mitigationPlan: 'Read replicas', contingencyPlan: 'Horizontal scaling' },
      ],
    }));

    const result = await analyzeStage15({
      stage1Data: genStage01(),
      stage14Data: genStage14(),
      logger: silentLogger,
    });

    expect(result).toHaveProperty('risks');
    expect(result).toHaveProperty('totalRisks');
    expect(result).toHaveProperty('severityBreakdown');
    expect(result.risks.length).toBeGreaterThanOrEqual(1);
    for (const risk of result.risks) {
      expect(['critical', 'high', 'medium', 'low']).toContain(risk.severity);
      expect(['immediate', 'short_term', 'long_term']).toContain(risk.priority);
    }
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it('throws when stage1Data.description is missing', async () => {
    await expect(analyzeStage15({ stage1Data: {}, logger: silentLogger }))
      .rejects.toThrow('Stage 15 risk register requires Stage 1 data with description');
  });
});


describe('Stage 16: analyzeStage16', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  it('produces valid financial projections with cost breakdowns', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      initial_capital: 50000, monthly_burn_rate: 8000,
      revenue_projections: Array.from({ length: 6 }, (_, i) => ({
        month: i + 1, revenue: i * 2000, costs: 8000,
        cost_breakdown: { personnel: 5000, infrastructure: 1500, marketing: 1000, other: 500 },
      })),
      funding_rounds: [{ round_name: 'Pre-seed', target_amount: 100000, target_date: '2026-06-01' }],
    }));

    const result = await analyzeStage16({
      stage1Data: genStage01(),
      stage13Data: genStage13(),
      logger: silentLogger,
    });

    expect(result).toHaveProperty('initial_capital');
    expect(result).toHaveProperty('monthly_burn_rate');
    expect(result).toHaveProperty('revenue_projections');
    expect(result).toHaveProperty('funding_rounds');
    expect(result.initial_capital).toBeGreaterThan(0);
    expect(result.revenue_projections.length).toBeGreaterThanOrEqual(6);
    for (const rp of result.revenue_projections) {
      expect(rp).toHaveProperty('cost_breakdown');
      expect(rp.cost_breakdown).toHaveProperty('personnel');
    }
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it('throws when stage1Data.description is missing', async () => {
    await expect(analyzeStage16({ stage1Data: {}, logger: silentLogger }))
      .rejects.toThrow('Stage 16 financial projections requires Stage 1 data with description');
  });
});


describe('Stage 17: analyzeStage17', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  it('produces valid build readiness assessment', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      readinessItems: [
        { name: 'Architecture Design', description: 'Complete', status: 'complete', priority: 'critical', category: 'architecture' },
        { name: 'Dev Environment', description: 'Ready', status: 'complete', priority: 'high', category: 'environment' },
        { name: 'Dependency Audit', description: 'Done', status: 'complete', priority: 'medium', category: 'dependencies' },
      ],
      blockers: [],
      buildReadiness: { decision: 'go', rationale: 'All critical items complete', conditions: [] },
    }));

    const result = await analyzeStage17({
      stage13Data: genStage13(),
      stage14Data: genStage14(),
      logger: silentLogger,
    });

    expect(result).toHaveProperty('readinessItems');
    expect(result).toHaveProperty('blockers');
    expect(result).toHaveProperty('buildReadiness');
    expect(['go', 'conditional_go', 'no_go']).toContain(result.buildReadiness.decision);
    expect(result.readinessItems.length).toBeGreaterThanOrEqual(3);
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it('throws when stage13Data is missing', async () => {
    await expect(analyzeStage17({ logger: silentLogger }))
      .rejects.toThrow('Stage 17 build readiness requires Stage 13 (product roadmap) data');
  });
});


describe('Stage 18: analyzeStage18', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  it('produces valid sprint plan with items', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      sprintGoal: 'Deliver core marketplace MVP',
      sprintItems: [
        { title: 'User Auth', description: 'JWT-based auth', type: 'feature', priority: 'critical', estimatedLoc: 300, acceptanceCriteria: 'Users can login', architectureLayer: 'backend', milestoneRef: 'MVP Launch' },
        { title: 'Product API', description: 'CRUD products', type: 'feature', priority: 'high', estimatedLoc: 250, acceptanceCriteria: 'CRUD works', architectureLayer: 'backend', milestoneRef: 'MVP Launch' },
      ],
    }));

    const result = await analyzeStage18({
      stage17Data: genStage17(),
      stage13Data: genStage13(),
      logger: silentLogger,
    });

    expect(result).toHaveProperty('sprintGoal');
    expect(result).toHaveProperty('sprintItems');
    expect(result).toHaveProperty('totalEstimatedLoc');
    expect(result.sprintItems.length).toBeGreaterThanOrEqual(1);
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it('throws when stage17Data is missing', async () => {
    await expect(analyzeStage18({ logger: silentLogger }))
      .rejects.toThrow('Stage 18 sprint planning requires Stage 17 (build readiness) data');
  });
});


describe('Stage 19: analyzeStage19', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  it('produces valid build execution progress', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      tasks: [
        { name: 'User Auth', description: 'Implemented', assignee: 'Dev 1', status: 'done' },
        { name: 'Product API', description: 'In progress', assignee: 'Dev 2', status: 'in_progress' },
      ],
      issues: [{ description: 'Token refresh edge case', severity: 'medium', status: 'open' }],
      sprintCompletion: { decision: 'continue', readyForQa: true, rationale: 'Core features ready for testing' },
    }));

    const result = await analyzeStage19({
      stage18Data: genStage18(),
      logger: silentLogger,
    });

    expect(result).toHaveProperty('tasks');
    expect(result).toHaveProperty('issues');
    expect(result).toHaveProperty('sprintCompletion');
    expect(['complete', 'continue', 'blocked']).toContain(result.sprintCompletion.decision);
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it('throws when stage18Data is missing', async () => {
    await expect(analyzeStage19({ logger: silentLogger }))
      .rejects.toThrow('Stage 19 build execution requires Stage 18 (sprint planning) data');
  });
});


describe('Stage 20: analyzeStage20', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  it('produces valid QA assessment with quality decision', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      testSuites: [
        { name: 'Auth Tests', type: 'unit', totalTests: 20, passingTests: 19, coveragePct: 85, taskRefs: ['User Auth'] },
        { name: 'API Tests', type: 'integration', totalTests: 15, passingTests: 15, coveragePct: 78, taskRefs: ['Product API'] },
      ],
      knownDefects: [{ description: 'Token refresh edge case', severity: 'medium', status: 'open', testSuiteRef: 'Auth Tests' }],
      qualityDecision: { decision: 'conditional_pass', rationale: 'High pass rate with one medium defect' },
    }));

    const result = await analyzeStage20({
      stage19Data: genStage19(),
      logger: silentLogger,
    });

    expect(result).toHaveProperty('testSuites');
    expect(result).toHaveProperty('knownDefects');
    expect(result).toHaveProperty('qualityDecision');
    expect(result).toHaveProperty('overallPassRate');
    expect(result).toHaveProperty('coveragePct');
    expect(['pass', 'conditional_pass', 'fail']).toContain(result.qualityDecision.decision);
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it('throws when stage19Data is missing', async () => {
    await expect(analyzeStage20({ logger: silentLogger }))
      .rejects.toThrow('Stage 20 QA requires Stage 19 (build execution) data');
  });
});


describe('Stage 21: analyzeStage21', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  it('produces valid build review with integration results', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      integrations: [
        { name: 'Auth to API', source: 'Auth', target: 'API', status: 'pass', severity: 'critical', environment: 'staging', errorMessage: null },
        { name: 'API to DB', source: 'API', target: 'DB', status: 'pass', severity: 'critical', environment: 'staging', errorMessage: null },
      ],
      reviewDecision: { decision: 'approve', rationale: 'All integrations passing', conditions: [] },
    }));

    const result = await analyzeStage21({
      stage20Data: genStage20(),
      logger: silentLogger,
    });

    expect(result).toHaveProperty('integrations');
    expect(result).toHaveProperty('reviewDecision');
    expect(result).toHaveProperty('passRate');
    expect(['approve', 'conditional', 'reject']).toContain(result.reviewDecision.decision);
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it('throws when stage20Data is missing', async () => {
    await expect(analyzeStage21({ logger: silentLogger }))
      .rejects.toThrow('Stage 21 build review requires Stage 20 (QA) data');
  });
});


describe('Stage 22: analyzeStage22', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  it('produces valid release readiness with retro and summary', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      releaseItems: [{ name: 'MVP Core', category: 'feature', status: 'approved', approver: 'PO' }],
      releaseNotes: 'Initial MVP release with core marketplace features and AI matching engine v1',
      targetDate: '2026-04-01',
      releaseDecision: { decision: 'release', rationale: 'QA and review pass', approver: 'PO' },
      sprintRetrospective: { wentWell: ['Clean code'], wentPoorly: ['Token bug'], actionItems: ['More tests'] },
      sprintSummary: { sprintGoal: 'MVP', itemsPlanned: 2, itemsCompleted: 2, qualityAssessment: '97%', integrationStatus: '2/2' },
    }));

    const result = await analyzeStage22({
      stage20Data: genStage20(),
      stage21Data: genStage21(),
      stage18Data: genStage18(),
      stage19Data: genStage19(),
      logger: silentLogger,
    });

    expect(result).toHaveProperty('releaseItems');
    expect(result).toHaveProperty('releaseNotes');
    expect(result).toHaveProperty('releaseDecision');
    expect(result).toHaveProperty('sprintRetrospective');
    expect(result).toHaveProperty('sprintSummary');
    expect(['release', 'hold', 'cancel']).toContain(result.releaseDecision.decision);
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it('throws when stage20Data or stage21Data is missing', async () => {
    await expect(analyzeStage22({ stage20Data: genStage20(), logger: silentLogger }))
      .rejects.toThrow('Stage 22 release readiness requires Stage 20 (QA) and Stage 21 (review) data');
  });
});


describe('Stage 23: analyzeStage23', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  it('produces valid launch execution brief', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      launchType: 'soft_launch',
      launchBrief: 'Soft launching the artisan marketplace MVP to early adopters in 3 key markets',
      successCriteria: [
        { metric: 'User signups', target: '100 in 7 days', measurementWindow: '7 days', priority: 'primary' },
        { metric: 'Error rate', target: 'Below 5%', measurementWindow: '7 days', priority: 'secondary' },
      ],
      rollbackTriggers: [{ condition: 'Error rate > 10% for 1 hour', severity: 'critical' }],
      launchTasks: [{ name: 'Deploy to production', owner: 'DevOps', status: 'pending' }],
      plannedLaunchDate: '2026-04-01',
    }));

    const result = await analyzeStage23({
      stage22Data: genStage22(),
      logger: silentLogger,
    });

    expect(result).toHaveProperty('launchType');
    expect(result).toHaveProperty('successCriteria');
    expect(result).toHaveProperty('rollbackTriggers');
    expect(result).toHaveProperty('launchTasks');
    expect(['soft_launch', 'beta', 'general_availability']).toContain(result.launchType);
    expect(result.successCriteria.length).toBeGreaterThanOrEqual(2);
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it('throws when stage22Data is missing', async () => {
    await expect(analyzeStage23({ logger: silentLogger }))
      .rejects.toThrow('Stage 23 launch execution requires Stage 22 (release readiness) data');
  });
});


describe('Stage 24: analyzeStage24', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  it('produces valid launch scorecard with AARRR metrics', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      aarrr: {
        acquisition: [{ name: 'Signups', value: 120, target: 100, trendDirection: 'up' }],
        activation: [{ name: 'First listing', value: 40, target: 50, trendDirection: 'up' }],
        retention: [{ name: 'Week 2 return', value: 30, target: 40, trendDirection: 'flat' }],
        revenue: [{ name: 'GMV', value: 2000, target: 5000, trendDirection: 'up' }],
        referral: [{ name: 'Invites', value: 15, target: 10, trendDirection: 'up' }],
      },
      criteriaEvaluation: [
        { metric: 'User signups', target: '100 in 7 days', actual: '120', met: true, notes: 'Exceeded' },
        { metric: 'Error rate', target: 'Below 5%', actual: '2.3%', met: true, notes: 'Good' },
      ],
      learnings: [{ insight: 'Onboarding needs simplification', action: 'Redesign flow', impactLevel: 'high' }],
      launchOutcome: { assessment: 'success', criteriaMetRate: 100, summary: 'All criteria met' },
    }));

    const result = await analyzeStage24({
      stage23Data: genStage23(),
      logger: silentLogger,
    });

    expect(result).toHaveProperty('aarrr');
    expect(result).toHaveProperty('criteriaEvaluation');
    expect(result).toHaveProperty('learnings');
    expect(result).toHaveProperty('launchOutcome');
    for (const cat of ['acquisition', 'activation', 'retention', 'revenue', 'referral']) {
      expect(result.aarrr).toHaveProperty(cat);
      expect(result.aarrr[cat].length).toBeGreaterThanOrEqual(1);
    }
    expect(['success', 'partial', 'failure', 'indeterminate']).toContain(result.launchOutcome.assessment);
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it('throws when stage23Data is missing', async () => {
    await expect(analyzeStage24({ logger: silentLogger }))
      .rejects.toThrow('Stage 24 metrics & learning requires Stage 23 (launch execution) data');
  });
});


describe('Stage 25: analyzeStage25', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  it('produces valid venture review with decision', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      journeySummary: 'The artisan marketplace venture progressed from concept through 25 stages of rigorous analysis and build execution, culminating in a successful soft launch.',
      financialComparison: {
        projectedRevenue: '$120K Year 1', actualRevenue: 'On track for $130K',
        projectedCosts: '$96K Year 1', actualCosts: '$90K',
        variance: 'Revenue 8% above, costs 6% below projection',
        assessment: 'Above expectations',
      },
      ventureHealth: {
        overallRating: 'good',
        dimensions: {
          product: { score: 8, rationale: 'Core features shipped' },
          market: { score: 7, rationale: 'Good early traction' },
          technical: { score: 9, rationale: 'Clean architecture' },
          financial: { score: 7, rationale: 'On track to projections' },
          team: { score: 6, rationale: 'Small team, need to hire' },
        },
      },
      driftAnalysis: {
        originalVision: 'AI-powered artisan marketplace',
        currentState: 'MVP launched with core features',
        driftDetected: false,
        driftSummary: 'Venture remains aligned with original vision',
      },
      ventureDecision: {
        recommendation: 'continue',
        confidence: 85,
        rationale: 'Strong early metrics and positive market response support continued investment',
        nextActions: ['Hire 2 engineers', 'Launch in 3 more markets'],
      },
      initiatives: {
        product: [{ title: 'MVP Launch', status: 'completed', outcome: 'Core features live' }],
        market: [{ title: 'Early Adopter Outreach', status: 'completed', outcome: '120 signups' }],
        technical: [{ title: 'Architecture Setup', status: 'completed', outcome: 'Scalable infra' }],
        financial: [{ title: 'Pre-seed Prep', status: 'in_progress', outcome: 'Deck ready' }],
        team: [{ title: 'Engineering Hire', status: 'planned', outcome: 'Pending' }],
      },
    }));

    const result = await analyzeStage25({
      stage24Data: genStage24(),
      stage23Data: genStage23(),
      stage01Data: genStage01(),
      stage05Data: genStage05(),
      logger: silentLogger,
    });

    expect(result).toHaveProperty('journeySummary');
    expect(result).toHaveProperty('financialComparison');
    expect(result).toHaveProperty('ventureHealth');
    expect(result).toHaveProperty('driftAnalysis');
    expect(result).toHaveProperty('ventureDecision');
    expect(result).toHaveProperty('initiatives');
    expect(['continue', 'pivot', 'expand', 'sunset', 'exit']).toContain(result.ventureDecision.recommendation);
    expect(result.ventureDecision.confidence).toBeGreaterThanOrEqual(0);
    expect(result.ventureDecision.confidence).toBeLessThanOrEqual(100);
    expect(['excellent', 'good', 'fair', 'poor', 'critical']).toContain(result.ventureHealth.overallRating);
    for (const cat of ['product', 'market', 'technical', 'financial', 'team']) {
      expect(result.ventureHealth.dimensions).toHaveProperty(cat);
      expect(result.initiatives).toHaveProperty(cat);
    }
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it('throws when stage24Data is missing', async () => {
    await expect(analyzeStage25({ logger: silentLogger }))
      .rejects.toThrow('Stage 25 venture review requires Stage 24 (metrics & learning) data');
  });
});
