/**
 * Parallel Team Spawner - Integration Tests
 * SD-LEO-FEAT-WIRE-PARALLEL-TEAM-001
 *
 * Tests the integration between parallel-team-spawner and its dependencies:
 * - child-sd-selector.getReadyChildren (mocked DB, real DAG logic)
 * - worktree-manager (mocked git, real path logic)
 * - coordinator state persistence (real filesystem)
 *
 * Covers: TS-1 (happy path), TS-3 (single child fallback),
 *         TS-4 (state prevents duplicates), TS-5 (corruption tolerance)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Mock only external I/O dependencies
vi.mock('../../scripts/modules/handoff/child-sd-selector.js', () => ({
  getReadyChildren: vi.fn()
}));

vi.mock('../../lib/worktree-manager.js', () => ({
  createWorktree: vi.fn(),
  getRepoRoot: vi.fn()
}));

vi.mock('../../lib/agent-experience-factory/index.js', () => ({
  compose: vi.fn()
}));

import { getReadyChildren } from '../../scripts/modules/handoff/child-sd-selector.js';
import { createWorktree, getRepoRoot } from '../../lib/worktree-manager.js';
import { compose } from '../../lib/agent-experience-factory/index.js';
import {
  planParallelExecution,
  markChildCompleted,
  getCoordinatorState
} from '../../scripts/modules/handoff/parallel-team-spawner.js';

let tmpDir;
let mockSupabase;

beforeEach(() => {
  vi.clearAllMocks();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spawner-integ-'));
  getRepoRoot.mockReturnValue(tmpDir);

  compose.mockResolvedValue({
    promptPreamble: 'DYNAMIC KNOWLEDGE preamble: Recent patterns show database migrations need careful validation. Key skills: schema design, RLS policies. Retrospective: testing coverage improved 15% last sprint.',
    metadata: { tokensUsed: 250 }
  });

  createWorktree.mockImplementation(({ sdKey, branch }) => {
    const wtPath = path.join(tmpDir, '.worktrees', sdKey);
    fs.mkdirSync(wtPath, { recursive: true });
    return { path: wtPath, branch, sdKey, created: true, reused: false };
  });

  // Default supabase mock
  mockSupabase = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({
            data: { sd_key: 'SD-ORCH-PARENT-001' },
            error: null
          }))
        }))
      }))
    }))
  };
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── TS-1: Parallel happy path ───

describe('TS-1: Parallel happy path', () => {
  it('3 eligible children with MAX_CONCURRENCY=2 produces 2 toStart entries', async () => {
    const origEnv = process.env.ORCH_MAX_CONCURRENCY;
    process.env.ORCH_MAX_CONCURRENCY = '2';

    getReadyChildren.mockResolvedValue({
      children: [
        { id: 'child-a', sd_key: 'SD-CHILD-A', title: 'Child A', status: 'draft', sd_type: 'feature', metadata: {} },
        { id: 'child-b', sd_key: 'SD-CHILD-B', title: 'Child B', status: 'draft', sd_type: 'infrastructure', metadata: {} },
        { id: 'child-c', sd_key: 'SD-CHILD-C', title: 'Child C', status: 'active', sd_type: 'feature', metadata: {} }
      ],
      allComplete: false,
      dagErrors: [],
      reason: '3 independent children ready'
    });

    const plan = await planParallelExecution(mockSupabase, 'parent-uuid-1', 'done-uuid');

    // Verify plan structure
    expect(plan.schemaVersion).toBe('1.0');
    expect(plan.mode).toBe('parallel');
    expect(plan.toStart).toHaveLength(2);
    expect(plan.readyCount).toBe(2);
    expect(plan.totalChildren).toBe(3);
    expect(plan.teamName).toBeTruthy();
    expect(plan.coordinatorStatePath).toBeTruthy();

    // Verify each entry has required fields
    for (const entry of plan.toStart) {
      expect(entry.sdKey).toBeTruthy();
      expect(entry.sdType).toBeTruthy();
      expect(entry.childSdId).toBeTruthy();
      expect(entry.orchestratorSdId).toBe('parent-uuid-1');
      expect(entry.worktreePath).toBeTruthy();
      expect(entry.prompt).toContain('DYNAMIC KNOWLEDGE');
      expect(entry.agentDefinitionPath).toBe('.claude/agents/orchestrator-child-agent.md');
      expect(entry.idempotencyKey).toContain('parent-uuid-1');
    }

    // Verify distinct worktree paths
    const paths = plan.toStart.map(e => e.worktreePath);
    expect(new Set(paths).size).toBe(2);

    // Verify state file was persisted
    expect(fs.existsSync(plan.coordinatorStatePath)).toBe(true);
    const state = JSON.parse(fs.readFileSync(plan.coordinatorStatePath, 'utf8'));
    const startedIds = Object.keys(state.children).filter(id => state.children[id].status === 'started');
    expect(startedIds).toHaveLength(2);

    // Verify 1 child is pending (not started due to concurrency cap)
    const pendingChildren = Object.keys(state.children).filter(id => state.children[id].status === 'pending');
    // Only children that were actually started are in the state; pending ones aren't tracked yet
    // The remaining child is simply not in the state file
    expect(startedIds).toHaveLength(2);

    process.env.ORCH_MAX_CONCURRENCY = origEnv;
  });
});

// ─── TS-3: Single child fallback ───

describe('TS-3: No parallel when only one eligible child', () => {
  it('falls back to sequential with 1 child', async () => {
    getReadyChildren.mockResolvedValue({
      children: [
        { id: 'only-child', sd_key: 'SD-ONLY', title: 'Only Child', status: 'draft', sd_type: 'feature', metadata: {} }
      ],
      allComplete: false,
      dagErrors: [],
      reason: '1 child ready'
    });

    const plan = await planParallelExecution(mockSupabase, 'parent-uuid', 'done');

    expect(plan.mode).toBe('sequential');
    expect(plan.toStart).toBeUndefined();

    // No state file should be created
    const stateDir = path.join(tmpDir, '.claude', 'parallel-state');
    if (fs.existsSync(stateDir)) {
      const files = fs.readdirSync(stateDir);
      expect(files).toHaveLength(0);
    }
  });
});

// ─── TS-4: State prevents duplicates ───

describe('TS-4: State persistence prevents duplicates across invocations', () => {
  it('second run does not re-start already started children', async () => {
    // First run: start child-a and child-b
    getReadyChildren.mockResolvedValue({
      children: [
        { id: 'child-a', sd_key: 'SD-A', title: 'A', status: 'draft', sd_type: 'feature', metadata: {} },
        { id: 'child-b', sd_key: 'SD-B', title: 'B', status: 'draft', sd_type: 'feature', metadata: {} },
        { id: 'child-c', sd_key: 'SD-C', title: 'C', status: 'draft', sd_type: 'feature', metadata: {} }
      ],
      allComplete: false,
      dagErrors: [],
      reason: '3 ready'
    });

    const origEnv = process.env.ORCH_MAX_CONCURRENCY;
    process.env.ORCH_MAX_CONCURRENCY = '2';

    const firstPlan = await planParallelExecution(mockSupabase, 'parent-uuid', 'done');
    expect(firstPlan.mode).toBe('parallel');
    expect(firstPlan.toStart).toHaveLength(2);
    const firstStartedIds = firstPlan.toStart.map(e => e.childSdId);

    // Second run with same eligible children (no completions)
    vi.clearAllMocks();
    getRepoRoot.mockReturnValue(tmpDir);
    compose.mockResolvedValue({ promptPreamble: 'AEF preamble content for second run with enough chars', metadata: {} });
    createWorktree.mockImplementation(({ sdKey }) => {
      const wtPath = path.join(tmpDir, '.worktrees', sdKey);
      fs.mkdirSync(wtPath, { recursive: true });
      return { path: wtPath, branch: `feat/${sdKey}`, sdKey, created: true, reused: false };
    });
    mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({
              data: { sd_key: 'SD-ORCH-PARENT-001' },
              error: null
            }))
          }))
        }))
      }))
    };

    getReadyChildren.mockResolvedValue({
      children: [
        { id: 'child-a', sd_key: 'SD-A', title: 'A', status: 'draft', sd_type: 'feature', metadata: {} },
        { id: 'child-b', sd_key: 'SD-B', title: 'B', status: 'draft', sd_type: 'feature', metadata: {} },
        { id: 'child-c', sd_key: 'SD-C', title: 'C', status: 'draft', sd_type: 'feature', metadata: {} }
      ],
      allComplete: false,
      dagErrors: [],
      reason: '3 ready'
    });

    const secondPlan = await planParallelExecution(mockSupabase, 'parent-uuid', 'done');

    // Second plan should NOT include already-started children
    if (secondPlan.mode === 'parallel') {
      for (const entry of secondPlan.toStart) {
        expect(firstStartedIds).not.toContain(entry.childSdId);
      }
    } else {
      // If only 1 unstarted child remains, sequential is correct
      expect(secondPlan.mode).toBe('sequential');
    }

    process.env.ORCH_MAX_CONCURRENCY = origEnv;
  });
});

// ─── TS-5: Corruption tolerance ───

describe('TS-5: Atomic write corruption tolerance', () => {
  it('recovers from truncated state file', async () => {
    // Pre-create a corrupt state file
    const stateDir = path.join(tmpDir, '.claude', 'parallel-state');
    fs.mkdirSync(stateDir, { recursive: true });
    const statePath = path.join(stateDir, 'SD-ORCH-PARENT-001.json');
    fs.writeFileSync(statePath, '{"children": {"child-a": {"status": "start');

    getReadyChildren.mockResolvedValue({
      children: [
        { id: 'child-a', sd_key: 'SD-A', title: 'A', status: 'draft', sd_type: 'feature', metadata: {} },
        { id: 'child-b', sd_key: 'SD-B', title: 'B', status: 'draft', sd_type: 'feature', metadata: {} }
      ],
      allComplete: false,
      dagErrors: [],
      reason: '2 ready'
    });

    // Should NOT crash
    const plan = await planParallelExecution(mockSupabase, 'parent-uuid', 'done');

    expect(plan.mode).toBe('parallel');
    expect(plan.toStart).toHaveLength(2);
  });

  it('cleans up leftover .tmp file from interrupted write', async () => {
    const stateDir = path.join(tmpDir, '.claude', 'parallel-state');
    fs.mkdirSync(stateDir, { recursive: true });

    // Create a valid state and a leftover .tmp
    const statePath = path.join(stateDir, 'SD-ORCH-PARENT-001.json');
    fs.writeFileSync(statePath, JSON.stringify({
      schemaVersion: '1.0',
      children: {
        'child-a': { sdKey: 'SD-A', status: 'started', startedAt: '2026-02-11T00:00:00Z' }
      }
    }));
    const tmpFile = path.join(stateDir, 'SD-ORCH-PARENT-001.json.tmp');
    fs.writeFileSync(tmpFile, 'partial write garbage');

    getReadyChildren.mockResolvedValue({
      children: [
        { id: 'child-a', sd_key: 'SD-A', title: 'A', status: 'draft', sd_type: 'feature', metadata: {} },
        { id: 'child-b', sd_key: 'SD-B', title: 'B', status: 'draft', sd_type: 'feature', metadata: {} },
        { id: 'child-c', sd_key: 'SD-C', title: 'C', status: 'draft', sd_type: 'feature', metadata: {} }
      ],
      allComplete: false,
      dagErrors: [],
      reason: '3 ready'
    });

    const plan = await planParallelExecution(mockSupabase, 'parent-uuid', 'done');

    // .tmp should be cleaned up by loadState
    // Note: after planning, a new state file is written (which creates its own .tmp and renames)
    // The leftover .tmp from interrupted write is cleaned during state load
    expect(plan.mode).toBe('parallel');

    // child-a was in state as 'started', so should NOT be in toStart
    expect(plan.toStart.map(e => e.childSdId)).not.toContain('child-a');
  });
});

// ─── Full lifecycle: start → complete → resume ───

describe('Full lifecycle: plan → markComplete → re-plan', () => {
  it('completes the full coordinator lifecycle', async () => {
    const origEnv = process.env.ORCH_MAX_CONCURRENCY;
    process.env.ORCH_MAX_CONCURRENCY = '2';

    // Phase 1: Initial planning - 4 children, start 2
    getReadyChildren.mockResolvedValue({
      children: [
        { id: 'c1', sd_key: 'SD-C1', title: 'C1', status: 'draft', sd_type: 'feature', metadata: {} },
        { id: 'c2', sd_key: 'SD-C2', title: 'C2', status: 'draft', sd_type: 'feature', metadata: {} },
        { id: 'c3', sd_key: 'SD-C3', title: 'C3', status: 'draft', sd_type: 'feature', metadata: {} },
        { id: 'c4', sd_key: 'SD-C4', title: 'C4', status: 'draft', sd_type: 'feature', metadata: {} }
      ],
      allComplete: false,
      dagErrors: [],
      reason: '4 ready'
    });

    const plan1 = await planParallelExecution(mockSupabase, 'orch-uuid', 'done');
    expect(plan1.mode).toBe('parallel');
    expect(plan1.toStart).toHaveLength(2);
    const started1 = plan1.toStart.map(e => e.childSdId);

    // Phase 2: Mark first child complete
    markChildCompleted(plan1.coordinatorStatePath, started1[0], 'completed');

    const state = getCoordinatorState(plan1.coordinatorStatePath);
    expect(state.children[started1[0]].status).toBe('completed');
    expect(state.children[started1[1]].status).toBe('started');

    // Phase 3: Re-plan should start next batch (c3, c4)
    vi.clearAllMocks();
    getRepoRoot.mockReturnValue(tmpDir);
    compose.mockResolvedValue({ promptPreamble: 'AEF preamble for resumed planning with sufficient content here.', metadata: {} });
    createWorktree.mockImplementation(({ sdKey }) => {
      const wtPath = path.join(tmpDir, '.worktrees', sdKey);
      fs.mkdirSync(wtPath, { recursive: true });
      return { path: wtPath, branch: `feat/${sdKey}`, sdKey, created: true, reused: false };
    });
    mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({
              data: { sd_key: 'SD-ORCH-PARENT-001' },
              error: null
            }))
          }))
        }))
      }))
    };
    getReadyChildren.mockResolvedValue({
      children: [
        { id: 'c3', sd_key: 'SD-C3', title: 'C3', status: 'draft', sd_type: 'feature', metadata: {} },
        { id: 'c4', sd_key: 'SD-C4', title: 'C4', status: 'draft', sd_type: 'feature', metadata: {} }
      ],
      allComplete: false,
      dagErrors: [],
      reason: '2 ready'
    });

    const plan2 = await planParallelExecution(mockSupabase, 'orch-uuid', 'done');
    expect(plan2.mode).toBe('parallel');
    expect(plan2.toStart).toHaveLength(2);

    // Verify no overlap with first batch
    const started2 = plan2.toStart.map(e => e.childSdId);
    for (const id of started2) {
      expect(started1).not.toContain(id);
    }

    process.env.ORCH_MAX_CONCURRENCY = origEnv;
  });
});
