import { describe, it, expect } from 'vitest';
import { ORPHAN_ENTRIES, validateOrphanEntry, validateAllEntries } from '../../../lib/governance/orphan-writers-registry.js';
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

  it('reader-with-no-writer: passes with reader+producer_gap and no writer field (QF-20260830-853)', () => {
    const result = validateOrphanEntry({
      id: 'fixture-reader-no-writer',
      entry_type: 'reader-with-no-writer',
      reader: { file: 'fixture-reader.js', description: 'a reader' },
      producer_gap: { description: 'nothing ever wrote this' },
    });
    expect(result.valid).toBe(true);
  });

  it('reader-with-no-writer: fails without a producer_gap', () => {
    const result = validateOrphanEntry({
      id: 'fixture-reader-no-gap',
      entry_type: 'reader-with-no-writer',
      reader: { file: 'fixture-reader.js', description: 'a reader' },
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/producer_gap/);
  });

  it('reader-with-no-writer: fails without a reader (the inverse type still requires SOME consuming reader)', () => {
    const result = validateOrphanEntry({
      id: 'fixture-reader-no-writer-no-reader',
      entry_type: 'reader-with-no-writer',
      producer_gap: { description: 'nothing ever wrote this' },
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/reader/i);
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

describe('orphan-writers-registry: entry-type coverage (SD success criterion 2)', () => {
  it('has at least one real specimen per entry_type', () => {
    const types = new Set(ORPHAN_ENTRIES.map((e) => e.entry_type));
    expect(types.has('wired-but-blind')).toBe(true);
    expect(types.has('no-stamper-wired')).toBe(true);
    expect(types.has('shipped-but-not-applied')).toBe(true);
    expect(types.has('reader-with-no-writer')).toBe(true);
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

  it('the reader-with-no-writer specimen names its reader and the producer gap, with no writer field (QF-20260830-853)', () => {
    const entry = ORPHAN_ENTRIES.find((e) => e.entry_type === 'reader-with-no-writer');
    expect(entry).toBeTruthy();
    expect(entry.reader?.file).toBe('lib/checkin/steps/seat-busy-fence.cjs');
    expect(entry.producer_gap?.description).toBeTruthy();
    expect(entry.writer).toBeUndefined();
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
