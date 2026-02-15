/**
 * LLM Mock Factory for EVA Venture Stage Analysis Tests
 *
 * Provides mock LLM client infrastructure for testing all 25 EVA venture
 * stage analysis steps. Each stage's analysis step calls
 * getLLMClient({ purpose }) which returns { complete(systemPrompt, userPrompt) }
 * that returns a JSON string.
 *
 * @module tests/helpers/llm-mock-factory
 */

// ---------------------------------------------------------------------------
// Stage Fixtures - raw objects that the LLM would return (before JSON.stringify)
// ---------------------------------------------------------------------------

const STAGE_FIXTURES = {
  // Stage 1: Hydration (single call)
  1: {
    description: 'A platform that connects local artisans with global buyers through curated marketplace experiences and AI-powered matching',
    problemStatement: 'Local artisans lack access to global markets and struggle with digital commerce tools',
    valueProp: 'Democratizing global market access for local artisans through technology',
    targetMarket: 'Independent artisans and craft businesses worldwide',
    archetype: 'marketplace',
    keyAssumptions: [
      'Artisans are willing to adopt digital tools for selling',
      'Global buyers seek authentic, locally-made products',
      'AI matching can reduce discovery friction by 60%',
    ],
    moatStrategy: 'Network effects from two-sided marketplace plus proprietary artisan quality scoring',
    successCriteria: [
      '1000 active artisans within 6 months',
      '$500K GMV in first year',
      'Net promoter score above 50',
    ],
  },

  // Stage 2: Multi-Persona (6 calls, one per persona)
  2: [
    {
      model: 'market-strategist',
      summary: 'Strong market opportunity with growing demand for authentic local products in global markets',
      strengths: ['Large addressable market', 'Clear trend toward artisan goods'],
      risks: ['Market fragmentation', 'Logistics complexity'],
      score: 72,
    },
    {
      model: 'customer-advocate',
      summary: 'Clear customer pain point with artisans struggling to reach global buyers effectively',
      strengths: ['Validated pain point', 'Underserved segment'],
      risks: ['Adoption barriers for non-digital artisans'],
      score: 68,
    },
    {
      model: 'growth-hacker',
      summary: 'Marketplace model enables organic growth through network effects and social sharing',
      strengths: ['Viral sharing potential', 'Content-driven discovery'],
      risks: ['Cold start problem', 'Need critical mass on both sides'],
      score: 65,
    },
    {
      model: 'revenue-analyst',
      summary: 'Transaction-based revenue model with healthy take rates and expansion potential',
      strengths: ['Multiple revenue streams possible', 'High LTV potential'],
      risks: ['Price sensitivity in artisan market'],
      score: 70,
    },
    {
      model: 'moat-architect',
      summary: 'Network effects and proprietary quality scoring create defensible competitive barriers',
      strengths: ['Two-sided network effects', 'Data moat from quality scoring'],
      risks: ['Low switching costs for buyers'],
      score: 62,
    },
    {
      model: 'ops-realist',
      summary: 'Execution is feasible with phased rollout but logistics coordination adds complexity',
      strengths: ['Lean MVP possible', 'Existing payment infrastructure'],
      risks: ['Cross-border logistics complexity', 'Quality assurance at scale'],
      score: 66,
    },
  ],

  // Stage 3: Hybrid Scoring (calibration call)
  3: {
    calibration_adjustments: {
      marketFit: 2,
      customerNeed: -1,
      momentum: 0,
      revenuePotential: 1,
      competitiveBarrier: -2,
      executionFeasibility: 1,
    },
    confidence: 0.85,
    reasoning: 'Market timing is favorable but competitive barriers need strengthening. Customer need is well-validated. Execution path is clear with manageable risks.',
  },

  // Stage 4: Competitive Landscape (single call)
  4: {
    competitors: [
      {
        name: 'Etsy',
        position: 'Dominant generalist marketplace for handmade goods',
        threat: 'H',
        pricingModel: 'subscription',
        marketPosition: 'Market leader with broad artisan base',
        strengths: ['Brand recognition', 'Massive buyer base', 'Established logistics'],
        weaknesses: ['Diluted artisan focus', 'High fees for sellers'],
        swot: {
          strengths: ['Brand recognition', 'Massive buyer base'],
          weaknesses: ['Diluted artisan focus', 'High fees'],
          opportunities: ['International expansion', 'Premium tier'],
          threats: ['Niche competitors', 'Amazon Handmade'],
        },
      },
      {
        name: 'Amazon Handmade',
        position: 'Large-scale marketplace leveraging Amazon infrastructure',
        threat: 'H',
        pricingModel: 'subscription',
        marketPosition: 'Growing competitor with massive distribution',
        strengths: ['Amazon logistics', 'Buyer trust', 'Scale'],
        weaknesses: ['Impersonal experience', 'Lost in catalog'],
        swot: {
          strengths: ['Amazon logistics', 'Buyer trust'],
          weaknesses: ['Impersonal', 'Low artisan visibility'],
          opportunities: ['Curated collections', 'Live shopping'],
          threats: ['Artisan backlash', 'Fee increases'],
        },
      },
    ],
    blueOceanAnalysis: {
      eliminate: ['Generic product listings', 'Impersonal buyer experience'],
      reduce: ['Transaction fees', 'Onboarding complexity'],
      raise: ['Artisan story visibility', 'Quality curation standards'],
      create: ['AI-powered artisan-buyer matching', 'Cultural context for products'],
    },
  },

  // Stage 5: Financial Model (single call)
  5: {
    initialInvestment: 100000,
    year1: { revenue: 200000, cogs: 80000, opex: 60000 },
    year2: { revenue: 400000, cogs: 140000, opex: 100000 },
    year3: { revenue: 700000, cogs: 200000, opex: 150000 },
    unitEconomics: {
      cac: 50,
      ltv: 300,
      ltvCacRatio: 6,
      paybackMonths: 6,
      monthlyChurn: 0.05,
    },
    roiBands: {
      pessimistic: 0.2,
      base: 0.35,
      optimistic: 0.5,
    },
    assumptions: ['Growth rate 15%', 'Retention 95%', 'Market expanding'],
  },

  // Stage 6: Risk Matrix (single call)
  6: {
    risks: [
      {
        id: 'RISK-001',
        category: 'Market',
        description: 'Market adoption may be slower than projected due to artisan digital literacy barriers',
        severity: 4,
        probability: 3,
        impact: 4,
        mitigation: 'Phased onboarding with hands-on support and multilingual tutorials',
        owner: 'Product Lead',
        status: 'open',
        review_date: '2026-06-01',
        residual_severity: 2,
        residual_probability: 2,
        residual_impact: 2,
      },
      {
        id: 'RISK-002',
        category: 'Product',
        description: 'AI matching algorithm may not deliver relevant results without sufficient training data',
        severity: 3,
        probability: 3,
        impact: 3,
        mitigation: 'Start with manual curation and transition to AI as data accumulates',
        owner: 'Tech Lead',
        status: 'open',
        review_date: '2026-06-01',
        residual_severity: 2,
        residual_probability: 1,
        residual_impact: 2,
      },
      {
        id: 'RISK-003',
        category: 'Technical',
        description: 'Cross-border payment processing may face regulatory compliance challenges',
        severity: 4,
        probability: 2,
        impact: 4,
        mitigation: 'Partner with established payment processors with multi-country support',
        owner: 'Engineering Lead',
        status: 'open',
        review_date: '2026-07-01',
        residual_severity: 2,
        residual_probability: 1,
        residual_impact: 2,
      },
      {
        id: 'RISK-004',
        category: 'Legal/Compliance',
        description: 'International trade regulations vary by country and product category',
        severity: 3,
        probability: 3,
        impact: 3,
        mitigation: 'Legal review for top 10 target countries before launch',
        owner: 'Legal Counsel',
        status: 'open',
        review_date: '2026-06-01',
        residual_severity: 2,
        residual_probability: 2,
        residual_impact: 2,
      },
      {
        id: 'RISK-005',
        category: 'Financial',
        description: 'Unit economics may not sustain at scale if take rate needs to decrease competitively',
        severity: 3,
        probability: 2,
        impact: 4,
        mitigation: 'Build ancillary revenue streams (promoted listings, premium tools)',
        owner: 'CFO',
        status: 'open',
        review_date: '2026-08-01',
        residual_severity: 2,
        residual_probability: 1,
        residual_impact: 2,
      },
      {
        id: 'RISK-006',
        category: 'Operational',
        description: 'Quality assurance across thousands of artisan products is resource-intensive',
        severity: 3,
        probability: 3,
        impact: 3,
        mitigation: 'Implement community-driven quality scoring with AI augmentation',
        owner: 'Operations Lead',
        status: 'open',
        review_date: '2026-06-01',
        residual_severity: 2,
        residual_probability: 2,
        residual_impact: 2,
      },
    ],
  },

  // Stage 7: Pricing Strategy (single call)
  7: {
    currency: 'USD',
    pricing_model: 'subscription',
    primaryValueMetric: 'active users',
    priceAnchor: 29.99,
    competitiveContext: 'Positioned below Etsy Plus but above free-tier marketplaces',
    tiers: [
      {
        name: 'Starter',
        price: 9.99,
        billing_period: 'monthly',
        included_units: '100 users',
        target_segment: 'Small businesses',
      },
      {
        name: 'Pro',
        price: 29.99,
        billing_period: 'monthly',
        included_units: '1000 users',
        target_segment: 'Growing businesses',
      },
      {
        name: 'Enterprise',
        price: 99.99,
        billing_period: 'monthly',
        included_units: 'Unlimited users',
        target_segment: 'Large organizations',
      },
    ],
    gross_margin_pct: 75,
    churn_rate_monthly: 5,
    cac: 50,
    arpa: 29.99,
  },

  // Stage 8: BMC Generation (single call)
  8: {
    customerSegments: {
      items: [
        { text: 'Independent artisans seeking global market access', priority: 1, evidence: 'Survey data from 200 artisans' },
        { text: 'Conscious consumers seeking authentic handmade goods', priority: 2, evidence: 'Market trend analysis' },
      ],
    },
    valuePropositions: {
      items: [
        { text: 'AI-powered matching between artisans and ideal buyers', priority: 1, evidence: 'Prototype testing showed 3x engagement' },
        { text: 'Cultural storytelling that increases perceived value', priority: 2, evidence: 'A/B test on product listings' },
      ],
    },
    channels: {
      items: [
        { text: 'Web platform and mobile app', priority: 1, evidence: 'Standard for marketplace businesses' },
        { text: 'Social media and content marketing', priority: 2, evidence: 'Artisan content performs well on Instagram' },
      ],
    },
    customerRelationships: {
      items: [
        { text: 'Community-driven with artisan profiles and stories', priority: 1, evidence: 'Etsy seller community model' },
      ],
    },
    revenueStreams: {
      items: [
        { text: 'Transaction fees (10-15% per sale)', priority: 1, evidence: 'Industry standard marketplace take rate' },
        { text: 'Premium listing subscriptions', priority: 2, evidence: 'Etsy Plus model validation' },
      ],
    },
    keyResources: {
      items: [
        { text: 'AI matching technology and engineering team', priority: 1, evidence: 'Core differentiator' },
        { text: 'Curated artisan network', priority: 2, evidence: 'Supply-side of marketplace' },
      ],
    },
    keyActivities: {
      items: [
        { text: 'Platform development and AI model training', priority: 1, evidence: 'Technical roadmap' },
        { text: 'Artisan onboarding and quality curation', priority: 2, evidence: 'Supply growth strategy' },
      ],
    },
    keyPartnerships: {
      items: [
        { text: 'International shipping providers', priority: 1, evidence: 'Logistics is key enabler' },
        { text: 'Payment processors with multi-currency support', priority: 2, evidence: 'Cross-border commerce requirement' },
      ],
    },
    costStructure: {
      items: [
        { text: 'Engineering and AI development (40% of costs)', priority: 1, evidence: 'Tech-heavy marketplace model' },
        { text: 'Marketing and artisan acquisition (30%)', priority: 2, evidence: 'Two-sided acquisition costs' },
      ],
    },
  },

  // Stage 9: Exit Strategy (single call)
  9: {
    exit_thesis: 'Acquisition by major e-commerce platform seeking artisan marketplace capabilities and curated supply chain',
    exit_horizon_months: 72,
    exit_paths: [
      { type: 'Acquisition', description: 'Strategic acquisition by e-commerce giant', probability_pct: 60 },
      { type: 'IPO', description: 'Public offering after reaching $100M GMV', probability_pct: 20 },
      { type: 'Secondary Sale', description: 'PE buyout at 5-year mark', probability_pct: 20 },
    ],
    target_acquirers: [
      { name: 'Shopify', rationale: 'Expanding marketplace capabilities for merchants', fit_score: 4 },
      { name: 'Amazon', rationale: 'Strengthening Handmade vertical with curated supply', fit_score: 3 },
    ],
    milestones: [
      { date: '2027-Q1', success_criteria: '10K active artisans, $5M GMV' },
      { date: '2028-Q1', success_criteria: '50K artisans, $25M GMV, profitability' },
    ],
  },

  // Stage 10: Naming/Brand (single call)
  10: {
    brandGenome: {
      archetype: 'marketplace',
      values: ['authenticity', 'connection', 'craftsmanship'],
      tone: 'warm, approachable, culturally respectful',
      audience: 'conscious consumers and independent artisans',
      differentiators: ['AI-powered matching', 'cultural storytelling', 'quality curation'],
    },
    scoringCriteria: [
      { name: 'memorability', weight: 25 },
      { name: 'relevance', weight: 25 },
      { name: 'uniqueness', weight: 20 },
      { name: 'pronounceability', weight: 15 },
      { name: 'availability', weight: 15 },
    ],
    candidates: [
      {
        name: 'Artisano',
        rationale: 'Combines artisan with a globally approachable suffix',
        scores: { memorability: 85, relevance: 80, uniqueness: 75, pronounceability: 90, availability: 70 },
      },
      {
        name: 'CraftBridge',
        rationale: 'Metaphor of bridging artisans to global markets',
        scores: { memorability: 80, relevance: 85, uniqueness: 70, pronounceability: 85, availability: 65 },
      },
      {
        name: 'Makara',
        rationale: 'Short, memorable, evokes making and creation',
        scores: { memorability: 90, relevance: 70, uniqueness: 85, pronounceability: 80, availability: 75 },
      },
      {
        name: 'HandRoot',
        rationale: 'Grounds the brand in handmade origins',
        scores: { memorability: 75, relevance: 80, uniqueness: 80, pronounceability: 85, availability: 80 },
      },
      {
        name: 'Loomly',
        rationale: 'Evokes traditional craft tools with modern feel',
        scores: { memorability: 88, relevance: 75, uniqueness: 82, pronounceability: 92, availability: 60 },
      },
    ],
    narrativeExtension: {
      vision: 'A world where every artisan can reach every buyer',
      mission: 'Connecting artisans to global markets through technology and storytelling',
      brandVoice: 'Warm, knowledgeable, empowering',
    },
    namingStrategy: 'descriptive',
  },

  // Stage 11: GTM (single call)
  11: {
    tiers: [
      {
        name: 'Tier 1',
        description: 'Early adopter artisans in English-speaking markets',
        persona: 'Digital-savvy artisan with existing online presence',
        painPoints: ['Limited reach beyond local markets', 'High marketplace fees'],
        tam: 1000000,
        sam: 500000,
        som: 100000,
      },
      {
        name: 'Tier 2',
        description: 'Artisan cooperatives in emerging markets',
        persona: 'Cooperative leader managing multiple artisan products',
        painPoints: ['No digital infrastructure', 'Language barriers'],
        tam: 5000000,
        sam: 1000000,
        som: 200000,
      },
      {
        name: 'Tier 3',
        description: 'Premium craft brands seeking direct-to-consumer channel',
        persona: 'Established craft brand owner',
        painPoints: ['Wholesale dependency', 'Brand dilution on large platforms'],
        tam: 2000000,
        sam: 800000,
        som: 150000,
      },
    ],
    channels: [
      { name: 'Organic Search', channelType: 'organic', primaryTier: 'Tier 1', monthly_budget: 1000, expected_cac: 20, target_cac: 15, primary_kpi: 'Monthly organic signups' },
      { name: 'Instagram Ads', channelType: 'paid', primaryTier: 'Tier 1', monthly_budget: 5000, expected_cac: 35, target_cac: 25, primary_kpi: 'Cost per artisan signup' },
      { name: 'Content Marketing', channelType: 'organic', primaryTier: 'Tier 1', monthly_budget: 2000, expected_cac: 15, target_cac: 10, primary_kpi: 'Blog traffic to signup conversion' },
      { name: 'Partnerships', channelType: 'organic', primaryTier: 'Tier 2', monthly_budget: 500, expected_cac: 10, target_cac: 8, primary_kpi: 'Cooperative onboardings per month' },
      { name: 'Email Marketing', channelType: 'organic', primaryTier: 'Tier 1', monthly_budget: 500, expected_cac: 5, target_cac: 3, primary_kpi: 'Email signup to active conversion' },
      { name: 'Influencer Marketing', channelType: 'paid', primaryTier: 'Tier 3', monthly_budget: 3000, expected_cac: 40, target_cac: 30, primary_kpi: 'Brand awareness impressions' },
      { name: 'Trade Shows', channelType: 'offline', primaryTier: 'Tier 2', monthly_budget: 2000, expected_cac: 50, target_cac: 35, primary_kpi: 'Leads per event' },
      { name: 'Referral Program', channelType: 'organic', primaryTier: 'Tier 1', monthly_budget: 1000, expected_cac: 12, target_cac: 8, primary_kpi: 'Referral conversion rate' },
    ],
    launch_timeline: [
      { milestone: 'Beta launch with 100 artisans', date: '2026-Q2', owner: 'Product Lead' },
      { milestone: 'Public launch in 3 markets', date: '2026-Q3', owner: 'Marketing Lead' },
      { milestone: 'Expansion to 10 countries', date: '2027-Q1', owner: 'Operations Lead' },
    ],
  },

  // Stage 12: Sales Logic (single call)
  12: {
    sales_model: 'hybrid',
    sales_cycle_days: 30,
    deal_stages: [
      { name: 'Qualification', description: 'Initial lead assessment', avg_duration_days: 3, mappedFunnelStage: 'Awareness' },
      { name: 'Discovery', description: 'Needs assessment and demo', avg_duration_days: 7, mappedFunnelStage: 'Interest' },
      { name: 'Proposal', description: 'Solution proposal and pricing', avg_duration_days: 10, mappedFunnelStage: 'Consideration' },
      { name: 'Negotiation', description: 'Terms negotiation and close', avg_duration_days: 10, mappedFunnelStage: 'Purchase' },
    ],
    funnel_stages: [
      { name: 'Awareness', metric: 'Website visitors', target_value: 10000, conversionRateEstimate: 0.25 },
      { name: 'Interest', metric: 'Signup rate', target_value: 2500, conversionRateEstimate: 0.4 },
      { name: 'Consideration', metric: 'Trial starts', target_value: 1000, conversionRateEstimate: 0.3 },
      { name: 'Purchase', metric: 'Conversion rate', target_value: 300, conversionRateEstimate: 0.1 },
    ],
    customer_journey: [
      { step: 'Discovers product via search or social media', funnel_stage: 'Awareness', touchpoint: 'Website' },
      { step: 'Reads artisan stories and browses products', funnel_stage: 'Interest', touchpoint: 'Blog/Landing page' },
      { step: 'Creates account and starts exploring', funnel_stage: 'Interest', touchpoint: 'Sign-up form' },
      { step: 'Lists first products or makes first purchase', funnel_stage: 'Consideration', touchpoint: 'Product' },
      { step: 'Converts to paid subscription plan', funnel_stage: 'Purchase', touchpoint: 'Checkout' },
    ],
  },

  // Stage 13: Product Roadmap (single call)
  13: {
    vision_statement: 'Build the most trusted global marketplace connecting artisans directly with conscious consumers',
    milestones: [
      {
        name: 'MVP Launch',
        date: '2026-Q2',
        deliverables: ['Core marketplace', 'Artisan onboarding', 'Payment processing'],
        priority: 'now',
        dependencies: [],
      },
      {
        name: 'AI Matching v1',
        date: '2026-Q3',
        deliverables: ['Recommendation engine', 'Search personalization'],
        priority: 'next',
        dependencies: ['MVP Launch'],
      },
      {
        name: 'International Expansion',
        date: '2027-Q1',
        deliverables: ['Multi-currency', 'Localization', 'Regional logistics'],
        priority: 'later',
        dependencies: ['MVP Launch', 'AI Matching v1'],
      },
    ],
    phases: [
      { name: 'Foundation', start_date: '2026-01-01', end_date: '2026-06-30' },
      { name: 'Growth', start_date: '2026-07-01', end_date: '2026-12-31' },
      { name: 'Scale', start_date: '2027-01-01', end_date: '2027-06-30' },
    ],
  },

  // Stage 14: Technical Architecture (single call)
  14: {
    architecture_summary: 'Microservices-based architecture with event-driven communication, deployed on AWS with Kubernetes orchestration',
    layers: {
      presentation: {
        technology: 'React with Next.js',
        components: ['Marketplace UI', 'Artisan Dashboard', 'Admin Panel'],
        rationale: 'SSR for SEO, component reuse across apps',
      },
      api: {
        technology: 'Node.js with Express',
        components: ['REST API Gateway', 'GraphQL for marketplace', 'WebSocket for real-time'],
        rationale: 'JavaScript ecosystem consistency, async performance',
      },
      business_logic: {
        technology: 'Node.js microservices',
        components: ['Matching Service', 'Payment Service', 'Notification Service'],
        rationale: 'Independent deployment and scaling per service',
      },
      data: {
        technology: 'PostgreSQL + Redis + Elasticsearch',
        components: ['Primary DB', 'Cache Layer', 'Search Index'],
        rationale: 'Relational for transactions, cache for performance, search for discovery',
      },
      infrastructure: {
        technology: 'AWS EKS + Terraform',
        components: ['Kubernetes Cluster', 'CI/CD Pipeline', 'Monitoring Stack'],
        rationale: 'Container orchestration with infrastructure as code',
      },
    },
    security: {
      authStrategy: 'JWT with OAuth2 social login',
      dataClassification: 'PII and payment data encrypted at rest and in transit',
      complianceRequirements: ['GDPR', 'PCI-DSS', 'SOC 2'],
    },
    dataEntities: [
      { name: 'Artisan', description: 'Artisan profile and store data', relationships: ['Products', 'Orders'], estimatedVolume: '100K records' },
      { name: 'Product', description: 'Product listings with media', relationships: ['Artisan', 'Orders', 'Reviews'], estimatedVolume: '1M records' },
      { name: 'Order', description: 'Purchase transactions', relationships: ['Artisan', 'Buyer', 'Product'], estimatedVolume: '500K records/year' },
    ],
    integration_points: [
      { name: 'Payment Gateway', source_layer: 'business_logic', target_layer: 'external', protocol: 'REST/HTTPS' },
      { name: 'Shipping API', source_layer: 'business_logic', target_layer: 'external', protocol: 'REST/HTTPS' },
    ],
    constraints: [
      { name: 'Latency', description: 'API response time under 200ms p95', category: 'performance' },
      { name: 'Availability', description: '99.9% uptime SLA', category: 'reliability' },
    ],
  },

  // Stage 15: Risk Register (single call)
  15: {
    risks: [
      {
        title: 'Payment Processing Failure',
        description: 'Cross-border payment processing may fail for certain country combinations',
        owner: 'Engineering Lead',
        severity: 'critical',
        priority: 'immediate',
        mitigationPlan: 'Implement multi-provider fallback with Stripe and PayPal',
        contingencyPlan: 'Manual payment processing queue for failed transactions',
      },
      {
        title: 'Data Privacy Compliance',
        description: 'GDPR and regional privacy requirements across multiple jurisdictions',
        owner: 'Legal Counsel',
        severity: 'critical',
        priority: 'immediate',
        mitigationPlan: 'Privacy-by-design architecture with data residency controls',
      },
      {
        title: 'Scalability Bottleneck',
        description: 'Search and matching services may degrade under peak load',
        owner: 'Tech Lead',
        severity: 'medium',
        priority: 'long_term',
        mitigationPlan: 'Auto-scaling with load testing at 3x projected peak',
      },
    ],
  },

  // Stage 16: Financial Projections (single call)
  16: {
    initial_capital: 200000,
    monthly_burn_rate: 20000,
    revenue_projections: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      revenue: Math.round(5000 * (1 + i * 0.3)),
      costs: Math.round(20000 + i * 1000),
      cost_breakdown: {
        personnel: Math.round(12000 + i * 500),
        infrastructure: 3000,
        marketing: Math.round(4000 + i * 300),
        other: 1000,
      },
    })),
    funding_rounds: [
      { round_name: 'Seed', target_amount: 500000, target_date: '2026-Q3' },
      { round_name: 'Series A', target_amount: 3000000, target_date: '2027-Q4' },
    ],
  },

  // Stage 17: Build Readiness (single call)
  17: {
    checklist: {
      architecture: [
        { name: 'System design finalized', status: 'complete', owner: 'Tech Lead', notes: 'Approved in architecture review' },
        { name: 'API contracts defined', status: 'complete', owner: 'Backend Lead', notes: 'OpenAPI specs committed' },
      ],
      team_readiness: [
        { name: 'Core team assembled', status: 'complete', owner: 'Engineering Manager', notes: '6 engineers onboarded' },
      ],
      tooling: [
        { name: 'CI/CD pipeline configured', status: 'complete', owner: 'DevOps', notes: 'GitHub Actions with staging deploy' },
      ],
      environment: [
        { name: 'Staging environment provisioned', status: 'complete', owner: 'DevOps', notes: 'AWS EKS cluster running' },
      ],
      dependencies: [
        { name: 'Third-party API keys obtained', status: 'complete', owner: 'Tech Lead', notes: 'Stripe, Twilio, SendGrid' },
      ],
    },
    blockers: [],
  },

  // Stage 18: Sprint Planning (single call)
  18: {
    sprint_name: 'Sprint 1 - Foundation',
    sprint_duration_days: 14,
    sprint_goal: 'Deliver core marketplace listing and artisan onboarding flow',
    items: [
      {
        title: 'Artisan Registration Flow',
        description: 'Complete artisan signup with profile creation and verification',
        priority: 'high',
        type: 'feature',
        scope: 'Full artisan onboarding including email verification',
        success_criteria: 'Artisan can register, verify email, and create profile',
        dependencies: [],
        risks: ['Email deliverability in some regions'],
        target_application: 'marketplace-web',
        story_points: 8,
      },
      {
        title: 'Product Listing CRUD',
        description: 'Create, read, update, delete product listings with image upload',
        priority: 'high',
        type: 'feature',
        scope: 'Basic CRUD with image upload to S3',
        success_criteria: 'Artisan can create and manage product listings',
        dependencies: ['Artisan Registration Flow'],
        risks: ['Image processing performance'],
        target_application: 'marketplace-web',
        story_points: 13,
      },
    ],
  },

  // Stage 19: Build Execution (single call)
  19: {
    tasks: [
      { name: 'Artisan Registration Flow', status: 'done', assignee: 'Dev-1', sprint_item_ref: 'Artisan Registration Flow' },
      { name: 'Product Listing CRUD', status: 'in_progress', assignee: 'Dev-2', sprint_item_ref: 'Product Listing CRUD' },
      { name: 'API Gateway Setup', status: 'done', assignee: 'Dev-3', sprint_item_ref: 'API Gateway Setup' },
    ],
    issues: [
      { description: 'Image upload timeout for files over 5MB', severity: 'medium', status: 'investigating' },
    ],
  },

  // Stage 20: Quality Assurance (single call)
  20: {
    test_suites: [
      { name: 'Unit Tests', type: 'unit', total_tests: 150, passing_tests: 148, coverage_pct: 85 },
      { name: 'Integration Tests', type: 'integration', total_tests: 45, passing_tests: 43, coverage_pct: 72 },
      { name: 'E2E Tests', type: 'e2e', total_tests: 20, passing_tests: 19, coverage_pct: 60 },
    ],
    known_defects: [
      { description: 'Image upload fails for PNG files over 10MB', severity: 'medium', status: 'open' },
      { description: 'Timezone display incorrect for UTC+12', severity: 'low', status: 'deferred' },
    ],
  },

  // Stage 21: Build Review (single call)
  21: {
    integrations: [
      { name: 'Payment Gateway', source: 'OrderService', target: 'Stripe API', status: 'pass' },
      { name: 'Email Service', source: 'NotificationService', target: 'SendGrid API', status: 'pass' },
      { name: 'Search Index', source: 'ProductService', target: 'Elasticsearch', status: 'pass' },
    ],
    environment: 'staging',
  },

  // Stage 22: Release Readiness (single call)
  22: {
    release_items: [
      { name: 'Artisan Onboarding', category: 'feature', status: 'approved', approver: 'Product Lead' },
      { name: 'Product Listings', category: 'feature', status: 'approved', approver: 'Product Lead' },
      { name: 'Payment Integration', category: 'feature', status: 'approved', approver: 'Tech Lead' },
    ],
    release_notes: 'Initial marketplace release with artisan onboarding, product listings, and payment processing',
    target_date: '2026-06-15',
    sprintRetrospective: {
      wentWell: ['Team velocity exceeded target', 'Zero critical defects'],
      wentPoorly: ['Image upload performance needs optimization'],
      actionItems: ['Implement CDN for image delivery', 'Add load testing to CI'],
    },
    sprintSummary: {
      sprintGoal: 'Deliver core marketplace functionality',
      itemsPlanned: 8,
      itemsCompleted: 7,
      qualityAssessment: 'Good - 95% test pass rate',
      integrationStatus: 'All integrations passing',
    },
    chairmanGate: {
      status: 'approved',
      rationale: 'All release criteria met, QA sign-off obtained',
      decision_id: 'GATE-REL-001',
    },
  },

  // Stage 23: Launch Execution (single call)
  23: {
    go_decision: 'go',
    launchType: 'soft_launch',
    incident_response_plan: 'On-call rotation with 15-minute response SLA for P1 incidents',
    monitoring_setup: 'Datadog APM + CloudWatch + PagerDuty alerts',
    rollback_plan: 'Blue-green deployment with instant rollback capability',
    launch_tasks: [
      { name: 'DNS cutover', status: 'complete', owner: 'DevOps' },
      { name: 'CDN configuration', status: 'complete', owner: 'DevOps' },
      { name: 'Monitoring dashboards', status: 'complete', owner: 'SRE' },
    ],
    launch_date: '2026-06-15',
    planned_launch_date: '2026-06-15',
    actual_launch_date: '2026-06-15',
    successCriteria: [
      { metric: 'Uptime', target: '99.9%', measurementWindow: '7 days', priority: 'critical' },
      { metric: 'Error rate', target: '<0.1%', measurementWindow: '7 days', priority: 'high' },
      { metric: 'Page load time', target: '<2s', measurementWindow: '7 days', priority: 'medium' },
    ],
    rollbackTriggers: [
      { trigger: 'Error rate spike', threshold: '>1% for 5 minutes', action: 'Automatic rollback to previous version' },
      { trigger: 'Payment failures', threshold: '>5 consecutive failures', action: 'Manual review and potential rollback' },
    ],
  },

  // Stage 24: Metrics & Learning (single call)
  24: {
    aarrr: {
      acquisition: [
        { name: 'Website Visitors', value: 15000, target: 10000, previousValue: 8000, trendDirection: 'up', trend_window_days: 30 },
        { name: 'Organic Signups', value: 450, target: 500, previousValue: 300, trendDirection: 'up', trend_window_days: 30 },
      ],
      activation: [
        { name: 'Profile Completion Rate', value: 72, target: 80, previousValue: 60, trendDirection: 'up', trend_window_days: 30 },
      ],
      retention: [
        { name: 'Monthly Active Artisans', value: 800, target: 1000, previousValue: 600, trendDirection: 'up', trend_window_days: 30 },
      ],
      revenue: [
        { name: 'Monthly GMV', value: 45000, target: 50000, previousValue: 30000, trendDirection: 'up', trend_window_days: 30 },
      ],
      referral: [
        { name: 'Referral Rate', value: 12, target: 15, previousValue: 8, trendDirection: 'up', trend_window_days: 30 },
      ],
    },
    funnels: [
      {
        name: 'Artisan Onboarding',
        steps: [
          { name: 'Visit signup page', count: 5000 },
          { name: 'Start registration', count: 2000 },
          { name: 'Complete profile', count: 1200 },
          { name: 'List first product', count: 800 },
        ],
      },
    ],
    learnings: [
      { insight: 'Video product listings convert 3x better than photo-only', action: 'Prioritize video upload feature', category: 'product', impactLevel: 'high' },
      { insight: 'Artisan onboarding drop-off highest at verification step', action: 'Simplify verification flow', category: 'growth', impactLevel: 'medium' },
    ],
  },

  // Stage 25: Venture Review (single call)
  25: {
    review_summary: 'Artisan marketplace showing strong early traction with healthy unit economics and clear path to profitability',
    initiatives: {
      product: [
        { title: 'AI Matching Engine', status: 'on-track', outcome: '3x engagement improvement' },
        { title: 'Mobile App Launch', status: 'on-track', outcome: '40% of traffic from mobile' },
      ],
      market: [
        { title: 'Tier 1 Market Penetration', status: 'on-track', outcome: '1200 active artisans' },
      ],
      technical: [
        { title: 'Platform Scalability', status: 'complete', outcome: 'Handles 10x current load' },
      ],
      financial: [
        { title: 'Seed Round', status: 'complete', outcome: '$500K raised at $5M valuation' },
      ],
      team: [
        { title: 'Core Team Hiring', status: 'complete', outcome: '12 FTEs across engineering and ops' },
      ],
    },
    current_vision: 'A world where every artisan can reach every buyer',
    drift_justification: null,
    next_steps: [
      { action: 'Launch AI matching v2', owner: 'Tech Lead', timeline: '2026-Q4', priority: 'high' },
      { action: 'Expand to 5 new markets', owner: 'Operations Lead', timeline: '2027-Q1', priority: 'medium' },
    ],
    chairmanGate: {
      status: 'approved',
      rationale: 'Venture health is strong across all dimensions with clear growth trajectory',
      decision_id: 'GATE-VR-001',
    },
    financialComparison: {
      projectedRevenue: 200000,
      actualRevenue: 180000,
      projectedCosts: 140000,
      actualCosts: 135000,
      revenueVariancePct: -10,
      financialTrajectory: 'on-track',
      variance: -10,
      assessment: 'Revenue slightly below projection but costs well controlled. LTV/CAC ratio improving.',
    },
    ventureHealth: {
      overallRating: 'viable',
      dimensions: {
        product: { score: 78, rationale: 'Core features delivered, AI matching showing promise' },
        market: { score: 72, rationale: 'Good traction in Tier 1, expansion pipeline healthy' },
        technical: { score: 82, rationale: 'Architecture solid, scalability proven' },
        financial: { score: 70, rationale: 'Unit economics positive, runway adequate' },
        team: { score: 80, rationale: 'Strong core team, key hires completed' },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Mock Factory Functions
// ---------------------------------------------------------------------------

/**
 * Create a mock LLM client for a specific stage.
 * For stages with multiple calls (e.g., Stage 2 with 6 personas),
 * the fixture is an array and calls cycle through elements.
 *
 * @param {number} stageNum - Stage number (1-25)
 * @returns {{ getLLMClient: Function }} Mock module with getLLMClient
 */
export function createStageMockLLM(stageNum) {
  const fixture = STAGE_FIXTURES[stageNum];
  if (!fixture) {
    throw new Error(`No fixture defined for stage ${stageNum}`);
  }

  let callIndex = 0;

  return {
    getLLMClient: () => ({
      complete: async () => {
        if (Array.isArray(fixture)) {
          const response = fixture[callIndex % fixture.length];
          callIndex++;
          return JSON.stringify(response);
        }
        return JSON.stringify(fixture);
      },
    }),
  };
}

/**
 * Create a mock LLM client that works for any stage.
 * Inspects the system prompt to determine which stage is being called
 * and returns the appropriate fixture. Falls back to stage 1 fixture.
 *
 * For Stage 2 (multi-persona), tracks call count to cycle through persona fixtures.
 *
 * @returns {{ getLLMClient: Function }} Mock module with getLLMClient
 */
export function createChainMockLLM() {
  let stage2CallIndex = 0;

  return {
    getLLMClient: () => ({
      complete: async (systemPrompt, userPrompt) => {
        const combined = `${systemPrompt} ${userPrompt}`.toLowerCase();

        // Detect stage from prompt content
        if (combined.includes('venture review') || combined.includes('stage 25')) {
          return JSON.stringify(STAGE_FIXTURES[25]);
        }
        if (combined.includes('metrics') && combined.includes('aarrr') || combined.includes('stage 24')) {
          return JSON.stringify(STAGE_FIXTURES[24]);
        }
        if (combined.includes('go_decision') || combined.includes('launch execution') || combined.includes('stage 23')) {
          return JSON.stringify(STAGE_FIXTURES[23]);
        }
        if (combined.includes('release readiness') || combined.includes('release_items') || combined.includes('stage 22')) {
          return JSON.stringify(STAGE_FIXTURES[22]);
        }
        if (combined.includes('build review') || combined.includes('integration') && combined.includes('staging') || combined.includes('stage 21')) {
          return JSON.stringify(STAGE_FIXTURES[21]);
        }
        if (combined.includes('quality assurance') || combined.includes('test_suites') || combined.includes('stage 20')) {
          return JSON.stringify(STAGE_FIXTURES[20]);
        }
        if (combined.includes('build execution') || combined.includes('sprint_item_ref') || combined.includes('stage 19')) {
          return JSON.stringify(STAGE_FIXTURES[19]);
        }
        if (combined.includes('sprint planning') || combined.includes('sprint_name') || combined.includes('stage 18')) {
          return JSON.stringify(STAGE_FIXTURES[18]);
        }
        if (combined.includes('build readiness') || combined.includes('checklist') && combined.includes('architecture') || combined.includes('stage 17')) {
          return JSON.stringify(STAGE_FIXTURES[17]);
        }
        if (combined.includes('financial projection') || combined.includes('monthly_burn') || combined.includes('stage 16')) {
          return JSON.stringify(STAGE_FIXTURES[16]);
        }
        if (combined.includes('risk register') || combined.includes('mitigationplan') || combined.includes('stage 15')) {
          return JSON.stringify(STAGE_FIXTURES[15]);
        }
        if (combined.includes('technical architecture') || combined.includes('architecture_summary') || combined.includes('stage 14')) {
          return JSON.stringify(STAGE_FIXTURES[14]);
        }
        if (combined.includes('product roadmap') || combined.includes('vision_statement') || combined.includes('stage 13')) {
          return JSON.stringify(STAGE_FIXTURES[13]);
        }
        if (combined.includes('sales logic') || combined.includes('sales_model') || combined.includes('stage 12')) {
          return JSON.stringify(STAGE_FIXTURES[12]);
        }
        if (combined.includes('go-to-market') || combined.includes('gtm') || combined.includes('stage 11')) {
          return JSON.stringify(STAGE_FIXTURES[11]);
        }
        if (combined.includes('naming') || combined.includes('brand') && combined.includes('genome') || combined.includes('stage 10')) {
          return JSON.stringify(STAGE_FIXTURES[10]);
        }
        if (combined.includes('exit') && combined.includes('strategy') || combined.includes('stage 9')) {
          return JSON.stringify(STAGE_FIXTURES[9]);
        }
        if (combined.includes('business model canvas') || combined.includes('bmc') || combined.includes('stage 8')) {
          return JSON.stringify(STAGE_FIXTURES[8]);
        }
        if (combined.includes('pricing') && combined.includes('strategy') || combined.includes('stage 7')) {
          return JSON.stringify(STAGE_FIXTURES[7]);
        }
        if (combined.includes('risk matrix') || combined.includes('risk') && combined.includes('severity') && combined.includes('probability') || combined.includes('stage 6')) {
          return JSON.stringify(STAGE_FIXTURES[6]);
        }
        if (combined.includes('financial model') || combined.includes('initialinvestment') || combined.includes('stage 5')) {
          return JSON.stringify(STAGE_FIXTURES[5]);
        }
        if (combined.includes('competitive') && combined.includes('landscape') || combined.includes('stage 4')) {
          return JSON.stringify(STAGE_FIXTURES[4]);
        }
        if (combined.includes('hybrid') && combined.includes('scoring') || combined.includes('calibration') || combined.includes('stage 3')) {
          return JSON.stringify(STAGE_FIXTURES[3]);
        }
        if (combined.includes('multi-persona') || combined.includes('persona')) {
          const personas = STAGE_FIXTURES[2];
          const response = personas[stage2CallIndex % personas.length];
          stage2CallIndex++;
          return JSON.stringify(response);
        }
        if (combined.includes('hydration') || combined.includes('draft idea') || combined.includes('stage 1')) {
          return JSON.stringify(STAGE_FIXTURES[1]);
        }

        // Fallback: return stage 1 fixture
        return JSON.stringify(STAGE_FIXTURES[1]);
      },
    }),
  };
}

export { STAGE_FIXTURES };
