// QF-20260706-356 — claim-time repo-fitness guard for the venture-wide quick_fixes lane.
// Hermetic: a hand-rolled fake supabase client, no live DB.
import { describe, it, expect } from 'vitest';
import { repoUnfitReason } from '../../../lib/fleet/qf-repo-fitness.js';

const APPS = [
  { name: 'EHG', github_repo: 'rickfelix/ehg.git', local_path: '/repos/ehg' },
  { name: 'EHG_Engineer', github_repo: 'rickfelix/EHG_Engineer.git', local_path: '/repos/EHG_Engineer' },
  { name: 'MarketLens', github_repo: 'rickfelix/marketlens', local_path: '/repos/marketlens' },
  { name: 'Cron Canary', github_repo: null, local_path: '/repos/cron-canary' },
];

function fakeSupabase({ targetApplication }) {
  return {
    from(table) {
      if (table === 'quick_fixes') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { target_application: targetApplication } }) }) }),
        };
      }
      if (table === 'applications') {
        return {
          select: () => ({ eq: () => ({ is: async () => ({ data: APPS }) }) }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe('repoUnfitReason', () => {
  it('fails open for a platform target (EHG_Engineer)', async () => {
    const sb = fakeSupabase({ targetApplication: 'EHG_Engineer' });
    expect(await repoUnfitReason(sb, 'QF-1')).toBeNull();
  });

  it('fails open when no target_application is set', async () => {
    const sb = fakeSupabase({ targetApplication: null });
    expect(await repoUnfitReason(sb, 'QF-1')).toBeNull();
  });

  it('MarketLens (github_repo + local_path both set) is claimable', async () => {
    const sb = fakeSupabase({ targetApplication: 'MarketLens' });
    expect(await repoUnfitReason(sb, 'QF-1')).toBeNull();
  });

  it('Cron Canary (github_repo NULL) routes back with a named reason', async () => {
    const sb = fakeSupabase({ targetApplication: 'Cron Canary' });
    const reason = await repoUnfitReason(sb, 'QF-1');
    expect(reason).toMatch(/Cron Canary/);
    expect(reason).toMatch(/github_repo=null/);
    expect(reason).toMatch(/venture-SD lane/);
  });

  it('fails open for a target that matches no registered application', async () => {
    const sb = fakeSupabase({ targetApplication: 'SomeUnregisteredVenture' });
    expect(await repoUnfitReason(sb, 'QF-1')).toBeNull();
  });

  it('name matching is separator/case-insensitive', async () => {
    const sb = fakeSupabase({ targetApplication: 'cron-canary' });
    const reason = await repoUnfitReason(sb, 'QF-1');
    expect(reason).toMatch(/no usable repo/);
  });
});
