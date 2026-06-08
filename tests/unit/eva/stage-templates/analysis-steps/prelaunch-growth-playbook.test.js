/**
 * Unit tests for the pre-launch Growth Playbook co-output.
 * SD: SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001-D (FR-004 + FR-006 null-safe/idempotency)
 *
 * @module tests/unit/eva/stage-templates/analysis-steps/prelaunch-growth-playbook.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the LLM client BEFORE importing the module under test.
vi.mock('../../../../../lib/llm/index.js', () => ({
  getLLMClient: vi.fn(() => ({ complete: vi.fn() })),
}));

import {
  classifyPrelaunchNoDataReason,
  splitGrowthArtifacts,
  runPrelaunchGrowthCoOutput,
  PRELAUNCH_STAGE,
} from '../../../../../lib/eva/stage-templates/analysis-steps/prelaunch-growth-playbook.js';
import { getLLMClient } from '../../../../../lib/llm/index.js';

const silentLogger = { info: () => {}, warn: () => {} };

// Minimal chainable Supabase mock: every builder method returns the same thenable,
// and awaiting it resolves to the per-table result. A single result object serves a
// table's select/update/insert (length-based reads + error-based writes).
function makeQuery(result) {
  const q = {};
  for (const m of ['select', 'eq', 'in', 'update', 'insert', 'order', 'limit', 'maybeSingle', 'single']) {
    q[m] = vi.fn(() => q);
  }
  q.then = (resolve) => resolve(result);
  return q;
}
function makeSupabase(byTable) {
  return { from: vi.fn((t) => makeQuery(byTable[t] ?? { data: [], error: null })) };
}

function setupLLM(json) {
  const complete = vi.fn().mockResolvedValue(json);
  getLLMClient.mockReturnValue({ complete });
  return complete;
}

const VALID_PLAYBOOK = JSON.stringify({
  growth_experiments: [{ name: 'e', hypothesis: 'h', metric: 'm', priority: 'high' }],
  scaling_priorities: [{ area: 'a', current_state: 'c', target_state: 't', timeline: '90d' }],
  operations_handoff: { monitoring_dashboards: ['d'], alert_thresholds: ['a'], runbooks: ['r'], escalation_path: 'chairman' },
  '90_day_plan': { month_1: 'm1', month_2: 'm2', month_3: 'm3' },
});

beforeEach(() => { vi.clearAllMocks(); });

describe('classifyPrelaunchNoDataReason (FR-004 null-safe + idempotency)', () => {
  it('returns already_generated when a current playbook exists (idempotency)', () => {
    expect(classifyPrelaunchNoDataReason({ existingCurrentPlaybook: true, gtm: { x: 1 } })).toBe('already_generated');
  });
  it('returns missing_prelaunch_upstream when neither GTM nor persona present', () => {
    expect(classifyPrelaunchNoDataReason({ existingCurrentPlaybook: false, gtm: {}, persona: undefined })).toBe('missing_prelaunch_upstream');
  });
  it('returns null (OK to proceed) when GTM is present', () => {
    expect(classifyPrelaunchNoDataReason({ existingCurrentPlaybook: false, gtm: { channels: ['x'] } })).toBeNull();
  });
});

describe('splitGrowthArtifacts', () => {
  it('emits the canonical pair payloads tagged pre_launch', () => {
    const { playbookPayload, roadmapPayload } = splitGrowthArtifacts(
      { growth_experiments: [1], scaling_priorities: [2], operations_handoff: {}, '90_day_plan': {} }, 'Acme');
    expect(playbookPayload.phase).toBe('pre_launch');
    expect(roadmapPayload.phase).toBe('pre_launch');
    expect(playbookPayload.growth_experiments).toEqual([1]);
    expect(roadmapPayload.scaling_priorities).toEqual([2]);
  });
});

describe('runPrelaunchGrowthCoOutput (FR-004)', () => {
  it('SKIPS idempotently when a current growth_playbook already exists', async () => {
    setupLLM(VALID_PLAYBOOK);
    const supabase = makeSupabase({ venture_artifacts: { data: [{ id: 'existing' }], error: null } });
    const out = await runPrelaunchGrowthCoOutput({
      supabase, ventureId: 'v1', ventureName: 'Acme',
      context: { gtm_strategy: { x: 1 }, personas: { y: 2 } }, logger: silentLogger,
    });
    expect(out.status).toBe('no_data');
    expect(out.reason).toBe('already_generated');
  });

  it('SKIPS null-safe when pre-launch upstream is missing (no fabrication)', async () => {
    setupLLM(VALID_PLAYBOOK);
    const supabase = makeSupabase({ venture_artifacts: { data: [], error: null } });
    const out = await runPrelaunchGrowthCoOutput({
      supabase, ventureId: 'v1', ventureName: 'Acme',
      context: { gtm_strategy: {}, personas: {} }, logger: silentLogger,
    });
    expect(out.status).toBe('no_data');
    expect(out.reason).toBe('missing_prelaunch_upstream');
  });

  it('persists the growth_playbook + growth_optimization_roadmap pair on the happy path', async () => {
    setupLLM(VALID_PLAYBOOK);
    const supabase = makeSupabase({ venture_artifacts: { data: [], error: null } });
    const out = await runPrelaunchGrowthCoOutput({
      supabase, ventureId: 'v1', ventureName: 'Acme',
      context: { gtm_strategy: { channels: ['x'] }, personas: { seg: 'a' } }, logger: silentLogger,
    });
    expect(out.status).toBe('ok');
    expect(out.types).toEqual(['growth_playbook', 'growth_optimization_roadmap']);
    expect(supabase.from).toHaveBeenCalledWith('venture_artifacts');
  });

  it('never throws even when Supabase access throws (fail-safe: no duplicate, graceful status)', async () => {
    setupLLM(VALID_PLAYBOOK);
    const supabase = { from: () => { throw new Error('db down'); } };
    // Must resolve (not reject) — the Distribution run must be unaffected. The idempotency
    // probe fail-safes to "exists" on DB error, so this yields a no_data skip (never persists).
    const out = await runPrelaunchGrowthCoOutput({
      supabase, ventureId: 'v1', ventureName: 'Acme',
      context: { gtm_strategy: { x: 1 } }, logger: silentLogger,
    });
    expect(out).toBeDefined();
    expect(['no_data', 'skipped']).toContain(out.status);
  });

  it('emits at the pre-launch stage (21), not the terminal stage 26', () => {
    expect(PRELAUNCH_STAGE).toBe(21);
  });

  it('does NOT insert when the mark-stale UPDATE fails (no duplicate is_current row)', async () => {
    setupLLM(VALID_PLAYBOOK);
    // Distinct terminals per operation: the idempotency SELECT returns "none present",
    // the mark-stale UPDATE errors, and we assert the INSERT is never reached.
    const insertSpy = vi.fn(() => { throw new Error('insert must not be called when mark-stale failed'); });
    const supabase = {
      from: vi.fn(() => {
        const q = {};
        for (const m of ['select', 'eq', 'order', 'limit', 'maybeSingle', 'single']) q[m] = vi.fn(() => q);
        // SELECT path (idempotency probe): no current playbook -> proceed.
        q.then = (resolve) => resolve({ data: [], error: null });
        // UPDATE path: chain ending in a thenable that resolves to an error.
        q.update = vi.fn(() => {
          const u = {};
          for (const m of ['eq']) u[m] = vi.fn(() => u);
          u.then = (resolve) => resolve({ error: { message: 'mark-stale boom' } });
          return u;
        });
        q.insert = insertSpy;
        return q;
      }),
    };
    const out = await runPrelaunchGrowthCoOutput({
      supabase, ventureId: 'v1', ventureName: 'Acme',
      context: { gtm_strategy: { channels: ['x'] } }, logger: silentLogger,
    });
    // Never threw; insert was skipped, so nothing persisted -> skipped status.
    expect(insertSpy).not.toHaveBeenCalled();
    expect(out.status).toBe('skipped');
    expect(out.reason).toBe('persist_failed');
  });
});
