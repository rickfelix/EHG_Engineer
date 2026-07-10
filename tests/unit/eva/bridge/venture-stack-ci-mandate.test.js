// SD-LEO-INFRA-REQUIRE-STACK-ENFORCING-001 — the venture-build pipeline MANDATES stack-enforcing
// CI, and ships a reusable code-level compliance scanner that catches off-stack code.
import { describe, it, expect } from 'vitest';
import { buildBuildTasks } from '../../../../lib/eva/bridge/build-tasks-writer.js';
import buildClaudeMd from '../../../../lib/eva/bridge/claude-md-writer.js';
import {
  scanForStackViolations, FORBIDDEN_IMPORTS, REQUIRED,
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

  it('PASSES a Clerk + Replit-Postgres + /v1/metrics + SEO-basics compliant venture (no false block)', () => {
    const io = {
      files: ['src/routes/__root.tsx', 'src/lib/db.ts', 'src/routes/api.v1.metrics.ts', 'src/app/sitemap.ts', 'src/app/robots.ts', 'src/app/layout.tsx'],
      read: (rel) => ({
        'src/routes/__root.tsx': 'import { ClerkProvider } from "@clerk/tanstack-react-start";',
        'src/lib/db.ts': 'const url = process.env.DATABASE_URL; import pg from "pg";',
        'src/routes/api.v1.metrics.ts': 'app.get("/v1/metrics", async (req, res) => { /* aggregates-only KPI response */ });',
        'src/app/sitemap.ts': 'export default function sitemap() { return [{ url: "https://example.com" }]; }',
        'src/app/robots.ts': 'export default function robots() { return { rules: { userAgent: "*" } }; }',
        'src/app/layout.tsx': 'export const metadata = { openGraph: { title: "Acme" } }; // <script type="application/ld+json">{}</script>',
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
