/**
 * DB-tier runtime gate — SD-LEO-INFRA-VITEST-TIER-REAL-001 FR-1/FR-2.
 *
 * Extracted from tests/setup.db.js so the gate has an IN-PROCESS test seam: nested vitest does
 * not run under CI (see tests/unit/setup/credential-fence-ordering.spawn.test.js), so every
 * CI-load-bearing assertion about this gate imports and executes THIS module directly. The spawn
 * arms exercise the same code through a real child vitest, locally only.
 *
 * Two layers, two threats:
 *  - fetch refusal (SAFETY): suite beforeAll/afterAll hooks execute under every viable skip
 *    mechanism on vitest 4 (measured), and env-forcing alone has a measured live bypass —
 *    dotenv.config({ override: true }) at module scope restores the real URL over any forced
 *    sentinel. The network boundary is the one chokepoint every code path shares.
 *  - runtime skip (REPORTING): tests read as skipped rather than failing on refused connections.
 *    A hook that itself demands the DB still fails, LOUDLY, with DB_TIER_BLOCKED naming the URL —
 *    that is correct: an undesignated environment cannot run it, and green-over-broken would be
 *    the silent-vanish defect one layer down.
 *
 * The designation predicate is IMPORTED from its single definition site (db-target.js) — never
 * re-derived. Widening designation happens there or nowhere.
 */
import { assessDbTarget } from './db-target.js';

/** 127.0.0.1:1 settles in ~7s (connection refused) vs ~50s DNS retry backoff for a .invalid
 *  hostname — supabase-js retries 4x regardless of failure kind. */
export const SENTINEL_URL = 'http://127.0.0.1:1';

/** Per-process stderr dedupe. Module state, not env: forked workers don't share writes and one
 *  line per worker process is the honest cadence. */
let warned = false;

/** Test-only: reset the per-process warn dedupe so once-per-process is assertable. */
export function __resetWarnDedupeForTest() {
  warned = false;
}

/**
 * Assess the target and, when undesignated, install the two-layer gate.
 * Dependency-injected so the in-process tests exercise the REAL wiring.
 *
 * @param {object} [opts]
 * @param {object} [opts.env] process.env stand-in
 * @param {object} [opts.globalObj] globalThis stand-in (fetch is installed here)
 * @param {(s: string) => void} [opts.stderrWrite] loudness channel — NEVER console.warn, which is
 *        measured-invisible from a setup file under the default reporter
 * @param {() => void} [opts.registerSkip] called exactly once when the tier must skip — the
 *        setup file passes () => beforeEach((ctx) => ctx.skip())
 * @param {object} [opts.target] pre-computed assessDbTarget result (tests inject; setup omits)
 * @returns {{ installed: boolean, target: object, refusedRequests: Array<{url: string, refused_at: string}> }}
 */
export function installDbTierGate({
  env = process.env,
  globalObj = globalThis,
  stderrWrite = (s) => process.stderr.write(s),
  registerSkip,
  target,
} = {}) {
  const t = target || assessDbTarget(env);
  const refusedRequests = [];

  if (t.allowed) {
    // Designated: synthetic fallbacks ONLY where nothing real was loaded, so module-load
    // client factories don't throw during collection in credential-less environments.
    env.SUPABASE_URL ||= SENTINEL_URL;
    env.NEXT_PUBLIC_SUPABASE_URL ||= env.SUPABASE_URL;
    env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key-not-real';
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key-not-real';
    return { installed: false, target: t, refusedRequests };
  }

  // Sentinels FORCED (assignment, not ||=): a real URL already loaded from .env must not
  // survive into an undesignated run. Bypassable alone (dotenv override:true) — the fetch
  // guard below is the layer that is not.
  env.SUPABASE_URL = SENTINEL_URL;
  env.NEXT_PUBLIC_SUPABASE_URL = SENTINEL_URL;
  env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key-not-real';
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key-not-real';

  globalObj.fetch = function dbTierBlockedFetch(input) {
    const url = typeof input === 'string' ? input : (input && input.url) || String(input);
    refusedRequests.push({ url, refused_at: new Date().toISOString() });
    // The message is the only channel that survives stringifying catch blocks, so the URL and
    // the remedy ride in it.
    throw new Error(
      `DB_TIER_BLOCKED: refused ${url} — no designated non-production target (${t.reason}). ` +
      'The db tier is runtime-gated; set VITEST_DB_ALLOW_REF=<ref> naming the ref your ' +
      'SUPABASE_URL actually points at. Never name production.'
    );
  };

  if (!warned) {
    warned = true;
    stderrWrite(
      '[vitest][db-tier] SKIPPED at runtime — no designated non-production target ' +
      `(reason: ${t.reason}${t.ref ? `, target ref: ${t.ref}` : ''}). ` +
      'Suites resolve and their hooks may run, but ALL network is refused (DB_TIER_BLOCKED) ' +
      'and every test reports skipped. Set VITEST_DB_ALLOW_REF=<project-ref> to authorize a ' +
      'designated non-production ref. Never name production.\n'
    );
  }

  if (registerSkip) registerSkip();

  return { installed: true, target: t, refusedRequests };
}
