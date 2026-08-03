/**
 * SD-LEO-INFRA-COORDINATION-BUS-ACCESS-001 FR-3 — no anon read path may exist on the bus reader.
 *
 * WHY THIS TEST EXISTS RATHER THAN A COMMENT. getReadClient fell back to the ANON client inside a
 * bare catch. That was harmless only while anon could read everything: the degradation was invisible
 * AND inconsequential, so nothing ever alarmed. FR-1 scopes anon SELECT off session_coordination,
 * and at that instant the same fallback starts returning ZERO ROWS and reporting them as an ordinary
 * empty result — "no permission" and "no activity" collapse into one observation and the reassuring
 * one is what gets rendered.
 *
 * A tombstone comment does not stop reintroduction; this does. The failure mode is silent by
 * construction, so the guard has to be a test, not a convention.
 *
 * NOTE ON WHAT THIS DOES *NOT* PROVE: passing here means the module exposes no anon read path. It
 * does not prove the seat-scoped policy is correct — that requires a NON-bypassing principal, since
 * service_role has rolbypassrls=true and cannot exercise the policy under test at all (PRD TS-2).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Mocked so this stays a UNIT test: worker-status.cjs pulls in the supabase client factory, and the
// DB-test guard correctly refuses a staged unit test that reaches a client constructor. Nothing here
// needs a real client — the assertions are about the module's SURFACE and SOURCE.
//
// Imported via ESM (not createRequire) specifically so vi.mock applies: createRequire bypasses
// vitest's module graph entirely, so the mock would silently not intercept and the guard's concern
// would remain real while the test looked compliant.
vi.mock('../../../lib/supabase-client.cjs', () => ({
  createSupabaseServiceClient: () => ({ from: () => ({}) }),
  createSupabaseClient: () => ({ from: () => ({}) }),
}));

const mod = await import('../../../lib/fleet/worker-status.cjs');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODULE_PATH = path.join(HERE, '../../../lib/fleet/worker-status.cjs');
const source = readFileSync(MODULE_PATH, 'utf8');

describe('FR-3: worker-status.cjs exposes no anon read path', () => {
  it('does NOT export getReadClient', () => {
    expect(Object.keys(mod)).not.toContain('getReadClient');
    expect(mod.getReadClient).toBeUndefined();
  });

  it('still exports getServiceClient — the point is removing the FALLBACK, not the reader', () => {
    // Positive control. Without this, a module that failed to load at all would also "pass" the
    // assertion above, and the suite would be reporting absence when it had measured nothing.
    expect(typeof mod.getServiceClient).toBe('function');
  });

  it('does not import the ANON client factory at all', () => {
    // An unused anon import is an invitation to re-wire the fallback. The module should have no
    // anon capability, not an idle one.
    const importLine = source.split('\n').find((l) => l.includes("require('../supabase-client.cjs')"));
    expect(importLine, 'the supabase-client import line should still exist').toBeTruthy();
    expect(importLine).not.toContain('createSupabaseClient');
    expect(importLine).toContain('createSupabaseServiceClient');
  });

  it('contains no catch-and-fall-back-to-anon construct anywhere in the module', () => {
    // Deliberately checks the SHAPE, not the old function name: reintroducing the hazard under a
    // different name is the likelier regression, and a name-based guard would miss it entirely.
    const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(stripped).not.toMatch(/catch\s*(\([^)]*\))?\s*\{\s*return\s+createSupabaseClient/);
    expect(stripped).not.toContain('createSupabaseClient(');
  });
});
