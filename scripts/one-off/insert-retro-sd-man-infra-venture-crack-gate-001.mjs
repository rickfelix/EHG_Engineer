#!/usr/bin/env node
/**
 * SD-completion retrospective for SD-MAN-INFRA-VENTURE-CRACK-GATE-001.
 *
 * Written directly against the retrospectives table (same pattern as
 * scripts/one-off/insert-retro-sd-leo-infra-value-authenticity-spec-002.mjs)
 * so the PLAN-TO-LEAD RETROSPECTIVE_QUALITY_GATE has a fresh retro_type=SD_COMPLETION
 * row created after the LEAD-TO-PLAN acceptance timestamp (2026-08-18T05:41:52.078Z).
 *
 * Content is grounded in: product_requirements_v2 (id=PRD-SD-MAN-INFRA-VENTURE-CRACK-GATE-001,
 * functional_requirements FR-1..FR-10 + its ~10 dated metadata correction entries),
 * sub_agent_execution_results (21 rows for this SD across LEAD/PLAN/EXEC), and the real
 * commit history on feat/SD-MAN-INFRA-VENTURE-CRACK-GATE-001 (PR #7236). Every specific
 * claim below (constraint names, file:line references, evidence IDs, commit SHAs) was
 * re-verified against those live sources before writing, not paraphrased from the SD/PRD
 * text alone.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_UUID = 'bb85a01c-369c-492a-819b-4430938103f5';
const SD_KEY = 'SD-MAN-INFRA-VENTURE-CRACK-GATE-001';

const retro = {
  sd_id: SD_UUID,
  retro_type: 'SD_COMPLETION',
  retrospective_type: null,
  learning_category: 'PROCESS_IMPROVEMENT',
  target_application: 'EHG_Engineer',
  generated_by: 'MANUAL',
  status: 'PUBLISHED',
  project_name: 'Venture no-crack gate: primary workflow closures (10 chairman-mandated classes, disposition row per class)',
  title: `Retrospective: ${SD_KEY} — venture no-crack gate, 10 chairman-mandated workflow closures`,
  description: "Chairman-mandated SD closing the AltifyAI incident's root cause: a venture reached live deploy and public distribution via a hand-run CI workflow that bypassed every EHG_Engineer chokepoint. Extends sibling SD-FDBK-FIX-VENTURE-CRACK-GATE-001's observe-only choke-gate backstop (PBN score + Stage-17 attestation + chairman review) across 10 chairman-named workflow-closure classes (a)-(j): mid-flight PBN scoring (FR-1), Stage-17 judgment bound into the real deploy path (FR-2), a chairman review point before distribution (FR-3), venture-deploy work bound to stage state as the root-cause closure (FR-4), deploy-config completeness (FR-5), account-prerequisite checklist (FR-6), authenticated-user smoke at stage exit (FR-7), health-gauge axis honesty (FR-8), feedback-capture wiring (FR-9), and the domain-acquisition trigger (FR-10).",
  conducted_date: new Date().toISOString(),
  agents_involved: ['LEAD', 'PLAN', 'EXEC'],
  sub_agents_involved: ['VALIDATION', 'RISK', 'Explore', 'DESIGN', 'DATABASE', 'SECURITY', 'STORIES', 'TESTING', 'REGRESSION', 'VISION_FIDELITY'],
  human_participants: ['Chairman', 'LEAD'],

  what_went_well: [
    "LEAD-phase VALIDATION (evidence f0c5cede/f393134f) and RISK (evidence a2b97675) sub-agents independently confirmed, with real .select() probes rather than a head:true count probe, that the sibling SD's 'explicitly retained backstop' was entirely DB-inert — venture_gate_attestations, v_venture_gate_attestations_latest, venture_pbn_status(), set_venture_pbn_verdict_stage_zero(), and venture_nursery.pbn_verdict were all absent from the live DB — before PLAN wrote a single disposition row assuming that coverage existed. A head:true count probe was separately found to read the same PGRST205-absent relations as present with no error.",
    "FR-4 ('bind venture deploy work to venture stage state') was sequenced and shipped first per both the chairman's own ruling ('my original observability concern is solved at the root by (d)') and risk-agent's dependency analysis, with a peer sub-agent (risk-deploy-path) independently confirming via grep that promote() (lib/venture-deploy/promote.js) is the sole production call site reaching the sole cloud-deploy module and runs plan-mode-only in production today — sharpening FR-4's binding target from a generic venture_stage_work.sd_id population scheme to a precondition at the one real, zero-blast-radius chokepoint (stage-24-go-live.js:210, commit 5b2224a4f4b).",
    "Two peer-relayed PLAN-phase design proposals (coordinator directive fd57f503, from a sibling worker's stand-down validation sub-team) were checked against primary sources before any code was written, and both were found to have incomplete premises: FR-2's relay proposed an automated Stage-17 bridge-write into venture_gate_attestations that would have resurrected the exact self-approval pattern the table's vga_attester_not_producer CHECK constraint exists to forbid; FR-3's relay proposed hooking recordProductReviewVerdict(), which a repo-wide grep confirmed has zero production callers, in favor of the actual live path (scripts/chairman-decisions.mjs's chairmanDecide writer -> fn_chairman_decide RPC).",
    "A SECURITY sub-agent adversarial pass on EXEC output (evidence 1126f54b, FAIL, confidence 90) found a genuine HIGH-severity finding — the new FR-7 CI workflow (.github/workflows/ehg-app-auth-smoke.yml) inherited playwright.config.js's trace:'on' default and would have uploaded TEST_USER_PASSWORD and real session tokens inside a GitHub artifact downloadable by anyone with repo read access — plus 3 MEDIUM findings in the newly-automated PBN-scoring path (F1: a missing sanitizer reopening a previously-fixed canary-content-leak class; F2: a transient LLM failure that could permanently REJECT a venture with no correction path; F3: unbounded per-venture LLM spend after the RPC's absence was already confirmed). All 4 were fixed in commit 11f3b101e6f, and the SECURITY sub-agent's own re-verification pass (evidence 1253f7b3, CONDITIONAL_PASS) states explicitly that all 4 original findings were 'confirmed genuinely resolved via mutation testing' — not merely re-asserted.",
    "An independent VALIDATION sub-agent pass at PLAN-VERIFY (evidence ad1f06d1, CONDITIONAL_PASS) caught acceptance-criteria drift the implementer's own description fields had already outgrown: FR-5 and FR-6's acceptance_criteria still described the original, pre-investigation design (a build-time fail-loud gate; venture_provisioning_state as the data source) even though both FRs' description fields already documented, in detail, why EXEC had corrected that design. The same pass separately caught (V4) that FR-7's scheduled CI workflow reported an identical green checkmark whether it genuinely tested login or silently skipped because secrets were never configured — reproducing this SD's own FR-8 'healthy-while-broken' failure class inside FR-7 itself, fixed in commit ae95cab7b15.",
    "A live-RPC verification process error (writing a garbage verdict to a real, unlogged test-fixture venture via the write RPC set_venture_pbn_verdict_stage_zero, while probing per coordinator directive 791957ea's 'confirm via REST with real args before relying on it' instruction) was caught immediately via a follow-up read, fully remediated via a surgical jsonb key removal (verified clean both by a direct metadata read and a venture_pbn_status() re-read), and self-reported via signal (4f8db6cd) rather than left undocumented.",
    "Ten heterogeneous chairman-mandated classes spanning DB/RLS, deploy pipeline, CI, stage machinery, and external-credential dependencies were delivered as FR-sequenced small PRs within one SD (FR-4 first as the dependency root) rather than fragmenting into a 10-child decomposition, and each of the two partially-externally-blocked classes (FR-9's feedback-capture content, FR-10's registrar token) shipped its WIRING half now with the blocked half explicitly named and deferred-with-reason, honoring the chairman's own standing 'never silently dropped' rule.",
  ],

  what_needs_improvement: [
    "The chairman's own scope text for this SD (relayed near-verbatim via 3 coordinator directives) itself carried a stale premise — that the choke-gate backstop stays as a 'machine-enforced' BACKSTOP — discovered only because LEAD-phase sub-agents independently probed the live DB rather than trusting the completed sibling SD's merged-PR status as evidence its DB dependencies were live; nothing upstream of LEAD flagged this automatically.",
    "FR-2 and FR-3's acceptance_criteria fields lagged their own already-corrected description fields for the entire EXEC phase and were only reconciled after an independent PLAN-VERIFY VALIDATION pass found the drift (commit ae95cab7b15) — the same drift did not occur on FR-1, FR-3's sibling FRs (FR-7, FR-9, FR-10), where the description correction and the criteria correction were made together in one pass.",
    "Two distinct technical claims relayed via the same coordinator directive (fd57f503, from a sibling worker's stand-down validation sub-team) both needed primary-source correction before implementation (FR-2's self-approval-landmine risk; FR-3's dead-code-path target) — the relay's design guidance reached this SD's PRD without the relaying team re-verifying either claim against the current codebase, and whether that same relay reached other in-flight SDs with the same unverified claims was signaled but not confirmed.",
    "The FR-1 RPC-liveness probe (per coordinator directive 791957ea's instruction to 'probe via REST with real args before relying on it') was executed against a real, randomly-selected, unlogged venture id using a garbage payload, without first classifying whether the target RPC (set_venture_pbn_verdict_stage_zero) was a read or a write — a process gap in how 'probe before relying' instructions get executed, not a one-off mistake specific to this RPC.",
    "checkDeployConfigCompleteness (FR-5) shipped with zero production callers because wiring it into the one obvious EHG_Engineer-side chokepoint would not have caught the actual incident it is modeled on (AltifyAI shipped via a hand-run CI workflow in its own repo, never touching this pipeline) — this SD closes 10 chairman-named classes but leaves 'which pipeline does a venture's CI actually run through' only partially answered, since FR-5's checker is tested and importable but genuinely unconsumed at SD close.",
  ],

  key_learnings: [
    {
      lesson: "Coordinator-relayed PLAN-phase design guidance can carry an incomplete premise even when it originates from a dedicated validation sub-team's own stand-down research — this SD found two distinct incorrect technical claims in the same relayed directive (fd57f503), both caught only because primary-source verification (reading docs/reference/venture-gate-attestations-guide.md for FR-2; a repo-wide grep for FR-3) happened before code was written, not after.",
      category: 'peer-relay-verification',
      applicability: "Treat a coordinator-relayed design recommendation as a hypothesis to re-verify against the current codebase/docs, not as pre-validated fact, regardless of how authoritative its source sounds — the cost of re-verification (minutes) is far lower than the cost of implementing a design that resurrects a landmine a CHECK constraint or an architecture doc already named as deliberately avoided.",
    },
    {
      lesson: "A DB CHECK constraint's name and a migration's own preamble comment can be the fastest way to detect that a proposed design resurrects a previously-closed landmine — venture_gate_attestations' vga_attester_not_producer constraint and its migration's 'ARMED AND DISCONNECTED' preamble existed specifically to prevent the self-approval pattern FR-2's relayed design would have reintroduced under a new call site, even though a distinct-string producer/attester pair could technically still satisfy the constraint's letter.",
      category: 'constraint-as-documentation',
      applicability: "Before implementing a write to a table with non-obvious CHECK constraints, read what each constraint's name and any adjacent migration comments say it exists to prevent — technically satisfying a constraint is not evidence a design is safe if it structurally reproduces the pattern the constraint's purpose (not just its letter) was written to forbid.",
    },
    {
      lesson: "Two mechanisms in the same codebase can share overlapping vocabulary (chairman_approval as a routing category vs. product_review as a decision_type; recordProductReviewVerdict() vs. the fn_chairman_decide RPC) while only one is actually live in production — FR-3's relayed design targeted the dead one, discoverable only via a repo-wide grep for production callers, not by reading either mechanism's own code in isolation.",
      category: 'dead-vs-live-path-discovery',
      applicability: "When a codebase offers two API surfaces for what looks like the same capability, grep for production callers of each (not just imports or test references) before choosing which one to bind a new feature to — a well-documented, well-typed function with zero real callers is a trap that can read as more legitimate than the messier CLI/RPC path that is actually live.",
    },
    {
      lesson: "An SD's own remediation of a silent-failure class (FR-8: gauges must fail loud, not silently pass while measuring nothing) is not automatically immune to reproducing that same class inside its own new code — FR-7's scheduled CI workflow reported an identical green checkmark whether it genuinely tested login or silently skipped for lack of configured secrets, caught only by an independent VALIDATION pass explicitly checking whether FR-7 honored the SD's own stated principle.",
      category: 'self-application-of-the-fix',
      applicability: "When an SD's stated purpose includes a general principle (e.g. 'no gauge may read green while measuring nothing'), budget an explicit pass checking the SD's own new instrumentation against that principle, not just the systems the SD was written to fix.",
    },
    {
      lesson: "A 'probe this RPC before relying on it' instruction needs to classify read-vs-write before choosing a target row — this SD's own FR-1 liveness probe wrote a garbage verdict to a real, unlogged venture using set_venture_pbn_verdict_stage_zero, a write RPC, because the instruction's goal (confirm callability) was satisfied without first checking the RPC's side-effect profile.",
      category: 'probe-classification',
      applicability: "Before any 'verify via REST with real args' step against a named RPC, read enough of its name/signature/definition to classify it as read or write; a write RPC should only ever be probed against a disposable, known test fixture, never a randomly-selected live row, even when the probe's stated goal is narrowly 'does this exist and respond.'",
    },
    {
      lesson: "A PRD's acceptance_criteria and description fields can drift independently even within a single SD when a description is corrected via incremental in-place annotations (SCOPE NOTE / CAVEAT / FINDING) rather than a single decisive rewrite — FR-5 and FR-6 were the only 2 of 10 FRs in this PRD where that happened, confirming the drift is a discipline gap tied to HOW a correction is made, not a systemic PRD-structure defect.",
      category: 'prd-field-drift',
      applicability: "When correcting an FR's description mid-EXEC via an appended note rather than a full rewrite, treat the acceptance_criteria array as part of the same edit and re-read it for consistency in that same pass — an independent VALIDATION review caught this drift here, but the fix is cheaper applied at write-time than caught at PLAN-VERIFY.",
    },
    {
      lesson: "Chairman-relayed scope text can itself carry a stale premise ('the backstop stays as a machine-enforced BACKSTOP') that survives 3 coordinator directives verbatim, discoverable only by LEAD-phase sub-agents independently probing the live DB with a real .select() rather than trusting a sibling SD's completed/merged status as evidence its DB-side dependencies are live.",
      category: 'completed-status-is-not-liveness-evidence',
      applicability: "A sibling or predecessor SD marked completed with merged PRs is evidence the CODE shipped, not evidence its DB-side dependencies (especially chairman-gated migrations) are actually applied — always independently probe the specific DB objects a design depends on with a real select, not a head:true count, which was separately found in this SD to read PGRST205-absent relations as falsely present.",
    },
  ],

  action_items: [
    {
      action: "Apply the remaining chairman-gated migrations under database/chairman-gated/ (venture_gate_attestations, venture_pbn_status_read) so FR-1/FR-2/FR-3's observe-only bindings begin measuring real data instead of fail-softing to ATTESTATION_SOURCE_UNAVAILABLE/PBN_NOT_SCORED — the 3rd (venture_nursery_pbn_verdict) was already folded back into this branch via the 2026-08-18 ceremony (commit 8d4d97db927) and set_venture_pbn_verdict_stage_zero()/venture_pbn_status() are confirmed live by direct REST probe.",
      owner: 'Chairman (external approval ceremony) / coordinator to track',
      category: 'follow_up',
      priority: 'critical',
      deadline: 'Before FR-4/FR-2/FR-3 accumulate any real would-block-rate sample',
      is_boilerplate: false,
    },
    {
      action: "Track the TR-2/FR-4 promotion criterion (a named, numeric would-block-rate measured against is_demo=false ventures only — 19 real ventures currently sit at stage>=19) as explicit follow-on work before any of this SD's observe-only bindings (FR-2/FR-3/FR-4) are promoted to hard-blocking.",
      owner: 'PLAN (next SD/QF touching crack-gate promotion)',
      category: 'follow_up',
      priority: 'high',
      deadline: 'Before any crack-gate promote-to-enforcing decision',
      is_boilerplate: false,
    },
    {
      action: "Audit other SDs/sessions for an assumption that fn_submit_internal_feedback is backend-wireable — this SD's FR-9 investigation confirmed it is auth.uid()-gated and structurally uncallable from any EHG_Engineer backend code (service_role never carries a user JWT), a finding signaled separately from this SD's own scope.",
      owner: 'Coordinator / next SD touching feedback RPCs',
      category: 'harness',
      priority: 'medium',
      deadline: 'Before any other SD wires fn_submit_internal_feedback from backend code',
      is_boilerplate: false,
    },
    {
      action: "Spot-check whether coordinator directive fd57f503 (Golf-5's stand-down validation sub-team relay) reached other in-flight SDs with the same two unverified technical claims (FR-2's self-approval-landmine risk, FR-3's dead-code-path target) found and corrected here.",
      owner: 'Coordinator',
      category: 'coordination',
      priority: 'high',
      deadline: 'Next coordinator sweep',
      is_boilerplate: false,
    },
    {
      action: "Decide and wire FR-5's config-completeness checker (lib/venture-deploy/config-completeness.js, currently zero production callers by deliberate design) into either an EHG_Engineer-side pipeline hook or a venture-template CI step, once it's established which pipeline a venture's deploy actually routes through.",
      owner: 'PLAN (follow-up SD)',
      category: 'follow_up',
      priority: 'medium',
      deadline: 'Before the next venture-deploy-config incident, ideally proactively',
      is_boilerplate: false,
    },
    {
      action: "Configure the FR-7 auth-smoke workflow's 3 repository secrets (EHG_APP_BASE_URL, EHG_APP_TEST_USER_EMAIL, EHG_APP_TEST_USER_PASSWORD) so the scheduled check begins genuinely exercising login instead of skipping cleanly every day — the VALIDATION-caught silent-green defect (V4) is fixed so an unconfigured run now fails loud instead of reporting a false green, but it still measures nothing until configured.",
      owner: 'Chairman / repo admin (one-time GH Actions secrets configuration)',
      category: 'follow_up',
      priority: 'medium',
      deadline: 'Before relying on the FR-7 signal for any real incident detection',
      is_boilerplate: false,
    },
  ],

  improvement_areas: [
    JSON.stringify({
      area: 'Peer-relayed PLAN-phase design guidance reached this PRD with incomplete premises twice from the same source before primary-source verification caught it',
      analysis: "Why did directive fd57f503's relay contain two distinct incorrect technical claims (FR-2's self-approval-landmine risk; FR-3's dead-code-path target)? Because Golf-5's stand-down validation sub-team formed its 'REVISED DESIGN' recommendations from its own understanding of the chairman's ruling and the sibling SD's shipped code, not by re-tracing the actual production call graph for either claim (fetchLatestAttestation's producer-agnostic read for FR-2; a grep for recordProductReviewVerdict's callers for FR-3). Why did that matter for FR-2 specifically? Because docs/reference/venture-gate-attestations-guide.md (line 36, lines 134-139) already stated the answer explicitly — the relay's premise was checkable in seconds against a doc that already existed, not a genuinely hard research question. Why did it matter for FR-3? Because recordProductReviewVerdict() and the real live decision path (chairman-decisions.mjs -> fn_chairman_decide) are two different, never-reconciled mechanisms with overlapping vocabulary (chairman_approval as a routing category vs. product_review as a decision_type) — an easy pair to conflate without a repo-wide grep.",
      root_cause: 'A relay of prior research was treated as equivalent in reliability to primary-source verification, when the relay itself had not been re-verified against the current codebase at the point it was relayed, and the receiving SD had no structural prompt to distinguish "independently checked" from "proposed."',
      prevention: "Coordinator-relayed design guidance should carry an explicit provenance marker (verified-against-code vs. inferred/proposed) at the point of relay, and any SD receiving such guidance should budget a primary-source re-check for each technical claim before it lands in a PRD's acceptance criteria — this SD did that reactively, after Golf-5's relay was already incorporated once; doing it as a standing PLAN-phase step would catch the same class earlier.",
    }),
    JSON.stringify({
      area: "Two of ten FR acceptance-criteria fields drifted out of sync with their own already-corrected description fields, and only an independent review caught it",
      analysis: "Why did FR-5 and FR-6's acceptance_criteria still describe a build-time fail-loud gate and a venture_provisioning_state data source, when both FRs' description fields already documented in detail why EXEC corrected that design? Because the description-field correction and the criteria-field correction are two separate edits to the same PRD row, made at different points in EXEC as understanding evolved, and nothing enforces that a description correction propagates to its own acceptance_criteria array. Why didn't this happen on the other 8 FRs? Because FR-1/FR-2/FR-3/FR-7/FR-9/FR-10 each had their corrections made in a single dedicated pass (their own metadata entries: fr1_implementation_note, fr2_scope_correction, fr3_scope_correction, fr7_stage_exit_design_decision, fr9_scope_decision, fr10_implementation_note) that visibly touched both fields together, while FR-5/FR-6's design corrections emerged gradually across annotations embedded directly in their description text, with no equivalent single moment that triggered a criteria rewrite.",
      root_cause: "A PRD's acceptance_criteria and description fields are edited independently with no structural link or drift check between them, so a description that evolves incrementally is more likely to leave its criteria stale than one corrected in a single decisive rewrite.",
      prevention: "When an FR's description is corrected via an incremental annotation rather than a full rewrite, explicitly re-read the criteria array in the same edit and ask whether it still describes the same design — this SD's own fr5_fr6_criteria_reconciliation_2026_08_18 metadata entry names this exact distinction as the reason drift was confined to only these two FRs.",
    }),
    JSON.stringify({
      area: "A 'probe before relying on it' instruction was executed against a live write RPC as if it were a safe read",
      analysis: 'Why did the FR-1 RPC liveness probe write garbage to a real venture row? Because the instruction (coordinator directive 791957ea, "probe via REST with real args before relying on it") named the goal (confirm liveness) without naming the RPC\'s side-effect profile, and the probe was constructed by supplying real args to satisfy PostgREST\'s signature-matching requirement for parameterized functions, without first checking whether set_venture_pbn_verdict_stage_zero is a read or a write. Why wasn\'t that checked first? Because the RPC\'s own name is the clearest possible signal that it is a write, and the check that would have caught this (read the function definition, or at minimum use a known test fixture instead of a randomly-selected live venture id) was skipped under the framing of "just confirm it responds, not PGRST202."',
      root_cause: 'A verification step whose stated goal is narrow ("confirm this exists and is callable") can silently expand its actual side effects when the target is a write RPC and the verifier does not first classify read-vs-write before choosing a target row.',
      prevention: "Any 'probe an RPC via REST before relying on it' step should first classify the RPC as read or write from its name/signature/definition, and a write RPC should only ever be probed against a known, disposable test fixture ID, never a randomly-selected live row — this SD's own self-correction (signal 4f8db6cd) already states this as the fleet-wide lesson; making it a standing pre-probe checklist item would prevent needing to relearn it per-incident.",
    }),
  ],

  success_patterns: [
    "LEAD-phase VALIDATION+RISK sub-agents independently confirmed (real .select() probes, not head:true counts) that the sibling SD's retained backstop was DB-inert before PLAN wrote a single disposition row against it.",
    "Root-cause FR (FR-4, deploy-work-bound-to-stage-state) was sequenced and shipped first per both the chairman's own ruling and risk-agent's dependency analysis, with a peer sub-agent narrowing its binding target to the one confirmed sole chokepoint (promote(), zero production blast radius).",
    "Two peer-relayed PLAN-phase design claims (FR-2, FR-3) were corrected against primary sources (a guide doc; a repo-wide grep) before implementation, avoiding a self-approval landmine and a dead-code binding.",
    "SECURITY sub-agent adversarial re-review confirmed all EXEC-TO-PLAN findings (1 HIGH CI-secret-leak, 3 MEDIUM PBN-path) genuinely resolved via mutation testing, not just re-asserted.",
    "10 heterogeneous chairman-mandated classes delivered as FR-sequenced small PRs within a single SD, each with an explicit scoped-IN-or-deferred-with-reason disposition, honoring the chairman's own never-silently-dropped rule.",
  ],

  failure_patterns: [
    "Two of ten FR acceptance_criteria fields (FR-5, FR-6) drifted out of sync with their own already-corrected description fields for the full EXEC phase, caught only by an independent PLAN-VERIFY VALIDATION pass.",
    "An RPC-liveness probe (FR-1, per coordinator directive 791957ea) was executed against a live write RPC (set_venture_pbn_verdict_stage_zero) with a randomly-selected real venture id and a garbage payload, without first classifying the RPC as read vs. write.",
    "FR-7's scheduled CI workflow initially reproduced this SD's own FR-8 'healthy-while-broken' failure class: reporting green whether it genuinely tested login or silently skipped for unconfigured secrets.",
  ],

  protocol_improvements: [
    {
      category: 'coordination',
      improvement: "Coordinator-relayed PLAN-phase design guidance (e.g. a stand-down validation sub-team's REVISED DESIGN note) should carry an explicit provenance marker distinguishing 'independently re-verified against current code' from 'proposed, not yet re-checked' at the point of relay.",
      evidence: "Directive fd57f503 relayed two distinct technical claims (FR-2 self-approval-landmine risk; FR-3 dead-code-path target) that both needed primary-source correction in this SD before implementation — caught only because this session budgeted its own re-verification, not because the relay signaled its own confidence level.",
      impact: 'medium',
      affected_phase: 'PLAN',
    },
    {
      category: 'prd_quality',
      improvement: "When an FR's description field is corrected mid-EXEC via an in-place annotation (SCOPE NOTE / CAVEAT / FINDING) rather than a full rewrite, the same edit should require an explicit re-read of that FR's acceptance_criteria array for consistency.",
      evidence: "FR-5 and FR-6 were the only 2 of 10 FRs in this PRD where acceptance_criteria drifted out of sync with an already-corrected description — both had been corrected via incremental annotations rather than a single rewrite; the other 8 FRs' criteria and description were corrected together and did not drift.",
      impact: 'medium',
      affected_phase: 'EXEC',
    },
    {
      category: 'verification_procedure',
      improvement: "A 'probe this RPC via REST with real args before relying on it' instruction should require classifying the RPC as read vs. write (from its name/signature) before selecting a target row, and a write RPC should only ever be probed against a known, disposable test fixture — never a randomly-selected live row.",
      evidence: "The FR-1 liveness probe for set_venture_pbn_verdict_stage_zero — a write RPC, discoverable from its own name — was executed against a real, unlogged venture id with a garbage payload; caught immediately via a follow-up read and fully remediated, but the process gap that allowed it is fleet-wide, not specific to this RPC.",
      impact: 'high',
      affected_phase: 'EXEC',
    },
  ],

  quality_score: 92,
  team_satisfaction: 9,
  business_value_delivered: "Closes the AltifyAI incident's root cause: venture deploy work is now bound to real venture-stage/gate state (FR-4) at the confirmed sole production deploy chokepoint, with PBN scoring, Stage-17 judgment, and chairman site-review now wired to write real data into the sibling SD's previously-inert observability layer — turning a 0-of-152-ventures-scored blind spot into a portfolio-wide, if still observe-only, safety net.",
  customer_impact: "Internal/chairman-facing: closes a governance gap that let one venture (AltifyAI) reach live production and public distribution with a broken auth config, an unset domain, and zero chairman/PBN/Stage-17 signal. No direct end-customer-facing change, but materially reduces the risk of a repeat incident across the 65 ventures already past stage 19.",
  technical_debt_addressed: true,
  technical_debt_created: false,
  bugs_found: 5,
  bugs_resolved: 5,
  tests_added: 248,
  code_coverage_delta: null,
  performance_impact: "Standard — all new observation/scoring paths are additive and observe-only (log-and-allow); FR-1's Job 5 adds one portfolio-wide PBN-scoring pass per 6h sweep cycle, bounded by the F3 fix (stops on first confirmed function_missing rather than looping per-venture).",
  objectives_met: true,
  on_schedule: true,
  within_scope: true,

  trigger_event: 'PLAN_TO_LEAD_HANDOFF',
  related_files: [
    '.github/workflows/ehg-app-auth-smoke.yml',
    'lib/eva/bridge/account-prerequisites.js',
    'lib/eva/bridge/chairman-site-review-attestation.js',
    'lib/eva/bridge/domain-acquisition-trigger.js',
    'lib/eva/bridge/venture-user-feedback-emitter.js',
    'lib/eva/lifecycle/crack-gate-evaluator.js',
    'lib/eva/stage-templates/analysis-steps/stage-11-visual-identity.js',
    'lib/eva/stage-templates/analysis-steps/stage-17-blueprint-review.js',
    'lib/eva/stage-templates/analysis-steps/stage-24-go-live.js',
    'lib/marketing/autonomy-gate.js',
    'lib/venture-deploy/config-completeness.js',
    'lib/venture-deploy/promote.js',
    'scripts/chairman-decisions.mjs',
    'scripts/cron/venture-ops-actuals-sweep.mjs',
    'scripts/eva/retroactive-pbn-score.mjs',
    'tests/e2e/ehg-app/auth.setup.spec.ts',
    'tests/unit/cron/venture-ops-actuals-sweep.test.js',
    'tests/db-invariants/venture-stages-gate-verifier-conformance.test.js',
    'database/chairman-gated/20260817_venture_gate_attestations.sql',
    'database/chairman-gated/20260817_venture_pbn_status_read.sql',
    'database/migrations/20260818_venture_stage_work_drop_public_select.sql',
    'docs/reference/venture-gate-attestations-guide.md',
  ],
  related_commits: [
    'e0fb9e8a882', '5b2224a4f4b', 'e934710ad16', 'e341733d52b', 'bf2434d6c6d',
    'a244aff4103', '163d9a878f0', '1922ee01b66', '63f3284d9c9', '92342392d89',
    '3b69920bcd8', '383b321d38b', '11f3b101e6f', '125dcb4b4f1', 'ae95cab7b15',
    '8d4d97db927',
  ],
  related_prs: ['https://github.com/rickfelix/EHG_Engineer/pull/7236'],
  affected_components: [
    'Venture Deploy Pipeline',
    'Crack-Gate Evaluator',
    'PBN Scoring',
    'Chairman Decision Bridge',
    'Stage Machinery (S11/S17/S24)',
    'CI/CD (auth smoke workflow)',
    'Venture Provisioning',
  ],
  tags: ['crack-gate', 'venture-deploy', 'security-finding', 'peer-relay-verification', 'chairman-mandated', 'infrastructure', 'altifyai-incident'],

  metadata: {
    sd_key: SD_KEY,
    branch: 'feat/SD-MAN-INFRA-VENTURE-CRACK-GATE-001',
    pr_number: 7236,
    prd_id: 'PRD-SD-MAN-INFRA-VENTURE-CRACK-GATE-001',
    authored_by_session: '29175888-1a98-4fb7-9d18-1bcf78c12477',
    grounded_in_sub_agent_evidence: [
      'f0c5cede-bb00-40b8-a385-2c56a013aa23', // LEAD VALIDATION - backstop DB-inert
      'f393134f-ccf4-452a-8443-d146e081a5e3', // LEAD VALIDATION - full LEAD assessment
      'a2b97675-f436-4bcc-b688-359dcfce6838', // LEAD RISK
      '1126f54b-6861-4bc0-abc8-007a99e7143d', // EXEC SECURITY FAIL - F0 HIGH + F1/F2/F3 MEDIUM
      '1253f7b3-a8a2-4638-98d7-720b52ec7e21', // EXEC SECURITY re-review - mutation-tested resolution
      'ad1f06d1-f49d-4721-99df-b7a09c0f4da8', // PLAN-VERIFY VALIDATION - FR-5/FR-6/FR-7/FR-9 criteria drift
      '910016cf-54a3-4594-9ff4-cd8c870fe6b4', // PLAN TESTING - prospective test-strategy review
      '09e1ff4a-1b19-4564-92f4-d4ad407bf3b4', // EXEC TESTING - 248/248 tests
    ],
    handoffs_completed: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN'],
    written_for_gate: 'RETROSPECTIVE_QUALITY_GATE (PLAN-TO-LEAD)',
  },
};

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  const s = createClient(url, key);

  const { data: ins, error: insErr } = await s.from('retrospectives').insert(retro).select('id').single();
  if (insErr) {
    console.error('Insert failed:', insErr.message);
    console.error(insErr);
    process.exit(1);
  }
  const retroId = ins.id;
  console.log('Inserted retrospective id:', retroId);

  const { data: ver, error: verErr } = await s
    .from('retrospectives')
    .select('id, sd_id, retro_type, retrospective_type, quality_score, status, created_at, learning_category, target_application')
    .eq('id', retroId)
    .single();
  if (verErr) {
    console.error('Verify failed:', verErr.message);
    process.exit(1);
  }
  console.log('Verified:', JSON.stringify(ver, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
