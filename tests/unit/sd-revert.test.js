/**
 * Tests: lib/sd/revert.js — atomic-revert helper
 * SD: SD-FDBK-INFRA-ATOMIC-REVERT-HELPER-001
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sliceFunctionBody, countMatchesInFunctionBody } from '../helpers/static-pin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REVERT_PATH = path.resolve(__dirname, '../../lib/sd/revert.js');
const REVERT_SRC = fs.readFileSync(REVERT_PATH, 'utf8');

describe('lib/sd/revert.js — static-pin (single-UPDATE shape)', () => {
  it('contains exactly ONE supabase.from(...).update(...) chain inside revertSD body', () => {
    const body = sliceFunctionBody(REVERT_SRC, 'revertSD');
    expect(body).not.toBeNull();
    const updateMatches = countMatchesInFunctionBody(
      REVERT_SRC,
      'revertSD',
      /\.from\(['"]strategic_directives_v2['"]\)\s*\.update\(/g
    );
    expect(updateMatches).toBe(1);
  });

  it('references all 4 atomic columns (status, current_phase, progress, metadata) inside revertSD', () => {
    const body = sliceFunctionBody(REVERT_SRC, 'revertSD');
    expect(body).toContain('status:');
    expect(body).toContain('current_phase:');
    expect(body).toContain('progress:');
    expect(body).toContain('metadata:');
  });

  it('exports revertSD as an async function', () => {
    expect(REVERT_SRC).toMatch(/export\s+async\s+function\s+revertSD/);
  });

  it('uses bracket-tokenized [SD_REVERT_FAILED] error prefix', () => {
    expect(REVERT_SRC).toContain('[SD_REVERT_FAILED]');
  });

  // Meta-test: red-green-red verification — if revertSD source were mutated to use
  // two .update() calls, the static-pin test would catch it. We simulate by running
  // the same static-pin regex against a SYNTHETIC mutated body to confirm the
  // assertion logic flips. (We don't actually mutate the real file in CI.)
  it('static-pin meta-test: synthetic two-update body fails the assertion', () => {
    const synthetic = `
      export async function revertSD(sdId, reason) {
        await supabase.from('strategic_directives_v2').update({ status: 'draft' }).eq('id', sdId);
        await supabase.from('strategic_directives_v2').update({ metadata: {} }).eq('id', sdId);
      }
    `;
    const matches = countMatchesInFunctionBody(
      synthetic,
      'revertSD',
      /\.from\(['"]strategic_directives_v2['"]\)\s*\.update\(/g
    );
    expect(matches).toBe(2);
  });
});

describe('lib/sd/revert.js — runtime behaviour', () => {
  let mockSupabase;
  let revertSD;

  beforeEach(async () => {
    vi.resetModules();
    ({ revertSD } = await import('../../lib/sd/revert.js'));
  });

  function buildMock(existing, updateError = null) {
    return {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ data: null, error: updateError }),
        })),
      })),
    };
  }

  it('writes status/current_phase/progress/metadata atomically (single supabase.update call)', async () => {
    const existing = { id: 'sd-test-1', metadata: { foo: 'bar' }, status: 'completed', current_phase: 'COMPLETED', progress: 100 };
    const supabase = buildMock(existing);

    const res = await revertSD('sd-test-1', 'test', { supabase });

    expect(res.updated).toBe(true);
    expect(res.was_idempotent).toBe(false);
    expect(res.payload.status).toBe('draft');
    expect(res.payload.current_phase).toBe('LEAD');
    expect(res.payload.progress).toBe(0);
    expect(res.payload.metadata.foo).toBe('bar');
    expect(res.payload.metadata.reverted_reason).toBe('test');
    expect(res.payload.metadata.reverted_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(supabase.from).toHaveBeenCalled();
  });

  it('is idempotent: second call returns identical reverted_at with was_idempotent=true', async () => {
    const existing = {
      id: 'sd-test-2',
      metadata: { reverted_at: '2026-04-28T12:02:44.918Z', reverted_reason: 'first' },
      status: 'draft',
      current_phase: 'LEAD',
      progress: 0,
    };
    const supabase = buildMock(existing);

    const res = await revertSD('sd-test-2', 'second', { supabase });
    expect(res.updated).toBe(false);
    expect(res.was_idempotent).toBe(true);
    expect(res.payload.metadata.reverted_at).toBe('2026-04-28T12:02:44.918Z');
    expect(res.payload.metadata.reverted_reason).toBe('first');
  });

  it('dry_run returns planned payload without invoking update', async () => {
    const existing = { id: 'sd-test-3', metadata: {}, status: 'completed', current_phase: 'COMPLETED', progress: 100 };
    const updateSpy = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }));
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }) })) })),
        update: updateSpy,
      })),
    };

    const res = await revertSD('sd-test-3', 'dryrun', { supabase, dry_run: true });
    expect(res.updated).toBe(false);
    expect(res.was_idempotent).toBe(false);
    expect(res.payload.status).toBe('draft');
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('throws bracket-tokenized [SD_REVERT_FAILED] on update error', async () => {
    const existing = { id: 'sd-test-4', metadata: {}, status: 'completed', current_phase: 'COMPLETED', progress: 100 };
    const supabase = buildMock(existing, { message: 'permission denied' });

    await expect(revertSD('sd-test-4', 'fail', { supabase })).rejects.toThrow(/\[SD_REVERT_FAILED\]/);
  });

  it('throws [SD_REVERT_FAILED] when SD not found', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
        update: vi.fn(),
      })),
    };
    await expect(revertSD('does-not-exist', 'fail', { supabase })).rejects.toThrow(/\[SD_REVERT_FAILED\] SD not found/);
  });

  it('preserve_metadata option merges extra fields into metadata', async () => {
    const existing = { id: 'sd-test-5', metadata: { foo: 'bar' }, status: 'completed', current_phase: 'COMPLETED', progress: 100 };
    const supabase = buildMock(existing);

    const res = await revertSD('sd-test-5', 'with-preserve', { supabase, preserve_metadata: { audit_token: 'X-123' } });
    expect(res.payload.metadata.foo).toBe('bar');
    expect(res.payload.metadata.audit_token).toBe('X-123');
    expect(res.payload.metadata.reverted_reason).toBe('with-preserve');
  });

  it('rejects empty sdId or reason', async () => {
    await expect(revertSD('', 'r', {})).rejects.toThrow(/\[SD_REVERT_FAILED\]/);
    await expect(revertSD('sd-x', '', {})).rejects.toThrow(/\[SD_REVERT_FAILED\]/);
  });
});
