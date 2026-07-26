import { describe, it, expect } from 'vitest';
import {
  SPAWNABLE_ROLES,
  isSpawnableRole,
  resolveRoleSpawnOpts,
  assertRoleCallsignCompatible,
} from '../../../lib/fleet/role-startup-prompt.js';

describe('SPAWNABLE_ROLES (FR-2, TS-9)', () => {
  it('offers exactly the four operator-spawnable roles', () => {
    expect([...SPAWNABLE_ROLES].sort()).toEqual(['adam', 'coordinator', 'solomon', 'worker']);
  });

  it('does NOT offer canary as a role', () => {
    // canary is an accountProfile; canaries are role='worker'. Offering it here would send
    // accountProfile undefined and produce a session that later fails assertCanaryTarget with
    // not_canary_profile — manufacturing the unexplained refusal this SD exists to remove.
    expect(isSpawnableRole('canary')).toBe(false);
  });

  it('rejects unknown roles rather than accepting any non-empty string', () => {
    expect(isSpawnableRole('coordinatior')).toBe(false); // the typo the free-text box invited
    expect(isSpawnableRole('')).toBe(false);
    expect(isSpawnableRole(undefined)).toBe(false);
  });
});

describe('resolveRoleSpawnOpts — the key-presence trap (FR-1, TS-13)', () => {
  it('OMITS the startupPrompt key entirely for worker', () => {
    // THE REGRESSION GUARD. spawn-control.js branches on ('startupPrompt' in opts), NOT on the
    // value. A `{ startupPrompt: undefined }` return would make the key PRESENT, so
    // defaultStartupPrompt would never run, no pointer positional would be emitted, and every
    // worker spawned from the page would come up with nothing to do and ghost.
    // Asserting hasOwn is the whole point — toBeUndefined() would pass on the broken version.
    const opts = resolveRoleSpawnOpts('worker');
    expect(Object.hasOwn(opts, 'startupPrompt')).toBe(false);
    expect(opts).toEqual({});
  });

  it('OMITS the key for an unknown role too, so a leak cannot suppress the pointer', () => {
    expect(Object.hasOwn(resolveRoleSpawnOpts('nonsense'), 'startupPrompt')).toBe(false);
  });

  it('supplies a real prompt for each non-worker role', () => {
    expect(resolveRoleSpawnOpts('coordinator')).toEqual({ startupPrompt: '/coordinator start' });
    expect(resolveRoleSpawnOpts('solomon')).toEqual({ startupPrompt: '/solomon' });
    expect(resolveRoleSpawnOpts('adam')).toEqual({ startupPrompt: '/adam' });
  });

  it('every mapped prompt is single-line, since the launch path asserts that', () => {
    for (const role of ['coordinator', 'solomon', 'adam']) {
      expect(resolveRoleSpawnOpts(role).startupPrompt).not.toMatch(/[\r\n]/);
    }
  });
});

describe('assertRoleCallsignCompatible — coordinator-pointer hijack (FR-2, TS-14)', () => {
  it('refuses a canary callsign spawned as coordinator', () => {
    // Both inputs are individually legal after FR-2. Together they would hand the coordinator
    // directive to a canary, which then runs /coordinator start and takes over the fleet's
    // coordinator pointer. The build-session-launch backstop does not catch this — it throws only
    // when the prompt is byte-equal to the WORKER directive.
    const verdict = assertRoleCallsignCompatible('coordinator', 'Canary-pilot');
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/canary namespace/i);
  });

  it('refuses a canary callsign for solomon and adam as well', () => {
    expect(assertRoleCallsignCompatible('solomon', 'Canary-pilot').ok).toBe(false);
    expect(assertRoleCallsignCompatible('adam', 'Canary-pilot').ok).toBe(false);
  });

  it('ALLOWS a canary callsign with role=worker — canaries ARE workers', () => {
    // The control arm. Without it this suite would pass on an implementation that refuses every
    // canary spawn, which would break canary provisioning entirely.
    expect(assertRoleCallsignCompatible('worker', 'Canary-pilot').ok).toBe(true);
  });

  it('allows every role on an ordinary callsign', () => {
    for (const role of SPAWNABLE_ROLES) {
      expect(assertRoleCallsignCompatible(role, 'Alpha-2').ok).toBe(true);
    }
  });

  // The bypasses a SECURITY review MEASURED against the first shipped version of this guard. Each
  // one delivered '/coordinator start' to a canary. They are pinned individually rather than as a
  // loop over one spelling, because one spelling is exactly how the gap survived review the
  // first time.
  it.each(['canary-pilot', 'CANARY-pilot', 'CaNaRy-pilot', 'canary-', '  Canary-pilot  '])(
    'refuses canary-namespace callsign %j regardless of case or padding',
    (callsign) => {
      expect(assertRoleCallsignCompatible('coordinator', callsign).ok).toBe(false);
    },
  );

  it('still allows those same spellings with role=worker — canaries ARE workers', () => {
    // Control arm. Without it, a guard that simply refused every canary-ish callsign would pass
    // the block above while breaking canary provisioning outright.
    for (const callsign of ['canary-pilot', 'CANARY-pilot', 'Canary-pilot']) {
      expect(assertRoleCallsignCompatible('worker', callsign).ok).toBe(true);
    }
  });

  it('refuses an UNIDENTIFIABLE callsign for a privileged role', () => {
    // These classify as 'unidentifiable', not 'canary', so a kind==='canary' branch let them
    // through. The array form is a literal laundering of the value blocked above.
    for (const callsign of [['Canary-pilot'], {}, '   ', '', null, undefined, 123]) {
      const verdict = assertRoleCallsignCompatible('coordinator', callsign);
      expect(verdict.ok, `expected refusal for ${JSON.stringify(callsign)}`).toBe(false);
    }
  });

  it('does not refuse an ordinary callsign as unidentifiable', () => {
    // Pairs with the above so the refusal cannot be over-broad and pass by refusing everything.
    expect(assertRoleCallsignCompatible('coordinator', 'Coordinator-1').ok).toBe(true);
  });
});

describe('resolveRoleSpawnOpts — prototype-chain keys (latent pointer suppression)', () => {
  it('OMITS the key for inherited Object.prototype members', () => {
    // ROLE_STARTUP_PROMPTS is a plain literal, so a bare lookup returned
    // { startupPrompt: <Function> } for these — key PRESENT, which is precisely the
    // pointer-suppression defect this function exists to prevent. Not reachable through the route
    // (the allowlist runs first), but the exported function carries no allowlist of its own.
    for (const key of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
      const opts = resolveRoleSpawnOpts(key);
      expect(Object.hasOwn(opts, 'startupPrompt'), `leaked via ${key}`).toBe(false);
    }
  });
});
