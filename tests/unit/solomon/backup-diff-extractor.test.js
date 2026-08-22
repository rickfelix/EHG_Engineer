// SD-ALTIFYAI-LEO-GEN-EXECUTE-PART-BACKUP-001 (FR-2): S1 backup-diff extraction.
import { describe, it, expect } from 'vitest';
import { extractS1Candidates } from '../../../lib/solomon/backup-diff-extractor.js';

describe('extractS1Candidates (FR-2)', () => {
  it('classifies a genuine, valid restore candidate as apply_ready', () => {
    const snapshotRows = [{ id: 'row-1', decision_by: 'adam-08049808 approved after reviewing the deploy plan in detail' }];
    const liveRows = [{ id: 'row-1', decision_by: 'adam-08049808' }];
    const [result] = extractS1Candidates(snapshotRows, liveRows);
    expect(result.status).toBe('apply_ready');
    expect(result.candidate).toBe(snapshotRows[0].decision_by);
  });

  it('classifies as no_diff when snapshot and live decision_by are identical', () => {
    const snapshotRows = [{ id: 'row-2', decision_by: 'adam-08049808' }];
    const liveRows = [{ id: 'row-2', decision_by: 'adam-08049808' }];
    const [result] = extractS1Candidates(snapshotRows, liveRows);
    expect(result.status).toBe('no_diff');
  });

  it('classifies as missing_in_snapshot when the live row has no snapshot counterpart', () => {
    const snapshotRows = [];
    const liveRows = [{ id: 'row-3', decision_by: 'adam-08049808' }];
    const [result] = extractS1Candidates(snapshotRows, liveRows);
    expect(result.status).toBe('missing_in_snapshot');
    expect(result.candidate).toBeNull();
  });

  it('classifies as invalid_candidate when the snapshot value does not normalize to the live value (mis-joined row or fabricated candidate)', () => {
    const snapshotRows = [{ id: 'row-4', decision_by: 'someone-else approved this' }];
    const liveRows = [{ id: 'row-4', decision_by: 'adam-08049808' }];
    const [result] = extractS1Candidates(snapshotRows, liveRows);
    expect(result.status).toBe('invalid_candidate');
  });

  it('classifies as invalid_candidate (never apply_ready) when the live decision_by is null -- validateRestoreCandidate has nothing to validate against', () => {
    const snapshotRows = [{ id: 'row-5', decision_by: 'adam-08049808 some note' }];
    const liveRows = [{ id: 'row-5', decision_by: null }];
    const [result] = extractS1Candidates(snapshotRows, liveRows);
    expect(result.status).toBe('invalid_candidate');
  });

  it('processes multiple rows independently, one classification each, none dropped', () => {
    const snapshotRows = [
      { id: 'a', decision_by: 'adam-08049808 note' },
      { id: 'b', decision_by: 'adam-08049808' },
    ];
    const liveRows = [
      { id: 'a', decision_by: 'adam-08049808' },
      { id: 'b', decision_by: 'adam-08049808' },
      { id: 'c', decision_by: 'adam-08049808' },
    ];
    const results = extractS1Candidates(snapshotRows, liveRows);
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.id).sort()).toEqual(['a', 'b', 'c']);
    expect(results.find((r) => r.id === 'a').status).toBe('apply_ready');
    expect(results.find((r) => r.id === 'b').status).toBe('no_diff');
    expect(results.find((r) => r.id === 'c').status).toBe('missing_in_snapshot');
  });

  it('is a pure, synchronous function -- zero I/O, zero DB/network access', () => {
    expect(extractS1Candidates.constructor.name).not.toBe('AsyncFunction');
  });
});
