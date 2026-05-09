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
//   1. Single occurrence of `claiming_session_id` in the file (the QF-table NULL escalation).
//   2. That single occurrence sets the value to literal `null`.
//   3. No occurrence of `claiming_session_id` adjacent to (within ~200 chars of)
//      `strategic_directives_v2` to rule out stealth writes.
//   4. No `process.env.CLAUDE_SESSION_ID` -> `claiming_session_id` propagation pattern.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const SOURCE_PATH = path.resolve(__dirname, '../leo-create-sd.js');
const SOURCE = fs.readFileSync(SOURCE_PATH, 'utf8');

describe('QF-20260509-LEO-CREATE-CLAIM-PIN: leo-create-sd.js never writes non-null claiming_session_id', () => {
  it('TS-1: source contains exactly one occurrence of `claiming_session_id`', () => {
    const matches = SOURCE.match(/claiming_session_id/g) || [];
    // The single allowed occurrence is the QF-row NULL escalation (current line ~509).
    // If this count grows, FR-2/3/4 below must be updated to bracket the new sites.
    expect(matches.length).toBe(1);
  });

  it('TS-2: the single occurrence sets the value to literal `null` (NOT a session/process expression)', () => {
    // Match `claiming_session_id` followed by `:` and (optionally whitespace) then `null`
    // within the next ~50 chars. Anything else (e.g. `: sessionId`, `: process.env.X`,
    // `: getSessionId()`, etc.) fails this assertion.
    const idx = SOURCE.indexOf('claiming_session_id');
    expect(idx).toBeGreaterThan(-1);
    const window = SOURCE.slice(idx, idx + 60);
    // Must be `claiming_session_id: null` (allowing whitespace variants).
    expect(window).toMatch(/^claiming_session_id\s*:\s*null\b/);
  });

  it('TS-3: no `claiming_session_id` reference appears within 200 chars of `strategic_directives_v2`', () => {
    // Defense-in-depth: rule out any stealth INSERT/UPDATE to strategic_directives_v2
    // that includes claiming_session_id. The current single occurrence is in the QF
    // path (quick_fixes table), nowhere near strategic_directives_v2.
    const sdvIndices = [];
    let i = 0;
    while ((i = SOURCE.indexOf('strategic_directives_v2', i)) !== -1) {
      sdvIndices.push(i);
      i += 'strategic_directives_v2'.length;
    }
    expect(sdvIndices.length).toBeGreaterThan(0); // sanity — file does reference the table

    const claimIdx = SOURCE.indexOf('claiming_session_id');
    expect(claimIdx).toBeGreaterThan(-1);

    // Check distance from each strategic_directives_v2 reference to the claim site
    for (const sdvIdx of sdvIndices) {
      const distance = Math.abs(sdvIdx - claimIdx);
      expect(distance).toBeGreaterThan(200);
    }
  });

  it('TS-4: no propagation pattern from CLAUDE_SESSION_ID env into claiming_session_id', () => {
    // Pattern catches `claiming_session_id: process.env.CLAUDE_SESSION_ID`,
    // `claiming_session_id: ... CLAUDE_SESSION_ID`, etc.
    // This is the literal pattern called out by feedback 4c2b2e1a (sub-process node
    // identity bleeds into the SD claim).
    const claimIdx = SOURCE.indexOf('claiming_session_id');
    if (claimIdx === -1) return; // already covered by TS-1
    const window = SOURCE.slice(claimIdx, claimIdx + 200);
    expect(window).not.toMatch(/CLAUDE_SESSION_ID/);
    expect(window).not.toMatch(/process\.env/);
    expect(window).not.toMatch(/sessionId/);
    expect(window).not.toMatch(/getSession/);
  });

  it('TS-5: source does not import a session-claim helper that could write claiming_session_id', () => {
    // Sanity: leo-create-sd.js should not import any module that registers a session
    // claim against strategic_directives_v2. (sd-start.js is the canonical claimer.)
    expect(SOURCE).not.toMatch(/from\s+['"][^'"]*claim-session[^'"]*['"]/);
    expect(SOURCE).not.toMatch(/from\s+['"][^'"]*session-claim[^'"]*['"]/);
    expect(SOURCE).not.toMatch(/require\(['"][^'"]*claim-session[^'"]*['"]\)/);
  });
});
