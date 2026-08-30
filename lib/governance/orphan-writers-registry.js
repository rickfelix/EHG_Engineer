/**
 * Orphan-writers registry (SD-LEO-INFRA-ORPHAN-WRITERS-REGISTRY-001).
 *
 * Pairs each durable writer this registry knows about with its intended reader and a
 * predicate proving the reader actually consumes something. Three entry types, matching
 * the chairman-ratified Triangulation Audit Cycle-2 taxonomy:
 *   - wired-but-blind:        a reader exists but cannot see the writes.
 *   - no-stamper-wired:       a self_stamped liveness row whose process runs but never stamps.
 *   - shipped-but-not-applied: an artifact shipped to main whose effect is not yet live.
 *
 * This registry does NOT duplicate lib/governance/gauge-registry.js's DRAIN_DESCRIPTORS —
 * where a specimen is already represented there (proven reader/predicate/closingPath for
 * detector-output rows), this registry references it by id instead of re-declaring it
 * (VALIDATION sub-agent finding: two representations of one fact disagree eventually).
 */

import { DRAIN_DESCRIPTORS } from './gauge-registry.js';

/**
 * @typedef {'wired-but-blind'|'no-stamper-wired'|'shipped-but-not-applied'} EntryType
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
    if (!DRAIN_DESCRIPTORS[entry.refs_drain_descriptor]) {
      return { valid: false, reason: `refs_drain_descriptor "${entry.refs_drain_descriptor}" not found in DRAIN_DESCRIPTORS` };
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
    writer: { kind: 'table', description: 'semantic-indexer source writes (indexable content rows)' },
    reader: { file: 'lib/semantic-index (indexer)', description: 'The semantic indexer process — wired to read the source table, but its scan does not surface these writes.' },
    predicate: { description: 'A row present at the source but absent from the semantic index after the indexer\'s next scheduled pass.' },
    evidence: 'VALIDATION sub-agent, LEAD-TO-PLAN, SD-LEO-INFRA-ORPHAN-WRITERS-REGISTRY-001, 2026-08-30: semantic-indexer confirmed wired to a source it cannot actually see write-through on.',
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
    evidence: 'VALIDATION sub-agent, LEAD-TO-PLAN, 2026-08-30: the SD\'s originally-cited "four feedback categories, no consumer" specimen resolves to SLA_CATEGORIES in lib/coordinator/feedback-sla-gauge.cjs, which DOES read them (real defect is NO_CLOSING_PATH, already correctly classified as DRAIN_DESCRIPTORS[\'feedback-sla-breach\']). Referenced here, not re-declared.',
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
