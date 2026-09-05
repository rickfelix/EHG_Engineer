// PLAN-phase revision: prospective TESTING sub-agent (evidence 67361b06-cd82-4469-bee7-4dfef51ef13f,
// CONDITIONAL_PASS) found the original FR-1/FR-3/FR-4/FR-5 as scoped would ship a real defect:
// branch-first derivation, as originally worded, REMOVES the existing `match[1] !== 'qf'` scope
// gate (WORKTREE_PATH_RE already scopes ENFORCEMENT-4 to .worktrees/<segment> paths) and newly
// subjects .worktrees/qf/** (10 live trees) to a guard that has never touched them -- the exact
// fail-open->fail-closed inversion this SD exists to PREVENT, arriving through a mechanism FR-3
// didn't cover. Three findings (C1 implicit in probe 1, C2, C3) are marked "must be resolved in
// the same PR" by the sub-agent's own verdict. This revises FR-1/FR-3/FR-4/FR-5/TR-2/TR-3 in
// place rather than leaving the fix as an external note EXEC might miss.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const PRD_ID = 'PRD-11f9e1ac-a769-47f1-82b4-950a32a0d977';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const EVIDENCE = 'TESTING sub-agent evidence 67361b06-cd82-4469-bee7-4dfef51ef13f (prospective, CONDITIONAL_PASS)';

async function main() {
  const { data: prd, error: fetchErr } = await supabase
    .from('product_requirements_v2')
    .select('functional_requirements, technical_requirements, risks')
    .eq('id', PRD_ID)
    .single();
  if (fetchErr || !prd) { console.error('PRD_FETCH_FAILED', fetchErr); process.exit(1); }

  const functional_requirements = prd.functional_requirements.map((fr) => {
    if (fr.id === 'FR-1') {
      return {
        ...fr,
        requirement: 'Branch-first key derivation WITHIN the existing worktree scope gate (not a scope expansion)',
        description: fr.description +
          ` REVISED per ${EVIDENCE} (C1/C3, must-fix): the ORIGINAL wording risked removing the existing scope gate entirely. WORKTREE_PATH_RE + the container-exemption check (today: match[1] !== 'qf'; pre-tool-enforce.cjs:854 separately advertises containers {sd,qf,adhoc} -- ENFORCEMENT-4 must be corrected to exempt ALL declared non-key containers, not just 'qf', closing that self-contradiction) remain the SCOPE gate exactly as today -- a file path outside .worktrees, or inside an exempted container, never reaches derivation at all. Branch/marker derivation only REFINES the key for paths already in scope; it does NOT newly bring .worktrees/qf/** or non-worktree paths into scope. Worktree root for the git command must be resolved via \`git rev-parse --show-toplevel\` from the target file's directory (via execFileSync) and the branch-derived key DISCARDED unless that toplevel path is itself under .worktrees/ -- measured: for the majority 2-segment tree layout (13 live trees), \`git -C .worktrees/qf rev-parse --abbrev-ref HEAD\` returns "main" with exit 0 (no error), which without this check would produce a confidently-wrong key tagged source=branch (highest priority) with nothing to fall through on (C3). execFileSync calls MUST set an explicit timeout (2000ms), stdio, and windowsHide:true (C9) -- an unbounded call can hang the guard on a contended git index.lock.`,
        acceptance_criteria: [
          ...fr.acceptance_criteria,
          'A file path under .worktrees/qf/<name>/... is exempted from the guard exactly as today (branch derivation never expands scope to previously-exempt containers)',
          '`git -C .worktrees/qf rev-parse --abbrev-ref HEAD` (a container-level, not tree-level, invocation) does NOT produce a usable derived key -- verified via the show-toplevel + under-.worktrees check',
          'execFileSync calls to git specify timeout, stdio, and windowsHide -- verified by a specimen simulating a hung/contended git process not blocking the tool call indefinitely',
        ],
      };
    }
    if (fr.id === 'FR-3') {
      return {
        ...fr,
        description: fr.description +
          ` REVISED per ${EVIDENCE}: the "no key from any source" early-return is UNREACHABLE as originally specified once the path regex is a terminal fallback that matches any non-empty segment. The actual, meaningful early-return gate IS today's existing scope check (WORKTREE_PATH_RE match + container exemption) -- FR-1's revision above makes this concrete. Separately (measured, NOT fixed by this SD): 32% of historical PAT-CLMMULTI-002 blocks carry a worktreeSdKey that is not a well-formed key at all (e.g. "fix", "_archive", "capa-w1b-fr6", lowercase "qf-20260829-936") -- these trees' branches (walk/, drill/, ceremony/, detached HEAD) yield no anchored key and fall through to the SAME pre-existing path-regex behavior as today. This SD does not need to fix pre-existing malformed-key false blocks (a separate, already-present defect); it must only avoid WORSENING them, which the anchored-key-only derivation (never returning a non-key-shaped string) guarantees by construction.`,
        acceptance_criteria: [
          ...fr.acceptance_criteria,
          'Documented as a KNOWN LIMITATION, not a false pass: the ~32% of historical blocks with non-key-shaped worktreeSdKey values are unaffected by this SD (same path-fallback behavior as today) -- FR-4 specimen (d) demonstrates fall-through parity, not a fix for those specific rows',
        ],
      };
    }
    if (fr.id === 'FR-4') {
      return {
        ...fr,
        description: fr.description +
          ` REVISED per ${EVIDENCE} (C5): specimen (a)'s original "assert audit row source=branch" is UNCHECKABLE -- ENFORCEMENT-4 only calls auditPermissionDecision on the BLOCK path today, so an ALLOW verdict writes no audit row to inspect. Specimen (a) is instead verified via: exit code 0 AND empty stderr (no CLAIM GUARD message) AND, when LEO_CLAIM_GUARD_DEBUG=1 is set in the test's env, a debug-only stderr line printing {derivedKey, source} for test introspection (never written to permission_audit_log on the allow path, avoiding a new DB write on every successful edit). FR-1's own "no live worktree required" claim is corrected: specimens (a) and (d) genuinely need a live git fixture to exercise real branch resolution -- use a throwaway \`git init\` tmp directory fixture (never an env-var override of the branch/derivation result, which would be a spoofable bypass of a security guard).`,
        acceptance_criteria: [
          ...fr.acceptance_criteria,
          'Specimen (a) is verified via exit code + empty block-message stderr + LEO_CLAIM_GUARD_DEBUG=1 introspection line, not via a nonexistent allow-path audit row',
          'Specimens requiring a real branch (a, d) use a throwaway `git init` tmp fixture, never an env-var override of the derived key/branch (which would be a guard bypass vector)',
        ],
      };
    }
    if (fr.id === 'FR-5') {
      return {
        ...fr,
        description: fr.description +
          ` REVISED per ${EVIDENCE} (C6, C7): FR-5a's CI script must report its DENOMINATOR (total qualifying audit rows examined in the post-merge window) alongside the count, and print INSUFFICIENT_DATA rather than a bare PASS when the denominator is 0 -- the new metadata.branch field only exists on POST-merge rows, so a zero-denominator window would otherwise "pass" for the wrong reason (no data, not zero defects). FR-5b's "no other hook derives an SD key from a directory name alone" claim must be VERIFIED, not assumed: run the lint against current HEAD before merge and resolve any real hits (do not assume "passes today by construction" without running it) -- known candidates to check: set-activity-state.cjs and concurrent-session-worktree.cjs, either narrowing the lint pattern to exclude legitimate uses or fixing genuine violations.`,
        acceptance_criteria: [
          ...fr.acceptance_criteria,
          'FR-5a script prints its denominator and emits INSUFFICIENT_DATA (distinct from PASS) when zero qualifying rows exist in the window',
          'FR-5b lint is actually run against HEAD before merge (not assumed clean) and any real hits are resolved (fixed or pattern narrowed) with the run\'s output attached as evidence',
        ],
      };
    }
    return fr;
  });

  const technical_requirements = prd.technical_requirements.map((tr) => {
    if (tr.id === 'TR-2') {
      return {
        ...tr,
        rationale: tr.rationale + ` REVISED per ${EVIDENCE} (C9): execFileSync calls MUST specify an explicit timeout (2000ms), stdio, and windowsHide:true -- an unbounded call on a contended git index.lock would freeze the tool call indefinitely, worse than the guard it protects.`,
      };
    }
    if (tr.id === 'TR-3') {
      return {
        ...tr,
        requirement: 'Anchored-key-only output naturally avoids the case/malformed-value class, no separate normalization needed',
        rationale: `REVISED per ${EVIDENCE} (C8): measured 72/1000 strategic_directives_v2.sd_key values are NOT uppercase -- but these are bare UUIDs and malformed slugs, not case-variant KEYS; the originally-proposed .toUpperCase()-both-sides remedy addressed the wrong problem (a no-op for equality against a non-key value regardless of case). The actual mitigation: deriveWorktreeKey's anchored regex only ever returns well-formed SD-/QF-key-shaped strings, so it can never accidentally match a UUID or malformed slug row by construction -- those rows simply continue to correctly fail the mismatch/no-match check exactly as they do today, no additional normalization required. NOTE (out of scope, flagged not fixed): isQuickFixWorktree uses a case-insensitive /^QF-/i match while resolveSessionClaimedSdKey's REST lookup (id=eq.<key>) is case-sensitive, affecting 7/103 historical rows -- this is a pre-existing QF-tri-state defect, explicitly out of scope per TR-4 ("no change to the qfHeld tri-state"); left as a known issue for a future QF-specific fix, not addressed here.`,
      };
    }
    return tr;
  });

  const risks = [
    ...prd.risks,
    {
      risk: 'Branch-first derivation, if it removes the existing WORKTREE_PATH_RE + container-exemption scope gate rather than only refining the key within it, newly subjects previously-exempt paths (.worktrees/qf/**, 10 live trees) to blocking -- the exact fail-open-to-fail-closed inversion this SD exists to prevent',
      probability: 'MEDIUM',
      impact: 'HIGH',
      mitigation: `${EVIDENCE} (C1) identified this precisely; FR-1/FR-3 are revised to make the scope gate identical to today's, with branch/marker only refining the key for paths already in scope.`,
      rollback_plan: 'LEO_CLAIM_GUARD=off remains the existing global kill-switch, unaffected by this change.',
    },
    {
      risk: 'Resolving the worktree root via a fixed single-segment path (rather than git rev-parse --show-toplevel) silently derives a wrong key from a container-level git invocation for 2-segment tree layouts (13 live trees)',
      probability: 'HIGH',
      impact: 'HIGH',
      mitigation: `${EVIDENCE} (C3, measured: git -C .worktrees/qf rev-parse returns "main", exit 0). FR-1 requires show-toplevel resolution with an under-.worktrees discard check.`,
      rollback_plan: 'Same as FR-1\'s general rollback: LEO_CLAIM_GUARD=off or revert the merge commit.',
    },
  ];

  const { error: updateErr } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements, technical_requirements, risks })
    .eq('id', PRD_ID);
  if (updateErr) { console.error('PRD_UPDATE_FAILED', updateErr); process.exit(1); }
  console.log('PRD_REVISED_PER_TESTING_FINDINGS', { fr_count: functional_requirements.length, tr_count: technical_requirements.length, risk_count: risks.length });
}

if (isMainModule(import.meta.url)) {
  main();
}
