// SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-C (FR-4 / TS-6)
import { describe, it, expect } from 'vitest';
import {
  guardPresent,
  hasFetchMockEvidence,
  importsNonNetworkOnly,
  selfTest,
} from '../../../scripts/lint/transport-test-isolation-guard-lint.mjs';

describe('transport-test-isolation-guard-lint', () => {
  it('self-test passes against the live extractors', () => {
    expect(selfTest()).toBeNull();
  });

  describe('guardPresent', () => {
    it('detects a present shouldRefuseRealSend( call', () => {
      expect(guardPresent('if (shouldRefuseRealSend()) { return refused; }')).toBe(true);
    });

    it('is a seeded-defect self-test: reports absent when the guard is removed', () => {
      expect(guardPresent('// the guard clause used to be here, now deleted')).toBe(false);
    });
  });

  describe('hasFetchMockEvidence', () => {
    it('detects vi.stubGlobal(\'fetch\', ...)', () => {
      expect(hasFetchMockEvidence("vi.stubGlobal('fetch', fetchMock);")).toBe(true);
    });

    it('detects a direct global.fetch assignment', () => {
      expect(hasFetchMockEvidence('global.fetch = mockFetch;')).toBe(true);
    });

    it('detects a vi.mock() of the transport module itself', () => {
      expect(hasFetchMockEvidence("vi.mock('../../../lib/notifications/resend-adapter.js', () => ({ sendEmail: vi.fn() }));")).toBe(true);
    });

    it('reports no evidence for an unrelated file', () => {
      expect(hasFetchMockEvidence('// no mocking here at all')).toBe(false);
    });
  });

  describe('importsNonNetworkOnly', () => {
    it('detects a pure verifyInboundSignature-only import', () => {
      expect(importsNonNetworkOnly("import { verifyInboundSignature } from '../../../lib/messaging/providers/twilio-provider.js';")).toBe(true);
    });

    it('does not flag an import of send()', () => {
      expect(importsNonNetworkOnly("import { send } from '../../../lib/messaging/providers/twilio-provider.js';")).toBe(false);
    });
  });
});
