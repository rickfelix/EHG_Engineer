/**
 * SD-LEO-INFRA-TIERED-SOURCING-CLAIM-001 (FR-2/FR-3): lib/fleet/off-canonical-mint-gauge.js
 * Covers TS-3.
 */
import { describe, it, expect } from 'vitest';
import { detectOffCanonicalMints, isFixtureQf, hasRiskSignal } from '../../../lib/fleet/off-canonical-mint-gauge.js';

describe('detectOffCanonicalMints', () => {
  it('TS-3: an open QF with NULL routing_tier is flagged', () => {
    const qfs = [{ id: 'QF-1', status: 'open', routing_tier: null, title: 'fix a typo' }];
    const { count, flagged } = detectOffCanonicalMints(qfs);
    expect(count).toBe(1);
    expect(flagged[0].id).toBe('QF-1');
  });

  it('TS-3 (false-positive check): a canonical open QF with routing_tier assigned is NOT flagged', () => {
    const qfs = [{ id: 'QF-2', status: 'open', routing_tier: 1, title: 'fix a typo' }];
    expect(detectOffCanonicalMints(qfs).count).toBe(0);
  });

  it('a non-open QF with NULL routing_tier is not flagged (scope: open lane only)', () => {
    const qfs = [{ id: 'QF-3', status: 'in_progress', routing_tier: null }];
    expect(detectOffCanonicalMints(qfs).count).toBe(0);
  });

  it('a fixture QF id is excluded even when open + NULL routing_tier', () => {
    const qfs = [{ id: 'QF-TEST-1', status: 'open', routing_tier: null }];
    expect(detectOffCanonicalMints(qfs).count).toBe(0);
    expect(isFixtureQf({ id: 'QF-TEST-1' })).toBe(true);
    expect(isFixtureQf({ id: 'QF-20260830-901' })).toBe(false);
  });

  it('carries a risk-signal advisory hint (FR-3 reuse of work-item-router keywords) without re-deriving the tier', () => {
    const flagged = detectOffCanonicalMints([{ id: 'QF-4', status: 'open', routing_tier: null, title: 'fix auth token bug' }]).flagged;
    expect(flagged[0].riskSignal).toBe(true);
    expect(hasRiskSignal({ title: 'fix a typo', description: '' })).toBe(false);
  });

  it('handles empty/undefined input', () => {
    expect(detectOffCanonicalMints([]).count).toBe(0);
    expect(detectOffCanonicalMints(undefined).count).toBe(0);
  });
});
