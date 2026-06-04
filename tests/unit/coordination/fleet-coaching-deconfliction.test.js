// Tests for SD-FDBK-INFRA-CROSS-SESSION-CONFLICTION-001 / FR-3
// fleet-coaching.cjs sendDeconflictionReply — targeted COACHING reply + acknowledged_at stamp.
//
// The flag is read at module load, so we set it BEFORE requiring the module.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.CROSS_SESSION_DECONFLICTION = 'true'; // enable the path before import

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../');

// fleet-coaching.cjs guards main() behind require.main === module and lazily creates
// its supabase client, so requiring it here is side-effect-free (no DB connection).
const { sendDeconflictionReply, deconflictionCoachingType, DECONFLICTION_ENABLED } =
  require(path.resolve(ROOT, 'scripts/fleet-coaching.cjs'));

// Minimal injectable mock that records inserts + updates.
function makeClient({ recentRows = [] } = {}) {
  const inserts = [];
  const updates = [];
  const client = {
    from: (table) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            gte: () => ({
              limit: () => Promise.resolve({ data: recentRows, error: null })
            })
          })
        })
      }),
      insert: (row) => { inserts.push({ table, row }); return Promise.resolve({ data: null, error: null }); },
      update: (patch) => ({
        eq: (col, val) => { updates.push({ table, patch, col, val }); return Promise.resolve({ data: null, error: null }); }
      })
    })
  };
  return { client, inserts, updates };
}

describe('FR-3: flag is enabled for this test file', () => {
  it('DECONFLICTION_ENABLED is true', () => {
    expect(DECONFLICTION_ENABLED).toBe(true);
  });
});

describe('TS-FR3: targeted DECONFLICTION reply writes COACHING + stamps acknowledged_at', () => {
  it('inserts a COACHING row with payload.deconfliction + reply_to_signal_id', async () => {
    const { client, inserts } = makeClient();
    const res = await sendDeconflictionReply(client, {
      targetSession: 'worker-session-1',
      replyToSignalId: 'sig-123',
      subject: '[DECONFLICTION] stand down',
      body: 'Another session owns this tree.'
    });

    expect(res.sent).toBe(true);
    expect(inserts.length).toBe(1);
    const row = inserts[0].row;
    expect(row.message_type).toBe('COACHING'); // enum-safe, NOT 'INFO'
    expect(row.target_session).toBe('worker-session-1');
    expect(row.payload.deconfliction).toBe(true);
    expect(row.payload.reply_to_signal_id).toBe('sig-123');
    expect(row.payload.coaching_type).toBe('deconfliction:sig-123');
  });

  it('stamps acknowledged_at=now() on the ORIGINAL signal row (WHERE id = reply_to_signal_id)', async () => {
    const { client, updates } = makeClient();
    const res = await sendDeconflictionReply(client, {
      targetSession: 'worker-session-1',
      replyToSignalId: 'sig-456',
      body: 'ack + reply'
    });

    expect(res.acknowledged).toBe(true);
    // Exactly one acknowledged_at UPDATE keyed on id = sig-456.
    const ackUpdate = updates.find(u => u.patch.acknowledged_at && u.col === 'id' && u.val === 'sig-456');
    expect(ackUpdate).toBeTruthy();
    expect(typeof ackUpdate.patch.acknowledged_at).toBe('string');
  });

  it('uses a DISTINCT cooldown key (deconfliction:<id>) that will not collide with normal coaching', () => {
    expect(deconflictionCoachingType('sig-789')).toBe('deconfliction:sig-789');
    // Distinct namespace from real coaching types like WORKTREE_REMINDER / GATE_COMPLIANCE.
    expect(deconflictionCoachingType('sig-789')).not.toBe('WORKTREE_REMINDER');
    expect(deconflictionCoachingType('sig-789').startsWith('deconfliction:')).toBe(true);
  });

  it('cooldown: when a same-key reply exists in window, does NOT re-insert (but still acks origin)', async () => {
    const { client, inserts, updates } = makeClient({
      recentRows: [{ id: 'prev', payload: { coaching_type: 'deconfliction:sig-cool' } }]
    });
    const res = await sendDeconflictionReply(client, {
      targetSession: 'w1',
      replyToSignalId: 'sig-cool',
      body: 'dup'
    });
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe('cooldown');
    expect(inserts.length).toBe(0);           // no duplicate reply
    expect(res.acknowledged).toBe(true);       // origin ack is NOT gated by cooldown
    expect(updates.some(u => u.val === 'sig-cool')).toBe(true);
  });

  it('broadcast=true is recorded in payload.broadcast for destructive-action fan-out', async () => {
    const { client, inserts } = makeClient();
    await sendDeconflictionReply(client, {
      targetSession: 'w2',
      replyToSignalId: 'sig-b',
      body: 'cancelling tree X — stand down',
      broadcast: true
    });
    expect(inserts[0].row.payload.broadcast).toBe(true);
  });
});
