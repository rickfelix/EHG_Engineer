/**
 * Auth-carve-out audit for Express mounts.
 * SD-LEO-INFRA-DESTRUCTIVE-ACTION-SAFETY-001 FR-5.
 *
 * WHY THIS IS A PURE FUNCTION, and it is not a style preference. The mutation half of the
 * test for this audit has to prove the audit FAILS when a carve-out is introduced. The
 * obvious way to do that is to edit server/index.js, run, and restore — and the fleet has
 * a live near-miss from exactly that shape: an agent hardcoded a failure into
 * spawn-control.js to check a suite went red and left it UNCOMMITTED, which would have
 * refused every spawn fleet-wide had it been committed. So this function does NO file I/O:
 * it takes source TEXT, and the mutation is applied to a synthetic fixture string. The
 * real server/index.js is never touched, and the test asserts the working tree is clean.
 *
 * WHY IT RESOLVES MOUNT ORDERING RATHER THAN READING DECLARATIONS IN ISOLATION. An earlier
 * version of this audit (a one-off script) read each mount's declared middleware on its own
 * and reported POST /api/github/pr-review-webhook as an unauthenticated mutating route. That
 * was a FALSE POSITIVE, and it was signalled before being verified. Express `app.use(path, …)`
 * PREFIX-matches, and `app.use('/api/github', requireAuth, …)` at server/index.js:207 sits
 * seven lines BEFORE the `/api` optionalAuth mount at :214 — so requireAuth runs for every
 * request under that prefix whether or not the inner router matches a route. The route was
 * always guarded. Reading declarations in isolation cannot see that; this resolves the
 * effective chain.
 *
 * DIRECTION OF ERROR, stated because it makes a limited method usable: optionalAuth calls
 * next() unconditionally, so an earlier prefix mount can only ADD authentication, never
 * remove it. This audit therefore OVER-reports and cannot UNDER-report. A clean result is
 * meaningful; a finding still warrants reading the source.
 */

const GUARDS = ['requireAuth', 'requireAdminAuth', 'requireAdminRole', 'optionalAuth'];
const HARD_GUARDS = ['requireAuth', 'requireAdminAuth'];
const MUTATING_METHODS = ['post', 'put', 'patch', 'delete', 'all'];

/** Comment keywords that claim an auth check. HEURISTIC, not a semantic guarantee. */
const AUTH_CLAIM_PATTERN = /auth (?:happens |is )?at (?:the )?rpc level|chairman check|auth(?:enticat\w+)? (?:handled|enforced) (?:internally|at)/i;

function parseImports(src) {
  const map = new Map();
  for (const m of src.matchAll(/import\s+(?:(\w+)|\{([^}]+)\})\s+from\s+['"]([^'"]+)['"]/g)) {
    if (m[1]) map.set(m[1], m[3]);
    if (m[2]) {
      for (const part of m[2].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop().trim();
        if (name) map.set(name, m[3]);
      }
    }
  }
  return map;
}

/** Ordered mount list. Order is the whole point — Express matches in declaration order. */
function parseMounts(src) {
  const mounts = [];
  const push = (index, entry) => mounts.push({ order: index, line: src.slice(0, index).split('\n').length, ...entry });

  for (const m of src.matchAll(/app\.use\(\s*['"`]([^'"`]+)['"`]\s*,([^)]*)\)/g)) {
    const mws = m[2];
    push(m.index, {
      kind: 'use',
      mountPath: m[1],
      guard: GUARDS.find(g => mws.includes(g)) || null,
      routerName: (mws.match(/([A-Za-z_$][\w$]*)\s*$/) || [])[1] || null,
    });
  }
  for (const m of src.matchAll(/app\.(get|post|put|patch|delete|all)\(\s*['"`]([^'"`]+)['"`]\s*,([^)]*)\)/g)) {
    push(m.index, {
      kind: 'direct',
      method: m[1].toLowerCase(),
      mountPath: m[2],
      guard: GUARDS.find(g => m[3].includes(g)) || null,
      routerName: null,
    });
  }
  return mounts.sort((a, b) => a.order - b.order);
}

function joinPath(mountPath, routePath) {
  if (!routePath || routePath === '/') return mountPath;
  return `${mountPath.replace(/\/$/, '')}${routePath.startsWith('/') ? '' : '/'}${routePath}`;
}

/** Does an EARLIER mount already force authentication on this effective path? */
function shadowedByEarlierGuard(mounts, selfOrder, effectivePath) {
  return mounts.some(m => (
    m.order < selfOrder &&
    m.kind === 'use' &&
    HARD_GUARDS.includes(m.guard) &&
    (effectivePath === m.mountPath || effectivePath.startsWith(m.mountPath.replace(/\/$/, '') + '/'))
  ));
}

/**
 * Audit mounts for mutating routes reachable without authentication.
 *
 * @param {object}  input
 * @param {string}  input.indexSource - Contents of the server entrypoint. TEXT, not a path.
 * @param {object}  input.routeInventory - Map of module specifier -> array of
 *   { method, path } route declarations. Supplied by the caller (the test reads these from
 *   disk); this function performs no I/O so a fixture can be passed instead.
 * @returns {{findings: object[], mountsScanned: number, mutatingRoutesChecked: number, commentClaims: object[]}}
 */
export function auditMounts({ indexSource, routeInventory = {} }) {
  const imports = parseImports(indexSource);
  const mounts = parseMounts(indexSource);
  const findings = [];
  let mutatingRoutesChecked = 0;

  for (const mount of mounts) {
    if (mount.kind === 'direct') {
      if (!MUTATING_METHODS.includes(mount.method)) continue;
      mutatingRoutesChecked++;
      if (HARD_GUARDS.includes(mount.guard)) continue;
      if (shadowedByEarlierGuard(mounts, mount.order, mount.mountPath)) continue;
      findings.push({ method: mount.method.toUpperCase(), path: mount.mountPath, mountLine: mount.line, guard: mount.guard, reason: 'direct mutating route without a hard auth guard' });
      continue;
    }

    const specifier = imports.get(mount.routerName);
    const routes = specifier ? routeInventory[specifier] : undefined;
    if (!routes) continue; // unresolvable mount (middleware, static, or not supplied)

    for (const route of routes) {
      if (!MUTATING_METHODS.includes(String(route.method).toLowerCase())) continue;
      mutatingRoutesChecked++;
      const effectivePath = joinPath(mount.mountPath, route.path);
      if (HARD_GUARDS.includes(mount.guard)) continue;
      if (shadowedByEarlierGuard(mounts, mount.order, effectivePath)) continue;
      findings.push({
        method: String(route.method).toUpperCase(),
        path: effectivePath,
        mountLine: mount.line,
        guard: mount.guard,
        module: specifier,
        reason: 'mutating route under a mount with no hard auth guard, and no earlier prefix mount supplies one',
      });
    }
  }

  // HEURISTIC, deliberately not presented as a guarantee: flags comments that CLAIM an auth
  // check. A false safety comment is what let the original carve-out survive — it
  // pre-answered the question a reviewer would otherwise have asked.
  const commentClaims = [];
  indexSource.split('\n').forEach((text, i) => {
    const trimmed = text.trim();
    if ((trimmed.startsWith('//') || trimmed.startsWith('*')) && AUTH_CLAIM_PATTERN.test(trimmed)) {
      commentClaims.push({ line: i + 1, text: trimmed });
    }
  });

  return { findings, mountsScanned: mounts.length, mutatingRoutesChecked, commentClaims };
}
