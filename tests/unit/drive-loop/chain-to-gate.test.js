// SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B — Section 2 (FR-5, TS-10).
//
// Nothing like this existed, so the definitions are decisions rather than inherited behaviour.
// These tests pin the three that are easy to get wrong in a way that still renders plausibly:
// the gate is the FIRST unpassed wave, the chain is that wave ONLY, the blocker is the first
// STUCK item rather than the first item — and the owner never comes from item.lane.

import { describe, it, expect } from 'vitest';
import {
  buildChainToGate, resolveChain, resolveOwner, parseBlockedOn, SECTION_ID,
} from '../../../lib/drive-loop/sections/chain-to-gate.js';
import { isUnmeasurable } from '../../../lib/drive-loop/citation.js';

const wave = (id, rank, title = `Wave ${rank}`) => ({ id, sequence_rank: rank, title });
const item = (id, waveId, over = {}) => ({ id, wave_id: waveId, title: `Item ${id}`, priority_rank: 1, lane: null, sd: null, ...over });

describe('the gate is the first UNPASSED wave', () => {
  it('skips a wave with no open items and names the next one', () => {
    const waves = [wave('w1', 1), wave('w2', 2), wave('w3', 3)];
    // w1 is clear; w2 has work.
    const { gate } = resolveChain(waves, [item('a', 'w2'), item('b', 'w3')]);
    expect(gate.id).toBe('w2');
  });

  it('picks by sequence_rank, not by array order', () => {
    const waves = [wave('w3', 3), wave('w1', 1), wave('w2', 2)];
    const { gate } = resolveChain(waves, [item('a', 'w3'), item('b', 'w1')]);
    expect(gate.id).toBe('w1');
  });

  it('reports null gate when every approved wave is clear', () => {
    const s = buildChainToGate({ waves: [wave('w1', 1)], items: [] });
    expect(s.gate.value).toBeNull();
    // A cleared plan and an unreadable one must not render the same.
    expect(isUnmeasurable(s.gate)).toBe(false);
    expect(s.gate.predicate).toMatch(/every approved wave is clear/);
  });

  it('is UNMEASURABLE when no waves are readable, which is NOT the same as being clear', () => {
    const s = buildChainToGate({ waves: [], items: [] });
    expect(isUnmeasurable(s.gate)).toBe(true);
    expect(s.gate.reason).toMatch(/different from having reached the last gate/);
  });
});

describe('the chain is the gate wave ONLY', () => {
  it('excludes open items from later waves', () => {
    const waves = [wave('w1', 1), wave('w2', 2)];
    const items = [item('a', 'w1'), item('b', 'w1'), item('c', 'w2'), item('d', 'w2')];
    const s = buildChainToGate({ waves, items });

    expect(s.chain_length.value).toBe(2);
    expect(s.chain_length.citation.row_ids).toEqual(['a', 'b']);
    // Including w2 would make this a backlog. "The single chain" means what stands between
    // now and the NEXT gate, and a three-wave list answers a different question.
    expect(s.chain_length.citation.row_ids).not.toContain('c');
  });

  it('orders the chain by priority_rank', () => {
    const waves = [wave('w1', 1)];
    const items = [item('late', 'w1', { priority_rank: 9 }), item('early', 'w1', { priority_rank: 1 })];
    expect(buildChainToGate({ waves, items }).chain_length.citation.row_ids).toEqual(['early', 'late']);
  });
});

describe('the blocker is the first STUCK item, not the first item', () => {
  const waves = [wave('w1', 1)];

  it('an unclaimed head is NOT the blocker — waiting is not blocked', () => {
    const items = [
      item('head', 'w1', { priority_rank: 1, sd: { status: 'draft', claiming_session_id: null } }),
      item('stuck', 'w1', { priority_rank: 2, lane: 'blocked-on-SD-DEP-001', sd: { status: 'draft' } }),
    ];
    const s = buildChainToGate({ waves, items });

    // Reporting the head as blocked sends someone to unblock nothing.
    expect(s.blocker.value.item_id).toBe('stuck');
    expect(s.blocker.value.blocked_on).toBe('SD-DEP-001');
  });

  it('a blocked SD status counts even with no blocked-on lane', () => {
    const items = [item('x', 'w1', { sd: { status: 'blocked' } })];
    expect(buildChainToGate({ waves, items }).blocker.value.item_id).toBe('x');
  });

  it('unmet dependencies count', () => {
    const items = [item('x', 'w1', { sd: { status: 'draft', unmet_dependencies: ['SD-A'] } })];
    expect(buildChainToGate({ waves, items }).blocker.value.item_id).toBe('x');
  });

  it('reports NO blocker when the chain is merely waiting, and says which diagnosis that is', () => {
    const items = [item('x', 'w1', { sd: { status: 'draft', claiming_session_id: null } })];
    const s = buildChainToGate({ waves, items });

    expect(s.blocker.value).toBeNull();
    expect(s.blocker.predicate).toMatch(/waiting on capacity, which is a different diagnosis/);
  });
});

describe('THE TRAP — the owner never comes from item.lane', () => {
  it('does not treat an intake-routing lane as an owner', () => {
    // item.lane is the sourcing-engine intake-routing lane. Using it would populate this field
    // on nearly every row and read as an owner while naming the wrong thing.
    const o = resolveOwner(item('x', 'w1', { lane: 'blocked-on-SD-DEP-001', sd: { status: 'blocked' } }));
    expect(o.owner).toBeNull();
    expect(o.basis).toMatch(/unclaimed/);
  });

  it('derives the owner from an active claim', () => {
    const o = resolveOwner(item('x', 'w1', { sd: { claiming_session_id: 'sess-7' } }));
    expect(o.owner).toBe('sess-7');
    expect(o.basis).toMatch(/active claim/);
  });

  it('an unsourced blocker says so rather than reporting a blank owner', () => {
    const o = resolveOwner(item('x', 'w1', { sd: null }));
    expect(o.owner).toBeNull();
    expect(o.basis).toMatch(/no SD/);
  });

  it('an unowned blocker carries the limitation IN the emission', () => {
    const s = buildChainToGate({
      waves: [wave('w1', 1)],
      items: [item('x', 'w1', { lane: 'blocked-on-SD-DEP-001', sd: { status: 'blocked', claiming_session_id: null } })],
    });

    expect(s.blocker.value.owner).toBeNull();
    // An unowned blocker is a real and important state — nobody is accountable for the thing
    // standing in front of the gate — so it must be visible, not papered over.
    expect(s.blocker.limitation).toMatch(/unowned/);
    expect(s.blocker.limitation).toMatch(/intake-routing/);
  });
});

describe('parseBlockedOn', () => {
  it('extracts the blocker id', () => {
    expect(parseBlockedOn('blocked-on-SD-X-001')).toBe('SD-X-001');
  });

  it('returns null for a lane that is not a blocked-on lane, and for an empty target', () => {
    expect(parseBlockedOn('chairman-gated')).toBeNull();
    expect(parseBlockedOn(null)).toBeNull();
    // 'blocked-on-' with nothing after it names no blocker; returning '' would render as a
    // blocker whose id is blank.
    expect(parseBlockedOn('blocked-on-')).toBeNull();
  });
});

describe('the built section', () => {
  it('has the expected id and cites the gate row', () => {
    const s = buildChainToGate({ waves: [wave('w1', 1)], items: [item('a', 'w1')] });
    expect(s.section).toBe(SECTION_ID);
    expect(s.gate.citation.row_ids).toEqual(['w1']);
  });
});
