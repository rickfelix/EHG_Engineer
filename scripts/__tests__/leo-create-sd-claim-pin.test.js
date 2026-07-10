// QF-20260509-LEO-CREATE-CLAIM-PIN
//
// Regression-pin: leo-create-sd.js MUST NOT write a non-null claiming_session_id
// on strategic_directives_v2 INSERT/UPDATE.
//
// Closes harness backlog feedback 4c2b2e1a-99bf-4041-8cda-065963605720 (filed 2026-05-02):
//   "leo-create-sd.js writes claiming_session_id to sub-process node identity, blocking
//    originating session from acting on its own SD via handoff/sd-start (foreign_claim error)"
//
// Status at filing: bug was real on 2026-05-02. Fixed by intervening refactors (PR #3477,
// #3536, #3577, #3578, #3626) which restructured the createSD INSERT shape. This test
// pins the fix so any future regression that reintroduces a writer to claiming_session_id
// in the SD path fails fast at unit-test time, not at "session blocked from acting on its
// own SD" time.
//
// Test approach: static-source assertions (mirrors leo-create-sd-smoke-detector.test.js
// FR-3 regression guard). Assertions:
//   1. Exactly two occurrences of `claiming_session_id` in the file: the QF-table NULL
//      escalation write, and (SD-LEO-INFRA-QF-SD-ESCALATION-LINK-CANONICAL-TRACK-001) a
//      manual-recovery SQL snippet inside a thrown Error's message — descriptive text for
//      a human operator, not a second programmatic write site.
//   2. BOTH occurrences set the value to literal `null`/`NULL` (NOT a session/process
//      expression) — the recovery text must stay consistent with the real write, since an
//      operator may copy-paste it verbatim.
//   3. Neither occurrence appears within ~200 chars of `strategic_directives_v2`, to rule
//      out stealth writes (or recovery instructions implying a write) to that table.
//   4. No `process.env.CLAUDE_SESSION_ID` -> `claiming_session_id` propagation pattern at
//      either occurrence.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
// SD-ARCH-HOTSPOT-LEO-CREATE-001: code moved verbatim to lib/sd-creation/source-adapters/qf.js
// (the two claiming_session_id occurrences) and scripts/modules/leo-create-sd/direct-lane.js —
// pin follows the code (the pinned source is the concatenation of the CLI + both moved lanes).
const SOURCE_PATHS = [
  path.resolve(__dirname, '../leo-create-sd.js'),
  path.resolve(__dirname, '../../lib/sd-creation/source-adapters/qf.js'),
  path.resolve(__dirname, '../modules/leo-create-sd/direct-lane.js'),
];
const SOURCE = SOURCE_PATHS.map(p => fs.readFileSync(p, 'utf8')).join('\n');

function allIndicesOf(haystack, needle) {
  const indices = [];
  let i = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    indices.push(i);
    i += needle.length;
  }
  return indices;
}

describe('QF-20260509-LEO-CREATE-CLAIM-PIN: leo-create-sd.js never writes non-null claiming_session_id', () => {
  it('TS-1: source contains exactly two occurrences of `claiming_session_id` (the QF-row write + its recovery-text echo)', () => {
    const matches = SOURCE.match(/claiming_session_id/g) || [];
    // Occurrence 1: the QF-row NULL escalation write (inside the withRetry-wrapped update).
    // Occurrence 2: the manual-recovery SQL text inside createFromQF's thrown Error message
    // (SD-LEO-INFRA-QF-SD-ESCALATION-LINK-CANONICAL-TRACK-001 FR-2) — a string literal
    // describing recovery for a human, not code that writes to the DB.
    // If this count grows further, TS-2/3/4 below must be updated to bracket the new sites.
    expect(matches.length).toBe(2);
  });

  it('TS-2: every occurrence sets the value to literal `null`/`NULL` (NOT a session/process expression)', () => {
    // Match `claiming_session_id` followed by `:` or `=` and (optionally whitespace) then
    // null/NULL within the next ~50 chars. Anything else (e.g. `: sessionId`,
    // `: process.env.X`, `: getSessionId()`, etc.) fails this assertion.
    const indices = allIndicesOf(SOURCE, 'claiming_session_id');
    expect(indices.length).toBe(2);
    for (const idx of indices) {
      const window = SOURCE.slice(idx, idx + 60);
      expect(window).toMatch(/^claiming_session_id\s*[:=]\s*null\b/i);
    }
  });

  it('TS-3: no `claiming_session_id` reference appears within 200 chars of `strategic_directives_v2`', () => {
    // Defense-in-depth: rule out any stealth INSERT/UPDATE to strategic_directives_v2
    // that includes claiming_session_id (or recovery text implying one). Both occurrences
    // are in the QF path (quick_fixes table), nowhere near strategic_directives_v2.
    const sdvIndices = allIndicesOf(SOURCE, 'strategic_directives_v2');
    expect(sdvIndices.length).toBeGreaterThan(0); // sanity — file does reference the table

    const claimIndices = allIndicesOf(SOURCE, 'claiming_session_id');
    expect(claimIndices.length).toBe(2);

    // Check distance from each strategic_directives_v2 reference to each claim site
    for (const sdvIdx of sdvIndices) {
      for (const claimIdx of claimIndices) {
        const distance = Math.abs(sdvIdx - claimIdx);
        expect(distance).toBeGreaterThan(200);
      }
    }
  });

  it('TS-4: no propagation pattern from CLAUDE_SESSION_ID env into claiming_session_id (either occurrence)', () => {
    // Pattern catches `claiming_session_id: process.env.CLAUDE_SESSION_ID`,
    // `claiming_session_id: ... CLAUDE_SESSION_ID`, etc.
    // This is the literal pattern called out by feedback 4c2b2e1a (sub-process node
    // identity bleeds into the SD claim).
    const claimIndices = allIndicesOf(SOURCE, 'claiming_session_id');
    if (claimIndices.length === 0) return; // already covered by TS-1
    for (const claimIdx of claimIndices) {
      const window = SOURCE.slice(claimIdx, claimIdx + 200);
      expect(window).not.toMatch(/CLAUDE_SESSION_ID/);
      expect(window).not.toMatch(/process\.env/);
      expect(window).not.toMatch(/sessionId/);
      expect(window).not.toMatch(/getSession/);
    }
  });

  it('TS-5: source does not import a session-claim helper that could write claiming_session_id', () => {
    // Sanity: leo-create-sd.js should not import any module that registers a session
    // claim against strategic_directives_v2. (sd-start.js is the canonical claimer.)
    expect(SOURCE).not.toMatch(/from\s+['"][^'"]*claim-session[^'"]*['"]/);
    expect(SOURCE).not.toMatch(/from\s+['"][^'"]*session-claim[^'"]*['"]/);
    expect(SOURCE).not.toMatch(/require\(['"][^'"]*claim-session[^'"]*['"]\)/);
  });
});
