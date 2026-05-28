/**
 * Unit tests for lib/handoff/gate-skip-detection.js
 * SD-LEO-INFRA-CONSOLIDATE-DUAL-DETECTION-001 FR-4
 *
 * Two predicates: type-based skip and status-based skip. Each returns a {skip, reason}
 * pair so consumers can log structured rationale alongside the decision.
 */

import { describe, it, expect } from 'vitest';
import {
  shouldSkipForType,
  shouldSkipForStatus,
} from '../../../lib/handoff/gate-skip-detection.js';

describe('shouldSkipForType', () => {
  it('returns skip=true when sd_type is not in applicable set', () => {
    const r = shouldSkipForType({ sd_type: 'feature' }, ['refactor', 'documentation'], { gateName: 'adrs' });
    expect(r.skip).toBe(true);
    expect(r.reason).toMatch(/adrs/);
    expect(r.reason).toMatch(/feature/);
  });

  it('returns skip=false when sd_type IS in applicable set', () => {
    const r = shouldSkipForType({ sd_type: 'refactor' }, ['refactor'], { gateName: 'adrs' });
    expect(r.skip).toBe(false);
    expect(r.reason).toMatch(/refactor/);
  });

  it('accepts Set as applicableTypes', () => {
    const r = shouldSkipForType({ sd_type: 'refactor' }, new Set(['refactor']));
    expect(r.skip).toBe(false);
  });

  it('returns skip=true with null-sd reason when sd is null', () => {
    const r = shouldSkipForType(null, ['feature']);
    expect(r.skip).toBe(true);
    expect(r.reason).toMatch(/null/);
  });

  it('returns skip=false default-include when applicableTypes is empty', () => {
    const r = shouldSkipForType({ sd_type: 'feature' }, []);
    expect(r.skip).toBe(false);
    expect(r.reason).toMatch(/default-include/);
  });

  it('returns skip=false default-include when sd_type is missing', () => {
    const r = shouldSkipForType({}, ['feature']);
    expect(r.skip).toBe(false);
    expect(r.reason).toMatch(/default-include/);
  });

  it('delegates to classifySDType — picks up metadata.is_orchestrator if sd_type missing', () => {
    const r = shouldSkipForType({ metadata: { is_orchestrator: true } }, ['orchestrator']);
    expect(r.skip).toBe(false);
  });
});

describe('shouldSkipForStatus', () => {
  it('returns skip=true when status is not applicable', () => {
    const r = shouldSkipForStatus({ status: 'draft' }, ['in_progress'], { gateName: 'verify' });
    expect(r.skip).toBe(true);
    expect(r.reason).toMatch(/draft/);
  });

  it('returns skip=false when status IS applicable', () => {
    const r = shouldSkipForStatus({ status: 'in_progress' }, ['in_progress']);
    expect(r.skip).toBe(false);
  });

  it('returns skip=true with null-sd reason when sd is null', () => {
    const r = shouldSkipForStatus(null, ['active']);
    expect(r.skip).toBe(true);
  });

  it('returns skip=false default-include when applicableStatuses is empty', () => {
    const r = shouldSkipForStatus({ status: 'draft' }, []);
    expect(r.skip).toBe(false);
    expect(r.reason).toMatch(/default-include/);
  });
});
