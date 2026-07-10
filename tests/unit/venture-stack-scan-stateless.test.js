/**
 * SD-LEO-INFRA-VENTURE-DEPLOY-PIPELINE-001-E — stateless-process factory rule in the
 * vendored venture stack-CI scanner (deploy design §7 risk 6). Observe-only-first:
 * findings land in the ADDITIVE warnings array, never violations.
 */
import { describe, it, expect } from 'vitest';
import {
  scanForStackViolations, STATELESS_PROCESS_CHECKS, REQUIRED,
} from '../../lib/eva/bridge/templates/venture-stack-scan.js';

const COMPLIANT_BASE = `
import { ClerkExpressWithAuth } from '@clerk/express';
const dbUrl = process.env.DATABASE_URL;
`;

function io(files) {
  return { files: Object.keys(files), read: (f) => files[f] };
}

describe('STATELESS_PROCESS_CHECKS (observe-only warnings)', () => {
  it('flags express-rate-limit without a store: option (default MemoryStore)', () => {
    const r = scanForStackViolations('/x', io({
      'src/app.js': COMPLIANT_BASE + 'import rateLimit from \'express-rate-limit\';\napp.use(rateLimit({ windowMs: 60000, max: 100 }));',
    }));
    expect(r.warnings.map((w) => w.class)).toContain('stateless_process');
    expect(r.warnings[0].why).toMatch(/express-rate-limit without a store/);
    expect(r.violations).toHaveLength(0); // WARN class, never a violation
  });

  it('does NOT flag rate-limit wired to an external store', () => {
    const r = scanForStackViolations('/x', io({
      'src/app.js': COMPLIANT_BASE + 'import rateLimit from \'express-rate-limit\';\napp.use(rateLimit({ windowMs: 60000, store: new RedisStore({ client }) }));',
    }));
    expect(r.warnings).toHaveLength(0);
  });

  it('flags express-session without an external store', () => {
    const r = scanForStackViolations('/x', io({
      'src/session.js': COMPLIANT_BASE + 'import session from \'express-session\';\napp.use(session({ secret: process.env.SESSION_SECRET }));',
    }));
    expect(r.warnings.some((w) => w.why.match(/express-session without an external store/))).toBe(true);
  });

  it('flags a module-scope in-memory user store (the MarketLens class)', () => {
    const r = scanForStackViolations('/x', io({
      'src/users.js': COMPLIANT_BASE + 'const users = new Map();\nexport function addUser(u) { users.set(u.id, u); }',
    }));
    expect(r.warnings.some((w) => w.why.match(/module-scope in-memory user\/session\/account store/))).toBe(true);
  });

  it('compliant DB-backed venture produces zero stateless-process warnings', () => {
    const r = scanForStackViolations('/x', io({
      'src/app.js': COMPLIANT_BASE + 'import rateLimit from \'express-rate-limit\';\napp.use(rateLimit({ store: new PgStore(pool) }));\nimport session from \'express-session\';\napp.use(session({ store: new PgSession(pool), secret: s }));',
      'src/users.js': COMPLIANT_BASE + 'export async function addUser(db, u) { await db.insert(usersTable).values(u); }',
    }));
    expect(r.warnings).toHaveLength(0);
  });

  it('does NOT flag non-store-named module Maps (bounded false-positive surface)', () => {
    const r = scanForStackViolations('/x', io({
      'src/cache.js': COMPLIANT_BASE + 'const routeCache = new Map();\nconst memo = {};',
    }));
    expect(r.warnings).toHaveLength(0);
  });
});

describe('additive return shape (existing consumers untouched)', () => {
  it('violations/requiredPresent/missing semantics unchanged on legacy fixtures', () => {
    const r = scanForStackViolations('/x', io({
      'src/bad.js': 'import { createClient } from \'@supabase/supabase-js\';',
      'src/auth/oidc.server.ts': 'export const oidc = 1;',
    }));
    expect(r.violations.length).toBeGreaterThanOrEqual(2); // supabase import + forbidden path
    // SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A added a 3rd REQUIRED entry (v1_metrics)
    // after this test was first written — assert against REQUIRED.length rather than a
    // hardcoded count so future REQUIRED additions don't silently break this fixture.
    expect(r.missing.length).toBe(REQUIRED.length); // clerk + replit_postgres + v1_metrics all absent
    expect(Array.isArray(r.warnings)).toBe(true); // additive key present
  });

  it('every check has the {id, test, why} contract shape', () => {
    for (const c of STATELESS_PROCESS_CHECKS) {
      expect(typeof c.id).toBe('string');
      expect(typeof c.test).toBe('function');
      expect(typeof c.why).toBe('string');
    }
  });
});
