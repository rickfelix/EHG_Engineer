/**
 * autoCompleteDeliverablesForSD -- regression test for a property-name mismatch that made the
 * completion branch permanently unreachable.
 *
 * Discovered live via SD-LEO-GEN-SECURITY-TELEGRAM-BOT-001's PLAN-TO-LEAD SCOPE_AUDIT gate (67%
 * coverage, 2 required deliverables stuck 'pending' despite a genuinely-accepted EXEC-TO-PLAN
 * handoff). The old code read `needsCompletion.needs_completion`, but
 * auto-complete-deliverables.js's checkDeliverablesNeedCompletion() returns a `needed` property
 * -- `needs_completion` never existed, so the check was always `undefined` (falsy) and
 * autoCompleteDeliverables() was NEVER invoked, for any SD, ever. It also passed the raw
 * supabase client as autoCompleteDeliverables' second positional arg, where the real signature
 * expects an options object ({handoffId, evidence, verifiedBy}) -- silently discarding
 * verifiedBy. Confirmed systemic (not isolated to one SD) against >=13 other SDs sharing the
 * same two stuck boilerplate deliverable rows in the live database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const checkDeliverablesNeedCompletion = vi.fn();
const autoCompleteDeliverables = vi.fn();

vi.mock('../../auto-complete-deliverables.js', () => ({
  checkDeliverablesNeedCompletion,
  autoCompleteDeliverables,
}));

import { autoCompleteDeliverablesForSD } from './test-evidence.js';

describe('autoCompleteDeliverablesForSD', () => {
  const fakeSupabase = { from: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls autoCompleteDeliverables when deliverables need completion (needed:true) -- the branch the property-name bug made unreachable', async () => {
    checkDeliverablesNeedCompletion.mockResolvedValue({ needed: true, count: 2, deliverables: [] });
    autoCompleteDeliverables.mockResolvedValue({ success: true, completed: [{ name: 'a' }, { name: 'b' }], errors: [] });

    const result = await autoCompleteDeliverablesForSD(fakeSupabase, 'SD-TEST-001');

    expect(autoCompleteDeliverables).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true, completed: [{ name: 'a' }, { name: 'b' }], errors: [] });
  });

  it('calls checkDeliverablesNeedCompletion with just sdId -- the real function takes no supabase argument', async () => {
    checkDeliverablesNeedCompletion.mockResolvedValue({ needed: false, count: 0 });

    await autoCompleteDeliverablesForSD(fakeSupabase, 'SD-TEST-001');

    expect(checkDeliverablesNeedCompletion).toHaveBeenCalledWith('SD-TEST-001');
  });

  it('calls autoCompleteDeliverables with an options object, not the raw supabase client', async () => {
    checkDeliverablesNeedCompletion.mockResolvedValue({ needed: true, count: 1 });
    autoCompleteDeliverables.mockResolvedValue({ success: true, completed: [], errors: [] });

    await autoCompleteDeliverablesForSD(fakeSupabase, 'SD-TEST-001');

    const [sdIdArg, optionsArg] = autoCompleteDeliverables.mock.calls[0];
    expect(sdIdArg).toBe('SD-TEST-001');
    expect(optionsArg).not.toBe(fakeSupabase);
    expect(optionsArg).toMatchObject({ verifiedBy: expect.any(String) });
  });

  it('does NOT call autoCompleteDeliverables when nothing needs completion (needed:false) -- normal no-op path still works', async () => {
    checkDeliverablesNeedCompletion.mockResolvedValue({ needed: false, count: 0 });

    const result = await autoCompleteDeliverablesForSD(fakeSupabase, 'SD-TEST-001');

    expect(autoCompleteDeliverables).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('fails safe (returns null) when checkDeliverablesNeedCompletion throws', async () => {
    checkDeliverablesNeedCompletion.mockRejectedValue(new Error('db unreachable'));

    const result = await autoCompleteDeliverablesForSD(fakeSupabase, 'SD-TEST-001');

    expect(result).toBeNull();
  });
});
