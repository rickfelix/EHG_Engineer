/**
 * Synthetic Venture Factory
 *
 * Generates parameterized synthetic ventures from archetype blueprints.
 * Supports seed reproducibility, controlled variation, and diversity validation.
 *
 * Part of SD-AUTOMATED-PIPELINE-RUNNER-FOR-ORCH-001-A
 */

import { SYNTHESIS_TO_DB_ARCHETYPE } from '../stage-zero/synthesis/archetype-mapping.js';

const ARCHETYPES = [
  { key: 'democratizer', dbArchetype: SYNTHESIS_TO_DB_ARCHETYPE.democratizer, label: 'Democratizer', market: 'underserved consumer', model: 'freemium' },
  { key: 'automator', dbArchetype: SYNTHESIS_TO_DB_ARCHETYPE.automator, label: 'Automator', market: 'enterprise operations', model: 'SaaS subscription' },
  { key: 'capability_productizer', dbArchetype: SYNTHESIS_TO_DB_ARCHETYPE.capability_productizer, label: 'Capability Productizer', market: 'mid-market B2B', model: 'usage-based' },
  { key: 'first_principles_rebuilder', dbArchetype: SYNTHESIS_TO_DB_ARCHETYPE.first_principles_rebuilder, label: 'First Principles Rebuilder', market: 'legacy industry', model: 'platform' },
  { key: 'vertical_specialist', dbArchetype: SYNTHESIS_TO_DB_ARCHETYPE.vertical_specialist, label: 'Vertical Specialist', market: 'niche vertical', model: 'enterprise license' },
  { key: 'portfolio_connector', dbArchetype: SYNTHESIS_TO_DB_ARCHETYPE.portfolio_connector, label: 'Portfolio Connector', market: 'EHG portfolio', model: 'internal platform' },
  { key: 'experience_designer', dbArchetype: SYNTHESIS_TO_DB_ARCHETYPE.experience_designer, label: 'Experience Designer', market: 'consumer digital', model: 'subscription' },
];

const PROBLEM_TEMPLATES = {
  democratizer: [
    'High-quality {domain} services are only accessible to large enterprises with $100K+ budgets',
    'Small businesses in {domain} lack access to {capability} tools that Fortune 500 companies use daily',
    '{domain} expertise is gatekept by expensive consultants charging $500+/hour',
  ],
  automator: [
    'Manual {domain} processes consume 40+ hours per week for enterprise teams',
    '{domain} workflows require 5+ manual handoffs per transaction, causing 3-day delays',
    'Repetitive {domain} tasks cost businesses $200K/year in labor with 15% error rates',
  ],
  capability_productizer: [
    'EHG\'s internal {capability} system handles 10K+ operations daily but has no external API',
    'Our {capability} engine outperforms market alternatives by 3x but is only used internally',
    'The {capability} pipeline we built for internal use could serve 500+ external customers',
  ],
  first_principles_rebuilder: [
    'The {domain} industry still runs on 20-year-old processes designed for a pre-digital era',
    '{domain} incumbents charge 10x fair value because no one has rebuilt the infrastructure',
    'Regulatory changes in {domain} have made legacy systems non-compliant, requiring ground-up rebuild',
  ],
  vertical_specialist: [
    '{domain} professionals lack specialized tools, forcing them to use generic software with 30% feature waste',
    'No existing solution handles the unique compliance requirements of {domain}',
    '{domain} has $50B TAM but no purpose-built AI solution for {capability}',
  ],
  portfolio_connector: [
    'Three EHG ventures in {domain} duplicate effort on {capability} with no shared infrastructure',
    'Data flows between EHG ventures are manual, causing 2-week sync delays',
    'EHG portfolio ventures lack unified {capability}, reducing cross-sell by 60%',
  ],
  experience_designer: [
    'Existing {domain} applications have NPS scores below 20 due to poor UX',
    'Users abandon {domain} tools within 7 days because of steep learning curves',
    '{domain} interfaces haven\'t evolved in a decade while user expectations have shifted to mobile-first',
  ],
};

const DOMAINS = ['healthcare', 'fintech', 'edtech', 'logistics', 'legal', 'real estate', 'agriculture', 'energy', 'HR tech', 'cybersecurity'];
const CAPABILITIES = ['data analytics', 'workflow automation', 'AI scoring', 'document processing', 'risk assessment', 'compliance monitoring', 'customer engagement', 'predictive modeling'];

/**
 * Seeded pseudo-random number generator (mulberry32).
 * Deterministic for reproducible venture generation.
 */
function seededRandom(seed) {
  let t = seed + 0x6D2B79F5;
  return function () {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Calculate Shannon entropy for archetype distribution.
 * @param {string[]} archetypeKeys - Array of archetype keys in a batch
 * @returns {number} Shannon entropy (0 = no diversity, ~1.95 = max for 7 archetypes)
 */
export function shannonEntropy(archetypeKeys) {
  const counts = {};
  for (const key of archetypeKeys) {
    counts[key] = (counts[key] || 0) + 1;
  }
  const total = archetypeKeys.length;
  let entropy = 0;
  for (const count of Object.values(counts)) {
    const p = count / total;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Normalize Shannon entropy to 0-1 scale based on number of categories used.
 * @param {number} entropy - Raw Shannon entropy
 * @param {number} categoryCount - Number of distinct categories
 * @returns {number} Normalized entropy (0-1)
 */
export function normalizedEntropy(entropy, categoryCount) {
  if (categoryCount <= 1) return 0;
  const maxEntropy = Math.log2(categoryCount);
  return maxEntropy > 0 ? entropy / maxEntropy : 0;
}

export class SyntheticVentureFactory {
  constructor(config = {}) {
    this.archetypes = ARCHETYPES;
    this.batchIdCounter = 0;
    this.minEntropy = config.minEntropy ?? 0.6;
  }

  /**
   * Create a batch of diverse synthetic ventures.
   *
   * @param {number} batchSize - Number of ventures to create
   * @param {Object} [options] - Generation options
   * @param {number} [options.seed] - Seed for reproducible generation
   * @param {string} [options.batchId] - Custom batch identifier
   * @param {string[]} [options.archetypeFilter] - Restrict to specific archetypes
   * @param {string} [options.experimentId] - Tag ventures for a specific experiment
   * @returns {{ ventures: Object[], metadata: Object }}
   */
  createBatch(batchSize = 4, options = {}) {
    const seed = options.seed ?? Date.now();
    const rand = seededRandom(seed);
    const batchId = options.batchId || `BATCH-${++this.batchIdCounter}-${Date.now()}`;
    const archetypePool = options.archetypeFilter
      ? this.archetypes.filter(a => options.archetypeFilter.includes(a.key))
      : this.archetypes;

    // Distribute archetypes for diversity: round-robin with shuffle
    const archetypeAssignments = this._assignArchetypes(batchSize, archetypePool, rand);
    const ventures = [];

    for (let i = 0; i < batchSize; i++) {
      const archetype = archetypeAssignments[i];
      const venture = this._generateVenture(archetype, seed + i, rand, batchId, i);
      if (options.experimentId) {
        venture.synthetic_metadata.experiment_id = options.experimentId;
      }
      ventures.push(venture);
    }

    const archetypeKeys = ventures.map(v => v.archetype);
    const entropy = shannonEntropy(archetypeKeys);
    const normEntropy = normalizedEntropy(entropy, new Set(archetypeKeys).size);

    return {
      ventures,
      metadata: {
        batchId,
        seed,
        batchSize,
        experimentId: options.experimentId || null,
        archetypeDistribution: this._countArchetypes(archetypeKeys),
        shannonEntropy: entropy,
        normalizedEntropy: normEntropy,
        diversityPass: normEntropy >= this.minEntropy,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Generate a single synthetic venture from an archetype blueprint.
   */
  _generateVenture(archetype, seed, rand, batchId, index) {
    const domain = DOMAINS[Math.floor(rand() * DOMAINS.length)];
    const capability = CAPABILITIES[Math.floor(rand() * CAPABILITIES.length)];
    const templates = PROBLEM_TEMPLATES[archetype.key];
    const template = templates[Math.floor(rand() * templates.length)];

    const problemStatement = template
      .replace('{domain}', domain)
      .replace('{capability}', capability);

    const name = `Synthetic-${archetype.label}-${domain}-${seed % 10000}`;

    return {
      name,
      description: problemStatement,
      problem_statement: problemStatement,
      target_market: archetype.market,
      origin_type: 'synthetic_pipeline',
      current_lifecycle_stage: 1,
      status: 'active',
      archetype: archetype.dbArchetype,
      is_synthetic: true,
      metadata: {
        stage_zero: {
          solution: `AI-powered ${domain} ${capability} platform`,
          archetype: archetype.key,
        },
      },
      synthetic_metadata: {
        archetype_key: archetype.key,
        db_archetype: archetype.dbArchetype,
        seed,
        batch_id: batchId,
        batch_index: index,
        generated_at: new Date().toISOString(),
        domain,
        capability,
      },
    };
  }

  /**
   * Assign archetypes ensuring diversity via round-robin with shuffle.
   */
  _assignArchetypes(count, pool, rand) {
    // Shuffle pool
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const assignments = [];
    for (let i = 0; i < count; i++) {
      assignments.push(shuffled[i % shuffled.length]);
    }
    return assignments;
  }

  /**
   * Count archetype occurrences in a batch.
   */
  _countArchetypes(keys) {
    const counts = {};
    for (const key of keys) {
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }
}
