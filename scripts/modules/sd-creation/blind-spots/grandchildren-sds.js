/**
 * Grandchildren SD Definitions for Blind Spots Orchestrator
 * Implementation-level SDs grouped by parent category
 */

// EVA Grandchildren
export const evaGrandchildren = [
  {
    id: 'SD-EVA-ARCHITECTURE-001',
    title: 'EVA Core Architecture',
    purpose: 'Build the foundational data model, event bus, and decision router for EVA',
    scope: {
      included: [
        'Canonical data model: Venture, LifecycleState, KPIs, Risks, Incidents',
        'Event bus with typed events: REVENUE_DROP, CHURN_SPIKE, INCIDENT_P1',
        'Decision router with Class A/B/C routing',
        'Audit logging for all decisions and actions',
        'Integration adapters for Stripe, support, analytics'
      ],
      excluded: ['Dashboard UI (separate SD)', 'Alert delivery (separate SD)']
    },
    deliverables: ['eva_ventures table with lifecycle states', 'eva_events table for event streaming', 'eva_decisions table with audit trail', 'EVAEventBus service', 'EVADecisionRouter service'],
    success_criteria: ['Events can be ingested from multiple sources', 'Decisions are routed based on stake level', 'All actions are audit logged', 'Venture state transitions are tracked'],
    estimated_effort: 'Medium (2 sessions)',
    dependencies: []
  },
  {
    id: 'SD-EVA-DASHBOARD-001',
    title: 'EVA Chairman Dashboard',
    purpose: 'Create the "Cockpit" view for portfolio-wide visibility',
    scope: {
      included: ['Health Grid: 32 tiles, color-coded (Green/Yellow/Red)', 'Cash Flow Pulse: Aggregate burn vs revenue', 'Capital Allocation visualization', 'Venture Detail drill-down (stage-aware metrics)', 'Portfolio state distribution chart'],
      excluded: ['Alert management (separate SD)', 'Automation rules (separate SD)']
    },
    deliverables: ['EVAHealthGrid component', 'EVACashFlowPulse component', 'EVAVentureDetail component', 'EVAPortfolioCharts component', 'Chairman Dashboard page'],
    success_criteria: ['All ventures visible in health grid', 'Color coding reflects actual health', 'Drill-down shows stage-appropriate metrics', 'Dashboard loads in <3 seconds'],
    estimated_effort: 'Medium (2 sessions)',
    dependencies: ['SD-EVA-ARCHITECTURE-001']
  },
  {
    id: 'SD-EVA-ALERTING-001',
    title: 'EVA Alert & Escalation System',
    purpose: 'Implement P0/P1/P2 alerting with smart escalation',
    scope: {
      included: ['P0 (Critical): Immediate SMS/Call for site down, security breach, runaway spend', 'P1 (Warning): Daily digest for metric deviation >20%', 'P2 (Info): Weekly review for routine updates', 'Alert aggregation to prevent fatigue', '4-hour cooldown between non-critical alerts', 'Escalation rules based on venture state'],
      excluded: ['Third-party notification integrations (use existing)']
    },
    deliverables: ['eva_alerts table', 'EVAAlertService with priority routing', 'Alert aggregation logic', 'Escalation rule engine', 'Alert preferences UI'],
    success_criteria: ['P0 alerts delivered within 1 minute', 'P1 alerts batched into daily digest', 'Alert fatigue prevented by aggregation', 'Escalation paths configurable'],
    estimated_effort: 'Medium (1-2 sessions)',
    dependencies: ['SD-EVA-ARCHITECTURE-001']
  },
  {
    id: 'SD-EVA-AUTOMATION-001',
    title: 'EVA Automation Executor',
    purpose: 'Enable safe automated actions with guardrails',
    scope: {
      included: ['Auto-fix rules for Class A decisions', 'Guardrails: reversibility check, impact threshold, legal flag', 'Idempotency for all automated actions', 'Weekly Portfolio Review automation (30-45 min prep)', 'Auto-draft for Class B decisions (human approve)', 'Runbook execution framework'],
      excluded: ['AI agent development (future)', 'External API actions']
    },
    deliverables: ['eva_automation_rules table', 'EVAAutomationExecutor service', 'Guardrail validation system', 'Weekly review generator', 'Auto-draft templates'],
    success_criteria: ['Class A decisions execute automatically', 'Guardrails prevent dangerous actions', 'Weekly review prep automated', 'All automated actions logged'],
    estimated_effort: 'Medium (2 sessions)',
    dependencies: ['SD-EVA-ARCHITECTURE-001', 'SD-EVA-ALERTING-001']
  }
];

// Legal Grandchildren
export const legalGrandchildren = [
  {
    id: 'SD-LEGAL-STRUCTURE-001',
    title: 'Series LLC Formation',
    purpose: 'Establish Delaware Series LLC for liability isolation across ventures',
    scope: {
      included: ['Delaware Series LLC formation (EHG Holdings LLC)', 'Series creation process for new ventures', 'Banking setup guidance for series separation', 'Registered agent setup', 'Operating agreement template', 'Series designation templates'],
      excluded: ['Tax planning (consult CPA)', 'Specific venture formations']
    },
    deliverables: ['Series LLC formation documentation', 'Operating agreement template', 'Series designation template', 'Banking setup checklist', 'Compliance calendar'],
    success_criteria: ['Master LLC formed in Delaware', 'Process documented for adding series', 'Banking guidance documented', 'Operating agreement ready for customization'],
    estimated_effort: 'Small (1 session + legal fees)',
    dependencies: []
  },
  {
    id: 'SD-LEGAL-TEMPLATES-001',
    title: 'Master Legal Templates',
    purpose: 'Create centralized legal templates with venture-specific overrides',
    scope: {
      included: ['Master Terms of Service template', 'Master Privacy Policy template', 'Data Processing Agreement (DPA) template', 'Venture-specific override system', 'Version control and changelog', 'Template variable substitution'],
      excluded: ['SOC 2 documentation (triggered by enterprise)', 'HIPAA (avoid)']
    },
    deliverables: ['docs/legal/templates/terms-of-service.md', 'docs/legal/templates/privacy-policy.md', 'docs/legal/templates/dpa.md', 'Template override system', 'docs/legal/CHANGELOG.md'],
    success_criteria: ['Templates cover standard SaaS use cases', 'Override system allows venture customization', 'Version tracking implemented', 'Templates reviewed by legal counsel'],
    estimated_effort: 'Small (1 session + legal review)',
    dependencies: []
  },
  {
    id: 'SD-COMPLIANCE-GDPR-001',
    title: 'GDPR Compliance Patterns',
    purpose: 'Implement reusable GDPR compliance components',
    scope: {
      included: ['CookieConsentBanner component', 'DeleteUserDataJob pattern (Right to be Forgotten)', 'DataExportJob pattern (Right to Portability)', 'Consent tracking database schema', 'Data retention policy automation', 'Privacy preference center UI'],
      excluded: ['Full GDPR audit (per-venture)', 'DPO appointment (scale trigger)']
    },
    deliverables: ['CookieConsentBanner component', 'DeleteUserDataJob service', 'DataExportJob service', 'user_consent_records table', 'PrivacyPreferenceCenter component'],
    success_criteria: ['Cookie consent captures and stores preferences', 'User data deletion completes in <24h', 'Data export generates downloadable archive', 'Consent records audit-ready'],
    estimated_effort: 'Medium (2 sessions)',
    dependencies: ['SD-LEGAL-TEMPLATES-001']
  }
];

// Pricing Grandchildren
export const pricingGrandchildren = [
  {
    id: 'SD-PRICING-PATTERNS-001',
    title: 'Core Pricing Patterns',
    purpose: 'Implement 4 foundational pricing patterns with Stripe integration',
    scope: {
      included: ['Flat Rate pattern (immediate revenue, simple)', 'Tiered pattern (2-3 tiers, captures more value)', 'Free Trial -> Paid pattern (qualifies customers)', 'Usage-Based pattern (for APIs, compute)', 'Stripe Price/Product setup for each', 'Checkout flow components'],
      excluded: ['Freemium (only with viral mechanics)', 'Enterprise contracts']
    },
    deliverables: ['PricingFlatRate component + Stripe setup', 'PricingTiered component + Stripe setup', 'PricingFreeTrial component + Stripe setup', 'PricingUsageBased component + Stripe setup', 'PricingCheckout shared component'],
    success_criteria: ['Each pattern has working Stripe integration', 'Patterns reusable across ventures', 'Checkout flow tested end-to-end', 'Webhook handlers for subscription events'],
    estimated_effort: 'Medium (2 sessions)',
    dependencies: []
  },
  {
    id: 'SD-PRICING-FRAMEWORK-001',
    title: 'Pricing Decision Framework',
    purpose: 'Create algorithm and documentation for pricing decisions',
    scope: {
      included: ['Decision algorithm implementation', 'Input collection: customer type, value metric, cost drivers', 'Output: recommended pricing pattern + configuration', 'Pricing strategy documentation', 'Vending Machine Score per pattern', 'Competitor analysis template'],
      excluded: ['Automated competitive intelligence', 'Dynamic pricing']
    },
    deliverables: ['PricingDecisionService', 'PricingWizard UI component', 'docs/pricing/decision-framework.md', 'docs/pricing/pattern-guide.md', 'Competitor analysis template'],
    success_criteria: ['Framework produces consistent recommendations', 'Wizard guides through decision process', 'Documentation covers all patterns', 'Vending Machine compatibility clear'],
    estimated_effort: 'Small (1 session)',
    dependencies: ['SD-PRICING-PATTERNS-001']
  },
  {
    id: 'SD-PRICING-TESTING-001',
    title: 'Pricing Experimentation Infrastructure',
    purpose: 'Enable A/B testing of pricing with minimal volume',
    scope: {
      included: ['Painted Door test infrastructure (2 landing pages, measure clicks)', 'Stripe Price ID A/B testing setup', 'Conversion tracking for pricing variants', 'Statistical significance calculator', 'Grandfathering system for price changes'],
      excluded: ['Multi-armed bandit (overkill)', 'Real-time pricing optimization']
    },
    deliverables: ['PricingExperiment table', 'PricingABTest component', 'ConversionTracker service', 'SignificanceCalculator utility', 'GrandfatheringService for price changes'],
    success_criteria: ['Can run Painted Door test in <1 hour', 'Stripe A/B setup documented', 'Conversion tracked per variant', 'Grandfathering preserves existing customers'],
    estimated_effort: 'Small (1 session)',
    dependencies: ['SD-PRICING-PATTERNS-001']
  }
];

// Failure Grandchildren
export const failureGrandchildren = [
  {
    id: 'SD-FAILURE-POSTMORTEM-001',
    title: 'Post-Mortem Template & Automation',
    purpose: 'Standardize venture post-mortem capture with EVA auto-draft',
    scope: {
      included: ['Post-mortem template (hypothesis, signals, patterns, counterfactual)', 'Auto-draft generation from venture data', 'CB Insights failure category taxonomy', '5 Whys root cause analysis', 'Counterfactual "2-week test" section', 'Action item tracking'],
      excluded: ['External sharing (internal only)', 'Video recordings']
    },
    deliverables: ['venture_postmortems table', 'PostMortemTemplate component', 'EVAPostMortemDrafter service', 'FailureCategorySelector component', 'RootCauseAnalyzer (5 Whys)'],
    success_criteria: ['Post-mortem created for every killed venture', 'Auto-draft saves 80% of writing time', 'Failure categories consistently applied', 'Action items tracked to completion'],
    estimated_effort: 'Medium (1-2 sessions)',
    dependencies: ['SD-EVA-ARCHITECTURE-001']
  },
  {
    id: 'SD-FAILURE-PATTERNS-001',
    title: 'Anti-Pattern Library',
    purpose: 'Catalog common failure modes to prevent repetition',
    scope: {
      included: ['10 initial anti-patterns from CB Insights + experience', 'Early signals for each failure mode', 'Prevention checklist per pattern', 'Fast test to validate earlier', 'Kill criteria definitions', 'Venture scoring against anti-patterns'],
      excluded: ['Automated detection (future)', 'External failure databases']
    },
    deliverables: ['failure_patterns table', 'Initial 10 anti-patterns loaded', 'AntiPatternScorer service', 'FailureRiskIndicator component', 'docs/failure-patterns/index.md'],
    success_criteria: ['10 anti-patterns documented with signals', 'New ventures scored against library', 'High-risk ventures flagged', 'Prevention checklists actionable'],
    estimated_effort: 'Small (1 session)',
    dependencies: []
  },
  {
    id: 'SD-FAILURE-FEEDBACK-001',
    title: 'Failure -> Pattern Library Feedback Loop',
    purpose: 'Systematically convert failure lessons into pattern improvements',
    scope: {
      included: ['Feedback loop: Kill -> Post-mortem -> Pattern update', 'Pattern improvement proposal workflow', 'New pattern creation from failure insights', 'Guardrail/checklist generation', 'Distribution to new ventures'],
      excluded: ['Automated pattern code generation', 'Cross-company learning']
    },
    deliverables: ['PatternImprovementProposal workflow', 'FailureToPatternMapper service', 'GuardrailGenerator service', 'NewVentureChecklist component', 'Pattern version tracking'],
    success_criteria: ['Every post-mortem generates >=1 action item', 'Pattern improvements tracked to completion', 'New ventures inherit updated wisdom', 'Feedback loop time <2 weeks'],
    estimated_effort: 'Small (1 session)',
    dependencies: ['SD-FAILURE-POSTMORTEM-001', 'SD-FAILURE-PATTERNS-001']
  }
];

// Skills Grandchildren
export const skillsGrandchildren = [
  {
    id: 'SD-SKILLS-INVENTORY-001',
    title: 'Capability Ledger System',
    purpose: 'Track skills with confidence levels and evidence',
    scope: {
      included: ['Skills inventory data model', 'Skill categories: frontend, backend, devops, sales, legal, etc.', 'Proficiency levels (0-5) with evidence links', 'AI-supportability flag per skill', 'Outsource options tracking', 'Skill gap analysis for ventures'],
      excluded: ['Team management (solo operator)', 'Training curriculum']
    },
    deliverables: ['skills_inventory table', 'SkillsMatrix component', 'SkillGapAnalyzer service', 'VentureSkillRequirements component', 'docs/skills/inventory.md'],
    success_criteria: ['All current skills documented', 'Evidence linked to projects', 'Gap analysis for new ventures', 'AI-supportability clear per skill'],
    estimated_effort: 'Small (1 session)',
    dependencies: []
  },
  {
    id: 'SD-SKILLS-FRAMEWORK-001',
    title: 'Build/Buy/Partner Decision Framework',
    purpose: 'Systematic framework for skill acquisition decisions',
    scope: {
      included: ['Decision tree: Learn vs Hire vs Partner vs Avoid', 'Skill distance calculation formula', 'Ramp time estimation', 'Liability multiplier for regulated skills', 'Solo viable cutoff threshold', 'Minimum viable skill set documentation'],
      excluded: ['Hiring workflows (no team)', 'Contractor management']
    },
    deliverables: ['SkillDecisionFramework service', 'SkillDistanceCalculator utility', 'SkillDecisionWizard component', 'docs/skills/decision-framework.md', 'docs/skills/minimum-viable-skillset.md'],
    success_criteria: ['Decision framework produces clear recommendations', 'Skill distance comparable across ventures', 'Minimum viable skillset documented', 'Framework prevents skill overreach'],
    estimated_effort: 'Small (1 session)',
    dependencies: ['SD-SKILLS-INVENTORY-001']
  }
];

// Deprecation Grandchildren
export const deprecationGrandchildren = [
  {
    id: 'SD-PATTERN-LIFECYCLE-001',
    title: 'Pattern Lifecycle State Machine',
    purpose: 'Implement pattern states and transition rules',
    scope: {
      included: ['Pattern states: Draft, Active, Soft Deprecated, Deprecated, Archived, Superseded', 'Transition triggers and rules', 'Deprecation announcement workflow', '@deprecated JSDoc automation', 'Migration guide requirement for deprecated patterns', 'Legacy namespace for frozen patterns'],
      excluded: ['Automated code migration', 'Cross-venture pattern sync']
    },
    deliverables: ['pattern_lifecycle_status column in scaffold_patterns', 'PatternLifecycleService', 'DeprecationAnnouncement workflow', 'MigrationGuideTemplate', 'LegacyNamespace setup'],
    success_criteria: ['All patterns have lifecycle status', 'Deprecation triggers lint warnings', 'Migration guides required for deprecated', 'Legacy patterns isolated'],
    estimated_effort: 'Small (1 session)',
    dependencies: []
  },
  {
    id: 'SD-PATTERN-METRICS-001',
    title: 'Pattern Usage Metrics & Deprecation Signals',
    purpose: 'Track pattern health and detect deprecation candidates',
    scope: {
      included: ['Pattern usage tracking (instantiations per venture)', 'Dependency version monitoring', 'Bug/incident rate per pattern', 'Alternative pattern comparison', 'Deprecation signal scoring', 'Pattern health dashboard'],
      excluded: ['Real-time telemetry', 'Cross-company benchmarking']
    },
    deliverables: ['pattern_usage_metrics table', 'PatternHealthScorer service', 'DeprecationSignalDetector service', 'PatternHealthDashboard component', 'Pattern comparison report'],
    success_criteria: ['Usage tracked for all patterns', 'Deprecation candidates surfaced automatically', 'Health score visible per pattern', 'Maintenance budget informed by data'],
    estimated_effort: 'Small (1 session)',
    dependencies: ['SD-PATTERN-LIFECYCLE-001']
  }
];
