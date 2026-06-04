/**
 * QF-20260511-016: regression-pin that claimGuard re-affirms SD-row claim
 * columns on every success branch (already_owned + adopted_same_conversation +
 * newly_acquired), defending against cascade-trigger overreach / mid-claim
 * UPDATEs that may have cleared claiming_session_id or is_working_on.
 *
 * Closes feedback 67de177a.
 *
 * Static-pin pattern: read source via fs, assert the helper + 3 invocations
 * appear in expected positions. Mocking-independent.
 *
 * SD-LEO-INFRA-SESSION-AWARE-AUTO-001 (FR-1b): the QF branch of
 * reaffirmClaimColumns no longer touches the quick_fixes table inline — it
 * delegates to the shared fail-closed CAS helper claimQuickFix so a reaffirm
 * cannot clobber a DIFFERENT live holder's claim. The QF-table write contract
 * itself is pinned by tests/unit/qf-claim-cas.test.js; this file pins that the
 * branch routes through the helper and that no inline NON-CAS update returns.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_PATH = path.resolve(__dirname, '../../lib/claim-guard.mjs');
const src = readFileSync(SRC_PATH, 'utf8');

describe('claim-guard: reaffirmClaimColumns (QF-20260511-016)', () => {
  test('reaffirmClaimColumns helper is declared', () => {
    expect(src).toMatch(/async\s+function\s+reaffirmClaimColumns\s*\(/);
  });

  test('helper writes claiming_session_id + is_working_on for SDs', () => {
    const fnStart = src.indexOf('async function reaffirmClaimColumns');
    expect(fnStart).toBeGreaterThan(0);
    const fnEnd = src.indexOf('\n}\n', fnStart);
    const fnBody = src.slice(fnStart, fnEnd);
    expect(fnBody).toMatch(/strategic_directives_v2/);
    expect(fnBody).toMatch(/claiming_session_id:\s*sessionId/);
    expect(fnBody).toMatch(/is_working_on:\s*true/);
  });

  test('helper claims QFs via the shared fail-closed CAS (SD-LEO-INFRA-SESSION-AWARE-AUTO-001 FR-1b)', () => {
    // FR-1b moved the QF write-path out of an inline NON-CAS
    // `.from('quick_fixes').update(...)` and into the shared fail-closed CAS
    // helper claimQuickFix (lib/quick-fix-claim.mjs), so a reaffirm can no
    // longer clobber a DIFFERENT live holder's claim. The QF branch is still
    // gated on the QF- prefix; the actual quick_fixes table write now lives in
    // the CAS helper (pinned separately by qf-claim-cas.test.js). Pin the new
    // contract: the QF branch delegates to claimQuickFix rather than touching
    // the table inline.
    const fnStart = src.indexOf('async function reaffirmClaimColumns');
    const fnEnd = src.indexOf('\n}\n', fnStart);
    const fnBody = src.slice(fnStart, fnEnd);
    expect(fnBody).toMatch(/sdKey\.startsWith\('QF-'\)/);
    expect(fnBody).toMatch(/claimQuickFix\(supabase,\s*sdKey,\s*sessionId\)/);
    // The non-CAS inline update on quick_fixes must NOT be reintroduced.
    expect(fnBody).not.toMatch(/from\(\s*['"]quick_fixes['"]\s*\)\s*[\s\S]{0,80}update\(/);
  });

  test('Case 1 (already_owned) calls reaffirmClaimColumns before return', () => {
    const ownClaimIdx = src.indexOf("status: 'already_owned'");
    expect(ownClaimIdx).toBeGreaterThan(0);
    const before = src.slice(0, ownClaimIdx);
    const lastReaffirm = before.lastIndexOf('reaffirmClaimColumns(supabase');
    expect(lastReaffirm).toBeGreaterThan(0);
    // Helper call must be within ~500 chars of the return (same branch body)
    expect(ownClaimIdx - lastReaffirm).toBeLessThan(500);
  });

  test('Case 2A (adopted_same_conversation) calls reaffirmClaimColumns before return', () => {
    const adoptedIdx = src.indexOf("status: 'adopted_same_conversation'");
    expect(adoptedIdx).toBeGreaterThan(0);
    const before = src.slice(0, adoptedIdx);
    const lastReaffirm = before.lastIndexOf('reaffirmClaimColumns(supabase');
    expect(lastReaffirm).toBeGreaterThan(0);
    expect(adoptedIdx - lastReaffirm).toBeLessThan(500);
  });

  test('Case 3 (newly_acquired) calls reaffirmClaimColumns before return', () => {
    const newlyIdx = src.indexOf("status: 'newly_acquired'");
    expect(newlyIdx).toBeGreaterThan(0);
    const before = src.slice(0, newlyIdx);
    const lastReaffirm = before.lastIndexOf('reaffirmClaimColumns(supabase');
    expect(lastReaffirm).toBeGreaterThan(0);
    expect(newlyIdx - lastReaffirm).toBeLessThan(500);
  });

  test('no remaining inline .update on strategic_directives_v2 claim cols in claimGuard (post-extraction)', () => {
    // Helper function is the single canonical write-path; ensure callers don't
    // reintroduce inline updates that would duplicate or diverge from it.
    const guardStart = src.indexOf('export async function claimGuard');
    const guardEnd = src.indexOf('\nexport function formatClaimFailure', guardStart);
    expect(guardStart).toBeGreaterThan(0);
    expect(guardEnd).toBeGreaterThan(guardStart);
    const guardBody = src.slice(guardStart, guardEnd);
    expect(guardBody).not.toMatch(/from\(\s*['"]strategic_directives_v2['"]\s*\)\s*[\s\S]{0,80}update\(\s*\{\s*claiming_session_id/);
  });
});
