/**
 * SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-H — capability-harvest interface stub tests
 * (PRD FR-3, TS-5). Proves the interface is callable now and correctly defers the
 * real write until Child E's venture_capability_ledger lands, without creating a
 * competing table (TS-6) or writing to the unrelated SD-scoped sd_capabilities store.
 */
import { describe, it, expect } from 'vitest';
import { harvestCapabilityAtExit, WRITE_TARGET } from '../../lib/eva/lifecycle/exit-capability-harvest.js';

describe('harvestCapabilityAtExit', () => {
  it('accepts a well-formed payload without throwing (TS-5)', () => {
    const result = harvestCapabilityAtExit({
      ventureId: 'venture-1',
      capability: 'clerk-registration-api-pattern',
      evidence: 'SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-B2',
      sourceDecisionId: 'decision-1',
    });
    expect(result.ventureId).toBe('venture-1');
    expect(result.capability).toBe('clerk-registration-api-pattern');
  });

  it('defers the real write until Child E lands (WRITE_TARGET unset) — interface proven, not faked', () => {
    expect(WRITE_TARGET).toBeNull();
    const result = harvestCapabilityAtExit({
      ventureId: 'v1',
      capability: 'c1',
      evidence: 'e1',
      sourceDecisionId: 'd1',
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toMatch(/venture_capability_ledger not yet landed/);
  });

  it('requires all four fields', () => {
    expect(() => harvestCapabilityAtExit({ ventureId: 'v1' })).toThrow();
    expect(() => harvestCapabilityAtExit({})).toThrow();
  });

  it('TS-6/RISK a08f9f05: the executable code never writes to sd_capabilities (a different, SD-scoped ledger)', async () => {
    const rawSource = (await import('node:fs')).readFileSync(
      new URL('../../lib/eva/lifecycle/exit-capability-harvest.js', import.meta.url),
      'utf8',
    );
    // Strip comments — the file's own doc comment names sd_capabilities to explain
    // why it's NOT the write target, which would otherwise trip a naive substring search.
    const codeOnly = rawSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(codeOnly.includes('sd_capabilities')).toBe(false);
  });
});
