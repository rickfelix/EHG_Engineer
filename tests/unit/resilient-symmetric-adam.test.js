/**
 * Unit tests — SD-LEO-INFRA-RESILIENT-SYMMETRIC-ADAM-001
 * Resilient symmetric Adam<->coordinator advisory channel.
 *
 * Covers the pure / mockable surfaces:
 *   FR-1  the unactioned-advisory selector gates on payload.actioned_at IS NULL
 *   FR-2  stampActioned JSONB-merges actioned_at (preserving existing keys); ack parseArgs
 *   FR-3  coordinator-reply parseArgs registers --advisory as a value flag
 *   FR-7  startup self-surfacing (renderAdamLane / adamReplyMirror)
 * (FR-4 decoupling + amAdam un-skip are pinned in adam-advisory.test.js and
 *  coordination-inbox-read-ack-split.test.js; FR-6 dispatch-throw + end-to-end live in
 *  the SD smoke_test_steps.)
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { renderAdamLane, buildReport, ADAM_COMMS_DOC } from '../../scripts/coordinator-startup-check.mjs';

const require = createRequire(import.meta.url);
const { selectUnactionedAdvisories, stampActioned, BROADCAST_COORDINATOR } = require('../../lib/coordinator/adam-advisory-store.cjs');
const { parseArgs: replyParseArgs } = require('../../scripts/coordinator-reply.cjs');
const { parseArgs: ackParseArgs } = require('../../scripts/coordinator-ack-adam.cjs');
const { adamReplyMirror } = require('../../scripts/adam-register.cjs');

// Minimal thenable supabase builder that records the query chain (no network).
function makeSupabase(result, captured) {
  const chain = {
    from(t) { captured.from = t; return chain; },
    select(s) { captured.select = s; return chain; },
    eq(k, v) { (captured.eq = captured.eq || []).push([k, v]); return chain; },
    is(k, v) { (captured.is = captured.is || []).push([k, v]); return chain; },
    in(k, v) { captured.in = [k, v]; return chain; },
    order() { captured.ordered = true; return chain; },
    limit(n) { captured.limit = n; return chain; },
    update(u) { captured.update = u; return chain; },
    maybeSingle() { return Promise.resolve(result); },
    then(res, rej) { return Promise.resolve(result).then(res, rej); },
  };
  return chain;
}

describe('FR-1: selectUnactionedAdvisories gates on payload.actioned_at IS NULL', () => {
  it('queries adam_advisory rows with actioned_at IS NULL across coordinator + broadcast sentinel', async () => {
    const captured = {};
    const sb = makeSupabase({ data: [{ id: 'a1', payload: { kind: 'adam_advisory' } }], error: null }, captured);
    const { rows, error } = await selectUnactionedAdvisories(sb, 'coord-uuid-aaaa', { limit: 5 });
    expect(error).toBeNull();
    expect(rows).toHaveLength(1);
    expect(captured.eq).toContainEqual(['payload->>kind', 'adam_advisory']);
    // SD-LEO-FIX-SOLOMON-MULTI-PART-001 (adversarial-review fix, PR #6191): target_session
    // MUST be selected — the multi-part grouping consumer keys a series on it, and this
    // selector unions rows from two different targets (coordinatorId + broadcast sentinel).
    expect(captured.select).toContain('target_session');
    expect(captured.is).toContainEqual(['payload->>actioned_at', null]); // the FR-1 re-surface gate
    expect(captured.in).toEqual(['target_session', ['coord-uuid-aaaa', BROADCAST_COORDINATOR]]);
    expect(captured.limit).toBe(5);
  });

  it('falls back to the broadcast sentinel when no coordinator is live', async () => {
    const captured = {};
    const sb = makeSupabase({ data: [], error: null }, captured);
    await selectUnactionedAdvisories(sb, null);
    expect(captured.eq).toContainEqual(['target_session', BROADCAST_COORDINATOR]);
    expect(captured.in).toBeUndefined();
  });
});

describe('FR-2: stampActioned JSONB-merges actioned_at (preserves existing keys)', () => {
  it('sets actioned_at while preserving correlation_id + kind', async () => {
    const captured = {};
    const sb = makeSupabase({ error: null }, captured);
    const { error } = await stampActioned(sb, { id: 'a1', payload: { kind: 'adam_advisory', correlation_id: 'c1' } }, '2026-06-09T00:00:00.000Z');
    expect(error).toBeNull();
    expect(captured.update.payload.actioned_at).toBe('2026-06-09T00:00:00.000Z');
    expect(captured.update.payload.correlation_id).toBe('c1'); // merge, not overwrite
    expect(captured.update.payload.kind).toBe('adam_advisory');
    expect(captured.eq).toContainEqual(['id', 'a1']);
  });
});

describe('FR-3: coordinator-reply parseArgs registers --advisory as a value flag', () => {
  it('captures --advisory <id> and leaves the body positional', () => {
    const { flags, positional } = replyParseArgs(['node', 'x', '--advisory', 'adv-1', 'hello', 'world']);
    expect(flags.advisory).toBe('adv-1');
    expect(positional).toEqual(['hello', 'world']);
  });

  it('still supports --to/--correlation form', () => {
    const { flags } = replyParseArgs(['node', 'x', '--to', 'sess-1', '--correlation', 'corr-1', 'body']);
    expect(flags.to).toBe('sess-1');
    expect(flags.correlation).toBe('corr-1');
  });
});

describe('FR-2: coordinator-ack-adam parseArgs', () => {
  it('captures --advisory + --reply body', () => {
    const { flags } = ackParseArgs(['node', 'x', '--advisory', 'adv-2', '--reply', 'ack body']);
    expect(flags.advisory).toBe('adv-2');
    expect(flags.reply).toBe('ack body');
  });

  it('ack-only (no --reply) leaves reply undefined', () => {
    const { flags } = ackParseArgs(['node', 'x', '--advisory', 'adv-3']);
    expect(flags.advisory).toBe('adv-3');
    expect(flags.reply).toBeUndefined();
  });
});

describe('FR-7: self-surfacing on startup (both sides)', () => {
  it('coordinator renderAdamLane lists the verbs + canonical doc', () => {
    const out = renderAdamLane();
    expect(out).toContain('ADAM ADVISORY LANE');
    expect(out).toContain('read-adam-advisories.cjs');
    expect(out).toContain('coordinator-ack-adam.cjs --advisory');
    expect(out).toContain('coordinator-reply.cjs --advisory');
    expect(out).toContain(ADAM_COMMS_DOC);
    expect(ADAM_COMMS_DOC).toBe('docs/protocol/coordinator-adam-comms.md');
  });

  it('buildReport includes the Adam lane summary', () => {
    expect(buildReport([], {})).toContain('ADAM ADVISORY LANE');
  });

  it('adam-register adamReplyMirror lists the consume-reply path', () => {
    const m = adamReplyMirror();
    expect(m).toContain('adam-advisory.cjs send');
    // SD-LEO-FIX-ADAM-INBOX-ALL-CLASSES-001: the mirror now points to the FULL-LANE `inbox` drain
    // (SD-LEO-FIX-ADAM-INBOX-FULL-LANE-001 repointed replies->inbox); this assertion was left stale.
    expect(m).toContain('adam-advisory.cjs inbox');
    expect(m).toContain('coordinator-adam-comms.md');
  });
});
