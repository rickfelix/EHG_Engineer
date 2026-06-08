/**
 * Unit tests for the coordinator claimable-work predicate.
 * SD-FDBK-FIX-FIX-COORDINATOR-EMAIL-001.
 *
 * Network-free / pure: isClaimableSd is exercised against injected SD rows + an
 * injected dependency-status map. Verifies the email/audit RAG no longer counts
 * orchestrator parents or dependency-blocked children as claimable.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  TERMINAL_STATUSES,
  isTerminalStatus,
  parseDeps,
  dependencyKeys,
  isClaimableSd,
} = require('./claimable-work.cjs');

describe('isTerminalStatus', () => {
  it('treats completed/cancelled/archived/deferred as terminal, others not', () => {
    for (const s of TERMINAL_STATUSES) expect(isTerminalStatus(s)).toBe(true);
    expect(isTerminalStatus('in_progress')).toBe(false);
    expect(isTerminalStatus('draft')).toBe(false);
    expect(isTerminalStatus(undefined)).toBe(false); // unknown dep status = unmet (conservative)
  });
});

describe('parseDeps — tolerant of the three dependency shapes', () => {
  it('extracts sd_id, sd_key, and bare-string deps; ignores empties', () => {
    expect(parseDeps({ dependencies: [{ sd_id: 'A' }, { sd_key: 'B' }, 'C', null, {}] })).toEqual(['A', 'B', 'C']);
    expect(parseDeps({ dependencies: null })).toEqual([]);
    expect(parseDeps({})).toEqual([]);
    expect(parseDeps(null)).toEqual([]);
  });
});

describe('dependencyKeys — dedup across rows', () => {
  it('returns the distinct set of dependency keys', () => {
    const rows = [
      { dependencies: [{ sd_id: 'A' }, { sd_key: 'B' }] },
      { dependencies: ['B', 'C'] },
      { dependencies: [] },
    ];
    expect(dependencyKeys(rows).sort()).toEqual(['A', 'B', 'C']);
    expect(dependencyKeys([])).toEqual([]);
  });
});

describe('isClaimableSd — the RAG fix', () => {
  it('EXCLUDES orchestrator parents (auto-complete on children)', () => {
    expect(isClaimableSd({ sd_type: 'orchestrator', dependencies: [] }, {})).toBe(false);
  });

  it('INCLUDES a normal non-orchestrator SD with no dependencies', () => {
    expect(isClaimableSd({ sd_type: 'bugfix', dependencies: [] }, {})).toBe(true);
    expect(isClaimableSd({ sd_type: 'feature' }, {})).toBe(true); // missing dependencies = none
  });

  it('EXCLUDES a child with an unmet (non-terminal) dependency', () => {
    const child = { sd_type: 'feature', dependencies: [{ sd_id: 'BLOCKER' }] };
    expect(isClaimableSd(child, { BLOCKER: 'in_progress' })).toBe(false);
  });

  it('INCLUDES a child whose dependencies are all terminal', () => {
    const child = { sd_type: 'feature', dependencies: [{ sd_id: 'A' }, { sd_key: 'B' }] };
    expect(isClaimableSd(child, { A: 'completed', B: 'cancelled' })).toBe(true);
  });

  it('EXCLUDES a child whose dependency status is UNKNOWN (conservative)', () => {
    const child = { sd_type: 'feature', dependencies: ['MISSING'] };
    expect(isClaimableSd(child, {})).toBe(false);
  });

  it('returns false for a null/undefined SD', () => {
    expect(isClaimableSd(null, {})).toBe(false);
    expect(isClaimableSd(undefined)).toBe(false);
  });

  it('models the false-RED scenario: only the claimable SD counts as remaining', () => {
    const depStatus = { FOUND: 'in_progress' }; // a blocker that is NOT done
    const rows = [
      { sd_key: 'BUILDING', sd_type: 'bugfix', dependencies: [] },          // claimable (a worker is on it)
      { sd_key: 'PARENT', sd_type: 'orchestrator', dependencies: [] },      // excluded — parent
      { sd_key: 'CHILD', sd_type: 'feature', dependencies: [{ sd_id: 'FOUND' }] }, // excluded — blocked
    ];
    const claimable = rows.filter(s => isClaimableSd(s, depStatus)).map(r => r.sd_key);
    expect(claimable).toEqual(['BUILDING']); // parent + blocked child no longer inflate `remaining`
  });
});
