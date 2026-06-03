// venture-stack-compliance — DROP-IN venture CI guard (EHG venture-stack standard).
// SD-LEO-INFRA-REQUIRE-STACK-ENFORCING-001 (FR-3).
//
// VENDOR BOTH files into your venture next to each other, e.g.:
//   tests/stack-compliance.test.js   (this file)
//   tests/venture-stack-scan.js      (the pure scanner it imports)
// then run in CI on every PR:   node --test
// Dependency-free (node:test + node: builtins) so it runs under any toolchain (Bun/npm/pnpm).
//
// It FAILS if venture src imports @supabase, contains hand-rolled OIDC / Replit-Auth files
// (e.g. src/lib/auth/oidc.server.ts), or is missing the required stack (Clerk + Replit Postgres).
// This is the per-PR (per-leaf) CODE gate the platform's stage-19 artifact gate cannot provide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanForStackViolations } from './venture-stack-scan.js';

// Scans <root>/src. Defaults to the repo root (cwd); override for tests via VENTURE_STACK_ROOT.
const ROOT = process.env.VENTURE_STACK_ROOT || process.cwd();

test('venture uses NO forbidden stack (@supabase / Replit Auth / OIDC)', () => {
  const { violations } = scanForStackViolations(ROOT);
  assert.equal(
    violations.length, 0,
    `forbidden stack found:\n${violations.map((v) => `  - ${v.file}: ${v.why}`).join('\n')}`,
  );
});

test('venture HAS the required stack (Clerk + Replit Postgres)', () => {
  const { missing } = scanForStackViolations(ROOT);
  assert.equal(missing.length, 0, `missing required stack: ${missing.join('; ')}`);
});
