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

// SD-REFILL-00XE6T7E: parseDeps now delegates to the canonical /^SD-/ resolver, so dependency
// fixtures must be real SD-keys (non-SD-key prose is intentionally dropped — see claimable-work.test
// in tests/unit/coordinator/ for the prose-filter cases).
describe('parseDeps — tolerant of the three dependency shapes', () => {
  it('extracts sd_id, sd_key, and bare-string SD-key deps; ignores empties + non-SD-key strings', () => {
    expect(parseDeps({ dependencies: [{ sd_id: 'SD-A-001' }, { sd_key: 'SD-B-001' }, 'SD-C-001', null, {}] })).toEqual(['SD-A-001', 'SD-B-001', 'SD-C-001']);
    expect(parseDeps({ dependencies: null })).toEqual([]);
    expect(parseDeps({})).toEqual([]);
    expect(parseDeps(null)).toEqual([]);
  });
});

describe('dependencyKeys — dedup across rows', () => {
  it('returns the distinct set of dependency keys', () => {
    const rows = [
      { dependencies: [{ sd_id: 'SD-A-001' }, { sd_key: 'SD-B-001' }] },
      { dependencies: ['SD-B-001', 'SD-C-001'] },
      { dependencies: [] },
    ];
    expect(dependencyKeys(rows).sort()).toEqual(['SD-A-001', 'SD-B-001', 'SD-C-001']);
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
    const child = { sd_type: 'feature', dependencies: [{ sd_id: 'SD-BLOCKER-001' }] };
    expect(isClaimableSd(child, { 'SD-BLOCKER-001': 'in_progress' })).toBe(false);
  });

  it('INCLUDES a child whose dependencies are all terminal', () => {
    const child = { sd_type: 'feature', dependencies: [{ sd_id: 'SD-A-001' }, { sd_key: 'SD-B-001' }] };
    expect(isClaimableSd(child, { 'SD-A-001': 'completed', 'SD-B-001': 'cancelled' })).toBe(true);
  });

  it('EXCLUDES a child whose (real SD-key) dependency status is UNKNOWN (conservative)', () => {
    const child = { sd_type: 'feature', dependencies: ['SD-MISSING-001'] };
    expect(isClaimableSd(child, {})).toBe(false);
  });

  it('returns false for a null/undefined SD', () => {
    expect(isClaimableSd(null, {})).toBe(false);
    expect(isClaimableSd(undefined)).toBe(false);
  });

  it('models the false-RED scenario: only the claimable SD counts as remaining', () => {
    const depStatus = { 'SD-FOUND-001': 'in_progress' }; // a blocker that is NOT done
    const rows = [
      { sd_key: 'BUILDING', sd_type: 'bugfix', dependencies: [] },          // claimable (a worker is on it)
      { sd_key: 'PARENT', sd_type: 'orchestrator', dependencies: [] },      // excluded — parent
      { sd_key: 'CHILD', sd_type: 'feature', dependencies: [{ sd_id: 'SD-FOUND-001' }] }, // excluded — blocked
    ];
    const claimable = rows.filter(s => isClaimableSd(s, depStatus)).map(r => r.sd_key);
    expect(claimable).toEqual(['BUILDING']); // parent + blocked child no longer inflate `remaining`
  });
});
