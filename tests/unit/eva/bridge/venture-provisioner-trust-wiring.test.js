/**
 * SD-LEO-INFRA-VENTURE-REPO-TRUST-001 — provisioner WIRING pin (TS-2 / TS-3, integration slice).
 *
 * The decision+write logic (resolveTrustElevation / elevateVentureRepoTrust) is exhaustively
 * unit-tested in venture-provisioner-trust-elevation.test.js. This file pins the ONE fact those
 * pure tests cannot: that the DEFAULT_STEPS `repo_created` step invokes elevateVentureRepoTrust
 * ONLY on the genuine-mint branch (repoExists===false -> `gh repo create`) and passes
 * repoWasMinted:true ONLY there — the load-bearing second layer of the "imported repos can NEVER
 * be born trusted" negative pin. Without this test, a refactor that moved the elevation call out
 * of the else-branch (or added a repoWasMinted:true call to the repo-exists branch) would ship
 * green — the pure tests would still pass. (Ref memory: "test-masking: mock the gate ships green
 * on dead code"; "RECURRED-family fix requires e2e acceptance in spec".)
 *
 * The gh CLI, the local clone, and resource registration are mocked; the elevation module is
 * spied. No live DB, no network, no `gh`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  repoViewShouldThrow: true, // true => repo does NOT exist => genuine mint path
  createCalled: false,
  elevateSpy: vi.fn(),
}));

// gh CLI: `repo view` throws when the repo is absent (mint) or returns JSON when present
// (imported/existing); `repo create` records that a real mint occurred.
vi.mock('child_process', () => ({
  execFileSync: (_file, args) => {
    if (Array.isArray(args) && args.includes('view')) {
      if (h.repoViewShouldThrow) throw new Error('gh: repo not found');
      return JSON.stringify({ name: 'apexniche-ai' });
    }
    if (Array.isArray(args) && args.includes('create')) {
      h.createCalled = true;
      return '';
    }
    return '';
  },
}));

vi.mock('../../../../lib/eva/bridge/ensure-venture-clone.js', () => ({
  ensureVentureClone: () => ({ action: 'cloned', reason: 'test-fixture' }),
}));

vi.mock('../../../../lib/venture-resources.js', () => ({
  registerVentureResource: async () => {},
}));

// The spied elevation module — the exact seam we are pinning.
vi.mock('../../../../lib/eva/bridge/trust-elevation.js', () => ({
  elevateVentureRepoTrust: h.elevateSpy,
}));

const { DEFAULT_STEPS } = await import('../../../../lib/eva/bridge/venture-provisioner.js');

function repoCreatedStep() {
  const step = DEFAULT_STEPS.find((s) => s.name === 'repo_created');
  if (!step) throw new Error('repo_created step not found in DEFAULT_STEPS');
  return step;
}

function makeCtx() {
  return {
    ventureId: 'v-arch',
    venture: { name: 'ApexNiche AI', repoName: 'apexniche-ai', localPath: '/tmp/apexniche-ai' },
    ventureRepoPath: null,
    stepsCompleted: [],
    log: () => {},
  };
}

describe('venture-provisioner repo_created — trust-elevation WIRING pin', () => {
  beforeEach(() => {
    h.repoViewShouldThrow = true;
    h.createCalled = false;
    h.elevateSpy.mockReset();
    h.elevateSpy.mockResolvedValue({ elevated: true, reason: 'elevated' });
  });

  it('GENUINE MINT (repo absent): mints the repo AND calls elevateVentureRepoTrust with repoWasMinted:true', async () => {
    h.repoViewShouldThrow = true; // repo does not exist -> else-branch -> gh repo create
    await repoCreatedStep().execute(makeCtx());

    expect(h.createCalled).toBe(true); // the fleet genuinely minted the repo
    expect(h.elevateSpy).toHaveBeenCalledTimes(1);
    const arg = h.elevateSpy.mock.calls[0][0];
    expect(arg.repoWasMinted).toBe(true);
    expect(arg.ventureId).toBe('v-arch');
    expect(arg.ventureName).toBe('ApexNiche AI');
  });

  it('IMPORTED/EXISTING repo (repo present): NEVER mints and NEVER calls elevateVentureRepoTrust (negative pin)', async () => {
    h.repoViewShouldThrow = false; // repo already exists -> if(repoExists) branch, no create, no elevation
    await repoCreatedStep().execute(makeCtx());

    expect(h.createCalled).toBe(false); // no mint occurred
    expect(h.elevateSpy).not.toHaveBeenCalled(); // imported repo can never be born trusted through this path
  });
});
