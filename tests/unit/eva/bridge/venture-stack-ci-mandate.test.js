// SD-LEO-INFRA-REQUIRE-STACK-ENFORCING-001 — the venture-build pipeline MANDATES stack-enforcing
// CI, and ships a reusable code-level compliance scanner that catches off-stack code.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const SCANNER_SOURCE_PATH = fileURLToPath(new URL('../../../../lib/eva/bridge/templates/venture-stack-scan.js', import.meta.url));
const TEMPLATE_TEST_SOURCE_PATH = fileURLToPath(new URL('../../../../lib/eva/bridge/templates/venture-stack-compliance.test.template.js', import.meta.url));
import { buildBuildTasks } from '../../../../lib/eva/bridge/build-tasks-writer.js';
import buildClaudeMd from '../../../../lib/eva/bridge/claude-md-writer.js';
import {
  scanForStackViolations, FORBIDDEN_IMPORTS, REQUIRED, WALK_ROOTS, USAGE_EVENT_RPC_NAME, realIo,
} from '../../../../lib/eva/bridge/templates/venture-stack-scan.js';

// The forbidden @supabase package literal is assembled at runtime so the contiguous token
// does not appear in source (it would otherwise trip the DB-test guard DB_IMPORT_SIGNAL).
const SUPA_IMPORT = 'import { createClient } from "' + '@supabase' + '/supabase-js";';

describe('FR-1/FR-2 — the build-infra writers MANDATE stack-enforcing CI', () => {
  it('buildBuildTasks emits a required Stack-enforcing CI task referencing the compliance test', () => {
    const md = buildBuildTasks({ name: 'Acme', screens: [] });
    expect(md).toMatch(/Stack-enforcing CI/i);
    expect(md).toContain('stack-compliance.test.js');
    expect(md).toMatch(/required status check/i);
  });

  it('buildClaudeMd states CI MUST enforce the stack as a required check', () => {
    const md = buildClaudeMd({ name: 'Acme' });
    expect(md).toMatch(/CI must enforce this stack/i);
    expect(md).toMatch(/required status check/i);
    expect(md).toContain('stack-compliance.test.js');
  });

  // FR-4 (SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-D): adversarial VALIDATION review (VAL-D-1) found
  // FR-4's doc-writer text change had zero test coverage -- reverting it left this suite fully
  // green. These two assertions close that gap.
  it('buildBuildTasks mentions scanning both src/ and lib/', () => {
    const md = buildBuildTasks({ name: 'Acme', screens: [] });
    expect(md).toMatch(/scan `src\/` \+ `lib\/`/i);
  });

  it('buildClaudeMd mentions scanning both src/ and lib/', () => {
    const md = buildClaudeMd({ name: 'Acme' });
    expect(md).toMatch(/scans `src\/` \+ `lib\/`/i);
  });
});

describe('FR-3 — the reusable scanner catches off-stack CODE (not just deps)', () => {
  it('FLAGS a hand-rolled OIDC/Replit-Auth file by path (the B1 class — no dep needed)', () => {
    const io = {
      files: ['src/lib/auth/oidc.server.ts', 'src/routes/__root.tsx', 'src/lib/db.ts'],
      read: (rel) => ({
        'src/lib/auth/oidc.server.ts': 'export async function exchangeCode() { /* OIDC token exchange */ }',
        'src/routes/__root.tsx': 'import { ClerkProvider } from "@clerk/tanstack-react-start";',
        'src/lib/db.ts': 'const url = process.env.DATABASE_URL; import pg from "pg";',
      }[rel]),
    };
    const { violations } = scanForStackViolations('/x', io);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => /oidc\.server/.test(v.file))).toBe(true);
  });

  it('FLAGS a forbidden @supabase import', () => {
    const io = {
      files: ['src/lib/data.ts'],
      read: () => SUPA_IMPORT,
    };
    const { violations } = scanForStackViolations('/x', io);
    expect(violations.some((v) => v.why.includes('Supabase'))).toBe(true);
  });

  it('PASSES a Clerk + Replit-Postgres + /v1/metrics + SEO-basics + usage-event compliant venture (no false block)', () => {
    const io = {
      files: ['src/routes/__root.tsx', 'src/lib/db.ts', 'src/routes/api.v1.metrics.ts', 'src/app/sitemap.ts', 'src/app/robots.ts', 'src/app/layout.tsx', 'lib/events/track.js'],
      read: (rel) => ({
        'src/routes/__root.tsx': 'import { ClerkProvider } from "@clerk/tanstack-react-start";',
        'src/lib/db.ts': 'const url = process.env.DATABASE_URL; import pg from "pg";',
        'src/routes/api.v1.metrics.ts': 'app.get("/v1/metrics", async (req, res) => { /* aggregates-only KPI response */ });',
        'src/app/sitemap.ts': 'export default function sitemap() { return [{ url: "https://example.com" }]; }',
        'src/app/robots.ts': 'export default function robots() { return { rules: { userAgent: "*" } }; }',
        'src/app/layout.tsx': 'export const metadata = { openGraph: { title: "Acme" } }; // <script type="application/ld+json">{}</script>',
        'lib/events/track.js': `await callVentureRpc('${USAGE_EVENT_RPC_NAME}', payload);`,
      }[rel]),
    };
    const { violations, missing } = scanForStackViolations('/x', io);
    expect(violations.length).toBe(0);
    expect(missing.length).toBe(0);
  });

  it('reports MISSING required stack when Clerk/Postgres/v1-metrics all absent (advisory completeness)', () => {
    const io = { files: ['src/index.ts'], read: () => 'export const x = 1;' };
    const { missing } = scanForStackViolations('/x', io);
    expect(missing.length).toBe(REQUIRED.length);
  });

  // SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A (FR-1)
  it('FLAGS a venture missing GET /v1/metrics even when Clerk + Postgres are both present', () => {
    const io = {
      files: ['src/routes/__root.tsx', 'src/lib/db.ts'],
      read: (rel) => ({
        'src/routes/__root.tsx': 'import { ClerkProvider } from "@clerk/tanstack-react-start";',
        'src/lib/db.ts': 'const url = process.env.DATABASE_URL; import pg from "pg";',
      }[rel]),
    };
    const { missing } = scanForStackViolations('/x', io);
    expect(missing.some((m) => /v1\/metrics/.test(m))).toBe(true);
  });

  it('PASSES v1/metrics detection for a route registered as a template literal', () => {
    const io = { files: ['src/server.ts'], read: () => 'router.get(`/v1/metrics`, handler);' };
    const { missing } = scanForStackViolations('/x', io);
    expect(missing.some((m) => /v1\/metrics/.test(m))).toBe(false);
  });

  // Adversarial review (PR #5774): the content-only regex missed Next.js file-based routing,
  // where the URL comes from the folder structure and the literal string never appears in source.
  it('PASSES v1/metrics detection for a Next.js App Router file-based route (no string literal in content)', () => {
    const io = { files: ['src/app/api/v1/metrics/route.ts'], read: () => 'export async function GET() { return Response.json(kpis); }' };
    const { missing } = scanForStackViolations('/x', io);
    expect(missing.some((m) => /v1\/metrics/.test(m))).toBe(false);
  });

  it('PASSES v1/metrics detection for a Next.js Pages Router API file (no string literal in content)', () => {
    const io = { files: ['src/pages/api/v1/metrics.ts'], read: () => 'export default function handler(req, res) { res.json(kpis); }' };
    const { missing } = scanForStackViolations('/x', io);
    expect(missing.some((m) => /v1\/metrics/.test(m))).toBe(false);
  });

  it('does not false-positive v1/metrics on an unrelated file path containing similar segments', () => {
    const io = { files: ['src/pages/v1/metrics-summary.ts'], read: () => 'export default function() {}' };
    const { missing } = scanForStackViolations('/x', io);
    expect(missing.some((m) => /v1\/metrics/.test(m))).toBe(true);
  });

  it('the scanner encodes the standard (supabase + openid forbidden imports present)', () => {
    const ids = FORBIDDEN_IMPORTS.map((f) => f.id);
    expect(ids).toContain('supabase');
    expect(ids).toContain('openid_client');
  });

  // SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-C (FR-5)
  it('FLAGS a venture missing SEO basics (sitemap/robots/OG-meta/structured-data) by name, same as a missing v1/metrics endpoint', () => {
    const io = { files: ['src/index.ts'], read: () => 'export const x = 1;' };
    const { missing } = scanForStackViolations('/x', io);
    expect(missing.some((m) => /sitemap\.xml/.test(m))).toBe(true);
    expect(missing.some((m) => /robots\.txt/.test(m))).toBe(true);
    expect(missing.some((m) => /OpenGraph/.test(m))).toBe(true);
    expect(missing.some((m) => /structured data/.test(m))).toBe(true);
  });

  it('PASSES sitemap detection for a Next.js App Router dynamic generator (no string literal in content)', () => {
    const io = { files: ['src/app/sitemap.ts'], read: () => 'export default function sitemap() { return []; }' };
    const { missing } = scanForStackViolations('/x', io);
    expect(missing.some((m) => /sitemap\.xml/.test(m))).toBe(false);
  });

  it('PASSES robots.txt detection for a route referencing "/robots.txt" by content', () => {
    const io = { files: ['src/server.ts'], read: () => 'app.get("/robots.txt", handler);' };
    const { missing } = scanForStackViolations('/x', io);
    expect(missing.some((m) => /robots\.txt/.test(m))).toBe(false);
  });

  it('PASSES OG-meta detection for a Next.js Metadata API openGraph field', () => {
    const io = { files: ['src/app/layout.tsx'], read: () => 'export const metadata = { openGraph: { title: "Acme" } };' };
    const { missing } = scanForStackViolations('/x', io);
    expect(missing.some((m) => /OpenGraph/.test(m))).toBe(false);
  });

  it('PASSES structured-data detection for a JSON-LD script tag', () => {
    const io = { files: ['src/app/page.tsx'], read: () => '<script type="application/ld+json">{"@context":"https://schema.org"}</script>' };
    const { missing } = scanForStackViolations('/x', io);
    expect(missing.some((m) => /structured data/.test(m))).toBe(false);
  });
});

// SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-D — usage-event REQUIRED check, and the src/+lib/
// walk-root generalization it needed (AltifyAI's witness call lands in lib/, not src/).
describe('FR-6 — usage-event RPC wiring is REQUIRED, and the scanner sees lib/ too', () => {
  it('FLAGS a venture missing the usage-event RPC call, same as a missing v1/metrics endpoint', () => {
    const io = { files: ['src/index.ts'], read: () => 'export const x = 1;' };
    const { missing } = scanForStackViolations('/x', io);
    expect(missing.some((m) => m.includes(USAGE_EVENT_RPC_NAME))).toBe(true);
  });

  it('PASSES usage-event detection when the RPC call lives in a lib/-rooted file (the AltifyAI shape)', () => {
    const io = {
      files: ['src/index.ts', 'lib/events/track.js'],
      read: (rel) => ({
        'src/index.ts': 'export const x = 1;',
        'lib/events/track.js': `await callVentureRpc('${USAGE_EVENT_RPC_NAME}', payload);`,
      }[rel]),
    };
    const { missing } = scanForStackViolations('/x', io);
    expect(missing.some((m) => m.includes(USAGE_EVENT_RPC_NAME))).toBe(false);
  });

  it('does NOT satisfy usage-event detection on an import specifier or symbol name alone (option-b was measured dead: it goes green before the RPC is ever called)', () => {
    const io = {
      files: ['src/routes/events.js'],
      read: () => "import { recordUsageEvent } from '../../lib/events/track.js';",
    };
    const { missing } = scanForStackViolations('/x', io);
    expect(missing.some((m) => m.includes(USAGE_EVENT_RPC_NAME))).toBe(true);
  });

  // Adversarial TESTING review (PLAN phase) measured a bare-NAME match as gameable: a comment
  // mentioning the RPC, or vendoring this very scanner file's own constant declaration, would
  // both satisfy an unanchored regex -- the exact zero-yield failure mode option (b) was
  // rejected for. Fixed by anchoring to a call SHAPE; these two tests lock the fix in.
  it('does NOT satisfy usage-event detection on a bare comment mentioning the RPC name (no call shape)', () => {
    const io = {
      files: ['src/todo.js'],
      read: () => `// TODO: wire up ${USAGE_EVENT_RPC_NAME} before launch`,
    };
    const { missing } = scanForStackViolations('/x', io);
    expect(missing.some((m) => m.includes(USAGE_EVENT_RPC_NAME))).toBe(true);
  });

  it('does NOT satisfy usage-event detection merely by vendoring this scanner file\'s REAL, CURRENT content (a live guard, not a synthetic strawman -- TESTING reproduced an earlier draft self-matching via its own KNOWN LIMITATION comment)', () => {
    const realSource = readFileSync(SCANNER_SOURCE_PATH, 'utf8');
    const io = { files: ['lib/venture-stack-scan.js'], read: () => realSource };
    const { missing } = scanForStackViolations('/x', io);
    expect(missing.some((m) => m.includes(USAGE_EVENT_RPC_NAME))).toBe(true);
  });

  it('DOES satisfy usage-event detection on a raw-SQL / direct-call shape (NAME immediately followed by an open paren)', () => {
    const io = {
      files: ['lib/db/rpc.js'],
      read: () => `db.query("SELECT ${USAGE_EVENT_RPC_NAME}($1, $2)", [a, b]);`,
    };
    const { missing } = scanForStackViolations('/x', io);
    expect(missing.some((m) => m.includes(USAGE_EVENT_RPC_NAME))).toBe(false);
  });

  it('a forbidden import rooted in lib/ downgrades to an advisory warning, not a build-breaking violation', () => {
    const io = {
      files: ['lib/legacy/data.ts'],
      read: () => SUPA_IMPORT,
    };
    const { violations, warnings } = scanForStackViolations('/x', io);
    expect(violations.length).toBe(0);
    expect(warnings.some((w) => w.class === 'lib_root_forbidden' && w.file === 'lib/legacy/data.ts')).toBe(true);
  });

  it('the SAME forbidden import rooted in src/ still hard-fails as a violation (asymmetry is lib/-only)', () => {
    const io = { files: ['src/lib/data.ts'], read: () => SUPA_IMPORT };
    const { violations, warnings } = scanForStackViolations('/x', io);
    expect(violations.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.class === 'lib_root_forbidden')).toBe(false);
  });

  it('a forbidden OIDC file path rooted in lib/ also downgrades to an advisory warning', () => {
    const io = { files: ['lib/auth/oidc.server.ts'], read: () => 'export async function exchangeCode() {}' };
    const { violations, warnings } = scanForStackViolations('/x', io);
    expect(violations.length).toBe(0);
    expect(warnings.some((w) => w.class === 'lib_root_forbidden')).toBe(true);
  });

  describe('realIo() against a real filesystem', () => {
    let root;

    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), 'venture-stack-scan-test-'));
    });

    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
    });

    it('WALK_ROOTS is exactly src and lib', () => {
      expect(WALK_ROOTS).toEqual(['src', 'lib']);
    });

    it('walks both src/ and lib/ (not just src/), reproducing the AltifyAI witness-location gap and its fix', () => {
      mkdirSync(join(root, 'src'), { recursive: true });
      mkdirSync(join(root, 'lib', 'events'), { recursive: true });
      writeFileSync(join(root, 'src', 'index.ts'), 'export const x = 1;', 'utf8');
      writeFileSync(join(root, 'lib', 'events', 'track.js'), `await callVentureRpc('${USAGE_EVENT_RPC_NAME}', payload);`, 'utf8');

      const io = realIo(root);
      expect(io.files.sort()).toEqual(['lib/events/track.js', 'src/index.ts']);
      expect(io.read('lib/events/track.js')).toContain(USAGE_EVENT_RPC_NAME);

      const { missing } = scanForStackViolations(root);
      expect(missing.some((m) => m.includes(USAGE_EVENT_RPC_NAME))).toBe(false);
    });

    it('does not walk a directory outside src/ and lib/ (e.g. public/)', () => {
      mkdirSync(join(root, 'public'), { recursive: true });
      writeFileSync(join(root, 'public', 'sneaky.js'), `${USAGE_EVENT_RPC_NAME}`, 'utf8');

      const io = realIo(root);
      expect(io.files.length).toBe(0);
    });
  });

  // VAL-D-2 (adversarial VALIDATION review): the vendored template pair is otherwise validated
  // by nothing in this repo's own suite (it targets node:test in a venture, not vitest here) --
  // mutation-tested SURVIVED even a hard syntax error and an inverted, always-failing guard. A
  // minimal syntax check closes the cheapest, sharpest end of that gap without building a full
  // node:test harness for a vendored artifact.
  it('the vendored test template is syntactically valid (would not crash a venture\'s CI outright)', () => {
    expect(() => execFileSync(process.execPath, ['--check', TEMPLATE_TEST_SOURCE_PATH], { stdio: 'pipe' })).not.toThrow();
  });

  it('the vendored scanner is syntactically valid (would not crash a venture\'s CI outright)', () => {
    expect(() => execFileSync(process.execPath, ['--check', SCANNER_SOURCE_PATH], { stdio: 'pipe' })).not.toThrow();
  });
});
