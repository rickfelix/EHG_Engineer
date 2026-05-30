/**
 * Unit tests for lib/sd/type-detection.js
 * SD-LEO-INFRA-CONSOLIDATE-DUAL-DETECTION-001 FR-2
 *
 * Test surface mirrors lib/handoff/parent-detection.js precedent: OR-merge of all
 * signals, sync vs async variants, WeakMap cache semantics, missing-input defaults.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  isOrchestrator,
  isOrchestratorSync,
  isVenture,
  isVentureSync,
  isInfraNoVenture,
  isInfraNoVentureSync,
  classifySDType,
  _clearCache,
} from '../../../lib/sd/type-detection.js';

// Mock supabase factory: stub .from().select().eq().limit() returning { data, error }
function makeSupabase({ children = [], error = null } = {}) {
  const calls = { from: 0, eq: 0 };
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn(function (col, val) {
      calls.eq++;
      this._lastEq = { col, val };
      return this;
    }),
    limit: vi.fn().mockResolvedValue({ data: children, error }),
  };
  return {
    from: vi.fn(() => {
      calls.from++;
      return builder;
    }),
    _calls: calls,
  };
}

describe('isOrchestrator (async, OR-merged)', () => {
  it('returns true when sd_type === "orchestrator" without consulting DB', async () => {
    const sd = { id: 'sd-1', sd_type: 'orchestrator' };
    const supabase = makeSupabase();
    await expect(isOrchestrator(sd, supabase)).resolves.toBe(true);
    expect(supabase._calls.from).toBe(0);
  });

  it('returns true when metadata.is_orchestrator === true even if sd_type is feature', async () => {
    const sd = { id: 'sd-2', sd_type: 'feature', metadata: { is_orchestrator: true } };
    const supabase = makeSupabase();
    await expect(isOrchestrator(sd, supabase)).resolves.toBe(true);
    expect(supabase._calls.from).toBe(0);
  });

  it('returns true when metadata.is_parent === true (legacy flag) even if sd_type is infrastructure', async () => {
    const sd = { id: 'sd-3', sd_type: 'infrastructure', metadata: { is_parent: true } };
    const supabase = makeSupabase();
    await expect(isOrchestrator(sd, supabase)).resolves.toBe(true);
    expect(supabase._calls.from).toBe(0);
  });

  it('returns true when sd_type and metadata are not orchestrator-y but DB has child rows', async () => {
    const sd = { id: 'sd-4', sd_type: 'feature' };
    const supabase = makeSupabase({ children: [{ id: 'child-1' }] });
    await expect(isOrchestrator(sd, supabase)).resolves.toBe(true);
    expect(supabase._calls.from).toBe(1);
  });

  it('returns false when sd_type is feature, no metadata flags, and DB returns 0 children', async () => {
    const sd = { id: 'sd-5', sd_type: 'feature' };
    const supabase = makeSupabase({ children: [] });
    await expect(isOrchestrator(sd, supabase)).resolves.toBe(false);
  });

  it('returns false when DB query errors (treats error as "no children")', async () => {
    const sd = { id: 'sd-6', sd_type: 'feature' };
    const supabase = makeSupabase({ error: { message: 'connection refused' } });
    await expect(isOrchestrator(sd, supabase)).resolves.toBe(false);
  });

  it('returns false when supabase is null and metadata flags are unset', async () => {
    const sd = { id: 'sd-7', sd_type: 'feature' };
    await expect(isOrchestrator(sd, null)).resolves.toBe(false);
  });

  it('returns false when sd is null or undefined', async () => {
    await expect(isOrchestrator(null, null)).resolves.toBe(false);
    await expect(isOrchestrator(undefined, null)).resolves.toBe(false);
  });

  it('caches result across multiple calls with same sd object identity (1 DB query)', async () => {
    const sd = { id: 'sd-cache', sd_type: 'feature' };
    const supabase = makeSupabase({ children: [{ id: 'child-1' }] });
    await isOrchestrator(sd, supabase);
    await isOrchestrator(sd, supabase);
    await isOrchestrator(sd, supabase);
    expect(supabase._calls.from).toBe(1); // single DB query across 3 calls
  });

  it('does NOT cache across different sd object instances (no false sharing)', async () => {
    const sdA = { id: 'sd-shared', sd_type: 'feature' };
    const sdB = { id: 'sd-shared', sd_type: 'feature' }; // same id, different object
    const supabase = makeSupabase({ children: [{ id: 'child-1' }] });
    await isOrchestrator(sdA, supabase);
    await isOrchestrator(sdB, supabase);
    expect(supabase._calls.from).toBe(2); // independent objects → independent queries
  });
});

describe('isOrchestratorSync (metadata + sd_type only)', () => {
  it('returns true for sd_type === "orchestrator"', () => {
    expect(isOrchestratorSync({ sd_type: 'orchestrator' })).toBe(true);
  });

  it('returns true for metadata.is_orchestrator', () => {
    expect(isOrchestratorSync({ sd_type: 'feature', metadata: { is_orchestrator: true } })).toBe(true);
  });

  it('returns true for legacy metadata.is_parent', () => {
    expect(isOrchestratorSync({ sd_type: 'feature', metadata: { is_parent: true } })).toBe(true);
  });

  it('returns false when no metadata flags and sd_type is not orchestrator', () => {
    expect(isOrchestratorSync({ sd_type: 'feature' })).toBe(false);
    expect(isOrchestratorSync({ sd_type: 'infrastructure' })).toBe(false);
  });

  it('returns false for null/undefined sd', () => {
    expect(isOrchestratorSync(null)).toBe(false);
    expect(isOrchestratorSync(undefined)).toBe(false);
  });
});

describe('isVenture / isVentureSync', () => {
  it('returns true when venture_id is set (canonical signal)', () => {
    expect(isVenture({ venture_id: 'v-1' })).toBe(true);
    expect(isVentureSync({ venture_id: 'v-1' })).toBe(true);
  });

  it('returns true when sd_type === "venture"', () => {
    expect(isVenture({ sd_type: 'venture' })).toBe(true);
  });

  it('does NOT use metadata.is_venture (dead PHANTOM branch removed by SD-LEO-INFRA-LINT-METADATA-ORPHAN-001 / FR-5)', () => {
    // metadata.is_venture had zero writers in EHG_Engineer and the shared ehg repo
    // (audit SD-LEO-INFRA-AUDIT-METADATA-ORPHAN-001). The dead reader was removed;
    // venture_id / sd_type='venture' remain the canonical signals.
    expect(isVenture({ metadata: { is_venture: true } })).toBe(false);
    expect(isVenture({ venture_id: 'v-1', metadata: { is_venture: true } })).toBe(true);
  });

  it('returns false when none of the venture signals are set', () => {
    expect(isVenture({ sd_type: 'infrastructure' })).toBe(false);
    expect(isVenture({ sd_type: 'feature' })).toBe(false);
  });

  it('does NOT use sd_key prefix as a signal (prefix is misleading per P-FAIL-5)', () => {
    // SD-CRONGENIUS-LEO-INFRA-MAKE-HEAL-VISION-001 was prefixed CRONGENIUS but venture_id=null;
    // helper must trust venture_id, not the prefix.
    const sd = { sd_key: 'SD-CRONGENIUS-LEO-INFRA-MAKE-HEAL-VISION-001', sd_type: 'infrastructure', venture_id: null };
    expect(isVenture(sd)).toBe(false);
  });
});

describe('isInfraNoVenture / isInfraNoVentureSync', () => {
  it('returns true for canonical no-venture sd_types', () => {
    // LEGITIMATE_NO_VENTURE_SD_TYPES from lib/eva/bridge/sd-router.js typically includes
    // 'infrastructure', 'documentation', 'refactor', etc.
    expect(isInfraNoVenture({ sd_type: 'infrastructure' })).toBe(true);
    expect(isInfraNoVentureSync({ sd_type: 'infrastructure' })).toBe(true);
  });

  it('returns false for sd_types that DO need ventures', () => {
    expect(isInfraNoVenture({ sd_type: 'feature' })).toBe(false);
  });

  it('returns false when sd_type is missing', () => {
    expect(isInfraNoVenture({})).toBe(false);
    expect(isInfraNoVenture(null)).toBe(false);
  });
});

describe('classifySDType', () => {
  it('returns explicit sd_type when canonical', () => {
    expect(classifySDType({ sd_type: 'orchestrator' })).toBe('orchestrator');
    expect(classifySDType({ sd_type: 'feature' })).toBe('feature');
  });

  it('returns "orchestrator" when sd_type missing but metadata.is_orchestrator', () => {
    expect(classifySDType({ metadata: { is_orchestrator: true } })).toBe('orchestrator');
  });

  it('returns "orchestrator" when sd_type missing but metadata.is_parent (legacy)', () => {
    expect(classifySDType({ metadata: { is_parent: true } })).toBe('orchestrator');
  });

  it('returns null when sd_type non-canonical and no metadata flags', () => {
    expect(classifySDType({ sd_type: 'fix' })).toBeNull();
    expect(classifySDType({})).toBeNull();
    expect(classifySDType(null)).toBeNull();
  });
});

describe('_clearCache is a no-op for production safety', () => {
  it('does not throw and returns undefined', () => {
    expect(() => _clearCache()).not.toThrow();
    expect(_clearCache()).toBeUndefined();
  });
});
