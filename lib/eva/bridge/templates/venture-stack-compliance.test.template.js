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
// (e.g. src/lib/auth/oidc.server.ts), or is missing the required stack (Clerk + Replit Postgres +
// GET /v1/metrics + SEO basics + the shared usage-event RPC). Forbidden-tech enforcement is
// src/-scoped and build-breaking; the same class of finding rooted in lib/ is advisory-only
// (see the warnings test below) so broadening the scan to lib/ cannot retroactively hard-fail a
// venture's CI on pre-existing lib/ content (SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-D).
// This is the per-PR (per-leaf) CODE gate the platform's stage-19 artifact gate cannot provide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanForStackViolations } from './venture-stack-scan.js';

// Scans <root>/src and <root>/lib. Defaults to the repo root (cwd); override for tests via VENTURE_STACK_ROOT.
const ROOT = process.env.VENTURE_STACK_ROOT || process.cwd();

test('venture uses NO forbidden stack (@supabase / Replit Auth / OIDC)', () => {
  const { violations } = scanForStackViolations(ROOT);
  assert.equal(
    violations.length, 0,
    `forbidden stack found:\n${violations.map((v) => `  - ${v.file}: ${v.why}`).join('\n')}`,
  );
});

test('venture HAS the required stack (Clerk + Replit Postgres + GET /v1/metrics + SEO basics + usage-event RPC)', () => {
  const { missing } = scanForStackViolations(ROOT);
  assert.equal(missing.length, 0, `missing required stack: ${missing.join('; ')}`);
});

// Advisory-only (never fails the build): forbidden-tech findings rooted in lib/ (and any future
// WARN-class check) land in the additive `warnings` array, which the two tests above never read.
// Print them so they stay VISIBLE in CI logs instead of silently disappearing.
test('venture-stack advisory warnings (non-blocking, printed for visibility)', () => {
  const { warnings } = scanForStackViolations(ROOT);
  if (warnings.length > 0) {
    console.warn(
      `venture-stack-scan: ${warnings.length} advisory warning(s) (non-blocking, does not fail CI):\n`
      + warnings.map((w) => `  - [${w.class}] ${w.file}: ${w.why}`).join('\n'),
    );
  }
});
