/**
 * Seed the initial glide path policy v1.
 * Idempotent: skips if policy already exists.
 *
 * Pre-revenue EHG defaults:
 * - cash_engine: 0.60 weight
 * - capability_builder: 0.30 weight
 * - moonshot: 0.10 weight (locked to 0.0 until revenue milestone)
 */
import 'dotenv/config';
import { insertPolicyVersion, activatePolicy } from '../policy-writer.js';
import { getActivePolicy } from '../policy-reader.js';

const POLICY_KEY = 'glide-path';

const dimensions = [
  { key: 'revenue_potential', label: 'Revenue Potential', source_field: 'projected_revenue', normalization: 'log10', min: 0, max: 1000000, default_value: 10000 },
  { key: 'market_size', label: 'Market Size', source_field: 'market_size_estimate', normalization: 'log10', min: 0, max: 10000000, default_value: 100000 },
  { key: 'build_complexity', label: 'Build Complexity (inverse)', source_field: 'build_complexity_score', min: 0, max: 100, default_value: 50 },
  { key: 'strategic_fit', label: 'Strategic Fit', source_field: 'portfolio_synergy_score', min: 0, max: 1, default_value: 0.5 },
  { key: 'social_impact', label: 'Social Impact', source_field: 'social_impact_score', min: 0, max: 100, default_value: 30 },
  { key: 'time_to_revenue', label: 'Time to Revenue (inverse)', source_field: 'months_to_revenue', min: 0, max: 36, default_value: 12 }
];

const weights = {
  revenue_potential: 0.25,
  market_size: 0.15,
  build_complexity: 0.15,
  strategic_fit: 0.15,
  social_impact: 0.10,
  time_to_revenue: 0.20
};

const phaseDefinitions = [
  {
    phase: 'seed',
    label: 'Seed / Pre-Revenue',
    min_score: 0,
    max_score: 39,
    allowed_growth_strategies: ['cash_engine', 'capability_builder'],
    time_horizon_classification: 'long'
  },
  {
    phase: 'growth',
    label: 'Growth / Early Revenue',
    min_score: 40,
    max_score: 74,
    allowed_growth_strategies: ['cash_engine', 'capability_builder', 'moonshot'],
    time_horizon_classification: 'medium'
  },
  {
    phase: 'scale',
    label: 'Scale / Stable Revenue',
    min_score: 75,
    max_score: 100,
    allowed_growth_strategies: ['cash_engine', 'capability_builder', 'moonshot'],
    time_horizon_classification: 'short'
  }
];

const archetypeUnlockConditions = {
  saas_b2b:      { min_score: 20, required_phase: null },
  saas_b2c:      { min_score: 25, required_phase: null },
  services:      { min_score: 15, required_phase: null },
  saas:          { min_score: 20, required_phase: null },
  ai_product:    { min_score: 30, required_phase: null },
  ai_agents:     { min_score: 35, required_phase: null },
  content:       { min_score: 20, required_phase: null },
  creator_tools: { min_score: 30, required_phase: null },
  edtech:        { min_score: 30, required_phase: null },
  fintech:       { min_score: 40, required_phase: 'growth' },
  healthtech:    { min_score: 45, required_phase: 'growth' },
  e_commerce:    { min_score: 35, required_phase: null },
  marketplace:   { min_score: 50, required_phase: 'growth' },
  media:         { min_score: 25, required_phase: null },
  real_estate:   { min_score: 55, required_phase: 'growth' },
  deeptech:      { min_score: 60, required_phase: 'scale' },
  hardware:      { min_score: 65, required_phase: 'scale' }
};

async function seed() {
  // Idempotency check
  try {
    const existing = await getActivePolicy(POLICY_KEY);
    console.log(`Policy "${POLICY_KEY}" v${existing.policy_version} already active. Skipping seed.`);
    return;
  } catch { /* no active policy — proceed */ }

  console.log('Seeding initial glide path policy v1...');

  const policy = await insertPolicyVersion({
    policyKey: POLICY_KEY,
    dimensions,
    weights,
    phaseDefinitions: phaseDefinitions,
    archetypeUnlockConditions: archetypeUnlockConditions,
    metadata: { source: 'seed', description: 'Initial pre-revenue glide path policy' },
    boardApproved: true
  }, 'chairman-seed');

  await activatePolicy(policy.id, 'chairman-seed');

  console.log(`Seeded and activated policy "${POLICY_KEY}" v${policy.policy_version} (id: ${policy.id})`);
}

seed().catch(err => { console.error('Seed failed:', err.message); process.exit(1); });
