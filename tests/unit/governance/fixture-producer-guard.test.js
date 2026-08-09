/**
 * Producer-side guard acceptance. SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-D.
 *
 * NO DATABASE, deliberately: the vitest `db` project on this repo has no designated non-production
 * target, so anything placed there SKIPS AND REPORTS GREEN. A live-tier test of this guard would be
 * permanently, silently inert — weaker than a fake-client test that actually runs.
 *
 * EVERY SCENARIO NAMES THE MUTATION THAT MUST TURN IT RED, and each was written by first asking
 * "what input makes this fail?" — because a test with no reachable failing input is a grep with a
 * .test.js extension, which is exactly how the first draft of this suite's TS-3 was caught.
 */
import { describe, it, expect } from 'vitest';
import {
  CLASSIFICATION,
  SANCTIONED_PERMANENT_NAMES,
  evaluateDeclaration,
  formatOptOutNotice,
  insertGuarded,
} from '../../../lib/governance/fixture-producer-guard.mjs';
import { CANARY_NAME } from '../../../lib/governance/venture-archive-predicate.mjs';

/** Records every insert so a test can assert what was NOT written, not merely what threw. */
const mkSupabase = () => {
  const inserted = [];
  return {
    inserted,
    from: (table) => ({
      insert: (row) => { inserted.push({ table, row }); return { data: [row], error: null }; },
    }),
  };
};
const mkLogger = () => { const lines = []; return { lines, log: (l) => lines.push(l) }; };

// A name that trips canonical ONLY via the name branch — is_demo is deliberately omitted, so the
// is_demo short-circuit cannot mask which branch is doing the work.
const NAME_BRANCH_FIXTURE = { name: 'TS-fixture-alpha' };
// Trips nothing canonical: no prefix, no epoch tail.
const REAL_ROW = { name: 'Image Alt Text Generator', is_demo: false };

describe('the guard OWNS the write — the object-identity seam is closed by construction', () => {
  it('inserts the EXACT object it asserted, by reference', () => {
    const sb = mkSupabase();
    const row = { ...NAME_BRANCH_FIXTURE };
    insertGuarded(sb, 'ventures', row, {
      classification: CLASSIFICATION.FIXTURE, source: 'test',
    });
    expect(sb.inserted).toHaveLength(1);
    // toBe, not toEqual. A detached assert lets a producer check one object and insert a copy with
    // a field overridden — which is live today at spine-verify-first-run.mjs, where the name is
    // replaced AFTER the row builder returns. Reference identity is what forecloses that.
    expect(sb.inserted[0].row).toBe(row);
  });

  it('issues NO insert at all when the assert fails', () => {
    const sb = mkSupabase();
    expect(() => insertGuarded(sb, 'ventures', REAL_ROW, {
      classification: CLASSIFICATION.FIXTURE, source: 'test',
    })).toThrow(/refusing to create an unguarded fixture/);
    // The point of assert-BEFORE-insert is that the write never happens. Asserting only that it
    // threw would pass even if the row had already landed.
    expect(sb.inserted).toEqual([]);
  });
});

describe('FIXTURE — the incumbent rule, now reachable at the NAME branch', () => {
  // The gap this closes is narrow and worth stating precisely: the canonical predicate's name
  // branch is already covered by tests/unit/governance/fixture-exclusion.test.js. What had NO
  // coverage is the producer CALL SITE at that branch, because the one existing producer sets
  // is_demo:true and short-circuits before the name is ever consulted.
  it('accepts a row that trips canonical via the NAME, with is_demo absent', () => {
    const sb = mkSupabase();
    insertGuarded(sb, 'ventures', NAME_BRANCH_FIXTURE, {
      classification: CLASSIFICATION.FIXTURE, source: 'test',
    });
    expect(sb.inserted).toHaveLength(1);
  });

  it('REJECTS a row that trips nothing — mutation: delete the FIXTURE branch check', () => {
    expect(evaluateDeclaration(REAL_ROW, CLASSIFICATION.FIXTURE).ok).toBe(false);
  });
});

describe('DELIBERATELY_REAL — the negative assert, two-sided', () => {
  /**
   * THE MEASURED CASE, not a constructed one. tests/integration/eva/high-consequence-blocking-gate-
   * realdb.test.js builds `HCGate-RealDB-<tag>-<epoch-ms>` intending a venture that is NOT a
   * fixture, so it can exercise the real path — and canonical's EPOCH_TAIL_RE certifies that name
   * AS a fixture. The producer's declaration and its row already disagree today.
   */
  it('FIRES on the epoch-tailed name the SD names as its exemplar opt-out', () => {
    const sb = mkSupabase();
    const logger = mkLogger();
    expect(() => insertGuarded(sb, 'ventures', { name: 'HCGate-RealDB-alpha-1786000000000' }, {
      classification: CLASSIFICATION.DELIBERATELY_REAL,
      source: 'high-consequence-blocking-gate-realdb.test.js',
      reason: 'must exercise the real chairman path',
      logger,
    })).toThrow(/TRIPS the canonical discriminant/);
    expect(sb.inserted).toEqual([]);
  });

  it('is SATISFIABLE — a genuinely real row passes, so the assert is not stuck-on', () => {
    const sb = mkSupabase();
    const logger = mkLogger();
    insertGuarded(sb, 'ventures', REAL_ROW, {
      classification: CLASSIFICATION.DELIBERATELY_REAL,
      source: 'test', reason: 'exercises the real path', logger,
    });
    expect(sb.inserted).toHaveLength(1);
  });
});

describe('the opt-out NAMES ITSELF every time it fires', () => {
  it('emits on the SUCCESS path too, not only on failure', () => {
    const sb = mkSupabase();
    const logger = mkLogger();
    insertGuarded(sb, 'ventures', REAL_ROW, {
      classification: CLASSIFICATION.DELIBERATELY_REAL,
      source: 'spine-verify-first-run.mjs', reason: 'real path under test', logger,
    });
    // Emitting only on failure would make a SPREADING opt-out invisible — the state this guard
    // exists to prevent. Mutation: move the logger.log call below the !verdict.ok throw.
    expect(logger.lines).toHaveLength(1);
    expect(logger.lines[0]).toMatch(/OPT-OUT FIRED/);
    expect(logger.lines[0]).toMatch(/spine-verify-first-run\.mjs/);
    expect(logger.lines[0]).toMatch(/real path under test/);
  });

  it('stays SILENT for a plain FIXTURE — the normal path is not noise', () => {
    const sb = mkSupabase();
    const logger = mkLogger();
    insertGuarded(sb, 'ventures', NAME_BRANCH_FIXTURE, {
      classification: CLASSIFICATION.FIXTURE, source: 'test', logger,
    });
    // Two-sided: without this, "log everything" would pass the test above while destroying the
    // signal the loud opt-out is supposed to carry.
    expect(logger.lines).toEqual([]);
  });

  /**
   * PIN THE UNCONDITIONAL SINK, not the injected one.
   *
   * Every other loudness test here asserts on the INJECTED logger — and that seam is
   * caller-supplied, so those tests stay green in a world where every production caller passes
   * `logger: { log: () => {} }` and no opt-out is ever seen. Mutation proved it: removing the
   * unconditional stderr emission killed nothing until this test existed. stderr is also the right
   * sink because CI reporters swallow stdout on PASSING tests — precisely when a quiet opt-out
   * spreads unnoticed.
   */
  it('emits to stderr even when the caller supplies a SILENCING logger', () => {
    const sb = mkSupabase();
    const seen = [];
    const realError = console.error;
    console.error = (m) => seen.push(String(m));
    try {
      insertGuarded(sb, 'ventures', REAL_ROW, {
        classification: CLASSIFICATION.DELIBERATELY_REAL,
        source: 'silenced.test.js', reason: 'tries to hide', logger: { log: () => {} },
      });
    } finally { console.error = realError; }
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatch(/OPT-OUT FIRED/);
    expect(seen[0]).toMatch(/silenced\.test\.js/);
  });

  it('emits to stderr on the SUCCESS path, not only on failure', () => {
    const sb = mkSupabase();
    const seen = [];
    const realError = console.error;
    console.error = (m) => seen.push(String(m));
    try {
      insertGuarded(sb, 'ventures', REAL_ROW, {
        classification: CLASSIFICATION.DELIBERATELY_REAL,
        source: 'test', reason: 'passes cleanly', logger: mkLogger(),
      });
    } finally { console.error = realError; }
    // The write succeeded AND the opt-out announced itself. Emitting only on failure would make a
    // spreading opt-out invisible — the exact property this guard exists to create.
    expect(sb.inserted).toHaveLength(1);
    expect(seen).toHaveLength(1);
  });

  it('refuses a WHITESPACE-ONLY reason, matching the allowlist loader definition of blank', () => {
    // The allowlist 60 lines away uses !v.trim(); the guard used !reason. Two halves of one SD
    // disagreeing on what "blank" means is how a blank justification gets in through the softer one.
    const sb = mkSupabase();
    for (const blank of ['   ', '\t', '\n ']) {
      expect(() => insertGuarded(sb, 'ventures', REAL_ROW, {
        classification: CLASSIFICATION.DELIBERATELY_REAL, source: 'test', reason: blank,
      })).toThrow(/requires a non-empty/);
    }
    expect(sb.inserted).toEqual([]);
  });

  it('refuses an opt-out with a blank reason', () => {
    const sb = mkSupabase();
    expect(() => insertGuarded(sb, 'ventures', REAL_ROW, {
      classification: CLASSIFICATION.DELIBERATELY_REAL, source: 'test', reason: '',
    })).toThrow(/requires a non-empty/);
    expect(sb.inserted).toEqual([]);
  });
});

describe('SANCTIONED_PERMANENT constrains — it is not a force flag', () => {
  const CANARY = { name: CANARY_NAME, is_demo: true };

  it('accepts the canary', () => {
    const sb = mkSupabase();
    insertGuarded(sb, 'ventures', CANARY, {
      classification: CLASSIFICATION.SANCTIONED_PERMANENT,
      source: 'run-canary-probe.mjs', reason: 'sanctioned live canary', logger: mkLogger(),
    });
    expect(sb.inserted).toHaveLength(1);
  });

  it('REJECTS a fixture-shaped row that is not in the sanctioned set', () => {
    // The whole reason TS-7b exists. Without the closed-set check this row would sail through and
    // the third class would be strictly WIDER than the boolean it replaced.
    const sb = mkSupabase();
    expect(() => insertGuarded(sb, 'ventures', { name: 'TS-fixture-impostor', is_demo: true }, {
      classification: CLASSIFICATION.SANCTIONED_PERMANENT,
      source: 'test', reason: 'trying it on', logger: mkLogger(),
    })).toThrow(/not in the closed sanctioned set/);
    expect(sb.inserted).toEqual([]);
  });

  it('REJECTS a sanctioned NAME whose row no longer reads as a fixture', () => {
    // The other half. Membership alone is not sufficient: if the canary stops tripping the
    // discriminant it has changed shape and the exemption no longer describes it.
    expect(evaluateDeclaration({ name: CANARY_NAME, is_demo: false },
      CLASSIFICATION.SANCTIONED_PERMANENT).ok).toBe(false);
  });

  it('imports CANARY_NAME rather than re-declaring it', () => {
    // A third hardcoded copy would be the parallel convention this SD exists to abolish.
    expect(SANCTIONED_PERMANENT_NAMES).toContain(CANARY_NAME);
    expect(SANCTIONED_PERMANENT_NAMES).toHaveLength(1);
    // Frozen ARRAY, not a frozen Set: Object.freeze does not freeze Set contents, so the old
    // export reported isFrozen()===true while .add() still worked.
    expect(Object.isFrozen(SANCTIONED_PERMANENT_NAMES)).toBe(true);
  });
});

describe('binding is CANONICAL, proven behaviourally rather than by import text', () => {
  it.each([
    ['ZZZ_scratch_venture'],
    ['UAT-thing'],
    ['job-1786000000000'],
  ])('classifies %s as a fixture — a name the watcher predicate returns FALSE for', (name) => {
    // A grep asserting the import path would pass against a re-export or a same-named local
    // constant. chairman-decision-watcher.js declares its OWN FIXTURE_VENTURE_NAME_RE with a
    // different alternation than the canonical export of that name, which is exactly why import
    // text is not proof of binding. These three names discriminate the two behaviourally.
    const sb = mkSupabase();
    insertGuarded(sb, 'ventures', { name }, {
      classification: CLASSIFICATION.FIXTURE, source: 'test',
    });
    expect(sb.inserted).toHaveLength(1);
  });
});

describe('the canonical-only scope of the negative assert is pinned, not left to read as coverage', () => {
  it('PASSES a row that canonical clears but chairman-actionable would still call a fixture', () => {
    // KNOWN, BOUNDED RESIDUAL. Dropping the epoch tail from the exemplar name clears canonical —
    // and chairman-actionable's UNANCHORED /-realdb-/ still hides the row from the chairman queue.
    // Renaming is the obvious way to make the negative assert pass, so this trap sits on the path
    // of least resistance. This test records the bound deliberately; closing it belongs to
    // QF-20260807-014 and to founding instance 4 on the parent SD.
    const sb = mkSupabase();
    insertGuarded(sb, 'ventures', { name: 'HCGate-RealDB-alpha' }, {
      classification: CLASSIFICATION.DELIBERATELY_REAL,
      source: 'test', reason: 'documents the canonical-only bound', logger: mkLogger(),
    });
    expect(sb.inserted).toHaveLength(1);
  });
});

describe('unsupported surfaces fail loudly rather than silently passing', () => {
  it('refuses a table with no row-shaped predicate', () => {
    const sb = mkSupabase();
    expect(() => insertGuarded(sb, 'venture_artifacts', { id: 'x' }, {
      classification: CLASSIFICATION.FIXTURE, source: 'test',
    })).toThrow(/no row-shaped predicate/);
    expect(sb.inserted).toEqual([]);
  });

  it('refuses an unknown classification instead of defaulting to permissive', () => {
    expect(evaluateDeclaration(NAME_BRANCH_FIXTURE, 'whatever').ok).toBe(false);
  });

  it('requires a source', () => {
    expect(() => insertGuarded(mkSupabase(), 'ventures', NAME_BRANCH_FIXTURE, {
      classification: CLASSIFICATION.FIXTURE,
    })).toThrow(/`source` is required/);
  });
});

describe('formatOptOutNotice content is asserted, not merely its existence', () => {
  it('carries table, classification, source and reason', () => {
    const line = formatOptOutNotice({
      table: 'ventures', classification: CLASSIFICATION.DELIBERATELY_REAL,
      source: 'a.mjs', reason: 'because',
    });
    for (const part of ['ventures', 'deliberately-real', 'a.mjs', 'because']) {
      expect(line).toContain(part);
    }
  });
});
