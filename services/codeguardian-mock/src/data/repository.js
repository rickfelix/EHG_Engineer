import { validate } from './validator.js';

export class DataRepository {
  constructor() {
    this._orgs = new Map();
    this._repos = new Map();
    this._findings = new Map();
  }

  clear() {
    this._orgs.clear();
    this._repos.clear();
    this._findings.clear();
  }

  // Organizations
  addOrg(org) {
    const { valid, errors } = validate('organization', org);
    if (!valid) throw new Error(`Invalid organization: ${errors.join(', ')}`);
    this._orgs.set(org.id, { ...org });
    return org;
  }

  getOrg(id) { return this._orgs.get(id) || null; }
  listOrgs() { return [...this._orgs.values()]; }

  // Repositories
  addRepo(repo) {
    const { valid, errors } = validate('repository', repo);
    if (!valid) throw new Error(`Invalid repository: ${errors.join(', ')}`);
    if (repo.org_id && !this._orgs.has(repo.org_id)) {
      throw new Error(`Organization not found: ${repo.org_id}`);
    }
    this._repos.set(repo.id, { ...repo });
    return repo;
  }

  getRepo(id) { return this._repos.get(id) || null; }

  listRepos({ org_id, status, limit, offset } = {}) {
    let results = [...this._repos.values()];
    if (org_id) results = results.filter(r => r.org_id === org_id);
    if (status) results = results.filter(r => r.status === status);
    if (offset) results = results.slice(offset);
    if (limit) results = results.slice(0, limit);
    return results;
  }

  // Findings
  addFinding(finding) {
    const { valid, errors } = validate('finding', finding);
    if (!valid) throw new Error(`Invalid finding: ${errors.join(', ')}`);
    if (!this._repos.has(finding.repo_id)) {
      throw new Error(`Repository not found: ${finding.repo_id}`);
    }
    this._findings.set(finding.id, { ...finding });
    return finding;
  }

  getFinding(id) { return this._findings.get(id) || null; }

  listFindings({ repo_id, severity, limit, offset } = {}) {
    let results = [...this._findings.values()];
    if (repo_id) results = results.filter(f => f.repo_id === repo_id);
    if (severity) results = results.filter(f => f.severity === severity);
    if (offset) results = results.slice(offset);
    if (limit) results = results.slice(0, limit);
    return results;
  }

  // Export/Import
  export() {
    return {
      organizations: this.listOrgs(),
      repositories: this.listRepos(),
      findings: this.listFindings()
    };
  }

  import(data) {
    this.clear();
    (data.organizations || []).forEach(o => this.addOrg(o));
    (data.repositories || []).forEach(r => this.addRepo(r));
    (data.findings || []).forEach(f => this.addFinding(f));
  }
}
