import { orgs, repos, findings } from '../../ui/js/mock-data.js';

export function getSeedData() {
  return {
    organizations: [...orgs],
    repositories: [...repos],
    findings: [...findings]
  };
}

export function seed(repository) {
  const data = getSeedData();
  repository.clear();
  data.organizations.forEach(o => repository.addOrg(o));
  data.repositories.forEach(r => repository.addRepo(r));
  data.findings.forEach(f => repository.addFinding(f));
  return data;
}
