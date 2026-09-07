import { describe, it, expect } from 'vitest';
import { ORPHAN_ENTRIES, ENTRY_TYPES, validateOrphanEntry, validateAllEntries, getReaderClassification } from '../../../lib/governance/orphan-writers-registry.js';
import { DRAIN_DESCRIPTORS } from '../../../lib/governance/gauge-registry.js';

describe('orphan-writers-registry: validateOrphanEntry (TS-1)', () => {
  it('fails a fixture entry with no predicate declared', () => {
    const result = validateOrphanEntry({
      id: 'fixture-missing-predicate',
      entry_type: 'wired-but-blind',
      writer: { kind: 'table', table: 'fixture_table' },
      reader: { file: 'fixture-reader.js', description: 'a reader' },
      // predicate deliberately omitted
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/predicate/i);
  });

  it('fails a fixture entry with no reader declared', () => {
    const result = validateOrphanEntry({
      id: 'fixture-missing-reader',
      entry_type: 'wired-but-blind',
      writer: { kind: 'table', table: 'fixture_table' },
      predicate: { description: 'a predicate' },
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/reader/i);
  });

  it('fails an entry missing id or entry_type', () => {
    expect(validateOrphanEntry({}).valid).toBe(false);
    expect(validateOrphanEntry({ id: 'x' }).valid).toBe(false);
  });

  it('fails an entry with an entry_type not in ENTRY_TYPES (QF-20260830-875: was truthiness-only before)', () => {
    const result = validateOrphanEntry({
      id: 'fixture-bogus-type',
      entry_type: 'made-up-type',
      writer: { kind: 'table', table: 'fixture_table' },
      reader: { file: 'fixture-reader.js', description: 'a reader' },
      predicate: { description: 'a predicate' },
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/unknown entry_type/);
  });

  it('reader-with-no-writer: passes with writer:{kind:"absent"} (no schema change, per QF-20260830-875 design)', () => {
    const result = validateOrphanEntry({
      id: 'fixture-reader-no-writer',
      entry_type: 'reader-with-no-writer',
      writer: { kind: 'absent', description: 'nothing ever wrote this' },
      reader: { file: 'fixture-reader.js', description: 'a reader' },
      predicate: { description: 'zero rows ever appear for this reader to consume' },
    });
    expect(result.valid).toBe(true);
  });

  it('passes a well-formed fixture entry', () => {
    const result = validateOrphanEntry({
      id: 'fixture-ok',
      entry_type: 'wired-but-blind',
      writer: { kind: 'table', table: 'fixture_table' },
      reader: { file: 'fixture-reader.js', description: 'a reader' },
      predicate: { description: 'a predicate' },
    });
    expect(result.valid).toBe(true);
  });

  it('passes a refs_drain_descriptor entry pointing at a RESOLVED DRAIN_DESCRIPTORS key (has a consumer)', () => {
    const result = validateOrphanEntry({ id: 'fixture-ref', entry_type: 'wired-but-blind', refs_drain_descriptor: 'solomon-advice-outcome-ledger' });
    expect(result.valid).toBe(true);
  });

  it('fails a refs_drain_descriptor entry pointing at a nonexistent key', () => {
    const result = validateOrphanEntry({ id: 'fixture-bad-ref', entry_type: 'wired-but-blind', refs_drain_descriptor: 'does-not-exist' });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/refs_drain_descriptor/);
  });

  it('fails a refs_drain_descriptor entry pointing at an UNRESOLVED descriptor (no consumer) unless explicitly known_orphan (V-1)', () => {
    const unmarked = validateOrphanEntry({ id: 'fixture-unresolved', entry_type: 'wired-but-blind', refs_drain_descriptor: 'relay-drop' });
    expect(unmarked.valid).toBe(false);
    expect(unmarked.reason).toMatch(/no consumer declared/);

    const marked = validateOrphanEntry({ id: 'fixture-unresolved-acked', entry_type: 'wired-but-blind', refs_drain_descriptor: 'relay-drop', known_orphan: true });
    expect(marked.valid).toBe(true);
  });
});

describe('orphan-writers-registry: validateAllEntries', () => {
  it('reports every invalid entry, not just the first', () => {
    const { valid, invalidEntries } = validateAllEntries([
      { id: 'a', entry_type: 'wired-but-blind' },
      { id: 'b', entry_type: 'wired-but-blind', writer: {}, reader: {} },
    ]);
    expect(valid).toBe(false);
    expect(invalidEntries).toHaveLength(2);
    expect(invalidEntries.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('the real ORPHAN_ENTRIES baseline is fully valid', () => {
    const { valid, invalidEntries } = validateAllEntries(ORPHAN_ENTRIES);
    expect(invalidEntries).toEqual([]);
    expect(valid).toBe(true);
  });
});

describe('orphan-writers-registry: known-orphan count baseline (QF-20260831-821)', () => {
  // Chairman-ratified obligation 2ab4b4bc: "CI fails on silent growth OR shrink of the count."
  // A rising number in month one reads as DISCOVERY, not decay -- the assertion forces the
  // delta to be looked at, not suppressed. Bump this constant (and the reason in the same
  // commit) whenever ORPHAN_ENTRIES genuinely changes size; a silent change fails CI.
  // SD-LEO-INFRA-COMPLETION-GATE-DATA-001-B: 15 -> 17. Two new shipped-but-not-applied entries
  // (context-usage-log-leo-phase-tagging-migration, operator-cash-burn-manual-revenue-provenance-migration).
  // QF-20260831-313: 17 -> 18. One new seat-population-orphan mechanism-proof specimen
  // (seat-population:fixture-dormant-seat-001).
  // SD-LEO-INFRA-RETRO-PUBLISHED-GUARD-001: 18 -> 19. One new shipped-but-not-applied entry
  // (retrospectives-published-guard-migration).
  // SD-LEO-INFRA-LANE-HYGIENE-MACHINE-WRITERS-001: 19 -> 20. One new no-stamper-wired entry
  // (lane-lint-gauge-machine-writers) — re-check live against QF-20260904-116 at merge time,
  // which independently appends a different set of entries to this same array.
  // QF-20260904-116: 20 -> 34. Thirteen specimens sourced by Adam (Solomon deep-sweep finding
  // 4b662adb / rulings 18f04802 + 47cd9f79) plus two specimens from the BOUND 2026-09-05 addition
  // (Solomon deep-sweep finding 84677786 item 2, first entries for the two new entry_types
  // detector-with-no-sink and reads-but-never-compares) = 15 candidate rows. EXEC-phase
  // re-verification against current main (Golf-3, Claude worker, 2026-09-07) found specimen 7
  // (claim-eligibility-hold-provenance-coalescer) rests on a refuted premise -- the coalescer's
  // 6-key scope is QF-20260904-724's own deliberate, documented correction, not a wired-but-blind
  // defect -- and dropped it (wired-but-blind already has ample coverage from specimens 6, 9, 10,
  // 12 plus base entries, so no entry_type loses coverage). 15 candidates - 1 dropped = 14 added.
  // The feedback-sla-categories entry was also reclassified wired-but-blind -> writer-with-no-reader
  // (ruling 18f04802 item 2) — a re-type, not a new row, so it does not add to this count.
  const PINNED_TOTAL_ENTRIES = 34;

  it('total entry count matches the pinned baseline -- update PINNED_TOTAL_ENTRIES with a reason if this genuinely changed', () => {
    expect(ORPHAN_ENTRIES.length).toBe(PINNED_TOTAL_ENTRIES);
  });

  it('the sms-delivery-status-source-strip specimen (QF-20260831-821) is present with its citation', () => {
    const entry = ORPHAN_ENTRIES.find((e) => e.id === 'sms-delivery-status-source-strip');
    expect(entry).toBeTruthy();
    expect(entry.entry_type).toBe('wired-but-blind');
    expect(entry.evidence).toMatch(/6d1624eb/);
  });
});

describe('orphan-writers-registry: entry-type coverage (SD success criterion 2)', () => {
  it('has at least one real specimen per entry_type', () => {
    const types = new Set(ORPHAN_ENTRIES.map((e) => e.entry_type));
    for (const type of ENTRY_TYPES) {
      expect(types.has(type)).toBe(true);
    }
  });

  it('all 7 coordinator standard_loop process_keys are present, keyed by identity not a hardcoded count (TS-3)', () => {
    const expectedSlugs = ['advisory-drain', 'capture-gate', 'drive-report-consume', 'idle-qf-hint', 'shared-root-freshness', 'silent-holder-audit', 'unrouted-branches'];
    const presentKeys = ORPHAN_ENTRIES.filter((e) => e.writer?.process_key?.startsWith('standard_loop:')).map((e) => e.writer.process_key);
    for (const slug of expectedSlugs) {
      expect(presentKeys).toContain(`standard_loop:${slug}`);
    }
  });

  it('the shipped-but-not-applied specimen declares its predicate as a latch, not a repeatable emptiness read (TS-7)', () => {
    const entry = ORPHAN_ENTRIES.find((e) => e.entry_type === 'shipped-but-not-applied');
    expect(entry).toBeTruthy();
    expect(entry.predicate.latch).toBe(true);
  });

  it('the test-pins-the-defect specimen names the test file and the misunderstanding it protected (QF-20260830-875)', () => {
    const entry = ORPHAN_ENTRIES.find((e) => e.entry_type === 'test-pins-the-defect');
    expect(entry).toBeTruthy();
    expect(entry.writer?.file).toBe('tests/unit/periodic-liveness/panel-arithmetic-beside-last-state.test.js');
    expect(entry.predicate?.description).toBeTruthy();
  });

  it('the query-never-ran specimen documents the swallowed error and the coerced-zero outcome (QF-20260830-875)', () => {
    const entry = ORPHAN_ENTRIES.find((e) => e.entry_type === 'query-never-ran');
    expect(entry).toBeTruthy();
    expect(entry.writer?.description).toMatch(/does not exist/);
    expect(entry.predicate?.description).toMatch(/coerced/);
  });

  it('the reader-with-no-writer specimen uses writer:{kind:"absent"} rather than a schema change (QF-20260830-875)', () => {
    const entry = ORPHAN_ENTRIES.find((e) => e.entry_type === 'reader-with-no-writer');
    expect(entry).toBeTruthy();
    expect(entry.writer?.kind).toBe('absent');
    expect(entry.reader?.file).toBe('lib/checkin/steps/seat-busy-fence.cjs');
  });
});

describe('orphan-writers-registry: FR-6 no duplicate representation', () => {
  it('the feedback-sla specimen references DRAIN_DESCRIPTORS instead of re-declaring its own reader/predicate', () => {
    const entry = ORPHAN_ENTRIES.find((e) => e.id === 'feedback-sla-categories');
    expect(entry).toBeTruthy();
    expect(entry.refs_drain_descriptor).toBe('feedback-sla-breach');
    expect(DRAIN_DESCRIPTORS[entry.refs_drain_descriptor]).toBeTruthy();
    expect(entry.reader).toBeUndefined();
    expect(entry.predicate).toBeUndefined();
  });
});

describe('orphan-writers-registry: FR-5 self-registration (TS-8)', () => {
  it('the triage pass has its own registry entry with a real reader', () => {
    const entry = ORPHAN_ENTRIES.find((e) => e.id === 'orphan-writers-triage-pass');
    expect(entry).toBeTruthy();
    expect(entry.reader?.description).toBeTruthy();
  });
});

describe('orphan-writers-registry: getReaderClassification (QF-20260904-116, Solomon ruling 18f04802 item 3)', () => {
  it('classifies writer-with-no-reader and seat-population-orphan as reader:NONE', () => {
    expect(getReaderClassification({ entry_type: 'writer-with-no-reader' })).toBe('reader:NONE');
    expect(getReaderClassification({ entry_type: 'seat-population-orphan' })).toBe('reader:NONE');
  });

  it('classifies every other entry_type as wired-but-blind, including the new reads-before-the-writer/detector-with-no-sink/reads-but-never-compares mechanisms', () => {
    for (const type of ENTRY_TYPES) {
      if (type === 'writer-with-no-reader' || type === 'seat-population-orphan') continue;
      expect(getReaderClassification({ entry_type: type })).toBe('wired-but-blind');
    }
  });

  it('agrees with the derived classification for every live ORPHAN_ENTRIES row (acceptance line holds by construction)', () => {
    for (const entry of ORPHAN_ENTRIES) {
      const classification = getReaderClassification(entry);
      expect(['reader:NONE', 'wired-but-blind']).toContain(classification);
    }
  });
});

describe('orphan-writers-registry: QF-20260904-116 specimen mechanism mapping (Solomon rulings 18f04802 + 47cd9f79)', () => {
  it('feedback-sla-categories was reclassified writer-with-no-reader (ruling 18f04802 item 2)', () => {
    const entry = ORPHAN_ENTRIES.find((e) => e.id === 'feedback-sla-categories');
    expect(entry.entry_type).toBe('writer-with-no-reader');
  });

  it('specimens 1-3 (harness_backlog, results-storage warning, presend-lane swallowed error) are writer-with-no-reader', () => {
    const ids = ['feedback-harness-backlog-zero-promoters', 'sub-agent-results-storage-unpersisted-warning', 'presend-consult-lane-choke-error-swallowed'];
    for (const id of ids) {
      const entry = ORPHAN_ENTRIES.find((e) => e.id === id);
      expect(entry, id).toBeTruthy();
      expect(entry.entry_type, id).toBe('writer-with-no-reader');
    }
  });

  it('specimens 4, 8, 11 (reaper placeholder, alreadyAnswered, SMS backstop) are reads-before-the-writer', () => {
    const ids = ['worktree-reaper-stagereclaim-placeholder', 'solomon-advisory-already-answered-backpressure-parked', 'chairman-sms-backstop-reads-before-write'];
    for (const id of ids) {
      const entry = ORPHAN_ENTRIES.find((e) => e.id === id);
      expect(entry, id).toBeTruthy();
      expect(entry.entry_type, id).toBe('reads-before-the-writer');
    }
  });

  it('specimen 5 (changed_by NULL) is no-stamper-wired', () => {
    const entry = ORPHAN_ENTRIES.find((e) => e.id === 'retrospectives-audit-changed-by-null');
    expect(entry.entry_type).toBe('no-stamper-wired');
  });

  it('specimens 6, 9, 10 (disposition columns, parent metadata lag, C5 predicate) are wired-but-blind', () => {
    const ids = ['quick-fixes-guard-b-disposition-column-mismatch', 'sd-parent-metadata-children-status-lag', 'c5-w5d-audit-predicate-dead-column'];
    for (const id of ids) {
      const entry = ORPHAN_ENTRIES.find((e) => e.id === id);
      expect(entry, id).toBeTruthy();
      expect(entry.entry_type, id).toBe('wired-but-blind');
    }
  });

  it('specimen 7 (claim-eligibility-hold-provenance-coalescer) was DROPPED — premise refuted by QF-20260904-724', () => {
    const entry = ORPHAN_ENTRIES.find((e) => e.id === 'claim-eligibility-hold-provenance-coalescer');
    expect(entry).toBeUndefined();
  });

  it('specimens 2 and 4 are retained as RESOLVED taxonomy-proof specimens (fixed since sourcing)', () => {
    const resolved = ORPHAN_ENTRIES.find((e) => e.id === 'sub-agent-results-storage-unpersisted-warning');
    expect(resolved).toBeTruthy();
    expect(resolved.predicate.description).toMatch(/RESOLVED/);

    const reaper = ORPHAN_ENTRIES.find((e) => e.id === 'worktree-reaper-stagereclaim-placeholder');
    expect(reaper).toBeTruthy();
    expect(reaper.predicate.description).toMatch(/RESOLVED/);
  });

  it('specimen 12 (dispatch backpressure counter) is wired-but-blind, explicitly NOT reads-before-the-writer (Solomon 47cd9f79)', () => {
    const entry = ORPHAN_ENTRIES.find((e) => e.id === 'dispatch-backpressure-counter-informational-floor');
    expect(entry).toBeTruthy();
    expect(entry.entry_type).toBe('wired-but-blind');
  });

  it('specimen 13 (backpressure_parked no reader) is writer-with-no-reader', () => {
    const entry = ORPHAN_ENTRIES.find((e) => e.id === 'session-coordination-backpressure-parked-no-reader');
    expect(entry).toBeTruthy();
    expect(entry.entry_type).toBe('writer-with-no-reader');
  });

  it('the two BOUND 2026-09-05 specimens use their new entry_types', () => {
    const sink = ORPHAN_ENTRIES.find((e) => e.id === 'stale-session-sweep-conflicts-console-only');
    expect(sink).toBeTruthy();
    expect(sink.entry_type).toBe('detector-with-no-sink');

    const compares = ORPHAN_ENTRIES.find((e) => e.id === 'resolve-sd-workdir-branch-read-never-compared');
    expect(compares).toBeTruthy();
    expect(compares.entry_type).toBe('reads-but-never-compares');
  });

  it('detector-with-no-sink\'s sole specimen is retained as RESOLVED taxonomy proof (fixed since sourcing)', () => {
    const sink = ORPHAN_ENTRIES.find((e) => e.id === 'stale-session-sweep-conflicts-console-only');
    expect(sink.predicate.description).toMatch(/RESOLVED/);
  });
});

describe('orphan-writers-registry: module freeze', () => {
  it('ORPHAN_ENTRIES and each entry are frozen', () => {
    expect(Object.isFrozen(ORPHAN_ENTRIES)).toBe(true);
    for (const entry of ORPHAN_ENTRIES) {
      expect(Object.isFrozen(entry)).toBe(true);
    }
  });
});
