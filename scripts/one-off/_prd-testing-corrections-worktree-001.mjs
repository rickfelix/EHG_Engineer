import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ID = 'PRD-SD-FDBK-ENH-SCOPE-REPLACE-WORKTREE-001';

const { data: p, error: readErr } = await s
  .from('product_requirements_v2')
  .select('functional_requirements,technical_requirements,test_scenarios,metadata')
  .eq('id', ID).maybeSingle();
if (readErr || !p) { console.error('read failed', readErr && readErr.message); process.exit(1); }

const FR3_ADD = ' || TESTING CORRECTION: the stated harm is NOT currently realized. readWorktreeNmMode has ZERO consumers (referenced only at its definition worktree-provision.js:98 and in the module export :191); the direct readers of the marker file treat the filename as non-blocking dirt and never parse contents. Backward-compat risk is therefore LOW, but FR-3 can carry only a UNIT ROUND-TRIP test, and EXEC must NOT invent a synthetic consumer to make it look integration-tested. Restated justification: FORENSIC/TRIAGE value, which is real and was load-bearing in this SD own LEAD correction, NOT unblocking an existing tool. Note that lib/__tests__/worktree-provision.test.js:89-98 currently PINS the ambiguous behaviour (writeMarker last called with the bare junction string on the failure path); FR-3 makes that assertion fail. That is the DESIRED mutation signal, so change it deliberately rather than discovering it as a surprise red.';

const FR4_ADD = ' || CRITICAL TESTING CORRECTION - AS WRITTEN THIS REOPENS A CLOSED REGRESSION. lib/worktree-manager.js:86-93 documents that lstatSync rather than existsSync was chosen ON PURPOSE: for a JUNCTION-mode worktree the link target is transiently absent during a concurrent npm install at the main repo (.staging atomic swap), and reading THROUGH the link would falsely report the worktree incomplete and tear down a HEALTHY one (adversarial review of PR 3488, finding 1). Counting packages INSIDE node_modules lands in the shared store mid-swap. FR-4 MUST therefore be QUALIFIED: apply the population check ONLY when the worktree is isolated - gate on the isolated marker OR on lstat isSymbolicLink being false - and never read through a junction. This failure mode manifests ONLY under concurrency, so a quiet test run will not surface it.';

const FR5_ADD = ' || TWO TESTING CORRECTIONS. (1) There is NO existing reparse audit to demote - a repo-wide grep for reparse finds only comment mentions, and the LEAD measurement was ad hoc. This FR CREATES the guard. (2) THE ACCEPTANCE AS I FIRST WROTE IT WAS VACUOUS: the original TS-5 exercised removeWorktreeViaGit and preUnlinkWorktreeNodeModules in lib/worktree-manager.js, which FR-1 through FR-4 DO NOT MODIFY. It is green today and stays green if this entire SD is reverted, so I had replaced one permanently-vacuous acceptance with another. TS-5 is now COMPOSED - see its revised text.';

const fr = p.functional_requirements.map((r) => {
  if (r.id === 'FR-3') return { ...r, description: r.description + FR3_ADD };
  if (r.id === 'FR-4') return { ...r, description: r.description + FR4_ADD };
  if (r.id === 'FR-5') return { ...r, title: 'CREATE a reparse CI regression guard, and prove the invariant that actually matters', description: r.description + FR5_ADD };
  return r;
});

const tr = [...p.technical_requirements,
  { id: 'TR-6',
    title: 'Extract the emptiness predicate as an EXPORTED PURE function - otherwise FR-1 cannot be tested behaviourally',
    description: 'The guard at scripts/resolve-sd-workdir.js:586 lives inside ensureWorktreeEssentials, which is NOT EXPORTED (declared :573; the exports at :236 and :857 omit it). The only existing tests for that file are static source-text pins. Without extraction, EXEC will satisfy TS-1 and TS-2 with ANOTHER source-text pin - a test that cannot fail for the reason it exists. REQUIRED: extract a predicate such as isNodeModulesUnprovisioned(dir, fsImpl) as an exported pure function, have :586 call it, and pin the PREDICATE behaviourally.' },
  { id: 'TR-7',
    title: 'Do not inherit the quarantined rmsync guard - but do not add a new offender either',
    description: 'tests/unit/lib/worktree-rmsync-junction-safety.test.js is quarantined with reason_class real-finding-guard and a triage_note saying FIX the 2 files do not silence, and it is STILL RED. HOWEVER both flagged files are DETECTOR FALSE POSITIVES: concurrent-session-worktree.cjs:611 calls _unlinkNestedLinks immediately before rmSync at :612 (that IS the safety pattern, but the guard SAFE_IMPORT regex only recognises a literal isSymbolicLink within 200 chars of unlinkSync and cannot see named-helper indirection), and sweep-worker-scratch.mjs:276 matches ONLY because the worktrees path appears in its EXCLUDE deny list. Fixing the detector is separate-SD work with its own false-negative risk. THIS SD OBLIGATION IS NARROW: run the guard scoped BEFORE and AFTER the change and assert the offender list is still EXACTLY those two. ALSO NOTE: tests/unit/scripts/resolve-sd-workdir-substrate-gate.test.js is ALSO quarantined (assertion-drift) and is the wiring pin for the very substrate gate FR-4 modifies, so EXEC would otherwise edit that gate with its wiring test silently excluded from the unit tier.' }
];

const ts = [
  { id: 'TS-1', scenario: 'A node_modules containing only .vite is CLASSIFIED unprovisioned and provisioning is INVOKED', type: 'unit',
    expected: 'The exported predicate from TR-6 returns unprovisioned, and an INJECTED runInstall spy is called. DO NOT assert that npm actually populated anything - defaultRunInstall is a real 180s network- and cache-dependent install and is flaky in the unit tier.' },
  { id: 'TS-2', scenario: 'A node_modules containing only a non-vite stray such as a lock file is ALSO classified unprovisioned', type: 'unit',
    expected: 'The same predicate returns unprovisioned, proving the check is EMPTINESS-based rather than matching the string .vite. Uses the real _archive counter-example shape.' },
  { id: 'TS-3', scenario: 'The no-op logger is GONE from the hot provisioning path', type: 'unit',
    expected: 'scripts/resolve-sd-workdir.js:597 no longer passes a no-op log dep, pinned by its ABSENCE, and the durable emission routes through a separate injectable sink that never touches deps.log. A test that itself passes a no-op logger would prove the library behaves, NOT that the real call site is covered - a hand-wired stand-in, which this PRD implementation_approach forbids.' },
  { id: 'TS-4', scenario: 'NEGATIVE CONTROL - a deliberately created junction is detected', type: 'unit',
    expected: 'The detector FIRES (lstat isSymbolicLink true). Without this, any zero from the audit is meaningless.' },
  { id: 'TS-5', scenario: 'COMPOSED provision-then-delete: force the isolate_failed_fallback junction, THEN remove the worktree', type: 'integration',
    expected: 'Provision a sandbox worktree THROUGH provisionWorktreeNodeModules with an INJECTED THROWING runInstall (forcing the fallback junction), then run removal, then assert shared-root count before equals after. This REPLACES the earlier TS-5, which exercised removeWorktreeViaGit - code this SD does not modify - and was therefore green on full revert. The composed form traverses the FR-2 durable record and the FR-3 marker and CAN fail. Reuse makeSandbox and addWorktreeWithJunctionNM from scripts/safe-worktree-remove.test.js verbatim, INCLUDING its afterEach junction-unlink at lines 52-63, without which the test itself guts what it linked.' },
  { id: 'TS-6', scenario: 'A hollow ISOLATED worktree fails substrate validation', type: 'unit',
    expected: 'WORKTREE_INCOMPLETE is raised for a real-directory node_modules holding no packages.' },
  { id: 'TS-7', scenario: 'REGRESSION GUARD - a JUNCTION-mode worktree whose target is transiently empty must NOT be reported incomplete', type: 'unit',
    expected: 'No WORKTREE_INCOMPLETE. This is the PR-3488 finding-1 regression that FR-4 would otherwise reopen: reading through a junction during a concurrent .staging swap would tear down a healthy worktree. It manifests only under concurrency, so it must be pinned explicitly rather than assumed absent.' }
];

const metadata = { ...(p.metadata || {}), testing_review_corrections: {
  at: new Date().toISOString(),
  verdict: 'CONDITIONAL_PASS 88 - not blocking PLAN-TO-EXEC; all four conditions applied to this PRD before EXEC writes code.',
  vacuous_acceptance_caught: 'My original TS-5 tested UNCHANGED code and was green on full revert - the THIRD un-failable pin I authored this session. Replaced with a composed provision-then-delete scenario that traverses the code this SD actually changes.',
  regression_i_nearly_specified: 'FR-4 as first written would have REOPENED the PR-3488 finding-1 regression: lstat was chosen deliberately so that a transiently-absent junction target during a concurrent .staging swap does not tear down a healthy worktree. Now qualified to isolated worktrees only, with TS-7 pinning the regression.',
  premises_corrected: 'FR-3 harm is not currently realized (readWorktreeNmMode has zero consumers), so its justification is restated as forensic/triage. FR-5 CREATES the reparse guard - there was none to demote.',
  sandbox_limit_stated: 'The safe-worktree-remove sandbox uses a QUIESCENT shared store while the real one is concurrently written by parallel installs. A green TS-5 closes the junction-follow mechanism ONLY; a wipe with a concurrency component would stay green through it.'
} };

const { error } = await s.from('product_requirements_v2')
  .update({ functional_requirements: fr, technical_requirements: tr, test_scenarios: ts, metadata })
  .eq('id', ID);
if (error) { console.error('update failed', error.message); process.exit(1); }
console.log('PRD updated: FRs', fr.length, '| TRs', tr.length, '| scenarios', ts.length);
