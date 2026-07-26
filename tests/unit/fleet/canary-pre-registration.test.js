/**
 * SD-LEO-INFRA-SESSION-SPAWN-AND-PROMPT-LIBRARY-001-E — FR-4: the spawn-time canary marker (WRITER).
 *
 * FR-1 gave the fence a signal it could read. FR-4 is what actually puts that signal there, and the
 * only property that makes it worth anything is ORDERING: the marker must exist BEFORE the child
 * process starts, because a child can check in within milliseconds and the claim fence can only see
 * what is already written. A marker written after spawn recreates the window this SD closes, and would
 * pass every test that merely asserts "the marker was written".
 *
 * Why not lean on claude_sessions.metadata instead: that stamp lives inside spawn-control's
 * session-bind loop, which was MEASURED missing its window by 1.3s on 2026-07-25 — discarding the
 * window handle, the profile stamp and the session bind together and leaving a perfect-looking spawn
 * with empty metadata. So the metadata stamp is explicitly NOT a fallback for this, and these tests
 * never treat it as one.
 */
import { describe, it, expect, vi } from 'vitest';
import { writeCanaryPreRegistration, CANARY_PRE_REGISTRATION_KIND, CANARY_TRIGGER_KEY } from '../../../lib/fleet/canary-session.js';

/** Records inserts so the ROW SHAPE can be asserted, not just the fact of a call. */
function insertRecorder({ error = null, throws = false } = {}) {
  const rows = [];
  return {
    rows,
    from(table) {
      if (table !== 'session_coordination') throw new Error(`unexpected table: ${table}`);
      return {
        insert: async (row) => {
          if (throws) throw new Error('transport exploded');
          rows.push(row);
          return { error };
        },
      };
    },
  };
}

describe('writeCanaryPreRegistration — FR-4 writer', () => {
  it('keys the marker on the MINTED session id, on the column the reader queries', async () => {
    // The reader (findCanaryPreRegistration) filters target_session + payload->>kind. If the writer
    // used any other column or kind the two would never meet, and the fence would read as "no marker"
    // for every canary — a silent, total no-op that still logs a successful spawn.
    const sb = insertRecorder();
    const out = await writeCanaryPreRegistration(sb, 'minted-uuid-1', { callsign: 'Canary-pilot' });
    expect(out).toMatchObject({ ok: true, inserted: true });
    expect(sb.rows).toHaveLength(1);
    expect(sb.rows[0].target_session).toBe('minted-uuid-1');
    expect(sb.rows[0].payload.kind).toBe(CANARY_PRE_REGISTRATION_KIND);
  });

  it('mirrors the metadata trigger key and profile into the payload', async () => {
    const sb = insertRecorder();
    await writeCanaryPreRegistration(sb, 'minted-uuid-2', { callsign: 'Canary-pilot' });
    expect(sb.rows[0].payload[CANARY_TRIGGER_KEY]).toBe(true);
    expect(sb.rows[0].payload.account_profile).toBe('canary');
  });

  it('stays OUT of the friction signal lane (no signal_type / intent_action)', async () => {
    // Invariant copied from canary-trigger.cjs: a payload carrying either key gets scooped by the
    // signal-router and the deconfliction sweep, which would consume the marker as a message.
    const sb = insertRecorder();
    await writeCanaryPreRegistration(sb, 'minted-uuid-3', {});
    expect(sb.rows[0].payload.signal_type).toBeUndefined();
    expect(sb.rows[0].payload.intent_action).toBeUndefined();
    expect(sb.rows[0].target_session).not.toBeNull(); // valid_target CHECK: never null
  });

  it('REPORTS a failed insert instead of throwing, and never claims success', async () => {
    // The caller refuses the spawn on ok:false. If this threw instead, the throw would unwind through
    // spawn() and the refusal decision would never be reached.
    const sb = insertRecorder({ error: { message: 'insert denied' } });
    const out = await writeCanaryPreRegistration(sb, 'minted-uuid-4', {});
    expect(out.ok).toBe(false);
    expect(out.error).toBe('insert denied');
  });

  it('also reports (not throws) when the transport itself explodes', async () => {
    const sb = insertRecorder({ throws: true });
    const out = await writeCanaryPreRegistration(sb, 'minted-uuid-5', {});
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/transport exploded/);
  });

  it('refuses to write without a session id — the marker would be unfindable', async () => {
    // A row whose target_session is null cannot be matched by the reader and would also violate the
    // valid_target CHECK. Reporting ok:false makes the caller refuse rather than spawn unmarked.
    const sb = insertRecorder();
    expect((await writeCanaryPreRegistration(sb, null, {})).ok).toBe(false);
    expect((await writeCanaryPreRegistration(sb, '', {})).ok).toBe(false);
    expect(sb.rows).toHaveLength(0);
    expect((await writeCanaryPreRegistration(null, 'minted-uuid-6', {})).ok).toBe(false);
  });
});

describe('FR-4 wiring in spawn() — ordering, refusal, and the blast-radius control', () => {
  const CURRENT_RUNNER = (args) => {
    if (args[0] === 'fetch') return '';
    if (args.includes('--abbrev-ref')) return 'main\n';
    if (args[0] === 'status') return '';
    if (args[0] === 'rev-list') return '0\n';
    return '';
  };
  const enumExec = (handle = 131074) => {
    let call = 0;
    return vi.fn(async () => { call += 1; return { stdout: call === 1 ? '' : `${handle}|5555|WindowsTerminal|Claude Code` }; });
  };

  /** Fake that records the ORDER of coordination inserts vs claude_sessions writes. */
  function orderedFake({ coordinationInsertError = null } = {}) {
    const order = [];
    const rows = [];
    return {
      order,
      rows,
      from(table) {
        if (table === 'session_coordination') {
          return {
            select: () => ({ eq: () => ({ gte: async () => ({ count: 0 }) }) }),
            insert: async (row) => { order.push('pre_registration'); rows.push(row); return { error: coordinationInsertError }; },
          };
        }
        if (table === 'claude_sessions') {
          return {
            select: () => ({
              in: async () => ({ data: [] }),
              eq: () => ({ maybeSingle: async () => ({ data: null }) }),
            }),
            update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    };
  }

  it('THE ORDERING PROPERTY: the marker is written BEFORE the process is spawned', async () => {
    // The whole point of FR-4. A child can check in within milliseconds, so a marker written after
    // spawn leaves exactly the unfenced window this SD exists to close. An assertion that the marker
    // merely EXISTS would pass against that broken ordering, which is why this records sequence.
    const { spawn } = await import('../../../lib/fleet/spawn-control.js');
    const sb = orderedFake();
    const spawnFn = vi.fn(() => { sb.order.push('spawn'); return { pid: 4242, unref: vi.fn() }; });
    await spawn({ role: 'worker', callsign: 'Canary-pilot', accountProfile: 'canary' }, {
      live: true, spawnFn, supabaseClient: sb, currencyRunner: CURRENT_RUNNER, execFn: enumExec(), sleepFn: vi.fn(),
      baseDir: 'C:\\fleet\\profiles',
    });
    expect(spawnFn).toHaveBeenCalled();
    expect(sb.order.indexOf('pre_registration')).toBeGreaterThan(-1);
    expect(sb.order.indexOf('pre_registration')).toBeLessThan(sb.order.indexOf('spawn'));
  });

  it('the marker carries the id actually passed to the child as --session-id', async () => {
    // If the marker were keyed on a different id than the one the child registers under, the fence
    // would look up the child's real id, find nothing, and let a canary claim — while this test file
    // still showed a marker being written.
    const { spawn } = await import('../../../lib/fleet/spawn-control.js');
    const sb = orderedFake();
    const result = await spawn({ role: 'worker', callsign: 'Canary-pilot', accountProfile: 'canary' }, {
      live: true, spawnFn: vi.fn(() => ({ pid: 1, unref: vi.fn() })), supabaseClient: sb,
      currencyRunner: CURRENT_RUNNER, execFn: enumExec(), sleepFn: vi.fn(), baseDir: 'C:\\fleet\\profiles',
    });
    expect(result.invocation.sessionId).toBeTruthy();
    expect(sb.rows[0].target_session).toBe(result.invocation.sessionId);
  });

  it('REFUSES the canary spawn when the marker cannot be written — fail closed', async () => {
    // An unmarked canary passes the claim fence and takes real work off the shared queue. A refused
    // provision costs one retry; proceeding unmarked corrupts a peer's queue.
    const { spawn } = await import('../../../lib/fleet/spawn-control.js');
    const sb = orderedFake({ coordinationInsertError: { message: 'insert denied' } });
    const spawnFn = vi.fn(() => ({ pid: 4242, unref: vi.fn() }));
    const result = await spawn({ role: 'worker', callsign: 'Canary-pilot', accountProfile: 'canary' }, {
      live: true, spawnFn, supabaseClient: sb, currencyRunner: CURRENT_RUNNER, execFn: enumExec(), sleepFn: vi.fn(),
      baseDir: 'C:\\fleet\\profiles',
    });
    expect(spawnFn).not.toHaveBeenCalled(); // never started at all
    expect(result.live).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/canary_pre_registration_failed/);
  });

  it('BLAST-RADIUS CONTROL: an ORDINARY spawn still succeeds even if every DB call fails', async () => {
    // THIS IS THE TEST THE CODE COMMENT POINTS AT. On 2026-07-26 a probe left a hardcoded ok:false at
    // this exact call site; committed, it would have refused every spawn, restart, relaunch and
    // canary-provision — a fleet-wide outage from one line. The refusal must therefore be unreachable
    // for a non-canary spawn, and the only convincing way to show that is to make the marker path
    // fail as hard as possible and prove an ordinary worker is untouched.
    const { spawn } = await import('../../../lib/fleet/spawn-control.js');
    const hostile = {
      from(table) {
        if (table === 'claude_sessions') {
          return {
            select: () => ({ in: async () => ({ data: [] }), eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
            update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          };
        }
        // Any coordination write/read detonates.
        return { select: () => { throw new Error('hostile'); }, insert: () => { throw new Error('hostile'); } };
      },
    };
    const spawnFn = vi.fn(() => ({ pid: 4242, unref: vi.fn() }));
    const result = await spawn({ role: 'worker', callsign: 'Bravo' }, {
      live: true, spawnFn, supabaseClient: hostile, currencyRunner: CURRENT_RUNNER, execFn: enumExec(), sleepFn: vi.fn(),
    });
    expect(spawnFn, 'an ordinary spawn must never be gated on the canary marker').toHaveBeenCalled();
    expect(result.live).toBe(true);
  });

  it('restart() carries canary identity forward from the CALLSIGN when the profile stamp never landed', async () => {
    // The sessions most likely to reach a restart UNSTAMPED are exactly the canaries: the
    // account_profile stamp is written inside the bind loop that is measured to miss, and
    // reboot-respawn writes it never. Reading account_profile alone therefore reproduced the same
    // blind spot one level down — an unstamped canary came back as an ordinary worker with no profile
    // isolation and no marker. Observable proof: the marker is written at all, which only happens if
    // accountProfile resolved to 'canary' from the namespace callsign.
    const { restart } = await import('../../../lib/fleet/spawn-control.js');
    const rows = [];
    const session = {
      session_id: 's-unstamped-canary', status: 'active',
      // Resolution matches on metadata.fleet_identity.callsign, so the target below must equal THIS.
      // NOTE what is absent: account_profile. Only the namespace callsign survives.
      metadata: { fleet_identity: { callsign: 'Canary-1', color: 'yellow' }, role: 'worker' },
    };
    const sb = {
      from(table) {
        if (table === 'session_coordination') {
          return {
            select: () => ({ eq: () => ({ gte: async () => ({ count: 0 }) }) }),
            insert: async (row) => { rows.push(row); return { error: null }; },
          };
        }
        return {
          select: () => ({
            in: async () => ({ data: [session] }),
            eq: () => ({ maybeSingle: async () => ({ data: session }) }),
          }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      },
    };
    await restart('Canary-1', {
      supabaseClient: sb, by: 'callsign', live: true, spawnFn: vi.fn(() => ({ pid: 7, unref: vi.fn() })),
      currencyRunner: CURRENT_RUNNER, execFn: enumExec(), sleepFn: vi.fn(), baseDir: 'C:\\fleet\\profiles',
    });
    expect(rows.length, 'an unstamped canary restart must still be marked').toBeGreaterThan(0);
    expect(rows[0].payload.kind).toBe(CANARY_PRE_REGISTRATION_KIND);
  });

  describe('reboot-respawn-runner — the worst case: this path writes NO canary metadata, ever', () => {
    /** Records marker inserts and spawn order for the respawn runner. */
    function respawnFake({ error = null } = {}) {
      const order = [];
      const rows = [];
      return {
        order,
        rows,
        from: () => ({
          insert: async (row) => { order.push('pre_registration'); rows.push(row); return { error }; },
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        }),
      };
    }
    const canarySlot = { name: 'Canary-1', role: 'worker', account_profile: 'canary', resume_uuid: 'u-c' };

    it('marks the canary slot BEFORE spawning it', async () => {
      // reboot-respawn writes neither account_profile nor fleet_identity.callsign at any point, so a
      // canary respawned at boot was indistinguishable from an ordinary worker for its whole life.
      const { runRebootRespawn } = await import('../../../lib/fleet/reboot-respawn-runner.js');
      const sb = respawnFake();
      const res = await runRebootRespawn({
        supabase: sb, loadFn: async () => [canarySlot], logFn: async () => ({ ok: true }), live: true,
        resolveProfileDirFn: (n) => `C:\\profiles\\${n}`, sleepFn: vi.fn(),
        spawnFn: () => { sb.order.push('spawn'); return { pid: 11 }; },
      });
      expect(res.results[0].spawned).toBe(true);
      expect(sb.order).toEqual(['pre_registration', 'spawn']);
    });

    it('REFUSES that slot when the marker cannot be written, and the refusal is bounded to it', async () => {
      // Deliberately against this file's fail-soft house style (an unresolvable profile still spawns):
      // that is right for a profile dir and wrong for a safety marker. The bound matters as much as the
      // refusal — a reboot must still bring the rest of the fleet back.
      const { runRebootRespawn } = await import('../../../lib/fleet/reboot-respawn-runner.js');
      const sb = respawnFake({ error: { message: 'insert denied' } });
      const spawnFn = vi.fn(() => ({ pid: 12 }));
      const res = await runRebootRespawn({
        supabase: sb, logFn: async () => ({ ok: true }), live: true, sleepFn: vi.fn(),
        resolveProfileDirFn: (n) => `C:\\profiles\\${n}`,
        loadFn: async () => [canarySlot, { name: 'Bravo', role: 'worker', resume_uuid: 'u-b' }],
        spawnFn,
      });
      expect(res.results[0].spawned, 'the canary slot must be refused').toBe(false);
      expect(res.results[1].spawned, 'an ordinary slot must still respawn after the refusal').toBe(true);
      expect(spawnFn).toHaveBeenCalledTimes(1);
    });

    it('does NOT mark an ordinary slot (the guard stays canary-scoped)', async () => {
      const { runRebootRespawn } = await import('../../../lib/fleet/reboot-respawn-runner.js');
      const sb = respawnFake();
      await runRebootRespawn({
        supabase: sb, loadFn: async () => [{ name: 'Bravo', role: 'worker', resume_uuid: 'u-b' }],
        logFn: async () => ({ ok: true }), live: true, sleepFn: vi.fn(), spawnFn: () => ({ pid: 13 }),
      });
      expect(sb.rows).toHaveLength(0);
    });
  });

  it('a DRY RUN writes no marker (nothing was spawned to mark)', async () => {
    // The write sits after the dry-run return on purpose: a dry run that inserted rows would leave
    // markers for session ids that never existed, which the fence would carry forever.
    const { spawn } = await import('../../../lib/fleet/spawn-control.js');
    const sb = orderedFake();
    const result = await spawn({ role: 'worker', callsign: 'Canary-pilot', accountProfile: 'canary' }, { live: false, supabaseClient: sb, baseDir: 'C:\\fleet\\profiles' });
    expect(result.live).toBe(false);
    expect(sb.rows).toHaveLength(0);
  });
});
