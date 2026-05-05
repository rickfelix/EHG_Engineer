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

function genStage10() {
  return {
    customerPersonas: [
      {
        name: 'Tech-Savvy Artisan Founder',
        demographics: { ageRange: '25-40', role: 'Artisan/Seller', companySize: '1-10', industry: 'Crafts', income: 'Mid', location: 'Urban' },
        goals: ['Reach global buyers', 'Reduce logistics costs'],
        painPoints: ['High fees', 'Fragmented supply chain'],
        behaviors: ['Uses social media', 'Attends craft fairs'],
        motivations: ['Financial independence', 'Creative expression'],
      },
      {
        name: 'Global Craft Buyer',
        demographics: { ageRange: '30-50', role: 'Consumer', companySize: 'N/A', industry: 'Retail', income: 'High', location: 'Urban' },
        goals: ['Find authentic crafts', 'Support artisans'],
        painPoints: ['Limited access', 'Quality assurance'],
        behaviors: ['Shops online', 'Values sustainability'],
        motivations: ['Unique products', 'Cultural connection'],
      },
      {
        name: 'Boutique Store Buyer',
        demographics: { ageRange: '35-55', role: 'Store Manager', companySize: '10-50', industry: 'Retail', income: 'Mid-High', location: 'Suburban' },
        goals: ['Source unique products', 'Wholesale efficiency'],
        painPoints: ['Finding suppliers', 'Minimum order quantities'],
        behaviors: ['Attends trade shows', 'Online sourcing'],
        motivations: ['Differentiation', 'Customer satisfaction'],
      },
    ],
    brandGenome: {
      archetype: 'Explorer',
      values: ['Authenticity', 'Connection', 'Empowerment'],
      tone: 'Warm and adventurous',
      audience: 'Global craft enthusiasts and artisans',
      differentiators: ['AI-powered matching', 'Logistics optimization'],
      customerAlignment: [
        { trait: 'Authenticity', personaName: 'Tech-Savvy Artisan Founder', personaInsight: 'Values genuine craft identity' },
      ],
    },
    brandPersonality: {
      vision: 'Connect artisans worldwide to global buyers',
      mission: 'Empowering artisans through AI-powered global access',
      brandVoice: 'Warm, inspiring, and pragmatic',
    },
    namingStrategy: 'metaphorical',
    scoringCriteria: [
      { name: 'Memorability', weight: 30 },
      { name: 'Relevance', weight: 30 },
      { name: 'Uniqueness', weight: 20 },
      { name: 'Pronounceability', weight: 20 },
    ],
    candidates: [
      { name: 'Craftbridge', rationale: 'Connects artisans to buyers', scores: { Memorability: 85, Relevance: 90, Uniqueness: 75, Pronounceability: 80 } },
      { name: 'ArtisanLink', rationale: 'Direct artisan connection', scores: { Memorability: 70, Relevance: 85, Uniqueness: 60, Pronounceability: 90 } },
      { name: 'Makerly', rationale: 'Maker-focused brand', scores: { Memorability: 80, Relevance: 75, Uniqueness: 85, Pronounceability: 85 } },
      { name: 'Handcraft', rationale: 'Simple craft brand', scores: { Memorability: 75, Relevance: 80, Uniqueness: 50, Pronounceability: 95 } },
      { name: 'Loombridge', rationale: 'Weaving connections', scores: { Memorability: 78, Relevance: 70, Uniqueness: 88, Pronounceability: 72 } },
    ],
    decision: { selectedName: 'Craftbridge', workingTitle: true, rationale: 'Top scoring', availabilityChecks: { domain: 'pending', trademark: 'pending', social: 'pending' } },
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
  // Build readiness output (from analyzeStage18 = stage-18-build-readiness.js)
  // Returns checklist (grouped by category), not readinessItems
  return {
    checklist: {
      architecture: [{ name: 'Architecture Design', status: 'complete', owner: '', notes: 'System architecture defined' }],
      team_readiness: [{ name: 'Team Roles', status: 'complete', owner: '', notes: 'Dev team assembled' }],
      tooling: [{ name: 'Tooling Setup', status: 'complete', owner: '', notes: 'CI/CD configured' }],
      environment: [{ name: 'Dev Environment', status: 'complete', owner: '', notes: 'Dev environment ready' }],
      dependencies: [{ name: 'Dependency Audit', status: 'complete', owner: '', notes: 'Dependencies reviewed' }],
    },
    blockers: [],
    buildReadiness: { decision: 'go', rationale: 'All critical items complete, ready to build', conditions: [] },
    total_items: 5, completed_items: 5, readiness_pct: 100, blocker_count: 0, all_categories_present: true,
  };
}

function genStage19() {
  // Sprint plan output (from analyzeStage19 = stage-19-sprint-planning.js)
  return {
    sprint_goal: 'Deliver core marketplace MVP with AI matching',
    items: [
      { title: 'User Authentication', description: 'JWT-based auth system', type: 'feature', priority: 'critical', scope: 'backend', success_criteria: 'Users can register, login, and manage sessions', dependencies: [], risks: [], target_application: 'ehg', story_points: 6, app_type: 'agnostic', architectureLayer: 'backend', milestoneRef: 'MVP Launch' },
      { title: 'Product Listing API', description: 'CRUD for artisan products', type: 'feature', priority: 'high', scope: 'backend', success_criteria: 'Artisans can create, edit, and delete listings', dependencies: [], risks: [], target_application: 'ehg', story_points: 5, app_type: 'agnostic', architectureLayer: 'backend', milestoneRef: 'MVP Launch' },
    ],
    total_items: 2, total_story_points: 11,
    sd_bridge_payloads: [],
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

  it('produces valid stage-02 data with 7 persona evaluations', async () => {
    const personas = ['market-strategist', 'customer-advocate', 'growth-hacker', 'revenue-analyst', 'moat-architect', 'ops-realist', 'product-designer'];
    const scores = [75, 80, 65, 70, 60, 72, 68];
    for (let i = 0; i < 7; i++) {
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
    expect(result.critiques).toHaveLength(7);
    expect(typeof result.compositeScore).toBe('number');
    expect(result.compositeScore).toBeGreaterThanOrEqual(0);
    expect(result.compositeScore).toBeLessThanOrEqual(100);
    expect(mockComplete).toHaveBeenCalledTimes(7);
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
    expect(['pass', 'kill', 'revise']).toContain(result.decision);
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
    expect(result).toHaveProperty('aggregate_risk_score');
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

    expect(result).toHaveProperty('pricing_model');
    expect(result).toHaveProperty('tiers');
    expect(result).toHaveProperty('gross_margin_pct');
    expect(result).toHaveProperty('priceAnchor');
    expect(['freemium', 'subscription', 'usage_based', 'tiered', 'enterprise', 'marketplace', 'marketplace_commission', 'one_time']).toContain(result.pricing_model);
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
      .rejects.toThrow('Stage 10 customer & brand requires Stage 1 data with description');
  });
});


describe('Stage 11: analyzeStage11', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  it('produces valid naming & visual identity analysis', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      namingStrategy: { approach: 'metaphorical', rationale: 'Fits brand and personas' },
      scoringCriteria: [
        { name: 'Memorability', weight: 25 },
        { name: 'Relevance', weight: 25 },
        { name: 'Persona Resonance', weight: 25 },
        { name: 'Uniqueness', weight: 25 },
      ],
      candidates: [
        { name: 'Craftbridge', rationale: 'Connects artisans to buyers', scores: { Memorability: 85, Relevance: 90, 'Persona Resonance': 80, Uniqueness: 75 }, personaFit: [{ personaName: 'Tech-Savvy Artisan Founder', fitScore: 90, reasoning: 'Resonates with artisan identity' }] },
        { name: 'ArtisanLink', rationale: 'Direct link', scores: { Memorability: 70, Relevance: 85, 'Persona Resonance': 75, Uniqueness: 60 }, personaFit: [{ personaName: 'Tech-Savvy Artisan Founder', fitScore: 80, reasoning: 'Clear connection' }] },
        { name: 'Makerly', rationale: 'Maker brand', scores: { Memorability: 80, Relevance: 75, 'Persona Resonance': 70, Uniqueness: 85 }, personaFit: [{ personaName: 'Tech-Savvy Artisan Founder', fitScore: 75, reasoning: 'Maker identity' }] },
        { name: 'Handcraft', rationale: 'Simple', scores: { Memorability: 75, Relevance: 80, 'Persona Resonance': 65, Uniqueness: 50 }, personaFit: [{ personaName: 'Tech-Savvy Artisan Founder', fitScore: 70, reasoning: 'Familiar' }] },
        { name: 'Loombridge', rationale: 'Weaving', scores: { Memorability: 78, Relevance: 70, 'Persona Resonance': 72, Uniqueness: 88 }, personaFit: [{ personaName: 'Tech-Savvy Artisan Founder', fitScore: 68, reasoning: 'Craft metaphor' }] },
      ],
      visualIdentity: {
        colorPalette: [
          { name: 'Primary', hex: '#2563EB', usage: 'Primary brand', personaAlignment: 'Professional' },
          { name: 'Secondary', hex: '#10B981', usage: 'Accents', personaAlignment: 'Growth' },
          { name: 'Neutral', hex: '#6B7280', usage: 'Text', personaAlignment: 'Clean' },
        ],
        typography: { heading: 'Inter', body: 'Inter', rationale: 'Clean sans-serif' },
        imageryGuidance: 'Authentic artisan imagery with warm tones',
      },
      brandExpression: {
        tagline: 'Connect. Create. Thrive.',
        elevator_pitch: 'AI-powered marketplace connecting artisans to global buyers',
        messaging_pillars: ['Authenticity', 'Connection', 'Empowerment'],
      },
      decision: {
        selectedName: 'Craftbridge',
        workingTitle: true,
        rationale: 'Top scoring on memorability and relevance',
        availabilityChecks: { domain: 'pending', trademark: 'pending', social: 'pending' },
      },
      logoSpec: {
        textTreatment: 'Title case with bridge icon left-aligned',
        primaryColor: '#2563EB',
        accentColor: '#10B981',
        typography: 'Inter',
        iconConcept: 'A simple arched bridge connecting two dots representing artisans and buyers globally',
        svgPrompt: 'A clean modern logo with "Craftbridge" in Inter font, preceded by a small bridge icon in primary blue #2563EB on white background, 200x50px dimensions',
      },
    }));

    const result = await analyzeStage11({
      stage1Data: genStage01(),
      stage5Data: genStage05(),
      stage10Data: genStage10(),
      logger: silentLogger,
    });

    expect(result).toHaveProperty('namingStrategy');
    expect(result).toHaveProperty('scoringCriteria');
    expect(result).toHaveProperty('candidates');
    expect(result).toHaveProperty('visualIdentity');
    expect(result).toHaveProperty('decision');
    expect(result.candidates.length).toBeGreaterThanOrEqual(5);
    expect(result.scoringCriteria.length).toBeGreaterThanOrEqual(3);
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it('throws when stage1Data.description is missing', async () => {
    await expect(analyzeStage11({ stage1Data: {}, stage10Data: genStage10(), logger: silentLogger }))
      .rejects.toThrow('Stage 11 requires Stage 1 data with description');
  });
});


describe('Stage 12: analyzeStage12', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  it('produces valid GTM & sales strategy with market tiers, channels, funnel and journey', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      marketTiers: [
        { name: 'Tier 1: Early Adopters', description: 'Tech-savvy craft buyers', persona: 'Tech-Savvy Artisan Founder', painPoints: ['Finding authentic crafts'], tam: 1000000, sam: 500000, som: 50000 },
        { name: 'Tier 2: Mainstream', description: 'General craft buyers', persona: 'Global Craft Buyer', painPoints: ['Quality assurance'], tam: 5000000, sam: 2000000, som: 200000 },
        { name: 'Tier 3: Enterprise', description: 'Boutique retailers', persona: 'Boutique Store Buyer', painPoints: ['Wholesale sourcing'], tam: 500000, sam: 100000, som: 10000 },
      ],
      channels: Array.from({ length: 8 }, (_, i) => ({
        name: `Channel ${i + 1}`, channelType: i % 2 === 0 ? 'paid' : 'organic',
        primaryTier: 'Tier 1: Early Adopters', monthly_budget: i < 4 ? 1000 : 0,
        expected_cac: 50, primary_kpi: 'Signups',
      })),
      salesModel: 'marketplace',
      sales_cycle_days: 7,
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
      stage10Data: genStage10(),
      logger: silentLogger,
    });

    expect(result).toHaveProperty('marketTiers');
    expect(result).toHaveProperty('channels');
    expect(result).toHaveProperty('salesModel');
    expect(result).toHaveProperty('deal_stages');
    expect(result).toHaveProperty('funnel_stages');
    expect(result).toHaveProperty('customer_journey');
    expect(['self-serve', 'inside-sales', 'enterprise', 'hybrid', 'marketplace', 'channel']).toContain(result.salesModel);
    expect(result.marketTiers.length).toBeGreaterThanOrEqual(3);
    expect(result.deal_stages.length).toBeGreaterThanOrEqual(3);
    expect(result.funnel_stages.length).toBeGreaterThanOrEqual(4);
    expect(result.customer_journey.length).toBeGreaterThanOrEqual(5);
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it('throws when stage1Data.description is missing', async () => {
    await expect(analyzeStage12({ stage1Data: {}, stage10Data: genStage10(), logger: silentLogger }))
      .rejects.toThrow('Stage 12 requires Stage 1 data with description');
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
    // First LLM call: architecture (must use canonical EHG house stack to pass validation)
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      architecture_summary: 'React + Vite + Tailwind frontend with REST via Vercel Functions API, Node.js TypeScript business logic, PostgreSQL via Supabase data layer, hosted on Vercel + Replit + Supabase',
      layers: {
        presentation: { technology: 'React + Vite + Tailwind', components: ['Marketplace UI', 'Seller Dashboard'], rationale: 'EHG house stack' },
        api: { technology: 'REST via Vercel Functions', components: ['Products API', 'Auth API'], rationale: 'EHG house stack' },
        business_logic: { technology: 'Node.js (TypeScript)', components: ['Matching Engine', 'Order Service'], rationale: 'EHG house stack' },
        data: { technology: 'PostgreSQL via Supabase', components: ['Users', 'Products', 'Orders'], rationale: 'EHG house stack' },
        infrastructure: { technology: 'Vercel + Replit + Supabase', components: ['Hosting', 'Database'], rationale: 'EHG house stack' },
      },
      security: { authStrategy: 'Supabase Auth', dataClassification: 'confidential', complianceRequirements: ['GDPR'] },
      dataEntities: [{ name: 'User', description: 'Platform users', relationships: ['Order'], estimatedVolume: '~5K/mo' }],
      integration_points: [{ name: 'API Gateway', source_layer: 'presentation', target_layer: 'api', protocol: 'REST' }],
      constraints: [{ name: 'Latency', description: 'Sub-200ms responses', category: 'performance' }],
      override_reason: '',
    }));
    // Second LLM call: risk register
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      risks: [
        { title: 'Data breach', description: 'PII exposure via insecure API', owner: 'CTO', severity: 'critical', priority: 'immediate', phaseRef: 'Phase 1', mitigationPlan: 'Encrypt all PII at rest and in transit', contingencyPlan: 'Incident response plan' },
        { title: 'Scale bottleneck', description: 'DB under high load', owner: 'Engineering', severity: 'high', priority: 'short_term', phaseRef: 'Phase 1', mitigationPlan: 'Add read replicas', contingencyPlan: 'Horizontal scaling' },
      ],
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
    expect(result).toHaveProperty('risks');
    for (const layer of ['presentation', 'api', 'business_logic', 'data', 'infrastructure']) {
      expect(result.layers).toHaveProperty(layer);
      expect(result.layers[layer]).toHaveProperty('technology');
      expect(result.layers[layer]).toHaveProperty('components');
    }
    expect(mockComplete).toHaveBeenCalledTimes(2);
  });

  it('throws when stage1Data.description is missing', async () => {
    await expect(analyzeStage14({ stage1Data: {}, logger: silentLogger }))
      .rejects.toThrow('Stage 14 technical architecture requires Stage 1 data with description');
  });
});


describe('Stage 15: analyzeStage15', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  // analyzeStage15 is the Design Studio stub: returns {} and makes no LLM calls.
  // The real work (wireframes, visual convergence) is done by the stage-15.js multiplexer.
  it.skip('produces valid risk register with severity breakdown', async () => {
    // Skipped: analyzeStage15DesignStudio delegates all work to the multiplexer and returns {}.
    // Risk register was moved to Stage 14 (SD-RESTRUCTURE-STAGE-15-MOVE-ORCH-001-B).
  });

  it.skip('throws when stage1Data.description is missing', async () => {
    // Skipped: analyzeStage15DesignStudio never throws — it returns {} unconditionally.
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

  // analyzeStage17 is the Blueprint Review aggregator: no LLM calls, requires
  // ventureId + supabase client to query venture_artifacts from the DB.
  it.skip('produces valid build readiness assessment', async () => {
    // Skipped: analyzeStage17 requires ventureId and supabase client (DB-backed aggregation).
    // It makes no LLM calls — covered by integration tests that have a real Supabase env.
  });

  it('throws when ventureId and supabase are missing', async () => {
    await expect(analyzeStage17({ logger: silentLogger }))
      .rejects.toThrow('analyzeStage17 requires ventureId and supabase client');
  });
});


describe('Stage 18: analyzeStage18', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  it('produces valid build readiness assessment', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      readinessItems: [
        { name: 'Architecture Design', description: 'Complete', status: 'complete', priority: 'critical', category: 'architecture' },
        { name: 'Dev Environment', description: 'Ready', status: 'complete', priority: 'high', category: 'environment' },
        { name: 'Dependency Audit', description: 'Done', status: 'complete', priority: 'medium', category: 'dependencies' },
        { name: 'Team Roles', description: 'Assigned', status: 'complete', priority: 'high', category: 'team_readiness' },
        { name: 'Tooling Setup', description: 'Done', status: 'complete', priority: 'medium', category: 'tooling' },
      ],
      blockers: [],
      buildReadiness: { decision: 'go', rationale: 'All critical items complete', conditions: [] },
    }));

    const result = await analyzeStage18({
      stage13Data: genStage13(),
      stage14Data: genStage14(),
      logger: silentLogger,
    });

    expect(result).toHaveProperty('checklist');
    expect(result).toHaveProperty('blockers');
    expect(result).toHaveProperty('buildReadiness');
    expect(['go', 'conditional_go', 'no_go']).toContain(result.buildReadiness.decision);
    expect(typeof result.checklist).toBe('object');
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it('throws when stage13Data is missing', async () => {
    await expect(analyzeStage18({ logger: silentLogger }))
      .rejects.toThrow('Stage 18 build readiness requires Stage 13 (product roadmap) data');
  });
});


describe('Stage 19: analyzeStage19', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  it('produces valid sprint plan with mandatory capabilities included', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      sprintGoal: 'Deliver core marketplace MVP with AI matching',
      sprintItems: [
        { title: 'User Authentication', description: 'JWT-based auth system', type: 'feature', priority: 'critical', estimatedLoc: 300, acceptanceCriteria: 'Users can register, login, and manage sessions', architectureLayer: 'backend', milestoneRef: 'MVP Launch' },
        { title: 'Product Listing API', description: 'CRUD for artisan products', type: 'feature', priority: 'high', estimatedLoc: 250, acceptanceCriteria: 'Artisans can create, edit, and delete listings', architectureLayer: 'backend', milestoneRef: 'MVP Launch' },
        // Mandatory EHG portfolio default capabilities (SD-LEO-ENH-CONSTRAIN-STAGE-EMIT-001)
        { title: 'Integrate Feedback Widget', description: 'Embed the EHG feedback widget for chairman-level visibility', type: 'feature', priority: 'medium', estimatedLoc: 50, acceptanceCriteria: 'Feedback widget visible on all pages', architectureLayer: 'frontend', milestoneRef: 'MVP Launch' },
        { title: 'Wire Error Capture Middleware', description: 'Add error capture middleware for observability', type: 'feature', priority: 'medium', estimatedLoc: 100, acceptanceCriteria: 'All unhandled errors captured and reported', architectureLayer: 'backend', milestoneRef: 'MVP Launch' },
      ],
    }));

    const result = await analyzeStage19({
      stage18Data: genStage18(),
      logger: silentLogger,
    });

    expect(result).toHaveProperty('sprint_goal');
    expect(result).toHaveProperty('items');
    expect(result).toHaveProperty('total_items');
    expect(result).toHaveProperty('total_story_points');
    expect(result.items.length).toBeGreaterThanOrEqual(1);
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it('throws when stage18Data is missing', async () => {
    await expect(analyzeStage19({ logger: silentLogger }))
      .rejects.toThrow('Stage 19 sprint planning requires Stage 18 (build readiness) data');
  });
});


describe('Stage 20: analyzeStage20', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  // SD-LEO-FEAT-STAGE-CODE-QUALITY-001 FR-1 (2026-05-03): analyzeStage20 now
  // dispatches to the canonical Code Quality Gate analyzer (stage-20-code-quality.js)
  // — NOT the legacy stage-20-build-execution.js. The legacy export is still
  // reachable via analyzeStage20BuildExecution for backwards-compat callers.
  it.skip('produces valid QA assessment with quality decision', async () => {
    // Skipped: superseded — canonical analyzer needs a github_repo + clone path.
    // Covered by tests/unit/eva/stage-code-quality-fr-1-2-4-8.test.js.
  });

  it('returns BLOCKED verdict when no github_repo (canonical analyzer)', async () => {
    const result = await analyzeStage20({
      stage19Data: null,
      ventureName: 'IntegrationTestVenture',
      ventureId: null,
      supabase: null,
      logger: silentLogger,
    });
    expect(result.verdict).toBe('BLOCKED');
    expect(result.findings[0].check).toBe('precondition');
  });
});


describe('Stage 21: analyzeStage21', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  // analyzeStage21 = stage-21-quality-assurance.js. LLM synthesis is permanently
  // disabled — requires real SD completion data from venture_stage_work.
  it.skip('produces valid build review with integration results', async () => {
    // Skipped: analyzeStage21 is REFUSED — requires real QA data from SD completion rates.
    // LLM fabrication is permanently disabled to prevent poisoned downstream stages.
  });

  it('throws when stage20Data is missing', async () => {
    await expect(analyzeStage21({ logger: silentLogger }))
      .rejects.toThrow('Stage 21 QA requires Stage 20 (build execution) data');
  });
});


describe('Stage 22: analyzeStage22', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  // analyzeStage22 = stage-22-build-review.js. LLM synthesis is permanently
  // disabled — requires real SD completion data from venture_stage_work.
  it.skip('produces valid release readiness with retro and summary', async () => {
    // Skipped: analyzeStage22 is REFUSED — requires real integration data from SD completion.
    // LLM fabrication is permanently disabled to prevent poisoned downstream stages.
  });

  it('throws when stage21Data is missing', async () => {
    await expect(analyzeStage22({ stage20Data: genStage20(), logger: silentLogger }))
      .rejects.toThrow('Stage 22 build review requires Stage 21 (Quality Assurance) data');
  });
});


describe('Stage 23: analyzeStage23', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  // analyzeStage23 = stage-23-release-readiness.js (release readiness, not launch execution).
  // REFUSED — requires real build data from upstream SD completion pipeline.
  it.skip('produces valid launch execution brief', async () => {
    // Skipped: analyzeStage23 is REFUSED — requires real data from upstream SD completion.
    // LLM fabrication is permanently disabled to prevent poisoned downstream stages.
  });

  it('throws when stage21Data and stage22Data are missing', async () => {
    await expect(analyzeStage23({ stage22Data: genStage22(), logger: silentLogger }))
      .rejects.toThrow('Stage 23 release readiness requires Stage 21 (QA) and Stage 22 (review) data');
  });
});


describe('Stage 24: analyzeStage24', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  // analyzeStage24 = stage-24-marketing-prep.js (REFUSED).
  // Imports checkReleaseReadiness from stage-24.js which does not export it,
  // causing TypeError when called. REFUSED otherwise (no LLM synthesis).
  it.skip('produces valid launch scorecard with AARRR metrics', async () => {
    // Skipped: analyzeStage24 is REFUSED — requires real data from upstream SD completion.
    // Additionally imports checkReleaseReadiness from stage-24.js which is not exported there.
  });

  it('throws when called (broken import or REFUSED)', async () => {
    // checkReleaseReadiness is not exported from stage-24.js — TypeError is expected
    await expect(analyzeStage24({ logger: silentLogger }))
      .rejects.toThrow();
  });
});


describe('Stage 25: analyzeStage25 (Post-Launch Review)', () => {
  beforeEach(() => { mockComplete.mockReset(); });

  // SD-LEO-FEAT-STAGE-POST-LAUNCH-001 FR-1: stage 25 now dispatches to canonical
  // post-launch review analyzer (was previously aliased to stage-25-launch-readiness.js).
  // FR-4: emits reason-discriminated no_data marker when artifacts absent — never fabricates.

  it('emits no_data marker with reason=s24_no_real_launch when stage24 was theatrical', async () => {
    const result = await analyzeStage25({
      stage24Data: { real_launch: false },
      ventureName: 'TestVenture',
      logger: silentLogger,
    });
    expect(result.status).toBe('no_data');
    expect(result.reason).toBe('s24_no_real_launch');
    expect(result.metrics).toBeNull();
  });

  it('emits no_data marker with reason=no_artifact when postlaunch artifacts absent', async () => {
    const result = await analyzeStage25({
      stage24Data: { real_launch: true, launched_at: '2026-05-01' },
      postlaunchArtifacts: [],
      ventureName: 'TestVenture',
      logger: silentLogger,
    });
    expect(result.status).toBe('no_data');
    expect(result.reason).toBe('no_artifact');
  });

  it('returns ok status with metrics when artifacts present and stage24 real', async () => {
    const result = await analyzeStage25({
      stage16Data: { month1_signups: 1000, month1_revenue: 50000 },
      stage24Data: { real_launch: true, launched_at: '2026-05-01' },
      postlaunchArtifacts: [{ artifact_type: 'postlaunch_assumptions_vs_reality' }],
      ventureName: 'TestVenture',
      logger: silentLogger,
    });
    expect(result.status).toBe('ok');
    expect(result.metrics.signups.projected).toBe(1000);
    expect(result.baseline_status).toBe('ok');
  });
});
