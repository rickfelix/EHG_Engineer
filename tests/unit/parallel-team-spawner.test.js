/**
 * Parallel Team Spawner - Unit Tests
 * SD-LEO-FEAT-WIRE-PARALLEL-TEAM-001
 *
 * Covers: FR-1..FR-6, TR-1..TR-3, TS-1..TS-6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock external modules before importing the spawner
vi.mock('../../scripts/modules/handoff/child-sd-selector.js', () => ({
  getReadyChildren: vi.fn()
}));

vi.mock('../../lib/worktree-manager.js', () => ({
  createWorktree: vi.fn(),
  getRepoRoot: vi.fn(() => '/mock/repo')
}));

vi.mock('../../lib/agent-experience-factory/index.js', () => ({
  compose: vi.fn()
}));

// Import mocked modules
import { getReadyChildren } from '../../scripts/modules/handoff/child-sd-selector.js';
import { createWorktree, getRepoRoot } from '../../lib/worktree-manager.js';
import { compose } from '../../lib/agent-experience-factory/index.js';
import {
  planParallelExecution,
  markChildCompleted,
  getCoordinatorState
} from '../../scripts/modules/handoff/parallel-team-spawner.js';

// ─── Test Helpers ───

function makeChild(id, sdKey, opts = {}) {
  return {
    id,
    sd_key: sdKey,
    title: opts.title || `Title for ${sdKey}`,
    status: opts.status || 'draft',
    sd_type: opts.sdType || 'feature',
    priority: opts.priority || 'medium',
    metadata: opts.metadata || {},
    created_at: opts.createdAt || '2026-02-11T00:00:00Z'
  };
}

function mockSupabase(parentKey = 'SD-ORCH-001') {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({
            data: { sd_key: parentKey },
            error: null
          }))
        }))
      }))
    }))
  };
}

// Temp directory for state files
let tmpDir;

beforeEach(() => {
  vi.clearAllMocks();
  tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'spawner-test-'));
  getRepoRoot.mockReturnValue(tmpDir);

  // Default AEF mock: returns deterministic preamble
  compose.mockResolvedValue({
    promptPreamble: 'AEF knowledge: issue patterns, retrospectives, skills data for this domain.',
    metadata: { tokensUsed: 200 }
  });

  // Default worktree mock
  createWorktree.mockImplementation(({ sdKey }) => ({
    path: path.join(tmpDir, '.worktrees', sdKey),
    branch: `feat/${sdKey}`,
    sdKey,
    created: true,
    reused: false
  }));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── FR-1: cli-main branching ───

describe('planParallelExecution - mode selection (FR-1)', () => {
  it('returns sequential when all children are complete', async () => {
    getReadyChildren.mockResolvedValue({
      children: [],
      allComplete: true,
      dagErrors: [],
      reason: 'All 3 children completed'
    });

    const plan = await planParallelExecution(mockSupabase(), 'parent-uuid', 'child-uuid');

    expect(plan.mode).toBe('sequential');
    expect(plan.schemaVersion).toBe('1.0');
    expect(plan.reason).toContain('complete');
  });

  it('returns sequential when only 1 eligible child', async () => {
    getReadyChildren.mockResolvedValue({
      children: [makeChild('c1', 'SD-CHILD-001')],
      allComplete: false,
      dagErrors: [],
      reason: '1 child ready'
    });

    const plan = await planParallelExecution(mockSupabase(), 'parent-uuid', 'done-uuid');

    expect(plan.mode).toBe('sequential');
    expect(plan.reason).toContain('1 eligible child');
  });

  it('returns sequential when 0 eligible children', async () => {
    getReadyChildren.mockResolvedValue({
      children: [],
      allComplete: false,
      dagErrors: [],
      reason: 'All blocked'
    });

    const plan = await planParallelExecution(mockSupabase(), 'parent-uuid', 'done-uuid');

    expect(plan.mode).toBe('sequential');
  });
});

// ─── FR-2: Schema and determinism ───

describe('planParallelExecution - schema and determinism (FR-2)', () => {
  it('returns schemaVersion 1.0 for parallel mode', async () => {
    getReadyChildren.mockResolvedValue({
      children: [
        makeChild('aaa', 'SD-A'),
        makeChild('bbb', 'SD-B'),
        makeChild('ccc', 'SD-C')
      ],
      allComplete: false,
      dagErrors: [],
      reason: '3 ready'
    });

    const plan = await planParallelExecution(mockSupabase(), 'parent-uuid', 'done-uuid');

    expect(plan.schemaVersion).toBe('1.0');
    expect(plan.mode).toBe('parallel');
  });

  it('sorts toStart deterministically by childSdId ascending', async () => {
    getReadyChildren.mockResolvedValue({
      children: [
        makeChild('ccc', 'SD-C'),
        makeChild('aaa', 'SD-A'),
        makeChild('bbb', 'SD-B')
      ],
      allComplete: false,
      dagErrors: [],
      reason: '3 ready'
    });

    const plan = await planParallelExecution(mockSupabase(), 'parent-uuid', 'done-uuid');

    expect(plan.toStart[0].childSdId).toBe('aaa');
    expect(plan.toStart[1].childSdId).toBe('bbb');
    expect(plan.toStart[2].childSdId).toBe('ccc');
  });

  it('includes required fields in each toStart entry', async () => {
    getReadyChildren.mockResolvedValue({
      children: [
        makeChild('id-1', 'SD-CHILD-001', { sdType: 'infrastructure' }),
        makeChild('id-2', 'SD-CHILD-002', { sdType: 'feature' })
      ],
      allComplete: false,
      dagErrors: [],
      reason: '2 ready'
    });

    const plan = await planParallelExecution(mockSupabase(), 'parent-uuid', 'done-uuid');

    for (const entry of plan.toStart) {
      expect(entry).toHaveProperty('sdKey');
      expect(entry).toHaveProperty('sdType');
      expect(entry).toHaveProperty('childSdId');
      expect(entry).toHaveProperty('orchestratorSdId', 'parent-uuid');
      expect(entry).toHaveProperty('worktreePath');
      expect(entry).toHaveProperty('prompt');
      expect(entry).toHaveProperty('agentDefinitionPath', '.claude/agents/orchestrator-child-agent.md');
      expect(entry).toHaveProperty('idempotencyKey');
      expect(entry.idempotencyKey).toContain('parent-uuid');
    }
  });

  it('produces stable idempotencyKey from orchestratorSdId+childSdId', async () => {
    getReadyChildren.mockResolvedValue({
      children: [
        makeChild('child-id-1', 'SD-A'),
        makeChild('child-id-2', 'SD-B')
      ],
      allComplete: false,
      dagErrors: [],
      reason: '2 ready'
    });

    const plan = await planParallelExecution(mockSupabase(), 'orch-uuid', 'done');

    expect(plan.toStart[0].idempotencyKey).toBe('orch-uuid:child-id-1');
    expect(plan.toStart[1].idempotencyKey).toBe('orch-uuid:child-id-2');
  });
});

// ─── FR-3: Worktree isolation ───

describe('planParallelExecution - worktree isolation (FR-3)', () => {
  it('creates distinct worktree paths for each child', async () => {
    getReadyChildren.mockResolvedValue({
      children: [
        makeChild('id-1', 'SD-CHILD-001'),
        makeChild('id-2', 'SD-CHILD-002')
      ],
      allComplete: false,
      dagErrors: [],
      reason: '2 ready'
    });

    const plan = await planParallelExecution(mockSupabase(), 'parent-uuid', 'done');

    const paths = plan.toStart.map(e => e.worktreePath);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('calls createWorktree with correct sdKey and branch', async () => {
    getReadyChildren.mockResolvedValue({
      children: [
        makeChild('id-1', 'SD-CHILD-001'),
        makeChild('id-2', 'SD-CHILD-002')
      ],
      allComplete: false,
      dagErrors: [],
      reason: '2 ready'
    });

    await planParallelExecution(mockSupabase(), 'parent-uuid', 'done');

    expect(createWorktree).toHaveBeenCalledWith(
      expect.objectContaining({ sdKey: 'SD-CHILD-001' })
    );
    expect(createWorktree).toHaveBeenCalledWith(
      expect.objectContaining({ sdKey: 'SD-CHILD-002' })
    );
  });

  it('falls back to existing path when worktree creation fails', async () => {
    createWorktree.mockImplementation(({ sdKey }) => {
      if (sdKey === 'SD-CHILD-002') throw new Error('already exists');
      return {
        path: path.join(tmpDir, '.worktrees', sdKey),
        branch: `feat/${sdKey}`,
        sdKey,
        created: true,
        reused: false
      };
    });

    // Create the fallback path on disk
    const fallbackPath = path.join(tmpDir, '.worktrees', 'SD-CHILD-002');
    fs.mkdirSync(fallbackPath, { recursive: true });

    getReadyChildren.mockResolvedValue({
      children: [
        makeChild('id-1', 'SD-CHILD-001'),
        makeChild('id-2', 'SD-CHILD-002')
      ],
      allComplete: false,
      dagErrors: [],
      reason: '2 ready'
    });

    const plan = await planParallelExecution(mockSupabase(), 'parent-uuid', 'done');

    expect(plan.mode).toBe('parallel');
    expect(plan.toStart).toHaveLength(2);
    expect(plan.toStart[1].worktreePath).toBe(fallbackPath);
  });

  it('skips child when worktree creation fails and no fallback', async () => {
    createWorktree.mockImplementation(({ sdKey }) => {
      if (sdKey === 'SD-CHILD-002') throw new Error('git error');
      return {
        path: path.join(tmpDir, '.worktrees', sdKey),
        branch: `feat/${sdKey}`,
        sdKey,
        created: true,
        reused: false
      };
    });

    getReadyChildren.mockResolvedValue({
      children: [
        makeChild('id-1', 'SD-CHILD-001'),
        makeChild('id-2', 'SD-CHILD-002'),
        makeChild('id-3', 'SD-CHILD-003')
      ],
      allComplete: false,
      dagErrors: [],
      reason: '3 ready'
    });

    const plan = await planParallelExecution(mockSupabase(), 'parent-uuid', 'done');

    expect(plan.mode).toBe('parallel');
    expect(plan.toStart).toHaveLength(2);
    expect(plan.toStart.find(e => e.sdKey === 'SD-CHILD-002')).toBeUndefined();
  });
});

// ─── FR-4: AEF prompt enrichment ───

describe('planParallelExecution - prompt enrichment (FR-4)', () => {
  it('includes DYNAMIC KNOWLEDGE in each prompt', async () => {
    getReadyChildren.mockResolvedValue({
      children: [
        makeChild('id-1', 'SD-A'),
        makeChild('id-2', 'SD-B')
      ],
      allComplete: false,
      dagErrors: [],
      reason: '2 ready'
    });

    const plan = await planParallelExecution(mockSupabase(), 'parent-uuid', 'done');

    for (const entry of plan.toStart) {
      expect(entry.prompt).toContain('DYNAMIC KNOWLEDGE');
      expect(entry.prompt.length).toBeGreaterThan(200);
    }
  });

  it('includes childSdId and orchestratorSdId keys in prompt', async () => {
    getReadyChildren.mockResolvedValue({
      children: [
        makeChild('child-uuid-1', 'SD-A'),
        makeChild('child-uuid-2', 'SD-B')
      ],
      allComplete: false,
      dagErrors: [],
      reason: '2 ready'
    });

    const plan = await planParallelExecution(
      mockSupabase('SD-ORCH-PARENT'), 'parent-uuid', 'done'
    );

    expect(plan.toStart[0].prompt).toContain('childSdId: child-uuid-1');
    expect(plan.toStart[0].prompt).toContain('orchestratorSdId: SD-ORCH-PARENT');
  });

  it('sets agentDefinitionPath correctly', async () => {
    getReadyChildren.mockResolvedValue({
      children: [
        makeChild('id-1', 'SD-A'),
        makeChild('id-2', 'SD-B')
      ],
      allComplete: false,
      dagErrors: [],
      reason: '2 ready'
    });

    const plan = await planParallelExecution(mockSupabase(), 'parent-uuid', 'done');

    for (const entry of plan.toStart) {
      expect(entry.agentDefinitionPath).toBe('.claude/agents/orchestrator-child-agent.md');
    }
  });

  it('prompt includes AEF content when available', async () => {
    compose.mockResolvedValue({
      promptPreamble: 'AEF knowledge: issue patterns, retrospectives, skills data for this domain.',
      metadata: {}
    });

    getReadyChildren.mockResolvedValue({
      children: [
        makeChild('id-1', 'SD-A'),
        makeChild('id-2', 'SD-B')
      ],
      allComplete: false,
      dagErrors: [],
      reason: '2 ready'
    });

    const plan = await planParallelExecution(mockSupabase(), 'parent-uuid', 'done');

    expect(plan.toStart[0].prompt).toContain('AEF knowledge');
  });

  it('gracefully handles AEF failure', async () => {
    compose.mockRejectedValue(new Error('AEF unavailable'));

    getReadyChildren.mockResolvedValue({
      children: [
        makeChild('id-1', 'SD-A'),
        makeChild('id-2', 'SD-B')
      ],
      allComplete: false,
      dagErrors: [],
      reason: '2 ready'
    });

    const plan = await planParallelExecution(mockSupabase(), 'parent-uuid', 'done');

    expect(plan.mode).toBe('parallel');
    expect(plan.toStart).toHaveLength(2);
    // Prompt still contains DYNAMIC KNOWLEDGE marker even without AEF content
    expect(plan.toStart[0].prompt).toContain('DYNAMIC KNOWLEDGE');
  });
});

// ─── FR-5: State persistence ───

describe('planParallelExecution - state persistence (FR-5)', () => {
  it('persists coordinator state after planning', async () => {
    getReadyChildren.mockResolvedValue({
      children: [
        makeChild('id-1', 'SD-A'),
        makeChild('id-2', 'SD-B')
      ],
      allComplete: false,
      dagErrors: [],
      reason: '2 ready'
    });

    const plan = await planParallelExecution(mockSupabase('SD-ORCH-001'), 'parent-uuid', 'done');

    expect(plan.coordinatorStatePath).toBeTruthy();
    expect(fs.existsSync(plan.coordinatorStatePath)).toBe(true);

    const state = JSON.parse(fs.readFileSync(plan.coordinatorStatePath, 'utf8'));
    expect(state.children['id-1'].status).toBe('started');
    expect(state.children['id-2'].status).toBe('started');
  });

  it('does not re-start already-started children on subsequent run', async () => {
    // Simulate prior state with child-A already started
    const stateDir = path.join(tmpDir, '.claude', 'parallel-state');
    fs.mkdirSync(stateDir, { recursive: true });
    const statePath = path.join(stateDir, 'SD-ORCH-001.json');
    fs.writeFileSync(statePath, JSON.stringify({
      schemaVersion: '1.0',
      children: {
        'id-1': { sdKey: 'SD-A', status: 'started', startedAt: '2026-02-11T00:00:00Z' }
      }
    }));

    getReadyChildren.mockResolvedValue({
      children: [
        makeChild('id-1', 'SD-A'),
        makeChild('id-2', 'SD-B'),
        makeChild('id-3', 'SD-C')
      ],
      allComplete: false,
      dagErrors: [],
      reason: '3 ready'
    });

    const plan = await planParallelExecution(mockSupabase('SD-ORCH-001'), 'parent-uuid', 'done');

    expect(plan.mode).toBe('parallel');
    // Only 2 new children (id-2, id-3), not id-1
    expect(plan.toStart.map(e => e.childSdId)).not.toContain('id-1');
    expect(plan.toStart).toHaveLength(2);
  });

  it('does not re-start completed children', async () => {
    const stateDir = path.join(tmpDir, '.claude', 'parallel-state');
    fs.mkdirSync(stateDir, { recursive: true });
    const statePath = path.join(stateDir, 'SD-ORCH-001.json');
    fs.writeFileSync(statePath, JSON.stringify({
      schemaVersion: '1.0',
      children: {
        'id-1': { sdKey: 'SD-A', status: 'completed', completedAt: '2026-02-11T01:00:00Z' }
      }
    }));

    getReadyChildren.mockResolvedValue({
      children: [
        makeChild('id-1', 'SD-A'),
        makeChild('id-2', 'SD-B'),
        makeChild('id-3', 'SD-C')
      ],
      allComplete: false,
      dagErrors: [],
      reason: '3 ready'
    });

    const plan = await planParallelExecution(mockSupabase('SD-ORCH-001'), 'parent-uuid', 'done');

    expect(plan.toStart.map(e => e.childSdId)).not.toContain('id-1');
  });

  it('recovers from corrupt state file', async () => {
    const stateDir = path.join(tmpDir, '.claude', 'parallel-state');
    fs.mkdirSync(stateDir, { recursive: true });
    const statePath = path.join(stateDir, 'SD-ORCH-001.json');
    fs.writeFileSync(statePath, 'CORRUPT{{{NOT JSON');

    getReadyChildren.mockResolvedValue({
      children: [
        makeChild('id-1', 'SD-A'),
        makeChild('id-2', 'SD-B')
      ],
      allComplete: false,
      dagErrors: [],
      reason: '2 ready'
    });

    const plan = await planParallelExecution(mockSupabase('SD-ORCH-001'), 'parent-uuid', 'done');

    expect(plan.mode).toBe('parallel');
    expect(plan.toStart).toHaveLength(2);
  });

  it('cleans up leftover .tmp files', async () => {
    const stateDir = path.join(tmpDir, '.claude', 'parallel-state');
    fs.mkdirSync(stateDir, { recursive: true });
    const tmpFile = path.join(stateDir, 'SD-ORCH-001.json.tmp');
    fs.writeFileSync(tmpFile, 'leftover temp');

    getReadyChildren.mockResolvedValue({
      children: [
        makeChild('id-1', 'SD-A'),
        makeChild('id-2', 'SD-B')
      ],
      allComplete: false,
      dagErrors: [],
      reason: '2 ready'
    });

    await planParallelExecution(mockSupabase('SD-ORCH-001'), 'parent-uuid', 'done');

    expect(fs.existsSync(tmpFile)).toBe(false);
  });
});

// ─── FR-6: Concurrency bounds ───

describe('planParallelExecution - concurrency bounds (FR-6)', () => {
  it('limits toStart to ORCH_MAX_CONCURRENCY', async () => {
    const origEnv = process.env.ORCH_MAX_CONCURRENCY;
    process.env.ORCH_MAX_CONCURRENCY = '2';

    getReadyChildren.mockResolvedValue({
      children: [
        makeChild('id-1', 'SD-A'),
        makeChild('id-2', 'SD-B'),
        makeChild('id-3', 'SD-C'),
        makeChild('id-4', 'SD-D')
      ],
      allComplete: false,
      dagErrors: [],
      reason: '4 ready'
    });

    const plan = await planParallelExecution(mockSupabase(), 'parent-uuid', 'done');

    expect(plan.toStart).toHaveLength(2);
    expect(plan.readyCount).toBe(2);
    expect(plan.totalChildren).toBe(4);

    process.env.ORCH_MAX_CONCURRENCY = origEnv;
  });

  it('defaults to 3 when ORCH_MAX_CONCURRENCY is unset', async () => {
    const origEnv = process.env.ORCH_MAX_CONCURRENCY;
    delete process.env.ORCH_MAX_CONCURRENCY;

    getReadyChildren.mockResolvedValue({
      children: [
        makeChild('id-1', 'SD-A'),
        makeChild('id-2', 'SD-B'),
        makeChild('id-3', 'SD-C'),
        makeChild('id-4', 'SD-D'),
        makeChild('id-5', 'SD-E')
      ],
      allComplete: false,
      dagErrors: [],
      reason: '5 ready'
    });

    const plan = await planParallelExecution(mockSupabase(), 'parent-uuid', 'done');

    expect(plan.toStart.length).toBeLessThanOrEqual(3);

    process.env.ORCH_MAX_CONCURRENCY = origEnv;
  });

  it('defaults to 3 and warns for invalid ORCH_MAX_CONCURRENCY', async () => {
    const origEnv = process.env.ORCH_MAX_CONCURRENCY;
    process.env.ORCH_MAX_CONCURRENCY = 'not-a-number';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    getReadyChildren.mockResolvedValue({
      children: [
        makeChild('id-1', 'SD-A'),
        makeChild('id-2', 'SD-B'),
        makeChild('id-3', 'SD-C'),
        makeChild('id-4', 'SD-D')
      ],
      allComplete: false,
      dagErrors: [],
      reason: '4 ready'
    });

    const plan = await planParallelExecution(mockSupabase(), 'parent-uuid', 'done');

    expect(plan.toStart.length).toBeLessThanOrEqual(3);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('ORCH_MAX_CONCURRENCY="not-a-number" is invalid')
    );

    warnSpy.mockRestore();
    process.env.ORCH_MAX_CONCURRENCY = origEnv;
  });

  it('does not exceed eligible children count', async () => {
    const origEnv = process.env.ORCH_MAX_CONCURRENCY;
    process.env.ORCH_MAX_CONCURRENCY = '10';

    getReadyChildren.mockResolvedValue({
      children: [
        makeChild('id-1', 'SD-A'),
        makeChild('id-2', 'SD-B'),
        makeChild('id-3', 'SD-C')
      ],
      allComplete: false,
      dagErrors: [],
      reason: '3 ready'
    });

    const plan = await planParallelExecution(mockSupabase(), 'parent-uuid', 'done');

    expect(plan.toStart).toHaveLength(3);

    process.env.ORCH_MAX_CONCURRENCY = origEnv;
  });
});

// ─── TS-6: Prompt enrichment validation ───

describe('prompt enrichment details (TS-6)', () => {
  it('AEF preamble with DYNAMIC KNOWLEDGE plus identifiers', async () => {
    compose.mockResolvedValue({
      promptPreamble: 'AEF knowledge: Recent issue patterns indicate database migration failures in 3 SDs. Key learning: always validate schema before applying. Retrospective insights suggest breaking changes need more testing.',
      metadata: {}
    });

    getReadyChildren.mockResolvedValue({
      children: [
        makeChild('child-uuid-1', 'SD-CHILD-A', { sdType: 'infrastructure' }),
        makeChild('child-uuid-2', 'SD-CHILD-B', { sdType: 'feature' })
      ],
      allComplete: false,
      dagErrors: [],
      reason: '2 ready'
    });

    const plan = await planParallelExecution(
      mockSupabase('SD-PARENT-ORCH'), 'parent-uuid', 'done'
    );

    const prompt1 = plan.toStart[0].prompt;
    expect(prompt1).toContain('DYNAMIC KNOWLEDGE');
    expect(prompt1).toContain('childSdId: child-uuid-1');
    expect(prompt1).toContain('orchestratorSdId: SD-PARENT-ORCH');
    expect(prompt1).toContain('AEF knowledge');
    // Prompt is >200 chars (FR-4 acceptance criteria)
    const dynamicStart = prompt1.indexOf('DYNAMIC KNOWLEDGE');
    expect(prompt1.length - dynamicStart).toBeGreaterThan(200);
  });
});

// ─── State helpers ───

describe('markChildCompleted', () => {
  it('marks child as completed in state file', () => {
    const stateDir = path.join(tmpDir, '.claude', 'parallel-state');
    fs.mkdirSync(stateDir, { recursive: true });
    const statePath = path.join(stateDir, 'test-state.json');
    fs.writeFileSync(statePath, JSON.stringify({
      schemaVersion: '1.0',
      children: {
        'child-1': { sdKey: 'SD-A', status: 'started', startedAt: '2026-02-11T00:00:00Z' }
      }
    }));

    markChildCompleted(statePath, 'child-1');

    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    expect(state.children['child-1'].status).toBe('completed');
    expect(state.children['child-1'].completedAt).toBeTruthy();
  });

  it('marks child as failed when status is failed', () => {
    const stateDir = path.join(tmpDir, '.claude', 'parallel-state');
    fs.mkdirSync(stateDir, { recursive: true });
    const statePath = path.join(stateDir, 'test-state.json');
    fs.writeFileSync(statePath, JSON.stringify({
      schemaVersion: '1.0',
      children: {
        'child-1': { sdKey: 'SD-A', status: 'started' }
      }
    }));

    markChildCompleted(statePath, 'child-1', 'failed');

    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    expect(state.children['child-1'].status).toBe('failed');
  });
});

describe('getCoordinatorState', () => {
  it('returns state from file', () => {
    const stateDir = path.join(tmpDir, '.claude', 'parallel-state');
    fs.mkdirSync(stateDir, { recursive: true });
    const statePath = path.join(stateDir, 'test-read.json');
    const expected = {
      schemaVersion: '1.0',
      children: { 'x': { status: 'started' } }
    };
    fs.writeFileSync(statePath, JSON.stringify(expected));

    const state = getCoordinatorState(statePath);

    expect(state.children.x.status).toBe('started');
  });

  it('returns empty state when file does not exist', () => {
    const state = getCoordinatorState('/nonexistent/path.json');

    expect(state.children).toEqual({});
  });
});

// ─── Return shape validation (TR-3) ───

describe('return shape validation (TR-3)', () => {
  it('parallel plan has all required top-level fields', async () => {
    getReadyChildren.mockResolvedValue({
      children: [
        makeChild('id-1', 'SD-A'),
        makeChild('id-2', 'SD-B')
      ],
      allComplete: false,
      dagErrors: [],
      reason: '2 ready'
    });

    const plan = await planParallelExecution(mockSupabase(), 'parent-uuid', 'done');

    expect(plan).toMatchObject({
      schemaVersion: '1.0',
      mode: 'parallel',
      orchestratorSdId: 'parent-uuid',
      teamName: expect.any(String),
      coordinatorStatePath: expect.any(String),
      totalChildren: expect.any(Number),
      readyCount: expect.any(Number),
      reason: expect.any(String)
    });
    expect(Array.isArray(plan.toStart)).toBe(true);
  });

  it('sequential plan has schemaVersion and mode', async () => {
    getReadyChildren.mockResolvedValue({
      children: [],
      allComplete: true,
      dagErrors: [],
      reason: 'done'
    });

    const plan = await planParallelExecution(mockSupabase(), 'p', 'd');

    expect(plan.schemaVersion).toBe('1.0');
    expect(plan.mode).toBe('sequential');
    expect(plan.reason).toBeTruthy();
  });
});
