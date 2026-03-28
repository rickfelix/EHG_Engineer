import { VALID_PLANS, VALID_INSTALL_STATUSES, VALID_ROLES, OAUTH_REQUIRED_FIELDS } from './oauth-schema.js';

function validateEntity(type, entity) {
  const errors = [];
  const required = OAUTH_REQUIRED_FIELDS[type];
  if (!required) return { valid: false, errors: [`Unknown type: ${type}`] };

  for (const field of required) {
    if (entity[field] === undefined || entity[field] === null) {
      errors.push(`Missing: ${field}`);
    }
  }

  if (type === 'tenant' && entity.plan && !VALID_PLANS.includes(entity.plan)) {
    errors.push(`Invalid plan: ${entity.plan}`);
  }
  if (type === 'installation' && entity.status && !VALID_INSTALL_STATUSES.includes(entity.status)) {
    errors.push(`Invalid status: ${entity.status}`);
  }
  if (type === 'user_account' && entity.role && !VALID_ROLES.includes(entity.role)) {
    errors.push(`Invalid role: ${entity.role}`);
  }

  return { valid: errors.length === 0, errors };
}

export class OAuthRepository {
  constructor() {
    this._tenants = new Map();
    this._installations = new Map();
    this._users = new Map();
  }

  // Tenants
  createTenant(tenant) {
    const { valid, errors } = validateEntity('tenant', tenant);
    if (!valid) throw new Error(`Invalid tenant: ${errors.join(', ')}`);
    const record = { ...tenant, created_at: tenant.created_at || new Date().toISOString() };
    this._tenants.set(tenant.id, record);
    return record;
  }

  getTenant(id) { return this._tenants.get(id) || null; }
  listTenants() { return [...this._tenants.values()]; }

  updateTenant(id, updates) {
    const existing = this._tenants.get(id);
    if (!existing) throw new Error(`Tenant not found: ${id}`);
    const updated = { ...existing, ...updates, id };
    this._tenants.set(id, updated);
    return updated;
  }

  deleteTenant(id) {
    if (!this._tenants.has(id)) throw new Error(`Tenant not found: ${id}`);
    this._tenants.delete(id);
    // Cascade: remove installations and users
    for (const [k, v] of this._installations) { if (v.tenant_id === id) this._installations.delete(k); }
    for (const [k, v] of this._users) { if (v.tenant_id === id) this._users.delete(k); }
  }

  // Installations
  createInstallation(installation) {
    const { valid, errors } = validateEntity('installation', installation);
    if (!valid) throw new Error(`Invalid installation: ${errors.join(', ')}`);
    if (!this._tenants.has(installation.tenant_id)) {
      throw new Error(`Tenant not found: ${installation.tenant_id}`);
    }
    const record = {
      ...installation,
      permissions: installation.permissions || [],
      repos: installation.repos || [],
      created_at: installation.created_at || new Date().toISOString()
    };
    this._installations.set(installation.id, record);
    return record;
  }

  getInstallation(id) { return this._installations.get(id) || null; }

  listInstallations({ tenant_id, status } = {}) {
    let results = [...this._installations.values()];
    if (tenant_id) results = results.filter(i => i.tenant_id === tenant_id);
    if (status) results = results.filter(i => i.status === status);
    return results;
  }

  updateInstallation(id, updates) {
    const existing = this._installations.get(id);
    if (!existing) throw new Error(`Installation not found: ${id}`);
    const updated = { ...existing, ...updates, id };
    this._installations.set(id, updated);
    return updated;
  }

  deleteInstallation(id) {
    if (!this._installations.has(id)) throw new Error(`Installation not found: ${id}`);
    this._installations.delete(id);
  }

  // User Accounts
  createUser(user) {
    const { valid, errors } = validateEntity('user_account', user);
    if (!valid) throw new Error(`Invalid user: ${errors.join(', ')}`);
    if (!this._tenants.has(user.tenant_id)) {
      throw new Error(`Tenant not found: ${user.tenant_id}`);
    }
    const record = { ...user, created_at: user.created_at || new Date().toISOString() };
    this._users.set(user.id, record);
    return record;
  }

  getUser(id) { return this._users.get(id) || null; }

  listUsers({ tenant_id, role } = {}) {
    let results = [...this._users.values()];
    if (tenant_id) results = results.filter(u => u.tenant_id === tenant_id);
    if (role) results = results.filter(u => u.role === role);
    return results;
  }

  updateUser(id, updates) {
    const existing = this._users.get(id);
    if (!existing) throw new Error(`User not found: ${id}`);
    const updated = { ...existing, ...updates, id };
    this._users.set(id, updated);
    return updated;
  }

  deleteUser(id) {
    if (!this._users.has(id)) throw new Error(`User not found: ${id}`);
    this._users.delete(id);
  }
}
