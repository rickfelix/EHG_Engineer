/**
 * Board-result projection (SD-LEO-INFRA-ACTIVATE-COMPETITIVE-INTELLIGENCE-001 / FR-2).
 *
 * Pure mapper that projects the return of `runDifferentiationBoard` (the producer)
 * into the exact `ExtendedStageZeroResult` shape the ehg Stage-0 UI consumes from
 * `stage_zero_requests.result`. The producer and consumer use DIFFERENT field names
 * and value vocabularies, so this mapper is the single bridge between them — keeping
 * the contract in one tested place instead of scattering ad-hoc field access across
 * the worker (the "half-fix" risk: copying the raw board return would leave the UI
 * reading `undefined` for verdict/score).
 *
 * Producer (runDifferentiationBoard return, lib/competitive-intelligence/differentiation-board.js):
 *   { gate: { seedable:boolean, delta:number, threshold:number, reason:string },
 *     strategy: { angle:string, unique_advantages:string[], ... },
 *     sanitization_status: 'passed' | 'flagged' | 'pending' }
 *
 * Consumer (ehg competitorClone.ts ExtendedStageZeroResult):
 *   { differentiation_strategy?: string,
 *     delta_gate?: { verdict?: 'seedable'|'me_too', score?: number, threshold?: number, reason?: string },
 *     sanitization_status?: 'passed' | 'pending' | 'failed' }
 *
 * Mapping (see PRD FR-2 contract_mappings):
 *   - delta_gate.verdict  = gate.seedable ? 'seedable' : 'me_too'
 *   - delta_gate.score    = gate.delta            (the authoritative gate delta, NOT the bare column)
 *   - delta_gate.threshold/reason pass through
 *   - differentiation_strategy = String(strategy.angle)   (object -> string projection)
 *   - sanitization_status: 'flagged' -> 'failed' (UI union has no 'flagged'); 'passed'/'pending' pass through
 */

/**
 * @param {object|null|undefined} board - the return value of runDifferentiationBoard
 * @returns {{differentiation_strategy: string, delta_gate: {verdict: ('seedable'|'me_too'), score: number, threshold: number, reason: string}, sanitization_status: ('passed'|'pending'|'failed'|undefined)}|null}
 *   the ExtendedStageZeroResult-shaped projection, or null when there is no board output to project.
 */
export function projectBoardResultToStageZero(board) {
  if (!board || typeof board !== 'object') return null;

  const gate = board.gate && typeof board.gate === 'object' ? board.gate : {};
  // strategy is the sanitized strategy object; project its `angle` to the UI's string field.
  const strategy = board.strategy;
  const angle =
    strategy && typeof strategy === 'object' ? strategy.angle : strategy;

  return {
    differentiation_strategy: angle != null ? String(angle) : '',
    delta_gate: {
      verdict: gate.seedable ? 'seedable' : 'me_too',
      score: gate.delta,
      threshold: gate.threshold,
      reason: gate.reason,
    },
    sanitization_status: mapSanitizationStatus(board.sanitization_status),
    // SD-LEO-INFRA-SURFACE-DIFFERENTIATION-BOARD-001 (FR-1): surface the board's concrete
    // unique_advantages as the UI's opportunity cards (result.differentiation_opportunities).
    // Empty array when the board produced none -> the consumer's `opportunities.length > 0`
    // guard keeps the section hidden (graceful).
    differentiation_opportunities: mapUniqueAdvantagesToOpportunities(strategy),
  };
}

/**
 * Map the board strategy's `unique_advantages` (string[]) into the ehg UI's
 * `differentiation_opportunities` shape ([{ opportunity_name }]). Pure.
 * The new teardown+board flow does not produce the legacy DifferentiationOpportunity
 * sub-fields (category / customer_pains_addressed), so only opportunity_name is mapped.
 *
 * @param {object|string|undefined} strategy - the board return's `strategy` (sanitized) object
 * @returns {Array<{opportunity_name: string}>} one entry per non-empty unique advantage
 */
export function mapUniqueAdvantagesToOpportunities(strategy) {
  const advantages =
    strategy && typeof strategy === 'object' && Array.isArray(strategy.unique_advantages)
      ? strategy.unique_advantages
      : [];
  return advantages
    .filter((a) => a != null && String(a).trim() !== '')
    .map((a) => ({ opportunity_name: String(a) }));
}

/**
 * Map the producer sanitization status vocabulary to the UI vocabulary.
 * Producer: 'passed' | 'flagged' | 'pending'. UI: 'passed' | 'pending' | 'failed'.
 * Only 'flagged' differs — it maps to 'failed' (a residual competitor reference is a
 * hard stop the UI surfaces as a failed sanitization). Other values pass through.
 *
 * @param {string|undefined} status
 * @returns {('passed'|'pending'|'failed'|undefined)}
 */
export function mapSanitizationStatus(status) {
  if (status === 'flagged') return 'failed';
  return status;
}
