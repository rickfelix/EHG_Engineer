/**
 * Chairman Scope Guard — Express middleware
 * SD-MAN-GEN-CORRECTIVE-VISION-GAP-011 (V08: chairman_dashboard_scope)
 *
 * Wraps auditDashboardRoutes() as blocking Express middleware.
 * Prohibited routes (data-entry, editing, creation) are rejected with 403.
 * Allowed governance routes pass through. Unknown routes pass with a warning log.
 *
 * @module lib/middleware/chairman-scope-guard
 */

import { auditDashboardRoutes } from '../eva/chairman-dashboard-scope.js';

/**
 * Create chairman scope guard middleware.
 *
 * @param {Object} [options]
 * @param {boolean} [options.blocking=true] - If true, return 403 for prohibited routes. If false, advisory-only (log).
 * @returns {Function} Express middleware
 */
export function createChairmanScopeGuard(options = {}) {
  const { blocking = true } = options;

  return (req, res, next) => {
    const routePath = '/chairman' + req.path;
    const audit = auditDashboardRoutes([routePath]);

    if (!audit.passed) {
      console.warn(`[ChairmanScopeGuard] SCOPE VIOLATION: ${audit.summary} — ${req.method} ${req.originalUrl}`);

      if (blocking) {
        return res.status(403).json({
          error: 'Scope violation',
          message: audit.summary,
          code: 'CHAIRMAN_SCOPE_VIOLATION',
          prohibited: audit.prohibited,
        });
      }
    }

    if (audit.unknown.length > 0) {
      console.warn(`[ChairmanScopeGuard] Unclassified route: ${routePath}`);
    }

    next();
  };
}

export default createChairmanScopeGuard;
