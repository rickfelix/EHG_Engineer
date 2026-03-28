import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { OAuthRepository } from '../src/data/oauth-repository.js';
import { VALID_PLANS, VALID_ROLES, VALID_INSTALL_STATUSES } from '../src/data/oauth-schema.js';

const TENANT = { id: 't1', name: 'Acme', github_org_id: 'acme-org', plan: 'pro' };
const INSTALL = { id: 'i1', tenant_id: 't1', installation_id: 12345, status: 'active', permissions: ['read'], repos: ['acme/api'] };
const USER = { id: 'u1', tenant_id: 't1', github_user_id: 'gh-user-1', email: 'dev@acme.com', role: 'admin' };

describe('Schema Constants', () => {
  it('exports valid enums', () => {
    assert.deepEqual(VALID_PLANS, ['free', 'pro', 'enterprise']);
    assert.deepEqual(VALID_ROLES, ['admin', 'member', 'viewer']);
    assert.deepEqual(VALID_INSTALL_STATUSES, ['active', 'suspended', 'removed']);
  });
});

describe('Tenant CRUD', () => {
  let repo;
  beforeEach(() => { repo = new OAuthRepository(); });

  it('creates and retrieves tenant', () => {
    const t = repo.createTenant(TENANT);
    assert.equal(t.name, 'Acme');
    assert.ok(t.created_at);
    assert.equal(repo.getTenant('t1').github_org_id, 'acme-org');
  });

  it('lists all tenants', () => {
    repo.createTenant(TENANT);
    repo.createTenant({ id: 't2', name: 'Beta', github_org_id: 'beta', plan: 'free' });
    assert.equal(repo.listTenants().length, 2);
  });

  it('updates tenant', () => {
    repo.createTenant(TENANT);
    const updated = repo.updateTenant('t1', { plan: 'enterprise' });
    assert.equal(updated.plan, 'enterprise');
    assert.equal(updated.name, 'Acme');
  });

  it('deletes tenant and cascades', () => {
    repo.createTenant(TENANT);
    repo.createInstallation(INSTALL);
    repo.createUser(USER);
    repo.deleteTenant('t1');
    assert.equal(repo.getTenant('t1'), null);
    assert.equal(repo.listInstallations().length, 0);
    assert.equal(repo.listUsers().length, 0);
  });

  it('rejects invalid plan', () => {
    assert.throws(() => repo.createTenant({ ...TENANT, plan: 'invalid' }), /Invalid plan/);
  });

  it('rejects missing required fields', () => {
    assert.throws(() => repo.createTenant({ id: 't1' }), /Missing/);
  });
});

describe('Installation CRUD', () => {
  let repo;
  beforeEach(() => { repo = new OAuthRepository(); repo.createTenant(TENANT); });

  it('creates installation linked to tenant', () => {
    const inst = repo.createInstallation(INSTALL);
    assert.equal(inst.tenant_id, 't1');
    assert.equal(inst.installation_id, 12345);
  });

  it('rejects installation with invalid tenant_id', () => {
    assert.throws(() => repo.createInstallation({ ...INSTALL, tenant_id: 'bad' }), /Tenant not found/);
  });

  it('filters by tenant_id and status', () => {
    repo.createInstallation(INSTALL);
    repo.createTenant({ id: 't2', name: 'B', github_org_id: 'b', plan: 'free' });
    repo.createInstallation({ id: 'i2', tenant_id: 't2', installation_id: 999, status: 'suspended' });
    assert.equal(repo.listInstallations({ tenant_id: 't1' }).length, 1);
    assert.equal(repo.listInstallations({ status: 'suspended' }).length, 1);
  });

  it('updates installation', () => {
    repo.createInstallation(INSTALL);
    const updated = repo.updateInstallation('i1', { status: 'suspended' });
    assert.equal(updated.status, 'suspended');
  });

  it('deletes installation', () => {
    repo.createInstallation(INSTALL);
    repo.deleteInstallation('i1');
    assert.equal(repo.getInstallation('i1'), null);
  });

  it('rejects invalid status', () => {
    assert.throws(() => repo.createInstallation({ ...INSTALL, status: 'invalid' }), /Invalid status/);
  });
});

describe('User Account CRUD', () => {
  let repo;
  beforeEach(() => { repo = new OAuthRepository(); repo.createTenant(TENANT); });

  it('creates user linked to tenant', () => {
    const u = repo.createUser(USER);
    assert.equal(u.tenant_id, 't1');
    assert.equal(u.role, 'admin');
  });

  it('rejects user with invalid tenant_id', () => {
    assert.throws(() => repo.createUser({ ...USER, tenant_id: 'bad' }), /Tenant not found/);
  });

  it('filters by tenant_id and role', () => {
    repo.createUser(USER);
    repo.createUser({ id: 'u2', tenant_id: 't1', github_user_id: 'gh-2', email: 'dev2@acme.com', role: 'member' });
    assert.equal(repo.listUsers({ tenant_id: 't1' }).length, 2);
    assert.equal(repo.listUsers({ role: 'admin' }).length, 1);
  });

  it('updates user', () => {
    repo.createUser(USER);
    const updated = repo.updateUser('u1', { role: 'viewer' });
    assert.equal(updated.role, 'viewer');
  });

  it('deletes user', () => {
    repo.createUser(USER);
    repo.deleteUser('u1');
    assert.equal(repo.getUser('u1'), null);
  });

  it('rejects invalid role', () => {
    assert.throws(() => repo.createUser({ ...USER, role: 'superadmin' }), /Invalid role/);
  });
});

describe('Multi-Tenant Isolation', () => {
  it('queries return only data for specified tenant', () => {
    const repo = new OAuthRepository();
    repo.createTenant({ id: 't1', name: 'A', github_org_id: 'a', plan: 'pro' });
    repo.createTenant({ id: 't2', name: 'B', github_org_id: 'b', plan: 'free' });
    repo.createInstallation({ id: 'i1', tenant_id: 't1', installation_id: 1, status: 'active' });
    repo.createInstallation({ id: 'i2', tenant_id: 't2', installation_id: 2, status: 'active' });
    repo.createUser({ id: 'u1', tenant_id: 't1', github_user_id: 'g1', email: 'a@a.com', role: 'admin' });
    repo.createUser({ id: 'u2', tenant_id: 't2', github_user_id: 'g2', email: 'b@b.com', role: 'member' });

    const t1Installs = repo.listInstallations({ tenant_id: 't1' });
    const t2Users = repo.listUsers({ tenant_id: 't2' });

    assert.equal(t1Installs.length, 1);
    assert.equal(t1Installs[0].id, 'i1');
    assert.equal(t2Users.length, 1);
    assert.equal(t2Users[0].id, 'u2');
  });
});
