import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-COORDINATOR-ROLE-CONTRACT-002';

const { data: sd, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('risks, success_criteria')
  .eq('sd_key', SD_KEY)
  .single();

if (fetchErr) { console.error(fetchErr); process.exit(1); }

// Correct R1's mitigation: adam-contract-land.mjs is NOT a reusable callable tool
// (VALIDATION sub-agent, row 86ad1bd6, read the file: hard-wired to Adam row IDs/paths
// at every seam). What IS genuinely reusable is assertSharedSectionsNotCopied() /
// findCopiedSharedSections() in file-generators.js -- generic over fileMapping, no
// Adam-specific literals.
const risks = (sd.risks || []).map(r =>
  r.risk && r.risk.startsWith('R1 (RISK sub-agent, LEAD)')
    ? { ...r, mitigation: 'CORRECTED (VALIDATION sub-agent, row 86ad1bd6): scripts/protocol/adam-contract-land.mjs is NOT a reusable callable tool -- it is hard-wired to Adam row IDs/paths/artifact filenames at every seam (verified by reading the file). The genuinely reusable primitive is assertSharedSectionsNotCopied()/findCopiedSharedSections() in scripts/modules/claude-md-generator/file-generators.js:80-137, which is generic over fileMapping (not role-specific) and already runs in loadData() (index.js:305) for every render. Run this check before creating any coordinator_manual/coordinator_provenance row; a Coordinator-specific landing script (mirroring adam-contract-land.mjs\'s SHAPE -- staleness guard vs. pre-migration snapshot, companions-before-contract ordering -- but with its own row IDs/paths) must be written new, not called into the Adam one.' }
    : r
);

const newRisks = [
  ...risks,
  {
    risk: 'D2 (VALIDATION sub-agent, LEAD): sibling SD SD-LEO-INFRA-SOLOMON-ROLE-CONTRACT-001 (same chairman packet, decision D3 vs this SD\'s D2, same evidence commit 783ac23f7f5, created 44min after this SD) has an FR-5 that also touches scripts/check-claude-md-drift.cjs and converges on section-file-mapping.json, file-generators.js, index.js -- the same shared infra files this SD\'s FR-1 modifies. Neither SD has started implementation (no Solomon branch/worktree as of this SD\'s LEAD phase).',
    impact: 'medium',
    likelihood: 'medium',
    mitigation: 'This SD proceeds first (already claimed, worktree provisioned, risk+validation done). EXEC must make PURELY ADDITIVE changes to the 3 shared files (new generator wrapper functions, new mapping entries) rather than restructuring shared logic, so a later Solomon-SD diff to the same files merges cleanly. check-claude-md-drift.cjs itself needs NO changes for this SD\'s file split (confirmed mapping/section-agnostic by Explore) -- if Solomon\'s FR-5 needs drift-check changes, those are additive too and should not collide.'
  },
  {
    risk: 'D6 (VALIDATION + Explore, LEAD): QF-20260822-510 landed literally 1 day before this SD\'s creation, encoding the 08-22 cron ruling into STANDARD_LOOPS (coordinator-startup-check.mjs) with an explicit reversal condition through 2026-08-25T22Z. This is the exact "revert class" the Adam landing script\'s staleness guard exists to catch -- if this SD\'s FR-2 charter representation of STANDARD_LOOPS is authored before 2026-08-25T22Z and the reversal condition fires (a dropped loop\'s artifact goes stale), the charter text would encode a since-reverted ruling.',
    impact: 'low',
    likelihood: 'low',
    mitigation: 'FR-2\'s charter table must be GENERATED from or drift-checked against the live STANDARD_LOOPS array (per M9, already a success criterion) -- this makes the reversal-condition risk moot by construction, since the charter would automatically reflect whatever the array currently says rather than freezing a snapshot.'
  },
  {
    risk: 'Read-cap rationale does NOT transfer from the Adam precedent (VALIDATION sub-agent, row 86ad1bd6): CLAUDE_ADAM.md was 103,790B, a hard Read-tool 25k-token cap FAILURE, which is why its 3-file split existed. CLAUDE_COORDINATOR.md measures only 26,580B (~6.6k tokens) -- well under the cap. Justifying this SD\'s split on the same read-cap grounds would encode an unmeasured/false premise into the PRD.',
    impact: 'low',
    likelihood: 'medium',
    mitigation: 'PLAN must justify the split on the governance grounds the measurements DO support (skill-file/behavior-doc subordination per FR-3, loop-registry governance per FR-2, dedup per FR-4) -- never cite the read-cap/context-budget rationale used for Adam\'s split, since it is factually false for Coordinator\'s current file size.'
  }
];

const newCriteria = [
  ...(sd.success_criteria || []),
  { criterion: 'VALIDATION confirmed: 0 duplicate/overlapping SDs or QFs target CLAUDE_COORDINATOR.md or a coordinator role-contract split (nearest neighbor SD-LEO-INFRA-SOLOMON-ROLE-CONTRACT-001 is a same-packet sibling for a DIFFERENT role, not a duplicate).', measure: 'sub_agent_execution_results row 86ad1bd6-2bb9-4a63-ade9-bd1751ba1544' },
  { criterion: 'FR-1 implementation touches exactly the 4 known code sites additively: index.js:189-227 getFileSpecs(), file-generators.js (new generateCoordinatorManual/generateCoordinatorProvenance wrappers ~10 lines each, mirroring generateAdamManual/generateAdamProvenance), index.js:662-665 KNOWN_GENERATED_FILES (+2), tests/unit/protocol-publication-pipeline.test.js:158 toHaveLength(21) -> 23. Plus: 2 new leo_protocol_sections rows (coordinator_manual, coordinator_provenance section_types), 2 new section-file-mapping.json entries, 2 new .docmon/rules.json root_allowlist entries.', measure: 'Explore evidence artifact; grep for each site post-implementation' },
  { criterion: 'tests/unit/decompose-weakest-classify-rule.test.js:37-40 (greps CLAUDE_COORDINATOR.md line ~40 for a clause that FR-1/FR-4 may relocate) and tests/unit/claude-coordinator-generation.test.js:26 (asserts exact MAPPING[\'CLAUDE_COORDINATOR.md\'].sections array) are updated in the same PR if the split moves their target content, never left to fail in CI.', measure: '0 unexplained test failures in the PR\'s CI run' },
  { criterion: 'A coordinator-digest-authority test (mirroring tests/unit/adam/adam-digest-authority-survives.test.js) is added if generateCoordinatorDigest\'s char budget changes from the current 3000-char default, closing the gap Adam needed a fix for after its own contract consolidation broke its digest.', measure: 'New test file present and passing, OR explicit note that the digest budget was left unchanged and does not need one' }
];

const { error: updErr } = await supabase
  .from('strategic_directives_v2')
  .update({ risks: newRisks, success_criteria: newCriteria })
  .eq('sd_key', SD_KEY);

if (updErr) { console.error(updErr); process.exit(1); }
console.log('SD updated: R1 mitigation corrected, +3 risks, +3 success_criteria (LEAD validation-agent + Explore findings)');
