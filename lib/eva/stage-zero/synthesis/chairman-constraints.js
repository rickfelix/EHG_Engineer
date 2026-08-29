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
  const { supabase, logger = console, strategicContext } = deps;

  logger.log('   Applying chairman constraints...');

  // Load constraints from database or use defaults
  const constraints = await loadConstraints(supabase);
  logger.log(`   Evaluating ${constraints.length} constraint(s)`);

  // Evaluate each constraint against the venture (with strategic context for values_alignment)
  const evaluations = evaluateConstraints(pathOutput, constraints, strategicContext);

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
    // QF-20260710-754 (Delta L2): the old SELECT named phantom columns (key/label — live
    // columns are constraint_key/name), so this query FAILED on every run and the silent
    // catch masked it: chairman-ratified constraint rows were never loaded. Live columns
    // mapped to the shape evaluateConstraint consumes.
    // SD-LEO-INFRA-ENCODE-CHAIRMAN-VENTURE-001: filter_type is now selected so hard_reject
    // constraints can produce a real 'fail' status (previously never read -- see FR-2).
    const { data, error } = await supabase
      .from('chairman_constraints')
      .select('constraint_key, name, weight, filter_type, is_active')
      .eq('is_active', true)
      .order('weight', { ascending: false });

    if (!error && data && data.length > 0) {
      return data.map((r) => ({ key: r.constraint_key, label: r.name, weight: r.weight, filterType: r.filter_type }));
    }
    // Visibility on genuine failure — falling back silently masked exactly the above.
    if (error) console.warn(`[ChairmanConstraints] DB load failed (${error.message}) — using DEFAULT_CONSTRAINTS`);
  } catch (err) {
    console.warn(`[ChairmanConstraints] DB load threw (${err?.message || err}) — using DEFAULT_CONSTRAINTS`);
  }

  return DEFAULT_CONSTRAINTS;
}

// C5 (Delta-ledger 41a2e6da): word-boundary match for automation signals. The prior
// `allText.includes('ai')` substring check false-positived on "maintain", "email",
// "domain", etc. — any word merely CONTAINING "ai".
const AUTOMATION_SIGNAL_RE = /\b(automat\w*|ai|ai-powered|artificial intelligence|machine learning)\b/i;

// SD-LEO-INFRA-ENCODE-CHAIRMAN-VENTURE-001 (FR-1/FR-3): live chairman_constraints.constraint_key
// values are UPPER_SNAKE_CASE (e.g. 'MOAT_FIRST', 'MUST_BE_AUTOMATABLE') -- confirmed via a live
// DB query, 10/10 seeded rows. The switch below previously keyed on lowercase DEFAULT_CONSTRAINTS
// spellings only, so every real DB row fell to the unscored default branch regardless of its
// intended heuristic. Cases are now written against the real UPPER_SNAKE_CASE values, with the
// DEFAULT_CONSTRAINTS fallback spellings (lowercase, and for two keys a different word entirely --
// 'fully_automatable'/'data_collection_built_in' vs the DB's MUST_BE_AUTOMATABLE/DATA_FLYWHEEL)
// as additional case labels so either source resolves to the same heuristic.
function normalizeConstraintKey(key) {
  return String(key || '').toUpperCase();
}

/**
 * Evaluate constraints against a venture using heuristic matching.
 * When strategicContext is available, values_alignment uses mission core_values
 * for keyword overlap instead of a default pass.
 *
 * SD-LEO-INFRA-ENCODE-CHAIRMAN-VENTURE-001 (FR-2): status can now be 'fail' -- previously this
 * function only ever produced 'pass'/'warning', so a hard_reject constraint (5 of 10 live rows)
 * could never structurally block a venture no matter what its condition said. A 'fail' is only
 * produced when filterType === 'hard_reject' AND the underlying signal check is unmet; a
 * score_modifier/score_bonus/advisory constraint never fails, matching its DB-declared intent.
 */
function evaluateConstraints(pathOutput, constraints, strategicContext) {
  const solution = (pathOutput.suggested_solution || '').toLowerCase();
  const problem = (pathOutput.suggested_problem || '').toLowerCase();
  const name = (pathOutput.suggested_name || '').toLowerCase();
  const market = (pathOutput.target_market || '').toLowerCase();
  const allText = `${name} ${problem} ${solution} ${market}`;

  // Word-boundary keyword sets for the doctrine dimensions that have no dedicated regex yet.
  const DATA_FLYWHEEL_RE = /\b(data\s*flywheel|feedback\s*loop|compounding\s*data|network\s*effect)\b/i;
  const VIRAL_RE = /\b(viral|word[\s-]of[\s-]mouth|referral|shareable)\b/i;
  const AMBITION_RE = /\b(10x|5x|order[\s-]of[\s-]magnitude|category[\s-]defining|disrupt\w*)\b/i;
  const JAGGED_RE = /\b(jagged|capability\s*gap|model\s*can'?t|llms?\s*(can'?t|struggle))\b/i;
  const EDGE_OF_CAPABILITY_RE = /\b(edge[\s-]of[\s-]capability|frontier\s*model|just\s*became\s*possible|newly\s*possible)\b/i;
  const CONVERGENCE_RE = /\b(convergence|compounding|multiple\s*trends|platform\s*shift)\b/i;

  /** A hard_reject constraint whose underlying check fails becomes status='fail'; anything else stays 'warning'. */
  const rejectOrWarn = (unmetRationale) => (filterType) =>
    filterType === 'hard_reject'
      ? { status: 'fail', rationale: unmetRationale }
      : { status: 'warning', rationale: unmetRationale };

  return constraints.map(c => {
    const result = { key: c.key, label: c.label, weight: c.weight };
    const filterType = c.filterType;
    const keyU = normalizeConstraintKey(c.key);

    switch (keyU) {
      case 'MUST_BE_AUTOMATABLE':
      case 'FULLY_AUTOMATABLE':
        // C5 (Delta-ledger 41a2e6da): allText.includes('ai') matched substrings inside
        // unrelated words ("maintain", "email"). Word-boundary regex instead.
        if (AUTOMATION_SIGNAL_RE.test(allText)) {
          result.status = 'pass';
          result.rationale = 'Automation keywords detected';
        } else {
          Object.assign(result, rejectOrWarn('No clear automation signal')(filterType));
        }
        break;
      case 'PROPRIETARY_DATA':
        if (allText.includes('data') || allText.includes('proprietary') || allText.includes('collect')) {
          result.status = 'pass';
          result.rationale = 'Data strategy detected';
        } else {
          Object.assign(result, rejectOrWarn('No clear data advantage')(filterType));
        }
        break;
      case 'NARROW_SPECIALIZATION':
        if (market.length > 5) {
          result.status = 'pass';
          result.rationale = `Target market defined: ${market}`;
        } else {
          Object.assign(result, rejectOrWarn('Market not specified')(filterType));
        }
        break;
      case 'NICHE_OVER_CROWDED':
        // C5: was an unconditional 'pass' ("LLM would assess more accurately") — no
        // signal actually checked. Honest unscored middle, matching the other
        // no-signal-available constraints in this function.
        result.status = 'warning';
        result.rationale = 'Unscored - niche-vs-crowded assessment requires market data not available to this heuristic';
        break;
      case 'MOAT_FIRST':
        // C5: was an unconditional 'pass' — this component does not actually read the
        // moat_architecture synthesis output, so it cannot honestly confirm moat-first
        // design. Downgraded to unscored rather than an assumed pass. Never 'fail' even
        // though this row is hard_reject in the DB -- no signal exists here to reject on.
        result.status = 'warning';
        result.rationale = 'Unscored - moat design is evaluated by a separate synthesis component, not verified here';
        break;
      case 'VALUES_ALIGNMENT': {
        const coreValues = strategicContext?.raw?.mission?.core_values;
        if (Array.isArray(coreValues) && coreValues.length > 0) {
          const matched = coreValues.filter(v => allText.includes(v.toLowerCase()));
          if (matched.length > 0) {
            result.status = 'pass';
            result.rationale = `Aligns with core values: ${matched.join(', ')}`;
          } else {
            Object.assign(result, rejectOrWarn(`No keyword overlap with core values: ${coreValues.join(', ')}`)(filterType));
          }
        } else {
          // C5: was an unconditional 'pass' when no mission core values were loaded.
          result.status = 'warning';
          result.rationale = 'Unscored - no mission core values loaded to check alignment against';
        }
        break;
      }
      // FR-3: previously-uncovered existing constraint keys (no case at all before this SD).
      case 'TWO_YEAR_POSITIONING':
        // advisory by filter_type -- stays informational, never pass/fail, matching its
        // DB-declared intent ("guidance", not a gate).
        result.status = 'warning';
        result.rationale = 'Advisory - 2-year positioning is a directional guide, not a pass/fail signal';
        break;
      case 'PORTFOLIO_INTEGRATION':
        result.status = allText.includes('portfolio') || allText.includes('integrat') ? 'pass' : 'warning';
        result.rationale = result.status === 'pass' ? 'Portfolio integration language detected' : 'Unscored - no portfolio-integration signal in this text';
        break;
      case 'DATA_FLYWHEEL':
      case 'DATA_COLLECTION_BUILT_IN':
        result.status = DATA_FLYWHEEL_RE.test(allText) ? 'pass' : 'warning';
        result.rationale = result.status === 'pass' ? 'Data-flywheel/compounding-data language detected' : 'Unscored - no data-flywheel signal in this text';
        break;
      case 'VIRAL_POTENTIAL':
        result.status = VIRAL_RE.test(allText) ? 'pass' : 'warning';
        result.rationale = result.status === 'pass' ? 'Viral/growth language detected' : 'Unscored - no viral-growth signal in this text';
        break;
      // FR-4: new chairman doctrine dimensions (2026-08-26 Card C).
      case 'AMBITION_AS_MOAT':
        result.status = AMBITION_RE.test(allText) ? 'pass' : 'warning';
        result.rationale = result.status === 'pass' ? 'Ambition/order-of-magnitude language detected (5-10X framing)' : 'Unscored - no ambition/5-10X signal in this text';
        break;
      case 'JAGGED_SPACE_TARGETING':
        result.status = JAGGED_RE.test(allText) ? 'pass' : 'warning';
        result.rationale = result.status === 'pass' ? 'Jagged-frontier/capability-gap language detected' : 'Unscored - no jagged-space signal in this text';
        break;
      case 'EDGE_OF_CAPABILITY_TIMING':
        result.status = EDGE_OF_CAPABILITY_RE.test(allText) ? 'pass' : 'warning';
        result.rationale = result.status === 'pass' ? 'Edge-of-capability/newly-possible language detected' : 'Unscored - no edge-of-capability signal in this text';
        break;
      case 'TECHNOLOGY_CONVERGENCE':
        result.status = CONVERGENCE_RE.test(allText) ? 'pass' : 'warning';
        result.rationale = result.status === 'pass' ? 'Technology-convergence/compounding-trend language detected' : 'Unscored - no convergence signal in this text';
        break;
      default:
        // C5: was an unconditional 'pass' ("Default pass - heuristic check") for any
        // constraint key this switch does not recognize.
        result.status = 'warning';
        result.rationale = 'Unscored - no heuristic defined for this constraint key';
        break;
    }

    return result;
  });
}

// ---------------------------------------------------------------------------
// FR-3 (SD-LEO-INFRA-STAGE-GROUNDING-INJECTOR-001): GOVERNED constraints write
// path — closes the "constraints evolve from kill gates + retrospectives" loop
// (lines 5-6) which was aspirational (this module only READ chairman_constraints).
//
// A kill-gate/retrospective outcome PROPOSES a constraint (staged inert as
// status='pending' in chairman_constraints_proposals). It becomes an ACTIVE
// chairman_constraints row ONLY when a CHAIRMAN RATIFIES it — nothing
// self-writes an active constraint (CONST-002: chairman-authority surface).
// Requires migration 20260716_chairman_constraints_proposals_governed_write_path.sql
// (staged, chairman-gated apply).
// ---------------------------------------------------------------------------

const PROPOSAL_SOURCES = new Set(['kill_gate', 'retrospective', 'manual']);
// chairman_constraints CHECK/NOT NULL contract (verified live): filter_type is NOT NULL and one of these;
// description + filter_logic are NOT NULL; weight is numeric(3,2) (max 9.99). Proposals are normalised to
// these at propose time so a chairman ratification promotes cleanly (security-agent MEDIUM #3).
const VALID_FILTER_TYPES = new Set(['hard_reject', 'score_modifier', 'score_bonus', 'advisory']);
const MAX_CONSTRAINT_WEIGHT = 9.99;

function clampWeight(w) {
  if (w == null) return null;
  const n = Number(w);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(MAX_CONSTRAINT_WEIGHT, n));
}

/**
 * Stage a proposed constraint derived from a kill-gate or retrospective outcome.
 * NEVER writes to chairman_constraints — it only inserts an inert pending
 * proposal that loadConstraints() does not read.
 *
 * @param {Object} supabase
 * @param {Object} params
 * @param {{constraint_key:string,name:string,description?:string,filter_type?:string,filter_logic?:object,weight?:number,priority_order?:number}} params.constraint
 * @param {'kill_gate'|'retrospective'|'manual'} params.source
 * @param {string} [params.sourceRef]  kill-gate id / retrospective id
 * @param {string} [params.rationale]
 * @param {string} [params.proposedBy]
 * @returns {Promise<{proposalId:string}>}
 */
export async function proposeConstraintFromOutcome(supabase, { constraint, source, sourceRef, rationale, proposedBy = 'eva-evolve-loop' } = {}) {
  if (!supabase) throw new Error('proposeConstraintFromOutcome: supabase client required');
  if (!constraint || !constraint.constraint_key || !constraint.name) {
    throw new Error('proposeConstraintFromOutcome: constraint {constraint_key, name} required');
  }
  if (!PROPOSAL_SOURCES.has(source)) {
    throw new Error(`proposeConstraintFromOutcome: source must be one of ${[...PROPOSAL_SOURCES].join('|')}`);
  }
  // Normalise to chairman_constraints' NOT NULL + CHECK contract so a ratification promotes cleanly.
  const filterType = VALID_FILTER_TYPES.has(constraint.filter_type) ? constraint.filter_type : 'advisory';
  const row = {
    constraint_key: constraint.constraint_key,
    name: constraint.name,
    description: constraint.description ?? constraint.name,           // NOT NULL on chairman_constraints
    filter_type: filterType,                                          // NOT NULL + CHECK
    filter_logic: constraint.filter_logic ?? {},                     // NOT NULL (jsonb)
    weight: clampWeight(constraint.weight),                           // numeric(3,2), max 9.99
    priority_order: constraint.priority_order ?? null,
    proposed_source: source,
    source_ref: sourceRef ?? null,
    rationale: rationale ?? null,
    proposed_by: proposedBy,
    status: 'pending',
  };
  const { data, error } = await supabase
    .from('chairman_constraints_proposals')
    .insert(row)
    .select('id')
    .single();
  if (error) throw new Error(`proposeConstraintFromOutcome: insert failed (${error.message})`);
  return { proposalId: data.id };
}

/**
 * Ratify a pending proposal — CHAIRMAN ONLY. Promotes it into chairman_constraints
 * (is_active=true), which loadConstraints() reads on the next run. A constraint is
 * written ONLY when BOTH gates pass: (1) fn_is_chairman() authority check, and
 * (2) the RLS-gated pending->ratified update actually affects a row. A service_role
 * or non-chairman caller is rejected before any active constraint is written.
 *
 * @returns {Promise<{proposalId:string, constraintId:string}>}
 */
export async function ratifyProposedConstraint(supabase, { proposalId, ratifiedBy = null } = {}) {
  if (!supabase) throw new Error('ratifyProposedConstraint: supabase client required');
  if (!proposalId) throw new Error('ratifyProposedConstraint: proposalId required');

  // GATE 1 (authority): only a chairman-authenticated session passes. A service_role
  // client has auth.uid()=null -> fn_is_chairman() false -> rejected here.
  const { data: isChair, error: chairErr } = await supabase.rpc('fn_is_chairman');
  if (chairErr) throw new Error(`ratifyProposedConstraint: authority check failed (${chairErr.message})`);
  if (isChair !== true) throw new Error('ratifyProposedConstraint: only a chairman may ratify a constraint proposal');

  // GATE 2 (RLS-gated state transition): the ccp_update_chairman policy independently
  // requires fn_is_chairman(); 0 rows => not permitted or not pending => abort BEFORE
  // writing any active constraint.
  const { data: prop, error: updErr } = await supabase
    .from('chairman_constraints_proposals')
    .update({ status: 'ratified', ratified_by: ratifiedBy, ratified_at: new Date().toISOString() })
    .eq('id', proposalId)
    .eq('status', 'pending')
    .select('*')
    .single();
  if (updErr || !prop) {
    throw new Error(`ratifyProposedConstraint: proposal not ratifiable (not chairman, not pending, or missing)${updErr ? ' — ' + updErr.message : ''}`);
  }

  // Promote into chairman_constraints — read by loadConstraints() on the next run.
  const { data: created, error: insErr } = await supabase
    .from('chairman_constraints')
    .insert({
      constraint_key: prop.constraint_key,
      name: prop.name,
      description: prop.description ?? prop.name,                                 // NOT NULL
      filter_type: VALID_FILTER_TYPES.has(prop.filter_type) ? prop.filter_type : 'advisory', // NOT NULL + CHECK
      filter_logic: prop.filter_logic ?? {},                                     // NOT NULL
      weight: clampWeight(prop.weight),                                          // numeric(3,2)
      priority_order: prop.priority_order,
      is_active: true,
      // source must satisfy chairman_constraints_source_check; proposed_source is one of
      // kill_gate|retrospective|manual, all of which are valid source values.
      source: prop.proposed_source,
      source_ref: prop.id,
    })
    .select('id')
    .single();
  if (insErr) throw new Error(`ratifyProposedConstraint: constraint promotion failed (${insErr.message})`);

  // Back-link the created constraint on the proposal (best-effort audit trail).
  await supabase.from('chairman_constraints_proposals').update({ ratified_constraint_id: created.id }).eq('id', prop.id);

  return { proposalId: prop.id, constraintId: created.id };
}

export { DEFAULT_CONSTRAINTS };
