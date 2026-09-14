#!/usr/bin/env node
/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-G — prospective testing-agent review at LEAD
 * scope-lock, per CLAUDE_LEAD.md's "Default Sub-Agent Invocation Cadence for
 * Harness-Fix SDs" rule (trigger keywords: writer/consumer, gate, validator, detector).
 *
 * Records the findings from the Task-tool testing-agent run into
 * sub_agent_execution_results -- the agent itself does not write this row.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';

const SD_KEY = 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-G';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sdRow, error: sdErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', SD_KEY)
  .single();
if (sdErr) throw sdErr;

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 92,
  phase: 'LEAD',
  execution_time_ms: 0,
  summary: "Prospective LEAD-phase review of SD-G's scope-to-be-PRD found 5 genuine structural defects that would silently invert the SD's stated goal if locked as originally written, 2 partial findings, and 3 confirmed non-issues. G1 (bound is 46, not 45 -- venture_stages.required_artifacts alone undercounts by exactly launch_uat_report, because stage 23 is the ONLY stage of 27 with an empty required_artifacts list, so gate_boundary_config's S23->S24 row is never shadowed; independently re-verified live by LEAD: gbc union=46, venture_stages-only=45, S23 required_artifacts=[], launch_uat_report absent from venture_stages union but present in gbc). G2 (3 producer files -- stage-21-visual-assets.js, stage-22-distribution-setup.js, prelaunch-growth-playbook.js -- bypass writeArtifact() entirely for 6 of the 46 types, raw-inserting with no metadata/content; independently re-verified live by LEAD via import grep and the exact raw-insert payload at stage-21-visual-assets.js:274-282). G3 (the reuse template artifact-versioning.js hashes data.content, but content is NULL on a majority of is_current rows for the visual/distribution/growth-playbook families -- payloads live in artifact_data -- so a content-only hash would constant-hash null). G4 (acceptance-artifact-gate.js has TWO hasProvenance predicates, venture_artifacts:142 and uat_test_runs:150, forming one verification chain via this SD's own launch_uat_report hash-link -- upgrading only one leaves the chain half-verified; also selectColumns doubles as the order_by allowlist). G5 (the dedup-UPDATE fix is not safe as a wholesale metadata set -- the SELECT at that path returns only 'id', so a naive fix would clobber screenId/version/future editorial keys; the SAME clobber bug pre-exists at the unique-violation fallback; the fresh-INSERT metadata assignment is conditional and must become unconditional). Q1 answer: the true consumer surface is ~16 read call sites across 6 files, not 6 files each with one site -- exit-gate-verifiers.js alone has 10, 4 of which are presence-only checks matching the exact defect class this SD targets. Q4 answer: required_artifacts format is uniform across all 27 venture_stages rows, non-issue. G6-G10 (partial/lower-priority): two more type-source candidates (stage-config.js's own 44-type hardcoded list; a live legacy fallback to stage_artifact_requirements), 3 of 16 consumers fail-open by construction, artifact-integrity-checker.js doesn't filter is_current, and 5 additional UPDATE sites outside the dedup path create the same stale-hash defect class -- all recommended as explicit exclusions with fast-follow QF/SD flags rather than folded into an already-large PR.",
  critical_issues: [
    "G1: scope bound must be the UNION of venture_stages.required_artifacts (45) and gate_boundary_config.required_artifacts (12, overlapping all but launch_uat_report) = 46, asserted by live query, never a hardcoded literal.",
    "G2: 3 producer files bypass writeArtifact() for 6 of the 46 types -- must be routed through it in the same PR or those 6 types hard-block every future venture post-cutover.",
    "G5: the dedup-UPDATE and unique-violation-fallback write paths both SELECT only 'id' -- a naive metadata fix would clobber screenId/version/future editorial-provenance keys; must widen to 'id, metadata' and spread-merge.",
  ],
  warnings: [
    "G3: hash input must resolve to content ?? artifact_data, not content alone, or the stamp constant-hashes null on visual/distribution/growth-playbook types.",
    "G4: both acceptance-artifact-gate.js hasProvenance predicates (venture_artifacts:142, uat_test_runs:150) must be upgraded together as one verification chain.",
    "Q1: true consumer surface is ~16 sites, not 6 -- exit-gate-verifiers.js alone has 10, 4 already presence-only.",
    "G7: 3 of ~16 consumers fail-open by construction -- PRD must state fail posture per site, not claim uniform enforcement.",
    "G6/G9: two more type-source candidates and 5 additional stale-hash-risk UPDATE sites exist outside this SD's fixed scope -- explicitly excluded with fast-follow recommendation, not silently left unstated.",
  ],
  recommendations: [
    "PLAN: bind scope to the 46-type union, defined by query (venture_stages.required_artifacts UNION gate_boundary_config.required_artifacts), never a hardcoded literal count.",
    "PLAN/EXEC: route the 3 bypass writers through writeArtifact() as the FIRST phase of the PR, before any consumer is switched from observe to enforce.",
    "EXEC: widen both the dedup-UPDATE and unique-violation-fallback SELECTs to 'id, metadata' and spread-merge, following lib/eva/qa/stitch-wireframe-qa.js:267-280's precedent; make the fresh-INSERT metadata assignment unconditional.",
    "EXEC: resolve the hash input as content ?? artifact_data and record which field was used in the stamp.",
    "EXEC: upgrade both acceptance-artifact-gate.js hasProvenance predicates together in one TS.",
    "PLAN: enumerate and wire all ~16 consumer read sites explicitly, stating fail-open/fail-closed posture per site.",
    "LEAD: explicitly exclude stage-config.js/stage_artifact_requirements reconciliation, the 5 additional stale-hash UPDATE sites, and the artifact-integrity-checker.js is_current filter gap from this SD, with fast-follow QF/SD recommendations, to keep the PR within size guidance.",
  ],
  detailed_analysis: {
    searched_identifiers: ['writeArtifact', 'venture_stages.required_artifacts', 'gate_boundary_config', 'hasProvenance', 'selectColumns', 'dedup', 'unique-violation', 'is_current', 'content_hash', 'verifyContentHash'],
    searched_paths: [
      'lib/eva/artifact-persistence-service.js', 'lib/eva/artifact-versioning.js', 'lib/eva/reality-gates.js', 'lib/eva/eva-orchestrator.js',
      'lib/eva/lifecycle/exit-gate-verifiers.js', 'lib/eva/stage-artifact-precondition.js',
      'lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js', 'lib/eva/stage-templates/analysis-steps/stage-21-visual-assets.js',
      'lib/eva/stage-templates/analysis-steps/stage-22-distribution-setup.js', 'lib/eva/stage-templates/analysis-steps/prelaunch-growth-playbook.js',
      'lib/eva/qa/stitch-wireframe-qa.js', 'lib/eva/s5-financial-consistency.js',
      'lib/proving-companion/artifact-integrity-checker.js', 'lib/proving-companion/stage-config.js',
      'scripts/modules/handoff/executors/lead-final-approval/gates/acceptance-artifact-gate.js',
    ],
    lead_independent_reverification: 'G1 and G2 independently re-confirmed live by LEAD via direct DB query (gate_boundary_config rows, venture_stages S23 row, union computation) and direct grep (no artifact-persistence import in the 3 bypass files; exact raw-insert payload at stage-21-visual-assets.js:274-282) before adopting into scope.',
  },
  metadata: {
    prospective: true,
    validation_mode: 'prospective',
    prior_lead_evidence_ids: ['f4bfc186-9fc2-4b75-93e0-a59ece95608b', 'cd802c27-81e5-437e-8648-5f945e43431c'],
    // Honest "nothing to measure" declaration (testing-verdict-guard.js exemption): this was a
    // prospective LEAD-phase scope/code review, not a test-suite execution, so there are
    // genuinely zero tests to report -- not a fabricated PASS.
    measured: false,
    test_execution: {
      tests_executed: 0,
      tests_passed: 0,
      tests_failed: 0,
      tests_skipped: 0,
      mode: 'prospective_code_review',
      note: 'Prospective LEAD-phase scope review (CLAUDE_LEAD.md Default Sub-Agent Invocation Cadence for Harness-Fix SDs) -- direct code/DB reads against the live worktree and Supabase project, not an automated test-suite run.',
    },
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: sdRow.id,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'TESTING',
  probeExistsRelative: 'scripts/one-off/capa-001-g-testing-lead-prospective.mjs',
  supabase,
});
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

const stored = await storeSubAgentResults('TESTING', sdRow.id, { code: 'TESTING', name: 'testing-agent' }, results, {
  sdKey: SD_KEY,
  phase: 'LEAD',
});
console.log('STORED:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
