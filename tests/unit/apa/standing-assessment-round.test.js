/**
 * lib/apa/standing-assessment-round unit tests
 * SD-LEO-INFRA-APA-PHASE-STANDING-001
 *
 * Covers PRD test scenarios TS-1 through TS-5. TS-6 (live end-to-end against
 * a deliberately-broken staging deployment) is a documented smoke-test
 * procedure, not a unit test — see PRD smoke_test_steps.
 */

import { describe, it, expect, vi } from 'vitest';
import { runApaStandingRound, assessVenture } from '../../../lib/apa/standing-assessment-round.mjs';

function makeSupabaseStub({ ventureDeployments = [], lastAssessment = null, insertSpy = vi.fn() } = {}) {
  return {
    from(table) {
      if (table === 'venture_deployments') {
        return {
          select: () => ({
            eq: () => ({
              // FR-6 batch 8: listLiveVentureDeploymentUrls now paginates via fetchAllPaginated
              // (.order('created_at').order('id') then .range()) — order() chainable, range() terminal.
              not: () => {
                const orderable = {
                  order: () => orderable,
                  range: (from, to) => Promise.resolve({ data: ventureDeployments.slice(from, to + 1), error: null }),
                };
                return orderable;
              },
            }),
          }),
        };
      }
      if (table === 'apa_standing_assessments') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: lastAssessment }),
                }),
              }),
            }),
          }),
          insert: (row) => {
            insertSpy(row);
            return {
              select: () => ({
                single: async () => ({ data: { id: 'stub-assessment-row-id' }, error: null }),
              }),
            };
          },
        };
      }
      if (table === 'venture_token_ledger') {
        // recordTokenUsage() is fire-and-forget: insert().then().catch() — a
        // thenable stub is enough, no assertions needed on this call.
        return { insert: () => Promise.resolve({ error: null }) };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe('TS-1: zero ventures in venture_deployments', () => {
  it('exits cleanly with assessedCount 0 and writes zero result rows', async () => {
    const supabase = makeSupabaseStub({ ventureDeployments: [] });
    const logger = { log: vi.fn(), error: vi.fn() };
    const recordCorrectiveFinding = vi.fn();
    const recordPendingDecision = vi.fn();

    const result = await runApaStandingRound({
      deps: { supabase, logger, recordCorrectiveFinding, recordPendingDecision, fetchImpl: vi.fn() },
    });

    expect(result.assessedCount).toBe(0);
    expect(result.results).toEqual([]);
    expect(recordCorrectiveFinding).not.toHaveBeenCalled();
    expect(recordPendingDecision).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('0 live ventures found'));
  });
});

describe('TS-2: single venture, all primitives pass', () => {
  it('writes a pass row and makes zero findings/decisions calls (FR-6 quiet pass)', async () => {
    const insertSpy = vi.fn(async () => ({ error: null }));
    const supabase = makeSupabaseStub({ insertSpy });
    const recordCorrectiveFinding = vi.fn();
    const recordPendingDecision = vi.fn();

    const page = {
      evaluate: vi.fn(async () => 'complete'),
      locator: () => ({
        first: () => ({
          count: async () => 1,
          getAttribute: async () => '/pricing',
          click: async () => {},
        }),
      }),
    };
    const acquireLiveInstance = vi.fn(async () => ({
      ok: true,
      page,
      browser: {},
      teardown: vi.fn(async () => {}),
    }));

    const result = await assessVenture(
      { ventureId: 'v1', url: 'https://example.com' },
      { supabase, recordCorrectiveFinding, recordPendingDecision, acquireLiveInstance }
    );

    expect(result.verdict).toBe('pass');
    expect(recordCorrectiveFinding).not.toHaveBeenCalled();
    expect(recordPendingDecision).not.toHaveBeenCalled();
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ verdict: 'pass', consecutive_fail_count: 0 }));
  });
});

describe('TS-3: single venture fails once then recovers', () => {
  it('1st fail: coordinator lane only; recovery resets counter, no chairman escalation', async () => {
    const insertSpy = vi.fn(async () => ({ error: null }));
    const supabase = makeSupabaseStub({ insertSpy, lastAssessment: null });
    const recordCorrectiveFinding = vi.fn(async () => ({ recorded: true }));
    const recordPendingDecision = vi.fn(async () => ({ recorded: true }));

    const page = {
      evaluate: vi.fn(async () => null), // triggers home step failure
      locator: () => ({ count: async () => 0 }),
    };
    const acquireLiveInstance = vi.fn(async () => ({ ok: true, page, browser: {}, teardown: vi.fn(async () => {}) }));

    const result = await assessVenture(
      { ventureId: 'v2', url: 'https://broken.example.com' },
      { supabase, recordCorrectiveFinding, recordPendingDecision, acquireLiveInstance }
    );

    expect(result.verdict).toBe('fail');
    expect(recordCorrectiveFinding).toHaveBeenCalledTimes(1);
    expect(recordPendingDecision).not.toHaveBeenCalled();
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ verdict: 'fail', consecutive_fail_count: 1 }));
  });
});

describe('TS-4: single venture fails 2 consecutive cycles', () => {
  it('recordPendingDecision blocking:true fires on the 2nd consecutive fail, not the 1st', async () => {
    const insertSpy = vi.fn(async () => ({ error: null }));
    const supabase = makeSupabaseStub({ insertSpy, lastAssessment: { verdict: 'fail', consecutive_fail_count: 1 } });
    const recordCorrectiveFinding = vi.fn(async () => ({ recorded: true }));
    const recordPendingDecision = vi.fn(async () => ({ recorded: true }));

    const page = {
      evaluate: vi.fn(async () => null),
      locator: () => ({ count: async () => 0 }),
    };
    const acquireLiveInstance = vi.fn(async () => ({ ok: true, page, browser: {}, teardown: vi.fn(async () => {}) }));

    const result = await assessVenture(
      { ventureId: 'v3', url: 'https://still-broken.example.com' },
      { supabase, recordCorrectiveFinding, recordPendingDecision, acquireLiveInstance }
    );

    expect(result.verdict).toBe('fail');
    expect(recordPendingDecision).toHaveBeenCalledTimes(1);
    expect(recordPendingDecision).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ blocking: true, ventureId: 'v3' })
    );
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ consecutive_fail_count: 2 }));
  });
});

describe('TS-5: acquisition-level unreachable/timeout error', () => {
  it('routes as self-fault to coordinator lane only, never the chairman, regardless of consecutive count', async () => {
    const insertSpy = vi.fn(async () => ({ error: null }));
    const supabase = makeSupabaseStub({ insertSpy, lastAssessment: { verdict: 'fail', consecutive_fail_count: 5 } });
    const recordCorrectiveFinding = vi.fn(async () => ({ recorded: true }));
    const recordPendingDecision = vi.fn(async () => ({ recorded: true }));
    const acquireLiveInstance = vi.fn(async () => ({ ok: false, reason: 'timeout' }));

    const result = await assessVenture(
      { ventureId: 'v4', url: 'https://timeout.example.com' },
      { supabase, recordCorrectiveFinding, recordPendingDecision, acquireLiveInstance }
    );

    expect(result.verdict).toBe('error');
    expect(recordCorrectiveFinding).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ metadata: expect.objectContaining({ self_fault: true }) })
    );
    expect(recordPendingDecision).not.toHaveBeenCalled();
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ verdict: 'error', consecutive_fail_count: 5 }));
  });
});
