// SD-FDBK-ENH-ROUTING-RECOMMENDATION-SURFACES-001 (FR-5).
//
// worker-checkin.cjs's foreignSessionForSd selected 6 columns but not process_alive_at or
// expected_silence_until -- 2 of isSessionAlive's 5 liveness signals (hasTickAlive /
// hasExpectedSilence, lib/fleet/session-liveness.cjs). Both callers (isForeignSessionLive,
// foreignClaimantBlocksSteal) therefore ran a silently degraded ladder: those 2 rungs were
// hard-false for every row, regardless of the session's real state.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isForeignSessionLive } = require('../../../scripts/worker-checkin.cjs');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SRC = readFileSync(path.join(root, 'scripts/worker-checkin.cjs'), 'utf8');

// Column-projecting Supabase stub: unlike a naive mock that returns a canned row regardless of
// the select() string, this ACTUALLY filters the returned row to the requested columns -- so
// the test can only pass if foreignSessionForSd's select genuinely asks for the 2 new columns.
function makeProjectingSupabase(fullRow) {
  const chain = {
    select: (colsStr) => {
      const cols = colsStr.split(',').map((s) => s.trim());
      chain._project = () => {
        const projected = {};
        for (const col of cols) if (col in fullRow) projected[col] = fullRow[col];
        return projected;
      };
      return chain;
    },
    eq: () => chain,
    neq: () => chain,
    limit: async () => ({ data: [chain._project()], error: null }),
  };
  return { from: () => chain };
}

describe('FR-5: foreignSessionForSd selects process_alive_at + expected_silence_until', () => {
  it('a fresh process_alive_at reaches isSessionAlive and is honored (hasTickAlive rung)', async () => {
    const sb = makeProjectingSupabase({
      session_id: 'session-OTHER',
      is_alive: false,
      heartbeat_at: new Date(Date.now() - 999999).toISOString(),
      heartbeat_age_seconds: 999999,
      terminal_id: 't1',
      current_branch: 'main',
      process_alive_at: new Date().toISOString(),
      expected_silence_until: null,
    });
    // Injectable isSessionAliveFn (isForeignSessionLive's own testability seam) proves the field
    // actually arrived, without depending on the real 5-signal ladder's internals.
    const isSessionAliveFn = (session) => ({ alive: !!session.process_alive_at });

    const alive = await isForeignSessionLive(sb, 'SD-X', 'session-ME', isSessionAliveFn);

    expect(alive).toBe(true);
  });

  it('an armed expected_silence_until reaches isSessionAlive and is honored (hasExpectedSilence rung)', async () => {
    const sb = makeProjectingSupabase({
      session_id: 'session-OTHER',
      is_alive: false,
      heartbeat_at: new Date(Date.now() - 999999).toISOString(),
      heartbeat_age_seconds: 999999,
      terminal_id: 't1',
      current_branch: 'main',
      process_alive_at: null,
      expected_silence_until: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
    const isSessionAliveFn = (session) => ({ alive: !!session.expected_silence_until });

    const alive = await isForeignSessionLive(sb, 'SD-X', 'session-ME', isSessionAliveFn);

    expect(alive).toBe(true);
  });

  it('source: foreignSessionForSd\'s select literally names both columns (pins against a future silent revert)', () => {
    const i = SRC.indexOf('async function foreignSessionForSd');
    const fnBody = SRC.slice(i, SRC.indexOf('\n}\n', i));
    expect(fnBody).toMatch(/process_alive_at/);
    expect(fnBody).toMatch(/expected_silence_until/);
  });
});
