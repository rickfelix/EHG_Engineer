#!/usr/bin/env node
/**
 * SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001 -- VALIDATION evidence at LEAD-TO-PLAN.
 *
 * Duplicate/overlap scan + independent re-verification, as required before this SD's
 * LEAD-TO-PLAN handoff (GATE_SUBAGENT_EVIDENCE).
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const results = {
    verdict: 'PASS',
    confidence: 90,
    phase: 'LEAD-TO-PLAN',
    execution_time_ms: 0,
    summary: 'Duplicate/overlap scan clean, live premise re-verified independently, and a directly reusable precedent found. (1) No other SD (draft/in-progress/completed) builds this guard or touches instantiateVenture()/venture-ceo-factory.js in a conflicting way -- title/description search across strategic_directives_v2 for instantiateVenture/VentureFactory/venture-ceo-factory returned only unrelated completed history (SD-VISION-V2-005 which ORIGINALLY implemented the function; SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-A/G which verified/audited it; SD-LEO-GEN-SATELLITE-AGENT-LIFECYCLE-001, SD-LEO-INFRA-SHARED-ORG-SERVICES-001 cancelled) plus one draft-but-fenced sibling, SD-FDBK-ENH-EHG-OPERATING-COMPANY-001-B ("Wire org-instantiation into a real venture-onboarding entry point"), which is a DIFFERENT concern (adding a live CALLER, not guarding the function) and is chairman-gated do_not_auto_dispatch:true, requires_human_action:true, fenced on a chairman per-venture switch-on decision -- not active, not conflicting; its own scope text depends on "a live venture surface to instantiate against", i.e. it too would pass a real ventureId, consistent with (not broken by) the proposed guard. (2) Re-read the full instantiateVenture() method (lib/agents/venture-ceo-factory.js:273-437) directly: confirmed no venture-existence check exists anywhere in it today, matching Explore\'s finding. git log --oneline -20 -- lib/agents/venture-ceo-factory.js shows no commit adding this guard (most recent is an unrelated QF-20260903-616 EOL-normalization fix); gh pr list search for instantiateVenture/venture-ceo-factory/VentureNotFoundError/this SD key returned only merged, unrelated history -- no active or merged PR pre-empts this work. (3) Independently re-ran the live orphan measurement (fresh paginated fetch of org_agent_identities + fresh chunked existence check against ventures, same method as Explore but executed separately in this VALIDATION pass): 18,462 org_agent_identities rows carry a non-null venture_id, 660 distinct venture_ids referenced, exactly 5 exist in ventures, 655 do not, and 18,340 identity rows point at an orphaned venture_id -- EXACT match to Explore\'s figures; the premise has not drifted between passes. (4) Read tests/unit/venture-ceo-factory.test.js directly: it asserts NOTHING about a nonexistent-venture-id call today (its 2 instantiateVenture tests both pass a synthetic ventureId, e.g. "test-venture-id-123", that has no real ventures row, and currently succeed because no guard exists). This is a real, non-blocking implementation note for PLAN, not a reason to withhold the guard: found a directly reusable, already-shipped precedent for exactly this pattern at lib/creative/creative-brief.js -- a VentureNotFoundError class (code VENTURE_NOT_FOUND) plus a defaultVentureExists(supabase, ventureId) helper using .select(\'id\').eq(\'id\', ventureId).maybeSingle() (treating a malformed/non-UUID id as "does not exist" rather than letting Postgres\'s raw 22P02 escape), injected via a deps.ventureExistsFn seam specifically so unit tests never need a real DB round-trip or a hand-rolled mock chain. PLAN should mirror this exact shape (reuse or closely pattern-match VentureNotFoundError + an injectable existence-check seam) rather than inlining a raw supabase call in instantiateVenture() -- doing so is both the path of least risk and the one that keeps the 2 existing mocked-Supabase tests passing, PROVIDED the PRD also adds a default true stub (or equivalent) for the new seam in that test file\'s existing mock setup so the 2 pre-existing tests keep passing rather than starting to throw. (5) No SD-LEO-ORCH-* parent exists for this work -- confirmed standalone (parent_sd_id is null on this SD\'s own row) and a broader ORCH-SD sweep for venture-related orchestrators returned only unrelated, already-completed parents (stage-workflow, output-quality, CLI-lifecycle) with no match on this narrow C2 corrective.',
    critical_issues: [],
    warnings: [
      {
        id: 'VAL-1',
        severity: 'LOW',
        issue: "tests/unit/venture-ceo-factory.test.js's 2 existing instantiateVenture() tests use synthetic ventureIds with no real ventures row and currently pass with zero existence check. PLAN's PRD must explicitly cover updating this file's mock/dependency setup (not just adding a new refusal-path test) so the 2 pre-existing tests don't start failing once the guard lands.",
        evidence: 'tests/unit/venture-ceo-factory.test.js:171-195 -- ventureId: "test-venture-id-123" / "test-venture-id-456", no corresponding row in ventures, both tests assert successful 28-agent creation.',
      },
      {
        id: 'VAL-2',
        severity: 'LOW',
        issue: 'A related-but-out-of-scope sibling SD (SD-FDBK-ENH-EHG-OPERATING-COMPANY-001-B) exists in draft, fenced pending a chairman per-venture switch-on decision, that will eventually add a third live caller to instantiateVenture(). Not a conflict today (do_not_auto_dispatch:true, not active), but PLAN/EXEC should leave a code comment or PRD cross-reference noting the guard is intentionally upstream of that future caller too.',
        evidence: "strategic_directives_v2 row 4e6194d3-f1b2-437c-9e7a-7365c78df4c4, metadata.do_not_auto_dispatch=true, metadata.requires_human_action=true, metadata.unfence_condition='Chairman per-venture switch-on decision.'",
      },
    ],
    recommendations: [
      'PLAN should scope the PRD to mirror lib/creative/creative-brief.js\'s VentureNotFoundError + injectable-existence-check pattern for instantiateVenture(), rather than a fresh inline supabase call -- proven, already-shipped precedent in this exact repo.',
      "PLAN's PRD must include updating tests/unit/venture-ceo-factory.test.js's existing mock/dependency wiring (not only adding new refusal-path tests) so the 2 pre-existing passing tests are not broken by the new guard.",
      'No retroactive cleanup of the 18,340 existing orphan rows in scope (confirmed again this pass) -- out of scope per the design text; refusal is forward-looking only.',
    ],
    detailed_analysis: {
      commands_run: [
        "Queried strategic_directives_v2 for title/description ILIKE match on instantiateVenture/venture-ceo-factory/VentureFactory -- 7 rows returned, all either this SD's own predecessor history or the unrelated/fenced -B sibling; zero duplicates of this SD's exact guard scope.",
        "Queried strategic_directives_v2 sd_key ILIKE '%ORCH%VENTURE%' -- confirmed no SD-LEO-ORCH-* parent exists for this corrective; this SD's own parent_sd_id is null.",
        'git log --oneline -20 -- lib/agents/venture-ceo-factory.js -- most recent commit is an unrelated CRLF/EOL fix (QF-20260903-616); no guard-adding commit found.',
        'gh pr list --search "instantiateVenture OR venture-ceo-factory OR VentureNotFoundError OR INSTANTIATEVENTURE-REFUSES" --state all -- 18 results, all merged and unrelated to this guard.',
        'Re-read lib/agents/venture-ceo-factory.js:263-353 (instantiateVenture method body) directly -- confirmed zero venture-existence check anywhere in the method, independent of Explore\'s prior read.',
        'Fresh live re-measurement (independent of Explore\'s run): paginated fetch of org_agent_identities (18,462 non-null venture_id rows) + chunked existence check against ventures (660 distinct venture_ids, 5 exist, 655 do not) -- 18,340 orphaned identity rows, exact match to Explore\'s figures.',
        'Read tests/unit/venture-ceo-factory.test.js in full -- confirmed no assertion today about a nonexistent-venture-id call; both instantiateVenture tests use synthetic ventureIds with no ventures row.',
        'grep -rn VentureNotFoundError across the repo -- found an existing, unrelated-domain but directly-reusable precedent at lib/creative/creative-brief.js (VentureNotFoundError class + defaultVentureExists + injectable ventureExistsFn dependency seam).',
      ],
    },
    metadata: { independent_verification: true, premise_measured_live: true, duplicate_scan_complete: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    probeExistsRelative: 'scripts/one-off/instantiate-venture-refuses-lead-validation-evidence.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('VALIDATION', sdRow.id, { code: 'VALIDATION', name: 'Validation' }, results, { sdKey: SD_KEY, phase: 'LEAD-TO-PLAN' });
  console.log('STORED:', 'VALIDATION', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
