/**
 * SD-LEO-INFRA-SESSION-SPAWN-AND-PROMPT-LIBRARY-001-E — FR-1 / FR-2 canary fence predicate.
 *
 * The defect this SD exists to prevent is a canary acquiring real work. The defect THIS FILE exists
 * to prevent is subtler: a predicate that looks like it fences and cannot. Every case below is
 * written so it can FAIL — see the negative control (TS-4) and the no-env-read guard.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  isCanarySession,
  isCanaryMetadata,
  findCanaryPreRegistration,
  CANARY_TRIGGER_KEY,
  CANARY_PRE_REGISTRATION_KIND,
} from '../../../lib/fleet/canary-session.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '../../../lib/fleet/canary-session.js');

/** Fake supabase modelling ONLY the shape the predicate uses. */
function fakeSb({ rows = [], error = null, throws = false } = {}) {
  const seen = {};
  const api = {
    from(t) { seen.table = t; return api; },
    select() { return api; },
    eq(col, val) { seen[col] = val; return api; },
    limit() {
      if (throws) throw new Error('transport exploded');
      return Promise.resolve({ data: rows, error });
    },
  };
  return { api, seen };
}

describe('isCanaryMetadata — the LATE (defence-in-depth) signals', () => {
  it('fires on the FR-4 trigger key', () => {
    expect(isCanaryMetadata({ [CANARY_TRIGGER_KEY]: true })).toBe(true);
  });
  it('fires on account_profile=canary', () => {
    expect(isCanaryMetadata({ account_profile: 'canary' })).toBe(true);
  });
  it('fires on a canary-namespace callsign even when the profile stamp never landed', () => {
    // The reboot-respawn / bind-loop-exhausted case: one signal present, the other permanently absent.
    expect(isCanaryMetadata({ fleet_identity: { callsign: 'Canary-1' } })).toBe(true);
  });
  it('NEGATIVE CONTROL — an ordinary worker is NOT canary', () => {
    // Without this the whole suite could pass against a predicate hardcoded to true.
    expect(isCanaryMetadata({ account_profile: 'live', fleet_identity: { callsign: 'Bravo' } })).toBe(false);
    expect(isCanaryMetadata({})).toBe(false);
    expect(isCanaryMetadata(null)).toBe(false);
  });
});

describe('isCanarySession — FR-1 disjunction', () => {
  it('TS-13: fences from the PRE-REGISTRATION alone, with metadata EMPTY', async () => {
    // THE POINT OF FR-1. This is the 0-10s registration window: nothing is stamped yet, and every
    // metadata signal is blind. Only the spawner-minted-id marker can see it.
    const { api, seen } = fakeSb({ rows: [{ id: 'pre-1' }] });
    const out = await isCanarySession(api, { sessionId: 'sess-canary', metadata: {} });
    expect(out).toMatchObject({ isCanary: true, reason: 'canary_pre_registration', indeterminate: false });
    expect(seen.table).toBe('session_coordination');
    expect(seen.target_session).toBe('sess-canary');
    expect(seen['payload->>kind']).toBe(CANARY_PRE_REGISTRATION_KIND);
  });

  it('fences from metadata WITHOUT any lookup when the stamp has landed', async () => {
    const sb = { from: vi.fn(() => { throw new Error('must not be queried'); }) };
    const out = await isCanarySession(sb, { sessionId: 's', metadata: { account_profile: 'canary' } });
    expect(out.isCanary).toBe(true);
    expect(out.reason).toBe('canary_metadata');
    expect(sb.from).not.toHaveBeenCalled(); // cheap path first; no I/O when the answer is in hand
  });

  it('TS-4 NEGATIVE CONTROL — an ordinary worker with no marker is NOT fenced', async () => {
    const { api } = fakeSb({ rows: [] });
    const out = await isCanarySession(api, {
      sessionId: 'sess-bravo',
      metadata: { account_profile: 'live', fleet_identity: { callsign: 'Bravo' } },
    });
    expect(out).toMatchObject({ isCanary: false, reason: 'not_canary', indeterminate: false });
  });

  it('FR-2: a FAILED lookup fences (fail-closed), and says so distinctly', async () => {
    // Neighbouring predicates deliberately fail toward permissiveness; this one must not. The
    // reason string is distinct so an operator can tell a real canary from an indeterminate check.
    const { api } = fakeSb({ error: { message: 'boom' } });
    const out = await isCanarySession(api, { sessionId: 's', metadata: {} });
    expect(out).toMatchObject({ isCanary: true, reason: 'canary_check_indeterminate_fail_closed', indeterminate: true });
  });

  it('FR-2: a THROWING transport also fences, never returns false', async () => {
    const { api } = fakeSb({ throws: true });
    const out = await isCanarySession(api, { sessionId: 's', metadata: {} });
    expect(out.isCanary).toBe(true);
    expect(out.reason).toBe('canary_check_indeterminate_fail_closed');
  });

  it('findCanaryPreRegistration reports lookupFailed DISTINCTLY from not-found', async () => {
    // Collapsing these two into one falsy value is the exact conflation that let a reconciler
    // report a healthy quiet lane while failing on every write.
    const ok = await findCanaryPreRegistration(fakeSb({ rows: [] }).api, 's');
    expect(ok).toEqual({ found: false, lookupFailed: false });
    const bad = await findCanaryPreRegistration(fakeSb({ error: { message: 'x' } }).api, 's');
    expect(bad).toEqual({ found: false, lookupFailed: true });
  });
});

describe('FR-1 anti-regression: the predicate must never read env for canary identity', () => {
  it('reads NO process.env at all in the source', () => {
    // The original FR-1 named process.env.FLEET_WORKER_CALLSIGN as the primary signal. It is DEAD
    // (measured null on a live worker; only six CLAUDE_-prefixed vars cross the hook boundary).
    // A source-level pin is the only assertion that survives someone "helpfully" re-adding it,
    // because an injected-env test would pass against a variable production never receives.
    const src = readFileSync(SRC, 'utf8');
    const code = src.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/process\s*\.\s*env/);
    expect(code).not.toMatch(/FLEET_WORKER_CALLSIGN/);
  });

  it('reuses the shipped isCanaryCallsign rather than re-implementing the prefix test', () => {
    // There are already five inline copies of this check in the repo; a sixth is how they drift.
    const src = readFileSync(SRC, 'utf8');
    expect(src).toMatch(/import\s*\{[^}]*isCanaryCallsign[^}]*\}\s*from\s*'\.\/canary-guard\.js'/);
    const code = src.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/startsWith\(\s*['"]Canary-/);
  });
});
