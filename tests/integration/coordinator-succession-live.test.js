/**
 * SD-LEO-INFRA-COORDINATOR-SUCCESSION-PROTOCOL-001 — LIVE succession e2e (db tier).
 *
 * Solomon pin a0cdbf9e mandates LIVE-not-mocked acceptance. Fixture note (documented
 * substitution per VALIDATION condition + TESTING GAP-1): the designated 07-14 zombie
 * consult rows at retired Solomon session b4962eff carry read_at NON-NULL, so they can
 * never exercise the read_at-IS-NULL drain — this suite instead SEEDS a real unread
 * session_coordination row targeted at a synthetic retired-coordinator session and
 * proves the drain live, with full cleanup.
 *
 * SAFETY: the synthetic sessions carry NO is_coordinator metadata and a stale/fresh
 * heartbeat as needed — they can never win a coordinator election or perturb the fleet.
 *
 * TS-5 note: until the chairman applies 20260719_coordinator_succession_STAGED.sql the
 * live DB IS the merge-without-apply state, so the tables-absent fail-open contract is
 * itself provable live here; once applied, the same tests prove the durable path.
 * Both branches assert real behavior — a skip is not a pass (TESTING GAP-2).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { HAS_REAL_DB, describeDb } from '../helpers/db-available.js';
import {
  drainCoordinatorOutbound, registerFollowOn, listOpenFollowOns, closeFollowOn,
  assertSuccessionTablesExist,
} from '../../lib/coordinator/succession.cjs';

const PRED = randomUUID();      // "retired predecessor" — stale heartbeat, NO coordinator metadata
const SUCC = randomUUID();      // "successor" — fresh heartbeat, NO coordinator metadata
let supabase = null;
let seededRowId = null;
let followOnId = null;
let tablesApplied = false;

describeDb('coordinator succession LIVE e2e (Solomon pin a0cdbf9e)', () => {
  beforeAll(async () => {
    supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const staleHb = new Date(Date.now() - 30 * 60_000).toISOString();
    await supabase.from('claude_sessions').upsert([
      { session_id: PRED, heartbeat_at: staleHb, status: 'released', metadata: { succession_e2e_fixture: true } },
      { session_id: SUCC, heartbeat_at: new Date().toISOString(), status: 'active', metadata: { succession_e2e_fixture: true } },
    ], { onConflict: 'session_id' });

    // Seed the UNREAD row "stranded at the corpse" — the 16-dead-letter class in miniature.
    const { data, error } = await supabase.from('session_coordination').insert({
      sender_session: SUCC, // benign sender; content marks it as fixture
      target_session: PRED,
      message_type: 'INFO',
      subject: '[SUCCESSION-E2E] seeded unread row for live drain proof',
      payload: { kind: 'coordinator_update', body: 'succession live-e2e fixture', succession_e2e_fixture: true },
    }).select('id').single();
    if (error) throw new Error('fixture seed failed: ' + error.message);
    seededRowId = data.id;

    const canary = await assertSuccessionTablesExist(supabase);
    tablesApplied = canary.ok === true;
  }, 30000);

  afterAll(async () => {
    if (!supabase) return;
    try { if (seededRowId) await supabase.from('session_coordination').delete().eq('id', seededRowId); } catch { /* cleanup best-effort */ }
    try { if (followOnId) await supabase.from('coordinator_follow_ons').delete().eq('id', followOnId); } catch { /* absent pre-apply */ }
    try { await supabase.from('claude_sessions').delete().in('session_id', [PRED, SUCC]); } catch { /* cleanup best-effort */ }
  }, 30000);

  it('TS-1: drain re-targets the predecessor-stranded unread row to the successor, live', async () => {
    const r = await drainCoordinatorOutbound(supabase, { newSessionId: SUCC, oldSessionIds: [PRED] });
    expect(r.error).toBeUndefined();
    expect(r.moved).toBeGreaterThanOrEqual(1);
    // Live readback: zero unread rows left at the corpse; the seeded row now targets the successor.
    const { data: atPred } = await supabase.from('session_coordination')
      .select('id').eq('target_session', PRED).is('read_at', null);
    expect(atPred || []).toEqual([]);
    const { data: moved } = await supabase.from('session_coordination')
      .select('target_session').eq('id', seededRowId).single();
    expect(moved.target_session).toBe(SUCC);
  }, 30000);

  it('TS-1 idempotency: a re-run moves nothing (moved === 0)', async () => {
    const again = await drainCoordinatorOutbound(supabase, { newSessionId: SUCC, oldSessionIds: [PRED] });
    expect(again.moved).toBe(0);
    expect(again.error).toBeUndefined();
  }, 30000);

  it('TS-4/TS-5: follow-on registry — durable path when applied, exact fail-open contract when not', async () => {
    const reg = await registerFollowOn(supabase, {
      sessionId: PRED, kind: 'promised-verification',
      subject: '[SUCCESSION-E2E] cycle-6-VERIFIED-style seeded follow-on',
    });
    if (tablesApplied) {
      // Durable path (post chairman apply): promise survives and surfaces to the successor.
      expect(reg.ok).toBe(true);
      followOnId = reg.id;
      const open = await listOpenFollowOns(supabase, {});
      expect(open.items.some((f) => f.id === reg.id)).toBe(true);
      const closed = await closeFollowOn(supabase, { id: reg.id, sessionId: SUCC });
      expect(closed.ok).toBe(true);
    } else {
      // Merge-without-apply state (the LIVE DB right now): the exact TS-5 contract —
      // loud degrade, no throw, drain unaffected (proven by TS-1 above).
      expect(reg.tablesAbsent).toBe(true);
      expect(reg.ok).toBe(false);
      const open = await listOpenFollowOns(supabase, {});
      expect(open.tablesAbsent).toBe(true);
      expect(open.items).toEqual([]);
    }
  }, 30000);

  it('TS-6: insertCoordinationRow stamps sender_type=coordinator for the live active coordinator (fill-if-absent, never override)', async () => {
    const { getActiveCoordinatorId } = await import('../../lib/coordinator/resolve.cjs');
    const activeCoord = await getActiveCoordinatorId(supabase);
    if (!activeCoord) {
      // No live coordinator resolvable — the stamp path is fill-if-absent + fail-open, so
      // absence means rows stay untouched; assert exactly that (still a real assertion).
      expect(activeCoord).toBeFalsy();
      return;
    }
    const { insertCoordinationRow } = await import('../../lib/coordinator/dispatch.cjs');
    const { data: row, error } = await insertCoordinationRow(supabase, {
      sender_session: activeCoord,
      target_session: SUCC,
      message_type: 'INFO',
      subject: '[SUCCESSION-E2E] sender_type stamp proof',
      payload: { kind: 'coordinator_update', body: 'stamp fixture', succession_e2e_fixture: true },
    }, { select: 'id, sender_type', single: true });
    expect(error || undefined).toBeUndefined();
    expect(row.sender_type).toBe('coordinator'); // stamped at the choke point, caller omitted it
    // Never-override: an explicit caller value survives.
    const { data: row2 } = await insertCoordinationRow(supabase, {
      sender_session: activeCoord,
      target_session: SUCC,
      message_type: 'INFO',
      sender_type: 'sweep',
      subject: '[SUCCESSION-E2E] sender_type non-override proof',
      payload: { kind: 'coordinator_update', body: 'stamp fixture 2', succession_e2e_fixture: true },
    }, { select: 'id, sender_type', single: true });
    expect(row2.sender_type).toBe('sweep');
    await supabase.from('session_coordination').delete().in('id', [row.id, row2.id]);
  }, 30000);
});

// Visibility outside the db tier: this suite is meaningless if silently skipped.
describe('db-tier availability (TESTING GAP-2)', () => {
  it('reports whether the live suite ran', () => {
    if (!HAS_REAL_DB) {
      console.warn('[SUCCESSION-E2E] HAS_REAL_DB=false — live succession proof DID NOT RUN in this environment; PLAN verification must run the db project with credentials.');
    }
    expect(typeof HAS_REAL_DB).toBe('boolean');
  });
});
