/**
 * SD-LEO-INFRA-COORDINATION-LANE-DELIVERY-CONTRACT-001 FR-1/FR-2 — session_coordination lane
 * delivery contract: SEND validation (staged off/observe/enforce) + canonical body read.
 *
 * No live DB calls — isEnabledFn / supabase are injected stubs throughout.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  resolveLaneContractMode,
  validateOnSend,
  formatWouldDenyLine,
  recordWouldDenyEvidence,
  readCanonicalBody,
  WOULD_DENY_EVENT_TYPE,
  BASE_FLAG,
  ENFORCE_FLAG,
  LANES,
  UNTRACKED_LANE,
  LANE_KIND_SETS,
  LANE_TTL_MS,
  DEAD_LETTER_TTL_MARKER_KEY,
  COMMS_LANE_TTLS_SD,
  resolveLaneForKind,
  resolveLaneTtlMs,
  isExpiredUnread,
  buildExpiredUnreadStampPatch,
} = require('../../../lib/coordination/lane-contract.cjs');
const { DIRECTIVE_KINDS, ADVISORY_KINDS } = require('../../../lib/fleet/worker-status.cjs');

describe('resolveLaneContractMode — staged off/observe/enforce ladder (FR-1)', () => {
  it('resolves off when the base flag is disabled', async () => {
    const isEnabledFn = vi.fn().mockResolvedValue(false);
    const mode = await resolveLaneContractMode({ isEnabledFn });
    expect(mode).toBe('off');
    expect(isEnabledFn).toHaveBeenCalledWith(BASE_FLAG);
  });

  it('resolves observe when base is on but enforce is off', async () => {
    const isEnabledFn = vi.fn((flag) => Promise.resolve(flag === BASE_FLAG));
    const mode = await resolveLaneContractMode({ isEnabledFn });
    expect(mode).toBe('observe');
  });

  it('resolves enforce when both flags are on', async () => {
    const isEnabledFn = vi.fn().mockResolvedValue(true);
    const mode = await resolveLaneContractMode({ isEnabledFn });
    expect(mode).toBe('enforce');
    expect(isEnabledFn).toHaveBeenCalledWith(ENFORCE_FLAG);
  });

  it('fail-soft: resolves off when the evaluator throws (a flag-infrastructure error must never change delivery behavior)', async () => {
    const isEnabledFn = vi.fn().mockRejectedValue(new Error('flag service down'));
    const mode = await resolveLaneContractMode({ isEnabledFn });
    expect(mode).toBe('off');
  });
});

describe('validateOnSend — off/observe/enforce verdicts (FR-1)', () => {
  const typedRow = { payload: { kind: 'adam_advisory' } };
  const untypedRow = { payload: {} };
  const noPayloadRow = {};

  it('off mode: always valid, zero checks performed (even on an untyped row)', () => {
    expect(validateOnSend(untypedRow, { mode: 'off' })).toEqual({ valid: true, mode: 'off' });
    expect(validateOnSend(undefined, { mode: 'off' })).toEqual({ valid: true, mode: 'off' });
  });

  it('observe mode: a typed row is valid with no would-deny', () => {
    expect(validateOnSend(typedRow, { mode: 'observe' })).toEqual({ valid: true, mode: 'observe' });
  });

  it('observe mode: an untyped row is NOT blocked (valid:true) but flags would_deny', () => {
    const v = validateOnSend(untypedRow, { mode: 'observe' });
    expect(v.valid).toBe(true);
    expect(v.would_deny).toBe(true);
    expect(v.reason).toBe('lane_contract_untyped_payload_kind');
  });

  it('observe mode: a row with no payload at all is also flagged (untyped) without blocking', () => {
    const v = validateOnSend(noPayloadRow, { mode: 'observe' });
    expect(v.valid).toBe(true);
    expect(v.would_deny).toBe(true);
  });

  it('enforce mode: a typed row is valid', () => {
    expect(validateOnSend(typedRow, { mode: 'enforce' })).toEqual({ valid: true, mode: 'enforce' });
  });

  it('enforce mode: an untyped row is REJECTED (the SAME row that observe mode let through)', () => {
    const v = validateOnSend(untypedRow, { mode: 'enforce' });
    expect(v.valid).toBe(false);
    expect(v.reason).toBe('lane_contract_untyped_payload_kind');
  });

  it('an empty-string kind is treated as untyped in both observe and enforce', () => {
    const row = { payload: { kind: '' } };
    expect(validateOnSend(row, { mode: 'observe' }).would_deny).toBe(true);
    expect(validateOnSend(row, { mode: 'enforce' }).valid).toBe(false);
  });
});

describe('formatWouldDenyLine', () => {
  it('names the row id and the reason', () => {
    const line = formatWouldDenyLine({ id: 'row-1' }, { reason: 'lane_contract_untyped_payload_kind' });
    expect(line).toContain('row-1');
    expect(line).toContain('lane_contract_untyped_payload_kind');
    expect(line).toContain('observe mode');
  });

  it('falls back to a pre-insert marker when the row has no id yet', () => {
    const line = formatWouldDenyLine({}, { reason: 'x' });
    expect(line).toContain('(pre-insert)');
  });
});

describe('recordWouldDenyEvidence — fail-soft durable observe-window evidence', () => {
  it('inserts a system_events row with the reason and row subject/target', async () => {
    const inserted = [];
    const supabase = { from: (table) => ({ insert: (row) => { inserted.push({ table, row }); return Promise.resolve({ error: null }); } }) };
    await recordWouldDenyEvidence(supabase, { subject: 'subj', target_session: 't1' }, { reason: 'lane_contract_untyped_payload_kind' });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].table).toBe('system_events');
    expect(inserted[0].row.event_type).toBe(WOULD_DENY_EVENT_TYPE);
    expect(inserted[0].row.payload).toEqual({ reason: 'lane_contract_untyped_payload_kind', row_subject: 'subj', target_session: 't1' });
  });

  it('never throws even if the insert fails (fail-soft — never blocks or alters the send)', async () => {
    const supabase = { from: () => ({ insert: () => Promise.reject(new Error('db down')) }) };
    await expect(recordWouldDenyEvidence(supabase, { subject: 'x' }, { reason: 'y' })).resolves.toBeUndefined();
  });
});

describe('readCanonicalBody — dual-read, payload.body primary / body-column fallback (FR-2)', () => {
  it('returns the correct text for a row with body only in payload.body', () => {
    expect(readCanonicalBody({ payload: { body: 'from payload' }, body: null })).toBe('from payload');
  });

  it('returns the correct text for a legacy row with body only in the body column (fallback path)', () => {
    expect(readCanonicalBody({ payload: {}, body: 'legacy column body' })).toBe('legacy column body');
  });

  it('prefers payload.body over the body column when both are present', () => {
    expect(readCanonicalBody({ payload: { body: 'canonical' }, body: 'legacy' })).toBe('canonical');
  });

  it('falls back to the body column when payload.body is an empty string', () => {
    expect(readCanonicalBody({ payload: { body: '' }, body: 'legacy fallback' })).toBe('legacy fallback');
  });

  it('returns "" (never null/undefined) when neither location has content', () => {
    expect(readCanonicalBody({ payload: {}, body: null })).toBe('');
    expect(readCanonicalBody({ payload: null, body: undefined })).toBe('');
    expect(readCanonicalBody(null)).toBe('');
    expect(readCanonicalBody(undefined)).toBe('');
  });

  it('ignores a non-string body column value', () => {
    expect(readCanonicalBody({ payload: {}, body: 12345 })).toBe('');
  });
});

describe('resolveLaneForKind — kind->lane mapping, SD-LEO-INFRA-COMMS-LANE-TTLS-001 FR-1', () => {
  it('CONTROL: the conceptual lane name is NOT itself a live payload.kind -- a naive identity mapping would wrongly resolve this to its own name', () => {
    // Ground truth (STORIES evidence 414186aa, fully-paged 6662-row census): zero live rows
    // carry payload.kind literally equal to "directive"/"advisory"/"reply"/"suggestion". If
    // resolveLaneForKind ever degenerated into `kind => LANES.includes(kind) ? kind : 'untracked'`
    // it would still pass an exhaustiveness check against LANES but be dead by construction
    // against the real table -- this assertion is what catches that regression.
    for (const lane of LANES) {
      expect(resolveLaneForKind(lane)).toBe(UNTRACKED_LANE);
    }
  });

  it('CONTROL: an unrecognized/garbage kind resolves to untracked, never throws or returns null/undefined (no silent drop)', () => {
    expect(resolveLaneForKind('totally_made_up_kind_xyz')).toBe(UNTRACKED_LANE);
    expect(resolveLaneForKind(null)).toBe(UNTRACKED_LANE);
    expect(resolveLaneForKind(undefined)).toBe(UNTRACKED_LANE);
    expect(resolveLaneForKind('')).toBe(UNTRACKED_LANE);
  });

  it('every DIRECTIVE_KINDS entry (lib/fleet/worker-status.cjs) maps to the directive lane', () => {
    expect(DIRECTIVE_KINDS.length).toBeGreaterThan(0);
    for (const kind of DIRECTIVE_KINDS) {
      expect(resolveLaneForKind(kind)).toBe('directive');
    }
  });

  it('every ADVISORY_KINDS entry (lib/fleet/worker-status.cjs -- terminal replies/acks) maps to the reply lane', () => {
    expect(ADVISORY_KINDS.length).toBeGreaterThan(0);
    for (const kind of ADVISORY_KINDS) {
      expect(resolveLaneForKind(kind)).toBe('reply');
    }
  });

  it('at least one real live kind maps to the advisory lane (adam_advisory)', () => {
    expect(resolveLaneForKind('adam_advisory')).toBe('advisory');
  });

  it('at least one real live kind maps to the suggestion lane (dispatch_suggestion, dispatch_override)', () => {
    expect(resolveLaneForKind('dispatch_suggestion')).toBe('suggestion');
    expect(resolveLaneForKind('dispatch_override')).toBe('suggestion');
  });

  it('high-volume informational kinds (roll_call, periodic_liveness_flag) are explicitly untracked, not silently dropped into a tracked lane', () => {
    expect(resolveLaneForKind('roll_call')).toBe(UNTRACKED_LANE);
    expect(resolveLaneForKind('periodic_liveness_flag')).toBe(UNTRACKED_LANE);
  });

  it('LANE_KIND_SETS has no overlap between lanes (every kind belongs to exactly one lane)', () => {
    const seen = new Map();
    for (const lane of LANES) {
      for (const kind of LANE_KIND_SETS[lane]) {
        expect(seen.has(kind)).toBe(false);
        seen.set(kind, lane);
      }
    }
  });
});

describe('LANE_TTL_MS / resolveLaneTtlMs — per-lane TTL registry, FR-1', () => {
  it('CONTROL: the 4 tracked lanes do NOT all share one TTL -- a naive single-constant registry (copy-pasting reply-class.cjs DEFAULT_REPLY_WINDOW_MS everywhere) would fail this', () => {
    const values = new Set(LANES.map((lane) => LANE_TTL_MS[lane]));
    expect(values.size).toBeGreaterThan(1);
  });

  it('every tracked lane has a positive, finite TTL', () => {
    for (const lane of LANES) {
      expect(Number.isFinite(LANE_TTL_MS[lane])).toBe(true);
      expect(LANE_TTL_MS[lane]).toBeGreaterThan(0);
    }
  });

  it('resolveLaneTtlMs(untracked) and any unrecognized lane resolve to null, not a fallback duration', () => {
    expect(resolveLaneTtlMs(UNTRACKED_LANE)).toBeNull();
    expect(resolveLaneTtlMs('not_a_real_lane')).toBeNull();
  });

  it('resolveLaneTtlMs matches LANE_TTL_MS for each tracked lane', () => {
    for (const lane of LANES) {
      expect(resolveLaneTtlMs(lane)).toBe(LANE_TTL_MS[lane]);
    }
  });
});

describe('isExpiredUnread — payload-only expired-unread predicate, FR-2', () => {
  const NOW = new Date('2026-08-23T12:00:00.000Z').getTime();
  const directiveTtl = LANE_TTL_MS.directive;

  it('CONTROL: two rows of the SAME lane and SAME age differ ONLY by read_at -- the read one must never be eligible while the unread one is (proves read_at actually gates the predicate, not just age)', () => {
    const bornAt = new Date(NOW - directiveTtl - 1000).toISOString();
    const unread = { payload: { kind: 'coordinator_directive' }, created_at: bornAt, read_at: null };
    const read = { payload: { kind: 'coordinator_directive' }, created_at: bornAt, read_at: new Date(NOW - 500).toISOString() };
    expect(isExpiredUnread(unread, { nowMs: NOW })).toBe(true);
    expect(isExpiredUnread(read, { nowMs: NOW })).toBe(false);
  });

  it('CONTROL: an untracked-lane row is NEVER eligible no matter how old (roll_call has no TTL to expire against)', () => {
    const ancient = { payload: { kind: 'roll_call' }, created_at: new Date(NOW - 365 * 24 * 60 * 60 * 1000).toISOString(), read_at: null };
    expect(isExpiredUnread(ancient, { nowMs: NOW })).toBe(false);
  });

  it('a directive-lane row unread past its TTL is eligible', () => {
    const row = { payload: { kind: 'work_assignment' }, created_at: new Date(NOW - directiveTtl - 1).toISOString(), read_at: null };
    expect(isExpiredUnread(row, { nowMs: NOW })).toBe(true);
  });

  it('a directive-lane row unread but still within its TTL is NOT eligible (boundary)', () => {
    const row = { payload: { kind: 'work_assignment' }, created_at: new Date(NOW - directiveTtl + 1).toISOString(), read_at: null };
    expect(isExpiredUnread(row, { nowMs: NOW })).toBe(false);
  });

  it('fail-closed: a missing or unparseable created_at is never eligible, same discipline as dead-letter-drain.js isPurgeEligible', () => {
    expect(isExpiredUnread({ payload: { kind: 'work_assignment' }, created_at: null, read_at: null }, { nowMs: NOW })).toBe(false);
    expect(isExpiredUnread({ payload: { kind: 'work_assignment' }, created_at: 'not-a-date', read_at: null }, { nowMs: NOW })).toBe(false);
  });
});

describe('buildExpiredUnreadStampPatch — FR-2 marker, payload-only', () => {
  it('CONTROL: the marker key is dead_letter_ttl -- explicitly NOT dead_letter_drained (dead-letter-drain.js FR-1d\'s own key, would collide) and NOT dead_letter_reason (the collision-prone literal the PRD originally proposed, corrected per STORIES evidence 414186aa)', () => {
    const patch = buildExpiredUnreadStampPatch({ payload: { kind: 'work_assignment' } }, { nowMs: Date.now() });
    expect(Object.prototype.hasOwnProperty.call(patch.payload, DEAD_LETTER_TTL_MARKER_KEY)).toBe(true);
    expect(patch.payload).not.toHaveProperty('dead_letter_drained');
    expect(patch.payload).not.toHaveProperty('dead_letter_reason');
    expect(DEAD_LETTER_TTL_MARKER_KEY).toBe('dead_letter_ttl');
  });

  it('preserves existing payload fields alongside the new marker', () => {
    const patch = buildExpiredUnreadStampPatch({ payload: { kind: 'work_assignment', subject: 'keep-me' } }, { nowMs: Date.now() });
    expect(patch.payload.subject).toBe('keep-me');
    expect(patch.payload.kind).toBe('work_assignment');
  });

  it('the marker records lane, ttl_ms, an ISO timestamp, and this SD\'s key', () => {
    const nowMs = new Date('2026-08-23T00:00:00.000Z').getTime();
    const patch = buildExpiredUnreadStampPatch({ payload: { kind: 'work_assignment' } }, { nowMs });
    const marker = patch.payload.dead_letter_ttl;
    expect(marker.lane).toBe('directive');
    expect(marker.ttl_ms).toBe(LANE_TTL_MS.directive);
    expect(marker.at).toBe('2026-08-23T00:00:00.000Z');
    expect(marker.sd).toBe(COMMS_LANE_TTLS_SD);
  });

  it('an untracked-lane row gets a marker with ttl_ms:null (not silently omitted, not a fallback duration)', () => {
    const patch = buildExpiredUnreadStampPatch({ payload: { kind: 'roll_call' } }, { nowMs: Date.now() });
    expect(patch.payload.dead_letter_ttl.lane).toBe(UNTRACKED_LANE);
    expect(patch.payload.dead_letter_ttl.ttl_ms).toBeNull();
  });
});
