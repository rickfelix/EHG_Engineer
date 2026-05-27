/**
 * Unit tests for lib/eva-support/sd-blocker-surface.js — SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C
 * FR-3 + TS-2.
 *
 * Covers:
 *   - TS-2: 3 seeded SDs (1 rejected-handoff blocked, 1 dep blocked, 1 unblocked)
 *     → exactly 2 blocker entries returned.
 *   - Source-side invariants (T1 + T7 boundary checks, partial-index predicate match).
 *   - Flag-OFF short-circuit (no DB calls beyond the sd-reader audit).
 *   - Priority sort.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULE_PATH = resolve(HERE, '../../../lib/eva-support/sd-blocker-surface.js');

describe('sd-blocker-surface.js — static source invariants', () => {
  const source = readFileSync(MODULE_PATH, 'utf8');

  it('FR-3: partial-index predicates match idx_sd_phase_handoffs_unresolved verbatim', () => {
    expect(source).toMatch(/BLOCKED_HANDOFF_STATUSES\s*=\s*Object\.freeze\(\[\s*['"]rejected['"]\s*,\s*['"]failed['"]\s*,\s*['"]blocked['"]\s*\]\)/);
    expect(source).toMatch(/\.is\(\s*['"]resolved_at['"]\s*,\s*null\s*\)/);
    expect(source).toMatch(/\.in\(\s*['"]status['"]\s*,\s*BLOCKED_HANDOFF_STATUSES\s*\)/);
  });

  it('FR-3: source uses lib/sd/active-sd-predicate via sd-reader (no inline status filter)', () => {
    // sd-reader is imported, which uses the shared predicate.
    expect(source).toMatch(/from\s+['"]\.\/sd-reader(?:\.js)?['"]/);
    // No inline (status IN draft/in_progress/active) — the shared predicate handles it.
    expect(source).not.toMatch(/\.in\(\s*['"]status['"]\s*,\s*\[\s*['"]draft['"]/);
  });

  it('T1 boundary: source does NOT import child_process / execa / spawn', () => {
    expect(source).not.toMatch(/from\s+['"]child_process['"]/);
    expect(source).not.toMatch(/from\s+['"]execa['"]/);
    expect(source).not.toMatch(/spawn\s*\(/);
  });

  it('T7 boundary: source does NOT import decision-log-store write functions', () => {
    expect(source).not.toMatch(/from\s+['"][^'"]*decision-log-store(?:\.js)?['"]/);
    expect(source).not.toMatch(/insertEntry/);
  });

  it('FR-3: source contains NO bare "select(\'*\')" call', () => {
    expect(source).not.toMatch(/select\(\s*['"]\*['"]\s*\)/);
  });
});

describe('sd-blocker-surface.js — runtime behavior', () => {
  let readerStub;

  beforeEach(() => {
    readerStub = { flag_enabled: true, sds: [], audit_row_id: null };
    vi.doMock('../../../lib/eva-support/sd-reader.js', () => ({
      getActiveSDs: vi.fn(async () => readerStub),
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock('../../../lib/eva-support/sd-reader.js');
  });

  function makeChainSpy(resultMap) {
    // resultMap: { tableName: { data, error } } — order of .from() calls returns the right result.
    const calls = [];
    const client = {
      from: vi.fn((tableName) => {
        calls.push(tableName);
        const chain = {};
        const passthrough = ['select', 'in', 'is', 'order', 'eq'];
        for (const m of passthrough) chain[m] = vi.fn(() => chain);
        const finalThen = (resolve) => resolve(resultMap[tableName] ?? { data: [], error: null });
        chain.then = finalThen;
        // Make chain awaitable
        Object.defineProperty(chain, 'then', { value: finalThen });
        return chain;
      }),
    };
    return { client, calls };
  }

  it('TS-2: 3 seeded SDs (1 handoff-blocked, 1 dep-blocked, 1 unblocked) → exactly 2 blockers', async () => {
    // SD-A: blocked via rejected handoff. id=aaa, no parent.
    // SD-B: blocked via incomplete dependency. id=bbb, parent=ddd (parent in LEAD, not OK).
    // SD-C: unblocked. id=ccc, no parent.
    readerStub = {
      flag_enabled: true,
      sds: [
        { sd_key: 'SD-A', title: 'A', status: 'draft', current_phase: 'LEAD', target_application: 'EHG_Engineer', priority: 'high', progress: 0 },
        { sd_key: 'SD-B', title: 'B', status: 'draft', current_phase: 'LEAD', target_application: 'EHG_Engineer', priority: 'critical', progress: 0 },
        { sd_key: 'SD-C', title: 'C', status: 'draft', current_phase: 'LEAD', target_application: 'EHG_Engineer', priority: 'medium', progress: 0 },
      ],
    };

    const { client } = makeChainSpy({
      strategic_directives_v2: { data: [
        { id: 'aaa', sd_key: 'SD-A', title: 'A', status: 'draft', current_phase: 'LEAD', priority: 'high', progress: 0, parent_sd_id: null, target_application: 'EHG_Engineer' },
        { id: 'bbb', sd_key: 'SD-B', title: 'B', status: 'draft', current_phase: 'LEAD', priority: 'critical', progress: 0, parent_sd_id: 'ddd', target_application: 'EHG_Engineer' },
        { id: 'ccc', sd_key: 'SD-C', title: 'C', status: 'draft', current_phase: 'LEAD', priority: 'medium', progress: 0, parent_sd_id: null, target_application: 'EHG_Engineer' },
      ], error: null },
      sd_phase_handoffs: { data: [
        { sd_id: 'aaa', from_phase: 'LEAD', to_phase: 'PLAN', status: 'rejected', created_at: '2026-05-26T00:00:00Z', rejection_reason: 'PRD incomplete' },
      ], error: null },
    });

    // Parent ddd needs to be returned from a SECOND .from('strategic_directives_v2') call.
    // To support that, build a smarter mock that returns different results per call:
    let sdCallCount = 0;
    client.from = vi.fn((tableName) => {
      const chain = {};
      const passthrough = ['select', 'in', 'is', 'order', 'eq'];
      for (const m of passthrough) chain[m] = vi.fn(() => chain);
      let result;
      if (tableName === 'strategic_directives_v2') {
        sdCallCount++;
        if (sdCallCount === 1) {
          result = { data: [
            { id: 'aaa', sd_key: 'SD-A', title: 'A', status: 'draft', current_phase: 'LEAD', priority: 'high', progress: 0, parent_sd_id: null, target_application: 'EHG_Engineer' },
            { id: 'bbb', sd_key: 'SD-B', title: 'B', status: 'draft', current_phase: 'LEAD', priority: 'critical', progress: 0, parent_sd_id: 'ddd', target_application: 'EHG_Engineer' },
            { id: 'ccc', sd_key: 'SD-C', title: 'C', status: 'draft', current_phase: 'LEAD', priority: 'medium', progress: 0, parent_sd_id: null, target_application: 'EHG_Engineer' },
          ], error: null };
        } else {
          // Parent lookup
          result = { data: [{ id: 'ddd', sd_key: 'SD-PARENT-D', current_phase: 'LEAD', status: 'draft' }], error: null };
        }
      } else if (tableName === 'sd_phase_handoffs') {
        result = { data: [
          { sd_id: 'aaa', from_phase: 'LEAD', to_phase: 'PLAN', status: 'rejected', created_at: '2026-05-26T00:00:00Z', rejection_reason: 'PRD incomplete' },
        ], error: null };
      } else {
        result = { data: [], error: null };
      }
      chain.then = (resolve) => resolve(result);
      return chain;
    });

    const { getBlockedSDs } = await import('../../../lib/eva-support/sd-blocker-surface.js');
    const result = await getBlockedSDs({ client, eva_invocation_id: 'test' });

    expect(result.flag_enabled).toBe(true);
    expect(result.blockers).toHaveLength(2);

    // Critical priority sorts first.
    const keys = result.blockers.map((b) => b.sd_key);
    expect(keys).toEqual(['SD-B', 'SD-A']);

    // SD-B reason references the parent.
    expect(result.blockers[0].sd_key).toBe('SD-B');
    expect(result.blockers[0].blocker_reason).toContain('parent SD-PARENT-D not in EXEC');
    expect(result.blockers[0].parent_sd_key).toBe('SD-PARENT-D');

    // SD-A reason references the rejected handoff.
    expect(result.blockers[1].sd_key).toBe('SD-A');
    expect(result.blockers[1].blocker_reason).toContain('LEAD→PLAN handoff rejected');
    expect(result.blockers[1].blocker_reason).toContain('PRD incomplete');
    expect(result.blockers[1].latest_handoff_status).toBe('rejected');
  });

  it('flag OFF: short-circuits to [] without further DB calls', async () => {
    readerStub = { flag_enabled: false, sds: [], audit_row_id: null };
    const { client } = makeChainSpy({});

    const { getBlockedSDs } = await import('../../../lib/eva-support/sd-blocker-surface.js');
    const result = await getBlockedSDs({ client });

    expect(result.flag_enabled).toBe(false);
    expect(result.blockers).toEqual([]);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('no active SDs: returns [] without querying handoffs', async () => {
    readerStub = { flag_enabled: true, sds: [], audit_row_id: null };
    const { client } = makeChainSpy({});

    const { getBlockedSDs } = await import('../../../lib/eva-support/sd-blocker-surface.js');
    const result = await getBlockedSDs({ client });

    expect(result.flag_enabled).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe('sd-blocker-surface.js — __testHooks', () => {
  it('exports frozen constants', async () => {
    const { __testHooks } = await import('../../../lib/eva-support/sd-blocker-surface.js');
    expect(Object.isFrozen(__testHooks)).toBe(true);
    expect(__testHooks.BLOCKED_HANDOFF_STATUSES).toEqual(['rejected', 'failed', 'blocked']);
    expect(__testHooks.PARENT_OK_PHASES).toEqual(['EXEC', 'EXEC_COMPLETE', 'COMPLETED']);
  });
});
