/**
 * SD-LEO-INFRA-INSERTCOORDINATIONROW-NOT-SIGNAL-001 FR-2 behavioral coverage for
 * scripts/worker-signal.cjs's shared reportDispatchError/reportIfAlreadyDelivered — the CLI
 * exit-code migration onto isDeliveredDispatchError(), driven directly against the exported
 * functions rather than spawning the process (never a live Supabase call or a real
 * coordination-lane send, per FR-2 AC-3).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const { reportDispatchError, reportIfAlreadyDelivered } = require_('../../scripts/worker-signal.cjs');

describe('worker-signal.cjs — reportIfAlreadyDelivered (checked on the RETURNED result)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('exits 0 on a delivered/parked result (landed===true)', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
    reportIfAlreadyDelivered({ landed: true, code: 'DISPATCH_ALREADY_DELIVERED', parkedRowId: 'p1' }, 'signal');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('does NOT exit for an ordinary (non-delivered) result', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
    reportIfAlreadyDelivered({ data: { id: 'row-1' }, error: null }, 'signal');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('does NOT exit for a failed-park DISPATCH_BACKPRESSURE (landed:false) — genuinely lost content must still be reported as failure downstream', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
    reportIfAlreadyDelivered({ landed: false, code: 'DISPATCH_BACKPRESSURE', parkedRowId: null }, 'signal');
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

describe('worker-signal.cjs — reportDispatchError (checked on a CAUGHT exception, defensive path)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('exits 0 if a caught exception happens to carry landed:true', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
    reportDispatchError({ landed: true, message: 'delivered', code: 'DISPATCH_ALREADY_DELIVERED' }, 'signal');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('exits 1 for a genuine (non-landed) thrown error', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
    reportDispatchError(Object.assign(new Error('db down'), { code: 'DISPATCH_LOOKUP_FAILED' }), 'signal');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
