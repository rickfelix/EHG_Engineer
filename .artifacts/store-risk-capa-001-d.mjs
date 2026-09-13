import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';

const SD_KEY = 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-D';
const SD_UUID = '174798a0-363d-4a25-895a-a23c6e93cf6a';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const domain_scores = {
  technical_complexity: 6,
  security_risk: 5,
  performance_risk: 2,
  integration_risk: 8,
  data_migration_risk: 7,
  ui_ux_risk: 1,
};

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  summary:
    'RISK: HIGH (integration 8, data_migration 7). Verdict CONCERNS/CONDITIONAL_PASS — proceed with 5 documented mitigations. '
    + 'Two measured blockers-in-waiting: (1) scope items 3+4 (wireframe fidelity scoring + verifyDesignFidelityReviewed) are DEAD BY '
    + 'CONSTRUCTION against AltifyAI — scoreWireframeFidelity reads venture_artifacts.artifact_type=\'stitch_design_export\', which '
    + 'AltifyAI does not have (54 artifact types enumerated live, none is stitch_design_export or stitch_qa_report), and its '
    + 'wireframe_screens payload carries screen_id/screen_name/description/deviceType with NO png/base64/url, so the call returns '
    + '{status:"no_screens"}: zero vision calls, zero cost, zero artifact written, and the new verifier reads absent forever. '
    + '(2) The X3 gauge as specified false-CLEARS by construction: the predicate is a GLOBAL existence check, so the single AltifyAI '
    + 'annex run this SD performs turns its own gauge green permanently while ApexNiche AI (active, stage 21) stays uncovered. '
    + 'Item 1 migration read CONFIRMED CORRECT (additive, isolated, not chairman-gated); item 5 migration read is NOT — venture_stages '
    + 'has a same-day chairman-gated precedent.',
  detailed_analysis: {
    sd: SD_KEY,
    phase: 'LEAD',
    overall_risk: 'HIGH',
    verdict_plain: 'CONCERNS',
    domain_scores,
    measurement_basis: {
      live_db_probes: [
        'venture_experience_review_runs: PGRST205 on a real (non-head) select -> table genuinely ABSENT. NOTE: a head:true count probe returned {count:null,error:null} i.e. a FALSE "exists" — do not use head-count as an existence probe.',
        'AltifyAI (50763b6a-1fad-4e1e-b2fc-296a1d66ebf9) status=active, current_lifecycle_stage=24 — confirmed.',
        'AltifyAI venture_artifacts: 54 distinct artifact_types enumerated. blueprint_wireframes (is_current, content JSON string 23220 chars -> {screens:[9]}) and wireframe_screens (is_current, content 7540 chars -> {screens:[9], screenCount, ia_sitemap}) BOTH present. stitch_design_export: ABSENT. stitch_qa_report: ABSENT.',
        'AltifyAI wireframe_screens screen shape: {screen_id, screen_name, description, deviceType, page_type} — no png, no base64, no url.',
        'venture_stages stage 15 "Design Studio": is_high_consequence=false, is_irreversible=false, gate_type=none, review_mode=auto, metadata keys = [metrics, stage_timeout_ms], metadata.gates = NULL (no gates object at all).',
        'venture_stages stage 20 gates.exit = [No critical security issues, No exposed secrets, Lint passes]; stage 24 gates.exit = [All categories green OR chairman override].',
        'ventures with current_lifecycle_stage>=20: 56 total — 54 status=cancelled (mostly __e2e_* / TEST-HARNESS-* fixtures), 2 status=active (AltifyAI st.24, ApexNiche AI st.21).',
        'ventures with current_lifecycle_stage=15: 10, ALL status=cancelled. Zero active ventures at stage 15.',
      ],
      code_reads: [
        'lib/eva/lifecycle/exit-gate-enforcer.js:194-236 — gates.exit_observe dispatched independently; results go to would_block_by ONLY, never blocked_by/allowed. With gates.exit absent -> returns allowed:true. Observe-only is structurally non-binding.',
        'lib/eva/lifecycle/exit-gate-verifiers.js:737-788 — GATE_VERIFIERS is an ORDERED array; resolveVerifier uses first-match-wins SUBSTRING matching (lc.includes(match)) over 22 entries.',
        'lib/eva/qa/stitch-wireframe-qa.js getExportedScreens() reads artifact_type=\'stitch_design_export\' (NOT wireframe_screens).',
        'lib/eva/qa/stitch-wireframe-qa.js persistWireframeFidelity():266-290 — if an is_current stitch_qa_report exists it does an IN-PLACE .update() of metadata with NO version bump (no prior-value audit trail); otherwise it INSERTs (lifecycle_stage:17, version:1).',
        'lib/eva/experience-review/persist.js — writes findings via writeFindingsBatch into venture_quality_findings with stage_number:20, categories constrained to WARN_CAPPED_CATEGORIES=[usability, accessibility, journey_coherence].',
        'Stage-20/24 binding verifiers read venture_artifacts (code_quality_report.artifact_data.summary / launch_readiness_checklist.artifact_data.verdict), NOT venture_quality_findings — so the annex write does not feed any binding exit gate. LEAD claim CONFIRMED.',
        'scripts/gauges/wind-down-recurrence-check.mjs:22-30 — the clone target throws on error AND on a non-finite count, explicitly refusing to fold a null count into 0.',
        'lib/eva/lifecycle/bind-criterion-checker.js crossCheckCandidateGateStrings() derives its stage query from CANDIDATE_GATE_STRINGS stage_numbers, so adding stage 15 self-extends. Criterion needs >=25 rows AND >=48h span.',
      ],
    },
    assessment_by_question: {
      a_migration_application: {
        risk: 'LOW for item 1 (read CONFIRMED CORRECT) / MEDIUM-HIGH for item 5 (read NOT confirmed — flag)',
        item_1_venture_experience_review_runs: {
          lead_read_correct: true,
          evidence: 'Genuinely absent (PGRST205 on a real select). File is database/migrations/, NOT database/chairman-gated/. CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS inside BEGIN/COMMIT. New isolated table; zero existing objects altered. This is the exact shape sibling -I\'s own PLAN TESTING finding endorsed as deliberately OFF the chairman-gated critical path (commit 99a0cbbd5c7).',
          gaps: [
            'No ENABLE ROW LEVEL SECURITY and no GRANT/REVOKE. The repo has chairman-gated precedent for exactly this class (database/chairman-gated/20260818_venture_stage_work_drop_public_select.sql). Decide RLS/grants BEFORE apply, not after.',
            'No companion _rollback/_DOWN file, contrary to the prevailing convention in database/migrations/.',
            'No @approved-by / approval header. Sibling -I had to add one to its migration (commit 7fbd0b42cdc) — expect the same requirement. Reminder: that header is a CEREMONY MARKER, never apply state.',
          ],
        },
        item_5_stage15_gates_migration: {
          lead_read_correct: 'UNVERIFIED — flag for PLAN',
          evidence: 'venture_stages is NOT a safe-by-default target. database/chairman-gated/ contains 20260913_venture_stages_is_high_consequence_stage24.sql (dated TODAY), 20260825_dedicated_venture_uat_stage_insert_and_renumber.sql, 20260825_ventures_stage_rpcs_self_stamp.sql and 20260722_stage_advancement_advance_venture_stage_gate_type_ssot_dry_run.mjs. The SD\'s own DB-recorded RISKS field already says "The migrations may be chairman-gated ... the apply rides a ceremony packet, never a worker apply."',
          additional: 'Stage 15 metadata has NO gates key at all today (only metrics, stage_timeout_ms). The migration CREATES the gates object. It MUST use jsonb_set/|| that preserves metadata.metrics and metadata.stage_timeout_ms, and MUST assert post-apply that metadata->gates->exit is still absent. A naive metadata = \'{"gates":...}\' assignment would silently destroy stage 15\'s metrics and timeout config.',
        },
      },
      b_first_production_wireframe_fidelity_call: {
        risk: 'API cost/availability LOW (2) — but only because the call is inert. Delivery risk HIGH.',
        cost: 'ZERO. scoreWireframeFidelity will short-circuit at getExportedScreens() -> [] -> {status:"no_screens"} before any Anthropic call, because AltifyAI has no stitch_design_export artifact. Upper bound if it DID run: 9 screens x 1 vision call.',
        mutation_of_existing_artifacts: 'SAFE TODAY, latent hazard. AltifyAI has no is_current stitch_qa_report, so the INSERT branch would be taken. The UPDATE branch (persistWireframeFidelity:277-286) overwrites metadata in place with NO version bump — a re-run silently replaces a prior wireframe_fidelity block with no audit trail.',
        secondary_defects_if_the_screens_gap_is_closed: [
          'pairScreensWithWireframes matches (screen.title || screen.screen_id) against wireframe.name. AltifyAI\'s wireframe_screens uses screen_name (not title), so pairing would compare "screen-0" to "Landing Page" -> 0 pairs, all unpaired, aggregate null.',
          'The per-wireframe spec field is ascii_layout (an ARRAY). The scorer tries content||spec||ascii and falls through to JSON.stringify(wireframe) — functional but a degraded prompt.',
        ],
        mandatory_guard: 'The one-shot CLI must call scoreWireframeFidelity directly and NEVER iterateUntilPass — the latter re-scores up to 3+ times and re-persists.',
      },
      c_observe_only_becoming_binding_or_affecting_other_stage15_ventures: {
        risk: 'LOW (3)',
        binding_leak: 'STRUCTURALLY IMPOSSIBLE via this change. exit-gate-enforcer.js dispatches exit_observe into would_block_by only; with stage 15 gates.exit absent the function returns allowed:true unconditionally. Stage 15 is_high_consequence=false and is_irreversible=false, so checkStageGate\'s high-consequence predicate (ratification b75ddfff) does not engage.',
        verifier_shadowing: 'resolveVerifier is first-match-wins SUBSTRING matching. "design fidelity reviewed" shares no substring with any of the 22 existing match keys in either direction. APPEND THE NEW ENTRY AT THE END of GATE_VERIFIERS to make shadowing impossible by construction.',
        blast_radius_on_other_ventures: 'ZERO today — all 10 ventures at stage 15 are status=cancelled; no active venture sits at or will transit stage 15 in this window.',
        inverse_risk_ZERO_YIELD: 'That same zero blast radius means ZERO observation yield. bind-criterion-checker needs >=25 EXIT_GATE_OBSERVE_ONLY rows spanning >=48h for this (15, design fidelity reviewed) pair. With no active venture transiting stage 15, that count stays 0 indefinitely and the graduation path is unreachable by construction. Register it knowing it is an inert placeholder, not an accruing instrument.',
      },
      d_gauge_false_alarm_or_false_clear: {
        risk: 'HIGH (7) — both directions are live, measured, not hypothetical',
        false_alarm: 'An unfiltered .gte(current_lifecycle_stage, 20) qualifies 56 ventures, 54 of them status=cancelled e2e/test fixtures (__e2e_product_review_gate_*, TEST-HARNESS-S20-*, ProductReviewGate-RealDB-*). None will ever have a review run -> the gauge trips permanently from hour one. MUST filter status=\'active\' (and consider excluding __e2e_/TEST- name prefixes).',
        false_clear: 'The stated predicate ("zero venture_experience_review_runs rows exist for such ventures") is a GLOBAL existence check. The single AltifyAI annex run in scope item 2 turns the gauge green permanently, while ApexNiche AI (active, stage 21) remains uncovered forever. The gauge would be self-satisfying: this SD\'s own run clears the instrument this SD ships, and the parent programme\'s "two consecutive weekly zero-alarm readings" criterion is met trivially. FIX: per-venture coverage semantics — alarm if ANY qualifying venture has zero rows.',
        instrument_blindness: 'A head:true count against venture_experience_review_runs BEFORE the migration is applied returns {count:null, error:null} — measured in this assessment. A ?? 0 would read "zero rows, all clear" for a table that does not exist. Clone wind-down-recurrence-check.mjs:22-30 exactly: throw on error AND on a non-finite count.',
        tri_state: 'The "never alarms when zero qualifying ventures exist" rule must surface as an explicit third state (status:"inapplicable"), never folded into alarmed:false — otherwise a fleet with no stage>=20 ventures is indistinguishable from full coverage.',
        registry: 'Gauge id must not collide with the 30 registered ids; nothing named experience-review-* exists today. Register in GAUGE_REGISTRY with tripWhen reading result.alarmed===true and add the resolver key in scripts/gauge-runner.mjs (runner skips an unresolved key NON-FATALLY, so a registry entry without a resolver is silently dead).',
      },
      e_shared_file_conflict_with_active_siblings: {
        risk: 'HIGH (8) — CONFIRMED file-level conflict with an active sibling',
        confirmed_conflict_sibling_A: {
          sd: 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A (status=active, phase=EXEC, updated 2026-09-13T16:56Z)',
          evidence: 'Commit aa3ca9abd10 "widen finding categories for accessibility/performance/responsive baselines" modifies lib/eva/quality-findings/finding-shape.js (+20), lib/eva/quality-findings/sd-generator.js, tests/.../stage-20-experience-warn-cap.test.js, AND adds a CHECK-constraint migration ..._venture_quality_findings_capa_baseline_categories.sql.',
          why_it_collides: '-D\'s experience-review run (scope item 2) goes through lib/eva/experience-review/persist.js -> buildExperienceFindings, which THROWS on any category outside WARN_CAPPED_CATEGORIES imported from that exact file, and writes into venture_quality_findings which -A is adding a category CHECK constraint to. Both SDs write findings for the SAME venture (AltifyAI) in the SAME window. -A also edits the stage-20-experience-warn-cap test that covers -D\'s write path.',
          mitigation: 'Rebase -D on -A\'s merged state before running the annex; re-read WARN_CAPPED_CATEGORIES and confirm the live CHECK constraint accepts usability/accessibility/journey_coherence at run time, not at plan time.',
        },
        semantic_overlap_sibling_I: {
          sd: 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I (status=active, phase=PLAN_VERIFICATION, updated 2026-09-13T17:51Z)',
          evidence: 'Commit 31597fda75e ships lib/eva/.../stage-15-coverage-disposition-reader.js; commit 99a0cbbd5c7 adds venture_screen_dispositions + venture_screen_reconciliation tables; commit 7fbd0b42cdc adds the approval header to that migration.',
          why_it_matters: 'Both -D and -I now attach stage-15 quality machinery. Different FILES today (no direct edit collision), but overlapping semantics and both landing stage-15 migrations in the same window. Coordinate migration filenames/dates and confirm -I did not already claim a stage-15 gate string.',
        },
        low_conflict_files: 'lib/eva/lifecycle/exit-gate-verifiers.js, bind-criterion-checker.js, lib/governance/gauge-registry.js and scripts/gauge-runner.mjs show NO edits from any active CAPA-001 sibling in the current window — append-only edits to these four are low-conflict.',
        worktrees_live: 'CAPA-001 (parent), -A, -D have live worktrees; -F merged/completed; -I has no worktree here (worked elsewhere).',
      },
    },
    scope_governance_flag: {
      issue: 'The scope in the assessment request EXCEEDS the SD\'s DB-recorded scope.',
      db_scope: 'C3.1 apply the two experience-review migrations + run the experience review ONCE as a STAGE-20 STEP on AltifyAI (informational); C3.2 register the design-fidelity gate in bind-criterion-checker CANDIDATE_GATE_STRINGS; X3 hourly-probe check. EXCLUDED: making either pilot binding.',
      delta: 'The request adds (i) a new one-shot CLI wrapper, (ii) a NEW verifier verifyDesignFidelityReviewed in GATE_VERIFIERS, (iii) a NEW venture_stages migration writing stage-15 gates.exit_observe. None of the three appear in the DB scope. It also substitutes the out-of-band annex path for the recorded "stage-20 step" (a defensible DE-RISKING reframe — endorse it, but record it).',
      why_it_matters: 'Ratification 4730357d: "a narrow factory correction, not authorization for a new framework, stage, dashboard, loop, or extended research effort." Expanding a chairman-sourced child\'s scope at LEAD without recording the reframe is the shape that ratification warns against. Also: the DB scope says TWO experience-review migrations; only ONE exists in the repo (20260828_venture_experience_review_runs.sql is the sole file referencing that table). PLAN must resolve the count discrepancy rather than silently shipping one.',
    },
    critical_issues: [
      'DEAD BY CONSTRUCTION: scope items 3+4 cannot produce a result. scoreWireframeFidelity reads artifact_type=stitch_design_export; AltifyAI has no such artifact (54 types enumerated live) and its wireframe_screens rows carry no image data at all. The call returns {status:"no_screens"}; no stitch_qa_report is ever written; verifyDesignFidelityReviewed reads absent permanently. Re-scope or supply an export step before committing to these items.',
      'GAUGE FALSE-CLEARS BY CONSTRUCTION: a global existence predicate goes green on this SD\'s own single AltifyAI run while ApexNiche AI (active, stage 21) stays uncovered — the SD clears the instrument it ships. Use per-venture coverage semantics.',
      'ACTIVE SIBLING FILE CONFLICT: -A (EXEC, today) is editing lib/eva/quality-findings/finding-shape.js WARN_CAPPED_CATEGORIES + adding a venture_quality_findings category CHECK constraint — the exact validation and write path -D\'s annex run traverses, against the same venture.',
    ],
    warnings: [
      'Item 5\'s venture_stages migration is NOT confirmed non-chairman-gated; a same-day chairman-gated venture_stages migration exists (20260913_venture_stages_is_high_consequence_stage24.sql). The SD\'s own RISKS field anticipates a ceremony packet.',
      'Stage 15 metadata currently has no gates key; the migration must preserve metadata.metrics and metadata.stage_timeout_ms via jsonb_set/|| and assert gates.exit stays absent.',
      'venture_experience_review_runs ships with no RLS and no GRANT/REVOKE; repo precedent treats public-select on venture-stage tables as chairman-gated.',
      'Zero active ventures sit at stage 15 — the observe-only registration accrues no data and its >=25-row/>=48h bind criterion is unreachable in this window. Register it as an acknowledged inert placeholder.',
      'Do not use a head:true count as an existence probe — it returned a false "exists" for the absent table during this very assessment.',
      'The one-shot CLI must call scoreWireframeFidelity, never iterateUntilPass.',
      'Append the new GATE_VERIFIERS entry at the END of the ordered array (first-match-wins substring resolution).',
      'DB scope names TWO experience-review migrations; only ONE exists in the repo. Resolve before EXEC.',
    ],
    mitigation_recommendations: [
      'M1 (blocking for items 3+4): Before committing to the design-fidelity pilot, either (a) produce a stitch_design_export artifact with real PNGs for AltifyAI, or (b) descope items 3+4 to the C3.2 registration alone (which is all the DB scope actually asks for) and record the artifact gap as the reason. Do not ship a verifier whose input can never exist.',
      'M2 (blocking for item 7): Rewrite the gauge predicate as per-venture coverage — alarm if ANY status=active venture at current_lifecycle_stage>=20 has zero venture_experience_review_runs rows. Filter status=\'active\'. Emit a tri-state {alarmed|clear|inapplicable}. Throw on query error AND on a non-finite count, cloning wind-down-recurrence-check.mjs:22-30 verbatim. Ship a unit test that asserts the 54 cancelled fixtures do not qualify and that one covered venture does not clear an uncovered one.',
      'M3 (item 5): Treat the venture_stages migration as chairman-gated until proven otherwise. Have PLAN read the file against the chairman-gated classifier, route it through a ceremony packet naming the exact file and one-line effect, and write it as a jsonb merge that preserves metrics/stage_timeout_ms with a post-apply assertion that metadata->gates->exit is still absent.',
      'M4 (item 1): Add ENABLE ROW LEVEL SECURITY + explicit GRANT/REVOKE, a companion _rollback.sql, and the approval header before apply. Verify absence with a real select (PGRST205), never a head-count.',
      'M5 (sibling coordination): Rebase on -A\'s merged finding-shape.js + category CHECK migration before running the annex, and re-read WARN_CAPPED_CATEGORIES at run time. Coordinate stage-15 migration naming with -I. Append-only to exit-gate-verifiers.js / bind-criterion-checker.js / gauge-registry.js / gauge-runner.mjs (no sibling is editing those four today).',
      'M6 (governance): Record the LEAD scope reframe explicitly in the LEAD-TO-PLAN handoff — the annex-path substitution (endorsed as de-risking), the three added deliverables beyond the DB scope, and the one-vs-two migration count discrepancy.',
    ],
    blocking_criteria_applied: 'HIGH risk -> requires a documented mitigation plan (M1-M6 above), not an approval block. Nothing here is irreversible or data-destructive: observe-only wiring is structurally non-binding (verified in code), the vision call is inert, and both migrations are additive.',
  },
  conditions: [
    { action: 'M1: descope items 3+4 to the C3.2 registration, or produce a real stitch_design_export artifact for AltifyAI first — scoreWireframeFidelity cannot return a result against AltifyAI today', priority: 'high', blocking: true },
    { action: 'M2: rewrite the X3 gauge predicate as per-venture coverage over status=active ventures, tri-state, fail-loud on a non-finite count', priority: 'high', blocking: true },
    { action: 'M3: treat the stage-15 venture_stages migration as chairman-gated until PLAN proves otherwise; preserve metadata.metrics/stage_timeout_ms; assert gates.exit stays absent', priority: 'high', blocking: false },
    { action: 'M4: add RLS + grants + rollback + approval header to 20260828_venture_experience_review_runs.sql before apply', priority: 'medium', blocking: false },
    { action: 'M5: rebase on sibling -A (active/EXEC) finding-shape.js + venture_quality_findings category CHECK migration before running the annex against AltifyAI', priority: 'high', blocking: true },
    { action: 'M6: record the LEAD scope reframe (annex path, 3 added deliverables, one-vs-two migration discrepancy) in the LEAD-TO-PLAN handoff', priority: 'medium', blocking: false },
  ],
  justification:
    'CONDITIONAL_PASS (CONCERNS) at overall HIGH risk. The SD is directionally sound and structurally non-destructive — observe-only gate wiring cannot bind (verified in exit-gate-enforcer.js:194-236), both migrations are additive, and the vision call is inert. But three findings are measured, not hypothetical: scope items 3 and 4 are dead by construction because AltifyAI has no stitch_design_export artifact and no image data anywhere; the X3 gauge as specified false-clears on this SD\'s own single run while leaving an active venture uncovered; and active sibling -A is editing the exact finding-shape validation path and venture_quality_findings CHECK constraint that -D\'s annex run traverses, against the same venture, in the same window. Conditions M1, M2 and M5 are blocking; M3, M4 and M6 are documented follow-ups.',
  metadata: {
    sub_agent: 'risk-agent',
    version: '1.0.0',
    overall_risk: 'HIGH',
    verdict_plain: 'CONCERNS',
    domain_scores,
    sd_key: SD_KEY,
    assessed_scope_items: 7,
    blocking_conditions: 3,
  },
  critical_issues: [
    { severity: 'HIGH', issue: 'DEAD BY CONSTRUCTION: scope items 3+4 cannot produce a result. scoreWireframeFidelity reads venture_artifacts.artifact_type=stitch_design_export; AltifyAI has no such artifact (54 artifact types enumerated live) and its wireframe_screens payload carries no png/base64/url. The call returns status=no_screens; no stitch_qa_report is ever written; verifyDesignFidelityReviewed reads absent permanently.', recommendation: 'M1: descope items 3+4 to the C3.2 bind-criterion registration (all the DB scope actually asks for), or produce a real stitch_design_export artifact for AltifyAI first.' },
    { severity: 'HIGH', issue: 'GAUGE FALSE-CLEARS BY CONSTRUCTION: the stated X3 predicate is a GLOBAL existence check, so the single AltifyAI annex run this SD performs turns its own gauge green permanently while ApexNiche AI (status=active, stage 21) stays uncovered. The parent programme two-consecutive-weekly-zero-alarm criterion would be met trivially.', recommendation: 'M2: per-venture coverage semantics - alarm if ANY status=active venture at stage>=20 has zero venture_experience_review_runs rows.' },
    { severity: 'HIGH', issue: 'ACTIVE SIBLING FILE CONFLICT: SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A (status=active, phase=EXEC, commit aa3ca9abd10) is editing lib/eva/quality-findings/finding-shape.js WARN_CAPPED_CATEGORIES, sd-generator.js, the stage-20-experience-warn-cap test, and adding a venture_quality_findings category CHECK-constraint migration - the exact validation and write path the -D annex run traverses, against the same venture (AltifyAI), in the same window.', recommendation: 'M5: rebase on the -A merged state and re-read WARN_CAPPED_CATEGORIES plus the live CHECK constraint at run time, not plan time.' },
  ],
  warnings: [
    { severity: 'HIGH', issue: 'Item 5 venture_stages migration is NOT confirmed non-chairman-gated; database/chairman-gated/20260913_venture_stages_is_high_consequence_stage24.sql is a same-day precedent and the SD own RISKS field already anticipates a ceremony packet.', recommendation: 'M3: PLAN reads the file against the chairman-gated classifier; the apply rides a ceremony packet, never a worker apply.' },
    { severity: 'HIGH', issue: 'Stage 15 metadata has NO gates key today (only metrics, stage_timeout_ms). A naive metadata assignment would destroy stage 15 metrics and timeout config.', recommendation: 'Use jsonb_set or || preserving metrics and stage_timeout_ms; assert post-apply that metadata->gates->exit is still absent.' },
    { severity: 'MEDIUM', issue: 'venture_experience_review_runs ships with no ENABLE ROW LEVEL SECURITY and no GRANT/REVOKE; repo precedent (chairman-gated 20260818_venture_stage_work_drop_public_select.sql) treats public-select on venture-stage tables as chairman-gated.', recommendation: 'M4: add RLS + explicit grants + a companion _rollback.sql + the approval header before apply.' },
    { severity: 'MEDIUM', issue: 'ZERO OBSERVATION YIELD: all 10 ventures at stage 15 are status=cancelled, zero active. The (15, design fidelity reviewed) bind criterion needs >=25 EXIT_GATE_OBSERVE_ONLY rows over >=48h and will stay at 0 indefinitely.', recommendation: 'Register it as an acknowledged inert placeholder, not an accruing instrument.' },
    { severity: 'MEDIUM', issue: 'A head:true count probe returned a FALSE exists (count:null, error:null) for the absent venture_experience_review_runs table during this very assessment.', recommendation: 'Use a real non-head select (PGRST205) for existence; in the gauge, throw on error AND on a non-finite count per wind-down-recurrence-check.mjs:22-30.' },
    { severity: 'MEDIUM', issue: 'GAUGE FALSE-ALARM: an unfiltered gte(current_lifecycle_stage,20) qualifies 56 ventures, 54 of them status=cancelled e2e/TEST-HARNESS fixtures that will never have a review run - the gauge would trip permanently from hour one.', recommendation: 'Filter status=active and consider excluding __e2e_ / TEST- name prefixes; unit-test that the 54 fixtures do not qualify and that one covered venture does not clear an uncovered one.' },
    { severity: 'MEDIUM', issue: 'SCOPE EXPANSION beyond the SD DB-recorded scope: the CLI wrapper, the verifyDesignFidelityReviewed verifier and the venture_stages stage-15 migration are not in C3.1/C3.2/X3. The DB scope also names TWO experience-review migrations; only ONE exists in the repo.', recommendation: 'M6: record the LEAD reframe (the annex-path substitution is endorsed as de-risking) and resolve the one-vs-two migration discrepancy in the LEAD-TO-PLAN handoff. Ratification 4730357d: a narrow factory correction, not a new framework.' },
    { severity: 'LOW', issue: 'persistWireframeFidelity UPDATE branch overwrites stitch_qa_report metadata in place with NO version bump (no prior-value audit trail). Safe today only because AltifyAI has no stitch_qa_report, so the INSERT branch would be taken.', recommendation: 'The one-shot CLI must call scoreWireframeFidelity directly, never iterateUntilPass (which re-scores and re-persists 3+ times).' },
    { severity: 'LOW', issue: 'resolveVerifier uses first-match-wins SUBSTRING matching over an ordered array. The string design fidelity reviewed shares no substring with any of the 22 existing keys in either direction.', recommendation: 'Append the new GATE_VERIFIERS entry at the END of the array so shadowing is impossible by construction.' },
  ],
  recommendations: [
    'M1 (BLOCKING): descope items 3+4 to the C3.2 registration, or produce a real stitch_design_export artifact for AltifyAI first.',
    'M2 (BLOCKING): rewrite the X3 gauge as per-venture coverage over status=active ventures; tri-state alarmed/clear/inapplicable; fail-loud on a non-finite count.',
    'M3: treat the stage-15 venture_stages migration as chairman-gated until PLAN proves otherwise; jsonb-merge preserving metrics/stage_timeout_ms; assert gates.exit stays absent.',
    'M4: add RLS + grants + rollback + approval header to 20260828_venture_experience_review_runs.sql before apply.',
    'M5 (BLOCKING): rebase on sibling -A finding-shape.js + the venture_quality_findings CHECK migration before running the annex against AltifyAI.',
    'M6: record the LEAD scope reframe and the one-vs-two migration discrepancy in the LEAD-TO-PLAN handoff.',
  ],
  execution_time_ms: 0,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_UUID,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'RISK',
  fallback: 'EHG_Engineer',
  supabase,
});
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: true });

const stored = await storeSubAgentResults(
  'RISK',
  SD_UUID,
  { id: null, code: 'RISK', name: 'Risk Assessment Sub-Agent' },
  results,
  { sdKey: SD_KEY, phase: 'LEAD' },
);

console.log('STORED:', JSON.stringify(stored, null, 2).slice(0, 1200));

const { data: row, error } = await supabase
  .from('sub_agent_execution_results')
  .select('id, sub_agent_code, sd_id, verdict, confidence, created_at, metadata')
  .eq('sd_id', SD_UUID).eq('sub_agent_code', 'RISK')
  .order('created_at', { ascending: false }).limit(1).maybeSingle();
console.log('READBACK:', error ? error.message : JSON.stringify({
  id: row?.id, verdict: row?.verdict, confidence: row?.confidence, created_at: row?.created_at,
  repo_path: row?.metadata?.repo_path, executed_from_cwd: row?.metadata?.executed_from_cwd,
  phase: row?.metadata?.phase, overall_risk: row?.metadata?.overall_risk,
}, null, 2));
