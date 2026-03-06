/**
 * Seed Mental Models — 18 core model definitions
 *
 * Categories: decision, market, psychology, growth, framework
 * Each model includes exercise_template, evaluation_rubric, and prompt_context_block
 *
 * Part of SD-LEO-FEAT-MENTAL-MODELS-REPOSITORY-001
 */

export const SEED_MODELS = [
  // ── DECISION MODELS ──────────────────────────────────────────
  {
    name: 'First Principles Thinking',
    slug: 'first-principles',
    category: 'decision',
    description: 'Break down complex problems into fundamental truths, then rebuild from scratch.',
    core_concept: 'Strip away assumptions to find irreducible elements, then reconstruct solutions from the ground up.',
    applicable_stages: [0, 1, 2, 3],
    applicable_paths: ['competitor_teardown', 'discovery_mode'],
    applicable_strategies: ['trend_scanner', 'capability_overhang'],
    difficulty_level: 'intermediate',
    exercise_template: {
      prompt: 'For the venture "{venture_name}" targeting "{target_market}": 1) List 5 assumptions the industry takes for granted. 2) Which of these are actually fundamental truths vs conventions? 3) What solution emerges if you rebuild from only the truths?',
      variables: ['venture_name', 'target_market'],
    },
    evaluation_rubric: { criteria: ['assumption_depth', 'truth_identification', 'reconstruction_novelty'], max_score: 10 },
    prompt_context_block: 'Apply First Principles Thinking: What fundamental truths underlie this opportunity? Strip away industry conventions and rebuild from irreducible elements.',
    is_active: true,
  },
  {
    name: 'Inversion',
    slug: 'inversion',
    category: 'decision',
    description: 'Think backward: instead of how to succeed, identify how to fail, then avoid those paths.',
    core_concept: 'Avoid stupidity rather than seeking brilliance. Identify failure modes to reveal the path to success.',
    applicable_stages: [0, 1, 3, 5],
    applicable_paths: ['competitor_teardown', 'discovery_mode', 'blueprint_browse'],
    applicable_strategies: ['trend_scanner', 'democratization_finder', 'capability_overhang'],
    difficulty_level: 'basic',
    exercise_template: {
      prompt: 'For "{venture_name}": 1) List the top 5 ways this venture could fail catastrophically. 2) For each failure mode, what specific action prevents it? 3) What does the venture look like if you simply avoid all these failure modes?',
      variables: ['venture_name'],
    },
    evaluation_rubric: { criteria: ['failure_mode_completeness', 'prevention_specificity', 'insight_quality'], max_score: 10 },
    prompt_context_block: 'Apply Inversion: What would guarantee failure for this venture? Identify the top failure modes and design around them.',
    is_active: true,
  },
  {
    name: 'Second-Order Thinking',
    slug: 'second-order-thinking',
    category: 'decision',
    description: 'Consider consequences of consequences. What happens after the first move?',
    core_concept: 'First-order: what happens next. Second-order: and then what? Third-order: and then what after that?',
    applicable_stages: [0, 1, 2, 4],
    applicable_paths: ['competitor_teardown', 'discovery_mode'],
    applicable_strategies: ['trend_scanner', 'democratization_finder'],
    difficulty_level: 'intermediate',
    exercise_template: {
      prompt: 'For "{venture_name}" with solution "{solution}": 1) First-order effect on the target market. 2) Second-order effect on competitors and adjacent markets. 3) Third-order effect on the industry landscape in 2-3 years.',
      variables: ['venture_name', 'solution'],
    },
    evaluation_rubric: { criteria: ['chain_depth', 'non_obvious_effects', 'temporal_reasoning'], max_score: 10 },
    prompt_context_block: 'Apply Second-Order Thinking: Beyond the immediate impact, what cascading effects will this venture trigger in the market?',
    is_active: true,
  },

  // ── MARKET MODELS ────────────────────────────────────────────
  {
    name: 'Jobs To Be Done',
    slug: 'jtbd',
    category: 'market',
    description: 'People hire products to do a job. Understand the job, not the demographics.',
    core_concept: 'Customers don\'t buy products — they hire them to make progress in specific circumstances.',
    applicable_stages: [0, 1, 2],
    applicable_paths: ['competitor_teardown', 'discovery_mode'],
    applicable_strategies: ['trend_scanner', 'democratization_finder', 'capability_overhang'],
    difficulty_level: 'basic',
    exercise_template: {
      prompt: 'For "{venture_name}": 1) What job is the customer trying to get done? (functional, emotional, social dimensions) 2) What are they currently "hiring" to do this job? 3) What frustrations exist with current solutions? 4) How does "{solution}" do the job better?',
      variables: ['venture_name', 'solution'],
    },
    evaluation_rubric: { criteria: ['job_clarity', 'current_alternative_insight', 'improvement_specificity'], max_score: 10 },
    prompt_context_block: 'Apply Jobs To Be Done: What specific job is the customer hiring this product to do? Consider functional, emotional, and social dimensions.',
    is_active: true,
  },
  {
    name: 'Blue Ocean Strategy',
    slug: 'blue-ocean',
    category: 'market',
    description: 'Create uncontested market space by making competition irrelevant.',
    core_concept: 'Instead of fighting over existing demand, create new demand where there is no competition.',
    applicable_stages: [0, 1],
    applicable_paths: ['competitor_teardown', 'discovery_mode'],
    applicable_strategies: ['trend_scanner', 'democratization_finder'],
    difficulty_level: 'intermediate',
    exercise_template: {
      prompt: 'For "{venture_name}" in the "{target_market}" space: Apply the Four Actions Framework: 1) ELIMINATE: What factors can be eliminated that the industry takes for granted? 2) REDUCE: What factors can be reduced below the industry standard? 3) RAISE: What factors should be raised above the industry standard? 4) CREATE: What factors should be created that the industry has never offered?',
      variables: ['venture_name', 'target_market'],
    },
    evaluation_rubric: { criteria: ['elimination_insight', 'creation_novelty', 'differentiation_clarity'], max_score: 10 },
    prompt_context_block: 'Apply Blue Ocean Strategy: What factors can be eliminated, reduced, raised, or created to make competition irrelevant?',
    is_active: true,
  },
  {
    name: 'TAM-SAM-SOM Analysis',
    slug: 'tam-sam-som',
    category: 'market',
    description: 'Size the market opportunity from total addressable to serviceable obtainable.',
    core_concept: 'TAM = total demand, SAM = segment you can serve, SOM = realistic capture in 1-2 years.',
    applicable_stages: [0, 1, 2, 3],
    applicable_paths: ['competitor_teardown', 'discovery_mode'],
    applicable_strategies: ['trend_scanner', 'democratization_finder', 'capability_overhang'],
    difficulty_level: 'basic',
    exercise_template: {
      prompt: 'For "{venture_name}" targeting "{target_market}": 1) TAM: Total Addressable Market size and growth rate. 2) SAM: Serviceable Available Market (geography, segment constraints). 3) SOM: Serviceable Obtainable Market (realistic year-1 capture). 4) What\'s the path from SOM to SAM?',
      variables: ['venture_name', 'target_market'],
    },
    evaluation_rubric: { criteria: ['sizing_realism', 'segmentation_logic', 'capture_path_clarity'], max_score: 10 },
    prompt_context_block: 'Apply TAM-SAM-SOM: Size the total addressable market, serviceable available market, and realistic obtainable market for this opportunity.',
    is_active: true,
  },
  {
    name: 'Winner-Take-All Dynamics',
    slug: 'winner-take-all',
    category: 'market',
    description: 'Identify markets where network effects, switching costs, or scale economies create monopoly dynamics.',
    core_concept: 'Some markets converge to 1-2 dominant players. Identify if this is one and how to be the winner.',
    applicable_stages: [0, 1, 3],
    applicable_paths: ['competitor_teardown'],
    applicable_strategies: ['trend_scanner', 'capability_overhang'],
    difficulty_level: 'advanced',
    exercise_template: {
      prompt: 'For "{venture_name}": 1) Network effects: Does the product get better with more users? How strong? 2) Switching costs: How hard is it for users to leave? 3) Scale economics: Does unit cost decrease meaningfully with scale? 4) Data moat: Does more usage create proprietary data advantages? 5) Verdict: Is this winner-take-all, oligopoly, or fragmented?',
      variables: ['venture_name'],
    },
    evaluation_rubric: { criteria: ['dynamics_accuracy', 'moat_assessment', 'strategic_implication'], max_score: 10 },
    prompt_context_block: 'Assess Winner-Take-All Dynamics: Does this market have network effects, switching costs, or scale economies that favor a dominant player?',
    is_active: true,
  },

  // ── PSYCHOLOGY MODELS ────────────────────────────────────────
  {
    name: 'Loss Aversion',
    slug: 'loss-aversion',
    category: 'psychology',
    description: 'People feel losses roughly twice as strongly as equivalent gains.',
    core_concept: 'Frame value propositions in terms of what customers lose by NOT using the product.',
    applicable_stages: [0, 1, 2],
    applicable_paths: ['competitor_teardown', 'discovery_mode'],
    applicable_strategies: ['democratization_finder', 'trend_scanner'],
    difficulty_level: 'basic',
    exercise_template: {
      prompt: 'For "{venture_name}": 1) What is the customer currently losing (money, time, opportunity) without this solution? 2) Quantify the loss per week/month. 3) How can the marketing frame this as loss prevention rather than gain? 4) What\'s the "cost of inaction" narrative?',
      variables: ['venture_name'],
    },
    evaluation_rubric: { criteria: ['loss_quantification', 'framing_effectiveness', 'urgency_creation'], max_score: 10 },
    prompt_context_block: 'Apply Loss Aversion: What is the customer losing by NOT using this product? Quantify the cost of inaction.',
    is_active: true,
  },
  {
    name: 'Anchoring Effect',
    slug: 'anchoring',
    category: 'psychology',
    description: 'First piece of information encountered disproportionately influences decisions.',
    core_concept: 'Set the right anchor: compare your price to the expensive alternative, not the cheap one.',
    applicable_stages: [0, 2, 3],
    applicable_paths: ['competitor_teardown', 'discovery_mode'],
    applicable_strategies: ['democratization_finder'],
    difficulty_level: 'basic',
    exercise_template: {
      prompt: 'For "{venture_name}" with pricing model "{revenue_model}": 1) What is the current price anchor in this market? 2) What premium alternative can you anchor against (making your price feel like a bargain)? 3) What\'s the "10x cheaper than" narrative?',
      variables: ['venture_name', 'revenue_model'],
    },
    evaluation_rubric: { criteria: ['anchor_selection', 'price_perception', 'narrative_strength'], max_score: 10 },
    prompt_context_block: 'Apply Anchoring Effect: What premium alternative establishes the price anchor that makes this offering feel like exceptional value?',
    is_active: true,
  },
  {
    name: 'Dunning-Kruger Awareness',
    slug: 'dunning-kruger',
    category: 'psychology',
    description: 'Assess what you don\'t know about a market. Overconfidence kills ventures.',
    core_concept: 'The less you know about a domain, the more confident you feel. Actively seek unknown unknowns.',
    applicable_stages: [0, 1, 3],
    applicable_paths: ['competitor_teardown', 'discovery_mode'],
    applicable_strategies: ['trend_scanner', 'capability_overhang'],
    difficulty_level: 'advanced',
    exercise_template: {
      prompt: 'For "{venture_name}" in "{target_market}": 1) What do we KNOW we know? (confirmed facts) 2) What do we KNOW we don\'t know? (identified gaps) 3) What might we NOT KNOW we don\'t know? (blind spots based on domain inexperience) 4) What would a 10-year industry veteran tell us we\'re missing?',
      variables: ['venture_name', 'target_market'],
    },
    evaluation_rubric: { criteria: ['known_unknown_quality', 'blind_spot_depth', 'humility_signal'], max_score: 10 },
    prompt_context_block: 'Apply Dunning-Kruger Awareness: What unknown unknowns might we be missing? What would a domain expert say we\'re overlooking?',
    is_active: true,
  },

  // ── GROWTH MODELS ────────────────────────────────────────────
  {
    name: 'Flywheel Effect',
    slug: 'flywheel',
    category: 'growth',
    description: 'Identify self-reinforcing growth loops where each customer makes the next one cheaper to acquire.',
    core_concept: 'Build compounding loops: more users → more data → better product → more users.',
    applicable_stages: [0, 1, 2, 4],
    applicable_paths: ['competitor_teardown', 'discovery_mode'],
    applicable_strategies: ['trend_scanner', 'capability_overhang'],
    difficulty_level: 'intermediate',
    exercise_template: {
      prompt: 'For "{venture_name}": 1) Map the primary flywheel: what is the core loop that compounds? 2) What is the "heavy push" needed to start spinning? 3) What friction slows the flywheel? 4) At what scale does the flywheel become self-sustaining?',
      variables: ['venture_name'],
    },
    evaluation_rubric: { criteria: ['loop_clarity', 'friction_identification', 'sustainability_analysis'], max_score: 10 },
    prompt_context_block: 'Apply Flywheel Effect: What self-reinforcing growth loop can be built? Map the compounding cycle and identify the critical mass threshold.',
    is_active: true,
  },
  {
    name: 'Pareto Principle (80/20)',
    slug: 'pareto',
    category: 'growth',
    description: '80% of results come from 20% of efforts. Identify the vital few.',
    core_concept: 'Focus ruthlessly on the 20% of features, customers, or channels that drive 80% of value.',
    applicable_stages: [0, 1, 2, 3, 4, 5],
    applicable_paths: ['competitor_teardown', 'discovery_mode', 'blueprint_browse'],
    applicable_strategies: ['trend_scanner', 'democratization_finder', 'capability_overhang', 'nursery_reeval'],
    difficulty_level: 'basic',
    exercise_template: {
      prompt: 'For "{venture_name}": 1) What are the 20% of features that deliver 80% of value? 2) What are the 20% of customer segments that will generate 80% of revenue? 3) What are the 20% of channels that will drive 80% of acquisition? 4) What can you NOT build in v1 without losing the core value?',
      variables: ['venture_name'],
    },
    evaluation_rubric: { criteria: ['vital_few_identification', 'focus_discipline', 'cut_quality'], max_score: 10 },
    prompt_context_block: 'Apply Pareto Principle: What 20% of effort will drive 80% of results? Identify the vital few features, segments, and channels.',
    is_active: true,
  },
  {
    name: 'Crossing the Chasm',
    slug: 'crossing-the-chasm',
    category: 'growth',
    description: 'Technology adoption has a gap between early adopters and mainstream. Plan for it.',
    core_concept: 'Early adopters buy vision; mainstream buys solutions. The chasm between them kills ventures.',
    applicable_stages: [0, 1, 3, 4],
    applicable_paths: ['competitor_teardown', 'discovery_mode'],
    applicable_strategies: ['trend_scanner', 'capability_overhang'],
    difficulty_level: 'intermediate',
    exercise_template: {
      prompt: 'For "{venture_name}": 1) Who are the innovators/early adopters? What motivates them? 2) Who is the early majority? What do they need that early adopters don\'t? 3) What is the "whole product" needed to cross the chasm? 4) What is the beachhead segment for mainstream adoption?',
      variables: ['venture_name'],
    },
    evaluation_rubric: { criteria: ['segment_clarity', 'chasm_awareness', 'beachhead_specificity'], max_score: 10 },
    prompt_context_block: 'Apply Crossing the Chasm: Who are the early adopters vs mainstream buyers? What whole product is needed to cross from visionaries to pragmatists?',
    is_active: true,
  },

  // ── FRAMEWORK MODELS ─────────────────────────────────────────
  {
    name: 'Porter\'s Five Forces',
    slug: 'porters-five-forces',
    category: 'framework',
    description: 'Assess competitive intensity through 5 structural forces.',
    core_concept: 'Industry profitability is determined by: rivalry, new entrants, substitutes, buyer power, supplier power.',
    applicable_stages: [0, 1, 3],
    applicable_paths: ['competitor_teardown'],
    applicable_strategies: ['trend_scanner', 'capability_overhang'],
    difficulty_level: 'intermediate',
    exercise_template: {
      prompt: 'For "{venture_name}" entering "{target_market}": Rate each force 1-5 (5=strongest): 1) Competitive Rivalry: How intense? 2) Threat of New Entrants: How easy to enter? 3) Threat of Substitutes: What alternatives exist? 4) Bargaining Power of Buyers: Can customers pressure prices? 5) Bargaining Power of Suppliers: Are you dependent on key suppliers?',
      variables: ['venture_name', 'target_market'],
    },
    evaluation_rubric: { criteria: ['force_accuracy', 'strategic_implication', 'profitability_assessment'], max_score: 10 },
    prompt_context_block: 'Apply Porter\'s Five Forces: Assess competitive rivalry, threat of entrants, substitutes, buyer power, and supplier power in this market.',
    is_active: true,
  },
  {
    name: 'SWOT Analysis',
    slug: 'swot',
    category: 'framework',
    description: 'Map Strengths, Weaknesses, Opportunities, and Threats for strategic clarity.',
    core_concept: 'Internal (Strengths/Weaknesses) meets External (Opportunities/Threats). Use for strategic positioning.',
    applicable_stages: [0, 1, 2, 3],
    applicable_paths: ['competitor_teardown', 'discovery_mode', 'blueprint_browse'],
    applicable_strategies: ['trend_scanner', 'democratization_finder', 'capability_overhang', 'nursery_reeval'],
    difficulty_level: 'basic',
    exercise_template: {
      prompt: 'For "{venture_name}": STRENGTHS: What advantages does EHG\'s automation-first approach give this venture? WEAKNESSES: What inherent limitations exist? OPPORTUNITIES: What market/technology trends favor this venture? THREATS: What external forces could undermine it? For each quadrant, list 3-5 specific items.',
      variables: ['venture_name'],
    },
    evaluation_rubric: { criteria: ['specificity', 'internal_external_balance', 'actionability'], max_score: 10 },
    prompt_context_block: 'Apply SWOT Analysis: Map specific Strengths (EHG automation), Weaknesses, Opportunities (market trends), and Threats for strategic positioning.',
    is_active: true,
  },
  {
    name: 'Lean Canvas',
    slug: 'lean-canvas',
    category: 'framework',
    description: 'One-page business model focused on problems, solutions, and key metrics.',
    core_concept: 'Capture the 9 essential business model elements on a single page. Iterate rapidly.',
    applicable_stages: [0, 1, 2],
    applicable_paths: ['competitor_teardown', 'discovery_mode'],
    applicable_strategies: ['trend_scanner', 'democratization_finder', 'capability_overhang'],
    difficulty_level: 'basic',
    exercise_template: {
      prompt: 'For "{venture_name}": Fill in the Lean Canvas: 1) Problem (top 3). 2) Customer Segments. 3) Unique Value Proposition (single sentence). 4) Solution. 5) Channels. 6) Revenue Streams. 7) Cost Structure. 8) Key Metrics. 9) Unfair Advantage (EHG automation).',
      variables: ['venture_name'],
    },
    evaluation_rubric: { criteria: ['completeness', 'problem_solution_fit', 'metric_clarity'], max_score: 10 },
    prompt_context_block: 'Apply Lean Canvas: Capture the 9 essential business model elements — Problem, Segments, UVP, Solution, Channels, Revenue, Costs, Metrics, Unfair Advantage.',
    is_active: true,
  },
  {
    name: 'Reflexivity',
    slug: 'reflexivity',
    category: 'framework',
    description: 'Market perceptions shape reality, which in turn shapes perceptions. Feedback loops matter.',
    core_concept: 'Success breeds credibility breeds more success. Identify and exploit positive feedback loops.',
    applicable_stages: [0, 1, 3, 4],
    applicable_paths: ['competitor_teardown', 'discovery_mode'],
    applicable_strategies: ['trend_scanner'],
    difficulty_level: 'advanced',
    exercise_template: {
      prompt: 'For "{venture_name}": 1) What positive reflexive loop exists? (success → perception → more success) 2) What negative reflexive loop could emerge? (failure → perception → more failure) 3) What is the minimum trigger to start the positive loop? 4) How can the negative loop be circuit-broken?',
      variables: ['venture_name'],
    },
    evaluation_rubric: { criteria: ['loop_identification', 'trigger_analysis', 'circuit_breaker_quality'], max_score: 10 },
    prompt_context_block: 'Apply Reflexivity: How do market perceptions create self-reinforcing feedback loops? Identify both positive and negative reflexive dynamics.',
    is_active: true,
  },
  {
    name: 'Occam\'s Razor',
    slug: 'occams-razor',
    category: 'framework',
    description: 'The simplest explanation or solution is usually the best. Avoid unnecessary complexity.',
    core_concept: 'Don\'t multiply entities beyond necessity. The simplest viable solution wins.',
    applicable_stages: [0, 1, 2, 3, 4, 5],
    applicable_paths: ['competitor_teardown', 'discovery_mode', 'blueprint_browse'],
    applicable_strategies: ['trend_scanner', 'democratization_finder', 'capability_overhang', 'nursery_reeval'],
    difficulty_level: 'basic',
    exercise_template: {
      prompt: 'For "{venture_name}" with proposed solution "{solution}": 1) What is the absolute simplest version that solves the core problem? 2) What complexity in the current proposal is unnecessary? 3) What would a "one-feature MVP" look like? 4) What can be deferred without losing the core value?',
      variables: ['venture_name', 'solution'],
    },
    evaluation_rubric: { criteria: ['simplification_quality', 'core_preservation', 'complexity_elimination'], max_score: 10 },
    prompt_context_block: 'Apply Occam\'s Razor: What is the simplest viable version of this solution? Strip away unnecessary complexity.',
    is_active: true,
  },
];

/**
 * Seed models into the database.
 * Uses ON CONFLICT DO NOTHING to be idempotent.
 *
 * @param {Object} supabase - Supabase client
 * @returns {Promise<{inserted: number, skipped: number}>}
 */
export async function seedModels(supabase) {
  const results = { inserted: 0, skipped: 0 };

  for (const model of SEED_MODELS) {
    const { error } = await supabase
      .from('mental_models')
      .upsert(model, { onConflict: 'slug', ignoreDuplicates: true });

    if (error) {
      results.skipped++;
    } else {
      results.inserted++;
    }
  }

  return results;
}
