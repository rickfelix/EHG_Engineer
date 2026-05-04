// Tests for SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 / FR-3b
// lib/coordinator/signal-router.cjs — fingerprint, aggregation, threshold + critical bypass, idempotency

import { describe, it, expect, vi } from 'vitest';
import {
  normalize,
  fingerprint,
  severityRank,
  shouldPromote,
  groupByFingerprint,
  aggregateSignals,
  THRESHOLD,
  WINDOW_MIN
} from './signal-router.cjs';

describe('SR-1: normalize lowercases + trims', () => {
  it('canonicalizes basic strings', () => {
    expect(normalize('  Gate Failure  ')).toBe('gate failure');
  });
});

describe('SR-2: normalize strips control characters', () => {
  it('removes control chars and DEL', () => {
    expect(normalize('hello\x00world\x1Fagain\x7F')).toBe('hello world again');
  });
});

describe('SR-3: normalize strips zero-width unicode', () => {
  it('removes ZWSP, ZWNJ, ZWJ, BOM', () => {
    expect(normalize('a​b‌c‍d﻿e')).toBe('abcde');
  });
});

describe('SR-4: normalize collapses whitespace', () => {
  it('runs of whitespace become single space', () => {
    expect(normalize('a\t\n\r b\n\nc')).toBe('a b c');
  });
});

describe('SR-5: normalize NFKC compatibility', () => {
  it('canonicalizes compat decomposable chars', () => {
    // ﬁ (U+FB01) → fi
    expect(normalize('ﬁx')).toBe('fix');
  });
});

describe('SR-6: normalize truncates to 200 chars', () => {
  it('limits long input', () => {
    const long = 'a'.repeat(500);
    expect(normalize(long).length).toBe(200);
  });
});

describe('SR-7: normalize handles non-string', () => {
  it('returns empty string for null/undefined/numbers', () => {
    expect(normalize(null)).toBe('');
    expect(normalize(undefined)).toBe('');
    expect(normalize(42)).toBe('');
  });
});

describe('SR-8: fingerprint is deterministic', () => {
  it('same input produces same hash', () => {
    expect(fingerprint('stuck', 'gate failure')).toBe(fingerprint('stuck', 'gate failure'));
  });
});

describe('SR-9: fingerprint differs by signal_type', () => {
  it('different types differ', () => {
    expect(fingerprint('stuck', 'x')).not.toBe(fingerprint('gate-bug', 'x'));
  });
});

describe('SR-10: fingerprint robust to whitespace/case variation', () => {
  it('two equivalent bodies fingerprint identically', () => {
    expect(fingerprint('stuck', 'Gate failure!')).toBe(fingerprint('stuck', '  GATE FAILURE  '));
  });
});

describe('SR-11: severityRank ordering', () => {
  it('critical > high > medium > low', () => {
    expect(severityRank('critical')).toBeGreaterThan(severityRank('high'));
    expect(severityRank('high')).toBeGreaterThan(severityRank('medium'));
    expect(severityRank('medium')).toBeGreaterThan(severityRank('low'));
  });
});

describe('SR-12: shouldPromote ≥3 distinct callsigns', () => {
  it('promotes at threshold', () => {
    const g = { callsigns: new Set(['Alpha', 'Bravo', 'Charlie']), max_severity: 'medium' };
    expect(shouldPromote(g)).toBe(true);
  });
  it('does not promote below threshold', () => {
    const g = { callsigns: new Set(['Alpha', 'Bravo']), max_severity: 'medium' };
    expect(shouldPromote(g)).toBe(false);
  });
});

describe('SR-13: shouldPromote critical bypasses count', () => {
  it('single critical triggers promotion', () => {
    const g = { callsigns: new Set(['Alpha']), max_severity: 'critical' };
    expect(shouldPromote(g)).toBe(true);
  });
});

describe('SR-14: groupByFingerprint deduplicates by callsign', () => {
  it('same callsign repeated does not increase count', () => {
    const rows = [
      { id: 'r1', sender_session: 's1', body: 'gate fail', payload: { signal_type: 'stuck', sender_callsign: 'Alpha', severity: 'medium' }, created_at: '2026-05-04T00:00:00Z' },
      { id: 'r2', sender_session: 's1', body: 'gate fail', payload: { signal_type: 'stuck', sender_callsign: 'Alpha', severity: 'medium' }, created_at: '2026-05-04T00:01:00Z' }
    ];
    const groups = groupByFingerprint(rows);
    const group = Array.from(groups.values())[0];
    expect(group.callsigns.size).toBe(1);
    expect(group.rows.length).toBe(2);
  });
});

describe('SR-15: groupByFingerprint tracks max_severity', () => {
  it('uses highest severity in group', () => {
    const rows = [
      { id: 'r1', sender_session: 's1', body: 'x', payload: { signal_type: 'stuck', sender_callsign: 'A', severity: 'low' }, created_at: '2026-05-04T00:00:00Z' },
      { id: 'r2', sender_session: 's2', body: 'x', payload: { signal_type: 'stuck', sender_callsign: 'B', severity: 'critical' }, created_at: '2026-05-04T00:01:00Z' }
    ];
    const group = Array.from(groupByFingerprint(rows).values())[0];
    expect(group.max_severity).toBe('critical');
  });
});

describe('SR-16: aggregateSignals end-to-end with mocked supabase — promotes ≥3 distinct callsigns', () => {
  it('inserts feedback row and stamps payload.routed_to_feedback_id', async () => {
    const insertedFeedback = { id: 'fb-001' };
    const updatePayloads = [];

    const sb = {
      from: (table) => {
        if (table === 'session_coordination') {
          return {
            select: () => ({
              gte: () => ({
                not: () => Promise.resolve({
                  data: [
                    { id: 'r1', sender_session: 's1', body: 'gate stuck', payload: { signal_type: 'stuck', sender_callsign: 'A', severity: 'medium' }, created_at: '2026-05-04T00:00:00Z' },
                    { id: 'r2', sender_session: 's2', body: 'gate stuck', payload: { signal_type: 'stuck', sender_callsign: 'B', severity: 'medium' }, created_at: '2026-05-04T00:01:00Z' },
                    { id: 'r3', sender_session: 's3', body: 'gate stuck', payload: { signal_type: 'stuck', sender_callsign: 'C', severity: 'medium' }, created_at: '2026-05-04T00:02:00Z' }
                  ],
                  error: null
                })
              })
            }),
            update: (payload) => {
              updatePayloads.push(payload);
              return { eq: () => Promise.resolve({ data: null, error: null }) };
            }
          };
        }
        if (table === 'feedback') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: null, error: null })
                })
              })
            }),
            insert: () => ({
              select: () => ({
                single: () => Promise.resolve({ data: insertedFeedback, error: null })
              })
            })
          };
        }
        return {};
      }
    };

    const result = await aggregateSignals(sb);
    expect(result.promoted).toBe(1);
    expect(result.skipped).toBe(0);
    expect(updatePayloads.length).toBe(3);
    for (const u of updatePayloads) {
      expect(u.payload.routed_to_feedback_id).toBe('fb-001');
      expect(u.acknowledged_at).toBeTruthy();
    }
  });
});

describe('SR-17: aggregateSignals respects existing feedback row (idempotency)', () => {
  it('does not re-insert when fingerprint already exists', async () => {
    let insertCalled = false;
    const sb = {
      from: (table) => {
        if (table === 'session_coordination') {
          return {
            select: () => ({
              gte: () => ({
                not: () => Promise.resolve({
                  data: [
                    { id: 'r1', sender_session: 's1', body: 'x', payload: { signal_type: 'stuck', sender_callsign: 'A', severity: 'medium' }, created_at: '2026-05-04T00:00:00Z' },
                    { id: 'r2', sender_session: 's2', body: 'x', payload: { signal_type: 'stuck', sender_callsign: 'B', severity: 'medium' }, created_at: '2026-05-04T00:01:00Z' },
                    { id: 'r3', sender_session: 's3', body: 'x', payload: { signal_type: 'stuck', sender_callsign: 'C', severity: 'medium' }, created_at: '2026-05-04T00:02:00Z' }
                  ],
                  error: null
                })
              })
            }),
            update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) })
          };
        }
        if (table === 'feedback') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: { id: 'existing-fb' }, error: null })
                })
              })
            }),
            insert: () => { insertCalled = true; return { select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }; }
          };
        }
        return {};
      }
    };

    const result = await aggregateSignals(sb);
    expect(result.promoted).toBe(0);
    expect(result.skipped).toBe(1);
    expect(insertCalled).toBe(false);
  });
});

describe('SR-18: aggregateSignals does not promote groups below threshold (no critical)', () => {
  it('2 distinct callsigns, no critical → skipped', async () => {
    let insertCalled = false;
    const sb = {
      from: (table) => {
        if (table === 'session_coordination') {
          return {
            select: () => ({
              gte: () => ({
                not: () => Promise.resolve({
                  data: [
                    { id: 'r1', sender_session: 's1', body: 'y', payload: { signal_type: 'stuck', sender_callsign: 'A', severity: 'medium' }, created_at: '2026-05-04T00:00:00Z' },
                    { id: 'r2', sender_session: 's2', body: 'y', payload: { signal_type: 'stuck', sender_callsign: 'B', severity: 'medium' }, created_at: '2026-05-04T00:01:00Z' }
                  ],
                  error: null
                })
              })
            }),
            update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) })
          };
        }
        if (table === 'feedback') {
          return { insert: () => { insertCalled = true; return {}; } };
        }
        return {};
      }
    };

    const result = await aggregateSignals(sb);
    expect(result.promoted).toBe(0);
    expect(result.skipped).toBe(1);
    expect(insertCalled).toBe(false);
  });
});

describe('SR-19: WINDOW_MIN + THRESHOLD constants documented', () => {
  it('are 60 min and 3 callsigns', () => {
    expect(WINDOW_MIN).toBe(60);
    expect(THRESHOLD).toBe(3);
  });
});
