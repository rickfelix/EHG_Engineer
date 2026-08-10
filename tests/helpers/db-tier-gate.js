/**
 * DB-tier runtime gate — SD-LEO-INFRA-VITEST-TIER-REAL-001 FR-1/FR-2.
 *
 * Extracted from tests/setup.db.js so the gate has an IN-PROCESS test seam: nested vitest does
 * not run under CI (see tests/unit/setup/credential-fence-ordering.spawn.test.js), so every
 * CI-load-bearing assertion about this gate imports and executes THIS module directly. The spawn
 * arms exercise the same code through a real child vitest, locally only.
 *
 * Three defenses, because the db tier reaches a database TWO ways:
 *  - fetch refusal (SAFETY, supabase-js/PostgREST path): suite beforeAll/afterAll hooks execute
 *    under every viable skip mechanism on vitest 4 (measured), and env-forcing alone has a
 *    measured live bypass — dotenv.config({ override: true }) at module scope restores the real
 *    URL over any forced sentinel. supabase-js resolves fetch late-bound through globalThis, so
 *    refusing globalThis.fetch covers every HTTP client regardless of construction order.
 *  - direct-Postgres credential DELETION (SAFETY, `pg`/pooler path): ~10 db-tier suites connect
 *    with a raw pg client over SUPABASE_POOLER_URL / DATABASE_URL, which NEVER touches
 *    globalThis.fetch. Sentinelling them would keep their `describe.skipIf(!POOLER_URL)` suites
 *    "enabled" and red; DELETING them makes those guards statically skip so beforeAll never
 *    fires, and closes the child-process path (children inherit the parent env). This is the
 *    axis the discovery gate covered for free and the ungate re-exposed (SEC-01).
 *  - runtime skip (REPORTING): tests read as skipped rather than failing on refused connections.
 *    A hook that itself demands the DB still fails LOUDLY (DB_TIER_BLOCKED) — an undesignated
 *    environment cannot run it, and green-over-broken would be the silent-vanish defect one down.
 *
 * The designation predicate is IMPORTED from its single definition site (db-target.js) — never
 * re-derived. Widening designation happens there or nowhere.
 */
import net from 'node:net';
import tls from 'node:tls';
import { assessDbTarget } from './db-target.js';

/** Direct-Postgres credentials the `pg`/pooler path reads. POISONED-PRESENT (not deleted) when
 *  undesignated: a deleted key is re-injected by any later dotenv.config() (dotenv only skips keys
 *  already present — measured: 47 db-tier files re-load .env at module scope and restored the
 *  production pooler), so deletion INVITES the restore while a present-but-unreachable value is
 *  immune. Value points at loopback:1 so nothing routable is even named. The socket guard below is
 *  the layer that does not depend on the string at all. */
const DIRECT_PG_ENV = Object.freeze([
  'SUPABASE_POOLER_URL', 'DATABASE_URL', 'SUPABASE_DB_PASSWORD', 'EHG_DB_PASSWORD',
]);
// No embedded credentials — a loopback host alone; the socket guard is the real barrier and a
// userinfo-bearing URL would trip the repo's secret scanner for no added safety.
const PG_POISON_URL = 'postgresql://127.0.0.1:1/db_tier_blocked';

/** 127.0.0.1:1 settles in ~7s (connection refused) vs ~50s DNS retry backoff for a .invalid
 *  hostname — supabase-js retries 4x regardless of failure kind. */
export const SENTINEL_URL = 'http://127.0.0.1:1';

/** Loopback hosts a refused-network run may still reach (the poison URL points here; a Unix-socket
 *  connect has no host and is never network). Everything else is a routable target and refused.
 *  Exported so the classifier is CI-testable without patching process-global net/tls. */
export function isLoopbackHost(host) {
  if (host == null || host === '') return true;
  const h = String(host).toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0' || h.startsWith('127.');
}

/** Extract the target host from the many net/tls connect() call shapes. Exported for the same
 *  reason as isLoopbackHost. */
export function connectHostOf(args) {
  const a = args[0];
  if (a && typeof a === 'object') return a.host ?? a.hostname ?? null; // options form (incl. Unix socket path → host undefined)
  if (typeof a === 'number') return typeof args[1] === 'string' ? args[1] : '127.0.0.1'; // (port[, host])
  return null; // (path) — Unix socket, not network
}

/** The socket-guard decision, pure: refuse a connect() whose target is a routable (non-loopback)
 *  host. This is what makes the pg/pooler path safe regardless of how its connection string was
 *  obtained — and it is unit-assertable without touching real sockets. */
export function shouldRefuseConnect(args) {
  return !isLoopbackHost(connectHostOf(args));
}

let socketGuardInstalled = false;

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

  // Direct-Postgres credentials POISONED-PRESENT (see DIRECT_PG_ENV): present so dotenv cannot
  // restore the production value, unreachable so nothing routable is named.
  for (const k of DIRECT_PG_ENV) env[k] = k.endsWith('PASSWORD') ? 'db-tier-blocked' : PG_POISON_URL;

  const blocked = (subject) => {
    refusedRequests.push({ url: subject, refused_at: new Date().toISOString() });
    // The message is the only channel that survives stringifying catch blocks, so the subject and
    // the remedy ride in it.
    return new Error(
      `DB_TIER_BLOCKED: refused ${subject} — no designated non-production target (${t.reason}). ` +
      'The db tier is runtime-gated; set VITEST_DB_ALLOW_REF=<ref> naming the ref your ' +
      'SUPABASE_URL actually points at. Never name production.'
    );
  };

  // Layer 1 — supabase-js / PostgREST path: refuse globalThis.fetch. Non-reconfigurable so a
  // db-tier module cannot reassign it back to a live fetch (globalThis.fetch = (await
  // import('undici')).fetch defeated a writable guard — SEC-02).
  const fetchGuard = function dbTierBlockedFetch(input) {
    const url = typeof input === 'string' ? input : (input && input.url) || String(input);
    throw blocked(url);
  };
  Object.defineProperty(globalObj, 'fetch', { value: fetchGuard, writable: false, configurable: false });

  // Layer 2 — the `pg`/pooler path: refuse any raw socket to a ROUTABLE host. This is indifferent
  // to how the connection string was obtained (env, hardcoded config, dotenv re-injection) — the
  // same reason the fetch guard survived every bypass that env-neutralisation did not (SEC-01).
  // Loopback is allowed so the poison URL (127.0.0.1:1) fails fast as connection-refused rather
  // than reaching anything.
  //
  // ONLY patches process-global net/tls when installing on the REAL globalThis (the setup-file
  // path). The injected-globalObj unit harness must NOT patch — net/tls are module globals, so a
  // patch there would leak across the whole unit worker and refuse unrelated suites' sockets. The
  // classifier (shouldRefuseConnect) is unit-tested directly; the real patch is proven by the
  // spawn arm end-to-end.
  if (globalObj === globalThis && !socketGuardInstalled) {
    socketGuardInstalled = true;
    const socketConnect = net.Socket.prototype.connect;
    const netConnect = net.connect;
    const tlsConnect = tls.connect;
    const wrap = (orig, self) => function (...args) {
      if (shouldRefuseConnect(args)) throw blocked(`tcp://${connectHostOf(args)}`);
      return orig.apply(self ?? this, args);
    };
    net.Socket.prototype.connect = wrap(socketConnect);
    net.connect = wrap(netConnect, net);
    tls.connect = wrap(tlsConnect, tls);
  }

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
