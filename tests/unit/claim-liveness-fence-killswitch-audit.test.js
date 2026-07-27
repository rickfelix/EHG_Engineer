/**
 * SD-LEO-INFRA-CLAIM-LIVENESS-FENCE-001 FR-5 — kill switch and durable refusal records.
 *
 * WHY THESE TWO SHIP TOGETHER. They are the operability half of the fence, and the fence is unusual
 * in that ITS OWN FAILURE MODE IS INVISIBLE: if it starts falsely refusing live workers, the fleet
 * just looks idle. Nobody gets an error. So you need (a) a way to stop it without shipping code,
 * and (b) a durable record of every refusal, because the question asked afterwards is always "was
 * that fence correct?" and answering it needs the pids that were consulted — which console.warn
 * cannot provide once the process is gone.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  claimantLivenessFence,
  fenceDisabled,
  FENCE_DISABLED_CACHE,
} = require('../../lib/fleet/claimant-liveness.cjs');

const DEAD_SESSION = 'dead-session-cccc';
const DEAD_PID = 31337;

/** Stub with a working chairman_dashboard_config lane and a recording system_events lane. */
function makeSb({ fenceConfig = null, configThrows = false } = {}) {
  const events = [];
  return {
    events,
    from(table) {
      if (table === 'system_events') {
        return { insert: async (row) => { events.push(row); return { error: null }; } };
      }
      if (table === 'chairman_dashboard_config') {
        return {
          select: () => ({
            limit: () => ({
              maybeSingle: async () => {
                if (configThrows) throw new Error('config unreadable');
                return { data: { metadata: fenceConfig ? { claim_liveness_fence: fenceConfig } : {} }, error: null };
              },
            }),
          }),
        };
      }
      // claude_sessions
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { pid: DEAD_PID }, error: null }) }) }),
      };
    },
  };
}

const deadSeams = {
  execCmd: vi.fn(() => 'INFO: No tasks are running which match the specified criteria.\n'),
  readPidfile: vi.fn(() => ({ session_id: DEAD_SESSION, cc_parent_pid: DEAD_PID })),
};

beforeEach(() => {
  vi.clearAllMocks();
  FENCE_DISABLED_CACHE.value = null; // the 60s cache would otherwise leak between cases
  FENCE_DISABLED_CACHE.at = 0;
  delete process.env.CLAIM_LIVENESS_FENCE;
});
afterEach(() => { delete process.env.CLAIM_LIVENESS_FENCE; });

describe('FR-5 kill switch', () => {
  it('env CLAIM_LIVENESS_FENCE=off disables the fence with no DB round trip', async () => {
    process.env.CLAIM_LIVENESS_FENCE = 'off';
    const sb = makeSb();
    const { reason, detail } = await claimantLivenessFence(sb, DEAD_SESSION, deadSeams);

    expect(reason).toBeNull(); // a DEAD claimant passes, because the fence is switched off
    expect(detail).toMatchObject({ skipped: 'fence_disabled', via: 'env' });
    expect(sb.events).toHaveLength(0); // nothing refused, so nothing to record
  });

  it('the fleet-wide config flag disables it without a restart', async () => {
    const sb = makeSb({ fenceConfig: 'off' });
    const { reason, detail } = await claimantLivenessFence(sb, DEAD_SESSION, deadSeams);
    expect(reason).toBeNull();
    expect(detail).toMatchObject({ skipped: 'fence_disabled', via: 'config' });
  });

  it('an UNREADABLE config leaves the fence ON — absence of a kill signal is not a kill signal', async () => {
    const sb = makeSb({ configThrows: true });
    const { reason } = await claimantLivenessFence(sb, DEAD_SESSION, deadSeams);
    // The tempting failure is to treat "cannot read the switch" as "switch is off". That would let
    // one unreadable row silently disable the fence fleet-wide.
    expect(reason).toBe('claimant_not_live');
  });

  it('caches the config verdict so a hot claim path does not re-query every time', async () => {
    const sb = makeSb({ fenceConfig: 'off' });
    let queries = 0;
    const counting = { ...sb, from(t) { if (t === 'chairman_dashboard_config') queries += 1; return sb.from(t); } };
    await fenceDisabled(counting);
    await fenceDisabled(counting);
    expect(queries).toBe(1);
  });
});

describe('FR-5 durable refusal record', () => {
  it('persists a refusal with the pids that were consulted', async () => {
    const sb = makeSb();
    const { reason } = await claimantLivenessFence(sb, DEAD_SESSION, {
      ...deadSeams,
      context: { sdKey: 'QF-20260726-607', surface: 'quick-fix-claim' },
    });

    expect(reason).toBe('claimant_not_live');
    expect(sb.events).toHaveLength(1);
    expect(sb.events[0]).toMatchObject({
      event_type: 'claim_write_refused_claimant_not_live',
      actor_role: 'fleet-worker',
    });
    // The pids are the whole point — without them a later review cannot tell a correct fence from
    // a false one.
    expect(sb.events[0].payload).toMatchObject({
      session_id: DEAD_SESSION,
      pidfile_pid: DEAD_PID,
      verdict: 'DEAD',
      sd_key: 'QF-20260726-607',
      surface: 'quick-fix-claim',
    });
  });

  it('does NOT record a row when the claim is allowed', async () => {
    const sb = makeSb();
    const alive = {
      execCmd: vi.fn(() => `"claude.exe","${DEAD_PID}","Console","1","1 K"\n`),
      readPidfile: vi.fn(() => ({ cc_parent_pid: DEAD_PID })),
    };
    const { reason } = await claimantLivenessFence(sb, DEAD_SESSION, alive);
    expect(reason).toBeNull();
    // Recording every pass would bury the refusals, which are the rows an incident review reads.
    expect(sb.events).toHaveLength(0);
  });

  it('a failing audit insert never changes the fence outcome', async () => {
    const sb = makeSb();
    sb.from = (t) => (t === 'system_events'
      ? { insert: async () => { throw new Error('audit table gone'); } }
      : makeSb().from(t));

    const { reason } = await claimantLivenessFence(sb, DEAD_SESSION, deadSeams);
    expect(reason).toBe('claimant_not_live'); // still refused; audit is best-effort only
  });
});
