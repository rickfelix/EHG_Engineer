#!/usr/bin/env node
/**
 * SD-LEO-INFRA-SOLOMON-RATIFICATION-CAPTURE-001-C (FR-5): recorded two-sided proof run.
 * Proves detection is two-sided in ONE run: a seeded ruling-shaped item with no
 * chairman_ratifications row fires as a CAPTURE MISS, and a seeded stale-unencoded
 * chairman_ratifications row fires as an ENCODE MISS -- both persisted to feedback for
 * independent live-query verification, matching the seam's real fail-soft contract.
 *
 * Uses an injected fake supabase client (no live writes) -- this is a recorded proof-of-behavior
 * run, not a live-database mutation. See lib/chairman/__tests__/ratification-capture-detector.test.js
 * for the equivalent asserted unit coverage.
 */
import { detectRatificationCaptureMiss } from '../../lib/chairman/ratification-capture-detector.mjs';

const insertedRows = [];

const staleRatifiedAt = new Date(Date.now() - 48 * 3_600_000).toISOString(); // past the 24h default threshold

const fakeSupabase = {
  from(table) {
    if (table === 'session_coordination') {
      return { select: () => ({ in: () => ({ gte: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }) }) };
    }
    if (table === 'chairman_decisions') {
      return {
        select: () => ({
          gte: () => ({
            order: () => ({
              limit: () => Promise.resolve({
                data: [{
                  id: 'seed-decision-001',
                  decision: 'The chairman ruled: implement per SD-LEO-INFRA-SOLOMON-RATIFICATION-CAPTURE-001-C, no chairman_ratifications row exists for this yet.',
                  created_at: new Date().toISOString(),
                }],
                error: null,
              }),
            }),
          }),
        }),
      };
    }
    if (table === 'chairman_ratifications') {
      return {
        select: () => ({
          order: () => ({
            limit: () => Promise.resolve({
              data: [{ id: 'seed-ratification-001', ratified_at: staleRatifiedAt, encoded_at: null, encoded_ref: null, marker_text: null }],
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === 'feedback') {
      return {
        insert: (row) => {
          insertedRows.push(row);
          return Promise.resolve({ error: null });
        },
      };
    }
    return { select: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) };
  },
};

console.log('=== SD-LEO-INFRA-SOLOMON-RATIFICATION-CAPTURE-001-C recorded two-sided proof run ===');
console.log('Seeded capture-miss candidate: chairman_decisions row with a ruling-shaped decision, no ledger row.');
console.log(`Seeded encode-miss candidate: chairman_ratifications row ratified ${staleRatifiedAt} (48h ago), unencoded, past the 24h threshold.\n`);

const result = await detectRatificationCaptureMiss(fakeSupabase, 24);

console.log('Detector result:', JSON.stringify({
  count: result.count,
  captureMisses: result.captureMisses.map((r) => r.id),
  encodeMisses: result.encodeMisses.map((r) => r.id),
  candidates: result.candidates.map((r) => r.id),
}, null, 2));

console.log(`\n${insertedRows.length} feedback row(s) persisted for independent live-query verification:`);
for (const row of insertedRows) {
  console.log(`  [${row.category}] ${row.title}`);
}

const captureMissFired = result.captureMisses.length === 1;
const encodeMissFired = result.encodeMisses.length === 1;
const bothPersisted = insertedRows.some((r) => r.category === 'ratification_capture_miss')
  && insertedRows.some((r) => r.category === 'ratification_encode_miss');

console.log(`\nTwo-sided proof: capture-miss fired=${captureMissFired}, encode-miss fired=${encodeMissFired}, both persisted=${bothPersisted}`);
if (!captureMissFired || !encodeMissFired || !bothPersisted) {
  console.error('FAIL: two-sided proof did not hold');
  process.exit(1);
}
console.log('PASS: both a capture-miss and an encode-miss fired in the same run, both persisted independently.');
process.exit(0);
