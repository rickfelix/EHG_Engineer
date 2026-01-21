/**
 * Child SD Definitions for Blind Spots Orchestrator
 * Contains the 6 main blind spot categories
 */

import {
  evaGrandchildren,
  legalGrandchildren,
  pricingGrandchildren,
  failureGrandchildren,
  skillsGrandchildren,
  deprecationGrandchildren
} from './grandchildren-sds.js';

export const childSDs = [
  {
    id: 'SD-BLIND-SPOT-EVA-001',
    title: 'EVA Operating System (Multi-Venture Portfolio Management)',
    priority: 'critical',
    rank: 1,
    purpose: 'Build EVA as the "Operating System" for managing 10-32 concurrent ventures',
    oracle_warning: 'At 4 ventures: need support dashboard. At 16: need CFO agent. At 32: CEO not Architect.',
    management_cliff: '8-12 ventures without EVA; 32+ with EVA',
    scope: {
      included: ['EVA Core architecture (data model, event bus, decision router)', 'Chairman Dashboard (health grid, cash flow, drill-down)', 'Alert/Escalation system (P0/P1/P2)', 'Automation executor with guardrails'],
      excluded: ['AI agent development', 'External integrations beyond Stripe']
    },
    key_concepts: {
      traffic_light: 'Green = Standard Ops, Yellow = Warning, Red = Critical',
      decision_classes: 'Class A (auto), Class B (approve), Class C (human)',
      management_by_exception: 'Only surface deviations from standard',
      holding_company_model: 'Constellation: decentralized ops, centralized metrics'
    },
    metrics_by_stage: {
      genesis: ['Gate pass rate', 'Pattern coverage'],
      active: ['Velocity', 'Bug rate', 'Milestone progress'],
      growth: ['MRR', 'Churn', 'CAC', 'LTV', 'Activation'],
      maintenance: ['Uptime', 'Support tickets', 'Margin'],
      distressed: ['Churn trend', 'Burn rate', 'Runway']
    },
    triangulation_consensus: ['EVA is #1 priority (unanimous)', 'Traffic light health grid', 'Event-based alerting', 'Decision routing by stakes', 'Audit logging mandatory'],
    grandchildren: evaGrandchildren,
    dependencies: [],
    blocks: ['SD-BLIND-SPOT-FAILURE-001'],
    estimated_effort: 'Large (6-8 sessions total)'
  },
  {
    id: 'SD-BLIND-SPOT-LEGAL-001',
    title: 'Legal/Compliance Foundation',
    priority: 'high',
    rank: 2,
    purpose: 'Establish legal structure and reusable compliance patterns',
    scope: {
      included: ['Series LLC formation (Delaware)', 'Master legal templates (ToS, Privacy, DPA)', 'GDPR compliance components'],
      excluded: ['SOC 2 (enterprise trigger)', 'HIPAA (avoid)', 'Tax planning']
    },
    legal_structure: {
      recommendation: 'Delaware Series LLC',
      structure: 'EHG Holdings LLC (Master) -> Venture A, Series of EHG Holdings LLC',
      pros: ['One filing fee', 'Segregated liability', 'Simpler than separate LLCs'],
      cons: ['Banking complexity', 'Limited state recognition'],
      alternative: 'Delaware C-Corp if raising VC'
    },
    compliance_triggers: {
      day_1: ['Privacy Policy', 'Terms of Service'],
      eu_users: ['GDPR', 'Cookie Consent'],
      enterprise_20k: ['SOC 2 (if required)'],
      payments: ['PCI (use Stripe to avoid)']
    },
    triangulation_consensus: ['Series LLC recommended (all 3)', 'Centralized templates with overrides', 'Day 1 compliance non-negotiable', 'SOC 2 only when enterprise requires'],
    grandchildren: legalGrandchildren,
    dependencies: [],
    blocks: [],
    estimated_effort: 'Medium (3-4 sessions total)'
  },
  {
    id: 'SD-BLIND-SPOT-PRICING-001',
    title: 'Pricing Pattern Library',
    priority: 'high',
    rank: 3,
    purpose: 'Create reusable pricing patterns compatible with vending machine model',
    scope: {
      included: ['Core pricing patterns (Flat, Tiered, Trial, Usage)', 'Decision framework and wizard', 'A/B testing infrastructure'],
      excluded: ['Freemium (only with viral)', 'Enterprise contracts', 'Dynamic pricing']
    },
    vending_machine_scores: {
      flat_rate: { score: 5, reason: 'Immediate revenue, simple' },
      tiered: { score: 4, reason: 'Captures more value, still simple' },
      free_trial: { score: 4, reason: 'Qualifies customers' },
      usage_based: { score: 3, reason: 'Only if natural (APIs)' },
      freemium: { score: 2, reason: 'Delays revenue, requires scale' }
    },
    decision_algorithm: {
      high_cost_to_serve: 'Usage-Based',
      time_saved_value: 'Flat Monthly',
      enterprise_target: 'Tiered + Contact Sales',
      consumer_target: 'Freemium or Low-cost Sub',
      default: 'Flat Monthly'
    },
    ab_testing: {
      early_stage: 'Painted Door test (2 pages, measure clicks)',
      with_volume: '100+ conversions per variant, 30-60 days',
      key_metric: 'Revenue not just conversion'
    },
    triangulation_consensus: ['Simple pricing for vending machine', 'Flat rate or tiered preferred', 'Painted Door before statistical A/B', 'Always grandfather existing customers'],
    grandchildren: pricingGrandchildren,
    dependencies: [],
    blocks: [],
    estimated_effort: 'Medium (3-4 sessions total)'
  },
  {
    id: 'SD-BLIND-SPOT-FAILURE-001',
    title: 'Failure Learning System',
    priority: 'medium',
    rank: 4,
    purpose: 'Systematically capture and apply lessons from failed ventures',
    scope: {
      included: ['Post-mortem template and automation', 'Anti-pattern library (10 initial)', 'Feedback loop to pattern library'],
      excluded: ['External failure databases', 'Video recordings']
    },
    post_mortem_template: {
      sections: ['Summary (what, who, timeline)', 'Hypothesis vs Reality', 'Failure Signals (metrics + qualitative)', 'Pattern Autopsy (helped, hurt, missing)', 'Root Cause (5 Whys)', 'Failure Category (CB Insights)', 'Counterfactual (2-week test)', 'Action Items']
    },
    anti_patterns: [
      { name: 'PREMATURE_SCALING', signal: 'Burn high, retention low' },
      { name: 'WRONG_MARKET', signal: 'Low conversion, feedback mismatch' },
      { name: 'OVER_ENGINEERING', signal: 'Long dev cycles, feature bloat' },
      { name: 'UNDER_VALIDATION', signal: 'Surprise churn, negative reviews' },
      { name: 'FOUNDER_BURNOUT', signal: 'Response times increase, quality drops' },
      { name: 'PRICING_MISMATCH', signal: 'Low conversion OR low LTV' },
      { name: 'TECH_DEBT_AVALANCHE', signal: 'Bug rate spikes, velocity drops' },
      { name: 'COMPETITIVE_BLINDNESS', signal: 'Sudden churn to competitor' },
      { name: 'CASH_CLIFF', signal: '<6 months runway' },
      { name: 'GHOST_CUSTOMERS', signal: 'High signup, low activation' }
    ],
    industry_practices: {
      amazon: 'Correction of Errors (COE), 5 Whys',
      stripe: 'Pre-mortem with Tiger/Paper Tiger/Elephant',
      google: 'Blameless post-mortems, SRE-style'
    },
    triangulation_consensus: ['Post-mortems must be blameless', 'Focus on falsifiable signals', 'Lessons become checklists not essays', 'Feedback loop to pattern library'],
    grandchildren: failureGrandchildren,
    dependencies: ['SD-BLIND-SPOT-EVA-001'],
    blocks: [],
    estimated_effort: 'Medium (3-4 sessions total)'
  },
  {
    id: 'SD-BLIND-SPOT-SKILLS-001',
    title: 'Skills Inventory System',
    priority: 'low',
    rank: 5,
    purpose: 'Track capabilities and guide skill acquisition decisions',
    scope: {
      included: ['Capability ledger with evidence', 'Build/Buy/Partner/Avoid framework', 'Skill distance calculator'],
      excluded: ['Team management', 'Training curriculum', 'Hiring workflows']
    },
    skill_distance_formula: 'gap (0-5) x ramp_months x liability_multiplier (1-3)',
    decision_framework: {
      learn: 'Reusable across ventures + core + short ramp',
      hire: 'Urgent blocker + high leverage + clear spec + not core',
      partner: 'Distribution/credibility is the missing piece',
      avoid: 'Long ramp + high liability + low strategic fit'
    },
    minimum_viable_skillset: ['Full-stack web development', 'Database design (SQL basics)', 'Cloud deployment (Vercel/Netlify)', 'Git workflow', 'Product thinking (PRDs, prioritization)', 'Basic financial literacy (unit economics)', 'AI tool proficiency', 'Written communication'],
    triangulation_consensus: ['Solo founders usually know gaps intuitively', 'Evidence-based proficiency levels', 'Skill distance > 2 = careful consideration', 'Outsource legal/accounting from day 1'],
    grandchildren: skillsGrandchildren,
    dependencies: [],
    blocks: [],
    estimated_effort: 'Small (2 sessions total)'
  },
  {
    id: 'SD-BLIND-SPOT-DEPRECATION-001',
    title: 'Pattern Deprecation System',
    priority: 'low',
    rank: 6,
    purpose: 'Manage pattern lifecycle and detect deprecation candidates',
    scope: {
      included: ['Pattern lifecycle state machine', 'Usage metrics and health scoring', 'Deprecation signal detection'],
      excluded: ['Automated code migration', 'Cross-venture sync']
    },
    lifecycle_states: [
      { state: 'DRAFT', location: 'src/components/experimental', action: 'Testing' },
      { state: 'ACTIVE', location: 'src/components/core', action: 'Golden standard' },
      { state: 'SOFT_DEPRECATED', location: 'Same', action: 'Warning, no new uses' },
      { state: 'DEPRECATED', location: 'Same', action: 'Build warning, migration required' },
      { state: 'ARCHIVED', location: 'legacy/ or deleted', action: 'Removed' },
      { state: 'SUPERSEDED', location: 'Same', action: 'Alternative exists, no warning' }
    ],
    deprecation_signals: ['Usage < 2 ventures for 6 months', 'Dependencies 2+ major versions behind', 'Bug rate increasing vs alternatives', 'Better pattern covers 100% of use cases'],
    maintenance_budget: { early: '70/30 (Create/Maintain)', mature: '60/40', scale: '50/50' },
    venture_handling: {
      active_ventures: 'Encourage migration via lint warnings',
      maintenance_ventures: 'Freeze & Fork (containerize)',
      security_only: 'Force migration only for security/compliance'
    },
    triangulation_consensus: ['Lowest priority early on', 'Freeze & fork for legacy', 'Don\'t force migration unless security', '70/30 budget initially'],
    grandchildren: deprecationGrandchildren,
    dependencies: [],
    blocks: [],
    estimated_effort: 'Small (2 sessions total)'
  }
];
