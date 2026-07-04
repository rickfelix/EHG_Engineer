import { describe, it, expect, vi } from 'vitest';
import { verifyCapabilityWired, WIRED_CAPABILITY_FEEDBACK_TYPES } from '../../../lib/eva/utils/validate-venture-default-capabilities.js';

// SD-LEO-INFRA-UNIVERSAL-VENTURE-TELEMETRY-001 TS-8: distinguishes a venture whose
// feedback/error capture is wired to the EHG inbox (a live row exists) from one that
// only has a local-only stub (declared in a sprint plan, never actually produced a row).

function makeSupabaseStub(rows) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  };
  return { from: vi.fn(() => chain), _chain: chain };
}

describe('verifyCapabilityWired', () => {
  it('fails a local-only fixture venture (no live row ever produced)', async () => {
    const supabase = makeSupabaseStub([]);
    const result = await verifyCapabilityWired(supabase, 'local-only-venture-id', 'feedback-widget');
    expect(result.wired).toBe(false);
    expect(result.reason).toMatch(/no .* row exists/);
  });

  it('passes a wired fixture venture (a real produced row exists)', async () => {
    const supabase = makeSupabaseStub([{ id: 'row-1' }]);
    const result = await verifyCapabilityWired(supabase, 'wired-venture-id', 'feedback-widget');
    expect(result.wired).toBe(true);
    expect(result.reason).toMatch(/found a/);
  });

  it('checks error-capture-middleware against venture_error feedback_type', async () => {
    const supabase = makeSupabaseStub([{ id: 'row-2' }]);
    const result = await verifyCapabilityWired(supabase, 'wired-venture-id', 'error-capture-middleware');
    expect(result.wired).toBe(true);
    expect(supabase._chain.in).toHaveBeenCalledWith('feedback_type', WIRED_CAPABILITY_FEEDBACK_TYPES['error-capture-middleware']);
  });

  it('returns wired:false with a clear reason for a capability with no verifiable signal', async () => {
    const supabase = makeSupabaseStub([]);
    const result = await verifyCapabilityWired(supabase, 'some-venture-id', 'cost-instrumentation');
    expect(result.wired).toBe(false);
    expect(result.reason).toMatch(/no wired-verification signal/);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('returns wired:false when ventureId is missing', async () => {
    const supabase = makeSupabaseStub([{ id: 'row-1' }]);
    const result = await verifyCapabilityWired(supabase, null, 'feedback-widget');
    expect(result.wired).toBe(false);
    expect(result.reason).toMatch(/ventureId is required/);
  });

  it('propagates a query error as wired:false rather than throwing', async () => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      limit: vi.fn(() => Promise.resolve({ data: null, error: { message: 'connection reset' } })),
    };
    const supabase = { from: vi.fn(() => chain) };
    const result = await verifyCapabilityWired(supabase, 'some-venture-id', 'feedback-widget');
    expect(result.wired).toBe(false);
    expect(result.reason).toMatch(/query failed: connection reset/);
  });
});
