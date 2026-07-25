/**
 * SD-LEO-INFRA-LAUNCHER-CAN-HOST-001 FR-1 — scripts/fleet/provision-canary.mjs.
 *
 * TS-1 IS NOT A TAUTOLOGY, ON PURPOSE. The obvious way to write these is to inject a resolveFn that
 * returns {resolved:true} and then assert the CLI reported success — which asserts the stub, not the
 * code. canary-provision.test.js already does that. Here the fake supabase's ROWS are the state and
 * the REAL provisionCanary + REAL resolveCanaryTarget + REAL loadDesiredSlots run against them, so
 * "already_live" is a genuine resolution through the production predicate. Only spawn is stubbed,
 * because spawning is the one thing a unit test must not do.
 *
 * ENV-INDEPENDENCE: no test reads .env, constructs a client, or touches FLEET_* / APPDATA /
 * CLAUDE_SESSION_ID. supabase and provisionFn are injected; main() only builds a client when one is
 * NOT injected, and the one test covering that path asserts the failure is handled, not that a client
 * appears. Verify with: env -u CLAUDE_SESSION_ID -u APPDATA npx vitest run <this file>
 */
import { describe, it, expect } from 'vitest';
import { main, classifyProvisionOutcome, EXIT, DIAGNOSIS } from '../../../scripts/fleet/provision-canary.mjs';

/**
 * Fake whose ROWS are the state. Faithful to the two queries the real code path issues:
 *   claude_sessions    -> .select(...).in('status', ['active','idle'])   (session-registry-adapter.js:12)
 *   fleet_desired_slots-> .select(...)  awaited directly                 (desired-slots-store.js:47)
 */
function fakeSupabase({ sessions = [], slots = [] } = {}) {
  return {
    from(table) {
      const rows = table === 'claude_sessions' ? sessions : slots;
      const result = { data: rows, error: null };
      const builder = {
        select: () => builder,
        in: () => Promise.resolve(result),
        then: (resolve) => Promise.resolve(result).then(resolve),
      };
      return builder;
    },
  };
}

const CANARY_SESSION = {
  session_id: 'sess-canary-1',
  terminal_id: 'term-1',
  pid: 4242,
  status: 'active',
  released_at: null,
  metadata: { account_profile: 'canary', fleet_identity: { callsign: 'Canary-1' } },
};
const PLAIN_SESSION = {
  session_id: 'sess-worker-1',
  terminal_id: 'term-2',
  pid: 99,
  status: 'active',
  released_at: null,
  metadata: { fleet_identity: { callsign: 'Delta' } },
};
const CANARY_SLOT = { name: 'Canary-1', role: 'worker', account_profile: 'canary', enabled: true };

const silent = () => {};

describe('FR-1 provision-canary — real resolution, not a stubbed verdict', () => {
  it('reports already_live when a canary row genuinely resolves through resolveCanaryTarget', async () => {
    // No spawnFn injected anywhere: if the real resolution did NOT find the canary, provisionCanary
    // would proceed to spawn and this test would fail by reaching the default spawn seam.
    const r = await main([], { supabase: fakeSupabase({ sessions: [CANARY_SESSION], slots: [CANARY_SLOT] }), log: silent });
    expect(r.reason).toBe('already_live');
    expect(r.exitCode).toBe(EXIT.OK);
    expect(r.ok).toBe(true);
  });

  it('does NOT treat a non-canary live session as a provisioned canary', async () => {
    // The discriminator: a live, heartbeating session with no account_profile stamp is exactly the
    // fleet's current state — alive but undiscoverable. It must not read as ok.
    const r = await main([], {
      supabase: fakeSupabase({ sessions: [PLAIN_SESSION], slots: [] }),
      provisionFn: async (args) => {
        // Real resolution ran and found nothing; assert that, then short-circuit before any spawn.
        const { resolveCanaryTarget } = await import('../../../lib/fleet/canary-guard.js');
        const res = await resolveCanaryTarget(args.supabase, { by: 'account_profile', value: 'canary' });
        expect(res.resolved).not.toBe(true);
        return { ok: false, reason: 'no_canary_slot_seeded' };
      },
      log: silent,
    });
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(EXIT.GATE_UNMET);
  });

  it('dry-run is the DEFAULT and never spawns', async () => {
    let spawned = false;
    const r = await main([], {
      supabase: fakeSupabase({ sessions: [], slots: [CANARY_SLOT] }),
      provisionFn: async (args) => {
        expect(args.live).toBe(false); // the safety property: absence of --live means live=false
        spawned = true;
        return { ok: false, reason: 'dry_run' };
      },
      log: silent,
    });
    expect(spawned).toBe(true);
    expect(r.reason).toBe('dry_run');
    expect(r.exitCode).toBe(EXIT.GATE_UNMET);
  });

  it('passes live:true only when --live AND FLEET_SPAWN_CONTROL_LIVE are BOTH present', async () => {
    let seenLive = null;
    await main(['--live'], {
      supabase: fakeSupabase({ sessions: [], slots: [CANARY_SLOT] }),
      env: { FLEET_SPAWN_CONTROL_LIVE: 'true' },
      provisionFn: async (args) => { seenLive = args.live; return { ok: true, reason: 'provisioned' }; },
      log: silent,
    });
    expect(seenLive).toBe(true);
  });

  it('SEC-CANHOST-02: REFUSES --live when FLEET_SPAWN_CONTROL_LIVE is unset, and never reaches provision', async () => {
    // The original docstring claimed --live "only reaches spawn-control, which self-gates behind
    // FLEET_SPAWN_CONTROL_LIVE". That was FALSE: canary-provision forwards live as opts.live and
    // spawn-control reads `opts.live ?? isLiveEnabled()`, so the explicit opt OVERRIDES the env gate --
    // `--live` alone really did spawn. A false safety claim on an operator-facing CLI is the dangerous
    // kind. This CLI now enforces both factors, which is what makes the comment true.
    let reachedProvision = false;
    const r = await main(['--live'], {
      supabase: fakeSupabase({ sessions: [], slots: [CANARY_SLOT] }),
      env: {}, // FLEET_SPAWN_CONTROL_LIVE unset
      provisionFn: async () => { reachedProvision = true; return { ok: true, reason: 'provisioned' }; },
      log: silent,
    });
    expect(reachedProvision, 'must not spawn when only one factor is present').toBe(false);
    expect(r.reason).toBe('live_requires_env_gate');
    expect(r.exitCode).toBe(EXIT.INFRA);
  });

  it('SEC-CANHOST-02: REFUSES rather than silently downgrading to dry-run', async () => {
    // Downgrading would be the tempting fail-safe, but an operator who typed --live and saw "DRY-RUN"
    // could reasonably read it as "it ran". A non-zero exit and an explicit refusal cannot be misread.
    const r = await main(['--live'], {
      supabase: fakeSupabase({ sessions: [], slots: [CANARY_SLOT] }),
      env: {}, provisionFn: async () => ({ ok: false, reason: 'dry_run' }), log: silent,
    });
    expect(r.reason).not.toBe('dry_run');
    expect(r.ok).toBe(false);
  });
});

describe('FR-1 classifyProvisionOutcome — three-valued exit contract', () => {
  it('separates a met gate, an unmet gate, and infra', () => {
    expect(classifyProvisionOutcome({ ok: true, reason: 'provisioned' }).exitCode).toBe(EXIT.OK);
    expect(classifyProvisionOutcome({ ok: false, reason: 'registration_timeout' }).exitCode).toBe(EXIT.GATE_UNMET);
    expect(classifyProvisionOutcome({ ok: false, reason: 'no_canary_slot_seeded' }).exitCode).toBe(EXIT.GATE_UNMET);
  });

  it('fails CLOSED on an unrecognised reason — an unknown state is INFRA, never a silent OK', () => {
    const r = classifyProvisionOutcome({ ok: false, reason: 'something_new' });
    expect(r.exitCode).toBe(EXIT.INFRA);
    expect(r.status).toBe('infra');
  });

  it('treats a malformed/absent result as INFRA rather than throwing', () => {
    expect(classifyProvisionOutcome(undefined).exitCode).toBe(EXIT.INFRA);
    expect(classifyProvisionOutcome(null).status).toBe('infra');
  });

  it('registration_timeout diagnosis names the STAMP as the suspect, not the spawn', () => {
    // This is the whole value of the CLI: the one permitted live run must yield a diagnosis. A bare
    // timeout looks identical whether the slot was unseeded, the spawn failed, or only the stamp did.
    const d = DIAGNOSIS.registration_timeout;
    expect(d).toMatch(/account_profile/);
    expect(d).toMatch(/stamp/i);
    expect(d).toMatch(/REGISTERED/);
  });
});

describe('FR-1 provision-canary — fail-soft, never a false green', () => {
  it('reports INFRA (not a met gate) when provisionCanary throws', async () => {
    const r = await main([], {
      supabase: fakeSupabase({}),
      provisionFn: async () => { throw new Error('boom'); },
      log: silent,
    });
    expect(r.exitCode).toBe(EXIT.INFRA);
    expect(r.ok).toBe(false);
  });

  it('reports INFRA when a client cannot be constructed, without ever reaching provisionCanary', async () => {
    // Guards the CI shape (no .env, no secrets): must degrade to a reported INFRA, never a throw.
    // createClientFn is injected DELIBERATELY. Omitting it does not test harder — it builds a real
    // service client and runs provisionCanary against the production fleet. Measured: this test took
    // 14.2s of live network I/O that way, versus 1ms for every other test here.
    let reachedProvision = false;
    const r = await main([], {
      createClientFn: () => { throw new Error('no credentials'); },
      provisionFn: async () => { reachedProvision = true; return { ok: true, reason: 'provisioned' }; },
      log: silent,
    });
    expect(r.exitCode).toBe(EXIT.INFRA);
    expect(r.reason).toBe('no_supabase');
    expect(r.ok).toBe(false);
    expect(reachedProvision).toBe(false); // must fail BEFORE doing any work
  });
});
