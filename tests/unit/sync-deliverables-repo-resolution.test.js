/**
 * QF-20260912-095: sync-deliverables-from-git.js previously scanned a single hardcoded EHG
 * checkout regardless of which repo the SD actually targeted, so an EHG_Engineer-targeted SD
 * read "No commits found on SD branch" from the wrong repository. resolveSyncRepos() now
 * delegates to computeReposForSD() (the same rule PR_MERGE_VERIFICATION uses at LEAD-FINAL).
 */
import { describe, it, expect } from 'vitest';
import { resolveSyncRepos } from '../../scripts/sync-deliverables-from-git.js';

describe('resolveSyncRepos (QF-20260912-095)', () => {
  it('an EHG_Engineer-targeted SD resolves to the EHG_Engineer path, not the EHG frontend checkout', () => {
    const sd = { sd_key: 'SD-LEO-FIX-FIX-DOMAIN-REGISTRAR-001', target_application: 'EHG_Engineer', metadata: {} };
    const repos = resolveSyncRepos(sd, undefined);
    expect(repos).toHaveLength(1);
    expect(repos[0].githubRepo).toBe('rickfelix/EHG_Engineer');
    expect(repos[0].localPath).not.toMatch(/[\\/]ehg$/i);
  });

  it('an EHG-targeted SD resolves to the EHG frontend path', () => {
    const sd = { sd_key: 'SD-SOME-UI-001', target_application: 'ehg', metadata: {} };
    const repos = resolveSyncRepos(sd, undefined);
    expect(repos).toHaveLength(1);
    expect(repos[0].githubRepo).toBe('rickfelix/ehg');
  });

  it('a cross-repo SD (metadata.target_repos naming both) resolves both repos, not just one', () => {
    const sd = { sd_key: 'SD-CROSS-REPO-001', target_application: null, metadata: { target_repos: ['EHG', 'EHG_Engineer'] } };
    const repos = resolveSyncRepos(sd, undefined);
    expect(repos.map((r) => r.githubRepo).sort()).toEqual(['rickfelix/EHG_Engineer', 'rickfelix/ehg'].sort());
  });

  it('an explicit --repo-path always wins, overriding any SD-derived resolution', () => {
    const sd = { sd_key: 'SD-SOME-UI-001', target_application: 'ehg', metadata: {} };
    const repos = resolveSyncRepos(sd, '/explicit/override/path');
    expect(repos).toEqual([{ githubRepo: null, localPath: '/explicit/override/path' }]);
  });
});
