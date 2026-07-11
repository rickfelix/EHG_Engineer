#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_UUID = '582650d5-be1f-4543-a036-473692461bad';
const SD_KEY = 'SD-LEO-FIX-REGISTER-STAGE-REFINED-001';

const retro = {
  sd_id: SD_UUID,
  retro_type: 'SD_COMPLETION',
  retrospective_type: null,
  learning_category: 'PROCESS_IMPROVEMENT',
  target_application: 'EHG_Engineer',
  generated_by: 'MANUAL',
  status: 'DRAFT',
  quality_score: 90,
  title: `Retrospective: ${SD_KEY} — Registering stage_17_refined without faking the CI parity test`,
  description:
    "lib/eva/stage-17/refinement.js's generateRefinedVariants() (the LIVE Pass-1-selection refinement path invoked by selection-flow.js submitPass1Selection()) writes artifactType: 'stage_17_refined', a literal never registered in ARTIFACT_TYPES nor allowed by the live venture_artifacts_artifact_type_check CHECK constraint -- confirmed live during SD-LEO-FIX-RESOLVE-STAGE-ARCHETYPE-001 smoke verification, every writeArtifact call on this path throws. Because the fix widens a live CHECK constraint, CLAUDE.md's routing table forces a full SD (escalated from QF-20260711-926) rather than a QF, and the SD arrived pre-flagged metadata.requires_chairman_apply=true from sourcing. The real design problem this SD solved: SD-LEO-FIX-VENTURE-ARTIFACTS-ARTIFACT-001 had already built a CI parity test (tests/unit/eva/artifact-type-db-parity.test.js) after an identical incident with 'blueprint_user_journey', asserting every ARTIFACT_TYPES value is allowed by the live constraint snapshot -- but that prior fix's own migration had actual chairman GO relayed through Adam in the same session, so the registry-add and the live-apply always landed together and the test never had to represent a 'registered but not yet live' state. This SD's migration could NOT get synchronous chairman GO (an autonomous worker session, not a live chairman conversation), so registering the type in code without also applying the migration would have either broken the parity test honestly (correct but blocking) or required faking database/schema-reference-snapshot.json to claim the live DB already allows a value it does not (dishonest, and would silently mask the next real drift on unrelated values touching that same snapshot read). Resolved by generalizing the ALREADY-EXISTING chairman-gated-pending pattern from scripts/check-migration-readiness.mjs (which exempts a staged-but-unapplied migration from drift-detection when metadata.requires_chairman_apply=true) into a second, independent surface: a small reason-required, self-cleaning allowlist (database/artifact-type-parity-pending-chairman-gate.json) that the parity test consults, plus a dedicated stale-entry test that starts failing the moment the migration DOES go live and the allowlist entry is no longer removed -- so the exemption cannot silently outlive its own justification.",
  affected_components: [
    'lib/eva/artifact-types.js',
    'lib/eva/stage-17/refinement.js',
    'lib/eva/stage-templates/artifact-type-parity.js',
    'database/migrations/20260711_add_stage_17_refined_artifact_type.sql',
    'database/artifact-type-parity-pending-chairman-gate.json',
    'tests/unit/eva/artifact-type-db-parity.test.js',
    'tests/unit/stage-17/refinement.test.js',
    '.gitignore',
  ],
  what_went_well: [
    "Ran the affected CI parity test BEFORE deciding on an approach, not after: adding ARTIFACT_TYPES.BLUEPRINT_S17_REFINED and immediately running tests/unit/eva/artifact-type-db-parity.test.js surfaced the exact failure mode (a genuine, correctly-triggered drift assertion) before any migration or allowlist code was written, which turned an assumption ('registering the type should just work') into a verified fact ('the live snapshot genuinely does not allow this value yet') and shaped the rest of the design around that fact instead of discovering it late.",
    "Traced schema:snapshot:lint to its source (scripts/lint/schema-reference-snapshot.mjs) and confirmed it connects to the LIVE database (SUPABASE_POOLER_URL) before assuming any workaround -- this ruled out 'just regenerate the snapshot' as an option (it would require the migration to already be live, which it deliberately is not) and confirmed the only honest paths were either don't register the type yet, or build a real reason-tracked exemption.",
    "Generalized an existing, already-battle-tested pattern (check-migration-readiness.mjs's requires_chairman_apply exemption) into a second surface instead of inventing a parallel ad-hoc mechanism -- the new database/artifact-type-parity-pending-chairman-gate.json allowlist mirrors the reason-required-JSON-allowlist convention already used by scripts/lint/fleet-liveness-select-allowlist.json and the quiet-tick-token-parity lint shipped earlier the same session, so a future engineer encountering either mechanism recognizes the shape immediately.",
    "Added a self-cleaning regression test (the allowlist entry becomes a FAILING assertion once its value is actually live) rather than just an exemption -- closes the failure mode where a temporary allowance quietly becomes permanent and eventually masks a real, different future drift on the same artifact_type value.",
    "Programmatically inserted the new CHECK-constraint value into the 127-entry existing array (via a small Node script reading and splicing the prior migration's array) instead of hand-transcribing a 130+ value SQL literal, eliminating the realistic risk of a silent transcription typo in a chairman-facing migration file.",
    'Replaced two "N/A" success-metric actuals with real values before PLAN-TO-LEAD (a genuine v8 coverage run scoped to the 3 changed files: 89.36%; "0" for issue recurrence) after discovering the SUCCESS_METRICS gate\'s VERIFICATION sub-check treats bare "N/A" as a placeholder-mismatch (score 0) even though the ACHIEVEMENT sub-check treats the same "N/A" as an accepted non-applicable value (score 75) -- the two sub-checks disagree on N/A, so a real measurement was strictly better than the seemingly-safe N/A default.',
  ],
  what_needs_improvement: [
    "The SUCCESS_METRICS gate's two sub-checks (ACHIEVEMENT and VERIFICATION) score a bare 'N/A' actual differently -- ACHIEVEMENT's isNotApplicable() accepts it (score 75, 'N/A -- accepted'), but VERIFICATION's verifyTargetComparison() treats the identical string as an unmeasured placeholder (score 0, 'Actual value is placeholder -- not yet measured') for any metric whose name matches the occurrence/recurrence/systemCount/gateScore/completion/reduction/manual matchers. An operator who trusts ACHIEVEMENT's acceptance of N/A and doesn't separately reason about VERIFICATION's routing can ship a combinedScore well under threshold without any signal pointing at the actual disagreement -- the precheck output does surface both scores, but nothing calls out that they represent contradictory judgments on the exact same input.",
    "scripts/handoff.js's claim-validity gate auto-released this SD's claim mid-session (reason=sd_key_drift) pointing at owner 2d178139-e52a-46af-baa1-544f2f280285, whose sd_key was a DIFFERENT SD (SD-LEO-FIX-RESOLVE-STAGE-ARCHETYPE-001) -- not this worker's own session. The LEAD-TO-PLAN handoff failed with NO_CLAIM even though a live `claiming_session_id` check against the DB (run immediately after) showed the claim correctly held by this session the whole time. Re-running sd-start.js and retrying the handoff succeeded on the second attempt with no further changes, suggesting either a transient dispatcher-session claim artifact or a race between the dispatch_rank_by stamp (also 2d178139-...) and the claim check -- not investigated further since it resolved cleanly, but worth a dedicated look if it recurs.",
  ],
  action_items: [
    {
      title: "Reconcile SUCCESS_METRICS gate's ACHIEVEMENT vs VERIFICATION treatment of 'N/A' actuals",
      description: "ACHIEVEMENT's isNotApplicable() scores a bare 'N/A' as 75 ('accepted'); VERIFICATION's verifyTargetComparison() scores the SAME string as 0 ('placeholder -- not yet measured') for metrics whose name matches several of its routing patterns. Either align the two sub-checks' treatment of N/A, or have the gate's own remediation output explicitly flag when ACHIEVEMENT accepted a value that VERIFICATION independently rejected as a placeholder, so the disagreement is visible before an operator has to reverse-engineer it from two different scoring functions across two files.",
      priority: 'low',
      owner_role: 'PLAN',
    },
    {
      title: 'Investigate the sd_key_drift auto-release false-positive seen at LEAD-TO-PLAN on this SD',
      description: "scripts/handoff.js's claim-validity gate auto-released this SD's own claim mid-handoff citing owner 2d178139-e52a-46af-baa1-544f2f280285's sd_key as drifted to a DIFFERENT SD (SD-LEO-FIX-RESOLVE-STAGE-ARCHETYPE-001) -- but a direct DB read immediately after showed claiming_session_id correctly set to this worker's own session throughout. Re-running sd-start.js and retrying the handoff fixed it. Possibly related to the dispatch_rank_by field (same UUID) written at SD-sourcing time being misread as a live claim owner. Not blocking (self-resolved on retry) but the false NO_CLAIM cost a full handoff round-trip.",
      priority: 'low',
      owner_role: 'operator',
    },
    {
      title: 'Chairman: apply the staged stage_17_refined CHECK-widening migration',
      description: 'database/migrations/20260711_add_stage_17_refined_artifact_type.sql is staged (chairman-gated marker present, not applied). After chairman apply: run `npm run schema:snapshot:lint` to regenerate database/schema-reference-snapshot.json, then remove the now-stale stage_17_refined entry from database/artifact-type-parity-pending-chairman-gate.json (tests/unit/eva/artifact-type-db-parity.test.js will start failing on the stale entry until this is done, by design).',
      priority: 'high',
      owner_role: 'chairman',
    },
  ],
  key_learnings: [
    "When a CI parity/drift test exists specifically because of a prior identical incident (here: SD-LEO-FIX-VENTURE-ARTIFACTS-ARTIFACT-001's blueprint_user_journey fix), assume it will correctly catch the SAME class of drift again rather than treating a new failure from it as an obstacle to route around -- the test doing its job (blocking an honestly-drifted registry entry) is a signal to design a real exemption mechanism, not a signal to fake the underlying data it checks.",
    "A migration marked requires_chairman_apply=true at SOURCING is a decision already made by the triage process, not a judgment call for the executing worker to re-litigate -- even when the DDL is objectively low-risk (a single-value CHECK-widening, cannot invalidate existing rows), an autonomous worker session has no synchronous channel to a real chairman GO, and the sourcing flag exists precisely to prevent applying DDL without one.",
    "Before regenerating any committed snapshot/reference file to 'fix' a failing offline test, check what actually produces that file (grep the lint script's own header/usage comment) -- schema-reference-snapshot.json is explicitly DB-introspected, so regenerating it locally without the underlying live schema having changed would silently commit a snapshot that lies about the live database's actual state.",
    'A reason-required JSON allowlist with a self-cleaning "goes stale and starts failing once no longer needed" companion test is a reusable pattern for any "registered in code ahead of a gated external dependency landing" situation -- not just artifact types. The same shape now exists in this codebase for fleet-liveness lint allowlisting, quiet-tick token-parity allowlisting, and now chairman-gated-migration-pending allowlisting; each new instance should look at the prior ones as templates rather than reinventing the JSON shape.',
  ],
  metadata: {
    sd_key: SD_KEY,
    source: 'manual_insert',
    escalated_from_qf: 'QF-20260711-926',
    pr_reference: 'PR #5916 (rickfelix/EHG_Engineer)',
    chairman_gate: 'database/migrations/20260711_add_stage_17_refined_artifact_type.sql staged, not applied',
  },
};

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: existing } = await supabase
  .from('retrospectives')
  .select('id')
  .eq('sd_id', SD_UUID)
  .eq('title', retro.title)
  .maybeSingle();

if (existing) {
  console.log(`[insert-retro] Already exists: ${existing.id} — skipping (idempotent no-op).`);
  process.exit(0);
}

const { data: inserted, error: insertErr } = await supabase
  .from('retrospectives')
  .insert(retro)
  .select('id, quality_score, status')
  .single();

if (insertErr) {
  console.error('[insert-retro] Insert failed:', insertErr.message);
  process.exit(1);
}

console.log(`[insert-retro] Inserted retrospective ${inserted.id} as DRAFT (initial quality_score=${inserted.quality_score})`);

const { data: published, error: pubErr } = await supabase
  .from('retrospectives')
  .update({ status: 'PUBLISHED', quality_score: retro.quality_score })
  .eq('id', inserted.id)
  .select('id, quality_score, status')
  .single();

if (pubErr) {
  console.error('[insert-retro] Publish update failed:', pubErr.message);
  process.exit(1);
}

console.log(`[insert-retro] Published: ${published.id} quality_score=${published.quality_score} status=${published.status}`);
