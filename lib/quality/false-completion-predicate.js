/**
 * Class-detection predicate for the "false completion" defect class
 * (SD-LEO-INFRA-COMPLETION-INTEGRITY-REPAIR-001).
 *
 * The SD's own literal success-criterion wording -- status='completed' AND
 * (progress=0 OR completion_date IS NULL) -- was measured against the FULL live
 * population (4633 completed SDs, paginated, not a capped page) and found badly
 * miscalibrated: progress=0 is true for 76.5% of ALL completed SDs (including
 * verified-genuine completions, e.g. SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-C/-D),
 * and completion_date IS NULL is true for 12.4% -- both far too noisy (or, for
 * completion_date, simply not co-extensive) to be real anomaly signals on their own.
 *
 * The validated signal is current_phase != 'COMPLETED' (1.7%, 78/4633 rows in the
 * same full-population measurement). It is NOT a strict subset of the null-
 * completion-date set -- 39 of those 78 rows have a non-null completion_date (an
 * earlier draft of this module claimed strict-subset based on a 1000-row sample,
 * which happened to equal PostgREST's default page cap; re-measuring the full
 * population overturned that specific claim, though not the underlying
 * conclusion). An SD marked 'completed' whose phase tracker never actually
 * reached COMPLETED is the genuine false-completion shape, independent of
 * whether completion_date happens to be null.
 */
export function isFalseCompletion(sd) {
  return sd.status === 'completed' && sd.current_phase !== 'COMPLETED';
}
