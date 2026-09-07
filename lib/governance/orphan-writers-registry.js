/**
 * Orphan-writers registry (SD-LEO-INFRA-ORPHAN-WRITERS-REGISTRY-001).
 *
 * Pairs each durable writer this registry knows about with its intended reader and a
 * predicate proving the reader actually consumes something. Eleven entry types, matching
 * the chairman-ratified Triangulation Audit Cycle-2 taxonomy (three-at-birth per Solomon
 * STEP-0, three absorbed post-birth per QF-20260830-875, one absorbed post-birth per
 * QF-20260831-313 — the seat-population axis, root-caused from the oversight ring auditing
 * did-the-layer-below-ACT at every layer while nothing audited the denominator; two absorbed
 * post-birth per QF-20260904-116 (Solomon ruling 18f04802) and two more per the BOUND
 * 2026-09-05 addition (Solomon deep-sweep finding 84677786 item 2)):
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
 *   - seat-population-orphan: a registered fleet seat that appears in ZERO oversight gauge
 *                             populations — dormant capacity, not ticking and not dead-and-reaped,
 *                             invisible to every gauge because none ever iterates it. See
 *                             computeSeatPopulationRows/buildSeatOrphanEntries/seatDenominatorCheck
 *                             below (QF-20260831-313).
 *   - writer-with-no-reader:  the mirror of reader-with-no-writer — a writer produces a value
 *                             (a row, a log line, a held-in-memory field) but no reader ever
 *                             consumes it: zero promoters, a swallowed warning, a discarded
 *                             error. Represented with reader:{kind:'none', description}
 *                             (QF-20260904-116, Solomon ruling 18f04802 item 2).
 *   - reads-before-the-writer: a guard evaluates a source the writer has not yet written —
 *                             the read happens, but against a placeholder/default the real
 *                             writer will only populate later, so the guard is structurally
 *                             blind at the moment it fires (QF-20260904-116, Solomon ruling
 *                             18f04802 item 1 — this is the mechanism the QF's source material
 *                             originally called a "sub_class" of wired-but-blind; Solomon ruled
 *                             it is instead its own entry_type, since it is a distinct
 *                             mechanism, not a variant of an existing one).
 *   - detector-with-no-sink:  a detector prints/computes a finding but persists it to no row,
 *                             file, or seat — the finding reaches no reader because it was
 *                             never durably written in the first place (BOUND 2026-09-05,
 *                             Solomon deep-sweep finding 84677786 item 2).
 *   - reads-but-never-compares: a value is read and returned, but the caller never compares it
 *                             to its expected form — the read is present, the predicate that
 *                             would make it meaningful is absent (BOUND 2026-09-05, Solomon
 *                             deep-sweep finding 84677786 item 2).
 *
 * This registry does NOT duplicate lib/governance/gauge-registry.js's DRAIN_DESCRIPTORS —
 * where a specimen is already represented there (proven reader/predicate/closingPath for
 * detector-output rows), this registry references it by id instead of re-declaring it
 * (VALIDATION sub-agent finding: two representations of one fact disagree eventually).
 */

import { DRAIN_DESCRIPTORS } from './gauge-registry.js';

/**
 * @typedef {'wired-but-blind'|'no-stamper-wired'|'shipped-but-not-applied'|'test-pins-the-defect'|'query-never-ran'|'reader-with-no-writer'|'seat-population-orphan'|'writer-with-no-reader'|'reads-before-the-writer'|'detector-with-no-sink'|'reads-but-never-compares'} EntryType
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
  'seat-population-orphan',
  'writer-with-no-reader',
  'reads-before-the-writer',
  'detector-with-no-sink',
  'reads-but-never-compares',
]);

/**
 * DERIVED (not stored) coarse reader-presence classification for one entry — Solomon ruling
 * 18f04802 item 3: "entry_type in {writer-with-no-reader, seat-population-orphan} yields
 * reader:NONE, everything else wired-but-blind". Exported so the weekly count script and the
 * retire-check read the SAME function instead of two independently-drifting copies of this
 * two-bucket rule.
 *
 * @param {{entry_type: string}} entry
 * @returns {'reader:NONE'|'wired-but-blind'}
 */
export function getReaderClassification(entry) {
  const NO_READER_TYPES = new Set(['writer-with-no-reader', 'seat-population-orphan']);
  return NO_READER_TYPES.has(entry?.entry_type) ? 'reader:NONE' : 'wired-but-blind';
}

/**
 * Seat-population axis — QF-20260831-313 (Solomon root-cause input 3792b3ec, chairman
 * ratification f48e0abf). The oversight ring audited did-the-layer-below-ACT at every layer
 * while nothing audited the DENOMINATOR: the full registered-seat population. A dormant seat
 * is a third state distinct from "ticking" and "dead-and-reaped" — it holds no claim, fires no
 * heartbeat-driven work, and is invisible to any gauge whose population it never enters.
 *
 * One row per registered seat, naming which gauge populations iterate it (or 'NONE').
 * @param {string[]} seats - registered fleet seat ids
 * @param {Array<{name: string, seatIds: Set<string>}>} gaugePopulations - each oversight
 *   gauge's iterated seat population
 * @returns {Array<{seat_id: string, reader: string[]|'NONE', orphan: boolean}>}
 */
export function computeSeatPopulationRows(seats, gaugePopulations) {
  return (seats || []).map((seatId) => {
    const coveringGauges = (gaugePopulations || [])
      .filter((g) => g?.seatIds?.has(seatId))
      .map((g) => g.name);
    return { seat_id: seatId, reader: coveringGauges.length ? coveringGauges : 'NONE', orphan: coveringGauges.length === 0 };
  });
}

/**
 * Orphan-capacity rows, registry-shaped (validateOrphanEntry-compatible) so they slot directly
 * into the same KNOWN-ORPHAN COUNT the chairman reads weekly, alongside ORPHAN_ENTRIES.
 * @param {ReturnType<typeof computeSeatPopulationRows>} seatRows
 * @returns {object[]}
 */
export function buildSeatOrphanEntries(seatRows) {
  return (seatRows || []).filter((r) => r.orphan).map((r) => Object.freeze({
    id: `seat-population:${r.seat_id}`,
    entry_type: 'seat-population-orphan',
    writer: { kind: 'seat', seat_id: r.seat_id },
    reader: { kind: 'none', description: 'No registered oversight gauge population iterates this seat.' },
    predicate: { description: `Seat "${r.seat_id}" appears in zero gauge populations — dormant capacity invisible to every oversight gauge (denominator check).` },
    known_orphan: true,
  }));
}

/**
 * The denominator check (Solomon daily audit, from 09-01): enumerate the full registered-seat
 * population and diff against each gauge's iterated population. Any uncovered seat is a finding.
 * @param {string[]} seats
 * @param {Array<{name: string, seatIds: Set<string>}>} gaugePopulations
 * @returns {{totalSeats: number, orphanCount: number, orphanSeatIds: string[]}}
 */
export function seatDenominatorCheck(seats, gaugePopulations) {
  const rows = computeSeatPopulationRows(seats, gaugePopulations);
  const orphanSeatIds = rows.filter((r) => r.orphan).map((r) => r.seat_id);
  return { totalSeats: rows.length, orphanCount: orphanSeatIds.length, orphanSeatIds };
}

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
  // Reclassified wired-but-blind -> writer-with-no-reader per QF-20260904-116 (Solomon ruling
  // 18f04802 item 2): DRAIN_DESCRIPTORS['feedback-sla-breach'] has a writer but declares no
  // `consumer` -- that IS writer-with-no-reader's definition, not wired-but-blind's (which
  // presumes a reader that merely cannot see the writes). Baseline count is unaffected -- this
  // changes an existing entry's type, it does not add a row.
  Object.freeze({
    id: 'feedback-sla-categories',
    entry_type: 'writer-with-no-reader',
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
  // --- SD-LEO-INFRA-COMPLETION-GATE-DATA-001-B FR-1: context_usage_log LEO-phase tagging ---
  // probe-follows-pattern precedent: scripts/solomon-advisory.cjs's captureLedgerRow write-path
  // strip + checkLedgerCaptureHealth independent existence-probe + ledgerCaptureFailures counter.
  Object.freeze({
    id: 'context-usage-log-leo-phase-tagging-migration',
    entry_type: 'shipped-but-not-applied',
    writer: { kind: 'artifact', description: 'database/migrations/20260829_context_usage_loop_name.sql (loop_name) + 20260831_context_usage_leo_phase_tagging.sql (sd_key, leo_phase), both merged to main 2026-08-31, neither chairman-gated.' },
    reader: { file: 'scripts/orphan-writers-count.mjs', description: 'The boolean applied-check run by the triage pass -- no live consumer exists until both migrations\' DDL lands.' },
    predicate: { description: 'ALL THREE columns (loop_name, sd_key, leo_phase) must be present on context_usage_log -- ANY-semantics would latch PASS on a half-applied pair (the two migrations can land independently) and hide the exact false-resolution this latch exists to prevent.', latch: true },
    evidence: 'LEAD-phase VALIDATION (SD-LEO-INFRA-COMPLETION-GATE-DATA-001-B, evidence 4a9f9e34), live pooler probe 2026-08-31T19:14:05.812Z: context_usage_log has 15 columns, none of loop_name/sd_key/leo_phase present.',
  }),
  // --- SD-LEO-INFRA-COMPLETION-GATE-DATA-001-B FR-2: operator_cash_burn_monthly manual-revenue ---
  // Chairman-gated, like the sms-delivery-status-source-strip entry above -- correcting this
  // SD's own original premise ("no migration file exists anywhere, needs net-new authorship"),
  // which LEAD-phase measurement found FALSE: the migration already exists and is staged.
  Object.freeze({
    id: 'operator-cash-burn-manual-revenue-provenance-migration',
    entry_type: 'shipped-but-not-applied',
    writer: { kind: 'artifact', description: 'database/migrations/20260724190000_add_manual_revenue_provenance_columns.sql -- adds manual_revenue_usd, manual_revenue_last_synced_at to operator_cash_burn_monthly. File header: "STAGED, NOT YET APPROVED FOR APPLY... Migration sign-off routes Coordinator -> Adam -> chairman; a fleet worker must not apply this file directly." (-- requires-chairman-apply)' },
    reader: { file: 'lib/operator/cash-burn-substrate.js', description: 'upsertSubstrateInputs() already writes manual_revenue_usd/manual_revenue_last_synced_at when present, with a PGRST204/42703 fail-soft fallback that strips them when absent -- the application code is ready; only the chairman-gated DDL is missing.' },
    predicate: { description: 'BOTH manual_revenue_usd and manual_revenue_last_synced_at must be present on operator_cash_burn_monthly.', latch: true },
    evidence: 'LEAD-phase VALIDATION (SD-LEO-INFRA-COMPLETION-GATE-DATA-001-B, evidence 4a9f9e34), live pooler probe: operator_cash_burn_monthly has 14 columns, neither manual_revenue_usd nor manual_revenue_last_synced_at present. Migration file confirmed to already exist, disproving this SD\'s original premise of needing net-new authorship.',
  }),
  // --- QF-20260831-313: seat-population axis proof specimen ---
  // NOT a live-measured currently-open orphan (unlike the specimens above): the full
  // registered-seat enumeration + per-gauge population diff (the "denominator check") is
  // itself the QF's named follow-up (Solomon daily audit, from 09-01) and does not exist yet
  // to run live against. This specimen proves the MECHANISM instead, via the same
  // computeSeatPopulationRows/buildSeatOrphanEntries path a live audit will call, against a
  // representative fixture seat -- the shape the acceptance bar names directly ("a fixture
  // dormant seat appears as reader:NONE").
  ...buildSeatOrphanEntries(computeSeatPopulationRows(
    ['fixture-dormant-seat-001'],
    [{ name: 'stale-session-sweep', seatIds: new Set(['fixture-active-seat-a', 'fixture-active-seat-b']) }]
  )).map((e) => Object.freeze({
    ...e,
    evidence: 'QF-20260831-313 mechanism proof (root-cause: chairman ruling f48e0abf / Solomon 3792b3ec -- three oversight layers each audited did-the-layer-below-ACT, none audited the full registered-seat denominator). Representative fixture, not a live measurement: the seat-enumeration + gauge-population sources this axis needs are the daily audit\'s own follow-up build, not yet wired.',
  })),
  // --- FR-5: self-registration, so this registry cannot become the fourth orphan specimen ---
  Object.freeze({
    id: 'orphan-writers-triage-pass',
    entry_type: 'no-stamper-wired',
    writer: { kind: 'process', process_key: 'standard_loop:orphan-writers-triage' },
    reader: { file: 'Chairman weekly triage line', description: 'The chairman\'s weekly review consumes scripts/orphan-writers-count.mjs output as the known-orphan-count gauge.' },
    predicate: { description: 'periodic_process_registry row for standard_loop:orphan-writers-triage has a recent last_fired_at, stamped by the triage pass itself on each run.' },
    evidence: 'FR-5: the registry\'s own execution is registered and stamped so it cannot silently become the fourth orphan-write specimen.',
  }),
  // --- SD-LEO-INFRA-RETRO-PUBLISHED-GUARD-001 FR-4: retrospectives PUBLISHED-guard, authored not applied ---
  Object.freeze({
    id: 'retrospectives-published-guard-migration',
    entry_type: 'shipped-but-not-applied',
    writer: { kind: 'artifact', description: 'database/chairman-gated/20260906_retrospectives_published_guard.sql -- a BEFORE UPDATE trigger (zzz_retrospectives_published_guard) refusing narrative-content changes to PUBLISHED SD_COMPLETION rows without a same-statement retro_write_token, plus a trg_retrospectives_audit() re-declaration that stamps changed_by via COALESCE(..., \'uncanonical\'). Authored, unstamped @approved-by, per TR-1 (zero live DDL apply during this SD\'s EXEC phase).' },
    reader: { file: 'scripts/audit-retrospectives-audit-actor-provenance.mjs', description: 'FR-3(c) scheduled check counting retrospectives_audit rows with changed_by IS NULL OR NOT IN the canonical set. Also: tests/unit/governance/retrospectives-writer-census.test.js (FR-3(b), the broader writer allowlist this trigger will eventually gate -- 20 files, of which only scripts/one-off/restore-retro-from-audit.mjs currently sets retro_write_token; see this migration\'s own APPLY HELD note) and lib/eva/__tests__/retro-clobber-guard.test.js (the 7 isSafeToWriteRetro wire-in files / 8 call sites -- a narrower, guard-consultation-specific set restore-retro-from-audit.mjs is not itself part of, though it separately calls the same guard function directly).' },
    predicate: { description: 'zzz_retrospectives_published_guard trigger and enforce_retrospectives_published_guard()/retro_canonical_writer_policy() functions exist on the live public schema (information_schema/pg_trigger), and retrospectives.retro_write_token column is present -- checked live, not assumed from the migration file having merged.', latch: true },
    evidence: 'PLAN-phase testing-agent review (evidence 6cf14ef0-6024-4432-ac8c-a4a2599d3dd0) and LEAD-phase validation-agent review (evidence 161bcc42-a60a-4e12-be34-4a33fb1a161d) grounded the protected-column scope and the ephemeral-tier test strategy in live retrospectives_audit measurement (30 days: 409 PUBLISHED SD_COMPLETION updates, 163 metadata-only, quality_score/quality_validated_at churning in lockstep with the existing quality-recompute trigger in 169 of them) before this file was authored.',
  }),
  // --- SD-LEO-INFRA-LANE-HYGIENE-MACHINE-WRITERS-001 FR-8: lane-lint gauge writers registered ---
  Object.freeze({
    id: 'lane-lint-gauge-machine-writers',
    entry_type: 'no-stamper-wired',
    writer: {
      kind: 'process',
      description: 'Six session_coordination writers that were untyped and/or senderless, now stamped: scripts/assign-fleet-identities.cjs SET_IDENTITY inserts (payload.kind, sender_session), scripts/worker-signal.cjs (payload.kind=worker_signal beside signal_type), scripts/stale-session-sweep.cjs signal_resolved inserts (sender_session), scripts/periodic-liveness-watcher.mjs periodic_liveness_flag inserts (sender_session, body), lib/npm-install-lock.cjs (payload.kind), scripts/fleet-dashboard.cjs STALE_WARNING insert (payload.kind, sender_session).',
    },
    reader: {
      file: 'lib/coordination/lane-lint-gauge.cjs',
      description: 'scripts/coordinator-lane-lint-gauge.cjs (the daily lane-lint-gauge-cron.yml cron) reads the gauge\'s two-number output — non-exempt violations against a 10 percent budget, and the exempt count by kind. No new exemption list was introduced: LEGITIMATELY_BODYLESS_KINDS and LEGITIMATE_EMPTY_SENDER_TYPES (both already exported by the gauge module, unmodified by this SD) ARE the declared, reasoned exemption list.',
    },
    predicate: {
      description: 'lane-lint-gauge-cron.yml\'s periodic_process_registry row reads green for two consecutive weekly runs post-merge (FR-7c) — an operational, not code-level, exit predicate. Live baseline measured at authoring time: 532/1609 (33.1 percent) violating rows over the gauge\'s own 24h window; projected residual after this SD\'s six writer fixes: ~24/1609 (1.5 percent).',
    },
    evidence: 'LEAD-phase risk-agent (c4c674e8-bb18-4346-a12f-50217692a4d9) and validation-agent (f35b8d3e-5fc4-4a1c-b602-d2139991408c) reviews, and PLAN-phase testing-agent review (3e0331d8-68ac-4027-a43f-8c795de07d1c), grounded the writer selection and the DRAIN_SETS.coordinator/solomon/michael/adam registration of the new worker_signal kind in live per-writer violation attribution before implementation.',
  }),

  // ═══════════════════════════════════════════════════════════════════════
  // QF-20260904-116: thirteen specimens sourced by Adam 2026-09-04 ~22:4xZ on
  // Solomon deep-sweep finding 4b662adb (R1 orphan-writers registry,
  // ratification 2ab4b4bc). Mechanism classification per Solomon ruling
  // 18f04802 (2026-09-04 22:49Z) items 1 and 4, and specimens 12/13 per
  // Solomon ruling 47cd9f79 (2026-09-04 23:17Z).
  // ═══════════════════════════════════════════════════════════════════════

  // --- specimen 1: writer-with-no-reader ---
  Object.freeze({
    id: 'feedback-harness-backlog-zero-promoters',
    entry_type: 'writer-with-no-reader',
    writer: { kind: 'table', table: 'feedback', description: 'category=harness_backlog: three separate writers file rows into this category.' },
    reader: { kind: 'none', description: 'Five gauges display the row count, but zero promoters ever act on a row to route or retire it — a gauge that only counts is not a reader that consumes.' },
    predicate: { description: '2,561 status=new feedback rows in category=harness_backlog (3,578 counting every status) as of 2026-09-07, none routed or retired by any reader — a growing, not shrinking, population since Adam\'s 2,494 count on 2026-09-04.' },
    evidence: 'Adam, 2026-09-04 ~22:4xZ, Solomon deep-sweep finding 4b662adb specimen 1 [owner QF-333; route or retire]. Count re-measured live by Golf-3 (Claude worker) 2026-09-07 via a direct feedback table query.',
  }),
  // --- specimen 2: RESOLVED, retained as taxonomy proof (verified by Golf-3, 2026-09-07) ---
  // QF-20260906-480/../QF-20260904-116 EXEC-phase re-verification: the exact bug Adam sourced
  // (console.warn-then-succeed) was fixed by its own cited owner, SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-H,
  // which landed BEFORE this specimen's implementation. Read live at lib/sub-agent-executor/results-storage.js
  // (the store now `throw`s UNRECOGNIZED_FIELD_DROPPED — see the FR-1 comment directly above the throw)
  // instead of warning and returning success. Kept per the same precedent as 'seat-busy-fence-pre-454'
  // above: a resolved specimen still proves writer-with-no-reader is representable, and this taxonomy
  // needed a second worked example beyond feedback-sla-categories/harness-backlog for it.
  Object.freeze({
    id: 'sub-agent-results-storage-unpersisted-warning',
    entry_type: 'writer-with-no-reader',
    writer: { file: 'lib/sub-agent-executor/results-storage.js', description: 'Before SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-H: when a caller field could not be persisted, the store console.warned and then returned success — the warning was the only record of the drop.' },
    reader: { kind: 'none', description: 'Nothing consumed the console.warn output; the store\'s success return was what every caller and every downstream gate actually observed.' },
    predicate: { description: 'RESOLVED: storeSubAgentResults() now throws UNRECOGNIZED_FIELD_DROPPED for any caller field neither mapped to a column nor exempted via PERSISTED_ELSEWHERE, instead of warning and succeeding — verified live at lib/sub-agent-executor/results-storage.js by Golf-3 (Claude worker), 2026-09-07.' },
    evidence: 'Adam, 2026-09-04 ~22:4xZ, Solomon deep-sweep finding 4b662adb specimen 2, fix owner SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-H (already shipped by the time this specimen was implemented).',
  }),
  // --- specimen 3: writer-with-no-reader ---
  // Wording corrected by Golf-3 (Claude worker) verification, 2026-09-07: the readback-verification
  // failure path (QF-20260828-255) fails LOUD via console.error(err.message), not silently -- "swallows"
  // was inaccurate. The persistence gap Adam's specimen actually names remains real: console.error is a
  // log line, not a durable row a later reader can query -- the cause of a held send still has no
  // queryable record.
  Object.freeze({
    id: 'presend-consult-lane-choke-error-swallowed',
    entry_type: 'writer-with-no-reader',
    writer: { file: 'lib/adam/presend-consult-lane.cjs', description: 'On a chairman-targeted send, a failed consult-row readback (or a missing row id) is reported via console.error(err.message) -- loud, not silent, but ephemeral.' },
    reader: { kind: 'none', description: 'The console.error text is never durably persisted anywhere a reader — a row, a file, a seat — could later query it; only the terminal/log stream carries it.' },
    predicate: { description: 'A held chairman send has no QUERYABLE record of WHY it was held; the cause text exists only as a console.error line, never as a row a later reader can consult.' },
    evidence: 'Adam, 2026-09-04 ~22:4xZ, Solomon deep-sweep finding 4b662adb specimen 3 [Adam fix shape 2cd77e87]. Wording corrected and location re-verified (lib/adam/presend-consult-lane.cjs, the readback-failure console.error branch) by Golf-3 (Claude worker), 2026-09-07.',
  }),
  // --- specimen 4: RESOLVED, retained as taxonomy proof (verified by Golf-3, 2026-09-07) ---
  // QF-20260904-116 EXEC-phase re-verification: the hardcoded auditAccepted:false placeholder Adam's
  // specimen names was fixed by its own cited owner, QF-20260904-508, which landed BEFORE this
  // specimen's implementation. Read live at lib/worktree-reaper/reclaim-stage.js: the classification
  // path now calls evaluateReclaimEligibilityPreAudit (conditions 1-3 only), then re-gates the whole
  // batch against the real audit-sink outcome via gateReclaimCandidatesByAudit (condition 5) -- exactly
  // the two-phase fix reclaim-stage.js's own docblock describes. Kept per the 'seat-busy-fence-pre-454'
  // precedent: this is reads-before-the-writer's proof specimen alongside specimens 8 and 11.
  Object.freeze({
    id: 'worktree-reaper-stagereclaim-placeholder',
    entry_type: 'reads-before-the-writer',
    writer: { kind: 'field', description: 'Before QF-20260904-508: _reclaimCandidate.auditAccepted was hardcoded false at classification time, since the real audit-acceptance writer had not run yet for that tick.' },
    reader: { file: 'scripts/worktree-reaper.mjs', description: 'stageReclaim filtered on _reclaimCandidate, which was derived from the hardcoded auditAccepted:false placeholder -- always empty, for any tree, ever.' },
    predicate: { description: 'RESOLVED: classification now calls evaluateReclaimEligibilityPreAudit (conditions 1-3 only, condition 5 deferred), and the batch is re-gated post-audit via gateReclaimCandidatesByAudit(records, auditResult) -- verified live at lib/worktree-reaper/reclaim-stage.js by Golf-3 (Claude worker), 2026-09-07.' },
    evidence: 'Adam, 2026-09-04 ~22:4xZ, Solomon deep-sweep finding 4b662adb specimen 4, fix owner QF-20260904-508 (already shipped by the time this specimen was implemented).',
  }),
  // --- specimen 5: no-stamper-wired ---
  Object.freeze({
    id: 'retrospectives-audit-changed-by-null',
    entry_type: 'no-stamper-wired',
    writer: { kind: 'trigger', description: 'trg_retrospectives_audit writes a changed_by column on every retrospectives_audit row it produces.' },
    reader: { file: 'scripts/audit-retrospectives-audit-actor-provenance.mjs', description: 'The FR-3(c) scheduled check reads changed_by to attribute retrospective mutations to an actor.' },
    predicate: { description: 'trg_retrospectives_audit writes changed_by=NULL on every row — the actor column is wired and read, but permanently blind, since the trigger never stamps a real value.' },
    evidence: 'Adam, 2026-09-04 ~22:4xZ, Solomon deep-sweep finding 4b662adb specimen 5 [SD-LEO-INFRA-RETRO-PUBLISHED-GUARD-001 FR-1].',
  }),
  // --- specimen 6: wired-but-blind ---
  Object.freeze({
    id: 'quick-fixes-guard-b-disposition-column-mismatch',
    entry_type: 'wired-but-blind',
    writer: { kind: 'column', table: 'quick_fixes', column: 'disposition', description: 'The 002-E constraint writes and enforces the `disposition` column.' },
    reader: { file: 'lib/quick-fix/status-writer.cjs', description: 'Guard B (:51-56) reads `disposition_reason_code` — a sibling column, not the one the 002-E constraint actually governs.' },
    predicate: { description: 'Guard B is wired to a real column and runs without error, but reads the wrong one: `disposition_reason_code` instead of `disposition`, so it cannot see what the 002-E constraint enforces.' },
    evidence: 'Adam, 2026-09-04 ~22:4xZ, Solomon deep-sweep finding 4b662adb specimen 6 [Tier-1 bf8435b3 + RECORD-TRUTH-002 column contract].',
  }),
  // --- specimen 7: DROPPED. Golf-3 (Claude worker) EXEC-phase re-verification, 2026-09-07:
  // Adam's premise ("writers stamp four [keys] the coalescer never reads") does not hold against
  // current lib/fleet/claim-eligibility.cjs. resolveHoldProvenance() coalesces its 6-key chain
  // deliberately -- the file's own docblock (SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-
  // CONSTRAINTS-001 FR-3 CORRECTION, evidence 4298bd82) documents that an EARLIER version widened
  // this SAME function to include more keys, that widening stalled auto-handoff for 11 SDs across
  // 64 live SDs newly held, and QF-20260904-724 deliberately REVERTED it back to the 6-key chain,
  // moving the excluded keys into DESCRIPTIVE_HOLD_NOTE_KEYS -- a separate, intentional
  // display-only list "kept as its own list so nothing wires it into the gate resolver by
  // accident." A display-only widening function (immediately below resolveHoldProvenance in the
  // same file) already falls back to those keys for operator-facing surfaces. This is a settled,
  // documented design decision naming its own root cause, not a wired-but-blind mechanism --
  // wired-but-blind already has ample coverage (specimens 6, 9, 10, 12 plus base entries) so
  // dropping this specimen does not affect entry_type coverage.
  // --- specimen 8: reads-before-the-writer ---
  Object.freeze({
    id: 'solomon-advisory-already-answered-backpressure-parked',
    entry_type: 'reads-before-the-writer',
    writer: { kind: 'field', table: 'session_coordination', column: 'payload.backpressure_parked', description: 'lib/coordinator/dispatch.cjs stamps payload.backpressure_parked=true on a row parked under send backpressure -- the row is inserted (readable), but marks itself as a parked, not a confirmed-delivered, send.' },
    reader: { file: 'lib/coordinator/reply-class.cjs', description: 'alreadyAnswered() (imported into scripts/solomon-advisory.cjs) queries session_coordination on payload.reply_to + payload.kind alone -- it does not check payload.backpressure_parked at all.' },
    predicate: { description: 'A backpressure-parked answer row and a genuinely delivered one are indistinguishable to alreadyAnswered(), verified live at lib/coordinator/reply-class.cjs:109-129 (Golf-3, Claude worker, 2026-09-07) -- the query has no backpressure_parked clause of any kind.' },
    evidence: 'Adam, 2026-09-04 ~22:4xZ, Solomon deep-sweep finding 4b662adb specimen 8 [board c81e8d43]. Mechanism location corrected (alreadyAnswered lives in lib/coordinator/reply-class.cjs, re-exported by scripts/solomon-advisory.cjs) and re-verified by Golf-3 (Claude worker), 2026-09-07.',
  }),
  // --- specimen 9: wired-but-blind ---
  Object.freeze({
    id: 'sd-parent-metadata-children-status-lag',
    entry_type: 'wired-but-blind',
    writer: { kind: 'column', table: 'strategic_directives_v2', column: 'metadata', description: 'A parent SD\'s metadata.children[].status is written at child-claim time and not kept in sync thereafter.' },
    reader: { kind: 'evaluator', description: 'Readers across the fleet take parent metadata.children[].status as the current truth of child progress.' },
    predicate: { description: 'metadata.children[].status lags the live child rows (the authoritative source, keyed by parent_sd_id) — readers are wired to the field but blind to drift once a child\'s real status changes.' },
    evidence: 'Adam, 2026-09-04 ~22:4xZ, Solomon deep-sweep finding 4b662adb specimen 9 [needs a maintainer or a retire; Adam backlog row 2026-09-04 17:1xZ].',
  }),
  // --- specimen 10: wired-but-blind ---
  Object.freeze({
    id: 'c5-w5d-audit-predicate-dead-column',
    entry_type: 'wired-but-blind',
    writer: { kind: 'column', table: 'sd_phase_handoffs', column: 'validation_details', description: 'GATE_SUBAGENT_EVIDENCE was intended to populate validation_details on every accepted handoff row.' },
    reader: { kind: 'audit-predicate', description: 'The C5/W5(d) audit predicate reads sd_phase_handoffs.validation_details for GATE_SUBAGENT_EVIDENCE to assess gate coverage.' },
    predicate: { description: 'validation_details for GATE_SUBAGENT_EVIDENCE is carried on 0 of 2,507 accepted rows since 08-01 — the reader is wired to a column that has never once been populated for this gate.' },
    evidence: 'Adam, 2026-09-04 ~22:4xZ, Solomon deep-sweep finding 4b662adb specimen 10 [amended in a2759cf6; census script is the instrument].',
  }),
  // --- specimen 11: reads-before-the-writer (chairman-SMS backstop) ---
  Object.freeze({
    id: 'chairman-sms-backstop-reads-before-write',
    entry_type: 'reads-before-the-writer',
    writer: { kind: 'process', description: 'The chairman-SMS delivery-confirmation backstop writer, which has not yet run at the point this guard evaluates.' },
    reader: { kind: 'guard', description: 'The chairman-SMS backstop guard evaluates delivery state before the confirmation writer it depends on has run.' },
    predicate: { description: 'The backstop guard reads a delivery-confirmation source ahead of the writer that would populate it, the same reads-before-the-writer mechanism as specimens 4 and 8.' },
    evidence: 'Solomon d0941723, QF filed 2026-09-04 23:0xZ (specimen 11, Solomon ruling 18f04802 mapping item 4).',
  }),
  // --- specimen 12: wired-but-blind (NOT reads-before-the-writer — Solomon 47cd9f79 explicit) ---
  Object.freeze({
    id: 'dispatch-backpressure-counter-informational-floor',
    entry_type: 'wired-but-blind',
    writer: { file: 'lib/coordinator/dispatch.cjs', description: 'The backpressure counter increments over every unacknowledged, unexpired session_coordination row sent to a target, including INFORMATIONAL_KINDS such as roll_call -- BACKPRESSURE_EXEMPT_KINDS (collision_warning, amend_sd, DISPOSITION_KIND, SIGNAL_RECEIPT, CAPPED_POOL_BROADCAST, correction kinds) does NOT include roll_call, verified live at lib/coordinator/dispatch.cjs:43.' },
    reader: { file: 'lib/coordinator/dispatch.cjs', description: 'The same counter (the .filter() computing `count`, currently at line ~1253) is read as a backpressure signal — a target is treated as backed up once its count crosses BACKPRESSURE_UNANSWERED_LIMIT.' },
    predicate: { description: 'roll_call rows never ack, so any target that receives them sits at a permanently counted floor (coordinator measured: 328 unacked rows, all roll_call) — the counter cannot discriminate real backpressure from informational noise. Solomon 47cd9f79: reads-before-the-writer is explicitly NOT the mechanism here; the reader and writer are the same live counter, just counting the wrong population. Re-verified live by Golf-3 (Claude worker), 2026-09-07: BACKPRESSURE_EXEMPT_KINDS still excludes roll_call.' },
    evidence: 'Solomon 47cd9f79, 2026-09-04 23:17Z, originally measured at lib/coordinator/dispatch.cjs:1100 (line has since shifted with unrelated file churn; re-cited at :43/:1253 by Golf-3, Claude worker, 2026-09-07) [Tier-1 QF filed 2026-09-04 ~23:2xZ: counter filter fix].',
  }),
  // --- specimen 13: writer-with-no-reader ---
  Object.freeze({
    id: 'session-coordination-backpressure-parked-no-reader',
    entry_type: 'writer-with-no-reader',
    writer: { kind: 'field', table: 'session_coordination', column: 'payload.backpressure_parked', description: 'lib/coordinator/dispatch.cjs sets payload.backpressure_parked=true on rows it holds back under load.' },
    reader: { kind: 'none', description: 'Grep over lib/ and scripts/ (the writer excluded) finds no reader anywhere that consumes payload.backpressure_parked -- dispatch.cjs\'s own use of the flag (to exclude a parked row from its OWN next count) is an internal self-check on the writer, not an external consumer.' },
    predicate: { description: 'session_coordination.payload.backpressure_parked is written but has zero consuming readers in the codebase, re-verified live by Golf-3 (Claude worker), 2026-09-07: grep for "backpressure_parked" under lib/ finds only dispatch.cjs and this registry; scripts/ finds none at all.' },
    evidence: 'Solomon 47cd9f79, 2026-09-04 23:17Z, measured by grep over lib/ and scripts/ [Tier-1 QF filed 2026-09-04 ~23:2xZ: role-seat roll-call skip]. Re-grepped by Golf-3 (Claude worker), 2026-09-07 — same result.',
  }),

  // ═══════════════════════════════════════════════════════════════════════
  // BOUND 2026-09-05 10:5xZ: Solomon deep-sweep finding 84677786 item 2,
  // pattern-owner ruling, Adam scribe. Two new entry types with their first
  // specimen each; SD-LEO-INFRA-ORPHAN-WRITERS-REGISTRY-001 is completed, so
  // this open QF row carries the addition (ratification 2ab4b4bc, DISCOVERY).
  // ═══════════════════════════════════════════════════════════════════════

  // --- detector-with-no-sink: first specimen, RESOLVED, retained as taxonomy proof
  // (Golf-3, Claude worker, 2026-09-07 re-verification) ---
  // The console-only CONFLICTS detector this specimen names was fixed by SD-LEO-FIX-STALE-
  // SESSION-SWEEP-002 (QF-20260905-230), which landed on main before this specimen's
  // implementation: scripts/stale-session-sweep.cjs's CONFLICTS reporting loop (now ~:4268-4287)
  // calls `await recordFinding(supabase, {...})` alongside its console.log for every conflict and
  // multi-claim row -- verified live. This is the ONLY specimen detector-with-no-sink has, so it
  // is kept (not dropped) per the 'seat-busy-fence-pre-454' precedent to satisfy entry_type
  // coverage; a genuinely still-open detector-with-no-sink specimen is a fair target for a future QF.
  Object.freeze({
    id: 'stale-session-sweep-conflicts-console-only',
    entry_type: 'detector-with-no-sink',
    writer: { file: 'scripts/stale-session-sweep.cjs', description: 'Before SD-LEO-FIX-STALE-SESSION-SWEEP-002: the holds-N-claims CONFLICTS detector computed and printed its finding via console.log only.' },
    reader: { kind: 'none', description: 'Before the fix, the finding was console-only — no row, file, or seat persisted it, so nothing downstream could ever discover a past CONFLICTS finding.' },
    predicate: { description: 'RESOLVED: the CONFLICTS reporting loop (scripts/stale-session-sweep.cjs, ~:4268-4287) now calls recordFinding(supabase, { findingClass: \'conflict\', subject, summary }) for every conflict and multi-claim row alongside its console.log, per QF-20260905-230 -- verified live by Golf-3 (Claude worker), 2026-09-07.' },
    evidence: 'Solomon deep-sweep finding 84677786 item 2, Adam scribe, 2026-09-05 10:5xZ, originally measured at scripts/stale-session-sweep.cjs:4189 (line has since shifted). Fix owner SD-LEO-FIX-STALE-SESSION-SWEEP-002 / QF-20260905-230 (already shipped by the time this specimen was implemented).',
  }),
  // --- reads-but-never-compares: first specimen ---
  Object.freeze({
    id: 'resolve-sd-workdir-branch-read-never-compared',
    entry_type: 'reads-but-never-compares',
    writer: { kind: 'git', description: 'The current worktree/branch state, readable via getWorktreeBranch.' },
    reader: { file: 'scripts/resolve-sd-workdir.js', description: 'Line ~814: getWorktreeBranch reads the current branch value.' },
    predicate: { description: 'The read branch value is never compared to its expected form (feat/<key>) — the read is present, but the predicate that would make it meaningful is absent.' },
    evidence: 'Solomon deep-sweep finding 84677786 item 2, Adam scribe, 2026-09-05 10:5xZ, measured at scripts/resolve-sd-workdir.js:814.',
  }),
]);
