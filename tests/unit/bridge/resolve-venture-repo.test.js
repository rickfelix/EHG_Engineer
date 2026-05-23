/**
 * Unit tests for lib/eva/bridge/resolve-venture-repo.js
 * SD-LEO-FEAT-S19-BUILDS-INTO-001 — PRD TS-6 (resolver precedence + normalization).
 */
import { describe, it, expect } from 'vitest';
import { resolveVentureRepoUrl, normalizeRepoUrl } from '../../../lib/eva/bridge/resolve-venture-repo.js';

const VID = '4f71b3bd-8a1e-462e-a8b2-76efb8607206';

// Minimal chainable supabase mock. `responses` maps table -> { data, error }.
// ventures terminates on .maybeSingle(); venture_artifacts on .limit().
function makeSupabase(responses) {
  return {
    from(table) {
      const resp = responses[table] ?? { data: null, error: null };
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => Promise.resolve(resp),
        maybeSingle: () => Promise.resolve(resp),
      };
      return builder;
    },
  };
}

describe('normalizeRepoUrl', () => {
  it('strips a trailing .git', () => {
    expect(normalizeRepoUrl('https://github.com/rickfelix/contribution-hub.git'))
      .toBe('https://github.com/rickfelix/contribution-hub');
  });
  it('strips a trailing .git/', () => {
    expect(normalizeRepoUrl('https://github.com/x/y.git/')).toBe('https://github.com/x/y');
  });
  it('trims whitespace', () => {
    expect(normalizeRepoUrl('  https://github.com/x/y  ')).toBe('https://github.com/x/y');
  });
  it('returns null for empty / non-string input', () => {
    expect(normalizeRepoUrl('')).toBeNull();
    expect(normalizeRepoUrl(null)).toBeNull();
    expect(normalizeRepoUrl(undefined)).toBeNull();
    expect(normalizeRepoUrl(123)).toBeNull();
  });
});

describe('resolveVentureRepoUrl (TS-6 precedence)', () => {
  it('returns ventures.repo_url when set (normalized, no .git)', async () => {
    const sb = makeSupabase({
      ventures: { data: { repo_url: 'https://github.com/rickfelix/contribution-hub.git' }, error: null },
    });
    expect(await resolveVentureRepoUrl(sb, VID)).toBe('https://github.com/rickfelix/contribution-hub');
  });

  it('falls back to the s17 github_sync artifact when repo_url is empty', async () => {
    const sb = makeSupabase({
      ventures: { data: { repo_url: '' }, error: null },
      venture_artifacts: { data: [{ metadata: { lovable_artifact: { type: 'github_sync', repo_url: 'https://github.com/rickfelix/canvas-ai' } } }], error: null },
    });
    expect(await resolveVentureRepoUrl(sb, VID)).toBe('https://github.com/rickfelix/canvas-ai');
  });

  it('normalizes the artifact repo_url (.git stripped)', async () => {
    const sb = makeSupabase({
      ventures: { data: null, error: null },
      venture_artifacts: { data: [{ metadata: { lovable_artifact: { type: 'github_sync', repo_url: 'https://github.com/x/y.git' } } }], error: null },
    });
    expect(await resolveVentureRepoUrl(sb, VID)).toBe('https://github.com/x/y');
  });

  it('ignores a non-github_sync artifact (returns null)', async () => {
    const sb = makeSupabase({
      ventures: { data: null, error: null },
      venture_artifacts: { data: [{ metadata: { lovable_artifact: { type: 'static_export', repo_url: 'https://github.com/x/y' } } }], error: null },
    });
    expect(await resolveVentureRepoUrl(sb, VID)).toBeNull();
  });

  it('returns null when neither source resolves', async () => {
    const sb = makeSupabase({
      ventures: { data: null, error: null },
      venture_artifacts: { data: [], error: null },
    });
    expect(await resolveVentureRepoUrl(sb, VID)).toBeNull();
  });

  it('prefers ventures.repo_url over the artifact (SSOT precedence)', async () => {
    const sb = makeSupabase({
      ventures: { data: { repo_url: 'https://github.com/rickfelix/ssot-wins' }, error: null },
      venture_artifacts: { data: [{ metadata: { lovable_artifact: { type: 'github_sync', repo_url: 'https://github.com/rickfelix/artifact-loser' } } }], error: null },
    });
    expect(await resolveVentureRepoUrl(sb, VID)).toBe('https://github.com/rickfelix/ssot-wins');
  });

  it('degrades to the artifact when the ventures read errors out', async () => {
    const sb = makeSupabase({
      ventures: { data: null, error: { message: 'boom' } },
      venture_artifacts: { data: [{ metadata: { lovable_artifact: { type: 'github_sync', repo_url: 'https://github.com/x/recovered' } } }], error: null },
    });
    expect(await resolveVentureRepoUrl(sb, VID)).toBe('https://github.com/x/recovered');
  });

  it('returns null for missing supabase or ventureId', async () => {
    expect(await resolveVentureRepoUrl(null, VID)).toBeNull();
    expect(await resolveVentureRepoUrl(makeSupabase({}), '')).toBeNull();
  });

  it('rejects a non-GitHub host (create-new fallback)', async () => {
    const sb = makeSupabase({
      ventures: { data: { repo_url: 'https://evil.example.com/x/y' }, error: null },
      venture_artifacts: { data: [], error: null },
    });
    expect(await resolveVentureRepoUrl(sb, VID)).toBeNull();
  });

  it('rejects a repo_url with shell metacharacters, falls back to the safe artifact', async () => {
    const sb = makeSupabase({
      ventures: { data: { repo_url: 'https://github.com/x/y; rm -rf /' }, error: null },
      venture_artifacts: { data: [{ metadata: { lovable_artifact: { type: 'github_sync', repo_url: 'https://github.com/rickfelix/safe-repo' } } }], error: null },
    });
    expect(await resolveVentureRepoUrl(sb, VID)).toBe('https://github.com/rickfelix/safe-repo');
  });
});
