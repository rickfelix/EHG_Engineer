/**
 * Orphan-writers registry (SD-LEO-INFRA-ORPHAN-WRITERS-REGISTRY-001).
 *
 * Pairs each durable writer this registry knows about with its intended reader and a
 * predicate proving the reader actually consumes something. Six entry types, matching
 * the chairman-ratified Triangulation Audit Cycle-2 taxonomy (three-at-birth per Solomon
 * STEP-0, three absorbed post-birth per QF-20260830-875):
 *   - wired-but-blind:        a reader exists but cannot see the writes.
 *   - no-stamper-wired:       a self_stamped liveness row whose process runs but never stamps.
 *   - shipped-but-not-applied: an artifact shipped to main whose effect is not yet live.
 *   - test-pins-the-defect:   a green test asserts behavior derived from a misunderstanding of
 *                             what it's testing, so the test itself protects the bug instead of
 *                             catching it (QF-20260830-875).
 *   - query-never-ran:        a query errors (e.g. an unknown column) and the error is unprinted;
 *                             a null/undefined result is coerced into a confident answer instead
 *                             of surfacing as unavailable (QF-20260830-875).
 *   - reader-with-no-writer:  the inverse of the registry's own name — a reader is wired and
 *                             consuming, but nothing has ever produced what it reads. Represented
 *                             with writer:{kind:'absent', description} (no schema change needed —
 *                             validateOrphanEntry only checks writer PRESENCE, not shape).
 *
 * This registry does NOT duplicate lib/governance/gauge-registry.js's DRAIN_DESCRIPTORS —
 * where a specimen is already represented there (proven reader/predicate/closingPath for
 * detector-output rows), this registry references it by id instead of re-declaring it
 * (VALIDATION sub-agent finding: two representations of one fact disagree eventually).
 */

import { DRAIN_DESCRIPTORS } from './gauge-registry.js';

/**
 * @typedef {'wired-but-blind'|'no-stamper-wired'|'shipped-but-not-applied'|'test-pins-the-defect'|'query-never-ran'|'reader-with-no-writer'} EntryType
 */

/**
 * The complete, ratified entry_type vocabulary. QF-20260830-875 finding: entry_type was only
 * truthiness-checked (`if (!entry.entry_type)`), never validated against the typedef, so the
 * registry's own completeness claim was a JSDoc comment, not an enforced invariant — a bogus
 * type string would pass silently.
 */
export const ENTRY_TYPES = Object.freeze([
  'wired-but-blind',
  'no-stamper-wired',
  'shipped-but-not-applied',
  'test-pins-the-defect',
  'query-never-ran',
  'reader-with-no-writer',
]);

/**
 * Structural (zero-IO) validity of one entry: does it declare a reader and a predicate?
 * A `refs_drain_descriptor` entry inherits validity from the referenced DRAIN_DESCRIPTORS
 * key instead of declaring its own reader/predicate (FR-6: no duplicate representation).
 *
 * @param {object} entry
 * @returns {{valid: boolean, reason?: string}}
 */
export function validateOrphanEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return { valid: false, reason: 'entry is not an object' };
  }
  if (!entry.id || typeof entry.id !== 'string') {
    return { valid: false, reason: 'missing id' };
  }
  if (!entry.entry_type) {
    return { valid: false, reason: 'missing entry_type' };
  }
  if (!ENTRY_TYPES.includes(entry.entry_type)) {
    return { valid: false, reason: `unknown entry_type "${entry.entry_type}" — not in ENTRY_TYPES` };
  }
  if (entry.refs_drain_descriptor) {
    const descriptor = DRAIN_DESCRIPTORS[entry.refs_drain_descriptor];
    if (!descriptor) {
      return { valid: false, reason: `refs_drain_descriptor "${entry.refs_drain_descriptor}" not found in DRAIN_DESCRIPTORS` };
    }
    // VALIDATION sub-agent finding V-1 (PLAN_VERIFICATION): a matching KEY is not the same
    // as a RESOLVED reader — DRAIN_DESCRIPTORS itself documents plenty of entries with no
    // `consumer` (that IS their finding). Referencing an unresolved descriptor must be an
    // explicit, honest `known_orphan: true` acknowledgment, not silent structural "valid".
    if (!descriptor.consumer && !entry.known_orphan) {
      return { valid: false, reason: `refs_drain_descriptor "${entry.refs_drain_descriptor}" has no consumer declared — mark this entry known_orphan:true to acknowledge it as a still-open orphan, or point at a resolved descriptor` };
    }
    return { valid: true };
  }
  if (!entry.writer) {
    return { valid: false, reason: 'missing writer' };
  }
  if (!entry.reader) {
    return { valid: false, reason: 'missing reader (no acting reader declared)' };
  }
  if (!entry.predicate || !entry.predicate.description) {
    return { valid: false, reason: 'missing predicate (no consumption predicate declared)' };
  }
  return { valid: true };
}

/**
 * @param {object[]} entries
 * @returns {{valid: boolean, invalidEntries: {id: string|undefined, reason: string}[]}}
 */
export function validateAllEntries(entries) {
  const invalidEntries = [];
  for (const entry of entries) {
    const result = validateOrphanEntry(entry);
    if (!result.valid) {
      invalidEntries.push({ id: entry?.id, reason: result.reason });
    }
  }
  return { valid: invalidEntries.length === 0, invalidEntries };
}

/**
 * The real baseline, seeded 2026-08-30 per VALIDATION sub-agent measurement (LEAD-TO-PLAN,
 * SD-LEO-INFRA-ORPHAN-WRITERS-REGISTRY-001). One real specimen per entry type minimum.
 */
export const ORPHAN_ENTRIES = Object.freeze([
  // --- wired-but-blind: reader exists, cannot see the writes ---
  Object.freeze({
    id: 'semantic-indexer',
    entry_type: 'wired-but-blind',
    writer: { kind: 'table', table: 'codebase_semantic_index' },
    reader: { file: 'scripts/semantic-indexer.js', description: 'The semantic indexer process reads/writes codebase_semantic_index directly — wired to the table, but has no verified consumption predicate distinguishing "indexed" from "stale/never re-indexed" content.' },
    predicate: { description: 'MANUAL_CHECK_REQUIRED: no automated evaluator yet exists for codebase_semantic_index staleness; a future SD should add one (compare source file mtime vs indexed_at) rather than this SD guessing at the query.' },
    evidence: 'VALIDATION sub-agent, LEAD-TO-PLAN, SD-LEO-INFRA-ORPHAN-WRITERS-REGISTRY-001, 2026-08-30, corrected by TESTING sub-agent EXEC-TO-PLAN finding (original reader path lib/semantic-index did not exist; real writer/reader is scripts/semantic-indexer.js against codebase_semantic_index).',
  }),
  // --- no-stamper-wired: process runs, self_stamped liveness row never advances ---
  ...['advisory-drain', 'capture-gate', 'drive-report-consume', 'idle-qf-hint', 'shared-root-freshness', 'silent-holder-audit', 'unrouted-branches'].map((slug) =>
    Object.freeze({
      id: `standard-loop-${slug}`,
      entry_type: 'no-stamper-wired',
      writer: { kind: 'table', table: 'periodic_process_registry', process_key: `standard_loop:${slug}` },
      reader: { file: 'scripts/periodic-liveness-watcher.mjs', description: 'The periodic-liveness watcher evaluates last_fired_at against expected_interval_seconds — but this process never calls stampLastFired, so the watcher can only ever see it as unfired.' },
      predicate: {
        description: 'periodic_process_registry row for this process_key has liveness_source=\'self_stamped\', currently_expected_active=true, and last_fired_at IS NULL despite the process demonstrably running on its normal cadence.',
      },
      evidence: `VALIDATION sub-agent, LEAD-TO-PLAN, 2026-08-30: standard_loop:${slug} verified last_fired_at=NULL, liveness_source='self_stamped', currently_expected_active=true — genuinely orphaned, not a false positive.`,
    })
  ),
  // --- shipped-but-not-applied: artifact on main, effect not live ---
  Object.freeze({
    id: 'competitive-observed-tag-migration',
    entry_type: 'shipped-but-not-applied',
    writer: { kind: 'artifact', description: 'database/migrations/*competitive_observed_tag* (SD-LEO-INFRA-COMPETITIVE-OBSERVED-TAG-MIGRATION-001), merged to main 2026-06-24' },
    reader: { file: 'scripts/orphan-writers-count.mjs', description: 'A boolean applied-check run by the triage pass — no live consumer exists until the DDL lands, by definition.' },
    predicate: { description: 'The migration\'s DDL effect (the described column/index/table) is present when queried live, checked via information_schema — a one-time boolean latch, not a repeatable emptiness read.', latch: true },
    evidence: 'VALIDATION sub-agent, LEAD-TO-PLAN, 2026-08-30: migration merged 2026-06-24, DDL not applied until 2026-08-30T17:47Z — a 67-day gap between shipped and live.',
  }),
  // --- FR-6: reference, do not duplicate, the existing feedback-sla-breach DRAIN_DESCRIPTORS entry ---
  Object.freeze({
    id: 'feedback-sla-categories',
    entry_type: 'wired-but-blind',
    refs_drain_descriptor: 'feedback-sla-breach',
    known_orphan: true,
    evidence: 'VALIDATION sub-agent, PLAN_VERIFICATION, 2026-08-30 (correcting an earlier LEAD-TO-PLAN VALIDATION pass): DRAIN_DESCRIPTORS[\'feedback-sla-breach\'] itself declares no `consumer` (classifyStructural returns NO_CONSUMER, confirmed live by scripts/orphan-writers-count.mjs) — the SD\'s originally-cited "four feedback categories, no consumer" specimen IS a genuine, still-open orphan under this key, not a resolved one. Referenced by id rather than re-declared (FR-6), and explicitly marked known_orphan so referencing an unresolved descriptor cannot silently read as "valid=complete".',
  }),
  // --- test-pins-the-defect: a green test protects the bug instead of catching it ---
  Object.freeze({
    id: 'panel-arithmetic-unverified-conflation',
    entry_type: 'test-pins-the-defect',
    writer: { kind: 'test', file: 'tests/unit/periodic-liveness/panel-arithmetic-beside-last-state.test.js', description: 'The original (pre-review) version of this test paired a NEVER-STAMPED row with last_state=UNVERIFIED and asserted the arithmetic-vs-last_state disagreement marker should render.' },
    reader: { kind: 'ci-review', description: 'CI and reviewers consume a green test suite as ground truth that the panel logic distinguishes agreement from disagreement correctly.' },
    predicate: { description: 'UNVERIFIED is itself an alarm state, so a NEVER-STAMPED row with last_state=UNVERIFIED is AGREEMENT between the two instruments, not disagreement. The original test conflated two separate signals (never-stamped rendering vs the disagreement marker) and asserted the wrong one — a green result that protected the misunderstanding rather than exposing it. Fixed in the same PR by splitting the conflated assertion into two tests.' },
    evidence: 'PR #7799 (QF-20260830-920) commit message: "Also fixes a test that PINNED THE BUG: it paired NEVER-STAMPED with last_state=\'UNVERIFIED\' and asserted the disagreement marker. Split into the two things it conflated." The corrective comment is preserved in the current test file (tests/unit/periodic-liveness/panel-arithmetic-beside-last-state.test.js) documenting the original defect.',
  }),
  // --- query-never-ran: an erroring query is silently coerced into a confident wrong answer ---
  Object.freeze({
    id: 'sub-agent-results-status-column-error-swallowed',
    entry_type: 'query-never-ran',
    writer: { kind: 'query', description: 'A sub_agent_execution_results SELECT naming a column ("status") that does not exist on the table.' },
    reader: { kind: 'evaluator', description: 'Downstream logic reading the query result to compute a count or verdict from sub_agent_execution_results rows.' },
    predicate: { description: 'The unknown-column error was not printed/surfaced, and the resulting null/undefined was coerced into a confident zero count instead of being treated as unavailable — observed 2026-08-30T18:27Z, traced and retracted 2026-08-30T18:34Z once the query error was found.' },
    evidence: 'Coordinator/Adam-relayed incident record, tonight 18:27Z-18:34Z (recorded in QF-20260830-875\'s own description as the reader-side twin of test-pins-the-defect). No committed file reference is available for this specimen -- the originating query was in an ephemeral verification script, not a tracked file; represented here from the incident record rather than a fabricated location.',
  }),
  // --- reader-with-no-writer: reader wired and consuming, nothing ever produced it ---
  Object.freeze({
    id: 'seat-busy-fence-pre-454',
    entry_type: 'reader-with-no-writer',
    writer: { kind: 'absent', description: 'PAYLOAD_KINDS.SEAT_BUSY_RESERVATION was defined and drained, but had ZERO producers anywhere in the codebase from its introduction until QF-20260830-454.' },
    reader: { file: 'lib/checkin/steps/seat-busy-fence.cjs', description: 'Drains session_coordination rows for payload.kind=seat_busy_reservation to suppress self-claim on a busy seat. Fully wired and correctly reads the kind it is given.' },
    predicate: { description: 'session_coordination has zero rows with payload.kind=seat_busy_reservation despite the reader being live and polling for them -- resolved once lib/coordinator/dispatch.cjs stampSeatBusyReservation began writing them.' },
    evidence: 'Coordinator directive f01c251f (Adam-ratified 20:31Z), specimen found by Charlie, verified live 2026-08-30 by grep: pre-fix, zero writers of the payload kind existed; post-fix (QF-20260830-454, merged 98e9dafb31d), lib/coordinator/dispatch.cjs is the sole writer. Now RESOLVED, retained here as the taxonomy\'s proof specimen that reader-with-no-writer is representable without a schema change.',
  }),
  // --- QF-20260831-821 seed: SMS delivery-status strip-the-column bridge ---
  Object.freeze({
    id: 'sms-delivery-status-source-strip',
    entry_type: 'wired-but-blind',
    writer: { kind: 'column', table: 'sms_outbound_obligations', column: 'delivery_status_source' },
    reader: { file: 'lib/sms/owed-delivery-truth.js:108', description: 'owed-delivery-truth.js degrades on read when the column is absent; sms-outbound-worker.js:578 strips it on write. The migration that would land the column (SD-LEO-INFRA-SMS-DELIVERY-STATUS-001 FR-3/FR-4) never shipped, so chairman-SMS delivery provenance runs on the fallback path permanently.' },
    predicate: { description: 'sms_outbound_obligations.delivery_status_source does not exist (information_schema); both the writer and the reader silently work around its absence instead of surfacing it.' },
    evidence: 'Solomon STRIP-THE-COLUMN CENSUS (session_coordination id 6d1624eb-9561-4047-9adf-940eb029eea6, 2026-08-31 16:29Z, existence probed per column, 42703/PGRST204 discriminated): "the most consequential of the four given the comms lane it serves." Sourced from chairman-ratified obligation 2ab4b4bc (QF-20260831-821).',
  }),
  // --- FR-5: self-registration, so this registry cannot become the fourth orphan specimen ---
  Object.freeze({
    id: 'orphan-writers-triage-pass',
    entry_type: 'no-stamper-wired',
    writer: { kind: 'process', process_key: 'standard_loop:orphan-writers-triage' },
    reader: { file: 'Chairman weekly triage line', description: 'The chairman\'s weekly review consumes scripts/orphan-writers-count.mjs output as the known-orphan-count gauge.' },
    predicate: { description: 'periodic_process_registry row for standard_loop:orphan-writers-triage has a recent last_fired_at, stamped by the triage pass itself on each run.' },
    evidence: 'FR-5: the registry\'s own execution is registered and stamped so it cannot silently become the fourth orphan-write specimen.',
  }),
]);
