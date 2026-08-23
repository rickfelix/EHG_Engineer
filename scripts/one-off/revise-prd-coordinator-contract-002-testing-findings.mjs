// SD-LEO-INFRA-COORDINATOR-ROLE-CONTRACT-002 -- PLAN-phase PRD revision incorporating
// the prospective TESTING sub-agent's findings (row a287419c-fb6b-48b7-b7ca-9c1e442a1ece,
// CONDITIONAL_PASS): 2 blocking gaps (digest conservation, tracker registration) + 5
// test-scenario disambiguations. This is a content patch, not a re-generation --
// preserves everything already authored and adds/revises only what TESTING flagged.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRD_ID = 'PRD-SD-LEO-INFRA-COORDINATOR-ROLE-CONTRACT-002';

const { data: prd, error: fetchErr } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements, technical_requirements, test_scenarios, risks, acceptance_criteria')
  .eq('id', PRD_ID)
  .single();
if (fetchErr) { console.error(fetchErr); process.exit(1); }

// --- FR additions: GAP A (digest conservation) + GAP B (tracker registration) ---
const functional_requirements = [
  ...prd.functional_requirements,
  {
    id: 'FR-6',
    requirement: 'Guard the coordinator digest against silent content loss when FR-4 moves/collapses charter content.',
    description: "TESTING sub-agent (PLAN, row a287419c) found generateCoordinatorDigest maps ONLY to coordinator_role_contract, so anything FR-4 moves out of row 605 (to manual/provenance) is STRUCTURALLY REMOVED from the digest, not truncated -- the exact defect class that silently gutted Adam's digest 18,903->4,727 bytes, losing 4 authority clauses, during SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 ('nothing failed, the file still looked like a contract', per tests/unit/adam/adam-digest-authority-survives.test.js:5-15). Add a coordinator-digest-authority regression test mirroring that precedent, and review whether the digest mapping needs to include coordinator_manual and/or the FR-5 never-do block's section_type.",
    priority: 'CRITICAL',
    acceptance_criteria: [
      'A tests/unit/coordinator/coordinator-digest-authority-survives.test.js exists, mirroring adam-digest-authority-survives.test.js, pinning that the digest retains a named list of authority/obligation clauses post-restructure',
      'The digest mapping is reviewed and extended if FR-4/FR-5 move content the digest currently depends on (coordinator_role_contract) to a section_type the digest does not map',
      "generateCoordinatorDigest's char budget (currently the 3000-char default) is explicitly reviewed against the post-restructure content volume, mirroring generateAdamDigest's 16000-char override if truncation would otherwise drop authority content",
    ],
  },
  {
    id: 'FR-7',
    requirement: 'Register the 2 new coordinator companion files (manual, provenance) in the protocol-file-read tracker.',
    description: "TESTING sub-agent (PLAN, row a287419c) found every other split role (Adam: MANUAL+PROVENANCE; Solomon/LEAD/PLAN: MANUAL) registers its companions in protocol-file-tracker.cjs, but Coordinator currently has only the charter tracked, with an inline rationale ('small enough to read in one call') that this SD's split invalidates. Post-split, a seat reading only CLAUDE_COORDINATOR.md would be recorded as having read its full contract even though FR-4-moved content now lives in unread companion files -- and seat ARMED/disarmed status runs off this read record.",
    priority: 'HIGH',
    acceptance_criteria: [
      'CLAUDE_COORDINATOR_MANUAL.md and CLAUDE_COORDINATOR_PROVENANCE.md are added to the same protocol-file-read tracking mechanism Adam/Solomon/LEAD/PLAN companions already use',
      "The stale 'small enough to read in one call' rationale comment is removed or corrected to reflect the post-split file set",
      'A test proves a coordinator seat that reads only the charter (not the companions) is NOT recorded as having fully read its contract, mirroring whatever equivalent check exists for Adam',
    ],
  },
];

// --- TR additions: disambiguate TS-3/TS-4/TS-5 per TESTING's findings ---
const technical_requirements = [
  ...prd.technical_requirements,
  {
    id: 'TR-5',
    requirement: "M3's content-conservation check (TS-3) must use a CLAUSE-LEVEL comparison with a landed-threshold (mirroring adam-imperative-inventory.mjs's clause splitter + LANDED_THRESHOLD=0.6 pattern), NEVER byte-equality or naive sentence-splitting on '.'.",
    rationale: "TESTING sub-agent measured that naive '.' splitting shatters version strings and dates (v4.4.1, 08-22), and that FR-4 INTENTIONALLY collapses a duplicate header and moves clauses -- so a byte-equal union is the wrong oracle (it would fail on the correct, intended change) while a naive threshold could silently permit real loss. adam-contract-land.mjs's own staleness guard is per-row SHA-256 only and does not itself perform conservation diffing -- it is a staleness check, not M3's conservation check, and cannot be reused as-is.",
  },
  {
    id: 'TR-6',
    requirement: "FR-2's STANDARD_LOOPS charter representation MUST be implemented as DRIFT-CHECKED against the live array, not GENERATED FROM it.",
    rationale: "TESTING sub-agent proved 'generated from the array' makes TS-4's desync-detection test vacuously green (a fixture flip regenerates the table too, so the assertion can never fail) -- only 'drift-checked against a separately-authored/committed table' makes the desync test meaningful. STANDARD_LOOPS is already exported (coordinator-startup-check.mjs:143), so a drift-check comparison is cheap to implement.",
  },
  {
    id: 'TR-7',
    requirement: "Any new test asserting STANDARD_LOOPS content or count MUST use the .test.js extension, never .test.mjs.",
    rationale: "TESTING sub-agent found the existing STANDARD_LOOPS pin test (tests/unit/coordinator-startup-check.test.mjs:43) is DEAD -- a node:test .test.mjs file outside vitest's include globs, silently asserting a stale length===23 against a live count of 34. A new .test.mjs assertion for FR-2/TS-4 would be dead on arrival identically.",
  },
  {
    id: 'TR-8',
    requirement: "The FR-4 KEEP/MERGE/MOVE ledger (M2) must be authored as a machine-readable JSON artifact with an enforceable schema (every clause has a disposition in {KEEP, MERGE, MOVE}, zero DELETE entries, the 5 directive clauses explicitly disposed MOVE), not a prose review checklist.",
    rationale: "TESTING sub-agent found TS-5 as originally written conflates 'the ledger is reviewed' (a human act with no assertable subject) with an automated test. A JSON ledger lets a test assert completeness and disposition validity; the review-before-implementation ordering itself (M2) remains a process gate no automated test can enforce, and is tracked separately from TS-5.",
  },
];

// --- TS revisions: TS-1, TS-2, TS-3, TS-4, TS-5 corrected; TS-6 attribution fixed; TS-7/TS-8 added for FR-6/FR-7 ---
const test_scenarios = prd.test_scenarios.map((ts) => {
  if (ts.id === 'TS-1') {
    return { ...ts, scenario: "The self-maintaining registry/generator-wiring invariant holds after the split (not a hand-maintained file count)", then: "scripts/__tests__/check-claude-md-drift.test.js:134-140's existing Set-equality assertion (getFileSpecs() names === KNOWN_GENERATED_FILES) passes with both new coordinator companions added via toContain-style membership (mirroring the Adam precedent's own :168-169 intent), not a hand-maintained toHaveLength(21->23) counter. The live check-claude-md-drift.cjs run against a real DB (not the unit tier, which blanks network) is tracked separately in smoke_test_steps." };
  }
  if (ts.id === 'TS-2') {
    return { ...ts, given: "tests/unit/adam/shared-section-included-not-copied.test.js:99-107 already generically covers findCopiedSharedSections() detecting a copy into ANY fileMapping section (section-type-agnostic) -- no new coordinator-specific unit fixture is needed for that half.", then: "A NEW integration-tier test proves the uncovered half: assertSharedSectionsNotCopied() throwing inside loadData() (index.js:305) refuses generation of ALL 23 files, not just the coordinator's -- this is the genuinely new coverage TS-2 exists to add." };
  }
  if (ts.id === 'TS-3') {
    return { ...ts, given: "a pre-migration clause-level breakdown of row 605 (per TR-5's clause splitter, not raw byte content)", when: "row 605 is split per the FR-4 ledger and the resulting clause set is compared against the pre-migration clause set using a landed-threshold comparison (TR-5)", then: "the check passes on the CORRECT split (header collapsed, clauses moved to provenance) since threshold comparison tolerates the intended header collapse; a deliberately-truncated fixture (one governed clause actually dropped, not merely relocated) fails the check, proving it discriminates real loss from intended consolidation" };
  }
  if (ts.id === 'TS-4') {
    return { ...ts, given: "the charter's loop-governance table is DRIFT-CHECKED against (not generated from) the live STANDARD_LOOPS array, per TR-6", then: "a NEW .test.js (per TR-7, never .test.mjs) drift-check assertion fails when a test fixture flips one entry's session_arm without updating the charter table -- proving the assertion is NOT vacuously green (which 'generated from' would make it)" };
  }
  if (ts.id === 'TS-5') {
    return { ...ts, given: "the FR-4 KEEP/MERGE/MOVE ledger authored as machine-readable JSON per TR-8 (not prose)", when: "the ledger JSON is validated against its schema", then: "every one of the 10 measured items has a disposition in {KEEP, MERGE, MOVE}, zero DELETE entries exist, and the 5 directive clauses (3 dated directives + resource-pool duty + Adam-boundary clause) are all disposed MOVE -- schema validation failure if any item is missing a disposition or any disposition is DELETE" };
  }
  if (ts.id === 'TS-6') {
    return { ...ts, scenario: "Existing tests that assert CLAUDE_COORDINATOR.md content are updated in the same PR as whichever FR actually moves their target content (attribution corrected: decompose-weakest-classify-rule.test.js:38-39 breaks from FR-4 moving its dated 2026-06-16 board-verdict clause to PROVENANCE; claude-coordinator-generation.test.js:26 breaks from FR-2/FR-5 adding new section_types to the mapping, NOT from FR-1's companion additions, which are new mapping KEYS rather than changes to CLAUDE_COORDINATOR.md's own entry)", then: "both tests plus tests/unit/protocol-publication-pipeline.test.js:158 (the guaranteed KNOWN_GENERATED_FILES count break) are updated in the same PR as their triggering FR; CI shows 0 unexplained failures across all 7 files that reference CLAUDE_COORDINATOR (not just the originally-named 2)" };
  }
  return ts;
});
test_scenarios.push(
  { id: 'TS-7', scenario: 'Coordinator digest retains authority/obligation content after the FR-4 restructure (FR-6)', test_type: 'unit', given: "a named list of authority-bearing clauses expected to survive in CLAUDE_COORDINATOR_DIGEST.md, mirroring adam-digest-authority-survives.test.js's approach", when: 'the digest is regenerated after FR-4/FR-5 move/add content', then: 'every named clause is still present in the digest output; the test fails if the digest silently drops to a fraction of its pre-restructure size the way Adam\'s digest did (18,903->4,727 bytes) without any other check catching it' },
  { id: 'TS-8', scenario: 'A coordinator seat that reads only the charter is not falsely recorded as having read the full contract post-split (FR-7)', test_type: 'unit', given: 'the protocol-file-read tracker registers CLAUDE_COORDINATOR_MANUAL.md and CLAUDE_COORDINATOR_PROVENANCE.md as required reads alongside the charter', when: 'a seat reads only CLAUDE_COORDINATOR.md and not the 2 companions', then: 'the tracker does NOT mark the seat as having fully read its contract, mirroring the equivalent multi-file completeness check for Adam' }
);

// --- Risk additions: digest gutting, tracker asymmetry ---
const risks = [
  ...prd.risks,
  { risk: "The coordinator digest silently loses authority/obligation content moved by FR-4/added by FR-5, since generateCoordinatorDigest maps only to coordinator_role_contract -- the exact defect class that gutted Adam's digest 18,903->4,727 bytes with nothing failing (GAP A, TESTING sub-agent PLAN row a287419c).", probability: 'HIGH', impact: 'HIGH', mitigation: 'Add a coordinator-digest-authority regression test (FR-6/TS-7) before FR-4/FR-5 implementation; extend the digest mapping if it currently depends on content being relocated.', rollback_plan: "Restore the digest's pre-restructure mapping/char-budget and re-verify authority clause presence against the pre-migration snapshot." },
  { risk: "Post-split, a coordinator seat reading only the charter is falsely recorded as having read its full contract, since protocol-file-tracker.cjs's coordinator entry predates the split and covers only the single charter file (GAP B, TESTING sub-agent PLAN row a287419c).", probability: 'MEDIUM', impact: 'MEDIUM', mitigation: 'Register both new companion files in the tracker alongside the charter (FR-7/TS-8), mirroring how Adam/Solomon/LEAD/PLAN companions are already tracked.', rollback_plan: "If a seat is found operating on stale/incomplete contract knowledge post-split, force a re-read by clearing that seat's tracked-read state and re-registering the corrected file set." },
];

// --- Acceptance criteria: extend to cover the 2 new FRs ---
const acceptance_criteria = [
  ...prd.acceptance_criteria,
  "The coordinator digest is verified (via a new digest-authority test) to retain authority/obligation content after the restructure -- it does not silently shrink the way Adam's digest did during its own contract consolidation.",
  "Both new companion files (manual, provenance) are registered in the protocol-file-read tracker so a seat's contract-read status accurately reflects whether it read the full split contract, not just the charter.",
];

const { error: updErr } = await supabase
  .from('product_requirements_v2')
  .update({ functional_requirements, technical_requirements, test_scenarios, risks, acceptance_criteria })
  .eq('id', PRD_ID);
if (updErr) { console.error(updErr); process.exit(1); }

console.log(`PRD revised: FR ${prd.functional_requirements.length}->${functional_requirements.length}, TR ${prd.technical_requirements.length}->${technical_requirements.length}, TS ${prd.test_scenarios.length}->${test_scenarios.length}, Risks ${prd.risks.length}->${risks.length}, AC ${prd.acceptance_criteria.length}->${acceptance_criteria.length}`);
console.log('(TESTING sub-agent PLAN row a287419c-fb6b-48b7-b7ca-9c1e442a1ece)');
