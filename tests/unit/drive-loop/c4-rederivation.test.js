// SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B — TS-14, as a PROPERTY over the real sections.
//
// ── WHAT THIS REPLACES, AND WHY IT HAD TO BE REWRITTEN ────────────────────────────────────
// TS-14 exists because "TS-3 and TS-4 check that a citation has the right SHAPE; NONE of them
// checks that following the citation reproduces the value. Without this, a section that stores a
// correct-looking citation ALONGSIDE a copied value passes every other scenario."
//
// The first implementation lived entirely inside citation.test.js, against a fixture-local
// `runPredicate` closure, and never imported a section module. MEASURED: three mutations that
// each made a cited value contradict its own row_ids —
//     plan-position `next.value := status.next.length + 7`
//     plan-position `done_recent.value := status.done.length + 99`
//     plan-position `slipped.value := status.slipped.length + 42`
// — left the whole 68-test suite GREEN. The scenario TS-14 was written to catch was the exact
// scenario it could not see.
//
// ── WHY THIS IS A PROPERTY AND NOT A LIST OF EXPECTED NUMBERS ─────────────────────────────
// belt-diagnosis.test.js and stall-deltas.test.js DO catch that mutation — but only because they
// hardcode the expected counts. That is an incidental catch, not a property: it protects the
// values someone happened to write down, and it protects nothing in a section written next year.
//
// So the rule here is stated once, over every cited value the sections actually emit:
//   A cited number must EQUAL what its own citation produces.
// The number is never read from this file. It is recomputed from `citation.row_ids`, which is the
// grain the section itself chose to publish, so the assertion cannot drift from the section.
//
// ── DEFAULT-DENY IS THE PART THAT SURVIVES US ─────────────────────────────────────────────
// Some cited values have no row grain (plan_position.remainder is a count of 300 whose row ids
// are deliberately NOT published) and some are composite (stall_deltas.summary is an object).
// Neither can be re-derived by counting rows. Those require an explicitly DECLARED re-deriver
// below — and a cited value with neither a row grain nor a declaration FAILS. That is the
// route-independence: a future section cannot add an un-rederivable number quietly. It must
// either publish the rows its number came from, or say here how the number is reproduced.
//
// The section registry is checked against the sections DIRECTORY for the same reason — a new
// section module that nobody added a fixture for turns this file red rather than being skipped.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildPlanPosition, SECTION_ID as PLAN_POSITION } from '../../../lib/drive-loop/sections/plan-position.js';
import { buildBeltDiagnosis, SECTION_ID as BELT_DIAGNOSIS } from '../../../lib/drive-loop/sections/belt-diagnosis.js';
import { buildStallDeltas, SECTION_ID as STALL_DELTAS } from '../../../lib/drive-loop/sections/stall-deltas.js';
import { buildChainToGate, SECTION_ID as CHAIN_TO_GATE } from '../../../lib/drive-loop/sections/chain-to-gate.js';

// Section 2 fixture. Gate is w1 (lowest sequence_rank WITH open items); the chain is its two open
// items ordered by priority_rank; i1 is the blocker via a blocked-on-* lane. Counts are deliberately
// distinct from the other fixtures so a value copied from the wrong sibling is a mismatch rather
// than a coincidence.
const CHAIN_WAVES = [
  { id: 'w1', title: 'Wave 1', sequence_rank: 1 },
  { id: 'w2', title: 'Wave 2', sequence_rank: 2 },
];
const CHAIN_ITEMS = [
  { id: 'i1', wave_id: 'w1', priority_rank: 1, title: 'blocked head', lane: 'blocked-on-SD-X', sd: { status: 'blocked' } },
  { id: 'i2', wave_id: 'w1', priority_rank: 2, title: 'waiting', sd: { owner_lane: 'lane-a' } },
];

// ───────────────────────────────────────────────────────────────────────────────────────────
// Fixtures. Every row set is DELIBERATELY NON-EMPTY and the counts are DELIBERATELY DISTINCT
// (10 / 3 / 2 / 2 / 1 / 1 / 1), so a value copied from the wrong sibling is a mismatch rather
// than a coincidence. An all-zero fixture would satisfy `value === row_ids.length` vacuously.
// ───────────────────────────────────────────────────────────────────────────────────────────

const STATUS = {
  slipped: [{ item_id: 's1' }, { item_id: 's2' }],
  done: [{ item_id: 'd1' }, { item_id: 'd2' }, { item_id: 'd3' }],
  next: Array.from({ length: 10 }, (_, i) => ({ item_id: `n${i}`, title: `Open ${i}` })),
  committing: [{ item_id: 'n0' }],
  admissions_by_linkage: { by_wave: [], unlinked: [], fence_lifts: [] },
  // 300 open items behind a display window of 10 — the shape that made the original defect
  // possible, kept here so the remainder's re-derivation is over a number nothing else equals.
  open_total: 300,
  next_truncated: true,
  committing_truncated: true,
};

const beltItem = (over = {}) => ({
  id: 'i1', promoted_to_sd_key: null, item_disposition: 'pending',
  lane: null, remainder_state: 'promotable_now', sd: null, ...over,
});
const beltWithSd = (sdOver = {}, itemOver = {}) => beltItem({
  promoted_to_sd_key: 'SD-1', sd: { status: 'draft', claiming_session_id: null, ...sdOver }, ...itemOver,
});

const BELT_ITEMS = [
  beltItem({ id: 'u1' }),
  beltItem({ id: 'u2', promoted_to_sd_key: 'SD-GHOST', sd: null }),
  beltWithSd({ status: 'blocked' }, { id: 'b1' }),
  beltWithSd({ status: 'in_progress', claiming_session_id: 's' }, { id: 'f1' }),
  beltWithSd({ status: 'draft' }, { id: 'c1', remainder_state: 'gated_on_chairman' }),
  beltWithSd({ status: 'completed' }, { id: 'x1' }),
  beltWithSd({ status: 'draft' }, { id: 'w1' }),
];

const T0 = 1_700_000_000_000;
const PRIOR_REPORT = {
  id: 'prior-report-1',
  sections: {
    [STALL_DELTAS]: {
      position: { position: 'wave-2:gate-A', unmoved_since_ms: T0 },
      items: { open: ['i1', 'i2', 'i3'], unmoved_reports: { i1: 2 } },
    },
  },
};

// Built once. Each entry pairs a section with the CONTEXT its declared re-derivers may read —
// the same inputs the section was handed, never a transcription of its output.
async function buildAll() {
  return {
    [PLAN_POSITION]: {
      section: await buildPlanPosition({ computePlanCheckStatus: async () => STATUS, supabase: {} }),
      ctx: { status: STATUS },
    },
    [BELT_DIAGNOSIS]: {
      section: buildBeltDiagnosis(BELT_ITEMS),
      ctx: { items: BELT_ITEMS },
    },
    [STALL_DELTAS]: {
      section: buildStallDeltas({
        currentPosition: 'wave-2:gate-A',
        currentItemIds: ['i2', 'i3', 'i4'],
        priorReport: PRIOR_REPORT,
        nowMs: T0 + 48 * 3_600_000,
      }),
      ctx: { priorReport: PRIOR_REPORT },
    },
    [CHAIN_TO_GATE]: {
      section: buildChainToGate({ waves: CHAIN_WAVES, items: CHAIN_ITEMS }),
      ctx: { waves: CHAIN_WAVES, items: CHAIN_ITEMS },
    },
  };
}

// Which module file backs which section id. Checked against the directory below, so a new
// section module cannot be added without landing here.
const SECTION_MODULE_FILES = {
  [PLAN_POSITION]: 'plan-position.js',
  [BELT_DIAGNOSIS]: 'belt-diagnosis.js',
  [STALL_DELTAS]: 'stall-deltas.js',
  // Registered when section 2 landed from the handover branch. The directory-vs-registry check
  // BELOW is what forced this line: chain-to-gate.js arrived unregistered and the guard went red
  // on first contact, exactly as intended. Do not soften that check to a warning — an unregistered
  // section silently escapes the re-derivation property, which is the one thing this file exists
  // to prevent.
  //
  // ⚠️ REGISTERED IS NOT COVERED, AND THIS MAP ALONE PROVES ONLY THE FORMER. ⚠️
  // MEASURED: after adding this line and nothing else, the directory check went green while a
  // mutation making chain_length contradict its own row_ids still passed 22/22 — because the
  // property only ever inspects what buildAll() actually BUILDS, and that map is separate. So the
  // obvious remedy for a red directory check (add a line here) defeats the guard: it silences the
  // alarm without extending a single assertion. The keys-match assertion below is what closes it —
  // it makes "named here" and "built and checked" the same set by construction, so the only way to
  // satisfy the directory check is to hand the property a real section.
  [CHAIN_TO_GATE]: 'chain-to-gate.js',
};

// ───────────────────────────────────────────────────────────────────────────────────────────
// Declared re-derivers, for cited values that genuinely cannot be recomputed by counting rows.
// Each one reproduces the number from a source that is NOT the section's own cited output.
// ───────────────────────────────────────────────────────────────────────────────────────────

const REDERIVERS = {
  // The remainder publishes no row ids on purpose: the count is the full 300, the rows would be
  // the capped 10, and citing the ten as if they were the remainder would point somewhere other
  // than where the number came from. So it is re-derived from the rollup that produced it.
  [`${PLAN_POSITION}.remainder`]: ({ status }) => status.open_total,

  // A summary must agree with the detail it summarises. Re-derived from the section's own
  // items/position blocks — which are raw state, not cited values, so this is not the summary
  // vouching for itself.
  [`${STALL_DELTAS}.summary`]: ({ section }) => ({
    closed: section.items.closed.length,
    opened: section.items.opened.length,
    position_moved: section.position.moved,
  }),

  // Section 2 publishes OBJECTS, not counts, so row_ids cannot re-derive them — citing one row id
  // beside a descriptor proves where it came from without reproducing it. The property refused
  // both on arrival (no_way_to_re_derive), which is the default-deny doing its job: a new section
  // cannot opt out by omission. Re-derived here from the WAVES/ITEMS the section was handed, never
  // from its own output, so this is independent recomputation rather than the section vouching for
  // itself. Both re-implement the module's stated definitions — GATE is the lowest-sequence_rank
  // approved wave that still has open items; BLOCKER is the first item in that chain that cannot
  // proceed, which is deliberately NOT the first item.
  [`${CHAIN_TO_GATE}.gate`]: ({ waves, items }) => {
    const openIn = (id) => items.filter((i) => i.wave_id === id).length;
    const g = [...waves].sort((a, b) => a.sequence_rank - b.sequence_rank).find((w) => openIn(w.id) > 0);
    return g ? { wave_id: g.id, title: g.title, sequence_rank: g.sequence_rank } : null;
  },

  [`${CHAIN_TO_GATE}.blocker`]: ({ waves, items }) => {
    const openIn = (id) => items.filter((i) => i.wave_id === id);
    const g = [...waves].sort((a, b) => a.sequence_rank - b.sequence_rank).find((w) => openIn(w.id).length > 0);
    if (!g) return null;
    const chain = openIn(g.id).slice().sort((a, b) => a.priority_rank - b.priority_rank);
    const b = chain.find((i) => String(i.lane || '').startsWith('blocked-on-')
      || i.sd?.status === 'blocked'
      || (Array.isArray(i.sd?.unmet_dependencies) && i.sd.unmet_dependencies.length > 0));
    if (!b) return null;
    const owner = b.sd?.claiming_session_id ?? b.sd?.owner_lane ?? null;
    return {
      item_id: b.id,
      title: b.title,
      blocked_on: String(b.lane || '').startsWith('blocked-on-') ? String(b.lane).slice('blocked-on-'.length) : null,
      owner,
      owner_basis: b.sd?.claiming_session_id ? 'active claim on the SD'
        : b.sd?.owner_lane ? 'SD owner_lane'
          : b.sd ? 'SD exists but is unclaimed and has no owner lane' : 'no SD — the item is unsourced',
    };
  },
};

// ───────────────────────────────────────────────────────────────────────────────────────────
// The walker and the contract.
// ───────────────────────────────────────────────────────────────────────────────────────────

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** A cited value is anything cite()/unmeasurable() produced: it carries both a citation and a predicate. */
function isCitedValue(node) {
  return !!node && typeof node === 'object' && !Array.isArray(node)
    && has(node, 'predicate') && has(node, 'citation');
}

/** Walk a section and collect every cited value with its path. Never recurses INTO one. */
function collectCitedValues(node, path = '', out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((v, i) => collectCitedValues(v, `${path}[${i}]`, out));
    return out;
  }
  if (isCitedValue(node)) {
    out.push({ path, cited: node });
    return out;
  }
  for (const [k, v] of Object.entries(node)) {
    collectCitedValues(v, path ? `${path}.${k}` : k, out);
  }
  return out;
}

// Key-order-insensitive comparison, so a re-derived object is compared by content.
const stable = (v) => JSON.stringify(v, (_k, val) => (
  val && typeof val === 'object' && !Array.isArray(val)
    ? Object.fromEntries(Object.keys(val).sort().map((k) => [k, val[k]]))
    : val
));
const sameValue = (a, b) => stable(a) === stable(b);

/**
 * Resolve how a cited value is to be reproduced.
 *  declared   — an explicit re-deriver exists (checked FIRST, so a section can override the
 *               count rule for a value whose rows are cited but whose number is not a count)
 *  row_count  — a numeric value published alongside its rows: the number IS the row count
 *  undeclared — neither. This is the default-deny branch and it is a failure.
 */
function resolveRederivation({ sectionId, path, cited, ctx }) {
  const declared = REDERIVERS[`${sectionId}.${path}`];
  if (declared) return { kind: 'declared', expected: declared(ctx) };

  const rowIds = cited.citation?.row_ids;
  if (Array.isArray(rowIds) && typeof cited.value === 'number') {
    return { kind: 'row_count', expected: rowIds.length };
  }

  return { kind: 'undeclared' };
}

/**
 * A NULL OBSERVATION IS A LEGITIMATE THIRD CATEGORY — decided here rather than left implicit.
 *
 * cite() admits `value: null` when the caller states what the null MEANS (738432e4e04), because in
 * this domain null is frequently the answer: the-next-gate-is-null means every wave is clear. Under
 * the row-count rule alone such a value has no row grain, so it would fall to `undeclared` and be
 * reported as no_way_to_re_derive — which would push a section into faking a row grain, or into
 * inventing a sentinel, to satisfy a property meant to prevent exactly that.
 *
 * So null gets its own category, on the SAME TERMS cite() sets, and it is not a free pass:
 *
 *   1. It must be EXPLAINED. An unexplained null reaching a section's output is a violation even
 *      though cite() throws on one today — the property must hold for a section that hand-builds
 *      the cited shape, not only for one that goes through cite().
 *   2. It must not CONTRADICT ITS OWN CITATION. Null alongside NON-EMPTY row_ids says "here are the
 *      rows I found" and "I found nothing" in the same breath. An absent or empty row grain is
 *      consistent with an observation of nothing; a populated one is not.
 *   3. A DECLARED RE-DERIVER STILL GOVERNS (see findViolations). A section reporting null where its
 *      rollup says 300 is not rescued by explaining the null.
 *
 * Where it differs from unmeasurable(): both carry value:null, and they make opposite claims about
 * whether the instrument worked. unmeasurable means the gauge could not be READ. An explained null
 * means it WAS read and the answer was nothing. unmeasurable is handled first, on its own terms.
 *
 * @returns {object|null} a violation, or null when the observation is admissible
 */
function checkNullObservation(path, cited) {
  const explained = typeof cited.null_means === 'string' && cited.null_means.trim().length > 0;
  if (!explained) {
    return {
      path,
      kind: 'unexplained_null',
      detail: `${path} observes null with no null_means. Null is admissible here as an OBSERVATION `
        + '(no next gate, nothing blocking) but only when it states what the absence signifies. '
        + 'A bare null leaves the consumer guessing between "nothing blocks" and "nobody looked".',
    };
  }

  const rowIds = cited.citation?.row_ids;
  if (Array.isArray(rowIds) && rowIds.length > 0) {
    return {
      path,
      kind: 'null_contradicts_its_rows',
      row_ids: rowIds,
      detail: `${path} observes null while citing ${rowIds.length} row(s). Following the citation `
        + 'produces rows; the value says there were none. One of them is wrong, and a reader has '
        + 'no way to tell which.',
    };
  }

  return null;
}

/**
 * The contract, applied to one built section. Returns violations rather than asserting, so the
 * harness itself can be positively controlled below.
 */
function findViolations(sectionId, section, ctx) {
  const violations = [];

  for (const { path, cited } of collectCitedValues(section)) {
    // An unmeasurable value has no number to re-derive — but it must say why, or "unmeasurable"
    // becomes a way to opt out of this check entirely.
    if (cited.unmeasurable === true) {
      if (!cited.reason || String(cited.reason).trim() === '') {
        violations.push({ path, kind: 'unmeasurable_without_reason' });
      }
      continue;
    }

    // An explained, self-consistent null is admissible — but the checks are real, and a declared
    // re-deriver still governs below, so explaining a null does not exempt it from agreeing with
    // the source that produced it.
    if (cited.value === null) {
      const nullViolation = checkNullObservation(path, cited);
      if (nullViolation) {
        violations.push(nullViolation);
        continue;
      }
    }

    const r = resolveRederivation({ sectionId, path, cited, ctx: { ...ctx, section } });

    if (r.kind === 'undeclared') {
      // An explained, self-consistent null observation is legitimately un-rederivable by counting:
      // the observation IS the absence, and re-running its predicate yields no rows, which is
      // exactly what it already says. It reached here only by passing checkNullObservation.
      if (cited.value === null) continue;

      violations.push({
        path,
        kind: 'no_way_to_re_derive',
        detail: `${sectionId}.${path} publishes a value with no row grain and no declared re-deriver. `
          + 'Either cite the rows the number came from, or add an entry to REDERIVERS in this file '
          + 'saying how the number is reproduced. A number that cannot be re-derived is the copied '
          + 'state C4 forbids.',
      });
      continue;
    }

    if (!sameValue(cited.value, r.expected)) {
      violations.push({
        path,
        kind: 'value_does_not_match_its_citation',
        via: r.kind,
        displayed: cited.value,
        re_derived: r.expected,
      });
    }
  }

  return violations;
}

// ───────────────────────────────────────────────────────────────────────────────────────────

describe('TS-14 — every cited value re-derives from its own citation (C4)', () => {
  let built;
  beforeAll(async () => { built = await buildAll(); });

  it('GUARD: the fixtures actually produce citations with rows to check', () => {
    // Without this, emptying a fixture would make every section pass over zero cited values and
    // the whole file would go quietly vacuous — passing hardest at the moment it stopped working.
    const all = Object.values(built).flatMap(({ section }) => collectCitedValues(section));
    expect(all.length).toBeGreaterThanOrEqual(9);

    const withRows = all.filter((c) => Array.isArray(c.cited.citation?.row_ids) && c.cited.citation.row_ids.length > 0);
    expect(withRows.length).toBeGreaterThanOrEqual(8);

    // And the row-count rule must be exercised over NON-ZERO counts, or `0 === 0` would satisfy it.
    const numericWithRows = withRows.filter((c) => typeof c.cited.value === 'number');
    expect(numericWithRows.length).toBeGreaterThanOrEqual(7);
    expect(numericWithRows.every((c) => c.cited.value > 0)).toBe(true);

    // Both non-row-count branches must be exercised too, or the declared path is dead code here.
    expect(Object.keys(REDERIVERS).length).toBeGreaterThanOrEqual(2);
  });

  it('plan_position: every cited value equals what its citation produces', () => {
    const { section, ctx } = built[PLAN_POSITION];
    expect(findViolations(PLAN_POSITION, section, ctx)).toEqual([]);
  });

  it('belt_diagnosis: every cited value equals what its citation produces', () => {
    const { section, ctx } = built[BELT_DIAGNOSIS];
    expect(findViolations(BELT_DIAGNOSIS, section, ctx)).toEqual([]);
  });

  it('stall_deltas: every cited value equals what its citation produces', () => {
    const { section, ctx } = built[STALL_DELTAS];
    expect(findViolations(STALL_DELTAS, section, ctx)).toEqual([]);
  });

  it('an unmeasurable value still has to say why, rather than opting out of the check', () => {
    const section = buildStallDeltas({ currentPosition: 'p', currentItemIds: [], priorReport: null });
    // nowMs absent -> the section reports unmeasurable. It must carry a reason.
    expect(findViolations(STALL_DELTAS, section, {})).toEqual([]);
    expect(section.deltas.reason).toBeTruthy();
  });
});

describe('TS-14 — the harness itself bites (positive control)', () => {
  let built;
  beforeAll(async () => { built = await buildAll(); });

  // Controls measure the INCREMENT in violations, not the absolute count. A control that demands
  // "exactly one violation" also goes red whenever the SOURCE is independently broken — which
  // buries the one failure that names the real defect under several that merely echo it.
  // Measuring what THIS corruption added keeps every control attributable to itself.
  const addedViolations = (sectionId, clean, corrupted, ctx) => {
    const seen = new Set(findViolations(sectionId, clean, ctx).map((v) => `${v.path}:${v.kind}`));
    return findViolations(sectionId, corrupted, ctx).filter((v) => !seen.has(`${v.path}:${v.kind}`));
  };

  // These are the three mutations that left the previous suite 68/68 green, applied here to the
  // OUTPUT so the control travels with the file and a reviewer does not have to patch source to
  // believe it. A checker that has never been shown failing is not evidence of anything.
  it.each([
    ['next', 7],
    ['done_recent', 99],
    ['slipped', 42],
  ])('reports a violation when plan_position.%s is off by %i from its own row ids', (key, drift) => {
    const { section, ctx } = built[PLAN_POSITION];
    const corrupted = structuredClone(section);
    corrupted[key].value = corrupted[key].value + drift;

    const added = addedViolations(PLAN_POSITION, section, corrupted, ctx);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ path: key, kind: 'value_does_not_match_its_citation', via: 'row_count' });
  });

  it('reports a violation when the remainder is copied from the capped display window', () => {
    // The original defect in its exact form: reporting 10 when the remainder is 300. The 10 comes
    // from the FIXTURE, not from the section's own output, so this control means the same thing
    // whether or not the section happens to be broken elsewhere.
    const { section, ctx } = built[PLAN_POSITION];
    const corrupted = structuredClone(section);
    corrupted.remainder.value = STATUS.next.length;

    const added = addedViolations(PLAN_POSITION, section, corrupted, ctx);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ path: 'remainder', via: 'declared', displayed: 10, re_derived: 300 });
  });

  it('reports a violation when a summary disagrees with the detail it summarises', () => {
    const { section, ctx } = built[STALL_DELTAS];
    const corrupted = structuredClone(section);
    corrupted.summary.value = { ...corrupted.summary.value, closed: corrupted.summary.value.closed + 5 };

    const added = addedViolations(STALL_DELTAS, section, corrupted, ctx);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ path: 'summary', kind: 'value_does_not_match_its_citation', via: 'declared' });
  });

  it('reports a violation when a belt bucket count disagrees with its cited rows', () => {
    const { section, ctx } = built[BELT_DIAGNOSIS];
    const corrupted = structuredClone(section);
    const firstCase = Object.keys(corrupted.cases)[0];
    corrupted.cases[firstCase].value = corrupted.cases[firstCase].value + 3;

    const added = addedViolations(BELT_DIAGNOSIS, section, corrupted, ctx);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ path: `cases.${firstCase}`, via: 'row_count' });
  });

  it('DEFAULT-DENY: a value with neither row ids nor a declared re-deriver is a violation', () => {
    // The shape a future section is most likely to introduce: a plausible citation, a real
    // predicate, and a number nothing can reproduce.
    const invented = {
      section: BELT_DIAGNOSIS,
      cases: {},
      velocity: {
        value: 17,
        citation: { table: 'roadmap_wave_items' },
        predicate: 'items closed per day, trailing 7d',
      },
    };

    const violations = findViolations(BELT_DIAGNOSIS, invented, {});
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ path: 'velocity', kind: 'no_way_to_re_derive' });
  });

  it('does NOT fire on a correct section — the control is two-sided', () => {
    // A checker that flags everything would pass every test above while being useless.
    for (const [sectionId, { section, ctx }] of Object.entries(built)) {
      expect(findViolations(sectionId, section, ctx), `${sectionId} must be clean`).toEqual([]);
    }
  });
});

describe('TS-14 — no section module escapes this file', () => {
  it('every module in lib/drive-loop/sections is registered above', () => {
    // The gap this closes: the property is only as wide as the section list, and a section added
    // next year would otherwise be checked by nothing while this file stayed green.
    const dir = fileURLToPath(new URL('../../../lib/drive-loop/sections/', import.meta.url));
    const onDisk = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
    const registered = Object.values(SECTION_MODULE_FILES).sort();

    expect(onDisk, 'a new section module must get a fixture and a REDERIVERS entry in this file '
      + 'before it can ship — otherwise its numbers are checked by nothing').toEqual(registered);
  });

  it('every REGISTERED section is also BUILT and CHECKED — registration alone buys nothing', async () => {
    // THE GAP THE CHECK ABOVE DOES NOT CLOSE, measured rather than imagined. When chain-to-gate.js
    // arrived, adding one line to SECTION_MODULE_FILES turned the directory check green — and a
    // mutation making chain_length contradict its own row_ids STILL passed 22/22, because the
    // property only inspects what buildAll() returns and that is a different list.
    //
    // So the natural fix for a red directory check silences it without adding one assertion. This
    // ties the two sets together: a module can only satisfy the directory check by also being
    // handed to the property with a real fixture.
    const built = Object.keys(await buildAll()).sort();
    const registered = Object.keys(SECTION_MODULE_FILES).sort();
    expect(built, 'a section named in SECTION_MODULE_FILES but missing from buildAll() is REGISTERED '
      + 'AND UNCHECKED — the worst of both, because the directory guard reads green while its '
      + 'numbers are verified by nothing').toEqual(registered);
  });
});

describe('TS-14 — a null observation is a third category, not an exemption', () => {
  // cite() admits value:null with a null_means (738432e4e04). The property has to say what that
  // means for re-derivation, or the two rules disagree and a section satisfies one by breaking the
  // other. Decided: admissible, on the same terms cite() sets, and still bound by any declared
  // re-deriver. These controls are what make that decision real rather than a comment.
  const nullCited = (over = {}) => ({
    value: null,
    citation: { table: 'roadmap_wave_items' },
    predicate: 'the gate the active wave is currently held at',
    null_means: 'no wave is held at a gate; every approved wave is clear',
    ...over,
  });
  const sectionWith = (cited) => ({ section: BELT_DIAGNOSIS, cases: {}, next_gate: cited });

  it('ADMITS an explained null with no row grain', () => {
    expect(findViolations(BELT_DIAGNOSIS, sectionWith(nullCited()), {})).toEqual([]);
  });

  it('ADMITS an explained null citing an EMPTY row set — that is consistent, not contradictory', () => {
    const cited = nullCited({ citation: { table: 'roadmap_wave_items', row_ids: [] } });
    expect(findViolations(BELT_DIAGNOSIS, sectionWith(cited), {})).toEqual([]);
  });

  it('REJECTS an unexplained null — the property does not depend on cite() having been used', () => {
    // cite() throws on this today, so the only way it reaches a section's output is a hand-built
    // cited shape. That is precisely the case a property has to cover and a unit test of cite()
    // cannot.
    const cited = nullCited({ null_means: undefined });
    const v = findViolations(BELT_DIAGNOSIS, sectionWith(cited), {});
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ path: 'next_gate', kind: 'unexplained_null' });
  });

  it('REJECTS an empty-string null_means, matching cite()', () => {
    // If the two rules disagreed here, a section could satisfy the property with an explanation
    // cite() would have refused — and the weaker of two rules is the one that governs.
    for (const empty of ['', '   ', '\n\t ']) {
      const v = findViolations(BELT_DIAGNOSIS, sectionWith(nullCited({ null_means: empty })), {});
      expect(v).toHaveLength(1);
      expect(v[0].kind).toBe('unexplained_null');
    }
  });

  it('REJECTS a null that CONTRADICTS its own cited rows', () => {
    // The failure the null category could otherwise smuggle in: "here are the three rows I found"
    // beside "I found nothing". Following the citation and reading the value give opposite answers.
    const cited = nullCited({ citation: { table: 'roadmap_wave_items', row_ids: ['r1', 'r2', 'r3'] } });
    const v = findViolations(BELT_DIAGNOSIS, sectionWith(cited), {});
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ path: 'next_gate', kind: 'null_contradicts_its_rows', row_ids: ['r1', 'r2', 'r3'] });
  });

  it('a DECLARED re-deriver still governs — explaining a null does not excuse it from agreeing', () => {
    // plan_position.remainder has a declared re-deriver reading the rollup's open_total. A section
    // reporting "nothing remains" while the rollup says 300 is the most dangerous possible false
    // reading of that section, and a well-worded null_means makes it MORE plausible, not less.
    const section = {
      section: PLAN_POSITION,
      remainder: nullCited({ null_means: 'the wave remainder is empty; nothing is outstanding' }),
    };
    const v = findViolations(PLAN_POSITION, section, { status: { open_total: 300 } });

    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({
      path: 'remainder',
      kind: 'value_does_not_match_its_citation',
      via: 'declared',
      displayed: null,
      re_derived: 300,
    });
  });

  it('an UNMEASURABLE value is not treated as a null observation — they are opposite claims', () => {
    // Both carry value:null. unmeasurable means the gauge could not be read; an explained null
    // means it was read and the answer was nothing. If the null branch swallowed unmeasurable, an
    // instrument outage would start reading as a clean bill of health.
    const cited = {
      value: null,
      unmeasurable: true,
      reason: 'query timed out',
      citation: { table: 'roadmap_wave_items' },
      predicate: 'the gate the active wave is currently held at',
    };
    expect(findViolations(BELT_DIAGNOSIS, sectionWith(cited), {})).toEqual([]);

    // ...and an unmeasurable WITHOUT a reason is still caught by its own rule, not by the null one.
    const noReason = { ...cited, reason: '' };
    const v = findViolations(BELT_DIAGNOSIS, sectionWith(noReason), {});
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe('unmeasurable_without_reason');
  });

  it('a NON-null value is untouched by any of this — the control is two-sided', () => {
    // A null rule that also fired on real values would pass every test above while being useless.
    const cited = { value: 2, citation: { table: 't', row_ids: ['a', 'b'] }, predicate: 'p' };
    expect(findViolations(BELT_DIAGNOSIS, sectionWith(cited), {})).toEqual([]);

    const wrong = { value: 5, citation: { table: 't', row_ids: ['a', 'b'] }, predicate: 'p' };
    expect(findViolations(BELT_DIAGNOSIS, sectionWith(wrong), {})).toHaveLength(1);
  });
});
