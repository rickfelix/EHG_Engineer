#!/usr/bin/env node
// Records LEAD-phase VALIDATION evidence for child -J, transcribing validation-agent
// ae76f23ee981fae64's investigation (54 tool uses, extensive file:line citations).
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-J';

async function main() {
  const db = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: null, subAgentCode: 'VALIDATION', supabase: db });

  const results = {
    verdict: 'PASS',
    confidence: 88,
    summary: "Extensive investigation (validation-agent:ae76f23ee981fae64, 54 tool uses) of the real touch points for Michael's v1.1 layer -- 4 new tables, 3 new feeders, a deferred rules import, and a new session-hook variant. Found the spec itself misdescribes both its own migration template (docs/michael/02-SPEC.md cites 20260830_commitments_table.sql, which has no verify block -- the real precedent is child B's 20260906_michael_tables.sql) and the shipped feeder export shape (spec says main(argv,deps), shipped code uses runX({sb,argv,now,auth,drive,env})). Found and pre-resolved two genuinely ambiguous/risky design points before EXEC: (1) the spec's 'EVA owns the scanner row, Michael reads its output' sentence conflates safe credential-free module reuse with an unauthorized cross-role eva_* table read -- resolved toward the safe reading (module reuse, Michael-owned channel list); (2) a live '[Michael] Picks' playlist write requires an OAuth scope Michael's chairman grant does not have, and widening it would force a host re-consent -- resolved by staging picks rather than writing live, matching sibling child I's own precedent of never widening OAuth scope inside an enrichment/retirement child. Also found and flagged: a sequencing hazard where sibling child I's (already-shipped, not-yet-applied) retirement will eventually delete the folder this SD's youtube.md import reads from; the go-live gauges gating this child's own fence are all disabled stubs with no working instrument; and a real ordering hazard in the existing adamLines() precedent (session-role-orient.cjs) that would make a naively-added michaelLines() seat rung unreachable dead code if not placed correctly.",
    findings: [
      "database/migrations/20260906_michael_tables.sql (child B's actual shipped migration) is the real precedent, not docs/michael/02-SPEC.md's cited 20260830_commitments_table.sql, which validation confirmed lacks a DO $verify$ block entirely",
      "scripts/michael/tasks-classifier.mjs:141 confirms the real shipped feeder shape is exported runX({sb, argv, now, auth, drive, env}), not the spec's stale main(argv, deps) description",
      "lib/michael/feeder.mjs:26-39's FEEDERS registry is frozen and shared by all 5 existing v1 feeders -- adding 3 new feeder ids is unavoidable work on a green, shared v1 file",
      "lib/integrations/youtube/subscription-scanner.js confirmed pure public RSS/Atom feed reads, zero API quota, zero credential -- but sources its channel list from the CALLER, not itself; the caller precedent (scripts/eva/youtube-subscription-digest.js) reads an EVA-owned eva_youtube_config table, which Michael must not read per CLAUDE_MICHAEL.md's own 'EVA is not touched' boundary",
      "lib/integrations/google/chairman-oauth.js:23-27's SCOPES array does not include youtube; the write-capable YouTube OAuth scope belongs to EVA's own separate grant (lib/integrations/youtube/oauth-manager.js:28) -- a live '[Michael] Picks' playlist write is out of reach without widening Michael's grant and forcing a host re-consent",
      "scripts/michael/import-cowork-memory.mjs:45-54's SOURCE_FILES map is missing 'youtube.md'; lib/michael/cowork-parse.mjs's RULE_DOMAINS and the michael_rules.domain CHECK constraint already admit 'youtube' -- the import is a near-zero-diff addition",
      "A real sequencing hazard: scripts/michael/retire-cowork.mjs (child I, already shipped but not yet live-applied since its 14-morning window has not elapsed -- confirmed zero michael_feeder_runs/michael_brief_runs rows exist) will eventually delete the _Cowork folder this child's youtube.md import reads from",
      "scripts/hooks/session-role-orient.cjs's resolveSeat (:381-382) already resolves a Michael seat to the generic ROLE rung today (lib/fleet/role-status-identity.cjs already registers a michael callsign) -- a naively-appended Michael-specific rung placed after this fallthrough would be unreachable dead code that tests green without ever firing",
      "lib/michael/brief-model.mjs confirms the 'day's brief headline' is data_json.lede, with no separate headline column on michael_brief_runs -- must be read via real existing columns, never a phantom column",
      "Every v1.1 feeder is independently buildable and testable behind injected deps right now (zero v1 live data required for their own logic) -- only the migration's chairman-apply, host task registration, and any OAuth re-consent are genuinely blocked by go-live, exactly mirroring sibling child I's own established precedent",
      "lib/governance/gauge-registry.js confirms all 11 Michael go-live gauges are enabled:false stubs with no wired resolver -- the go-live fence this child's own description cites has no working instrument today"
    ],
    metadata: {
      recorded_by: 'scripts one-off transcription (michael-j-lead-record-evidence.mjs), family pattern established at children E/F/G/H/I',
      producer_note: 'Transcribes the independent findings of Task-tool validation-agent ae76f23ee981fae64, a 54-tool-use investigation that read the actual shipped precedent code rather than trusting the spec\'s own (in two places, factually incorrect) prose.'
    }
  };
  applySubAgentRepoVerdict(results, resolution);
  const validationStored = await storeSubAgentResults('VALIDATION', SD_KEY, null, results, { phase: 'LEAD' });
  console.log('VALIDATION evidence stored:', validationStored.id);

  const exploreResolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: null, subAgentCode: 'EXPLORE', supabase: db });
  const exploreResults = {
    verdict: 'PASS',
    confidence: 85,
    summary: "Explore-pass cross-check of validation-agent ae76f23ee981fae64's investigation for child -J. Independently confirmed the two highest-risk findings: the EVA cross-role read risk, and the OAuth scope gap for a live playlist write. No additional gaps found beyond what VALIDATION already surfaced.",
    findings: [
      "Confirmed via independent read of CLAUDE_MICHAEL.md that 'EVA is not touched' is stated as an explicit boundary, not an inference -- the cross-role read risk VALIDATION found is a real constraint violation risk, not a stylistic preference",
      "Confirmed via independent read of lib/integrations/google/chairman-oauth.js that the SCOPES array is a literal, hardcoded 3-entry list with no youtube entry, and hasRequiredScopes checks every entry is present -- widening it is a real, breaking, re-consent-triggering change, not a minor addition",
      "Confirmed lib/michael/feeder.mjs's FEEDERS registry and READINESS_REQUIREMENTS are two separate exports -- adding feeder ids to the former without touching the latter is structurally straightforward and low-risk"
    ],
    metadata: {
      recorded_by: 'scripts one-off transcription (michael-j-lead-record-evidence.mjs)',
      producer_note: 'Independent cross-check pass, not a re-run of the same investigation.'
    }
  };
  applySubAgentRepoVerdict(exploreResults, exploreResolution);
  const exploreStored = await storeSubAgentResults('EXPLORE', SD_KEY, null, exploreResults, { phase: 'LEAD' });
  console.log('EXPLORE evidence stored:', exploreStored.id);
}

main();
