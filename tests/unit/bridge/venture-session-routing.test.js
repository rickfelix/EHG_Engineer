import { describe, it, expect, vi } from 'vitest';
import { detectVentureContext, groupByVenture } from '../../../lib/eva/bridge/venture-session-routing.js';

describe('venture-session-routing', () => {
  describe('detectVentureContext', () => {
    it('detects venture from vision_key in metadata', () => {
      const sd = {
        sd_key: 'SD-LEO-INFRA-VENTURE-LEO-BUILD-001-A',
        metadata: { vision_key: 'VISION-VENTURE-LEO-BRIDGE-L2-001', parent_key: 'SD-LEO-INFRA-VENTURE-LEO-BUILD-001' }
      };
      const result = detectVentureContext(sd);
      expect(result.ventureName).toBe('venture leo bridge');
      expect(result.orchestratorKey).toBe('SD-LEO-INFRA-VENTURE-LEO-BUILD-001');
    });

    it('returns null for SDs without venture context', () => {
      const sd = { sd_key: 'SD-FIX-NAV-001', metadata: {} };
      const result = detectVentureContext(sd);
      expect(result.ventureName).toBeNull();
      expect(result.orchestratorKey).toBeNull();
    });

    it('handles SD with parent_sd_id but no vision_key', () => {
      const sd = { sd_key: 'SD-CHILD-001', parent_sd_id: 'uuid-123', metadata: {} };
      const result = detectVentureContext(sd);
      expect(result.ventureName).toBe('orchestrator:uuid-123');
      expect(result.orchestratorKey).toBe('uuid-123');
    });

    it('handles null metadata', () => {
      const sd = { sd_key: 'SD-TEST-001', metadata: null };
      const result = detectVentureContext(sd);
      expect(result.ventureName).toBeNull();
    });
  });

  describe('groupByVenture', () => {
    it('groups SDs by venture context', () => {
      const sds = [
        { sd_key: 'SD-V1-A', metadata: { vision_key: 'VISION-ALPHA-L2-001' } },
        { sd_key: 'SD-V1-B', metadata: { vision_key: 'VISION-ALPHA-L2-001' } },
        { sd_key: 'SD-V2-A', metadata: { vision_key: 'VISION-BETA-L2-001' } },
        { sd_key: 'SD-STANDALONE', metadata: {} },
      ];
      const groups = groupByVenture(sds);
      expect(groups.get('alpha')).toHaveLength(2);
      expect(groups.get('beta')).toHaveLength(1);
      expect(groups.get('_standalone')).toHaveLength(1);
    });

    it('returns single group for all standalone SDs', () => {
      const sds = [
        { sd_key: 'SD-A', metadata: {} },
        { sd_key: 'SD-B', metadata: {} },
      ];
      const groups = groupByVenture(sds);
      expect(groups.size).toBe(1);
      expect(groups.get('_standalone')).toHaveLength(2);
    });

    it('handles empty array', () => {
      const groups = groupByVenture([]);
      expect(groups.size).toBe(0);
    });
  });
});
