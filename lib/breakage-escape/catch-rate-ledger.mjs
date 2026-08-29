/**
 * SD-LEO-INFRA-BREAKAGE-ESCAPE-INSTRUMENT-001 (FR-1, FR-2, FR-3)
 *
 * Vocabulary census (FR-1): the ledger classifies defects already recorded by EXISTING
 * pipelines -- it never invents a parallel intake. Four source types, each with a
 * pre-verified predicate (see this SD's metadata.mechanism_verifications):
 *
 *   - sub_agent_execution_results.verdict IN ('BLOCKED','CONDITIONAL_PASS') -> caught (a gate)
 *   - root_cause_reports.trigger_source IN ('QUALITY_GATE','CI_PIPELINE','SUB_AGENT',
 *     'TEST_FAILURE','HANDOFF_REJECTION') -> caught; IN ('RUNTIME','MANUAL') -> escaped
 *     (rca_learning_records was considered but has only 1 live row -- too sparse to be a
 *     primary source; root_cause_reports.trigger_source alone is sufficient and simpler)
 *   - quick_fixes.found_during IN ('uat','manual-testing','code-review') -> caught
 *   - feedback.category === 'ci_failure' -> caught
 *
 * A row that doesn't match any known predicate classifies 'unclassified' and is EXCLUDED
 * from the rate rather than guessed -- ambiguity is reported, never silently resolved.
 */

const CAUGHT_VERDICTS = new Set(['BLOCKED', 'CONDITIONAL_PASS']);
const CAUGHT_TRIGGER_SOURCES = new Set(['QUALITY_GATE', 'CI_PIPELINE', 'SUB_AGENT', 'TEST_FAILURE', 'HANDOFF_REJECTION']);
const ESCAPED_TRIGGER_SOURCES = new Set(['RUNTIME', 'MANUAL']);
const CAUGHT_FOUND_DURING = new Set(['uat', 'manual-testing', 'code-review']);

/**
 * @param {object} row - a raw row from one of the 4 source tables
 * @param {'sub_agent_execution_results'|'root_cause_reports'|'quick_fixes'|'feedback'} sourceType
 * @returns {{classification: 'caught_pre_ship'|'escaped_post_ship'|'unclassified', caught_stage_or_discovery: string|null, source_record_id: string}}
 */
export function classifyDefectRow(row, sourceType) {
  const source_record_id = row?.id ?? null;

  switch (sourceType) {
    case 'sub_agent_execution_results': {
      if (CAUGHT_VERDICTS.has(row?.verdict)) {
        return { classification: 'caught_pre_ship', caught_stage_or_discovery: `${row.phase ?? 'unknown_phase'}:${row.sub_agent_code ?? row.code ?? 'unknown_agent'}`, source_record_id };
      }
      return { classification: 'unclassified', caught_stage_or_discovery: null, source_record_id };
    }
    case 'root_cause_reports': {
      if (CAUGHT_TRIGGER_SOURCES.has(row?.trigger_source)) {
        return { classification: 'caught_pre_ship', caught_stage_or_discovery: row.trigger_source, source_record_id };
      }
      if (ESCAPED_TRIGGER_SOURCES.has(row?.trigger_source)) {
        return { classification: 'escaped_post_ship', caught_stage_or_discovery: row.trigger_source, source_record_id };
      }
      return { classification: 'unclassified', caught_stage_or_discovery: null, source_record_id };
    }
    case 'quick_fixes': {
      if (CAUGHT_FOUND_DURING.has(row?.found_during)) {
        return { classification: 'caught_pre_ship', caught_stage_or_discovery: row.found_during, source_record_id };
      }
      return { classification: 'unclassified', caught_stage_or_discovery: null, source_record_id };
    }
    case 'feedback': {
      if (row?.category === 'ci_failure') {
        return { classification: 'caught_pre_ship', caught_stage_or_discovery: 'ci_failure', source_record_id };
      }
      return { classification: 'unclassified', caught_stage_or_discovery: null, source_record_id };
    }
    default:
      return { classification: 'unclassified', caught_stage_or_discovery: null, source_record_id };
  }
}

/**
 * FR-3: windowed catch-rate with a two-sided vacuity clause. A non-empty window that
 * yields zero classified (caught+escaped) rows is a computation FAILURE, not a 100% rate --
 * throws rather than silently reporting an honest-looking but meaningless number.
 *
 * @param {object} args
 * @param {Array<{classification: string}>} args.classifiedRows - already-classified rows (classifyDefectRow output)
 * @param {string} args.windowStart - ISO timestamp
 * @param {string} args.windowEnd - ISO timestamp
 * @returns {{caught: number, escaped: number, unclassified: number, total: number, catch_rate: number, numerator_extent: string, denominator_extent: string, window: {start: string, end: string}}}
 */
export function computeCatchRate({ classifiedRows, windowStart, windowEnd }) {
  const caught = classifiedRows.filter((r) => r.classification === 'caught_pre_ship').length;
  const escaped = classifiedRows.filter((r) => r.classification === 'escaped_post_ship').length;
  const unclassified = classifiedRows.filter((r) => r.classification === 'unclassified').length;
  const total = caught + escaped;

  if (total === 0) {
    throw new Error(
      `VACUITY: window ${windowStart} -> ${windowEnd} yielded 0 classified (caught+escaped) rows ` +
      `(${unclassified} unclassified excluded). Refusing to report a rate for an empty numerator+denominator -- ` +
      `check the query, not silently report 100%.`
    );
  }

  return {
    caught,
    escaped,
    unclassified,
    total,
    catch_rate: Math.round((caught / total) * 10000) / 100,
    numerator_extent: 'caught_pre_ship rows (gate/RCA/QF/feedback pre-ship predicates)',
    denominator_extent: 'caught_pre_ship + escaped_post_ship rows (unclassified excluded from both)',
    window: { start: windowStart, end: windowEnd },
  };
}
