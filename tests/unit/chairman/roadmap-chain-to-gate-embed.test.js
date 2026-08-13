// SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-D (FR-3, CORRECTED) — the brief EMBEDS section 2.
//
// WHAT THIS REPLACES AND WHY. My first FR-3 computed its own "gated by" line from
// roadmap_waves.depends_on_wave_ids. lib/drive-loop/sections/chain-to-gate.js — "Section 2: chain
// to the next wave gate" — already existed on main and defines gate / chain / blocker / owner. Two
// representations of one concept, and worse, they answer DIFFERENT QUESTIONS under the same label:
// mine reported an unmet dependency WAVE, section 2 reports the first STUCK ITEM.
//
// The ruling (coordinator, 2026-08-04) and the reasoning worth keeping: rendering something is only
// a virtue when the something is the SAME answer. A brief showing a dependency-wave blocker where
// section 2 shows a stuck-item blocker does not degrade gracefully — it points the chairman at the
// wrong thing with full confidence. So: embed, and render the ABSENCE explicitly rather than
// backfilling it with a local computation.
//
// TODAY THE ABSENCE PATH IS THE LIVE PATH: drive_reports is on main but its migration is
// chairman-gated and unapplied, so there is no readable report.

import { describe, it, expect, vi } from 'vitest';

// The canonical-roadmap resolver is mocked so these tests exercise the EMBED + RECEIPT path rather
// than re-testing roadmap resolution, which has its own suite. Without it buildRoadmapStatusDoc
// short-circuits at "no canonical roadmap" and never reaches the code under test.
vi.mock('../../../lib/roadmap/canonical-roadmap.js', () => ({
  resolveCanonicalRoadmap: async () => ({ id: 'rm-1', title: 'LEO Roadmap', status: 'active' }),
}));
import { renderChainToGate, fetchChainToGate, stampChairmanBriefReceipt } from '../../../lib/chairman/daily-review/roadmap-status-doc.js';

const section = (over = {}) => ({
  section: 'chain_to_gate',
  gate: { value: { wave_id: 'w1', title: 'Wave 2: Revenue rails', sequence_rank: 2 } },
  chain_length: { value: 4 },
  blocker: { value: { item_id: 'i1', title: 'Stripe webhook hardening', blocked_on: 'i0', owner: 'Alpha-2', owner_basis: 'active claim on the SD' } },
  ...over,
});

describe('FR-3 — the absence is RENDERED, never blank and never backfilled', () => {
  it('says UNAVAILABLE and names why when there is no report', () => {
    const out = renderChainToGate(null).join('\n');
    expect(out).toMatch(/UNAVAILABLE/);
    expect(out).toMatch(/drive_reports is not live/);
    // The load-bearing half: it must say it did NOT substitute a local computation, because a
    // silent gap and a quietly-substituted answer look identical to a reader.
    expect(out).toMatch(/not substituted by a local computation/);
  });

  it('renders nothing that could be mistaken for a real gate when unavailable', () => {
    const out = renderChainToGate(undefined).join('\n');
    expect(out).not.toMatch(/blocker:/);
    expect(out).not.toMatch(/owner:/);
  });
});

describe('FR-3 — an embedded section renders section 2s answer, not a rederived one', () => {
  it('renders the gate, chain length, blocker and owner from the stored section', () => {
    const out = renderChainToGate(section()).join('\n');
    expect(out).toMatch(/Wave 2: Revenue rails/);
    expect(out).toMatch(/4 open item\(s\)/);
    expect(out).toMatch(/Stripe webhook hardening/);
    expect(out).toMatch(/blocked on i0/);
    expect(out).toMatch(/owner: Alpha-2/);
  });

  it('states UNOWNED explicitly rather than omitting the owner', () => {
    // "Nobody is accountable for the thing in front of the gate" is a finding, not a blank field.
    const out = renderChainToGate(section({
      blocker: { value: { item_id: 'i1', title: 'X', owner: null, owner_basis: 'no SD — the item is unsourced' } },
    })).join('\n');
    expect(out).toMatch(/owner: UNOWNED/);
    expect(out).toMatch(/unsourced/);
  });

  it('distinguishes NO BLOCKER from UNAVAILABLE — they are different answers', () => {
    const out = renderChainToGate(section({ blocker: { value: null } })).join('\n');
    expect(out).toMatch(/blocker: none/);
    expect(out).toMatch(/different diagnosis from blocked/);
    expect(out).not.toMatch(/UNAVAILABLE/);
  });
});

describe('FR-3 — fetchChainToGate degrades to null rather than throwing', () => {
  // SD-LEO-INFRA-HOURLY-DRIVE-SCORE-001 FR-4: fetchChainToGate now chains .eq('cadence',
  // 'scheduled') between select() and order(). This fake MUST model that link — the narrower
  // shape it had before returned a select() with no .eq, and fetchChainToGate's own try/catch
  // swallowed the resulting TypeError and degraded to null. Every case in this block then read
  // as "the table is absent" and only the one case asserting a NON-null result went red, which
  // is the worst possible signal: three tests stayed green while measuring nothing.
  //
  // Same fix, same reason, as tests/unit/drive-loop/drive-report-consume.test.js's makeDb().
  //
  // The eq arguments are RECORDED, not merely accepted: a fake that silently tolerates any
  // .eq() proves the chain shape but not the predicate, and the predicate is the whole point of
  // FR-4. hourly-cadence-consumer-census.test.js pins this guard STATICALLY (source scan); the
  // assertion below pins it BEHAVIOURALLY at the one consumer whose read the chairman's daily
  // review doc depends on.
  const client = (impl) => {
    const eqs = [];
    return {
      eqs,
      from: () => ({
        select: () => ({
          eq: (col, val) => { eqs.push({ col, val }); return {
            order: () => ({ limit: () => ({ maybeSingle: impl }) }),
          }; },
        }),
      }),
    };
  };

  it("[FR-4] filters the read to cadence='scheduled' so an hourly row cannot supply section 2", async () => {
    // The consumer this SD flagged as highest-exposure: without the filter an hourly partial's
    // chain_to_gate silently replaces the daily one in the chairman's review doc — a wrong
    // answer rendered with full confidence, which is worse than the UNAVAILABLE path above.
    const c = client(async () => ({ data: { id: 'rep-9', sections: { chain_to_gate: section() } }, error: null }));
    await fetchChainToGate(c);
    expect(c.eqs).toContainEqual({ col: 'cadence', val: 'scheduled' });
  });

  it('returns the stored section AND the report id that carries it', async () => {
    // The id travels with the section because FR-4 stamps a receipt against the report actually
    // read. A receipt that cannot name its report is not a receipt.
    const got = await fetchChainToGate(client(async () => ({ data: { id: 'rep-9', sections: { chain_to_gate: section() } }, error: null })));
    expect(got.reportId).toBe('rep-9');
    expect(got.section.section).toBe('chain_to_gate');
  });

  it('returns null when the table is absent — the live path today', async () => {
    const got = await fetchChainToGate(client(async () => ({ data: null, error: { message: 'relation "public.drive_reports" does not exist' } })));
    expect(got).toBeNull();
  });

  it('returns null when a report exists but carries no section 2', async () => {
    expect(await fetchChainToGate(client(async () => ({ data: { sections: {} }, error: null })))).toBeNull();
  });

  it('never throws into the brief — a section fault must not cost the whole document', async () => {
    const got = await fetchChainToGate(client(async () => { throw new Error('boom'); }));
    expect(got).toBeNull();
  });
});


// ─────────────────────────────────────────────────────────────────────────────────────────────
// FR-4 — the chairman_brief lane stamps its OWN receipt, and only for a report it embedded.
//
// Asserted on the CALL, not on the writer. lib/consumption/drive-report-receipts.js has its own
// suite; what is unproven without these is whether this consumer ever invokes it — the gap this SD
// family has produced twice. Not integration evidence: drive_report_receipts is not live.
describe('FR-4 — the chairman_brief receipt', () => {
  it('uses the underscore lane spelling that the CHECK constraint accepts', async () => {
    const seen = [];
    const supabase = { from: () => ({ upsert: (payload) => { seen.push(payload); return { select: () => ({ maybeSingle: async () => ({ data: { id: 'r' }, error: null }) }) }; } }) };
    const v = await stampChairmanBriefReceipt(supabase, 'rep-1');
    expect(v.written).toBe(true);
    expect(seen[0].lane).toBe('chairman_brief');
    // The spelling used in every prose message of this SD's thread, which the CHECK rejects.
    expect(seen[0].lane).not.toBe('chairman-brief');
  });

  it('reports a refused write rather than swallowing it', async () => {
    const supabase = { from: () => ({ upsert: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'relation does not exist' } }) }) }) }) };
    const v = await stampChairmanBriefReceipt(supabase, 'rep-1');
    expect(v.written).toBe(false);
    expect(v.error).toMatch(/does not exist/);
  });

  it('never throws into the brief — a receipt fault must not cost the chairman his document', async () => {
    const supabase = { from: () => { throw new Error('boom'); } };
    const v = await stampChairmanBriefReceipt(supabase, 'rep-1');
    expect(v === null || v.written === false).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// FR-4 WIRING — does buildRoadmapStatusDoc actually CALL the stamp?
//
// I wrote the FR-4 tests above against stampChairmanBriefReceipt directly and then noticed they
// prove the helper and not the call — the THIRD time this exact gap has appeared on this SD family
// (caught by mutation on QF-20260803-422, specified-then-skipped as TS-9, and again on FR-2 until
// orient() was extracted). Writing it down did not stop me repeating it; only running the check does.
//
// So this drives the REAL buildRoadmapStatusDoc against a stubbed client and asserts an upsert
// reaches drive_report_receipts. Not integration evidence — the table is not live.
describe('FR-4 wiring — the brief invokes the receipt writer for an embedded report', () => {
  const WAVE = { id: 'w1', title: 'Wave 1', sequence_rank: 1, status: 'approved', confidence_score: 0.5 };
  const SECTION = { section: 'chain_to_gate', gate: { value: { wave_id: 'w1', title: 'Wave 1', sequence_rank: 1 } }, chain_length: { value: 2 }, blocker: { value: null } };

  /** Minimal stub covering every table buildRoadmapStatusDoc touches, recording receipt upserts. */
  function stub({ withReport = true, receiptError = null } = {}) {
    const upserts = [];
    const table = (name) => {
      const rows =
        name === 'roadmap_waves' ? [WAVE]
          : name === 'v_plan_of_record_remainder' ? [{ id: 'i1', wave_id: 'w1', remainder_state: 'open' }]
            : [];
      const b = {
        select: () => b, eq: () => b, in: () => b, order: () => b, limit: () => b, gte: () => b, is: () => b,
        upsert(payload) { upserts.push({ name, payload }); return b; },
        async maybeSingle() {
          if (name === 'drive_reports') {
            return withReport ? { data: { id: 'rep-7', sections: { chain_to_gate: SECTION } }, error: null } : { data: null, error: { message: 'absent' } };
          }
          if (name === 'drive_report_receipts') return { data: receiptError ? null : { id: 'r1' }, error: receiptError };
          return { data: null, error: null };
        },
        then: (res) => res({ data: rows, error: null }),
      };
      return b;
    };
    return { upserts, from: table };
  }

  it('an embedded report produces a receipt upsert naming that report and the chairman_brief lane', async () => {
    const { buildRoadmapStatusDoc } = await import('../../../lib/chairman/daily-review/roadmap-status-doc.js');
    const c = stub();
    await buildRoadmapStatusDoc(c);
    const receipts = c.upserts.filter((u) => u.name === 'drive_report_receipts');
    // THE ASSERTION THAT WAS MISSING: the brief itself reached the writer.
    expect(receipts).toHaveLength(1);
    expect(receipts[0].payload).toMatchObject({ report_id: 'rep-7', lane: 'chairman_brief' });
  });

  it('NO report means NO receipt — and the section must still RENDER, not crash', async () => {
    // TWO-SIDED, AND THE SECOND HALF WAS ADDED AFTER A MUTATION SURVIVED. Asserting only
    // "zero receipts" passes whether the code correctly SKIPPED the stamp or THREW before
    // reaching it — a crash swallowed by the outer catch produces the identical zero. Zero is
    // not evidence of correct behaviour unless the surrounding behaviour is also intact.
    const { buildRoadmapStatusDoc } = await import('../../../lib/chairman/daily-review/roadmap-status-doc.js');
    const c = stub({ withReport: false });
    const doc = await buildRoadmapStatusDoc(c);
    expect(c.upserts.filter((u) => u.name === 'drive_report_receipts')).toHaveLength(0);
    const text = doc.sections.find((s) => s.id === 'plan_of_record')?.text || '';
    // The wave line proves the section built normally rather than falling into the error path.
    expect(text).toMatch(/Wave 1/);
    expect(text).toMatch(/Chain to gate: UNAVAILABLE/);
  });

  it('a refused receipt SURFACES in the rendered section rather than vanishing', async () => {
    const { buildRoadmapStatusDoc } = await import('../../../lib/chairman/daily-review/roadmap-status-doc.js');
    const c = stub({ receiptError: { message: 'relation does not exist' } });
    const doc = await buildRoadmapStatusDoc(c);
    const text = doc.sections.find((s) => s.id === 'plan_of_record')?.text || '';
    expect(text).toMatch(/NOT WRITTEN/);
    expect(text).toMatch(/chairman_brief/);
  });
});
