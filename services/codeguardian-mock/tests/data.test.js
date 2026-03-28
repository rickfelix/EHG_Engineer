import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DataRepository } from '../src/data/repository.js';
import { validate } from '../src/data/validator.js';
import { VALID_STATUSES, VALID_SEVERITIES, REQUIRED_FIELDS } from '../src/data/schema.js';
import { seed, getSeedData } from '../src/data/seed.js';

describe('Schema', () => {
  it('exports valid statuses and severities', () => {
    assert.deepEqual(VALID_STATUSES, ['passing', 'failing', 'pending']);
    assert.deepEqual(VALID_SEVERITIES, ['critical', 'high', 'medium', 'low']);
  });

  it('defines required fields for all entity types', () => {
    assert.ok(REQUIRED_FIELDS.organization.length > 0);
    assert.ok(REQUIRED_FIELDS.repository.length > 0);
    assert.ok(REQUIRED_FIELDS.finding.length > 0);
  });
});

describe('Validator', () => {
  it('passes valid organization', () => {
    const result = validate('organization', { id: '1', name: 'Test', repos_count: 5 });
    assert.equal(result.valid, true);
  });

  it('rejects organization missing fields', () => {
    const result = validate('organization', { id: '1' });
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  it('rejects invalid repository status', () => {
    const result = validate('repository', { id: '1', name: 'r', org_id: 'o', status: 'invalid', findings: {} });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Invalid status')));
  });

  it('rejects invalid finding severity', () => {
    const result = validate('finding', { id: '1', repo_id: 'r', severity: 'urgent', title: 't', file: 'f', line: 1, description: 'd' });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Invalid severity')));
  });

  it('rejects non-numeric line in finding', () => {
    const result = validate('finding', { id: '1', repo_id: 'r', severity: 'high', title: 't', file: 'f', line: 'abc', description: 'd' });
    assert.equal(result.valid, false);
  });

  it('rejects unknown entity type', () => {
    const result = validate('unknown', {});
    assert.equal(result.valid, false);
  });
});

describe('DataRepository', () => {
  let repo;
  beforeEach(() => { repo = new DataRepository(); });

  it('adds and retrieves organizations', () => {
    repo.addOrg({ id: 'o1', name: 'Org', repos_count: 3 });
    assert.equal(repo.getOrg('o1').name, 'Org');
    assert.equal(repo.listOrgs().length, 1);
  });

  it('adds and retrieves repositories', () => {
    repo.addOrg({ id: 'o1', name: 'Org', repos_count: 1 });
    repo.addRepo({ id: 'r1', name: 'Repo', org_id: 'o1', status: 'passing', findings: { critical: 0, high: 0, medium: 0, low: 0 } });
    assert.equal(repo.getRepo('r1').name, 'Repo');
  });

  it('filters repos by org_id and status', () => {
    repo.addOrg({ id: 'o1', name: 'Org', repos_count: 2 });
    repo.addRepo({ id: 'r1', name: 'A', org_id: 'o1', status: 'passing', findings: {} });
    repo.addRepo({ id: 'r2', name: 'B', org_id: 'o1', status: 'failing', findings: {} });
    assert.equal(repo.listRepos({ org_id: 'o1' }).length, 2);
    assert.equal(repo.listRepos({ status: 'failing' }).length, 1);
  });

  it('supports pagination', () => {
    repo.addOrg({ id: 'o1', name: 'Org', repos_count: 3 });
    for (let i = 0; i < 5; i++) repo.addRepo({ id: `r${i}`, name: `R${i}`, org_id: 'o1', status: 'passing', findings: {} });
    assert.equal(repo.listRepos({ limit: 2 }).length, 2);
    assert.equal(repo.listRepos({ offset: 3 }).length, 2);
  });

  it('rejects repo with invalid org_id', () => {
    assert.throws(() => repo.addRepo({ id: 'r1', name: 'R', org_id: 'bad', status: 'passing', findings: {} }), /Organization not found/);
  });

  it('rejects finding with invalid repo_id', () => {
    assert.throws(() => repo.addFinding({ id: 'f1', repo_id: 'bad', severity: 'high', title: 't', file: 'f', line: 1, description: 'd' }), /Repository not found/);
  });

  it('filters findings by repo_id and severity', () => {
    repo.addOrg({ id: 'o1', name: 'Org', repos_count: 1 });
    repo.addRepo({ id: 'r1', name: 'R', org_id: 'o1', status: 'failing', findings: {} });
    repo.addFinding({ id: 'f1', repo_id: 'r1', severity: 'critical', title: 't1', file: 'a.js', line: 1, description: 'd' });
    repo.addFinding({ id: 'f2', repo_id: 'r1', severity: 'low', title: 't2', file: 'b.js', line: 2, description: 'd' });
    assert.equal(repo.listFindings({ severity: 'critical' }).length, 1);
    assert.equal(repo.listFindings({ repo_id: 'r1' }).length, 2);
  });

  it('clears all data', () => {
    repo.addOrg({ id: 'o1', name: 'Org', repos_count: 0 });
    repo.clear();
    assert.equal(repo.listOrgs().length, 0);
  });
});

describe('Export/Import', () => {
  it('round-trips data correctly', () => {
    const repo = new DataRepository();
    repo.addOrg({ id: 'o1', name: 'Org', repos_count: 1 });
    repo.addRepo({ id: 'r1', name: 'R', org_id: 'o1', status: 'passing', findings: {} });
    repo.addFinding({ id: 'f1', repo_id: 'r1', severity: 'high', title: 't', file: 'x.js', line: 10, description: 'd' });

    const exported = repo.export();
    const repo2 = new DataRepository();
    repo2.import(exported);

    assert.equal(repo2.listOrgs().length, 1);
    assert.equal(repo2.listRepos().length, 1);
    assert.equal(repo2.listFindings().length, 1);
    assert.deepEqual(repo2.getOrg('o1').name, 'Org');
  });
});

describe('Seed', () => {
  it('provides complete seed data', () => {
    const data = getSeedData();
    assert.ok(data.organizations.length >= 3, '3+ orgs');
    assert.ok(data.repositories.length >= 5, '5+ repos');
    assert.ok(data.findings.length >= 20, '20+ findings');
  });

  it('seeds repository with consistent data', () => {
    const repo = new DataRepository();
    seed(repo);
    assert.ok(repo.listOrgs().length >= 3);
    assert.ok(repo.listRepos().length >= 5);
    assert.ok(repo.listFindings().length >= 20);
  });

  it('is idempotent', () => {
    const repo = new DataRepository();
    seed(repo);
    const count1 = repo.listRepos().length;
    seed(repo);
    const count2 = repo.listRepos().length;
    assert.equal(count1, count2);
  });
});
