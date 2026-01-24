/**
 * Role-Based Access Control (RBAC) Middleware
 * SD-SEC-AUTHORIZATION-RBAC-001
 *
 * SECURITY: Adds authorization layer on top of authentication
 * - Defines roles: admin, editor, viewer
 * - Checks permissions before sensitive operations
 * - Verifies resource ownership for user-specific data
 */

import { NextApiResponse } from 'next';
import { AuthenticatedRequest, AuthenticatedHandler } from './api-auth';

// Role definitions
export type Role = 'admin' | 'editor' | 'viewer' | 'owner';

// Permission definitions
export type Permission =
  | 'violations:override'
  | 'violations:read'
  | 'rules:create'
  | 'rules:update'
  | 'rules:delete'
  | 'rules:read'
  | 'constitutions:create'
  | 'constitutions:update'
  | 'constitutions:delete'
  | 'constitutions:read'
  | 'ventures:create'
  | 'ventures:update'
  | 'ventures:delete'
  | 'ventures:read'
  | 'compliance:read'
  | 'compliance:write'
  | 'admin:*';

// Role-to-permission mapping
const rolePermissions: Record<Role, Permission[]> = {
  admin: ['admin:*'], // Admin has all permissions
  editor: [
    'violations:override',
    'violations:read',
    'rules:create',
    'rules:update',
    'rules:read',
    'constitutions:read',
    'ventures:create',
    'ventures:update',
    'ventures:read',
    'compliance:read',
    'compliance:write'
  ],
  viewer: [
    'violations:read',
    'rules:read',
    'constitutions:read',
    'ventures:read',
    'compliance:read'
  ],
  owner: [] // Owner permissions are checked dynamically based on resource ownership
};

/**
 * Get user's role from JWT claims or database
 * SECURITY: Role should be stored in JWT claims for performance
 */
export async function getUserRole(req: AuthenticatedRequest): Promise<Role> {
  const { user, supabase } = req;

  // Check JWT app_metadata first (preferred for performance)
  const jwtRole = user.app_metadata?.role as Role | undefined;
  if (jwtRole && ['admin', 'editor', 'viewer'].includes(jwtRole)) {
    return jwtRole;
  }

  // Fallback: Query database for role
  // SECURITY: This should be rare - roles should be in JWT
  try {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (data?.role && ['admin', 'editor', 'viewer'].includes(data.role)) {
      return data.role as Role;
    }
  } catch {
    // Table may not exist - that's ok, default to viewer
  }

  // Default to viewer (least privilege)
  return 'viewer';
}

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  const permissions = rolePermissions[role];

  // Admin has all permissions
  if (permissions.includes('admin:*')) {
    return true;
  }

  return permissions.includes(permission);
}

/**
 * Middleware to require a specific permission
 *
 * @example
 * export default withAuth(
 *   withPermission('violations:override')(handler)
 * );
 */
export function withPermission(requiredPermission: Permission) {
  return (handler: AuthenticatedHandler): AuthenticatedHandler => {
    return async (req: AuthenticatedRequest, res: NextApiResponse) => {
      const role = await getUserRole(req);

      if (!hasPermission(role, requiredPermission)) {
        console.warn(
          `AUTHZ DENIED: User ${req.user.id} (role: ${role}) attempted ${requiredPermission}`
        );
        return res.status(403).json({
          error: 'Forbidden',
          message: `Insufficient permissions. Required: ${requiredPermission}`,
          code: 'PERMISSION_DENIED'
        });
      }

      return handler(req, res);
    };
  };
}

/**
 * Middleware to require one of several permissions
 *
 * @example
 * export default withAuth(
 *   withAnyPermission(['rules:create', 'admin:*'])(handler)
 * );
 */
export function withAnyPermission(requiredPermissions: Permission[]) {
  return (handler: AuthenticatedHandler): AuthenticatedHandler => {
    return async (req: AuthenticatedRequest, res: NextApiResponse) => {
      const role = await getUserRole(req);

      const hasAny = requiredPermissions.some(p => hasPermission(role, p));

      if (!hasAny) {
        console.warn(
          `AUTHZ DENIED: User ${req.user.id} (role: ${role}) missing all of: ${requiredPermissions.join(', ')}`
        );
        return res.status(403).json({
          error: 'Forbidden',
          message: `Insufficient permissions. Required one of: ${requiredPermissions.join(', ')}`,
          code: 'PERMISSION_DENIED'
        });
      }

      return handler(req, res);
    };
  };
}

/**
 * Middleware to require resource ownership
 * Useful for user-specific data
 *
 * @example
 * export default withAuth(
 *   withOwnership('ventures', 'owner_id')(handler)
 * );
 */
export function withOwnership(
  tableName: string,
  ownerColumn: string = 'owner_id'
) {
  return (handler: AuthenticatedHandler): AuthenticatedHandler => {
    return async (req: AuthenticatedRequest, res: NextApiResponse) => {
      const { supabase, user } = req;
      const resourceId = req.query.id as string;

      if (!resourceId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Resource ID required',
          code: 'MISSING_ID'
        });
      }

      // Check if user owns the resource
      const { data, error } = await supabase
        .from(tableName)
        .select(ownerColumn)
        .eq('id', resourceId)
        .single();

      if (error || !data) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Resource not found',
          code: 'NOT_FOUND'
        });
      }

      // Allow if user owns the resource OR is admin
      const role = await getUserRole(req);
      const isOwner = data[ownerColumn] === user.id;
      const isAdmin = hasPermission(role, 'admin:*');

      if (!isOwner && !isAdmin) {
        console.warn(
          `AUTHZ DENIED: User ${user.id} attempted to access ${tableName}/${resourceId} owned by ${data[ownerColumn]}`
        );
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have access to this resource',
          code: 'NOT_OWNER'
        });
      }

      return handler(req, res);
    };
  };
}

/**
 * Audit log authorization events
 * SECURITY: Always log authorization failures for security monitoring
 */
export async function logAuthzEvent(
  req: AuthenticatedRequest,
  permission: Permission,
  granted: boolean,
  resource?: string
) {
  try {
    await req.supabase.from('authz_audit_log').insert({
      user_id: req.user.id,
      permission,
      granted,
      resource,
      ip_address: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
      user_agent: req.headers['user-agent'],
      created_at: new Date().toISOString()
    });
  } catch {
    // Don't fail the request if audit logging fails
    console.error('Failed to log authz event');
  }
}
