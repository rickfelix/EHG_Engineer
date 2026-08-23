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

  it('a row with no encoded_at is out of scope — never regressed', () => {
    const result = detectRatificationRegression({ encoded_at: null, marker_text: 'x' }, {
      newerManifest: manifestWithoutSection(),
      olderManifest: manifestWithSection('sec-1'),
      liveFileContent: 'x',
    });
    expect(result.regressed).toBe(false);
  });
});
