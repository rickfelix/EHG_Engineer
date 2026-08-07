/**
 * SD-LEO-INFRA-CHAIRMAN-SMS-LANE-001 — FR-1 correlation + FR-3 read-only boundary.
 *
 * Pure unit tests: the fold is a pure function and the boundary check is static source analysis.
 * No database. (The DB-test guard is right to insist on that, and it caught me on the previous SD.)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { foldIntoExchanges, phoneKey, DEFAULT_WINDOW_HOURS } from '../../../lib/solomon/chairman-sms-exchanges.js';

const SRC = 'lib/solomon/chairman-sms-exchanges.js';
const out = (at, body, counterpart = '5551234567') => ({ direction: 'out', at, body, counterpart });
const inb = (at, body, counterpart = '5551234567') => ({ direction: 'in', at, body, counterpart });

describe('FR-1 — exchanges are correlated, not loose rows', () => {
  it('pairs an outbound with the reply that follows it', () => {
    const r = foldIntoExchanges([
      out('2026-08-04T10:00:00Z', 'Approve the G2 amendment?'),
      inb('2026-08-04T10:05:00Z', 'approved'),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].outbound.body).toBe('Approve the G2 amendment?');
    expect(r[0].reply.body).toBe('approved');
  });

  it('surfaces an UNANSWERED outbound with reply:null rather than dropping it', () => {
    // The case an oversight duty most needs to see. Filtering it would bias the very sample this
    // module exists to unbias — an escalation that got no answer is the signal, not noise.
    const r = foldIntoExchanges([out('2026-08-04T10:00:00Z', 'Need a call on the kill gate')]);
    expect(r).toHaveLength(1);
    expect(r[0].outbound).toBeTruthy();
    expect(r[0].reply).toBeNull();
  });

  it('a second outbound before any reply closes the first as UNANSWERED, not superseded', () => {
    const r = foldIntoExchanges([
      out('2026-08-04T10:00:00Z', 'first ask'),
      out('2026-08-04T11:00:00Z', 'second ask'),
      inb('2026-08-04T11:05:00Z', 'ok'),
    ]);
    expect(r).toHaveLength(2);
    expect(r[0].outbound.body).toBe('first ask');
    expect(r[0].reply).toBeNull();              // went unanswered — distinct from superseded
    expect(r[1].reply.body).toBe('ok');
  });

  it('emits a chairman-INITIATED inbound as unpaired rather than attaching it to a stale outbound', () => {
    // A confident mispairing produces a finding citing the wrong exchange, which is worse than a
    // gap. He texts first often; that must not be laundered into an answer to something else.
    const r = foldIntoExchanges([inb('2026-08-04T09:00:00Z', 'stop the sourcing freeze')]);
    expect(r).toHaveLength(1);
    expect(r[0].unpaired).toBe(true);
    expect(r[0].outbound).toBeNull();
  });

  it('does not cross-pair different counterparts', () => {
    const r = foldIntoExchanges([
      out('2026-08-04T10:00:00Z', 'to A', '5550000001'),
      inb('2026-08-04T10:01:00Z', 'from B', '5550000002'),
    ]);
    // A's ask is unanswered; B's message is chairman-initiated. Neither is the other's reply.
    expect(r.find((e) => e.outbound?.body === 'to A').reply).toBeNull();
    expect(r.find((e) => e.reply?.body === 'from B').unpaired).toBe(true);
  });

  it('is deterministic — same input, same output', () => {
    const msgs = [inb('2026-08-04T10:05:00Z', 'y'), out('2026-08-04T10:00:00Z', 'x')];
    expect(JSON.stringify(foldIntoExchanges(msgs))).toBe(JSON.stringify(foldIntoExchanges(msgs)));
  });

  it('normalises phone formats so provider differences do not split a conversation', () => {
    expect(phoneKey('+1 (555) 123-4567')).toBe(phoneKey('5551234567'));
  });
});

describe('FR-3 — the boundary is enforced by ABSENCE of a send path', () => {
  const src = readFileSync(SRC, 'utf8');
  // Bound to the executable region: the docblock deliberately NAMES sendChairmanSMS while
  // explaining the boundary, and a check that fires on prose is not a check. That mistake cost me
  // two fixes on the previous SD, so the region is bounded up front here.
  const body = src.slice(src.indexOf('export const DEFAULT_WINDOW_HOURS'));

  it('imports no send helper', () => {
    expect(body).not.toMatch(/sendChairmanSMS/);
    expect(body).not.toMatch(/chairman-sms-gate/);
    expect(body).not.toMatch(/sms-outbound-worker/);
  });

  /**
   * Every supabase table access, with the first chained verb.
   *
   * A blanket /\.delete\(/ scan is WRONG here and this test proved it: the fold uses
   * `pendingByPhone.delete(...)` on a Map, so the naive regex failed on correct code. Scanning for
   * a verb anywhere in the file cannot tell a query builder from a Map — the invariant is not
   * "the word delete never appears", it is "every supabase.from() chain is a read".
   */
  function supabaseChains(text) {
    return [...text.matchAll(/supabase\s*\.from\(\s*['"]([a-z_]+)['"]\s*\)\s*\.\s*(\w+)\s*\(/g)]
      .map((m) => ({ table: m[1], verb: m[2] }));
  }

  it('every supabase.from() chain is a read', () => {
    const chains = supabaseChains(body);
    expect(chains.length).toBeGreaterThan(0);   // guard: a regex matching nothing would "pass"
    for (const c of chains) {
      expect(c.verb, `${c.table} is accessed with .${c.verb}() — not a read`).toBe('select');
    }
  });

  it('CONTROL: the same checks FAIL on a body that acquires a send path or a write', () => {
    // Two-sided. Without this, the assertions above would pass just as happily against an empty
    // string — a check that cannot fail is the defect class this SD is about.
    const tampered = body
      + "\nimport { sendChairmanSMS } from '../comms/adam-outbound/chairman-sms-gate/index.js';\n"
      + "await supabase.from('sms_outbound_obligations').insert({});\n";
    expect(tampered).toMatch(/sendChairmanSMS/);
    const verbs = supabaseChains(tampered).map((c) => c.verb);
    expect(verbs).toContain('insert');          // the scanner really does catch a write
  });

  it('CONTROL: the region actually contains the module code (guards against a vacuous slice)', () => {
    expect(body).toMatch(/foldIntoExchanges/);
    expect(body.length).toBeGreaterThan(500);
  });

  it('the docblock still names the boundary it enforces', () => {
    expect(src.slice(0, src.indexOf('export const DEFAULT_WINDOW_HOURS'))).toMatch(/READ-ONLY/);
  });
});

describe('FR-1 — the window is bounded by parameter, not by convention', () => {
  it('exports an explicit default so a caller widens it deliberately', () => {
    expect(DEFAULT_WINDOW_HOURS).toBeGreaterThan(0);
  });

  it('the source rejects a non-positive window rather than reading unbounded', () => {
    expect(readFileSync(SRC, 'utf8')).toMatch(/an unbounded read is not permitted/);
  });
});
