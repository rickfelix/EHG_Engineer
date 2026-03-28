/**
 * @typedef {Object} Tenant
 * @property {string} id
 * @property {string} name
 * @property {string} github_org_id
 * @property {'free'|'pro'|'enterprise'} plan
 * @property {string} created_at - ISO 8601
 */

/**
 * @typedef {Object} GitHubInstallation
 * @property {string} id
 * @property {string} tenant_id
 * @property {number} installation_id - GitHub's installation ID
 * @property {string[]} permissions
 * @property {string[]} repos - repository full names
 * @property {'active'|'suspended'|'removed'} status
 * @property {string} created_at
 */

/**
 * @typedef {Object} UserAccount
 * @property {string} id
 * @property {string} tenant_id
 * @property {string} github_user_id
 * @property {string} email
 * @property {'admin'|'member'|'viewer'} role
 * @property {string} created_at
 */

export const VALID_PLANS = ['free', 'pro', 'enterprise'];
export const VALID_INSTALL_STATUSES = ['active', 'suspended', 'removed'];
export const VALID_ROLES = ['admin', 'member', 'viewer'];

export const OAUTH_REQUIRED_FIELDS = {
  tenant: ['id', 'name', 'github_org_id', 'plan'],
  installation: ['id', 'tenant_id', 'installation_id', 'status'],
  user_account: ['id', 'tenant_id', 'github_user_id', 'email', 'role']
};
