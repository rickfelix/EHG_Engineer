// SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-D (FR-3) — deriveWaveBlocker.
//
// WHAT THE DATA ACTUALLY SUPPORTS, measured before any of this was written. roadmap_waves has NO
// blocker column and NO owner column (checked at information_schema). On the CANONICAL roadmap
// resolved via resolveCanonicalRoadmap — 8 waves, not the 23 a naive query returns, which would
// have swept in archived duplicates — depends_on_wave_ids covers 5/8 and
// metadata.chairman_review_gate covers 1/8. So the gate is real and partial, and the OWNER LANE has
// no source at all and is not rendered.
//
// THE FAILURE DIRECTION THIS SUITE GUARDS: reporting a gate on a wave that is actually clear. A
// false-positive gate on a healthy wave erodes trust in the whole line, so "has dependencies" must
// never be mistaken for "is blocked" — the predicate has to evaluate the DEPENDED-ON WAVE.
//
// AND THE ASYMMETRY THAT IS EASY TO GET BACKWARDS: an UNRESOLVABLE or UNTRACKED dependency is NOT
// reported as clear. Silence is reserved for dependencies positively shown to be satisfied.

import { describe, it, expect } from 'vitest';
import { deriveWaveBlocker } from '../../../lib/chairman/daily-review/roadmap-status-doc.js';

const wave = (over = {}) => ({ id: 'w-self', title: 'Wave X', depends_on_wave_ids: [], metadata: null, ...over });
const idx = (entries) => new Map(entries.map((e) => [e.id, e]));
const counts = (entries) => new Map(entries.map(([id, total, promoted]) => [id, { total, promoted }]));

describe('FR-3 — nothing is reported as gated unless something actually gates it', () => {
  it('a wave with no dependencies has no gate', () => {
    expect(deriveWaveBlocker(wave(), new Map(), new Map())).toBeNull();
  });

  it('THE FALSE-POSITIVE GUARD — dependencies that are fully satisfied produce NO gate', () => {
    // The mutation this kills: counting depends_on_wave_ids instead of evaluating the dependency.
    // That implementation reports a gate here, on a wave whose dependency is complete.
    const w = wave({ depends_on_wave_ids: ['w-dep'] });
    const blocker = deriveWaveBlocker(w, idx([{ id: 'w-dep', title: 'Wave 1', status: 'approved' }]), counts([['w-dep', 10, 10]]));
    expect(blocker).toBeNull();
  });

  it('handles several dependencies where all are satisfied', () => {
    const w = wave({ depends_on_wave_ids: ['a', 'b'] });
    const blocker = deriveWaveBlocker(
      w,
      idx([{ id: 'a', title: 'A', status: 'approved' }, { id: 'b', title: 'B', status: 'approved' }]),
      counts([['a', 3, 3], ['b', 5, 5]]),
    );
    expect(blocker).toBeNull();
  });
});

describe('FR-3 — a genuine gate is named, with the reason a reader can act on', () => {
  it('names an unfinished dependency and its item counts', () => {
    const w = wave({ depends_on_wave_ids: ['w-dep'] });
    const blocker = deriveWaveBlocker(w, idx([{ id: 'w-dep', title: 'Wave 2: Revenue rails', status: 'approved' }]), counts([['w-dep', 8, 3]]));
    expect(blocker).toMatch(/Wave 2: Revenue rails/);
    expect(blocker).toMatch(/3\/8 items satisfied/);
  });

  it('a chairman review gate OUTRANKS a dependency — a decision beats unfinished work', () => {
    const w = wave({ depends_on_wave_ids: ['w-dep'], metadata: { chairman_review_gate: 'awaiting kill-gate ruling' } });
    const blocker = deriveWaveBlocker(w, idx([{ id: 'w-dep', title: 'Wave 2', status: 'approved' }]), counts([['w-dep', 8, 3]]));
    expect(blocker).toMatch(/chairman review gate/);
    expect(blocker).toMatch(/awaiting kill-gate ruling/);
    expect(blocker).not.toMatch(/items satisfied/);
  });

  it('a non-string chairman gate still reports as a gate rather than leaking an object', () => {
    const w = wave({ metadata: { chairman_review_gate: { ratified: false } } });
    const blocker = deriveWaveBlocker(w, new Map(), new Map());
    expect(blocker).toMatch(/chairman review gate/);
    expect(blocker).not.toMatch(/\[object Object\]/);
  });
});

describe('FR-3 — an unknown dependency is never reported as clear', () => {
  it('an UNRESOLVABLE dependency is a gate, not silence', () => {
    // The dependency points at a wave outside the ratified set, so it is absent from the index.
    // Treating that as "nothing blocking" is the fail-open direction this asymmetry exists to stop.
    const w = wave({ depends_on_wave_ids: ['ghost'] });
    expect(deriveWaveBlocker(w, new Map(), new Map())).toMatch(/unresolved dependency/);
  });

  it('a dependency that is not RATIFIED is a gate and says so', () => {
    // "approved" is the only ratified status; proposed and archived are not.
    const w = wave({ depends_on_wave_ids: ['w-dep'] });
    const blocker = deriveWaveBlocker(w, idx([{ id: 'w-dep', title: 'Wave 7', status: 'proposed' }]), new Map());
    expect(blocker).toMatch(/Wave 7/);
    expect(blocker).toMatch(/not ratified/);
  });

  it('a dependency with NO tracked items reports completion UNKNOWN, not complete', () => {
    // APPROVED IS NOT COMPLETE. The only wave statuses that exist are proposed/approved/archived —
    // there is no completed state — so an empty item roll-up is absence of evidence, and must not
    // be rendered as evidence of absence.
    const w = wave({ depends_on_wave_ids: ['w-dep'] });
    const blocker = deriveWaveBlocker(w, idx([{ id: 'w-dep', title: 'Wave 1B', status: 'approved' }]), counts([['w-dep', 0, 0]]));
    expect(blocker).toMatch(/completion unknown/);
  });

  it('reports the FIRST unmet dependency when several are unmet', () => {
    const w = wave({ depends_on_wave_ids: ['a', 'b'] });
    const blocker = deriveWaveBlocker(
      w,
      idx([{ id: 'a', title: 'A', status: 'approved' }, { id: 'b', title: 'B', status: 'approved' }]),
      counts([['a', 4, 1], ['b', 4, 0]]),
    );
    expect(blocker).toMatch(/^A \(/);
  });
});

describe('FR-3 — malformed input degrades quietly rather than throwing', () => {
  it('tolerates null/undefined waves and non-array dependency fields', () => {
    // This renders into the chairman's morning brief; a throw here costs the whole section.
    expect(deriveWaveBlocker(null, new Map(), new Map())).toBeNull();
    expect(deriveWaveBlocker(undefined, new Map(), new Map())).toBeNull();
    expect(deriveWaveBlocker(wave({ depends_on_wave_ids: 'not-an-array' }), new Map(), new Map())).toBeNull();
    expect(deriveWaveBlocker(wave({ metadata: 'nope' }), new Map(), new Map())).toBeNull();
  });
});
