/**
 * JWT Authentication for SDIP
 * Implements Security Sub-Agent recommendations
 * Created: 2025-01-03
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

class JWTAuthenticator {
  constructor(secret = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex')) {
    this.secret = secret;
    this.tokenExpiry = '24h'; // Token valid for 24 hours
    this.refreshExpiry = '7d'; // Refresh token valid for 7 days
  }

  /**
   * Generate JWT token for user
   */
  generateToken(userId, role = 'validator') {
    const payload = {
      userId,
      role,
      permissions: this.getRolePermissions(role),
      iat: Math.floor(Date.now() / 1000),
      nonce: crypto.randomBytes(16).toString('hex')
    };

    return {
      accessToken: jwt.sign(payload, this.secret, { expiresIn: this.tokenExpiry }),
      refreshToken: jwt.sign({ userId, type: 'refresh' }, this.secret, { expiresIn: this.refreshExpiry }),
      expiresIn: 86400 // 24 hours in seconds
    };
  }

  /**
   * Verify and decode JWT token
   */
  verifyToken(token) {
    try {
      const decoded = jwt.verify(token, this.secret);
      
      // Additional security checks
      if (!decoded.userId || !decoded.role) {
        throw new Error('Invalid token structure');
      }
      
      return {
        valid: true,
        decoded
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Middleware for Express routes
   */
  middleware(requiredRole = null) {
    return (req, res, next) => {
      const token = this.extractToken(req);
      
      if (!token) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'NO_TOKEN'
        });
      }

      const { valid, decoded, error } = this.verifyToken(token);
      
      if (!valid) {
        return res.status(401).json({
          error: 'Invalid authentication token',
          code: 'INVALID_TOKEN',
          details: error
        });
      }

      // Check role-based access
      if (requiredRole && !this.hasRole(decoded.role, requiredRole)) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          code: 'FORBIDDEN',
          required: requiredRole,
          current: decoded.role
        });
      }

      // Attach user info to request
      req.user = {
        id: decoded.userId,
        role: decoded.role,
        permissions: decoded.permissions
      };

      next();
    };
  }

  /**
   * Extract token from request
   */
  extractToken(req) {
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check cookie
    if (req.cookies && req.cookies.sdip_token) {
      return req.cookies.sdip_token;
    }

    // Check query parameter (for WebSocket connections)
    if (req.query && req.query.token) {
      return req.query.token;
    }

    return null;
  }

  /**
   * Get permissions for role (per Security Sub-Agent matrix)
   */
  getRolePermissions(role) {
    const permissions = {
      chairman: [
        'read_own_submissions',
        'create_submission',
        'final_approval'
      ],
      validator: [
        'read_all_submissions',
        'validate_gates_1_3',
        'update_intent',
        'update_category',
        'update_strategic'
      ],
      admin: [
        'read_all_submissions',
        'validate_all_gates',
        'final_approval',
        'view_pacer_data',
        'manage_users',
        'export_data'
      ],
      system: [
        'all_permissions'
      ]
    };

    return permissions[role] || [];
  }

  /**
   * Check if user has required role or higher
   */
  hasRole(userRole, requiredRole) {
    const roleHierarchy = {
      system: 4,
      admin: 3,
      validator: 2,
      chairman: 1
    };

    return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
  }

  /**
   * Generate secure session ID for audit trail
   */
  generateSessionId(userId) {
    const timestamp = new Date().toISOString();
    const data = `${userId}-${timestamp}-${crypto.randomBytes(8).toString('hex')}`;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
  }

  /**
   * Sign validation action for non-repudiation
   */
  signValidation(gate, userId, action) {
    const payload = {
      gate,
      userId,
      action,
      timestamp: new Date().toISOString(),
      nonce: crypto.randomBytes(16).toString('hex')
    };

    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return {
      ...payload,
      signature
    };
  }

  /**
   * Verify signed validation
   */
  verifySignature(signedData) {
    const { signature, ...payload } = signedData;
    
    const expectedSignature = crypto
      .createHmac('sha256', this.secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return signature === expectedSignature;
  }
}

module.exports = JWTAuthenticator;