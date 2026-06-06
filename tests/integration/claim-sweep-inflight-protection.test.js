/**
 * Integration test for SD-LEO-INFRA-ENABLE-CLAIM-SWEEP-001 (ENABLEMENT of FR-2 from
 * SD-FDBK-INFRA-CLAIM-SWEEP-LIVENESS-001): the live cleanup_stale_sessions() function
 * must honor claude_sessions.expected_silence_until when the config flag
 * chairman_dashboard_config.metadata.sweep_respect_inflight_agent = true, while
 * preserving a (30 + claim_ttl)-minute HARD CAP and FAILING OPEN on NULL telemetry.
 *
 * Why this test runs against the LIVE function (not a stub):
 *   cleanup_stale_sessions() is a SECURITY-sensitive plpgsql function whose exemption
 *   predicate, hard-cap arithmetic, and release-payload integrity (clearing sd_key +
 *   worktree_path + worktree_branch TOGETHER so ck_claude_sessions_worktree_state_consistency
 *   can never be violated) cannot be reached by a JS mock. The defect this whole SD chain
 *   guards against — a sweep releasing a session mid-sub-agent-run — is purely a DB-side
 *   behavior, so the regression must be asserted against the real function body.
 *
 * Isolation contract (ZERO PROD LEAK):
 *   Every scenario runs inside a single pg-client BEGIN ... ROLLBACK transaction. All
 *   throwaway claude_sessions rows are seeded with a unique per-run RUN_ID prefix and the
 *   transaction is ALWAYS rolled back, so no row — and no chairman_dashboard_config flag
 *   mutation (TS-4 flips the flag inside the txn) — ever commits. A final zero-survivors
 *   assertion (afterAll) fails the suite loudly if any future regression commits instead
 *   of rolling back. We NEVER touch a real session, never touch any SD-TEST-* fixture, and
 *   never leave chairman_dashboard_config mutated.
 *
 * cleanup_stale_sessions() is a TWO-STEP function in one call:
 *   Step 1 — marks active/idle sessions 'stale' when heartbeat_at is older than the stale
 *            threshold, UNLESS the in-flight exemption applies (flag ON + future ESU +
 *            heartbeat within the hard cap).
 *   Step 2 — releases rows already in status='stale' whose stale_at is older than 30s,
 *            clearing the claim payload.
 * A freshly-marked-stale row therefore does NOT release in the same call (its stale_at is
 * "now"). To deterministically drive the FULL lifecycle to 'released' for the scenarios
 * that assert a release (TS-2/TS-3/TS-4) without a 30s real-time wait, we run cleanup once
 * (Step 1 marks stale), backdate stale_at by 90s INSIDE the rolled-back txn, then run
 * cleanup again (Step 2 releases). This exercises both the exemption decision (Step 1) and
 * the release-payload integrity (Step 2) for real. TS-1 (protected) asserts after a single
 * pass that the session was never even marked stale.
 *
 * Pattern mirrors tests/integration/retro-trigger-draft-insert.test.js (BEGIN/ROLLBACK +
 * per-run marker + zero-survivors guard). LIVE-gated: skips (does not fail) when no pg
 * connection URL is configured, so hermetic CI without DB creds stays green.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const HAS_DB = !!(process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL);

// Unique per-run marker. The zero-survivors assertion keys on this exact prefix, so it is
// robust against concurrent sessions running this same test. SD-SWEEPTEST- is distinct from
// any SD-TEST-* fixture namespace.
const RUN_ID = `SD-SWEEPTEST-${Date.now()}-${process.pid}`;
const sid = (suffix) => `${RUN_ID}-${suffix}`;

describe.skipIf(!HAS_DB)('cleanup_stale_sessions in-flight protection (LIVE, rolled back) — SD-LEO-INFRA-ENABLE-CLAIM-SWEEP-001', () => {
  let client;

  beforeAll(async () => {
    const { createDatabaseClient } = await import('../../lib/supabase-connection.js');
    client = await createDatabaseClient('engineer', { verify: false });
  });

  afterAll(async () => {
    if (!client) return;
    // Defensive: ensure no open txn leaked a row. Run OUTSIDE any txn.
    let n = -1;
    try {
      const r = await client.query(
        `SELECT count(*)::int AS n FROM claude_sessions WHERE session_id LIKE $1`,
        [`${RUN_ID}-%`]
      );
      n = r.rows[0].n;
    } finally {
      await client.end();
    }
    // Zero-survivors guard: nothing this run seeded may have committed.
    expect(n).toBe(0);
  });

  // ---- helpers (all operate inside the caller's open transaction) ----

  // Seed a throwaway claimed session. heartbeatMinAgo backdates both claimed_at and
  // heartbeat_at; esuMinFromNow sets expected_silence_until in the future (null => NULL).
  // The row always carries a worktree (sd_key + worktree_path + worktree_branch) so the
  // release-payload integrity assertion is meaningful.
  async function seedActive({ suffix, heartbeatMinAgo, esuMinFromNow }) {
    const session_id = sid(suffix);
    await client.query(
      `INSERT INTO claude_sessions
         (session_id, status, sd_key, track, worktree_path, worktree_branch,
          claimed_at, heartbeat_at, expected_silence_until)
       VALUES ($1, 'active', $2, 'STANDALONE', $3, $4,
          now() - ($5 || ' minutes')::interval,
          now() - ($5 || ' minutes')::interval,
          CASE WHEN $6::numeric IS NULL THEN NULL ELSE now() + ($6 || ' minutes')::interval END)`,
      [
        session_id,
        `${RUN_ID}-CLAIM-${suffix}`,
        `/tmp/sweeptest/wt/${session_id}`,
        `sweeptest/${session_id}`,
        String(heartbeatMinAgo),
        esuMinFromNow == null ? null : String(esuMinFromNow),
      ]
    );
    return session_id;
  }

  async function getRow(session_id) {
    const r = await client.query(
      `SELECT status, sd_key, worktree_path, worktree_branch, track, claimed_at
       FROM claude_sessions WHERE session_id = $1`,
      [session_id]
    );
    return r.rows[0];
  }

  async function runCleanup() {
    // Default 120s stale threshold mirrors the production call site.
    const r = await client.query(`SELECT cleanup_stale_sessions(120, 100) AS result`);
    return r.rows[0].result;
  }

  // Backdate a just-marked-stale row's stale_at past the 30s release gate so the next
  // cleanup pass releases it — deterministic, no real-time wait. Scoped to status='stale'.
  async function ageStale(session_id) {
    await client.query(
      `UPDATE claude_sessions SET stale_at = now() - interval '90 seconds'
       WHERE session_id = $1 AND status = 'stale'`,
      [session_id]
    );
  }

  async function setFlag(value) {
    await client.query(
      `UPDATE chairman_dashboard_config
         SET metadata = jsonb_set(metadata, '{sweep_respect_inflight_agent}', $1::jsonb, true)
       WHERE config_key = 'default'`,
      [JSON.stringify(value)]
    );
  }

  // Run a scenario inside its own BEGIN..ROLLBACK so flag mutations and seeded rows are
  // fully discarded between tests (and the live flag state is never disturbed).
  async function inTxn(fn) {
    await client.query('BEGIN');
    try {
      return await fn();
    } finally {
      await client.query('ROLLBACK');
    }
  }

  it('TS-1: in-flight protected — flag ON + future expected_silence_until + recent-enough heartbeat → claim NOT swept', async () => {
    const out = await inTxn(async () => {
      await setFlag(true);
      // heartbeat 5min old: older than the 120s stale threshold (so absent the exemption it
      // WOULD be marked stale) but well within the 45-min hard cap.
      const s = await seedActive({ suffix: 'TS1', heartbeatMinAgo: 5, esuMinFromNow: 10 });
      const cleanup = await runCleanup();
      const row = await getRow(s);
      return { cleanup, row, sessionId: s };
    });
    expect(out.cleanup.respect_inflight_agent).toBe(true);
    expect(out.cleanup.hardcap_minutes).toBe(45);
    // Still holds its claim, untouched — never even marked stale. sd_key/worktree unchanged.
    expect(out.row.status).toBe('active');
    expect(out.row.sd_key).toBe(`${RUN_ID}-CLAIM-TS1`);
    expect(out.row.worktree_path).toBe(`/tmp/sweeptest/wt/${out.sessionId}`);
    expect(out.row.worktree_branch).toBe(`sweeptest/${out.sessionId}`);
  });

  it('TS-2: hard-cap preserved — same in-flight session aged past the 45-min hard cap → IS released; sd_key + worktree cleared together', async () => {
    const out = await inTxn(async () => {
      await setFlag(true);
      // heartbeat 50min old: PAST the (30 + 15) = 45-min hard cap, even though ESU is still
      // in the future. The exemption must be denied → Step 1 marks it stale.
      const s = await seedActive({ suffix: 'TS2', heartbeatMinAgo: 50, esuMinFromNow: 10 });

      const pass1 = await runCleanup();
      const afterPass1 = await getRow(s);

      await ageStale(s);
      const pass2 = await runCleanup();
      const afterPass2 = await getRow(s);

      return { pass1, afterPass1, pass2, afterPass2 };
    });
    // Exemption denied at the hard cap: marked stale despite flag ON + future ESU.
    expect(out.afterPass1.status).toBe('stale');
    // Then released, with the full claim payload cleared TOGETHER (constraint-safe).
    expect(out.afterPass2.status).toBe('released');
    expect(out.afterPass2.sd_key).toBeNull();
    expect(out.afterPass2.worktree_path).toBeNull();
    expect(out.afterPass2.worktree_branch).toBeNull();
    expect(out.afterPass2.track).toBeNull();
    expect(out.afterPass2.claimed_at).toBeNull();
  });

  it('TS-3: fail-open — stale session with NULL expected_silence_until → released normally', async () => {
    const out = await inTxn(async () => {
      await setFlag(true); // flag ON, but NULL ESU must never block the sweep
      // heartbeat 20min old, NO expected_silence_until. Within the cap, flag ON — but the
      // exemption requires a non-NULL future ESU, so fail-open: it is swept normally.
      const s = await seedActive({ suffix: 'TS3', heartbeatMinAgo: 20, esuMinFromNow: null });

      const pass1 = await runCleanup();
      const afterPass1 = await getRow(s);

      await ageStale(s);
      const pass2 = await runCleanup();
      const afterPass2 = await getRow(s);

      return { pass1, afterPass1, pass2, afterPass2 };
    });
    // NULL ESU → no exemption → marked stale in pass1 ...
    expect(out.afterPass1.status).toBe('stale');
    // ... and released (payload cleared together) in pass2.
    expect(out.afterPass2.status).toBe('released');
    expect(out.afterPass2.sd_key).toBeNull();
    expect(out.afterPass2.worktree_path).toBeNull();
    expect(out.afterPass2.worktree_branch).toBeNull();
  });

  it('TS-4: flag gates it — sweep_respect_inflight_agent = false → an in-flight session (future ESU, within cap) IS released', async () => {
    const out = await inTxn(async () => {
      await setFlag(false); // exemption gated OFF
      // Identical in-flight shape to TS-1 (heartbeat 5min, future ESU, within cap) — the ONLY
      // difference is the flag. With the flag OFF the exemption must not apply.
      const s = await seedActive({ suffix: 'TS4', heartbeatMinAgo: 5, esuMinFromNow: 10 });

      const pass1 = await runCleanup();
      const afterPass1 = await getRow(s);

      await ageStale(s);
      const pass2 = await runCleanup();
      const afterPass2 = await getRow(s);

      return { pass1, afterPass1, pass2, afterPass2 };
    });
    // Flag OFF → exemption not applied → in-flight session marked stale ...
    expect(out.pass1.respect_inflight_agent).toBe(false);
    expect(out.afterPass1.status).toBe('stale');
    // ... then released, payload cleared together.
    expect(out.afterPass2.status).toBe('released');
    expect(out.afterPass2.sd_key).toBeNull();
    expect(out.afterPass2.worktree_path).toBeNull();
    expect(out.afterPass2.worktree_branch).toBeNull();
  });
});
