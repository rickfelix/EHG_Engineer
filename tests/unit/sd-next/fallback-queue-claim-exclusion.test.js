// SD-FDBK-ENH-ROUTING-RECOMMENDATION-SURFACES-001 (FR-3).
//
// fallback-queue.js's SD select omitted claiming_session_id entirely, so a row claimed by
// ANOTHER live session (claiming_session_id set, is_working_on left false -- the modern claim
// shape; is_working_on is the legacy mirror) could still surface as a recommendation. Live-
// reproduced with SD-LEO-INFRA-ANON-TRUNCATE-SWEEP-001 (session 75532716, heartbeat 6s) during
// PLAN-phase validation. This test pins the fix in both surfaces the PRD names: CONTINUE and
// RECOMMENDED STARTING POINTS.

import { describe, it, expect, vi } from 'vitest';
import { showFallbackQueue } from '../../../scripts/modules/sd-next/display/fallback-queue.js';

// Table-aware chainable Supabase stub. strategic_directives_v2's real chain is
// .select().eq().in().in().order().limit() -- two non-terminal .in() calls before the
// terminal .limit(). sd_key_result_alignment's chain is .select().in() -- .in() IS the
// terminal there. A single shared chain object (as the existing no-SD-path test uses) can't
// express both, so this mock switches behavior by table name.
function makeSupabase({ sds = [] } = {}) {
  const resultFor = (table) => {
    if (table === 'strategic_directives_v2') return { data: sds, error: null };
    return { data: [], error: null }; // sd_key_result_alignment, chairman_dashboard_config
  };
  return {
    from: (table) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        single: async () => ({ data: null, error: null }),
      };
      if (table === 'strategic_directives_v2') {
        chain.in = () => chain; // non-terminal: two calls precede .order().limit()
        chain.limit = async () => resultFor(table);
      } else {
        chain.in = async () => resultFor(table); // terminal here
        chain.limit = async () => resultFor(table);
      }
      return chain;
    },
  };
}

const baseSD = (overrides) => ({
  id: overrides.sd_key.toLowerCase(),
  sd_key: overrides.sd_key,
  title: overrides.title,
  priority: 'high',
  status: 'draft',
  sequence_rank: overrides.sequence_rank,
  progress_percentage: 0,
  dependencies: null,
  metadata: {},
  is_working_on: overrides.is_working_on ?? false,
  claiming_session_id: overrides.claiming_session_id ?? null,
  parent_sd_id: null,
  category: 'infrastructure',
  vision_score: null,
  vision_origin_score_id: null,
  venture_id: null,
  governance_metadata: null,
});

async function runFallbackQueue(sds, sessionContext) {
  const logs = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
    logs.push(args.join(' '));
  });
  try {
    await showFallbackQueue(makeSupabase({ sds }), {
      skipBaselineWarning: true,
      sessionContext,
      openQuickFixes: [],
    });
  } finally {
    spy.mockRestore();
  }
  return logs.join('\n');
}

describe('FR-3: fallback-queue.js excludes foreign-claimed SDs from recommendations', () => {
  it('excludes a foreign-claimed (claiming_session_id set, is_working_on false) SD from RECOMMENDED STARTING POINTS, but still recommends an unclaimed one', async () => {
    const foreignReady = baseSD({
      sd_key: 'SD-FOREIGN-READY-001',
      title: 'Foreign claimed, not marked working-on',
      sequence_rank: 1,
      is_working_on: false,
      claiming_session_id: 'session-OTHER-1',
    });
    const available = baseSD({
      sd_key: 'SD-AVAILABLE-001',
      title: 'Unclaimed and available',
      sequence_rank: 2,
    });

    const output = await runFallbackQueue([foreignReady, available], {
      currentSession: { session_id: 'session-ME' },
      activeSessions: [],
    });

    const recommendedSection = output.split('RECOMMENDED STARTING POINTS:')[1] || '';
    expect(recommendedSection).not.toMatch(/SD-FOREIGN-READY-001/);
    expect(recommendedSection).toMatch(/SD-AVAILABLE-001/);
  });

  it('excludes a foreign-claimed CONTINUE row (is_working_on true, claiming_session_id != caller)', async () => {
    // Deliberately does NOT spell "CONTINUE" in the sd_key -- that substring would
    // collide with the /CONTINUE/ banner assertion below and mask a real regression.
    const foreignWorkingOn = baseSD({
      sd_key: 'SD-FOREIGN-ACTIVE-001',
      title: 'Foreign session marked this working-on',
      sequence_rank: 1,
      is_working_on: true,
      claiming_session_id: 'session-OTHER-2',
    });

    const output = await runFallbackQueue([foreignWorkingOn], {
      currentSession: { session_id: 'session-ME' },
      activeSessions: [],
    });

    expect(output).not.toMatch(/CONTINUE/);
    expect(output).not.toMatch(/SD-FOREIGN-ACTIVE-001.*Marked as "Working On"/s);
  });

  it('still shows CONTINUE for the caller\'s own claim (claiming_session_id === currentSession)', async () => {
    const myOwn = baseSD({
      sd_key: 'SD-MINE-001',
      title: 'My own claim',
      sequence_rank: 1,
      is_working_on: true,
      claiming_session_id: 'session-ME',
    });

    const output = await runFallbackQueue([myOwn], {
      currentSession: { session_id: 'session-ME' },
      activeSessions: [],
    });

    expect(output).toMatch(/CONTINUE/);
    expect(output).toMatch(/SD-MINE-001/);
  });

  it('fails CLOSED when currentSession is unknown: a claimed row (any claim) is excluded, not treated as available', async () => {
    const foreignReady = baseSD({
      sd_key: 'SD-FOREIGN-READY-002',
      title: 'Claimed, caller identity unknown',
      sequence_rank: 1,
      is_working_on: false,
      claiming_session_id: 'session-OTHER-3',
    });
    const available = baseSD({
      sd_key: 'SD-AVAILABLE-002',
      title: 'Still unclaimed',
      sequence_rank: 2,
    });

    // No currentSession in sessionContext at all -- indeterminate caller identity.
    const output = await runFallbackQueue([foreignReady, available], {
      activeSessions: [],
    });

    const recommendedSection = output.split('RECOMMENDED STARTING POINTS:')[1] || '';
    expect(recommendedSection).not.toMatch(/SD-FOREIGN-READY-002/);
    expect(recommendedSection).toMatch(/SD-AVAILABLE-002/);
  });
});
