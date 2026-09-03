/**
 * SD-LEO-INFRA-CHAIRMAN-RATIFICATION-LEDGER-001 FR-4 / US-004 (TS-6, TS-7, TS-8a, TS-8b).
 *
 * NOTE ON FILE EXTENSION: the PRD's implementation_context names this file
 * `ratification-regression-detector.test.mjs`, but vitest.config.js's `unit` project only
 * globs `**\/*.test.js` (plus two narrowly-anchored `.test.mjs` allowlists neither of which
 * cover lib/chairman/) — a bare `.test.mjs` here would be CI-invisible (see vitest.config.js's
 * own comment on this exact class of defect: "leaving them CI-unreachable"). Named `.test.js`
 * instead, under `__tests__/` matching ratification-writer.test.js's sibling precedent, so the
 * existing `**\/__tests__/**\/*.test.js` glob picks it up. The module under test stays `.mjs`
 * per the PRD; only the test file's extension differs.
 */
import { describe, it, expect } from 'vitest';
import {
  detectSectionRemoved,
  detectMarkerMissing,
  detectRatificationRegression,
} from '../ratification-regression-detector.mjs';

const manifestWithSection = (id, hash = 'h1') => ({
  byId: { [id]: hash, 'other-section': 'unrelated-hash' },
  meta: { [id]: { section_type: 'protocol', target_file: 'CLAUDE.md', title: 'Test Section' } },
  global: 'global-hash-a',
});
const manifestWithoutSection = () => ({
  byId: { 'other-section': 'unrelated-hash' },
  meta: {},
  global: 'global-hash-b',
});

describe('detectSectionRemoved (Stage 1)', () => {
  it('TS-6: trips when the section is present in older but absent from newer', () => {
    const older = manifestWithSection('sec-1');
    const newer = manifestWithoutSection();
    expect(detectSectionRemoved(newer, older, 'sec-1')).toBe(true);
  });

  it('TS-6 negative control: reversed arguments do NOT trip', () => {
    const older = manifestWithSection('sec-1');
    const newer = manifestWithoutSection();
    // Deliberately swapped — mirrors a call-site argument-order bug.
    expect(detectSectionRemoved(older, newer, 'sec-1')).toBe(false);
  });

  it('TS-6 negative control: an ADDED (not removed) section does not trip', () => {
    const older = manifestWithoutSection();
    const newer = manifestWithSection('sec-1');
    expect(detectSectionRemoved(newer, older, 'sec-1')).toBe(false);
  });

  it('TS-8a/TS-8b: a missing older manifest (first-ever snapshot) is a structural no-op, never a trip', () => {
    const newer = manifestWithSection('sec-1');
    expect(detectSectionRemoved(newer, undefined, 'sec-1')).toBe(false);
    expect(detectSectionRemoved(newer, null, 'sec-1')).toBe(false);
  });

  // SD-LEO-INFRA-SOLOMON-RATIFICATION-CAPTURE-001-B FR-2/TS-2: removed[].id is always a string
  // (Object.keys()); a numeric sectionId (4 of 8 live chairman_ratifications rows, per VALIDATION
  // evidence a7ff2a22) must still match via String() coercion on both sides.
  it('FR-2/TS-2: a numeric sectionId matches a string-keyed removed[] entry via coercion', () => {
    const older = manifestWithSection('601');
    const newer = manifestWithoutSection();
    expect(detectSectionRemoved(newer, older, 601)).toBe(true);
  });

  it('FR-2/TS-2: a genuinely different numeric id does NOT match (coercion normalizes type, not value)', () => {
    const older = manifestWithSection('601');
    const newer = manifestWithoutSection();
    expect(detectSectionRemoved(newer, older, 602)).toBe(false);
  });
});

describe('detectMarkerMissing (Stage 2)', () => {
  it('TS-7: trips when the marker text is absent from the live file content', () => {
    expect(detectMarkerMissing('CLAUDE.md now says something else entirely.', 'the ratified clause')).toBe(true);
  });

  it('no false positive when the marker text is present', () => {
    expect(detectMarkerMissing('...preamble... the ratified clause ...postamble...', 'the ratified clause')).toBe(false);
  });

  it('does not trip when no marker_text was ever recorded', () => {
    expect(detectMarkerMissing('any content', '')).toBe(false);
    expect(detectMarkerMissing('any content', null)).toBe(false);
  });

  it('treats unreadable/undefined live content as the marker being gone', () => {
    expect(detectMarkerMissing(undefined, 'the ratified clause')).toBe(true);
  });
});

describe('detectRatificationRegression (orchestrator)', () => {
  const encodedRow = {
    encoded_at: '2026-08-20T00:00:00Z',
    encoded_ref: { section_id: 'sec-1', manifest_hash: 'h1' },
    marker_text: 'the ratified clause',
  };

  it('TS-6: whole-section removal trips regressed via stage1, stage2 independent', () => {
    const result = detectRatificationRegression(encodedRow, {
      newerManifest: manifestWithoutSection(),
      olderManifest: manifestWithSection('sec-1'),
      liveFileContent: 'irrelevant — section gone',
    });
    expect(result.stage1).toBe(true);
    expect(result.regressed).toBe(true);
  });

  it('TS-7: within-section clause deletion trips via stage2 even though the section survived', () => {
    const result = detectRatificationRegression(encodedRow, {
      newerManifest: manifestWithSection('sec-1', 'h1'),
      olderManifest: manifestWithSection('sec-1', 'h1'),
      liveFileContent: 'the clause was quietly edited out',
    });
    expect(result.stage1).toBe(false);
    expect(result.stage2).toBe(true);
    expect(result.regressed).toBe(true);
  });

  it('TS-8a: first-ever manifest + marker present -> no trip, no error', () => {
    const result = detectRatificationRegression(encodedRow, {
      newerManifest: manifestWithSection('sec-1'),
      olderManifest: undefined,
      liveFileContent: '...the ratified clause...',
    });
    expect(result.stage1).toBe(false);
    expect(result.stage2).toBe(false);
    expect(result.regressed).toBe(false);
  });

  it('TS-8b: first-ever manifest + marker ABSENT -> stage2 still trips', () => {
    const result = detectRatificationRegression(encodedRow, {
      newerManifest: manifestWithSection('sec-1'),
      olderManifest: undefined,
      liveFileContent: 'the clause is gone',
    });
    expect(result.stage1).toBe(false);
    expect(result.stage2).toBe(true);
    expect(result.regressed).toBe(true);
  });

  describe('QF-20260901-107: markerInvalid vs a true regression', () => {
    it('marker missing now AND missing at encode time -> MARKER_INVALID, not regressed', () => {
      const result = detectRatificationRegression(encodedRow, {
        newerManifest: manifestWithSection('sec-1'),
        olderManifest: manifestWithSection('sec-1'),
        liveFileContent: 'no clause here today',
        encodeTimeFileContent: 'no clause here at encode time either',
      });
      expect(result.stage1).toBe(false);
      expect(result.stage2).toBe(true);
      expect(result.markerInvalid).toBe(true);
      expect(result.regressed).toBe(false);
    });

    it('marker missing now but PRESENT at encode time -> true regression, not markerInvalid', () => {
      const result = detectRatificationRegression(encodedRow, {
        newerManifest: manifestWithSection('sec-1'),
        olderManifest: manifestWithSection('sec-1'),
        liveFileContent: 'the clause is gone now',
        encodeTimeFileContent: '...the ratified clause was right here...',
      });
      expect(result.stage2).toBe(true);
      expect(result.markerInvalid).toBe(false);
      expect(result.regressed).toBe(true);
    });

    it('omitting encodeTimeFileContent entirely preserves the old (pre-QF) behavior exactly', () => {
      const result = detectRatificationRegression(encodedRow, {
        newerManifest: manifestWithSection('sec-1'),
        olderManifest: manifestWithSection('sec-1'),
        liveFileContent: 'the clause is gone',
      });
      expect(result.markerInvalid).toBe(false);
      expect(result.regressed).toBe(true);
    });

    it('stage1 (whole-section removal) always wins over markerInvalid — a real revert is never masked', () => {
      const result = detectRatificationRegression(encodedRow, {
        newerManifest: manifestWithoutSection(),
        olderManifest: manifestWithSection('sec-1'),
        liveFileContent: 'irrelevant — section gone',
        encodeTimeFileContent: 'also never had the marker',
      });
      expect(result.stage1).toBe(true);
      expect(result.markerInvalid).toBe(false);
      expect(result.regressed).toBe(true);
    });
  });

  it('a row with no encoded_at is out of scope — never regressed', () => {
    const result = detectRatificationRegression({ encoded_at: null, marker_text: 'x' }, {
      newerManifest: manifestWithoutSection(),
      olderManifest: manifestWithSection('sec-1'),
      liveFileContent: 'x',
    });
    expect(result.regressed).toBe(false);
  });
});


// ---------------------------------------------------------------------------------------------
// SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-B — contract coverage: OPT-IN and NON-BLOCKING.
//
// The point of these is the NEGATIVE assertion as much as the positive one. This information must
// never reach `regressed`, because the rows it surfaces are unrepairable in place: the ledger's
// append-only freeze trigger permits only the NULL-to-set transition, so re-encoding is rejected.
// A standing alert on rows nobody can action is how a lane stops being read.
// ---------------------------------------------------------------------------------------------
describe('detectRatificationRegression — contract coverage (opt-in, non-blocking)', () => {
  const cleanRow = {
    encoded_at: '2026-09-03T00:00:00Z',
    encoded_ref: { section_id: '601', manifest_hash: 'abc1234' },
    marker_text: 'the clause',
  };
  const present = { liveFileContent: 'the clause is here\n' };

  it('omitting contractCoverage behaves exactly as before (the opt-in guarantee)', () => {
    const r = detectRatificationRegression(cleanRow, present);
    expect(r.regressed).toBe(false);
    expect(r.contractsChecked).toBe(false);
    expect(r.contractsMissing).toEqual([]);
  });

  it('reports missing contracts WITHOUT setting regressed', () => {
    const r = detectRatificationRegression(cleanRow, {
      ...present,
      contractCoverage: { checked: true, missing: ['coordinator', 'solomon'] },
    });
    expect(r.contractsChecked).toBe(true);
    expect(r.contractsMissing).toEqual(['coordinator', 'solomon']);
    expect(r.regressed).toBe(false); // THE point: informational, never blocking
  });

  it('a full-coverage row reports checked with nothing missing', () => {
    const r = detectRatificationRegression(cleanRow, {
      ...present,
      contractCoverage: { checked: true, missing: [] },
    });
    expect(r.contractsChecked).toBe(true);
    expect(r.contractsMissing).toEqual([]);
    expect(r.regressed).toBe(false);
  });

  // 24 of 53 live rows have no derivable commit pin. Unmeasurable must read as UNCHECKED, not as
  // a clean pass and not as a miss — conflating either way would misstate the ledger.
  it('unmeasurable coverage reports unchecked rather than clean or missing', () => {
    const r = detectRatificationRegression(cleanRow, { ...present, contractCoverage: undefined });
    expect(r.contractsChecked).toBe(false);
    expect(r.contractsMissing).toEqual([]);
  });

  it('a genuine regression still reports regressed AND its contract shortfall, not one or the other', () => {
    // A row can be both. Collapsing them would hide whichever lost.
    const r = detectRatificationRegression(cleanRow, {
      liveFileContent: 'the marker is gone from this file\n',
      contractCoverage: { checked: true, missing: ['solomon'] },
    });
    expect(r.regressed).toBe(true);      // stage2 fired
    expect(r.contractsMissing).toEqual(['solomon']);
  });

  it('coverage never rescues a regression — a covered row with a deleted marker still regresses', () => {
    const r = detectRatificationRegression(cleanRow, {
      liveFileContent: 'marker deleted\n',
      contractCoverage: { checked: true, missing: [] },
    });
    expect(r.regressed).toBe(true);
  });

  it('an out-of-scope row (no encoded_at) returns the uniform shape rather than undefined fields', () => {
    const r = detectRatificationRegression({ encoded_ref: { section_id: '601' } }, {
      contractCoverage: { checked: true, missing: ['adam'] },
    });
    expect(r.regressed).toBe(false);
    expect(r.contractsChecked).toBe(false);
    expect(r.contractsMissing).toEqual([]);
  });

  it('a malformed contractCoverage is ignored rather than throwing', () => {
    for (const bad of [{ checked: true, missing: 'not-an-array' }, { checked: true }, {}, null]) {
      const r = detectRatificationRegression(cleanRow, { ...present, contractCoverage: bad });
      expect(r.contractsMissing).toEqual([]);
      expect(r.regressed).toBe(false);
    }
  });

  it('filters falsy entries out of the missing list', () => {
    const r = detectRatificationRegression(cleanRow, {
      ...present,
      contractCoverage: { checked: true, missing: ['adam', null, '', undefined, 'solomon'] },
    });
    expect(r.contractsMissing).toEqual(['adam', 'solomon']);
  });
});
