/**
 * Tests for session-check-concurrency.js helpers (FR-1 + FR-7).
 * SD-LEO-INFRA-CROSS-HOST-CONCURRENT-001
 *
 * Covers 10 cases:
 *  - categorizeSessionForContention (FR-1 widening): 6 cases
 *  - detectSdKeyDrift (FR-7): 4 cases
 */

import { describe, test, expect } from 'vitest';
import {
  categorizeSessionForContention,
  detectSdKeyDrift,
} from '../../../scripts/session-check-concurrency.js';

describe('FR-1: categorizeSessionForContention — widened post-filter', () => {
  test('active session always surfaces (no regression)', () => {
    const s = { computed_status: 'active', has_uncommitted_changes: false };
    expect(categorizeSessionForContention(s)).toBe('active');
  });

  test('active session with uncommitted writes surfaces as active (preserved)', () => {
    const s = { computed_status: 'active', has_uncommitted_changes: true };
    expect(categorizeSessionForContention(s)).toBe('active');
  });

  test('idle session with uncommitted writes surfaces (FR-1 rescope core)', () => {
    const s = { computed_status: 'idle', has_uncommitted_changes: true };
    expect(categorizeSessionForContention(s)).toBe('idle_uncommitted');
  });

  test('stale_cleanup session with uncommitted writes surfaces (FR-1 rescope core)', () => {
    const s = { computed_status: 'stale_cleanup', has_uncommitted_changes: true };
    expect(categorizeSessionForContention(s)).toBe('stale_uncommitted');
  });

  test('idle session WITHOUT uncommitted writes does NOT surface', () => {
    const s = { computed_status: 'idle', has_uncommitted_changes: false };
    expect(categorizeSessionForContention(s)).toBe('inactive');
  });

  test('null session returns inactive (defensive)', () => {
    expect(categorizeSessionForContention(null)).toBe('inactive');
    expect(categorizeSessionForContention(undefined)).toBe('inactive');
  });
});

describe('FR-7: detectSdKeyDrift — sd_key tag drift detection', () => {
  test('matching sd_key reports aligned', () => {
    const s = { sd_key: 'SD-LEO-INFRA-FOO-001' };
    expect(detectSdKeyDrift(s, 'SD-LEO-INFRA-FOO-001')).toBe('aligned');
  });

  test('null peer sd_key on active branch reports drift (incident root cause class)', () => {
    const s = { sd_key: null };
    expect(detectSdKeyDrift(s, 'SD-LEO-INFRA-FOO-001')).toBe('drift');
  });

  test('peer sd_key differs from active claim reports drift', () => {
    const s = { sd_key: 'SD-LEO-INFRA-BAR-002' };
    expect(detectSdKeyDrift(s, 'SD-LEO-INFRA-FOO-001')).toBe('drift');
  });

  test('no active claim returns unknown (cannot determine drift)', () => {
    const s = { sd_key: 'SD-LEO-INFRA-FOO-001' };
    expect(detectSdKeyDrift(s, null)).toBe('unknown');
    expect(detectSdKeyDrift(null, 'SD-LEO-INFRA-FOO-001')).toBe('unknown');
  });
});
