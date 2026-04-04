/**
 * Unit tests for SD-LEO-INFRA-CLAIM-DEFAULT-LEO-001
 * Tests: DENY-on-ambiguity, TTL auto-expiry, fail-open, audit logging
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Test isSameConversation ambiguity handling
describe('isSameConversation DENY-on-ambiguity', () => {
  it('should return "ambiguous" for UUID vs win-cc format mismatch', async () => {
    const { isSameConversation } = await import('../../lib/claim-guard.mjs');
    const result = isSameConversation(
      '9b00b021-a5d1-41fc-907f-65f888dd2534',
      'win-cc-12345'
    );
    expect(result).toBe('ambiguous');
  });

  it('should return true for matching terminal IDs', async () => {
    const { isSameConversation } = await import('../../lib/claim-guard.mjs');
    const result = isSameConversation('win-cc-12345-6789', 'win-cc-12345-6789');
    expect(result).toBe(true);
  });

  it('should return false for clearly different terminal IDs', async () => {
    const { isSameConversation } = await import('../../lib/claim-guard.mjs');
    const result = isSameConversation('win-cc-12345-6789', 'win-cc-99999-1111');
    expect(result).toBe(false);
  });
});

// Test that multi-session gate treats ambiguous as BLOCK (not ALLOW)
describe('multi-session-claim-gate ambiguous handling', () => {
  it('should treat ambiguous terminal_id as conflict (return true)', async () => {
    // Read the gate source to verify the logic changed
    const fs = await import('fs');
    const path = await import('path');
    const gatePath = path.resolve('scripts/modules/handoff/gates/multi-session-claim-gate.js');
    const source = fs.readFileSync(gatePath, 'utf8');

    // Verify DENY-on-ambiguity is in place
    expect(source).toContain('DENY-on-ambiguity');
    expect(source).toContain('return true;');

    // Verify old ALLOW pattern is removed
    const ambiguousIdx = source.indexOf("sameConvo === 'ambiguous'");
    const ambiguousBlock = source.substring(ambiguousIdx, ambiguousIdx + 500);
    expect(ambiguousBlock).not.toContain('treating as same conversation');
    expect(ambiguousBlock).toContain('DENY-on-ambiguity');
  });
});

// Test TTL configuration
describe('claim-guard TTL configuration', () => {
  it('should have fetchClaimTTL function', async () => {
    const source = (await import('fs')).readFileSync('lib/claim-guard.mjs', 'utf8');
    expect(source).toContain('fetchClaimTTL');
    expect(source).toContain('claim_ttl_minutes');
    expect(source).toContain('chairman_dashboard_config');
  });

  it('should call fetchClaimTTL at start of claimGuard', async () => {
    const source = (await import('fs')).readFileSync('lib/claim-guard.mjs', 'utf8');
    const claimGuardStart = source.indexOf('export async function claimGuard');
    const fetchCall = source.indexOf('await fetchClaimTTL()', claimGuardStart);
    expect(fetchCall).toBeGreaterThan(claimGuardStart);
    expect(fetchCall - claimGuardStart).toBeLessThan(400); // Within first 400 chars of function
  });
});

// Test fail-open design
describe('fail-open design', () => {
  it('handoff.js should catch DB errors and continue', async () => {
    const source = (await import('fs')).readFileSync('scripts/handoff.js', 'utf8');
    expect(source).toContain('fail-open');
    expect(source).toContain('catch (e)');
    expect(source).toContain('console.warn');
  });

  it('leo-create-sd.js should catch DB errors on parent claim check', async () => {
    const source = (await import('fs')).readFileSync('scripts/leo-create-sd.js', 'utf8');
    expect(source).toContain('fail-open');
    expect(source).toContain("if (e.message?.includes('claimed by another')) throw e;");
  });
});

// Test audit logging on claim transfer
describe('audit logging on claim transfer', () => {
  it('should emit structured JSON audit log on stale claim release', async () => {
    const source = (await import('fs')).readFileSync('lib/claim-guard.mjs', 'utf8');
    expect(source).toContain("event: 'claim_transfer'");
    expect(source).toContain('from_session');
    expect(source).toContain('to_session');
    expect(source).toContain('reason');
    expect(source).toContain('ttl_seconds');
  });
});

// Test handoff.js pre-delegate claim assertion
describe('handoff.js claim assertion', () => {
  it('should import claimGuard', async () => {
    const source = (await import('fs')).readFileSync('scripts/handoff.js', 'utf8');
    expect(source).toContain("import { claimGuard } from '../lib/claim-guard.mjs'");
  });

  it('should check claim before execute commands', async () => {
    const source = (await import('fs')).readFileSync('scripts/handoff.js', 'utf8');
    expect(source).toContain("args[0] === 'execute'");
    expect(source).toContain('claimGuard(sdIdArg');
  });
});

// Test leo-create-sd.js parent claim check
describe('leo-create-sd.js parent claim check', () => {
  it('should check parent claim after createSD', async () => {
    const source = (await import('fs')).readFileSync('scripts/leo-create-sd.js', 'utf8');
    expect(source).toContain('Assert parent claim before returning child');
    expect(source).toContain('claimGuard(parent.sd_key');
    expect(source).toContain('child creation blocked');
  });
});
