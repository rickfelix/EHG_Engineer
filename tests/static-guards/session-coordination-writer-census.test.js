/**
 * tests/static-guards/session-coordination-writer-census.test.js
 *
 * SD-LEO-INFRA-LANE-HYGIENE-MACHINE-WRITERS-001 (FR-7a).
 *
 * A table-driven static guard pinning the six session_coordination writer call sites this SD
 * fixed, so a future edit that drops a payload.kind or sender_session stamp fails CI naming the
 * specific writer — recommended over per-file runtime mocks by PLAN-phase testing-agent review
 * (3e0331d8-68ac-4027-a43f-8c795de07d1c): most of these sites are inline inserts in large
 * CLI-main files where a runtime harness would cost far more than the 1-2 assertions it buys, and
 * a manifest-count approach also catches a newly ADDED unstamped occurrence, not only a
 * regression on the fixed one.
 *
 * This is a SOURCE-TEXT presence guard (grep-shaped, not an AST parse) — deliberately simple and
 * therefore cheap to keep correct. It checks two things per manifest entry:
 *   1. the expected kind/sender literal(s) are present in the file (the fix landed and stayed);
 *   2. the file's raw `.from('session_coordination').insert(` occurrence count for the writer's
 *      function/region matches the pinned `expectedInsertOccurrences` (a genuinely NEW insert in
 *      that region — stamped or not — changes the count and must be reviewed, not silently pass).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');

function readSource(relPath) {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
}

function countInsertOccurrences(source) {
  const matches = source.match(/\.from\(\s*'session_coordination'\s*\)\s*\n?\s*\.insert\(/g);
  return matches ? matches.length : 0;
}

/** One row per fixed writer: file, the literal(s) that must be present, and the pinned
 *  total .insert( occurrence count for that FILE (not just the fixed site — a whole-file
 *  count is a coarser but zero-maintenance tripwire for "a new raw insert appeared"). */
const MANIFEST = [
  {
    file: 'scripts/assign-fleet-identities.cjs',
    mustContain: [
      "payload: { kind: 'SET_IDENTITY'", // rebroadcast site
      "sender_session: _mySessionId || 'assign-fleet-identities'", // both insert sites — EXEC-phase TESTING (T-8) found the bare `|| null` fallback left sender_session null on a cron invocation with no CLAUDE_SESSION_ID and no .claude/session-id.json
      "kind: 'SET_IDENTITY', color, callsign", // buildIdentityMessage (non-rename branch)
    ],
    expectedInsertOccurrences: 2,
  },
  {
    file: 'scripts/worker-signal.cjs',
    mustContain: [
      "kind: 'worker_signal'",
    ],
    expectedInsertOccurrences: null, // uses insertCoordinationRow, not a raw insert — not counted by countInsertOccurrences
  },
  {
    file: 'scripts/stale-session-sweep.cjs',
    mustContain: [
      "sender_session: 'stale-session-sweep'",
    ],
    // Two SIGNAL_RESOLVED sites are the load-bearing ones for this SD; this file has many other
    // raw inserts pre-dating this SD, so occurrence-count pinning is scoped to the literal above
    // (present exactly twice) rather than a whole-file .insert( count.
    expectedLiteralCount: { literal: "sender_session: 'stale-session-sweep'", count: 2 },
  },
  {
    file: 'scripts/periodic-liveness-watcher.mjs',
    mustContain: [
      "sender_session: 'periodic-liveness-watcher'",
    ],
    expectedLiteralCount: { literal: "sender_session: 'periodic-liveness-watcher'", count: 2 },
  },
  {
    file: 'lib/npm-install-lock.cjs',
    mustContain: [
      "kind: 'node_modules_lock'",
    ],
    expectedInsertOccurrences: 1,
  },
  {
    file: 'scripts/fleet-dashboard.cjs',
    mustContain: [
      "kind: 'stale_heartbeat_warning'",
      "sender_session: 'fleet-dashboard'",
      // SD-LEO-INFRA-LANE-HYGIENE-OVER-001: writeSignalReceipts (51% of all live gauge
      // violations, bodyless_row -- sender_session was already correct, body was missing).
      'body: `Signal receipted: ${disposition}`',
    ],
    expectedInsertOccurrences: null, // this file has many unrelated raw inserts; not whole-file-pinned
  },
  {
    // SD-LEO-INFRA-LANE-HYGIENE-OVER-001: two solomon_consult/account_switch_notice inserts,
    // both missing sender_session (empty_sender_row).
    file: 'scripts/adam-quiet-tick.mjs',
    mustContain: [
      "sender_session: 'adam-quiet-tick'",
    ],
    expectedLiteralCount: { literal: "sender_session: 'adam-quiet-tick'", count: 2 },
  },
  {
    // SD-LEO-INFRA-LANE-HYGIENE-OVER-001: sibling-divergence bug -- this function's twin in
    // scripts/periodic-liveness-watcher.mjs already had the FR-5 fix; this one didn't.
    file: 'lib/periodic-liveness/ladder-escalation.mjs',
    mustContain: [
      "sender_session: 'periodic-liveness-watcher'",
      'body: `${row.display_name || row.process_key} still OVERDUE (2nd consecutive miss).`',
    ],
    expectedInsertOccurrences: 1,
  },
  {
    file: 'scripts/execute-stop.mjs',
    mustContain: [
      "sender_session: 'execute-stop'",
      'payload: { kind: messageType.toLowerCase(), ...payload }',
    ],
    expectedInsertOccurrences: 1,
  },
  {
    // SD-LEO-INFRA-LANE-HYGIENE-OVER-001: two sites (sendCoaching, sendDeconflictionReply),
    // both sender_type='coaching' (not gauge-exempt) with no sender_session or payload.kind.
    file: 'scripts/fleet-coaching.cjs',
    mustContain: [
      "sender_session: 'fleet-coaching'",
      "kind: 'coaching'",
    ],
    expectedLiteralCount: { literal: "sender_session: 'fleet-coaching'", count: 2 },
  },
  {
    file: 'scripts/canary/run-canary-probe.mjs',
    mustContain: [
      "sender_session: 'run-canary-probe'",
    ],
    expectedInsertOccurrences: 1,
  },
  {
    // SD-LEO-INFRA-LANE-HYGIENE-OVER-001: fixed in the pure row builder (buildPlanDriftAdvisoryRows)
    // so it propagates to both downstream insert call sites (coordinator + Adam legs).
    file: 'scripts/gauge-runner.mjs',
    mustContain: [
      "sender_session: 'gauge-runner'",
    ],
    expectedLiteralCount: { literal: "sender_session: 'gauge-runner'", count: 2 },
  },
  {
    // SD-LEO-INFRA-LANE-HYGIENE-OVER-001: sibling-divergence bug -- assign-fleet-identities.cjs's
    // own SET_IDENTITY rebroadcast already set payload.kind + sender_session; this checkin-time
    // SET_IDENTITY insert never did (largest single untyped_row source measured, 23 rows).
    file: 'scripts/worker-checkin.cjs',
    mustContain: [
      "sender_session: 'worker-checkin'",
      "payload: { kind: 'SET_IDENTITY', color, callsign, display_name, tier_rank: tierRankOf({ metadata: myMeta }) }",
    ],
    expectedInsertOccurrences: null, // this file has many unrelated raw inserts; not whole-file-pinned
  },
];

describe('FR-7(a) — session_coordination writer census (pinned manifest)', () => {
  for (const entry of MANIFEST) {
    describe(entry.file, () => {
      const source = readSource(entry.file);

      for (const literal of entry.mustContain) {
        it(`contains the fix literal: ${literal}`, () => {
          expect(source.includes(literal), `expected literal not found: ${literal}`).toBe(true);
        });
      }

      if (Number.isFinite(entry.expectedInsertOccurrences)) {
        it(`has exactly ${entry.expectedInsertOccurrences} raw session_coordination .insert( call(s) — a new one changes this count and must be reviewed for stamping`, () => {
          expect(countInsertOccurrences(source)).toBe(entry.expectedInsertOccurrences);
        });
      }

      if (entry.expectedLiteralCount) {
        const { literal, count } = entry.expectedLiteralCount;
        it(`the fix literal "${literal}" appears exactly ${count} time(s) — matches the known fixed site count`, () => {
          const occurrences = source.split(literal).length - 1;
          expect(occurrences).toBe(count);
        });
      }
    });
  }
});
