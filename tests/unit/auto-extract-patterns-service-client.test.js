/**
 * SD-REFILL-00CAKXC2 — auto-extract-patterns-from-retro.js must read retrospectives with the
 * SERVICE client, not the ANON client.
 *
 * retrospectives is RLS-protected and rows are written by the service role. With the anon
 * client the read returned zero rows, so the script threw 'Retrospective not found' for EVERY
 * generated retro and silently skipped pattern extraction (witnessed: retro 66938c8b).
 *
 * Static source assertions (the module creates its supabase client at top-level load, which
 * needs the service-role env, so importing it in a test is unsafe — assert the source instead;
 * matches the project convention for scripts, e.g. stale-sweep / check-git-state tests).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SCRIPT = path.resolve(__dirname, '../../scripts/auto-extract-patterns-from-retro.js');
const src = readFileSync(SCRIPT, 'utf8');

describe('auto-extract-patterns-from-retro uses the SERVICE client (SD-REFILL-00CAKXC2)', () => {
  it('imports createSupabaseServiceClient', () => {
    expect(src).toMatch(/import\s*\{\s*createSupabaseServiceClient\s*\}\s*from\s*['"]\.\.\/lib\/supabase-client\.js['"]/);
  });

  it('constructs the supabase client from the SERVICE factory', () => {
    expect(src).toMatch(/const\s+supabase\s*=\s*createSupabaseServiceClient\(\)/);
  });

  it('no longer uses the anon createSupabaseClient (the RLS-blind bug)', () => {
    // word-boundary so it does not match createSupabaseServiceClient
    expect(src).not.toMatch(/\bcreateSupabaseClient\b/);
  });

  it('still reads the RLS-protected retrospectives table', () => {
    expect(src).toMatch(/\.from\(\s*['"]retrospectives['"]\s*\)/);
  });
});
