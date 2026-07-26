/**
 * SD-LEO-INFRA-DESTRUCTIVE-ACTION-SAFETY-001 FR-5 / TS-6.
 *
 * Pins the auth-carve-out audit as a standing regression test. The SD's item THREE was a
 * one-off audit whose result (zero mutating routes reachable without requireAuth) was a
 * point-in-time fact that would decay. This makes it executable.
 *
 * SAFETY: auditMounts performs NO file I/O. The mutation half of this test passes a
 * SYNTHETIC FIXTURE STRING, so server/index.js is never edited — and the last test asserts
 * the working tree is clean afterward. That constraint comes from a live fleet near-miss
 * where an agent mutated a production file in place to check a suite went red and left the
 * edit uncommitted.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { auditMounts } from '../../lib/audit-mounts.js';

const REPO = path.join(__dirname, '..', '..');
const INDEX_PATH = path.join(REPO, 'server', 'index.js');
const indexSource = fs.readFileSync(INDEX_PATH, 'utf8').replace(/\r\n/g, '\n');

/**
 * Build the route inventory by reading the mounted router modules. The I/O lives HERE, in
 * the test — auditMounts itself stays pure so a fixture can be substituted.
 */
function buildRouteInventory() {
  const inventory = {};
  for (const m of indexSource.matchAll(/import\s+(?:(\w+)|\{[^}]+\})\s+from\s+['"](\.[^'"]+)['"]/g)) {
    const spec = m[2];
    for (const candidate of [spec, `${spec}.js`]) {
      const file = path.resolve(path.dirname(INDEX_PATH), candidate);
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
      const src = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
      const routes = [];
      for (const r of src.matchAll(/\brouter\s*\.\s*(get|post|put|patch|delete|all)\s*\(\s*['"`]([^'"`]*)['"`]/g)) {
        routes.push({ method: r[1], path: r[2] });
      }
      inventory[spec] = routes;
      break;
    }
  }
  return inventory;
}

const routeInventory = buildRouteInventory();

describe('FR-5: auditMounts on the REAL server/index.js', () => {
  it('flags exactly the three signature-verified webhooks and nothing else', () => {
    const { findings, mountsScanned } = auditMounts({ indexSource, routeInventory });

    // These three are app.all() with no auth middleware BY DESIGN — each verifies a
    // provider signature inside its handler, which is the correct control for an inbound
    // webhook (the caller is Stripe/Twilio and cannot hold our credentials).
    //
    // This is an EXACT-MATCH assertion, deliberately not an allowlist baked into
    // auditMounts. An allowlist inside the audit would silently absorb a NEW carve-out;
    // asserting the exact set here means any additional finding fails this test and has to
    // be looked at by a human.
    expect(findings.map(f => f.path).sort()).toEqual([
      '/api/webhooks/stripe',
      '/api/webhooks/twilio-sms',
      '/api/webhooks/twilio-status',
    ]);
    expect(mountsScanned).toBeGreaterThan(10);
  });

  it('does NOT flag /api/github/pr-review-webhook — the mount-ordering case', () => {
    // The regression this encodes: reading each mount's declared middleware in isolation
    // reports this route as unauthenticated. It is not. app.use('/api/github', requireAuth, …)
    // at server/index.js:207 prefix-shadows the '/api' optionalAuth mount at :214, and
    // requireAuth runs for every request under that prefix whether or not the inner router
    // matches. That false positive was signalled before being verified; this test exists so
    // it cannot be reintroduced.
    const { findings } = auditMounts({ indexSource, routeInventory });
    expect(findings.some(f => f.path.includes('/api/github'))).toBe(false);
  });

  it('finds no comment claiming an auth check the handler does not perform', () => {
    // HEURISTIC, stated as such: keyword matching, not semantic understanding. The comment
    // this targets ("auth at RPC level (chairman check)") was deleted in PR #6499; this
    // keeps it from coming back unnoticed.
    const { commentClaims } = auditMounts({ indexSource, routeInventory });
    expect(commentClaims).toEqual([]);
  });
});

describe('FR-5 MUTATION: the audit actually discriminates', () => {
  // Every assertion above is a "nothing bad found" assertion, which a broken audit that
  // always returns zero findings would also satisfy. These prove it can say otherwise —
  // against fixture STRINGS, never against a real file.

  const FIXTURE_UNGUARDED = `
import optionalAuth from './middleware/auth.js';
import dangerRoutes from './routes/danger.js';
app.use('/api/danger', optionalAuth, dangerRoutes);
`;

  const FIXTURE_GUARDED = `
import requireAuth from './middleware/auth.js';
import dangerRoutes from './routes/danger.js';
app.use('/api/danger', requireAuth, dangerRoutes);
`;

  const FIXTURE_SHADOWED = `
import { requireAuth, optionalAuth } from './middleware/auth.js';
import safeRoutes from './routes/safe.js';
import dangerRoutes from './routes/danger.js';
app.use('/api/danger', requireAuth, safeRoutes);
app.use('/api', optionalAuth, dangerRoutes);
`;

  const INV = { './routes/danger.js': [{ method: 'post', path: '/wipe' }], './routes/safe.js': [] };

  // The shadowing case needs a route whose EFFECTIVE path lands under the guarded prefix.
  // First attempt used '/wipe', giving '/api/wipe' — which '/api/danger' does not prefix,
  // so the audit correctly reported a finding and the fixture was simply not reproducing
  // the real case. In the actual /api/github case, dashboard.js declares
  // '/github/pr-review-webhook' and is mounted at '/api', so the effective path is
  // '/api/github/pr-review-webhook' — under the guarded '/api/github' prefix. This mirrors
  // that shape.
  const INV_NESTED = { './routes/danger.js': [{ method: 'post', path: '/danger/wipe' }], './routes/safe.js': [] };

  it('FLAGS a mutating route under an unguarded optionalAuth mount', () => {
    const { findings } = auditMounts({ indexSource: FIXTURE_UNGUARDED, routeInventory: INV });
    expect(findings).toHaveLength(1);
    expect(findings[0].path).toBe('/api/danger/wipe');
  });

  it('CONTROL: the same fixture with requireAuth produces no finding', () => {
    const { findings } = auditMounts({ indexSource: FIXTURE_GUARDED, routeInventory: INV });
    expect(findings).toHaveLength(0);
  });

  it('respects mount ORDER: an earlier requireAuth prefix shadows a later optionalAuth mount', () => {
    // The synthetic form of the /api/github case, so the ordering rule is pinned
    // independently of that one real route continuing to exist.
    const { findings } = auditMounts({ indexSource: FIXTURE_SHADOWED, routeInventory: INV_NESTED });
    expect(findings).toHaveLength(0);
  });

  it('order matters in the other direction too: a LATER guard does not shadow', () => {
    const reversed = `
import { requireAuth, optionalAuth } from './middleware/auth.js';
import dangerRoutes from './routes/danger.js';
import safeRoutes from './routes/safe.js';
app.use('/api', optionalAuth, dangerRoutes);
app.use('/api/danger', requireAuth, safeRoutes);
`;
    const { findings } = auditMounts({ indexSource: reversed, routeInventory: INV });
    expect(findings).toHaveLength(1);
  });

  it('FLAGS a direct unguarded mutating route, and not its GET sibling', () => {
    const fixture = `
import optionalAuth from './middleware/auth.js';
app.post('/api/thing/destroy', optionalAuth, h);
app.get('/api/thing', optionalAuth, h);
`;
    const { findings } = auditMounts({ indexSource: fixture, routeInventory: {} });
    expect(findings.map(f => f.path)).toEqual(['/api/thing/destroy']);
  });

  it('DETECTS a comment claiming an auth check', () => {
    const fixture = `
// Master reset uses service-role client internally — auth at RPC level (chairman check)
app.use('/api/ventures', requireAuth, venturesRoutes);
`;
    const { commentClaims } = auditMounts({ indexSource: fixture, routeInventory: {} });
    expect(commentClaims).toHaveLength(1);
    expect(commentClaims[0].text).toMatch(/chairman check/);
  });
});

describe('FR-5 SAFETY: the mutation half never touched a real file', () => {
  it('left server/index.js untouched', () => {
    // The fleet rule this enforces: probe via an injected seam, never by editing a live
    // call site. If a future change makes auditMounts write files, or a test starts
    // mutating server/index.js in place to prove discrimination, this fails.
    //
    // SCOPED DELIBERATELY to server/index.js rather than asserting the WHOLE tree is
    // clean. The first version checked `git status --porcelain` globally and failed on
    // this suite's own untracked files — it was asserting a property of the developer's
    // workspace, not of this code, and would have failed for anyone mid-edit. What the
    // rule actually protects is the live call site.
    const dirty = execFileSync('git', ['status', '--porcelain', '--', 'server/index.js'], { cwd: REPO, encoding: 'utf8' }).trim();
    expect(dirty).toBe('');
  });
});
