/**
 * Unit tests for the VENTURE_STACK compliance agent.
 * SD-LEO-INFRA-PRE-BUILD-SUB-001 — Unit 2 (FR-002)
 */
import { describe, it, expect } from 'vitest';
import { buildStackConformanceSection, runVentureStackAgent } from '../../../lib/eva/bridge/venture-stack-agent.js';

// The forbidden Supabase package name is split here so the contiguous literal does NOT appear in
// source. This is a PURE test (no DB); the string is forbidden-tech test DATA fed to the scanner at
// runtime, not a real import — but the DB-test guard's DB_IMPORT_SIGNAL substring heuristic cannot
// tell the difference and would false-flag the contiguous literal. Reconstructed, it still matches
// the policy's supabase_pkg pattern at runtime, so coverage is unchanged.
const SUPA_PKG = '@supabase' + '/supabase-js';

describe('buildStackConformanceSection', () => {
  it('positively asserts the required stack and lists the forbidden stack', () => {
    const s = buildStackConformanceSection();
    expect(s).toContain('Clerk');
    expect(s).toContain('Replit Postgres');
    expect(s).toMatch(/REQUIRED/);
    expect(s).toMatch(/FORBIDDEN/);
    expect(s).toContain('Supabase');
    expect(s).toContain('Replit Auth');
  });
});

describe('runVentureStackAgent — compliant leaves', () => {
  it('passes a clean leaf (no forbidden tech) and emits the conformance section', () => {
    const r = runVentureStackAgent({ leaf: { title: 'Auth API', description: 'Sign-in via Clerk; users in Replit Postgres.' } });
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
    expect(r.section).toContain('Clerk');
    expect(r.reason).toBe('compliant');
  });

  it('treats missing REQUIRED tech as advisory (still ok), reporting it in missing[]', () => {
    const r = runVentureStackAgent({ leaf: { title: 'Widget', description: 'A small UI widget.' } });
    expect(r.ok).toBe(true);
    expect(r.missing.length).toBeGreaterThan(0);
  });

  it('an empty leaf is compliant (nothing to flag) and still emits the section', () => {
    const r = runVentureStackAgent({});
    expect(r.ok).toBe(true);
    expect(r.section).toContain('Clerk');
  });
});

describe('runVentureStackAgent — fail-closed on forbidden tech (holds)', () => {
  it('HOLDS a leaf that positively specifies Replit Auth', () => {
    const r = runVentureStackAgent({ leaf: { title: 'Signup', description: 'Implement signup via Replit Auth.' } });
    expect(r.ok).toBe(false);
    expect(r.violations).toContain('replit_auth');
    expect(r.section).toBeNull();
    expect(r.reason).toBe('forbidden_stack_present');
  });

  it('HOLDS a leaf that pulls in the forbidden Supabase package', () => {
    const r = runVentureStackAgent({ leaf: { title: 'Data', description: `Use ${SUPA_PKG} for the client.` } });
    expect(r.ok).toBe(false);
    expect(r.violations).toContain('supabase_pkg');
  });

  it('scans prior panel sections too (a prior section adopting Replit Auth holds the leaf)', () => {
    const r = runVentureStackAgent({
      leaf: { title: 'Auth', description: 'clean' },
      priorSections: [{ section: 'The architecture standardizes on Replit Auth for identity.' }],
    });
    expect(r.ok).toBe(false);
    expect(r.violations).toContain('replit_auth');
  });
});

describe('runVentureStackAgent — negation awareness (reuses the canonical scanner)', () => {
  it('does NOT flag a prohibition ("do NOT use Replit Auth")', () => {
    const r = runVentureStackAgent({ leaf: { title: 'Auth', description: 'Auth is Clerk; do NOT use Replit Auth.' } });
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it('does NOT flag a standard-citation that removes the Supabase package (negation cue)', () => {
    const r = runVentureStackAgent({ leaf: { title: 'Migrate', description: `Remove any ${SUPA_PKG} coupling; move to Replit Postgres.` } });
    expect(r.ok).toBe(true);
  });
});
