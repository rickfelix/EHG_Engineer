/**
 * SD-LEO-FIX-SPECIFIED-PRIMARY-RELEASE-001 (FR-5): one-time backfill for terminal QFs still
 * carrying a stale oracle-hold marker.
 */
import { describe, it, expect } from 'vitest';
import {
  parseArgs, isTerminalOracleHoldResidue, findCandidates,
} from '../../../scripts/one-off/backfill-terminal-oracle-hold-markers.mjs';

describe('parseArgs', () => {
  it('defaults to dry-run (execute:false) with no flags', () => {
    expect(parseArgs([])).toEqual({ execute: false, restoreFile: null });
  });
  it('parses --execute', () => {
    expect(parseArgs(['--execute'])).toEqual({ execute: true, restoreFile: null });
  });
  it('parses --restore <file>', () => {
    expect(parseArgs(['--restore', 'snap.json'])).toEqual({ execute: false, restoreFile: 'snap.json' });
  });
  it('--dry-run explicitly forces execute:false even after --execute', () => {
    expect(parseArgs(['--execute', '--dry-run'])).toEqual({ execute: false, restoreFile: null });
  });
});

describe('isTerminalOracleHoldResidue (selection predicate)', () => {
  it('matches a terminal QF still carrying the oracle-hold marker', () => {
    expect(isTerminalOracleHoldResidue({
      status: 'completed', owner: 'chairman', release_condition: '[oracle_read_pending] review_at=x :: y',
    })).toBe(true);
    expect(isTerminalOracleHoldResidue({
      status: 'closed', owner: 'chairman', release_condition: '[oracle_read_pending] review_at=x :: y',
    })).toBe(true);
  });

  it('does NOT match a non-terminal status', () => {
    expect(isTerminalOracleHoldResidue({
      status: 'open', owner: 'chairman', release_condition: '[oracle_read_pending] review_at=x :: y',
    })).toBe(false);
  });

  it('does NOT match a genuine chairman gate (no oracle-hold prefix)', () => {
    expect(isTerminalOracleHoldResidue({
      status: 'completed', owner: 'chairman', release_condition: 'EU-send-planned',
    })).toBe(false);
  });

  it('does NOT match a row with no chairman owner', () => {
    expect(isTerminalOracleHoldResidue({
      status: 'completed', owner: null, release_condition: '[oracle_read_pending] review_at=x :: y',
    })).toBe(false);
  });
});

describe('findCandidates', () => {
  it('queries with the exact selection predicate and returns matching rows', async () => {
    const rows = [{ id: 'QF-1', status: 'completed', owner: 'chairman', release_condition: '[oracle_read_pending] x' }];
    let capturedFilters = [];
    const supabase = {
      from: () => ({
        select: () => ({
          in: (col, vals) => { capturedFilters.push({ op: 'in', col, vals }); return { eq: (col2, val2) => { capturedFilters.push({ op: 'eq', col: col2, val: val2 }); return { like: (col3, val3) => { capturedFilters.push({ op: 'like', col: col3, val: val3 }); return Promise.resolve({ data: rows, error: null }); } }; } }; },
        }),
      }),
    };
    const result = await findCandidates(supabase);
    expect(result).toEqual(rows);
    expect(capturedFilters).toContainEqual({ op: 'in', col: 'status', vals: ['completed', 'closed'] });
    expect(capturedFilters).toContainEqual({ op: 'eq', col: 'owner', val: 'chairman' });
    expect(capturedFilters).toContainEqual({ op: 'like', col: 'release_condition', val: '[oracle_read_pending]%' });
  });

  it('throws on a query error rather than silently returning empty', async () => {
    const supabase = {
      from: () => ({ select: () => ({ in: () => ({ eq: () => ({ like: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }) }) }),
    };
    await expect(findCandidates(supabase)).rejects.toThrow(/boom/);
  });
});
