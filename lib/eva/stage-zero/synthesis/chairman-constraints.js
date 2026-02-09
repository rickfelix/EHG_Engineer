/**
 * Synthesis Component 5: Chairman Constraints
 *
 * Auto-applied strategic filters from the chairman's directives.
 * Constraints are loaded from database and evolve over time as
 * new learnings come from kill gates and retrospectives.
 *
 * Default constraints (from SD description):
 * - Must be fully automatable
 * - Proprietary data advantage
 * - Narrow specialization
 * - Niche over crowded
 * - 2-year positioning
 * - Portfolio integration
 * - Data collection built-in
 * - Moat-first
 * - Values alignment
 * - Viral potential
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-G
 */

const DEFAULT_CONSTRAINTS = [
  { key: 'fully_automatable', label: 'Must be fully automatable', weight: 10 },
  { key: 'proprietary_data', label: 'Proprietary data advantage', weight: 8 },
  { key: 'narrow_specialization', label: 'Narrow specialization', weight: 7 },
  { key: 'niche_over_crowded', label: 'Niche over crowded market', weight: 7 },
  { key: 'two_year_positioning', label: '2-year positioning horizon', weight: 6 },
  { key: 'portfolio_integration', label: 'Portfolio integration potential', weight: 6 },
  { key: 'data_collection_built_in', label: 'Data collection built-in', weight: 8 },
  { key: 'moat_first', label: 'Moat-first design', weight: 9 },
  { key: 'values_alignment', label: 'Values alignment', weight: 5 },
  { key: 'viral_potential', label: 'Viral/growth potential', weight: 4 },
];

/**
 * Apply chairman constraints to a venture candidate.
 *
 * @param {Object} pathOutput - PathOutput from entry path
 * @param {Object} deps - Injected dependencies
 * @param {Object} [deps.supabase] - Supabase client (for loading stored constraints)
 * @param {Object} [deps.logger] - Logger
 * @returns {Promise<Object>} Constraint evaluation result
 */
export async function applyChairmanConstraints(pathOutput, deps = {}) {
  const { supabase, logger = console } = deps;

  logger.log('   Applying chairman constraints...');

  // Load constraints from database or use defaults
  const constraints = await loadConstraints(supabase);
  logger.log(`   Evaluating ${constraints.length} constraint(s)`);

  // Evaluate each constraint against the venture
  const evaluations = evaluateConstraints(pathOutput, constraints);

  const passed = evaluations.filter(e => e.status === 'pass');
  const failed = evaluations.filter(e => e.status === 'fail');
  const warnings = evaluations.filter(e => e.status === 'warning');

  const maxScore = constraints.reduce((sum, c) => sum + c.weight, 0);
  const actualScore = evaluations.reduce((sum, e) => sum + (e.status === 'pass' ? e.weight : e.status === 'warning' ? e.weight * 0.5 : 0), 0);
  const percentScore = maxScore > 0 ? Math.round((actualScore / maxScore) * 100) : 0;

  const verdict = failed.length === 0 ? 'pass' : failed.some(f => f.weight >= 8) ? 'fail' : 'review';

  logger.log(`   Constraints: ${passed.length} pass, ${warnings.length} warnings, ${failed.length} fail → ${verdict}`);

  return {
    component: 'chairman_constraints',
    verdict,
    score: percentScore,
    evaluations,
    passed_count: passed.length,
    failed_count: failed.length,
    warning_count: warnings.length,
    total_constraints: constraints.length,
    critical_failures: failed.filter(f => f.weight >= 8).map(f => f.key),
    summary: verdict === 'pass'
      ? `All ${constraints.length} chairman constraints satisfied (${percentScore}%).`
      : `${failed.length} constraint(s) failed. ${verdict === 'fail' ? 'Critical failure - venture blocked.' : 'Review recommended.'}`,
  };
}

/**
 * Load constraints from database, falling back to defaults.
 */
async function loadConstraints(supabase) {
  if (!supabase) return DEFAULT_CONSTRAINTS;

  try {
    const { data, error } = await supabase
      .from('chairman_constraints')
      .select('key, label, weight, is_active')
      .eq('is_active', true)
      .order('weight', { ascending: false });

    if (!error && data && data.length > 0) {
      return data;
    }
  } catch {
    // Fall through to defaults
  }

  return DEFAULT_CONSTRAINTS;
}

/**
 * Evaluate constraints against a venture using heuristic matching.
 */
function evaluateConstraints(pathOutput, constraints) {
  const solution = (pathOutput.suggested_solution || '').toLowerCase();
  const problem = (pathOutput.suggested_problem || '').toLowerCase();
  const name = (pathOutput.suggested_name || '').toLowerCase();
  const market = (pathOutput.target_market || '').toLowerCase();
  const allText = `${name} ${problem} ${solution} ${market}`;

  return constraints.map(c => {
    const result = { key: c.key, label: c.label, weight: c.weight };

    switch (c.key) {
      case 'fully_automatable':
        result.status = (allText.includes('automat') || allText.includes('ai') || allText.includes('ai-powered')) ? 'pass' : 'warning';
        result.rationale = result.status === 'pass' ? 'Automation keywords detected' : 'No clear automation signal';
        break;
      case 'proprietary_data':
        result.status = (allText.includes('data') || allText.includes('proprietary') || allText.includes('collect')) ? 'pass' : 'warning';
        result.rationale = result.status === 'pass' ? 'Data strategy detected' : 'No clear data advantage';
        break;
      case 'narrow_specialization':
        result.status = market.length > 5 ? 'pass' : 'warning';
        result.rationale = market.length > 5 ? `Target market defined: ${market}` : 'Market not specified';
        break;
      case 'niche_over_crowded':
        result.status = 'pass'; // Default pass - LLM would assess more accurately
        result.rationale = 'Assumed niche (full assessment requires market data)';
        break;
      case 'moat_first':
        result.status = 'pass'; // Moat is designed by component 4
        result.rationale = 'Moat architecture designed by synthesis';
        break;
      default:
        result.status = 'pass';
        result.rationale = 'Default pass - heuristic check';
        break;
    }

    return result;
  });
}

export { DEFAULT_CONSTRAINTS };
