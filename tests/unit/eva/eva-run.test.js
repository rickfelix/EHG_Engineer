/**
 * Tests for eva-run CLI dispatcher
 * SD-EVA-FEAT-CLI-DISPATCHER-001
 */

import { describe, it, expect, vi } from 'vitest';

// Mock dotenv and supabase before any imports that might use them
vi.mock('dotenv/config', () => ({}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  })),
}));

// Mock the orchestrator to prevent transitive dep loading
vi.mock('../../../lib/eva/eva-orchestrator.js', () => ({
  run: vi.fn(),
}));

// Mock shebanged modules
vi.mock('../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn(),
}));

describe('eva-run EXIT codes', () => {
  it('defines correct exit codes', async () => {
    const { EXIT } = await import('../../../scripts/eva-run.js');
    expect(EXIT.SUCCESS).toBe(0);
    expect(EXIT.USAGE).toBe(1);
    expect(EXIT.NOT_FOUND).toBe(2);
    expect(EXIT.CHAIRMAN_REVIEW).toBe(3);
    expect(EXIT.EXECUTION_ERROR).toBe(4);
  });

  it('all exit codes are unique', async () => {
    const { EXIT } = await import('../../../scripts/eva-run.js');
    const codes = Object.values(EXIT);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('exports main function', async () => {
    const mod = await import('../../../scripts/eva-run.js');
    expect(typeof mod.main).toBe('function');
  });
});

// QF-20260828-911: eva-run.js:190-196 used to bare-write ventures.current_lifecycle_stage on
// --stage, satisfying the stage-writer choke but never writing venture_stage_transitions -- the
// append-only history stayed silent for every --stage crossing since the flag shipped. Fixed by
// refusing the bare write instead of routing it through the RPC (which also runs exit-gate/
// thesis-kill/gate-debt enforcement the bare override was never subject to -- an explicit,
// coordinator-sanctioned tradeoff, not an oversight).
describe('QF-20260828-911: --stage refuses a bare cursor write instead of skipping the audit trail', () => {
  it('stageOverrideRefusalMessage names both the pointer and the transition-row gap', async () => {
    const { stageOverrideRefusalMessage } = await import('../../../scripts/eva-run.js');
    const msg = stageOverrideRefusalMessage({ ventureId: 'v-1', fromStage: 19, toStage: 20 });
    expect(msg).toContain('venture_stage_transitions');
    expect(msg).toContain('refused');
  });

  it('names the logged RPC path (fn_advance_venture_stage / advanceStage) as the remedy', async () => {
    const { stageOverrideRefusalMessage } = await import('../../../scripts/eva-run.js');
    const msg = stageOverrideRefusalMessage({ ventureId: 'v-1', fromStage: 19, toStage: 20 });
    expect(msg).toMatch(/advanceStage/);
    expect(msg).toMatch(/fn_advance_venture_stage/);
  });

  it('interpolates the actual venture/stage values, not a placeholder', async () => {
    const { stageOverrideRefusalMessage } = await import('../../../scripts/eva-run.js');
    const msg = stageOverrideRefusalMessage({ ventureId: 'venture-abc-123', fromStage: 5, toStage: 9 });
    expect(msg).toContain('venture-abc-123');
    expect(msg).toContain('fromStage: 5');
    expect(msg).toContain('toStage: 9');
  });

  it('the printed remedy snippet is syntactically valid JS (a copy-pasted broken snippet is worse than none)', async () => {
    const { stageOverrideRefusalMessage } = await import('../../../scripts/eva-run.js');
    const msg = stageOverrideRefusalMessage({ ventureId: 'v-1', fromStage: 19, toStage: 20 });
    const snippetMatch = msg.match(/node -e "(.+)"/);
    expect(snippetMatch, 'no runnable snippet found in the refusal message').toBeTruthy();
    expect(() => new Function(snippetMatch[1])).not.toThrow();
  });

  it('grep: zero bare current_lifecycle_stage writes remain in eva-run.js (success measure 1 from the QF)', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const path = await import('node:path');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(path.resolve(here, '../../../scripts/eva-run.js'), 'utf8');
    // A .update({ current_lifecycle_stage: ... }) call is the bare-write shape this QF removes.
    // Reading current_lifecycle_stage (.select(...) / property access) is unaffected and expected.
    expect(src).not.toMatch(/\.update\(\s*\{\s*current_lifecycle_stage/);
  });
});
