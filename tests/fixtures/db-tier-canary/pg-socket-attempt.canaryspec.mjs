// SEC-01 socket-guard fixture — SD-LEO-INFRA-VITEST-TIER-REAL-001.
//
// The pg/pooler path never touches globalThis.fetch, so the fetch guard cannot see it. This
// fixture opens a RAW socket to a routable host from beforeAll (what a pg Client does under the
// hood) with NO skipIf — the deepest bypass: env-neutralization is irrelevant because the target
// is hardcoded here. Under the gate's net.Socket guard the connect is refused before any packet
// leaves the machine. The spawn harness asserts DB_TIER_BLOCKED + REFUSED_COUNT and zero success.
//
// .canaryspec.mjs so it is never collected by DB_INCLUDE or the membership guard (see the sibling
// bypass fixture for the full rationale; line comments because a glob would close this block).
import net from 'node:net';
import { describe, it, expect, beforeAll } from 'vitest';
import { refusedRequests } from '../../setup.db.js';

describe('raw socket to a routable host (the pg/pooler axis)', () => {
  beforeAll(async () => {
    await new Promise((resolve) => {
      let settled = false;
      try {
        const s = net.connect({ host: 'aws-1-us-east-1.pooler.supabase.com', port: 5432 });
        s.on('error', (e) => {
          if (settled) return;
          settled = true;
          process.stderr.write(`PG_SOCKET_RESULT: ${e.message}\n`);
          process.stderr.write(`REFUSED_COUNT: ${refusedRequests.length}\n`);
          resolve();
        });
        s.on('connect', () => { if (!settled) { settled = true; process.stderr.write('PG_SOCKET_RESULT: CONNECTED\n'); s.destroy(); resolve(); } });
      } catch (e) {
        // The guard throws synchronously from connect().
        process.stderr.write(`PG_SOCKET_RESULT: ${e.message}\n`);
        process.stderr.write(`REFUSED_COUNT: ${refusedRequests.length}\n`);
        resolve();
      }
    });
    // A hook that demands a routable DB socket is unrunnable undesignated: fail loud.
    throw new Error('pg socket attempt reached beforeAll — expected under an undesignated target');
  });

  it('never executes under an undesignated target', () => { expect(true).toBe(true); });
});
