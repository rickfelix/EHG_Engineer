import { describe, it, expect } from 'vitest';
import { ORPHAN_ENTRIES, ENTRY_TYPES, validateOrphanEntry, validateAllEntries } from '../../../lib/governance/orphan-writers-registry.js';
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
  const PINNED_TOTAL_ENTRIES = 15;

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

describe('orphan-writers-registry: module freeze', () => {
  it('ORPHAN_ENTRIES and each entry are frozen', () => {
    expect(Object.isFrozen(ORPHAN_ENTRIES)).toBe(true);
    for (const entry of ORPHAN_ENTRIES) {
      expect(Object.isFrozen(entry)).toBe(true);
    }
  });
});
