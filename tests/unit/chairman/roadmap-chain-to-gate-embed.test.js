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

import { describe, it, expect } from 'vitest';
import { renderChainToGate, fetchChainToGate } from '../../../lib/chairman/daily-review/roadmap-status-doc.js';

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
  const client = (impl) => ({ from: () => ({ select: () => ({ order: () => ({ limit: () => ({ maybeSingle: impl }) }) }) }) });

  it('returns the stored section when a report exists', async () => {
    const got = await fetchChainToGate(client(async () => ({ data: { sections: { chain_to_gate: section() } }, error: null })));
    expect(got?.section).toBe('chain_to_gate');
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
