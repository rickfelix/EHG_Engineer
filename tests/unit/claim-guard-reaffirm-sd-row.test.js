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

  test('helper writes claiming_session_id for QFs', () => {
    const fnStart = src.indexOf('async function reaffirmClaimColumns');
    const fnEnd = src.indexOf('\n}\n', fnStart);
    const fnBody = src.slice(fnStart, fnEnd);
    expect(fnBody).toMatch(/quick_fixes/);
    expect(fnBody).toMatch(/sdKey\.startsWith\('QF-'\)/);
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
