/**
 * Orphan-writers registry (SD-LEO-INFRA-ORPHAN-WRITERS-REGISTRY-001).
 *
 * Pairs each durable writer this registry knows about with its intended reader and a
 * predicate proving the reader actually consumes something. Four entry types, matching
 * the chairman-ratified Triangulation Audit Cycle-2 taxonomy:
 *   - wired-but-blind:        a reader exists but cannot see the writes.
 *   - no-stamper-wired:       a self_stamped liveness row whose process runs but never stamps.
 *   - shipped-but-not-applied: an artifact shipped to main whose effect is not yet live.
 *   - reader-with-no-writer:  the inverse of the registry's own name — a reader is wired and
 *                             consuming, but nothing has ever produced what it reads (QF-20260830-853,
 *                             coordinator addendum f01c251f: a writer-required schema structurally
 *                             cannot represent this class — a census keyed on emit sites returns
 *                             zero and reads as clean for exactly the orphans on the consuming end).
 *
 * This registry does NOT duplicate lib/governance/gauge-registry.js's DRAIN_DESCRIPTORS —
 * where a specimen is already represented there (proven reader/predicate/closingPath for
 * detector-output rows), this registry references it by id instead of re-declaring it
 * (VALIDATION sub-agent finding: two representations of one fact disagree eventually).
 */

import { DRAIN_DESCRIPTORS } from './gauge-registry.js';

/**
 * @typedef {'wired-but-blind'|'no-stamper-wired'|'shipped-but-not-applied'|'reader-with-no-writer'} EntryType
 */

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
  // reader-with-no-writer (QF-20260830-853): the inverse shape. A writer field would be
  // false documentation here — the whole point is that no writer existed. Require a
  // `reader` (what's consuming) and a `producer_gap` describing what SHOULD have written it.
  if (entry.entry_type === 'reader-with-no-writer') {
    if (!entry.reader) {
      return { valid: false, reason: 'missing reader (a reader-with-no-writer entry must still name the consuming reader)' };
    }
    if (!entry.producer_gap || !entry.producer_gap.description) {
      return { valid: false, reason: 'missing producer_gap (what should have written this, and why nothing did)' };
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
  // --- reader-with-no-writer: reader wired and consuming, nothing ever produced it (QF-20260830-853) ---
  Object.freeze({
    id: 'seat-busy-fence-pre-454',
    entry_type: 'reader-with-no-writer',
    reader: { file: 'lib/checkin/steps/seat-busy-fence.cjs', description: 'Drains session_coordination rows for payload.kind=seat_busy_reservation to suppress self-claim on a busy seat. Fully wired and correctly reads the kind it is given.' },
    producer_gap: { description: 'PAYLOAD_KINDS.SEAT_BUSY_RESERVATION was defined in lib/fleet/worker-status.cjs and drained by this reader, but had ZERO producers anywhere in the codebase from the reader\'s introduction until QF-20260830-454 (lib/coordinator/dispatch.cjs stampSeatBusyReservation, merged 98e9dafb31d) shipped the first-ever writer. The fence read as a working guard on inspection; its silence was indistinguishable from "no seat was ever busy" and directly enabled the QF-20260830-590 auto-self-claim double-claim incident.', resolved_by: 'QF-20260830-454 (98e9dafb31d)' },
    evidence: 'Coordinator directive f01c251f (Adam-ratified 20:31Z), specimen found by Charlie, verified live 2026-08-30 by grep: pre-fix, zero writers of the payload kind existed; post-fix, lib/coordinator/dispatch.cjs is the sole writer. Now RESOLVED, retained here as the taxonomy\'s proof specimen that reader-with-no-writer is representable, not merely named.',
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
