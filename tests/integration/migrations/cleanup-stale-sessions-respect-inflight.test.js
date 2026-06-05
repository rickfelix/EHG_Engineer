// SD-LEO-INFRA-ATOMIC-FLEET-WORK-001 FR-7
// Regression test for the "swept-twice" defect: an actively-running session
// (mid-long-Task / sub-agent, no heartbeat firing) must NOT be released by
// cleanup_stale_sessions merely because its heartbeat aged past the stale
// threshold, PROVIDED it published a future expected_silence_until AND the
// config flag sweep_respect_inflight_agent is ON.
//
// Genesis: SD-FDBK-INFRA-CLAIM-SWEEP-LIVENESS-001 committed migration
//   database/migrations/20260604_cleanup_stale_sessions_respect_inflight_agent.sql
// (FR-2) but it was NEVER APPLIED to prod (schema_migrations_applied has 0 rows
// for it; live cleanup_stale_sessions is telemetry-blind). This test pins the
// migration's intended behavior so that once applied it stays correct, and so
// the defense-in-depth contract (flag OFF == byte-identical legacy behavior) is
// machine-checked.
//
// EXECUTION MODEL — why direct pg + BEGIN..ROLLBACK (NOT supabase-js):
//  * cleanup_stale_sessions is a CREATE OR REPLACE FUNCTION over SHARED
//    claude_sessions state. The existing integration suite
//    (layer1-claiming-session-roundtrip.test.js) had to SKIP its real-call
//    cleanup_stale_sessions case precisely because fixtures cannot isolate from
//    other in-flight sessions. We solve that by running the WHOLE scenario
//    inside ONE transaction: apply the migration's CREATE OR REPLACE, seed our
//    rows, flip the flag, call the function, assert, then ROLLBACK. Nothing
//    touches committed prod state — no live prod change, byte-for-byte safe.
//  * We assert ONLY on the final status of OUR uniquely-prefixed seeded rows,
//    never on the function's aggregate return counts (those legitimately
//    include other sessions visible in the txn snapshot).
//  * supabase-js (REST/PostgREST) cannot run transactional DDL, so a direct
//    `pg` Client on SUPABASE_POOLER_URL / DATABASE_URL is required. Mirrors
//    scripts/apply-migration.js and scripts/check-migration-readiness.mjs.
//
// SKIP CONTRACT: when no pooler/DB connection string is configured (CI without
// DB secrets, local dev without creds) the suite SKIPS cleanly — it never reds.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// repo root is 3 levels up from tests/integration/migrations/
const REPO_ROOT = path.resolve(__dirname, '../../../');
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'database/migrations/20260604_cleanup_stale_sessions_respect_inflight_agent.sql'
);

// Direct-pg connection string (transactional DDL needs a real pg socket, not
// PostgREST). Strip any sslmode= param the way supabase-connection.js does so
// node-postgres' own ssl config wins.
function resolveConnString() {
  const raw = process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL || '';
  if (!raw) return null;
  return raw.replace(/[?&]sslmode=[^&]*/i, '');
}

const CONN_STRING = resolveConnString();
const HAS_DB = Boolean(CONN_STRING);

// Pooler presents a self-signed Supabase Root 2021 CA; node won't have it in
// the trust store locally. Mirror apply-migration.js / supabase-connection.js:
// connect with relaxed verification for this READ-ONLY-then-ROLLBACK probe.
// (The pre-merge CI gate trusts the committed CA bundle instead; here we keep
// the test self-contained and never commit any data.)
function makeSslConfig() {
  return { rejectUnauthorized: false };
}

describe.skipIf(!HAS_DB)(
  'SD-ATOMIC-FLEET-WORK-001 FR-7: cleanup_stale_sessions respects in-flight agent (BEGIN..ROLLBACK)',
  () => {
    /** @type {import('pg').Client} */
    let client;
    let migrationSql;
    let inTxn = false;

    // Unique prefix so our seeded rows are unambiguously identifiable and can
    // never collide with another concurrent test/session.
    const RUN = `TEST-FR7-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const SID_PARITY = `${RUN}-parity`; // case (a): flag OFF, old hb, NULL esu
    const SID_EXEMPT = `${RUN}-exempt`; // case (b): flag ON, old hb (<hardcap), future esu
    const SID_HARDCAP = `${RUN}-hardcap`; // case (c): flag ON, hb beyond hardcap, future esu

    beforeAll(async () => {
      if (existsSync(MIGRATION_PATH)) {
        migrationSql = readFileSync(MIGRATION_PATH, 'utf8');
      }
      client = new Client({ connectionString: CONN_STRING, ssl: makeSslConfig() });
      await client.connect();
    });

    afterAll(async () => {
      // Defensive: if a test threw mid-transaction, make sure we rolled back so
      // no fixture leaks into committed prod state.
      if (client) {
        if (inTxn) {
          try { await client.query('ROLLBACK'); } catch { /* already rolled back */ }
        }
        await client.end().catch(() => {});
      }
    });

    it('migration file is present and declares the flag-gated exemption', () => {
      expect(migrationSql, `migration not found at ${MIGRATION_PATH}`).toBeTruthy();
      expect(migrationSql).toContain('sweep_respect_inflight_agent');
      expect(migrationSql).toContain('expected_silence_until');
      expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.cleanup_stale_sessions/i);
    });

    it('flag OFF = parity (old heartbeat + NULL esu marked stale); flag ON exempts in-flight but honors hard cap', async () => {
      expect(migrationSql).toBeTruthy();

      await client.query('BEGIN');
      inTxn = true;

      // 1) Apply the migration's CREATE OR REPLACE (and its flag-seed UPDATE)
      //    INSIDE this transaction. Rolled back at the end → zero prod impact.
      await client.query(migrationSql);

      // 2) Read the live claim TTL so we compute the hard-cap exactly as the
      //    function does: hardcap = 30 + claim_ttl_minutes.
      const ttlRes = await client.query(
        `SELECT COALESCE((metadata->>'claim_ttl_minutes')::int, 15) AS ttl
           FROM chairman_dashboard_config WHERE config_key = 'default' LIMIT 1`
      );
      const ttlMinutes = ttlRes.rows[0]?.ttl ?? 15;
      const hardcapMinutes = 30 + ttlMinutes;

      // Timestamps (relative to NOW so they survive clock differences):
      //   - oldHeartbeat: well past the 120s stale threshold but INSIDE hardcap.
      //   - beyondHardcap: older than the hardcap ceiling.
      //   - futureEsu: an expected_silence_until comfortably in the future.
      const oldHeartbeatSql = `NOW() - INTERVAL '300 seconds'`;       // 5 min ago (< hardcap)
      const beyondHardcapSql = `NOW() - INTERVAL '${hardcapMinutes + 10} minutes'`; // past ceiling
      const futureEsuSql = `NOW() + INTERVAL '20 minutes'`;            // still silent

      // Common NOT-NULL-friendly columns. status defaults to 'active'; track is
      // CHECK-constrained (A/B/C/STANDALONE); worktree columns left NULL to
      // satisfy ck_claude_sessions_worktree_state_consistency without an sd_key.
      const seed = async (sessionId, heartbeatSql, esuSql) => {
        await client.query(
          `INSERT INTO claude_sessions
             (session_id, machine_id, terminal_id, pid, hostname, codebase,
              status, track, heartbeat_at, expected_silence_until)
           VALUES ($1, 'test-machine', $2, 99000, 'test-host', 'EHG_Engineer',
              'active', 'STANDALONE', ${heartbeatSql}, ${esuSql})`,
          [sessionId, `${sessionId}-term`]
        );
      };

      // ---- Phase A: flag OFF (parity). Seed only the parity row. ----
      await client.query(
        `UPDATE chairman_dashboard_config
            SET metadata = COALESCE(metadata,'{}'::jsonb)
                           || jsonb_build_object('sweep_respect_inflight_agent', false)
          WHERE config_key = 'default'`
      );
      await seed(SID_PARITY, oldHeartbeatSql, 'NULL');

      // Call the (in-txn) function. We ignore its aggregate counts and assert
      // only on OUR row. Threshold 120s, batch big enough to include our row.
      await client.query(`SELECT cleanup_stale_sessions(120, 1000)`);

      const parityRow = await client.query(
        `SELECT status FROM claude_sessions WHERE session_id = $1`,
        [SID_PARITY]
      );
      // Flag OFF + old heartbeat + NULL esu → behaves exactly like legacy:
      // marked stale (the 30s→released step needs stale_at to age 30s, which it
      // won't within the same call, so 'stale' is the correct terminal state
      // here, proving the mark-stale step still fires under the flag-OFF path).
      expect(
        parityRow.rows[0]?.status,
        'flag OFF: stale heartbeat with NULL esu must be marked stale (parity)'
      ).toBe('stale');

      // ---- Phase B: flag ON. Seed exempt + hardcap rows fresh. ----
      await client.query(
        `UPDATE chairman_dashboard_config
            SET metadata = COALESCE(metadata,'{}'::jsonb)
                           || jsonb_build_object('sweep_respect_inflight_agent', true)
          WHERE config_key = 'default'`
      );

      // (b) in-flight, heartbeat old but within hardcap, future esu → EXEMPT.
      await seed(SID_EXEMPT, oldHeartbeatSql, futureEsuSql);
      // (c) heartbeat beyond hardcap, future esu → exemption does NOT apply.
      await seed(SID_HARDCAP, beyondHardcapSql, futureEsuSql);

      await client.query(`SELECT cleanup_stale_sessions(120, 1000)`);

      const exemptRow = await client.query(
        `SELECT status FROM claude_sessions WHERE session_id = $1`,
        [SID_EXEMPT]
      );
      const hardcapRow = await client.query(
        `SELECT status FROM claude_sessions WHERE session_id = $1`,
        [SID_HARDCAP]
      );

      // (b) The in-flight session must remain 'active' — NOT swept.
      expect(
        exemptRow.rows[0]?.status,
        'flag ON: in-flight session (future esu, within hardcap) must NOT be marked stale'
      ).toBe('active');

      // (c) The over-hardcap session must be marked stale despite future esu —
      // proving a dead claim can never be wedged open forever.
      expect(
        hardcapRow.rows[0]?.status,
        'flag ON: heartbeat beyond hard cap must be marked stale even with future esu'
      ).toBe('stale');

      await client.query('ROLLBACK');
      inTxn = false;

      // Post-rollback sanity: none of our fixtures persisted to committed state.
      const leaked = await client.query(
        `SELECT COUNT(*)::int AS n FROM claude_sessions WHERE session_id LIKE $1`,
        [`${RUN}-%`]
      );
      expect(leaked.rows[0].n, 'BEGIN..ROLLBACK must leave no committed fixtures').toBe(0);
    });
  }
);
