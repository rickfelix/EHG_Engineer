// QF-20260511-122 — static-guard regression pins.
//
// Pins the orchestrator's supabase client to SUPABASE_SERVICE_ROLE_KEY.
// resolveLinkedFeedbackRows runs cross-row SELECT/UPDATE on feedback rows
// protected by a table policy that blocks anon-tier access. Empirically
// validated in PR #3697: an anon-tier client returns zero matches even when
// the row exists and service-role can see it.
//
// These pins read the source file as a string (no module load) and assert
// that the key var stays service-role and the anon-tier fallback does NOT
// reappear. Closes feedback 5a6842ea + 8f16ca92.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');

function read(rel) {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

describe('QF-20260511-122 orchestrator service-role key pins', () => {
  it('orchestrator builds supabase client with SUPABASE_SERVICE_ROLE_KEY', () => {
    const src = read('scripts/modules/complete-quick-fix/orchestrator.js');
    // The key var must be sourced from SUPABASE_SERVICE_ROLE_KEY only — no anon fallback.
    expect(src).toMatch(/const\s+supabaseKey\s*=\s*process\.env\.SUPABASE_SERVICE_ROLE_KEY\s*;/);
  });

  it('orchestrator does NOT fall back to NEXT_PUBLIC_SUPABASE_ANON_KEY for the key var', () => {
    const src = read('scripts/modules/complete-quick-fix/orchestrator.js');
    // Scope the check to the completeQuickFix function body (avoid false-positives
    // from doc-strings or unrelated callers). Anchor on the function signature.
    const start = src.indexOf('export async function completeQuickFix');
    expect(start).toBeGreaterThan(-1);
    // Bounded window: the supabase-client setup happens in the first ~50 lines of the function.
    const body = src.slice(start, start + 2000);
    // The literal var name NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY) must not
    // appear in the key-var initializer region.
    expect(body).not.toMatch(/supabaseKey\s*=[^;]*NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    expect(body).not.toMatch(/supabaseKey\s*=[^;]*SUPABASE_ANON_KEY/);
  });

  it('orchestrator passes the service-role client into createClient at the top of completeQuickFix', () => {
    const src = read('scripts/modules/complete-quick-fix/orchestrator.js');
    const start = src.indexOf('export async function completeQuickFix');
    const body = src.slice(start, start + 2000);
    // createClient(supabaseUrl, supabaseKey) must be present, and the key var must be the
    // service-role-sourced one validated above.
    expect(body).toMatch(/createClient\(\s*supabaseUrl\s*,\s*supabaseKey\s*\)/);
  });

  it('orchestrator error message names SUPABASE_SERVICE_ROLE_KEY when credentials missing', () => {
    const src = read('scripts/modules/complete-quick-fix/orchestrator.js');
    const start = src.indexOf('export async function completeQuickFix');
    const body = src.slice(start, start + 2000);
    // Operators must be told which env var is missing.
    expect(body).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('orchestrator still imports resolveFeedback from lib/governance/resolve-feedback (FR-1 unchanged)', () => {
    // Sanity-pin: this fix must NOT regress the existing FR-1 wire-in.
    const src = read('scripts/modules/complete-quick-fix/orchestrator.js');
    expect(src).toMatch(/import\s*\{[^}]*\bresolveFeedback\b[^}]*\}\s*from\s*['"][^'"]*lib\/governance\/resolve-feedback(?:\.js)?['"]/);
  });
});
