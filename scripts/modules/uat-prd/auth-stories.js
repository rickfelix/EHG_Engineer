/**
 * Authentication & Authorization UAT Stories
 * Stories covering login, security, sessions, and access control
 *
 * @module auth-stories
 */

export const authStories = [
  {
    module: 'Authentication',
    title: 'Login with valid credentials',
    description: 'User should be able to login with correct username and password',
    acceptance_criteria: [
      'Login form is accessible at /login',
      'Valid credentials grant access to dashboard',
      'Session token is properly stored',
      'User is redirected to intended page after login'
    ],
    test_types: ['functional', 'security'],
    priority: 'CRITICAL'
  },
  {
    module: 'Authentication',
    title: 'Login with invalid credentials',
    description: 'System should reject invalid login attempts',
    acceptance_criteria: [
      'Error message displays for wrong credentials',
      'Account lockout after 5 failed attempts',
      'Lockout duration is 15 minutes',
      'Error messages do not reveal user existence'
    ],
    test_types: ['functional', 'security'],
    priority: 'CRITICAL'
  },
  {
    module: 'Authentication',
    title: 'Password reset flow',
    description: 'User can reset forgotten password',
    acceptance_criteria: [
      'Reset link sent to registered email',
      'Token expires after 1 hour',
      'Password complexity requirements enforced',
      'Old password no longer works after reset'
    ],
    test_types: ['functional', 'security'],
    priority: 'HIGH'
  },
  {
    module: 'Authentication',
    title: 'Session timeout',
    description: 'Inactive sessions should expire',
    acceptance_criteria: [
      'Session expires after 30 minutes of inactivity',
      'Warning shown 5 minutes before expiry',
      'User can extend session',
      'Expired session redirects to login'
    ],
    test_types: ['functional', 'security'],
    priority: 'HIGH'
  },
  {
    module: 'Authentication',
    title: 'Multi-factor authentication',
    description: 'Support for 2FA when enabled',
    acceptance_criteria: [
      '2FA code required after password',
      'Backup codes available',
      'Remember device option works',
      'Invalid codes are rejected'
    ],
    test_types: ['functional', 'security'],
    priority: 'HIGH'
  },
  {
    module: 'Authentication',
    title: 'OAuth integration',
    description: 'Login via third-party providers',
    acceptance_criteria: [
      'Google OAuth works correctly',
      'GitHub OAuth works correctly',
      'Profile data properly mapped',
      'Logout clears OAuth session'
    ],
    test_types: ['functional', 'integration'],
    priority: 'MEDIUM'
  },
  {
    module: 'Authentication',
    title: 'CSRF protection',
    description: 'Prevent cross-site request forgery',
    acceptance_criteria: [
      'CSRF tokens present in forms',
      'Requests without tokens rejected',
      'Tokens regenerated per session',
      'Double submit cookie implemented'
    ],
    test_types: ['security'],
    priority: 'CRITICAL'
  },
  {
    module: 'Authentication',
    title: 'XSS prevention',
    description: 'Prevent cross-site scripting attacks',
    acceptance_criteria: [
      'Input sanitization works',
      'Output encoding implemented',
      'CSP headers configured',
      'Script injection attempts blocked'
    ],
    test_types: ['security'],
    priority: 'CRITICAL'
  }
];
