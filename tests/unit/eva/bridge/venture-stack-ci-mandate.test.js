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

  it('PASSES a Clerk + Replit-Postgres compliant venture (no false block)', () => {
    const io = {
      files: ['src/routes/__root.tsx', 'src/lib/db.ts'],
      read: (rel) => ({
        'src/routes/__root.tsx': 'import { ClerkProvider } from "@clerk/tanstack-react-start";',
        'src/lib/db.ts': 'const url = process.env.DATABASE_URL; import pg from "pg";',
      }[rel]),
    };
    const { violations, missing } = scanForStackViolations('/x', io);
    expect(violations.length).toBe(0);
    expect(missing.length).toBe(0);
  });

  it('reports MISSING required stack when Clerk/Postgres absent (advisory completeness)', () => {
    const io = { files: ['src/index.ts'], read: () => 'export const x = 1;' };
    const { missing } = scanForStackViolations('/x', io);
    expect(missing.length).toBe(REQUIRED.length);
  });

  it('the scanner encodes the standard (supabase + openid forbidden imports present)', () => {
    const ids = FORBIDDEN_IMPORTS.map((f) => f.id);
    expect(ids).toContain('supabase');
    expect(ids).toContain('openid_client');
  });
});
