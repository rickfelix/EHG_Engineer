// SD-FDBK-ENH-SCOPE-REPLACE-WORKTREE-001 FR-1 / TR-6.
//
// The guard at scripts/resolve-sd-workdir.js used to be `!fs.existsSync(targetModules)`, and
// existsSync is TRUE for an EMPTY directory. So once anything created <wt>/node_modules/,
// provisioning was skipped PERMANENTLY — ensureWorktreeEssentials runs after every successful
// resolution and still never re-provisioned. Vite mkdir -p's node_modules/.vite for its optimize
// cache, which poisoned it. Measured on this fleet: affected worktrees held literally .vite/ and
// .vite-temp/ and NOTHING else, yet require.resolve succeeded by Node walking UP to the shared
// root — the coupling that makes a shared-root wipe fleet-fatal.
//
// TR-6 required the predicate be EXPORTED and PURE. It previously lived inside a non-exported
// function, so the only tests possible were source-text greps — a test that cannot fail for the
// reason it exists. These drive the real predicate with an injected fs.
import { describe, it, expect } from 'vitest';
import { isNodeModulesUnprovisioned } from '../../../scripts/resolve-sd-workdir.js';

/** Injected fs stub. `link` makes lstat report a junction; `entries` is what readdir returns. */
const fsWith = ({ link = false, dir = true, entries = [], throwLstat = false, throwReaddir = false } = {}) => ({
  lstatSync() {
    if (throwLstat) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
    return { isSymbolicLink: () => link, isDirectory: () => dir };
  },
  readdirSync() {
    if (throwReaddir) throw new Error('EACCES');
    return entries;
  }
});

describe('isNodeModulesUnprovisioned — population, not existence (FR-1)', () => {
  it('treats an absent node_modules as unprovisioned', () => {
    expect(isNodeModulesUnprovisioned('nm', fsWith({ throwLstat: true }))).toBe(true);
  });

  it('treats a directory holding ONLY Vite caches as unprovisioned — the shipped defect', () => {
    // This is the exact on-disk shape measured on QF-20260727-923 and QF-20260704-598.
    expect(isNodeModulesUnprovisioned('nm', fsWith({ entries: ['.vite', '.vite-temp'] }))).toBe(true);
  });

  it('is EMPTINESS-based, not NAME-based: a non-.vite stray also counts as unprovisioned', () => {
    // An _archive worktree was found poisoned by ONLY .rank-pass-trigger.lock, with no .vite at
    // all. A fix scoped to "Vite creates .vite" would under-cover and leave that case broken.
    expect(isNodeModulesUnprovisioned('nm', fsWith({ entries: ['.rank-pass-trigger.lock'] }))).toBe(true);
    expect(isNodeModulesUnprovisioned('nm', fsWith({ entries: ['.package-lock.json', '.bin'] }))).toBe(true);
  });

  it('treats a populated tree as provisioned', () => {
    expect(isNodeModulesUnprovisioned('nm', fsWith({ entries: ['.vite', '@supabase', 'vitest'] }))).toBe(false);
  });

  it('counts a scoped package as a real package entry', () => {
    expect(isNodeModulesUnprovisioned('nm', fsWith({ entries: ['@supabase'] }))).toBe(false);
  });

  it('treats a FILE named node_modules as unprovisioned', () => {
    expect(isNodeModulesUnprovisioned('nm', fsWith({ dir: false }))).toBe(true);
  });

  it('treats an unreadable directory as unprovisioned rather than throwing', () => {
    expect(isNodeModulesUnprovisioned('nm', fsWith({ throwReaddir: true }))).toBe(true);
  });
});

describe('isNodeModulesUnprovisioned — must NOT read through a junction (PR #3488 regression)', () => {
  it('reports a junction as PROVISIONED even when the target reads back empty', () => {
    // THE REGRESSION THIS PREVENTS: lib/worktree-manager.js:86-93 records that lstat was chosen
    // over a read-through check because a junction's target is TRANSIENTLY ABSENT during a
    // concurrent npm install at the main repo (.staging atomic swap). Reading through would
    // classify a HEALTHY junctioned worktree as unprovisioned and re-provision it — under load,
    // which is exactly when the store is busiest. It manifests ONLY under concurrency, so it must
    // be pinned explicitly rather than assumed absent.
    expect(isNodeModulesUnprovisioned('nm', fsWith({ link: true, entries: [] }))).toBe(false);
  });

  it('short-circuits BEFORE readdir, so a throwing target cannot flip the verdict', () => {
    // Proves the junction check precedes the read rather than merely coinciding with it: if
    // readdir were reached it would throw and return true.
    expect(isNodeModulesUnprovisioned('nm', fsWith({ link: true, throwReaddir: true }))).toBe(false);
  });
});
