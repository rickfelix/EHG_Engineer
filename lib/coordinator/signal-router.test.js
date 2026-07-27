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
                // FR-6 (count-truncation discipline): loadRecentSignals paginates via
                // fetchAllPaginated, so the chain ends .order(...).range(from, to).
                not: () => {
                  const rows = [
                    { id: 'r1', sender_session: 's1', body: 'gate stuck', payload: { signal_type: 'stuck', sender_callsign: 'A', severity: 'medium' }, created_at: '2026-05-04T00:00:00Z' },
                    { id: 'r2', sender_session: 's2', body: 'gate stuck', payload: { signal_type: 'stuck', sender_callsign: 'B', severity: 'medium' }, created_at: '2026-05-04T00:01:00Z' },
                    { id: 'r3', sender_session: 's3', body: 'gate stuck', payload: { signal_type: 'stuck', sender_callsign: 'C', severity: 'medium' }, created_at: '2026-05-04T00:02:00Z' }
                  ];
                  const page = { order: () => page, range: (f, t) => Promise.resolve({ data: rows.slice(f, t + 1), error: null }) };
                  return page;
                }
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
                // FR-6: paginated chain (see SR-16 note).
                not: () => {
                  const rows = [
                    { id: 'r1', sender_session: 's1', body: 'x', payload: { signal_type: 'stuck', sender_callsign: 'A', severity: 'medium' }, created_at: '2026-05-04T00:00:00Z' },
                    { id: 'r2', sender_session: 's2', body: 'x', payload: { signal_type: 'stuck', sender_callsign: 'B', severity: 'medium' }, created_at: '2026-05-04T00:01:00Z' },
                    { id: 'r3', sender_session: 's3', body: 'x', payload: { signal_type: 'stuck', sender_callsign: 'C', severity: 'medium' }, created_at: '2026-05-04T00:02:00Z' }
                  ];
                  const page = { order: () => page, range: (f, t) => Promise.resolve({ data: rows.slice(f, t + 1), error: null }) };
                  return page;
                }
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
                // FR-6: paginated chain (see SR-16 note).
                not: () => {
                  const rows = [
                    { id: 'r1', sender_session: 's1', body: 'y', payload: { signal_type: 'stuck', sender_callsign: 'A', severity: 'medium' }, created_at: '2026-05-04T00:00:00Z' },
                    { id: 'r2', sender_session: 's2', body: 'y', payload: { signal_type: 'stuck', sender_callsign: 'B', severity: 'medium' }, created_at: '2026-05-04T00:01:00Z' }
                  ];
                  const page = { order: () => page, range: (f, t) => Promise.resolve({ data: rows.slice(f, t + 1), error: null }) };
                  return page;
                }
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

describe('META-2: promoted feedback row metadata.severity is highest in group; contributing_callsigns is deduped (QF-20260504-964 FIX 3)', () => {
  it('inserts feedback with metadata.severity=critical and metadata.contributing_callsigns deduped', async () => {
    let insertPayload = null;

    const sb = {
      from: (table) => {
        if (table === 'session_coordination') {
          return {
            select: () => ({
              gte: () => ({
                // FR-6: paginated chain (see SR-16 note).
                not: () => {
                  const rows = [
                    { id: 'r1', sender_session: 's1', body: 'pipeline dead', payload: { signal_type: 'stuck', sender_callsign: 'Alpha', severity: 'medium' }, created_at: '2026-05-04T00:00:00Z' },
                    { id: 'r2', sender_session: 's2', body: 'pipeline dead', payload: { signal_type: 'stuck', sender_callsign: 'Bravo', severity: 'high' }, created_at: '2026-05-04T00:01:00Z' },
                    { id: 'r3', sender_session: 's3', body: 'pipeline dead', payload: { signal_type: 'stuck', sender_callsign: 'Bravo', severity: 'critical' }, created_at: '2026-05-04T00:02:00Z' }
                  ];
                  const page = { order: () => page, range: (f, t) => Promise.resolve({ data: rows.slice(f, t + 1), error: null }) };
                  return page;
                }
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
                  maybeSingle: () => Promise.resolve({ data: null, error: null })
                })
              })
            }),
            insert: (payload) => {
              insertPayload = payload;
              return {
                select: () => ({
                  single: () => Promise.resolve({ data: { id: 'fb-meta-2' }, error: null })
                })
              };
            }
          };
        }
        return {};
      }
    };

    const result = await aggregateSignals(sb);
    expect(result.promoted).toBe(1);
    expect(insertPayload).toBeTruthy();
    expect(insertPayload.metadata.severity).toBe('critical');
    expect(insertPayload.metadata.contributing_callsigns).toBeInstanceOf(Array);
    expect(insertPayload.metadata.contributing_callsigns.sort()).toEqual(['Alpha', 'Bravo']);
  });
});

describe('SR-19: WINDOW_MIN + THRESHOLD constants documented', () => {
  it('are 60 min and 3 callsigns', () => {
    expect(WINDOW_MIN).toBe(60);
    expect(THRESHOLD).toBe(3);
  });
});

// ── SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-A ───────────────────────────────────
// TS-1..TS-10. The promoter used to carry 611 of a 3145-char CRITICAL correction, cut
// mid-word, with no link back to the source row (QF-20260726-425). These pin the two
// halves of the fix — carry the full body, AND link the source signals — plus the
// group isolation that stops the new cap from becoming a worse failure than the bug.

/** Shared mocked-supabase builder; same chain shape as SR-16/SR-17/META-2 above. */
function makeRouterMock({ rows, existingFeedback = null, onInsert = null, insertImpl = null, onSessionUpdate = null }) {
  return {
    from: (table) => {
      if (table === 'session_coordination') {
        return {
          select: () => ({
            gte: () => ({
              not: () => {
                const page = { order: () => page, range: (f, t) => Promise.resolve({ data: rows.slice(f, t + 1), error: null }) };
                return page;
              }
            })
          }),
          update: (payload) => {
            if (onSessionUpdate) onSessionUpdate(payload);
            return { eq: () => Promise.resolve({ data: null, error: null }) };
          }
        };
      }
      if (table === 'feedback') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: existingFeedback, error: null }) }) }) }),
          insert: (payload) => {
            if (onInsert) onInsert(payload);
            if (insertImpl) return insertImpl(payload);
            return { select: () => ({ single: () => Promise.resolve({ data: { id: 'fb-new' }, error: null }) }) };
          }
        };
      }
      return {};
    }
  };
}

/** Three rows, three distinct callsigns (over THRESHOLD), all sharing one body. */
function rowsFor(body, idPrefix = 'r') {
  return ['Alpha', 'Bravo', 'Charlie'].map((cs, i) => ({
    id: `${idPrefix}${i + 1}`,
    sender_session: `s${i + 1}`,
    body,
    payload: { signal_type: 'harness-bug', sender_callsign: cs, severity: 'medium' },
    created_at: `2026-07-27T00:0${i}:00Z`
  }));
}

describe('TS-1: a 3000+ char body is persisted in FULL — no 500-char cut, no mid-word truncation', () => {
  it('description carries the whole body through to its final token', async () => {
    const LONG = 'The correction begins here. ' + 'recoverable words '.repeat(180) + 'FINAL-TOKEN-AT-THE-VERY-END';
    expect(LONG.length).toBeGreaterThan(3000);

    let insertPayload = null;
    const result = await aggregateSignals(makeRouterMock({
      rows: rowsFor(LONG),
      onInsert: (p) => { insertPayload = p; }
    }));

    expect(result.promoted).toBe(1);
    // Containment, not length equality: the description wraps the body in a fixed template
    // prefix, so its total length legitimately exceeds the raw body length.
    expect(insertPayload.description).toContain(LONG);
    expect(insertPayload.description.endsWith('FINAL-TOKEN-AT-THE-VERY-END')).toBe(true);
    // The specific regression: the old code emitted exactly 500 chars after "Sample body: ".
    const carried = insertPayload.description.split('Sample body: ')[1];
    expect(carried.length).toBe(LONG.length);
    expect(carried.length).toBeGreaterThan(500);
  });
});

describe('TS-9: the title is no longer silently cut at 120 characters', () => {
  it('keeps the whole first line and never ends mid-token', async () => {
    const firstLine = 'This first line is deliberately far longer than one hundred and twenty characters so the old slice would have severed it mid-word right about here';
    expect(firstLine.length).toBeGreaterThan(120);
    const body = `${firstLine}\nSecond line with the remaining detail.`;

    let insertPayload = null;
    const result = await aggregateSignals(makeRouterMock({
      rows: rowsFor(body),
      onInsert: (p) => { insertPayload = p; }
    }));

    expect(result.promoted).toBe(1);
    expect(insertPayload.title).toBe(firstLine);
    expect(insertPayload.title.length).toBeGreaterThan(120);
    // Never a mid-token cut: the title ends on the same word the source line ends on.
    expect(firstLine.endsWith(insertPayload.title.split(' ').pop())).toBe(true);
  });
});

describe('TS-2: metadata carries the contributing session_coordination row ids (the FORWARD link)', () => {
  it('records every contributing row id, not just the fingerprint sample', async () => {
    let insertPayload = null;
    const result = await aggregateSignals(makeRouterMock({
      rows: rowsFor('a body worth recovering'),
      onInsert: (p) => { insertPayload = p; }
    }));

    expect(result.promoted).toBe(1);
    expect(insertPayload.metadata.contributing_signal_ids).toBeInstanceOf(Array);
    expect(insertPayload.metadata.contributing_signal_ids).toEqual(['r1', 'r2', 'r3']);
    // One entry per contributing row — same set stampRouted iterates.
    expect(insertPayload.metadata.contributing_signal_ids.length).toBe(insertPayload.metadata.signal_count);
  });
});

describe('TS-3: a reader holding ONLY the promoted row recovers the full body in one forward query', () => {
  it('resolves the source rows from metadata alone, never touching routed_to_feedback_id', async () => {
    const LONG = 'Recoverable correction body. ' + 'detail '.repeat(500) + 'TAIL-MARKER';
    const sourceRows = rowsFor(LONG);

    let insertPayload = null;
    await aggregateSignals(makeRouterMock({ rows: sourceRows, onInsert: (p) => { insertPayload = p; } }));

    // The forward walk EXACTLY as a reader performs it — issued as a QUERY, not as an
    // in-memory filter of the same array the ids came from. Filtering that array would be
    // tautologically true by construction and would prove nothing about "recoverable in ONE
    // query", which is the actual claim in AC-3.
    const ids = insertPayload.metadata.contributing_signal_ids;
    let queryCount = 0, queriedTable = null, queriedColumn = null;
    const readerDb = {
      from: (table) => {
        queriedTable = table;
        return {
          select: () => ({
            in: (col, vals) => {
              queryCount++;
              queriedColumn = col;
              return Promise.resolve({ data: sourceRows.filter(r => vals.includes(r.id)).map(r => ({ body: r.body })), error: null });
            }
          })
        };
      }
    };
    const { data: recovered } = await readerDb.from('session_coordination').select('body').in('id', ids);

    expect(queryCount).toBe(1);                       // ONE query — the AC-3 claim
    expect(queriedTable).toBe('session_coordination');
    expect(queriedColumn).toBe('id');                 // ids are usable directly as the PK selector
    expect(recovered.length).toBe(3);
    expect(recovered[0].body).toBe(LONG);
    expect(recovered[0].body.endsWith('TAIL-MARKER')).toBe(true);
    // The walk consumed ONLY metadata-derived ids: these rows carry no reverse link at all,
    // so it cannot have leaned on payload.routed_to_feedback_id.
    expect(sourceRows.every(r => !r.payload.routed_to_feedback_id)).toBe(true);
  });
});

describe('TS-4: regression — a normal short signal promotes byte-identically', () => {
  it('short bodies produce the unchanged description template', async () => {
    const SHORT = 'gate failed twice in a row';
    let insertPayload = null;
    const result = await aggregateSignals(makeRouterMock({
      rows: rowsFor(SHORT),
      onInsert: (p) => { insertPayload = p; }
    }));

    expect(result.promoted).toBe(1);
    expect(result.skipped).toBe(0);
    expect(insertPayload.description).toBe(
      'Worker signal aggregation (3 contributing callsign(s), severity medium). Signal type: harness-bug. Sample body: gate failed twice in a row'
    );
    expect(insertPayload.title).toBe(SHORT);
  });
});

describe('TS-6: an over-cap body returns the error tuple instead of throwing', () => {
  it('skips the group, never inserts, and does not propagate an exception', async () => {
    const OVER_CAP = 'x'.repeat(5000); // > BODY_HARD_CAP (4096)
    let insertCalled = false;

    const result = await aggregateSignals(makeRouterMock({
      rows: rowsFor(OVER_CAP),
      onInsert: () => { insertCalled = true; }
    }));

    // aggregateSignals resolves normally — the throw never escapes insertFeedbackRow.
    expect(result.error).toBe(null);
    expect(result.promoted).toBe(0);
    expect(result.skipped).toBe(1);
    expect(insertCalled).toBe(false);
  });
});

describe('TS-5: head-of-line isolation — one failing group cannot starve its siblings', () => {
  it('the second group still promotes in the same tick when the first throws', async () => {
    // Two distinct bodies => two fingerprint groups. The first one's insert throws for real
    // (an over-cap body would NOT do this any more — it returns the safe tuple, TS-6).
    const rows = [...rowsFor('GROUP-ONE body that explodes', 'a'), ...rowsFor('GROUP-TWO body that succeeds', 'b')];
    const inserted = [];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await aggregateSignals(makeRouterMock({
      rows,
      insertImpl: (payload) => {
        if (payload.description.includes('GROUP-ONE')) throw new Error('supabase exploded');
        inserted.push(payload);
        return { select: () => ({ single: () => Promise.resolve({ data: { id: 'fb-two' }, error: null }) }) };
      }
    }));

    expect(result.error).toBe(null);
    expect(result.promoted).toBe(1);          // group two survived
    expect(result.skipped).toBe(1);           // group one was skipped, not fatal
    expect(inserted.length).toBe(1);
    expect(inserted[0].description).toContain('GROUP-TWO');

    // FR-4's other half: the failure must be NAMED, not swallowed. A skipped group was
    // previously indistinguishable from a below-threshold one.
    const logged = warnSpy.mock.calls.map(c => c.map(String).join(' ')).join('\n');
    expect(logged).toMatch(/group FAILED fingerprint=[a-f0-9]{8,}/);
    expect(logged).toContain('supabase exploded');
    // ...but it must NOT echo body content: sweep logs land in CI output.
    expect(logged).not.toContain('GROUP-ONE body');
    warnSpy.mockRestore();
  });
});

describe('TS-10: body-cap is genuinely SHARED — one policy, one direction of dependency', () => {
  it('exports the cap surface, is re-exported (not duplicated) by worker-signal, and lib never requires scripts/', async () => {
    // BOTH via the same CJS registry. Importing a .cjs through vitest's ESM interop yields a
    // SEPARATE instance from the one worker-signal.cjs gets via require(), so a reference
    // comparison across that boundary would fail on identity alone and prove nothing.
    const { createRequire } = await import('module');
    const { fileURLToPath } = await import('url');
    const req = createRequire(import.meta.url);
    const bodyCap = req('../shared/body-cap.cjs');
    const workerSignal = req('../../scripts/worker-signal.cjs');

    // FR-1 AC-1: the shared module owns the policy.
    expect(typeof bodyCap.capBody).toBe('function');
    expect(typeof bodyCap.redact).toBe('function');
    expect(typeof bodyCap.capBodySafe).toBe('function');
    expect(bodyCap.BODY_HARD_CAP).toBe(4096);
    expect(bodyCap.REDACTION_PATTERNS).toBeInstanceOf(Array);

    // FR-1 AC-2: SAME function reference — proves a re-export, not a second copy that could drift.
    expect(workerSignal.capBody).toBe(bodyCap.capBody);
    expect(workerSignal.redact).toBe(bodyCap.redact);
    expect(workerSignal.BODY_HARD_CAP).toBe(bodyCap.BODY_HARD_CAP);

    // The outbound contract still throws (the inbound hop adapts it; it does not change it).
    expect(() => bodyCap.capBody('y'.repeat(5000))).toThrow(/exceeds 4096-char hard cap/);
    expect(bodyCap.capBodySafe('y'.repeat(5000)).error?.code).toBe('BODY_TOO_LONG');
    expect(bodyCap.capBodySafe('short').error).toBe(null);

    // FR-1 AC-4: dependency direction — lib/ must never reach into scripts/.
    const { readFileSync } = await import('fs');
    const src = readFileSync(fileURLToPath(new URL('./signal-router.cjs', import.meta.url)), 'utf8');
    expect(src).not.toMatch(/require\(['"][^'"]*scripts\//);

    // MOVED, not copied: worker-signal.cjs must consume the shared module and no longer carry
    // its own definitions, so the two hops cannot drift back apart.
    const wsSrc = readFileSync(fileURLToPath(new URL('../../scripts/worker-signal.cjs', import.meta.url)), 'utf8');
    expect(wsSrc).toMatch(/require\(['"]\.\.\/lib\/shared\/body-cap\.cjs['"]\)/);
    expect(wsSrc).not.toMatch(/^function capBody\(/m);
    expect(wsSrc).not.toMatch(/^function redact\(/m);
    expect(wsSrc).not.toMatch(/^const REDACTION_PATTERNS =/m);
  });
});

describe('TS-11: redaction is load-bearing now that the FULL body is persisted', () => {
  it('restores the mandated credential-keyword coverage without disturbing the specific labels', async () => {
    const { createRequire } = await import('module');
    const { redact } = createRequire(import.meta.url)('../shared/body-cap.cjs');

    // The half that silently went missing (original SECURITY review evidence c8611924
    // mandated password|passwd|secret|token|api[_-]?key; only `password` shipped).
    expect(redact('passwd=hunter2')).toContain('[REDACTED:CREDENTIAL]');
    expect(redact('pwd: hunter2')).toContain('[REDACTED:CREDENTIAL]');
    expect(redact('secret=s3cr3tvalue')).toContain('[REDACTED:CREDENTIAL]');
    expect(redact('api_key=abcdef1234567890')).toContain('[REDACTED:CREDENTIAL]');
    expect(redact('apikey: abcdef1234567890')).toContain('[REDACTED:CREDENTIAL]');
    expect(redact('token=opaque-not-a-jwt-value')).toContain('[REDACTED:CREDENTIAL]');
    // The raw secret must be gone, not merely labelled alongside.
    expect(redact('passwd=hunter2')).not.toContain('hunter2');

    // Pre-existing labels must survive unchanged — the new pattern is ordered last and
    // lookahead-guarded precisely so it cannot re-redact an already-redacted value.
    expect(redact('url?password=secret123&user=foo')).toContain('[REDACTED:PASSWORD]');
    expect(redact('token: ghp_' + 'a'.repeat(36) + ' end')).toBe('token: [REDACTED:GH_TOKEN] end');

    // The guard must require a COMPLETE redaction token, not merely the prefix. The ship gate's
    // adversarial reviewer defeated a bare-prefix lookahead with a value that STARTS with the
    // marker text while still carrying a real secret behind it. Assembled at runtime so no
    // secret-shaped literal lands in this file.
    const FAKE_STRIPE = 'sk_' + 'live_' + 'FAKE1234567890ABCDEFGH';
    const defeat = redact('token=[REDACTED]' + FAKE_STRIPE);
    expect(defeat).toContain('[REDACTED:CREDENTIAL]');
    expect(defeat).not.toContain(FAKE_STRIPE);
  });

  it('redacts a secret sitting BEYOND the old 500-char cut, which used to be truncated away by accident', async () => {
    // This is the security property this SD changes. Before, a secret at char ~800 never
    // reached the row because .slice(0, 500) discarded it. Now the full body is persisted, so
    // redaction has to actively catch it rather than being rescued by truncation.
    // Assembled at runtime so the AKIA-shaped literal never appears in this file: the repo's
    // pre-commit secret scanner correctly rejects one on an added line, and it is right to.
    const FAKE_AWS = 'AKIA' + 'FAKEKEYFORTEST01';
    const body = 'padding words that go on for a while. '.repeat(25) + `aws=${FAKE_AWS} and the rest`;
    expect(body.indexOf(FAKE_AWS)).toBeGreaterThan(500);

    let insertPayload = null;
    const result = await aggregateSignals(makeRouterMock({
      rows: rowsFor(body),
      onInsert: (p) => { insertPayload = p; }
    }));

    expect(result.promoted).toBe(1);
    expect(insertPayload.description).toContain('[REDACTED:AWS_KEY]');
    expect(insertPayload.description).not.toContain(FAKE_AWS);
    // The surrounding text is still carried in full — redaction, not truncation.
    expect(insertPayload.description).toContain('and the rest');
  });
});

describe('TS-12: the title fits the real VARCHAR(255) column, is marked when cut, and is never mid-word', () => {
  it('a long SINGLE-LINE body still produces an insertable title', async () => {
    // REGRESSION GUARD for a data-loss bug this very change introduced, caught by the ship
    // gate's adversarial reviewer before merge: feedback.title is VARCHAR(255) — verified live
    // (Postgres 22001 "value too long for type character varying(255)" at 300 chars) — NOT the
    // unbounded TEXT an earlier review reported. An over-length title fails the INSERT outright,
    // so the group is never stamped routed_to_feedback_id and re-fails on every tick until its
    // rows age out of WINDOW_MIN: TOTAL loss, strictly worse than the truncation being fixed.
    // The single-line shape is the COMMON case — a CLI caller passes the body as one quoted arg.
    const oneLine = 'This body is a single unbroken line with no newline anywhere in it, which is the ordinary shape when a caller passes the whole body as one quoted shell argument, and it deliberately runs well past two hundred and fifty five characters so that an unbounded title would be rejected by the database outright.';
    expect(oneLine.length).toBeGreaterThan(255);
    expect(oneLine.includes('\n')).toBe(false);

    let insertPayload = null;
    const result = await aggregateSignals(makeRouterMock({
      rows: rowsFor(oneLine),
      onInsert: (p) => { insertPayload = p; }
    }));

    expect(result.promoted).toBe(1);
    expect(insertPayload.title.length).toBeLessThanOrEqual(255);   // the column limit
    expect(insertPayload.title.endsWith('…')).toBe(true);           // MARKED, not silent
    const kept = insertPayload.title.slice(0, -1);
    expect(kept).toBe(kept.trimEnd());                              // no dangling space before the mark
    expect(oneLine.split(' ')).toContain(kept.split(' ').pop());     // last word is a WHOLE word
    // And the full text is still recoverable where it belongs.
    expect(insertPayload.description).toContain(oneLine);
  });

  it('leaves a short title completely untouched', async () => {
    let insertPayload = null;
    await aggregateSignals(makeRouterMock({
      rows: rowsFor('short and sweet'),
      onInsert: (p) => { insertPayload = p; }
    }));
    expect(insertPayload.title).toBe('short and sweet');
    expect(insertPayload.title.endsWith('…')).toBe(false);
  });
});
