/**
 * Venture Scope Middleware
 *
 * OPERATION 'SOVEREIGN PIPE' v3.7.0 - Mandatory Scoping
 *
 * THE LAW: All venture data requires venture_id context.
 * THE LAW: Global reads restricted to Chairman role.
 *
 * Purpose: Enforce venture isolation at the API layer.
 *
 * @module venture-scope
 * @version 3.7.0
 */

// =============================================================================
// VENTURE SCOPE MIDDLEWARE
// =============================================================================

/**
 * Require venture_id in request
 *
 * Extracts venture_id from:
 * - URL params: /api/v2/ventures/:venture_id/...
 * - Query params: ?venture_id=xxx
 * - Headers: X-Venture-ID
 *
 * @returns {function} Express middleware
 */
export function requireVentureScope(req, res, next) {
  // Extract venture_id from multiple sources
  const ventureId = req.params.venture_id ||
                    req.params.ventureId ||
                    req.query.venture_id ||
                    req.query.ventureId ||
                    req.headers['x-venture-id'];

  if (!ventureId) {
    return res.status(400).json({
      alert: 'Venture context required',
      severity: 'MEDIUM',
      category: 'VALIDATION',
      diagnosis: [
        'Provide venture_id in URL path',
        'Or add venture_id query parameter',
        'Or set X-Venture-ID header'
      ],
      action: 'Include venture_id in request',
      timestamp: new Date().toISOString()
    });
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(ventureId)) {
    return res.status(400).json({
      alert: 'Invalid venture_id format',
      severity: 'MEDIUM',
      category: 'VALIDATION',
      diagnosis: ['venture_id must be a valid UUID'],
      action: 'Provide valid UUID for venture_id',
      timestamp: new Date().toISOString()
    });
  }

  // Attach to request for downstream use
  req.venture_id = ventureId;
  next();
}

/**
 * Require Chairman role for global (unscoped) reads
 *
 * Only allows requests without venture_id if user has Chairman role.
 *
 * @returns {function} Express middleware
 */
export function requireChairmanForGlobal(req, res, next) {
  // Extract venture_id from request
  const ventureId = req.params.venture_id ||
                    req.params.ventureId ||
                    req.query.venture_id ||
                    req.query.ventureId ||
                    req.headers['x-venture-id'];

  // If venture_id provided, proceed
  if (ventureId) {
    req.venture_id = ventureId;
    return next();
  }

  // Check for Chairman role
  const userRole = req.user?.role ||
                   req.headers['x-user-role'] ||
                   req.query.role;

  const isChairman = userRole?.toLowerCase() === 'chairman' ||
                     userRole?.toLowerCase() === 'admin';

  if (!isChairman) {
    return res.status(403).json({
      alert: 'Global access restricted to Chairman',
      severity: 'MEDIUM',
      category: 'SECURITY',
      diagnosis: [
        'Global reads require Chairman role',
        'Provide venture_id for scoped access',
        'Or authenticate as Chairman'
      ],
      action: 'Provide venture_id or authenticate as Chairman',
      timestamp: new Date().toISOString()
    });
  }

  // Chairman can access global data
  req.is_chairman = true;
  req.venture_id = null; // Explicitly null for global access
  next();
}

/**
 * Optional venture scope - attaches if provided, doesn't require
 *
 * Use for endpoints that work both globally and scoped.
 *
 * @returns {function} Express middleware
 */
export function optionalVentureScope(req, res, next) {
  const ventureId = req.params.venture_id ||
                    req.params.ventureId ||
                    req.query.venture_id ||
                    req.query.ventureId ||
                    req.headers['x-venture-id'];

  if (ventureId) {
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(ventureId)) {
      return res.status(400).json({
        alert: 'Invalid venture_id format',
        severity: 'MEDIUM',
        category: 'VALIDATION',
        diagnosis: ['venture_id must be a valid UUID'],
        action: 'Provide valid UUID or omit venture_id',
        timestamp: new Date().toISOString()
      });
    }
    req.venture_id = ventureId;
  } else {
    req.venture_id = null;
  }

  next();
}

// =============================================================================
// HELPER UTILITIES
// =============================================================================

/**
 * Add venture_id filter to Supabase query
 *
 * Usage:
 *   const query = supabase.from('table').select('*');
 *   const scopedQuery = addVentureScopeToQuery(query, req.venture_id);
 *
 * @param {object} query - Supabase query builder
 * @param {string|null} ventureId - Venture ID to filter by
 * @returns {object} Modified query with venture_id filter
 */
export function addVentureScopeToQuery(query, ventureId) {
  if (ventureId) {
    return query.eq('venture_id', ventureId);
  }
  return query;
}

/**
 * Build venture-scoped query filter object
 *
 * @param {string|null} ventureId - Venture ID
 * @returns {object} Filter object for query
 */
export function buildVentureFilter(ventureId) {
  if (ventureId) {
    return { venture_id: ventureId };
  }
  return {};
}

/**
 * Validate venture ownership for mutations
 *
 * @param {object} supabase - Supabase client
 * @param {string} ventureId - Venture ID
 * @param {string} resourceTable - Table name to check
 * @param {string} resourceId - Resource ID
 * @returns {Promise<boolean>} True if venture owns the resource
 */
export async function validateVentureOwnership(supabase, ventureId, resourceTable, resourceId) {
  if (!ventureId || !resourceId) {
    return false;
  }

  try {
    const { data, error } = await supabase
      .from(resourceTable)
      .select('venture_id')
      .eq('id', resourceId)
      .single();

    if (error || !data) {
      return false;
    }

    return data.venture_id === ventureId;
  } catch {
    return false;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  requireVentureScope,
  requireChairmanForGlobal,
  optionalVentureScope,
  addVentureScopeToQuery,
  buildVentureFilter,
  validateVentureOwnership
};
