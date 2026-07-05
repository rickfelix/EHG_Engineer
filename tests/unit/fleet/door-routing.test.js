/**
 * door-routing.test.js — SD-LEO-INFRA-TIERED-ORCHESTRATION-FABLE-001 (TS-1..TS-5).
 * Classifier unit matrix, stamper composition, dispatch gate fixtures, ledger
 * fire-and-forget, and the DOOR_ROUTING_ENABLED inertness contract.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { classifyDoor, DOORS, DELEGATE_TIERS } from '../../../lib/fleet/door-classifier.mjs';
import { stampDoorClass } from '../../../lib/fleet/door-stamper.mjs';

const require = createRequire(import.meta.url);
const { assertDoorRoutingAllowed } = require('../../../lib/coordinator/dispatch.cjs');
const { writeDoorRoutingLedger } = require('../../../lib/fleet/door-routing-ledger.cjs');
const { isDoorRoutingEnabled } = require('../../../lib/fleet/door-constants.cjs');
const ladder = require('../../../lib/fleet/tier-ladder.cjs');

const TOP = ladder.ladderTopRank();

beforeEach(() => { process.env.DOOR_ROUTING_ENABLED = 'true'; });
afterEach(() => { delete process.env.DOOR_ROUTING_ENABLED; delete process.env.DELEGATE_DEFAULT_MODEL; });

// ── TS-1: classifier unit matrix ─────────────────────────────────────────────
describe('classifyDoor (TS-1)', () => {
  it('one_way on migration files with the marker named', () => {
    const r = classifyDoor({ description: 'add a column for telemetry', files: ['database/migrations/20260705_x.sql'] });
    expect(r.door).toBe(DOORS.ONE_WAY);
    expect(r.reasons.some(x => x.startsWith('migration_file:'))).toBe(true);
  });

  it('one_way on schema/risk keywords via the SHARED list (bridge, named reason)', () => {
    const r = classifyDoor({ description: 'alter table venture_artifacts add column foo' });
    expect(r.door).toBe(DOORS.ONE_WAY);
    expect(r.reasons.some(x => x.startsWith('risk_keyword:'))).toBe(true);
    expect(r.gates.risk_keyword).toBe(true);
  });

  it('one_way on protocol/API-contract/architecture markers', () => {
    expect(classifyDoor({ description: 'amend the pause rules', files: ['CLAUDE_EXEC.md'] }).door).toBe(DOORS.ONE_WAY);
    expect(classifyDoor({ description: 'breaking change to the response shape' }).door).toBe(DOORS.ONE_WAY);
    expect(classifyDoor({ description: 'architectural rework of the dispatch layer' }).door).toBe(DOORS.ONE_WAY);
  });

  it('two_way ONLY via the closed allowlist, with the condition named', () => {
    const copy = classifyDoor({ description: 'reword hero copy for truthfulness', files: ['src/services/landing.js'] });
    expect(copy).toMatchObject({ door: DOORS.TWO_WAY, reasons: ['allowlist:copy_content_edit'] });
    const docs = classifyDoor({ description: 'docs-only update to the runbook', files: ['docs/runbook.md'] });
    expect(docs.door).toBe(DOORS.TWO_WAY);
    const flagged = classifyDoor({ description: 'feature-flagged tweak to the results header' });
    expect(flagged.door).toBe(DOORS.TWO_WAY);
  });

  it('allowlist match contradicted by unsafe files stays one_way', () => {
    const r = classifyDoor({ description: 'docs-only cleanup', files: ['lib/coordinator/dispatch.cjs'] });
    expect(r.door).toBe(DOORS.ONE_WAY);
    expect(r.reasons[0]).toContain('allowlist_contradicted_by_files');
  });

  it('ambiguous/empty input → one_way fail-safe (never two_way on missing signals)', () => {
    expect(classifyDoor({})).toMatchObject({ door: DOORS.ONE_WAY, reasons: ['ambiguous_fail_safe'] });
    expect(classifyDoor({ description: '' }).door).toBe(DOORS.ONE_WAY);
    expect(classifyDoor(null).door).toBe(DOORS.ONE_WAY);
    expect(classifyDoor({ description: '   ' }).door).toBe(DOORS.ONE_WAY);
  });

  it('closed verdict set with non-empty reasons over generated inputs (property)', () => {
    const words = ['refactor', 'copy', 'auth', 'migration', 'layout', 'telemetry', 'exit', 'strategy', ''];
    for (let i = 0; i < 60; i++) {
      const desc = [words[i % 9], words[(i * 3) % 9], words[(i * 7) % 9]].join(' ');
      const r = classifyDoor({ description: desc, estimated_loc: i * 13 });
      expect([DOORS.ONE_WAY, DOORS.TWO_WAY]).toContain(r.door);
      expect(r.reasons.length).toBeGreaterThan(0);
    }
  });

  it('CANARY: keyword lists come from classify-quick-fix through the sd-tier-rank bridge (no third list)', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../../lib/fleet/door-classifier.mjs'), 'utf8');
    expect(src).toMatch(/import \{ matchesKeyword, CLASSIFICATION_RULES \} from '\.\.\/\.\.\/scripts\/classify-quick-fix\.js'/);
    // And it must NOT define its own risk keyword arrays for those concerns.
    expect(src).not.toMatch(/forbiddenKeywords\s*[:=]\s*\[/);
  });
});

// ── TS-2: stamper composition ────────────────────────────────────────────────
function mockSupabaseForStamp(existingMeta) {
  const writes = [];
  return {
    writes,
    from(table) {
      return {
        select() { return this; }, eq() { return this; },
        maybeSingle: async () => ({ data: { metadata: existingMeta }, error: null }),
        update(patch) { writes.push({ table, patch }); return { eq: async () => ({ error: null }) }; },
      };
    },
  };
}

describe('stampDoorClass (TS-2)', () => {
  it('one_way stamp raises min_tier_rank to the ladder top IN THE SAME WRITE, preserving unrelated keys', async () => {
    const sb = mockSupabaseForStamp({ min_tier_rank: 2, unrelated_key: 'kept', dispatch_rank: 5 });
    const out = await stampDoorClass(sb, { id: 'x', sd_key: 'SD-T-1', description: 'alter table foo add column' });
    expect(out.door).toBe(DOORS.ONE_WAY);
    expect(out.rank_raised).toBe(true);
    const meta = sb.writes[0].patch.metadata;
    expect(meta.door_class.door).toBe(DOORS.ONE_WAY);
    expect(meta.min_tier_rank).toBe(TOP);
    expect(meta.unrelated_key).toBe('kept');
    expect(meta.dispatch_rank).toBe(5);
    expect(sb.writes).toHaveLength(1); // ONE atomic write — compose, never a second update
  });

  it('two_way stamp leaves min_tier_rank untouched', async () => {
    const sb = mockSupabaseForStamp({ min_tier_rank: 2 });
    const out = await stampDoorClass(sb, { id: 'x', sd_key: 'SD-T-2', description: 'reword hero copy' });
    expect(out.door).toBe(DOORS.TWO_WAY);
    expect(out.rank_raised).toBe(false);
    expect(sb.writes[0].patch.metadata.min_tier_rank).toBe(2);
  });

  it('re-stamp is idempotent in shape (door_class updated in place)', async () => {
    const sb = mockSupabaseForStamp({ door_class: { door: 'two_way', reasons: ['allowlist:docs_only_change'] } });
    await stampDoorClass(sb, { id: 'x', sd_key: 'SD-T-3', description: 'drop table users' });
    const meta = sb.writes[0].patch.metadata;
    expect(meta.door_class.door).toBe(DOORS.ONE_WAY); // updated, not duplicated
  });
});

// ── TS-3 + TS-5: dispatch gate fixtures + inertness ─────────────────────────
function mockSupabaseForGate({ sdMeta, sessMeta }) {
  const calls = [];
  const ledgerRows = [];
  return {
    calls,
    ledgerRows,
    from(table) {
      calls.push(table);
      if (table === 'door_routing_ledger') {
        return { insert: async (row) => { ledgerRows.push(row); return { error: null }; } };
      }
      return {
        select() { return this; }, eq() { return this; },
        maybeSingle: async () => ({
          data: table === 'strategic_directives_v2' ? { metadata: sdMeta } : { metadata: sessMeta },
          error: null,
        }),
      };
    },
  };
}

const oneWayMeta = { door_class: { door: 'one_way', reasons: ['risk_keyword:migration'] } };
const twoWayMeta = { door_class: { door: 'two_way', reasons: ['allowlist:copy_content_edit'] } };

describe('assertDoorRoutingAllowed (TS-3, TS-5)', () => {
  it('one_way to a non-fable worker throws DISPATCH_ONE_WAY_DOOR naming the reason (fail-closed)', async () => {
    const sb = mockSupabaseForGate({ sdMeta: oneWayMeta, sessMeta: { tier_rank: 1, model: 'sonnet' } });
    const row = { message_type: 'WORK_ASSIGNMENT', target_session: 's1', payload: { assigned_sd: 'SD-X-1' } };
    await expect(assertDoorRoutingAllowed(sb, row, { warn() {} })).rejects.toMatchObject({ code: 'DISPATCH_ONE_WAY_DOOR' });
    await expect(assertDoorRoutingAllowed(sb, row, { warn() {} })).rejects.toThrow(/risk_keyword:migration/);
  });

  it('EXCLUSIVITY IS MODEL-KEYED (finding A): opus at TOP static rank is still REFUSED for one_way', async () => {
    // rankForModelEffort('opus','high') shares static rank 4 with fable — rank can
    // never prove fable-ness. The gate must check the declared model.
    const sb = mockSupabaseForGate({ sdMeta: oneWayMeta, sessMeta: { tier_rank: TOP, model: 'opus' } });
    const row = { message_type: 'WORK_ASSIGNMENT', target_session: 's1', payload: { assigned_sd: 'SD-X-1' } };
    await expect(assertDoorRoutingAllowed(sb, row, { warn() {} })).rejects.toMatchObject({ code: 'DISPATCH_ONE_WAY_DOOR' });
  });

  it('EXCLUSIVITY FAILS CLOSED ON UNKNOWN (finding A): an UNSTAMPED session (defaults UP to top rank) is REFUSED for one_way', async () => {
    const sb = mockSupabaseForGate({ sdMeta: oneWayMeta, sessMeta: {} }); // no model, resolveWorkerTierRank -> TOP
    const row = { message_type: 'WORK_ASSIGNMENT', target_session: 's1', payload: { assigned_sd: 'SD-X-1' } };
    await expect(assertDoorRoutingAllowed(sb, row, { warn() {} })).rejects.toThrow(/UNDECLARED/);
  });

  it('one_way to a declared-fable worker proceeds without a delegate stamp', async () => {
    const sb = mockSupabaseForGate({ sdMeta: oneWayMeta, sessMeta: { tier_rank: TOP, model: 'fable' } });
    const row = { message_type: 'WORK_ASSIGNMENT', target_session: 's1', payload: { assigned_sd: 'SD-X-1' } };
    await assertDoorRoutingAllowed(sb, row, { warn() {} });
    expect(row.payload.delegate_model).toBeUndefined();
  });

  it('caller-preset delegate_model outside DELEGATE_TIERS is REPLACED, never honored (finding F)', async () => {
    const sb = mockSupabaseForGate({ sdMeta: twoWayMeta, sessMeta: { tier_rank: 1, model: 'sonnet' } });
    const row = { message_type: 'WORK_ASSIGNMENT', target_session: 's1', payload: { assigned_sd: 'SD-X-2', delegate_model: 'haiku' } };
    await assertDoorRoutingAllowed(sb, row, { warn() {} });
    expect(row.payload.delegate_model).toBe('sonnet');
  });

  it('two_way stamps payload.delegate_model from the worker model, validated against DELEGATE_TIERS', async () => {
    const sb = mockSupabaseForGate({ sdMeta: twoWayMeta, sessMeta: { tier_rank: 2, model: 'opus' } });
    const row = { message_type: 'WORK_ASSIGNMENT', target_session: 's1', payload: { assigned_sd: 'SD-X-2' } };
    await assertDoorRoutingAllowed(sb, row, { warn() {} });
    expect(DELEGATE_TIERS).toContain(row.payload.delegate_model);
    expect(row.payload.delegate_model).toBe('opus');
  });

  it('FR-4 seam: a routed two_way dispatch writes ONE ledger row at stamp time (fire-and-forget)', async () => {
    const sb = mockSupabaseForGate({ sdMeta: twoWayMeta, sessMeta: { tier_rank: 2, model: 'opus' } });
    const row = { message_type: 'WORK_ASSIGNMENT', target_session: 's1', payload: { assigned_sd: 'SD-X-2' } };
    await assertDoorRoutingAllowed(sb, row, { warn() {} });
    await new Promise(r => setTimeout(r, 10)); // fire-and-forget settles
    expect(sb.ledgerRows).toHaveLength(1);
    expect(sb.ledgerRows[0]).toMatchObject({ work_key: 'SD-X-2', door: 'two_way', delegate_model: 'opus', tier_rank: 2 });
  });

  it('FR-4 seam: a proceeding one_way dispatch also ledgers (no delegate_model)', async () => {
    const sb = mockSupabaseForGate({ sdMeta: oneWayMeta, sessMeta: { tier_rank: TOP, model: 'fable' } });
    const row = { message_type: 'WORK_ASSIGNMENT', target_session: 's1', payload: { assigned_sd: 'SD-X-1' } };
    await assertDoorRoutingAllowed(sb, row, { warn() {} });
    await new Promise(r => setTimeout(r, 10));
    expect(sb.ledgerRows).toHaveLength(1);
    expect(sb.ledgerRows[0]).toMatchObject({ work_key: 'SD-X-1', door: 'one_way', delegate_model: null });
  });

  it('classifier scores key_changes.impact — destructive impact behind docs-only copy is one_way (finding D)', () => {
    const r = classifyDoor({
      description: 'docs-only update to runbook',
      key_changes: [{ change: 'update runbook', impact: 'also drops the production users table' }],
      files: ['docs/runbook.md'],
    });
    expect(r.door).toBe(DOORS.ONE_WAY);
  });

  it('copy edits touching sensitive paths never delegate (finding E)', () => {
    const r = classifyDoor({ description: 'reword the tagline', files: ['src/auth/login.js'] });
    expect(r.door).toBe(DOORS.ONE_WAY);
    const r2 = classifyDoor({ description: 'feature-flagged stripe payment capture integration', files: ['src/payments/stripe.js'] });
    expect(r2.door).toBe(DOORS.ONE_WAY); // payment_surface marker fires
  });

  it('FR-4 seam: a REFUSED one_way dispatch writes NO ledger row', async () => {
    const sb = mockSupabaseForGate({ sdMeta: oneWayMeta, sessMeta: { tier_rank: 1, model: 'sonnet' } });
    const row = { message_type: 'WORK_ASSIGNMENT', target_session: 's1', payload: { assigned_sd: 'SD-X-1' } };
    await expect(assertDoorRoutingAllowed(sb, row, { warn() {} })).rejects.toMatchObject({ code: 'DISPATCH_ONE_WAY_DOOR' });
    await new Promise(r => setTimeout(r, 10));
    expect(sb.ledgerRows).toHaveLength(0);
  });

  it('two_way to a non-delegate-declared worker falls back to the default (sonnet)', async () => {
    const sb = mockSupabaseForGate({ sdMeta: twoWayMeta, sessMeta: { tier_rank: 1, model: 'haiku' } });
    const row = { message_type: 'WORK_ASSIGNMENT', target_session: 's1', payload: { assigned_sd: 'SD-X-2' } };
    await assertDoorRoutingAllowed(sb, row, { warn() {} });
    expect(row.payload.delegate_model).toBe('sonnet');
  });

  it('unstamped SD → fail-open (no throw, no stamp)', async () => {
    const sb = mockSupabaseForGate({ sdMeta: { min_tier_rank: 2 }, sessMeta: { tier_rank: 1 } });
    const row = { message_type: 'WORK_ASSIGNMENT', target_session: 's1', payload: { assigned_sd: 'SD-X-3' } };
    await assertDoorRoutingAllowed(sb, row, { warn() {} });
    expect(row.payload.delegate_model).toBeUndefined();
  });

  it('read error → fail-open with a warn, never a block', async () => {
    const sb = { from() { throw new Error('boom'); } };
    const row = { message_type: 'WORK_ASSIGNMENT', target_session: 's1', payload: { assigned_sd: 'SD-X-4' } };
    let warned = false;
    await assertDoorRoutingAllowed(sb, row, { warn() { warned = true; } });
    expect(warned).toBe(true);
  });

  it('TS-5 INERTNESS: flag off → zero DB reads, zero stamps, zero throws (byte-identical dispatch)', async () => {
    delete process.env.DOOR_ROUTING_ENABLED;
    const sb = mockSupabaseForGate({ sdMeta: oneWayMeta, sessMeta: { tier_rank: 1 } });
    const row = { message_type: 'WORK_ASSIGNMENT', target_session: 's1', payload: { assigned_sd: 'SD-X-1' } };
    await assertDoorRoutingAllowed(sb, row, { warn() {} });
    expect(sb.calls).toHaveLength(0);
    expect(row.payload.delegate_model).toBeUndefined();
    expect(isDoorRoutingEnabled()).toBe(false);
  });

  it('QF-keyed assignments are not door-gated (tier-1/2 by construction)', async () => {
    const sb = mockSupabaseForGate({ sdMeta: oneWayMeta, sessMeta: { tier_rank: 1 } });
    const row = { message_type: 'WORK_ASSIGNMENT', target_session: 's1', payload: { assigned_sd: 'QF-20260705-001' } };
    await assertDoorRoutingAllowed(sb, row, { warn() {} });
    expect(sb.calls).toHaveLength(0);
  });
});

// ── TS-4: ledger fire-and-forget ─────────────────────────────────────────────
describe('writeDoorRoutingLedger (TS-4)', () => {
  it('writes the FR-4 row shape when enabled', async () => {
    let inserted = null;
    const sb = { from: () => ({ insert: async (row) => { inserted = row; return { error: null }; } }) };
    const out = await writeDoorRoutingLedger(sb, { work_key: 'SD-X-1', door: 'two_way', delegate_model: 'sonnet', tier_rank: 1, tokens_input: 100, tokens_output: 50, cost_usd: 0.01, model_id: 'claude-sonnet-5' });
    expect(out.written).toBe(true);
    expect(inserted).toMatchObject({ work_key: 'SD-X-1', door: 'two_way', delegate_model: 'sonnet', model_id: 'claude-sonnet-5' });
    expect(inserted.coverage_note).toContain('v1 routing surface');
  });

  it('NEVER throws and never blocks: insert error and thrown client both return written:false', async () => {
    const sbErr = { from: () => ({ insert: async () => ({ error: { message: 'no table' } }) }) };
    expect((await writeDoorRoutingLedger(sbErr, { work_key: 'x', door: 'one_way' }, { warn() {} })).written).toBe(false);
    const sbThrow = { from() { throw new Error('down'); } };
    expect((await writeDoorRoutingLedger(sbThrow, { work_key: 'x', door: 'one_way' }, { warn() {} })).written).toBe(false);
  });

  it('flag off → no write attempted (inert)', async () => {
    delete process.env.DOOR_ROUTING_ENABLED;
    let called = false;
    const sb = { from: () => { called = true; return { insert: async () => ({ error: null }) }; } };
    const out = await writeDoorRoutingLedger(sb, { work_key: 'x', door: 'one_way' });
    expect(out.written).toBe(false);
    expect(called).toBe(false);
  });
});
