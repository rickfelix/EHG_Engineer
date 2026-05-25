// QF-20260525-658 (ENF-05, RCA 6188492f): the Supabase schema pre-flight gate
// must fire on a real EXECUTION (node -e "...supabase.from('t')...") but pass
// through a quoted MENTION inside echo / grep / git commit / gh pr --body.
// Same quoted-mention class as ENF-15 (#3929) / ENF-12 (#3932); fix is
// governing-command detection rather than operative-command anchoring.

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isSupabaseExecution, SUPABASE_PATTERNS } = require(
  path.resolve(__dirname, '../lib/supabase-operative.cjs')
);

describe('ENF-05 isSupabaseExecution: executions detected (validate)', () => {
  it('node -e inline supabase.from(...) is an execution', () => {
    expect(isSupabaseExecution(`node -e "supabase.from('ventures').select('*')"`)).toBe(true);
  });
  it('node -e inline .rpc(...) is an execution', () => {
    expect(isSupabaseExecution(`node -e "await s.rpc('release_sd', { p: 1 })"`)).toBe(true);
  });
  it('chained cd && node -e is an execution (governing prog after &&)', () => {
    expect(isSupabaseExecution(`cd /tmp && node -e "supabase.from('feedback').select()"`)).toBe(true);
  });
  it('direct .mjs script invocation with inline call arg is an execution', () => {
    expect(isSupabaseExecution(`./scripts/probe.mjs "supabase.from('ventures')"`)).toBe(true);
  });
  it('tsx runner is an execution', () => {
    expect(isSupabaseExecution(`tsx -e "supabase.from('ventures')"`)).toBe(true);
  });
});

describe('ENF-05 isSupabaseExecution: quoted mentions pass through (skip)', () => {
  it('echo mention does not count as execution', () => {
    expect(isSupabaseExecution(`echo "use supabase.from('ventures') here"`)).toBe(false);
  });
  it('git commit -m mention does not count (reported FP class)', () => {
    expect(isSupabaseExecution(`git commit -m "fix .from('feedback') query bug"`)).toBe(false);
  });
  it('gh pr create --body mention does not count', () => {
    expect(isSupabaseExecution(`gh pr create --body "calls supabase.from('sd_v2') then .rpc('x')"`)).toBe(false);
  });
  it('grep over a pattern does not count', () => {
    expect(isSupabaseExecution(`grep -r ".from('ventures')" scripts/`)).toBe(false);
  });
  it('git commit message that merely names node -e does not count (governor is git)', () => {
    expect(isSupabaseExecution(`git commit -m "use node -e to call supabase.from('t')"`)).toBe(false);
  });
  it('a real node run followed by an echo mention: the mention is governed by echo → skip', () => {
    // The script's own calls live in the file (not the command text); the only
    // pattern in the command line is the echo mention, governed by echo.
    expect(isSupabaseExecution(`node scripts/x.mjs && echo "supabase.from('t')"`)).toBe(false);
  });
});

describe('ENF-05 isSupabaseExecution: edge cases', () => {
  it('no supabase pattern → false', () => {
    expect(isSupabaseExecution(`node -e "console.log(1)"`)).toBe(false);
  });
  it('non-string input → false', () => {
    expect(isSupabaseExecution(null)).toBe(false);
    expect(isSupabaseExecution(undefined)).toBe(false);
    expect(isSupabaseExecution('')).toBe(false);
  });
  it('SUPABASE_PATTERNS remains a non-empty array (single source preserved)', () => {
    expect(Array.isArray(SUPABASE_PATTERNS)).toBe(true);
    expect(SUPABASE_PATTERNS.length).toBeGreaterThan(0);
  });
});
