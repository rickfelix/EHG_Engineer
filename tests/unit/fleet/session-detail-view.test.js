// SD-LEO-INFRA-SESSION-VIEW-BROWSER-001-B — pure session detail view-model + attach-state mapping.
import { describe, it, expect } from 'vitest';
import { buildSessionDetailView, mapAttachState } from '../../../lib/fleet/session-detail-view.js';

describe('mapAttachState (FR-2)', () => {
  it('maps a successful attach to not-degraded', () => {
    expect(mapAttachState({ ok: true, reason: null, session_id: 'x' })).toEqual({
      ok: true, reason: null, degraded: false, message: null,
    });
  });

  it('maps each real attach() failure reason to a distinct degraded message', () => {
    const reasons = ['no_key', 'not_found', 'ambiguous', 'no_captured_handle', 'stale_handle'];
    const messages = new Set();
    for (const reason of reasons) {
      const mapped = mapAttachState({ ok: false, reason, session_id: 'x' });
      expect(mapped.ok).toBe(false);
      expect(mapped.reason).toBe(reason);
      expect(mapped.degraded).toBe(true);
      expect(typeof mapped.message).toBe('string');
      expect(mapped.message.length).toBeGreaterThan(0);
      messages.add(mapped.message);
    }
    expect(messages.size).toBe(reasons.length); // every reason gets a DISTINCT message
  });

  it('"not yet attempted" (undefined/null) is distinct from a genuine failure', () => {
    expect(mapAttachState(undefined)).toEqual({ ok: null, reason: null, degraded: false, message: null });
    expect(mapAttachState(null)).toEqual({ ok: null, reason: null, degraded: false, message: null });
  });

  it('an unrecognized reason string degrades safely with a fallback message, never throws', () => {
    const mapped = mapAttachState({ ok: false, reason: 'some_future_unknown_reason' });
    expect(mapped.degraded).toBe(true);
    expect(mapped.reason).toBe('some_future_unknown_reason');
    expect(typeof mapped.message).toBe('string');
  });

  it('prototype-chain reason names never leak a non-string message (own-property lookup only)', () => {
    for (const reason of ['toString', 'constructor', '__proto__', 'valueOf', 'hasOwnProperty']) {
      const mapped = mapAttachState({ ok: false, reason });
      expect(typeof mapped.message).toBe('string');
      expect(mapped.degraded).toBe(true);
    }
  });

  it('a malformed/empty attachResult object does not throw', () => {
    expect(() => mapAttachState({})).not.toThrow();
    const mapped = mapAttachState({});
    expect(mapped.degraded).toBe(true);
    expect(typeof mapped.message).toBe('string');
  });
});

describe('buildSessionDetailView (FR-1, FR-3, FR-4)', () => {
  it('maps lastTool/lastToolAt/lastActivityKind/silentUntil 1:1 from raw session fields', () => {
    const session = {
      current_tool: 'Read',
      last_tool_at: '2026-07-20T00:00:00Z',
      last_activity_kind: 'idle',
      expected_silence_until: '2026-07-20T01:00:00Z',
    };
    const view = buildSessionDetailView(session);
    expect(view.lastTool).toBe('Read');
    expect(view.lastToolAt).toBe('2026-07-20T00:00:00Z');
    expect(view.lastActivityKind).toBe('idle');
    expect(view.silentUntil).toBe('2026-07-20T01:00:00Z');
  });

  it('ctxPercent resolves from ctxRow.usage_percent when present', () => {
    const view = buildSessionDetailView({}, { ctxRow: { usage_percent: 42 } });
    expect(view.ctxPercent).toBe(42);
  });

  it('ctxPercent is null-safe when ctxRow is absent, null, or missing the field', () => {
    expect(buildSessionDetailView({}).ctxPercent).toBeNull();
    expect(buildSessionDetailView({}, { ctxRow: null }).ctxPercent).toBeNull();
    expect(buildSessionDetailView({}, { ctxRow: {} }).ctxPercent).toBeNull();
  });

  it('ctxPercent rejects NaN and clamps out-of-range values into [0,100]', () => {
    expect(buildSessionDetailView({}, { ctxRow: { usage_percent: NaN } }).ctxPercent).toBeNull();
    expect(buildSessionDetailView({}, { ctxRow: { usage_percent: -5 } }).ctxPercent).toBe(0);
    expect(buildSessionDetailView({}, { ctxRow: { usage_percent: 150 } }).ctxPercent).toBe(100);
  });

  it('a null session is treated the same as {} (no throw, full shape)', () => {
    expect(() => buildSessionDetailView(null)).not.toThrow();
    expect(buildSessionDetailView(null).ctxPercent).toBeNull();
  });

  it('opts is optional — a session-only call never throws and attachState is the "not attempted" shape', () => {
    const session = { current_tool: 'Bash', last_tool_at: 't', last_activity_kind: 'active', expected_silence_until: null };
    expect(() => buildSessionDetailView(session)).not.toThrow();
    const view = buildSessionDetailView(session);
    expect(view.attachState).toEqual(mapAttachState(undefined));
  });

  it('full view-model shape (all 6 top-level keys) is always present, even for {}', () => {
    const view = buildSessionDetailView({});
    expect(Object.keys(view).sort()).toEqual(
      ['attachState', 'ctxPercent', 'lastActivityKind', 'lastTool', 'lastToolAt', 'silentUntil'].sort()
    );
  });

  it('composes attachResult through into attachState', () => {
    const view = buildSessionDetailView({}, { attachResult: { ok: false, reason: 'stale_handle' } });
    expect(view.attachState.degraded).toBe(true);
    expect(view.attachState.reason).toBe('stale_handle');
  });
});
