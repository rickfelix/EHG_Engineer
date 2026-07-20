/**
 * QF-20260720-111 — account-aware weekly budget-line epoch.
 *
 * The Monday-anchored cron (solomon-duty-triggers-cron.yml) misaligned with the real
 * per-account weekly resets (DeepSoul Thu ~3:59AM ET, rickfelix2000 Fri ~6:59AM ET).
 * runWeeklyReminder() now resolves the currently-active account and names it in the
 * reminder, so a rotation away from the cron's assumed account (Thursday) surfaces as
 * a visible mismatch instead of silent drift.
 *
 * insertCoordinationRow (lib/coordinator/dispatch.cjs) runs several real-DB assertion
 * helpers before inserting — injected via the sendRow seam so these tests exercise only
 * runWeeklyReminder's own logic (account resolution + reminder shaping), not dispatch's
 * validation chain.
 */
import { describe, it, expect, vi } from 'vitest';
import { runWeeklyReminder, KNOWN_RESET_DAYS } from '../../scripts/solomon-forecast-trigger-check.mjs';

function makeMockSupabase({ existingUnread = false } = {}) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              limit: async () => ({ data: existingUnread ? [{ id: 'prior' }] : [] }),
            }),
          }),
        }),
      }),
    }),
  };
}

const NOW = Date.parse('2026-07-23T08:20:00Z'); // a Thursday

describe('runWeeklyReminder — account-aware epoch naming', () => {
  it('names a KNOWN account + its reset day in the subject/body', async () => {
    const sb = makeMockSupabase();
    const sendRow = vi.fn(async () => ({ id: 'row-1' }));
    const resolveIdentity = () => ({ email: 'deepsoulsessionslabel@gmail.com', orgName: 'x', accountUuid8: 'ca1de6e4' });
    const res = await runWeeklyReminder(sb, { nowMs: NOW, resolveIdentity, sendRow });
    expect(res.status).toBe('SENT');
    const row = sendRow.mock.calls[0][1];
    expect(row.subject).toContain('deepsoulsessionslabel@gmail.com');
    expect(row.subject).toContain(KNOWN_RESET_DAYS['deepsoulsessionslabel@gmail.com']);
    expect(row.payload.body).toContain('deepsoulsessionslabel@gmail.com');
  });

  it('flags an UNKNOWN account (e.g. codestreetlabs) rather than silently asserting a reset day', async () => {
    const sb = makeMockSupabase();
    const sendRow = vi.fn(async () => ({ id: 'row-1' }));
    const resolveIdentity = () => ({ email: 'codestreetlabs@example.com', orgName: 'x', accountUuid8: 'deadbeef' });
    const res = await runWeeklyReminder(sb, { nowMs: NOW, resolveIdentity, sendRow });
    expect(res.status).toBe('SENT');
    const row = sendRow.mock.calls[0][1];
    expect(row.subject).toContain('codestreetlabs@example.com');
    expect(row.subject).toContain('NOT in KNOWN_RESET_DAYS');
  });

  it('never throws when account identity is unresolved (null) — labels it explicitly instead', async () => {
    const sb = makeMockSupabase();
    const sendRow = vi.fn(async () => ({ id: 'row-1' }));
    const res = await runWeeklyReminder(sb, { nowMs: NOW, resolveIdentity: () => null, sendRow });
    expect(res.status).toBe('SENT');
    const row = sendRow.mock.calls[0][1];
    expect(row.subject).toContain('identity unresolved');
  });

  it('dedupes per ISO week regardless of which day it actually fires on (no send on an unread pending reminder)', async () => {
    const sb = makeMockSupabase({ existingUnread: true });
    const sendRow = vi.fn(async () => ({ id: 'row-1' }));
    const res = await runWeeklyReminder(sb, { nowMs: NOW, resolveIdentity: () => null, sendRow });
    expect(res.status).toBe('pending-reminder');
    expect(sendRow).not.toHaveBeenCalled();
  });
});
