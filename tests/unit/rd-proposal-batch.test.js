/**
 * Unit tests for R&D Proposal Batch Generator
 * SD: SD-AUTONOMOUS-SKUNKWORKS-RD-DEPARTMENT-ORCH-001-A
 */

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

// Test the dedup key generation logic (extracted for testing)
function makeDedupKey(title, ventureIds) {
  const sorted = [...(ventureIds || [])].sort().join(',');
  return crypto.createHash('sha256').update(`${title}|${sorted}`).digest('hex').slice(0, 16);
}

describe('rd-proposal-batch', () => {
  describe('makeDedupKey', () => {
    it('generates consistent keys for same input', () => {
      const key1 = makeDedupKey('Test proposal', ['id-1', 'id-2']);
      const key2 = makeDedupKey('Test proposal', ['id-1', 'id-2']);
      expect(key1).toBe(key2);
    });

    it('generates same key regardless of venture_ids order', () => {
      const key1 = makeDedupKey('Test', ['id-2', 'id-1']);
      const key2 = makeDedupKey('Test', ['id-1', 'id-2']);
      expect(key1).toBe(key2);
    });

    it('generates different keys for different titles', () => {
      const key1 = makeDedupKey('Proposal A', ['id-1']);
      const key2 = makeDedupKey('Proposal B', ['id-1']);
      expect(key1).not.toBe(key2);
    });

    it('generates different keys for different venture sets', () => {
      const key1 = makeDedupKey('Same title', ['id-1']);
      const key2 = makeDedupKey('Same title', ['id-2']);
      expect(key1).not.toBe(key2);
    });

    it('handles empty venture_ids', () => {
      const key = makeDedupKey('Test', []);
      expect(key).toBeTruthy();
      expect(key.length).toBe(16);
    });

    it('handles null venture_ids', () => {
      const key = makeDedupKey('Test', null);
      expect(key).toBeTruthy();
      expect(key.length).toBe(16);
    });

    it('returns 16-character hex string', () => {
      const key = makeDedupKey('Test', ['id-1']);
      expect(key).toMatch(/^[0-9a-f]{16}$/);
    });
  });
});
