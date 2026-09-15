/**
 * Venture Quality Model v1 — registry of record.
 *
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-B (root cause A of the chairman-ratified
 * Venture Quality Review Programme, ratification 0afc86e4-3aa5-4ad4-87f8-952a832cd48b:
 * "no quality model of record"). This module is that record: one frozen array of
 * dimension entries, from which lib/eva/quality-findings/finding-shape.js's
 * FINDING_CATEGORIES and lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js's
 * checklist category arrays are DERIVED (see docs/04_features/venture-quality-model-v1.md
 * for the narrative doc and dimension_source_tags.md for the full provenance table).
 *
 * SHAPE (mirrors lib/eva/config/venture-default-capabilities.js and
 * lib/governance/gauge-registry.js's conventions):
 *   id                — stable slug; the finding_category / checklist-category value.
 *   name               — human-readable label.
 *   tier               — grouping used by the model doc (code_quality | qa | uat |
 *                        vision_compliance | experience | interface | adherence |
 *                        ethical | launch_readiness | venture_quality_baseline).
 *   owner_stage        — the EVA stage number that owns this dimension, or null.
 *   producer           — 'path/to/file.js#exportedName' string describing what emits
 *                        evidence for this dimension, or null (STUB — no producer yet,
 *                        matching lib/governance/gauge-registry.js's stub-row-adoption
 *                        contract: reserves the slot without depending on a sibling SD
 *                        shipping first; building missing producers is explicitly
 *                        EXCLUDED from this SD's own scope).
 *   reader_or_gate      — 'path/to/file.js#exportedName' string describing what consumes/
 *                        gates on this dimension's evidence, or null (STUB, same contract).
 *   severity_policy     — 'blocking' | 'warn_capped' | 'advisory' | null (null for a STUB
 *                        with no gate yet).
 *   applicability       — free-text scope note.
 *   ratification_pointer — { source, ref }. `source` is one of:
 *       'chairman_verbatim'      — the chairman's own words name this dimension.
 *       'scribe_paraphrase'      — a documented paraphrase of the ratification meeting
 *                                  (CLAUDE.md / the CAPA-001 plan doc) names this dimension
 *                                  or its tier as a category, even though the chairman's own
 *                                  verbatim quote does not enumerate it by name. VERIFIED:
 *                                  the ratified quote for 0afc86e4 is five agreement
 *                                  sentences ("I agree with decision one...") and names ZERO
 *                                  dimensions; the ~20-dimension list exists only in the
 *                                  scribe paraphrase.
 *       'verified_external_proxy' — the specific NAME is not in any ratification-adjacent
 *                                  document at all, but is grounded in an independently
 *                                  verified, published system-of-record used as the best
 *                                  available stand-in for an ambiguous paraphrase reference
 *                                  (here: the adherence_rubrics table's published dimension
 *                                  keys, standing in for the paraphrase's uncounted "eleven
 *                                  design-quality dimensions").
 *       'reconstructed'          — invented by a registry author with no supporting document
 *                                  or verified system-of-record. FORBIDDEN: the module-load
 *                                  tripwire below throws if any entry carries this tag.
 *     `ref` carries the pointer itself (chairman_ratifications.id + quote_hash per
 *     ratification df3186e6-63aa-43b3-bcf6-70fb4e153a04 -- "every pointer names an
 *     immutable or versioned record; values are not copied by default" -- or the source
 *     table/key for a verified_external_proxy entry). Never a copied quote string.
 *   waiver              — null, or { reason, dated_at, review_by, ticket } for a dimension
 *                        this SD deliberately ships incomplete/unwired (FR-4's advisory
 *                        limb reads this via predicate.js#isWaiverActive; a waiver
 *                        missing `dated_at`, missing `review_by`, or with an expired
 *                        `review_by` does NOT suppress a finding -- see
 *                        tests/unit/eva/quality-model/predicate.test.js "TS-8" describe
 *                        block. Every waiver in THIS registry has review_by:null (no
 *                        real revisit date exists yet), so every one of them correctly
 *                        surfaces in the CI predicate's advisory report until a real
 *                        review_by is set -- this is the honest, intended state, not a
 *                        bug: an open-ended waiver is a printed discriminator, not an
 *                        enforced one, so it must not silently suppress forever.
 *
 * IMPORTANT: adherence_rubrics rows (design_quality_v1, post_build_adherence_v1) are
 * VENTURE-SPECIFIC SCORING INSTANCES (design_quality_v1's behavioral anchors are written for
 * one venture -- MarketLens -- naming its wordmark/palette/competitors), not abstract,
 * venture-agnostic dimension definitions. Only the DIMENSION KEYS are reused here as the
 * best verified evidence for what the ratification's uncounted "eleven design-quality
 * dimensions" might mean (10 keys found, not 11 -- see the design_tier_incomplete waiver
 * below). The per-venture rubric application itself is out of this SD's scope.
 *
 * Update procedure: bump QUALITY_MODEL_VERSION, file an SD with LEAD approval (this
 * registry is itself the source of truth other code derives from -- changing it changes
 * what downstream gates require).
 *
 * @module lib/eva/quality-model/registry
 */

export const QUALITY_MODEL_VERSION = '1.0.0';

/** Ratification pointers used by the `ref` field below (never copy the quote itself). */
export const RATIFICATION_POINTERS = Object.freeze({
  ventureQualityReviewProgramme: Object.freeze({
    table: 'chairman_ratifications',
    id: '0afc86e4-3aa5-4ad4-87f8-952a832cd48b',
    quote_hash: '342b3a852942602e0774498d8338d6afbc6460eb76bb725ec03bd9f231b2724a',
  }),
  pointerConvention: Object.freeze({
    table: 'chairman_ratifications',
    id: 'df3186e6-63aa-43b3-bcf6-70fb4e153a04',
    quote_hash: 'c2888f77358668510fe329701767b027f5571050141bbac7f7181eb4d66b3fc5',
  }),
  // SD-LEO-INFRA-VENTURE-WORKFLOW-CREATES-001: "...we need to have the AI organization
  // testing at the same stage where we do the UAT for the design... During the QAQC
  // stage... we need to add some QAQC for the AI agent organization."
  organizationQaAtUatStage: Object.freeze({
    table: 'chairman_ratifications',
    id: '58f5345f-cab2-4a3c-9314-fbb7118ce43e',
    quote_hash: 'd208738534d913e04a9c3ecbd1acba785b9e25387b1ecfc6c8c47bcd59ec3b61',
  }),
});

const SCRIBE_PARAPHRASE = Object.freeze({ source: 'scribe_paraphrase', ref: RATIFICATION_POINTERS.ventureQualityReviewProgramme });
const ORGANIZATION_QA_POINTER = Object.freeze({ source: 'scribe_paraphrase', ref: RATIFICATION_POINTERS.organizationQaAtUatStage });

/** @param {string} rubricKey @param {string} dimensionKey */
function externalProxyRef(rubricKey, dimensionKey) {
  return Object.freeze({
    source: 'verified_external_proxy',
    ref: Object.freeze({ table: 'adherence_rubrics', rubric_key: rubricKey, dimension_key: dimensionKey }),
  });
}

const DESIGN_TIER_WAIVER = Object.freeze({
  reason: "The ratification's scribe paraphrase names an uncounted 'eleven design-quality dimensions' tier; only 10 published dimension keys are verified (adherence_rubrics: design_quality_v1 x6 + post_build_adherence_v1 x4). Shipping v1 from the 10 verified keys rather than inventing an 11th (RISK sub-agent mitigation M-5); disambiguation routed to the chairman via Adam, non-blocking.",
  dated_at: '2026-09-13',
  review_by: null,
  ticket: 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-B (design_tier_incomplete)',
});

/**
 * The Quality Model v1. Order matches lib/eva/quality-findings/finding-shape.js's
 * FINDING_CATEGORIES doc-block grouping, then the stage-23 launch-readiness checklist
 * dimensions, then the ratification's named-but-unwired dimensions (stub rows).
 */
export const QUALITY_MODEL_DIMENSIONS = Object.freeze([
  // ── Code Review (structural) — Stage 20 ──
  // NOTE: registry order here is DELIBERATE and pinned to today's live FINDING_CATEGORIES
  // order (finding-shape.js:70-88) -- order is observable downstream (finding-shape.js:160's
  // join(', ') in error text; stage-20.js's published JSON-schema enum), so 'capability' sits
  // where it does today (after uat_signoff), not grouped with the other code-review entries.
  Object.freeze({ id: 'npm_audit', name: 'Package Vulnerability Audit', tier: 'code_quality', owner_stage: 20, producer: 'lib/eva/quality-findings/writer.js#writeFindingsBatch (npm-audit callers)', reader_or_gate: 'lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js', severity_policy: 'blocking', applicability: 'Every venture, every Stage 20 pass.', ratification_pointer: SCRIBE_PARAPHRASE, waiver: null }),
  Object.freeze({ id: 'secrets', name: 'Secret Detection', tier: 'code_quality', owner_stage: 20, producer: 'lib/eva/quality-findings/writer.js#writeFindingsBatch (secret-scan callers)', reader_or_gate: 'lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js', severity_policy: 'blocking', applicability: 'Every venture, every Stage 20 pass.', ratification_pointer: SCRIBE_PARAPHRASE, waiver: null }),
  Object.freeze({ id: 'lint', name: 'Lint Rule Violations', tier: 'code_quality', owner_stage: 20, producer: 'lib/eva/quality-findings/writer.js#writeFindingsBatch (lint callers)', reader_or_gate: 'lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js', severity_policy: 'blocking', applicability: 'Every venture, every Stage 20 pass.', ratification_pointer: SCRIBE_PARAPHRASE, waiver: null }),
  Object.freeze({ id: 'test_suite', name: 'Test Suite Execution', tier: 'code_quality', owner_stage: 20, producer: 'lib/eva/quality-findings/writer.js#writeFindingsBatch (suite-runner callers)', reader_or_gate: 'lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js', severity_policy: 'blocking', applicability: 'Every venture, every Stage 20 pass.', ratification_pointer: SCRIBE_PARAPHRASE, waiver: null }),
  // ── QA (behavioral) — Stage 20 ──
  Object.freeze({ id: 'unit_test', name: 'Unit Test Failures', tier: 'qa', owner_stage: 20, producer: 'lib/eva/quality-findings/writer.js#writeFindingsBatch (unit-test callers)', reader_or_gate: 'lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js', severity_policy: 'blocking', applicability: 'Every venture, every Stage 20 pass.', ratification_pointer: SCRIBE_PARAPHRASE, waiver: null }),
  Object.freeze({ id: 'e2e_test', name: 'End-to-End Test Failures', tier: 'qa', owner_stage: 20, producer: 'lib/eva/quality-findings/writer.js#writeFindingsBatch (e2e-test callers)', reader_or_gate: 'lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js', severity_policy: 'blocking', applicability: 'Every venture, every Stage 20 pass.', ratification_pointer: SCRIBE_PARAPHRASE, waiver: null }),
  // ── UAT (experiential) — Stage 20 / functional journeys ──
  Object.freeze({ id: 'uat_test', name: 'User Acceptance Test Failures', tier: 'uat', owner_stage: 20, producer: 'lib/eva/quality-findings/writer.js#writeFindingsBatch (uat-test callers)', reader_or_gate: 'lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js', severity_policy: 'blocking', applicability: 'Every venture, every Stage 20 pass.', ratification_pointer: SCRIBE_PARAPHRASE, waiver: null }),
  Object.freeze({ id: 'bug_report', name: 'Chairman-Filed Bug Reports', tier: 'uat', owner_stage: 20, producer: 'lib/eva/quality-findings/writer.js#writeFindingsBatch (bug-report callers)', reader_or_gate: 'lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js', severity_policy: 'blocking', applicability: 'Every venture, every Stage 20 pass.', ratification_pointer: SCRIBE_PARAPHRASE, waiver: null }),
  Object.freeze({ id: 'uat_signoff', name: 'UAT Signoff Rejections', tier: 'uat', owner_stage: 20, producer: 'lib/eva/quality-findings/writer.js#writeFindingsBatch (uat-signoff callers)', reader_or_gate: 'lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js', severity_policy: 'blocking', applicability: 'Every venture, every Stage 20 pass.', ratification_pointer: SCRIBE_PARAPHRASE, waiver: null }),
  Object.freeze({ id: 'capability', name: 'Missing Capability Detection', tier: 'code_quality', owner_stage: 20, producer: 'lib/eva/quality-findings/writer.js#writeFindingsBatch (capability-probe callers)', reader_or_gate: 'lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js', severity_policy: 'blocking', applicability: 'Every venture, every Stage 20 pass.', ratification_pointer: SCRIBE_PARAPHRASE, waiver: null }),
  // ── Vision Compliance (chairman mandate; feedback_support tier) ──
  Object.freeze({ id: 'feedback_widget_present', name: 'Feedback Widget Present', tier: 'feedback_support', owner_stage: 20, producer: 'lib/eva/config/venture-default-capabilities.js#feedback-widget capability', reader_or_gate: 'lib/eva/quality-findings/vision-detectors.js#detectFeedbackWidgetPresent', severity_policy: 'blocking', applicability: 'Every venture. NOTE: rejected by the live venture_quality_findings_finding_category_check constraint today -- see waiver.', ratification_pointer: SCRIBE_PARAPHRASE, waiver: Object.freeze({ reason: 'Category exists in FINDING_CATEGORIES and has a detector, but zero live rows and no applied migration accepts it into the DB CHECK constraint (verified via 17 live probe inserts, RISK sub-agent, 2026-09-13).', dated_at: '2026-09-13', review_by: null, ticket: 'follow-up (constraint migration out of this SD\'s scope)' }) }),
  Object.freeze({ id: 'error_capture_wired', name: 'Error Capture Wired', tier: 'feedback_support', owner_stage: 20, producer: 'lib/eva/config/venture-default-capabilities.js#error-capture-middleware capability', reader_or_gate: 'lib/eva/quality-findings/vision-detectors.js#detectErrorCaptureWired', severity_policy: 'blocking', applicability: 'Every venture. NOTE: rejected by the live venture_quality_findings_finding_category_check constraint today -- see waiver.', ratification_pointer: SCRIBE_PARAPHRASE, waiver: Object.freeze({ reason: 'Category exists in FINDING_CATEGORIES and has a detector, but zero live rows and no applied migration accepts it into the DB CHECK constraint (verified via 17 live probe inserts, RISK sub-agent, 2026-09-13).', dated_at: '2026-09-13', review_by: null, ticket: 'follow-up (constraint migration out of this SD\'s scope)' }) }),
  // ── Experience tier (design-agent, WARN-capped) ──
  Object.freeze({ id: 'usability', name: 'Interaction/Usability Defects', tier: 'experience', owner_stage: 20, producer: 'design-agent (SD-LEO-FEAT-STAGE-EXPERIENCE-DESIGN-001)', reader_or_gate: 'lib/eva/quality-findings/finding-shape.js#WARN_CAPPED_CATEGORIES via stage-20-code-quality.js verdict scan', severity_policy: 'warn_capped', applicability: 'Ventures with an experience-review pass run.', ratification_pointer: SCRIBE_PARAPHRASE, waiver: null }),
  Object.freeze({ id: 'accessibility', name: 'Accessibility Defects (design review)', tier: 'experience', owner_stage: 20, producer: 'design-agent (SD-LEO-FEAT-STAGE-EXPERIENCE-DESIGN-001) AND scripts/eva/capa-001-a-baseline-runner.mjs (axe-core) -- UNRESOLVED PRODUCER OVERLAP, see applicability', reader_or_gate: 'lib/eva/quality-findings/finding-shape.js#WARN_CAPPED_CATEGORIES via stage-20-code-quality.js verdict scan', severity_policy: 'warn_capped', applicability: 'Two independent producers write this one category with no discriminator field (design-agent review vs. axe-core baseline); flagged in code (sd-generator.js CAPA_001_A_BASELINE_CATEGORIES comment) as needing PLAN/chairman-level ratification, not resolved by this SD.', ratification_pointer: SCRIBE_PARAPHRASE, waiver: Object.freeze({ reason: 'Producer-overlap ambiguity between two SDs writing the same category; deliberately not resolved unilaterally.', dated_at: '2026-09-13', review_by: null, ticket: 'needs PLAN/chairman-level ratification (see sd-generator.js comment)' }) }),
  Object.freeze({ id: 'journey_coherence', name: 'User Journey Coherence', tier: 'experience', owner_stage: 20, producer: 'design-agent (SD-LEO-FEAT-STAGE-EXPERIENCE-DESIGN-001)', reader_or_gate: 'lib/eva/quality-findings/finding-shape.js#WARN_CAPPED_CATEGORIES via stage-20-code-quality.js verdict scan', severity_policy: 'warn_capped', applicability: 'Ventures with an experience-review pass run.', ratification_pointer: SCRIBE_PARAPHRASE, waiver: null }),
  // ── Venture Quality Baseline tier (CAPA-001-A, WARN-capped, informational) ──
  Object.freeze({ id: 'performance', name: 'Lighthouse Performance Baseline', tier: 'venture_quality_baseline', owner_stage: 20, producer: 'scripts/eva/capa-001-a-baseline-runner.mjs#runLighthouseCheck', reader_or_gate: 'lib/eva/quality-findings/finding-shape.js#WARN_CAPPED_CATEGORIES via stage-20-code-quality.js verdict scan', severity_policy: 'warn_capped', applicability: 'One-time informational baseline per venture (CAPA-001-A); not a recurring gate.', ratification_pointer: SCRIBE_PARAPHRASE, waiver: null }),
  Object.freeze({ id: 'responsive', name: 'Responsive Layout Baseline', tier: 'venture_quality_baseline', owner_stage: 20, producer: 'scripts/eva/capa-001-a-baseline-runner.mjs#buildResponsiveFindings', reader_or_gate: 'lib/eva/quality-findings/finding-shape.js#WARN_CAPPED_CATEGORIES via stage-20-code-quality.js verdict scan', severity_policy: 'warn_capped', applicability: 'One-time informational baseline per venture (CAPA-001-A); not a recurring gate.', ratification_pointer: SCRIBE_PARAPHRASE, waiver: null }),
  // ── Launch Readiness tier — Stage 23 checklist (code file named for stage 23;
  //    stage-24.js dispatches it -- see lib/eva/stage-templates/stage-24.js:20).
  //    `stage23_membership` ('required'|'advisory'|'growth') drives FR-3's generation
  //    of REQUIRED_CATEGORIES/ADVISORY_CATEGORIES/GROWTH_CATEGORIES -- a field distinct
  //    from `tier`/`severity_policy` because those two don't cleanly separate this
  //    3-way checklist split (e.g. 'legal' is tier:'legal' but stage23_membership:
  //    'required', matching the checklist's own REQUIRED_CATEGORIES literal). ──
  Object.freeze({ id: 'code_quality', name: 'Code Quality Report Verdict', tier: 'launch_readiness', owner_stage: 23, producer: 'lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js (cross-stage artifact reference: code_quality_report)', reader_or_gate: 'lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js (REQUIRED_CATEGORIES)', severity_policy: 'blocking', stage23_membership: 'required', applicability: 'Every venture at the launch-readiness checklist.', ratification_pointer: SCRIBE_PARAPHRASE, waiver: null }),
  Object.freeze({ id: 'marketing_assets', name: 'Marketing Assets Present', tier: 'launch_readiness', owner_stage: 23, producer: null, reader_or_gate: 'lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js (REQUIRED_CATEGORIES)', severity_policy: 'blocking', stage23_membership: 'required', applicability: 'Every venture at the launch-readiness checklist.', ratification_pointer: SCRIBE_PARAPHRASE, waiver: Object.freeze({ reason: 'No dedicated producer registered in this model yet (root cause B: producer/reader wiring gap); building it is out of this SD\'s scope.', dated_at: '2026-09-13', review_by: null, ticket: 'follow-up (producer wiring)' }) }),
  Object.freeze({ id: 'distribution_channels', name: 'Distribution Channels Configured', tier: 'launch_readiness', owner_stage: 23, producer: null, reader_or_gate: 'lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js (REQUIRED_CATEGORIES)', severity_policy: 'blocking', stage23_membership: 'required', applicability: 'Every venture at the launch-readiness checklist.', ratification_pointer: SCRIBE_PARAPHRASE, waiver: Object.freeze({ reason: 'No dedicated producer registered in this model yet; building it is out of this SD\'s scope.', dated_at: '2026-09-13', review_by: null, ticket: 'follow-up (producer wiring)' }) }),
  Object.freeze({ id: 'legal', name: 'Required Legal Documents', tier: 'legal', owner_stage: 23, producer: 'lib/eva/legal-doc-producer.js#generateLegalDocsForVenture', reader_or_gate: 'lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js#checkRequiredLegalDocs', severity_policy: 'blocking', stage23_membership: 'required', applicability: 'Every venture at the launch-readiness checklist. NOTE: producer has zero stage-template callers today (verified, SD-LEO-INFRA-STAGE-LAUNCH-READINESS-001) -- registered here as the intended wiring, not a claim it currently fires automatically.', ratification_pointer: SCRIBE_PARAPHRASE, waiver: null }),
  Object.freeze({ id: 'analytics', name: 'Telemetry/Analytics Wired', tier: 'analytics', owner_stage: 23, producer: 'lib/eva/config/venture-default-capabilities.js#telemetry-analytics capability', reader_or_gate: 'lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js#checkTelemetryAnalyticsWired', severity_policy: 'advisory', stage23_membership: 'advisory', applicability: 'Every venture at the launch-readiness checklist (ADVISORY, not blocking, by existing design -- this SD does not change that).', ratification_pointer: SCRIBE_PARAPHRASE, waiver: null }),
  Object.freeze({ id: 'monitoring', name: 'Uptime Monitoring Wired', tier: 'monitoring_uptime', owner_stage: 23, producer: 'lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js#getLatestProbeStatus caller', reader_or_gate: 'lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js#checkVentureUptimeWired', severity_policy: 'advisory', stage23_membership: 'advisory', applicability: 'Every venture at the launch-readiness checklist (ADVISORY, not blocking, by existing design -- this SD does not change that).', ratification_pointer: SCRIBE_PARAPHRASE, waiver: null }),
  // ── Growth/Capability tiers (flag-gated, default OFF -- this SD does not change defaults) ──
  Object.freeze({ id: 'growth_playbook', name: 'Growth Playbook Present', tier: 'launch_readiness', owner_stage: 23, producer: null, reader_or_gate: 'lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js (GROWTH_CATEGORIES, behind LEO_S21_GROWTH_PLAYBOOK_REQUIRED, default OFF)', severity_policy: null, stage23_membership: 'growth', applicability: 'Flag-gated; default OFF. This SD generates the array, not the flag default.', ratification_pointer: SCRIBE_PARAPHRASE, waiver: Object.freeze({ reason: 'Flag-gated dimension with no producer registered in this model yet.', dated_at: '2026-09-13', review_by: null, ticket: 'follow-up (producer wiring)' }) }),
  Object.freeze({ id: 'distribution_ad_copy', name: 'Distribution Ad Copy Present', tier: 'launch_readiness', owner_stage: 23, producer: null, reader_or_gate: 'lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js (GROWTH_CATEGORIES, behind LEO_S21_GROWTH_PLAYBOOK_REQUIRED, default OFF)', severity_policy: null, stage23_membership: 'growth', applicability: 'Flag-gated; default OFF. This SD generates the array, not the flag default.', ratification_pointer: SCRIBE_PARAPHRASE, waiver: Object.freeze({ reason: 'Flag-gated dimension with no producer registered in this model yet.', dated_at: '2026-09-13', review_by: null, ticket: 'follow-up (producer wiring)' }) }),
  // SD-LEO-INFRA-VENTURE-WORKFLOW-CREATES-001: chairman rulings 3c20483a/58f5345f (2026-09-14).
  // Producer ships in the SAME PR as this entry (unlike marketing_assets/distribution_channels
  // above) -- the flag-gated default-OFF rollout here is a deliberate SAFETY measure (matching
  // this checklist file's own established pattern for every new REQUIRED category), not an
  // unwired-producer waiver.
  //
  // stage23_membership is deliberately 'flagged_required', NOT 'growth' or 'required' -- neither
  // of this checklist's 2 existing flag-gated splice mechanisms fit: 'required'/'advisory'/
  // 'growth' are the only 3 values STAGE23_REQUIRED_CATEGORY_IDS/STAGE23_ADVISORY_CATEGORY_IDS/
  // STAGE23_GROWTH_CATEGORY_IDS derive from, and 'growth' would incorrectly gate this category
  // behind the UNRELATED LEO_S21_GROWTH_PLAYBOOK_REQUIRED flag. This category instead follows
  // the CAPABILITY_CATEGORIES precedent (stage-23-launch-readiness.js): a self-contained array
  // gated by its OWN flag (LEO_S24_ORGANIZATION_QA_REQUIRED), never derived from this registry's
  // 3-way stage23_membership split. This entry exists for documentation/provenance only.
  Object.freeze({ id: 'organization_qa', name: 'AI Organization Acceptance Suite Result', tier: 'launch_readiness', owner_stage: 23, producer: 'lib/eva/stage-templates/analysis-steps/stage-23-dedicated-venture-uat.js#createAndCheckOrganization', reader_or_gate: 'lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js (ORGANIZATION_QA_CATEGORIES, behind LEO_S24_ORGANIZATION_QA_REQUIRED, default OFF)', severity_policy: 'blocking', stage23_membership: 'flagged_required', applicability: 'Flag-gated; default OFF until the clean-slate test venture (ratification 3c4a6781) is ready to exercise this path, per chairman ruling 212909b9.', ratification_pointer: ORGANIZATION_QA_POINTER, waiver: null }),
  // ── Ratified-but-unwired dimensions (named individually in the scribe paraphrase;
  //    no producer/reader exists yet -- building one is explicitly EXCLUDED from this SD) ──
  Object.freeze({ id: 'public_route_protection', name: 'Public Route Protection', tier: 'ethical', owner_stage: null, producer: null, reader_or_gate: null, severity_policy: null, applicability: 'Named in the ratification scribe paraphrase; no producer/reader exists yet.', ratification_pointer: SCRIBE_PARAPHRASE, waiver: Object.freeze({ reason: 'Stub row (gauge-registry.js stub-row-adoption convention): reserves the slot without depending on a sibling SD shipping the producer/reader first.', dated_at: '2026-09-13', review_by: null, ticket: 'follow-up (producer + reader wiring)' }) }),
  Object.freeze({ id: 'data_protection', name: 'Data Protection', tier: 'ethical', owner_stage: null, producer: null, reader_or_gate: null, severity_policy: null, applicability: 'Named in the ratification scribe paraphrase; no producer/reader exists yet.', ratification_pointer: SCRIBE_PARAPHRASE, waiver: Object.freeze({ reason: 'Stub row.', dated_at: '2026-09-13', review_by: null, ticket: 'follow-up (producer + reader wiring)' }) }),
  Object.freeze({ id: 'billing_correctness', name: 'Billing Correctness', tier: 'ethical', owner_stage: null, producer: null, reader_or_gate: null, severity_policy: null, applicability: 'Named in the ratification scribe paraphrase; no producer/reader exists yet.', ratification_pointer: SCRIBE_PARAPHRASE, waiver: Object.freeze({ reason: 'Stub row.', dated_at: '2026-09-13', review_by: null, ticket: 'follow-up (producer + reader wiring)' }) }),
  Object.freeze({ id: 'onboarding', name: 'Onboarding Quality', tier: 'experience', owner_stage: null, producer: null, reader_or_gate: null, severity_policy: null, applicability: 'Named in the ratification scribe paraphrase; no producer/reader exists yet.', ratification_pointer: SCRIBE_PARAPHRASE, waiver: Object.freeze({ reason: 'Stub row.', dated_at: '2026-09-13', review_by: null, ticket: 'follow-up (producer + reader wiring)' }) }),
  Object.freeze({ id: 'functional_journeys', name: 'Functional Journeys (registration/login/logout, feedback, money path)', tier: 'uat', owner_stage: null, producer: null, reader_or_gate: null, severity_policy: null, applicability: 'Named in the ratification scribe paraphrase (D3\'s reopened fourteen-journey set); distinct from experience-tier journey_coherence. No dedicated producer/reader registered yet.', ratification_pointer: SCRIBE_PARAPHRASE, waiver: Object.freeze({ reason: 'Stub row.', dated_at: '2026-09-13', review_by: null, ticket: 'follow-up (producer + reader wiring)' }) }),
  // ── Interface tier (design_quality_v1, 6 dimensions — verified_external_proxy) ──
  Object.freeze({ id: 'design_trust', name: 'Trust/Proof Signals', tier: 'interface', owner_stage: null, producer: null, reader_or_gate: null, severity_policy: null, applicability: 'Design-quality tier; see module docblock note on adherence_rubrics being venture-specific instances.', ratification_pointer: externalProxyRef('design_quality_v1', 'trust'), waiver: DESIGN_TIER_WAIVER }),
  Object.freeze({ id: 'design_typography', name: 'Typography System', tier: 'interface', owner_stage: null, producer: null, reader_or_gate: null, severity_policy: null, applicability: 'Design-quality tier; see module docblock note on adherence_rubrics being venture-specific instances.', ratification_pointer: externalProxyRef('design_quality_v1', 'typography'), waiver: DESIGN_TIER_WAIVER }),
  Object.freeze({ id: 'design_brand_assets', name: 'Brand Assets', tier: 'interface', owner_stage: null, producer: null, reader_or_gate: null, severity_policy: null, applicability: 'Design-quality tier; see module docblock note on adherence_rubrics being venture-specific instances.', ratification_pointer: externalProxyRef('design_quality_v1', 'brand_assets'), waiver: DESIGN_TIER_WAIVER }),
  Object.freeze({ id: 'design_visual_hierarchy', name: 'Visual Hierarchy', tier: 'interface', owner_stage: null, producer: null, reader_or_gate: null, severity_policy: null, applicability: 'Design-quality tier; see module docblock note on adherence_rubrics being venture-specific instances.', ratification_pointer: externalProxyRef('design_quality_v1', 'visual_hierarchy'), waiver: DESIGN_TIER_WAIVER }),
  Object.freeze({ id: 'design_accessibility_states', name: 'Accessibility States (WCAG AA)', tier: 'interface', owner_stage: null, producer: null, reader_or_gate: null, severity_policy: null, applicability: 'Design-quality tier; see module docblock note on adherence_rubrics being venture-specific instances.', ratification_pointer: externalProxyRef('design_quality_v1', 'accessibility_states'), waiver: DESIGN_TIER_WAIVER }),
  Object.freeze({ id: 'design_content_copy_fidelity', name: 'Content/Copy Corpus Fidelity', tier: 'interface', owner_stage: null, producer: null, reader_or_gate: null, severity_policy: null, applicability: 'Design-quality tier; see module docblock note on adherence_rubrics being venture-specific instances.', ratification_pointer: externalProxyRef('design_quality_v1', 'content_copy_corpus_fidelity'), waiver: DESIGN_TIER_WAIVER }),
  // ── Adherence tier (post_build_adherence_v1, 4 dimensions — verified_external_proxy) ──
  Object.freeze({ id: 'adherence_data_model_fidelity', name: 'Data Model Fidelity', tier: 'adherence', owner_stage: null, producer: null, reader_or_gate: null, severity_policy: null, applicability: 'Post-build adherence tier; see module docblock note on adherence_rubrics being venture-specific instances.', ratification_pointer: externalProxyRef('post_build_adherence_v1', 'data_model_fidelity'), waiver: DESIGN_TIER_WAIVER }),
  Object.freeze({ id: 'adherence_user_story_coverage', name: 'User Story Coverage', tier: 'adherence', owner_stage: null, producer: null, reader_or_gate: null, severity_policy: null, applicability: 'Post-build adherence tier; see module docblock note on adherence_rubrics being venture-specific instances.', ratification_pointer: externalProxyRef('post_build_adherence_v1', 'user_story_coverage'), waiver: DESIGN_TIER_WAIVER }),
  Object.freeze({ id: 'adherence_architecture_conformance', name: 'Architecture Conformance', tier: 'adherence', owner_stage: null, producer: null, reader_or_gate: null, severity_policy: null, applicability: 'Post-build adherence tier; see module docblock note on adherence_rubrics being venture-specific instances.', ratification_pointer: externalProxyRef('post_build_adherence_v1', 'architecture_conformance'), waiver: DESIGN_TIER_WAIVER }),
  Object.freeze({ id: 'adherence_persona_surface_coverage', name: 'Persona Surface Coverage', tier: 'adherence', owner_stage: null, producer: null, reader_or_gate: null, severity_policy: null, applicability: 'Post-build adherence tier; see module docblock note on adherence_rubrics being venture-specific instances.', ratification_pointer: externalProxyRef('post_build_adherence_v1', 'persona_surface_coverage'), waiver: DESIGN_TIER_WAIVER }),
]);

// Module-load-time tripwire: FR-1's "zero reconstructed rows" acceptance criterion is a
// BLOCKER, not a note (RISK sub-agent mitigation M-4) -- mirrors the pattern at
// lib/eva/quality-findings/vision-detectors.js's VENDOR_SIGNATURES sanity check.
for (const dim of QUALITY_MODEL_DIMENSIONS) {
  if (dim.ratification_pointer?.source === 'reconstructed') {
    throw new Error(
      `lib/eva/quality-model/registry.js: dimension id='${dim.id}' is tagged ratification_pointer.source='reconstructed', which is forbidden -- every dimension must be chairman_verbatim, scribe_paraphrase, or verified_external_proxy.`
    );
  }
}

/** Every dimension id, in registry order (used to generate downstream category arrays). */
export const QUALITY_MODEL_DIMENSION_IDS = Object.freeze(QUALITY_MODEL_DIMENSIONS.map((d) => d.id));

/** @param {string} id @returns {object|undefined} */
export function getDimension(id) {
  return QUALITY_MODEL_DIMENSIONS.find((d) => d.id === id);
}

/** Dimensions carrying severity_policy 'warn_capped' (mirrors WARN_CAPPED_CATEGORIES). */
export const WARN_CAPPED_DIMENSION_IDS = Object.freeze(
  QUALITY_MODEL_DIMENSIONS.filter((d) => d.severity_policy === 'warn_capped').map((d) => d.id)
);

/**
 * FR-3: the stage-23 launch-readiness checklist's 3-way category split, generated from
 * each dimension's `stage23_membership` field (registry order). Consumed by
 * lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js instead of that
 * file's own hand-authored literals.
 */
export const STAGE23_REQUIRED_CATEGORY_IDS = Object.freeze(
  QUALITY_MODEL_DIMENSIONS.filter((d) => d.stage23_membership === 'required').map((d) => d.id)
);
export const STAGE23_ADVISORY_CATEGORY_IDS = Object.freeze(
  QUALITY_MODEL_DIMENSIONS.filter((d) => d.stage23_membership === 'advisory').map((d) => d.id)
);
export const STAGE23_GROWTH_CATEGORY_IDS = Object.freeze(
  QUALITY_MODEL_DIMENSIONS.filter((d) => d.stage23_membership === 'growth').map((d) => d.id)
);
