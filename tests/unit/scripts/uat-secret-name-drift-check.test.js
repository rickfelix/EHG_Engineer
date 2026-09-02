/**
 * SD-LEO-INFRA-ALTIFYAI-TEST-IDENTITY-001 (FR-5 AC#5, TS-7).
 * Unit test for the pure deploy.yml-parsing function. The script's I/O
 * (gh api, Supabase) is intentionally NOT exercised here.
 */
import { describe, expect, it } from 'vitest';
import { findSecretNameInDeployYml, fetchDeployYmlText } from '../../../scripts/uat-secret-name-drift-check.mjs';
import { CHAIRMAN_UAT_SECRET_NAME } from '../../../lib/eva/synthetic-actor-constants.js';

const REAL_STEP_SHAPE = `
      - name: Build
        env:
          VITE_CLERK_PUBLISHABLE_KEY: \${{ secrets.VITE_CLERK_PUBLISHABLE_KEY }}
        run: npm run build
      - name: post-deploy-signed-in-uat
        env:
          CHAIRMAN_UAT_SESSION_TOKEN: \${{ secrets.CHAIRMAN_UAT_SESSION_TOKEN }}
        run: |
          set -o pipefail
`;

describe('findSecretNameInDeployYml', () => {
  it('finds the secret name from the post-deploy-signed-in-uat step, not an earlier step', () => {
    expect(findSecretNameInDeployYml(REAL_STEP_SHAPE)).toBe('CHAIRMAN_UAT_SESSION_TOKEN');
  });

  it('returns null when the step does not exist', () => {
    expect(findSecretNameInDeployYml('name: Deploy\non: push\n')).toBeNull();
  });

  it('is the pinned constant this repo actually references (sanity check on the fixture)', () => {
    expect(findSecretNameInDeployYml(REAL_STEP_SHAPE)).toBe(CHAIRMAN_UAT_SECRET_NAME);
  });
});

describe('fetchDeployYmlText (QF-20260901-006)', () => {
  it('decodes the base64 content on success', () => {
    const b64 = Buffer.from('name: Deploy\n').toString('base64');
    const run = () => b64;
    expect(fetchDeployYmlText('repos/x/y/contents/z', run)).toBe('name: Deploy\n');
  });

  it('returns null (never throws) on a 404 -- the daily crash this QF fixes', () => {
    const run = () => {
      const err = new Error('Command failed: gh api repos/rickfelix/altifyai/contents/.github/workflows/deploy.yml --jq .content\ngh: Not Found (HTTP 404)');
      throw err;
    };
    expect(() => fetchDeployYmlText('repos/rickfelix/altifyai/contents/.github/workflows/deploy.yml', run)).not.toThrow();
    expect(fetchDeployYmlText('repos/rickfelix/altifyai/contents/.github/workflows/deploy.yml', run)).toBeNull();
  });

  it('returns null on any other gh failure (network, auth) rather than propagating', () => {
    const run = () => { throw new Error('gh: authentication failed'); };
    expect(fetchDeployYmlText('repos/x/y/contents/z', run)).toBeNull();
  });
});
