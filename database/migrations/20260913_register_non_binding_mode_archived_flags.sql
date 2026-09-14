-- 20260913_register_non_binding_mode_archived_flags.sql
-- SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-E (FR-1)
--
-- Venture quality CAPA root-cause class C (pilots without graduation): four
-- non-binding venture-quality mechanisms can gate or score a venture today
-- but are invisible to any governance surface. Two (DESIGN_FIDELITY_GATE_MODE,
-- LEO_THESIS_KILL_GATE) are env-var-only toggles with no DB reader at all; two
-- (WARN_CAPPED_CATEGORIES, VISION_ABSENCE_SEVERITY) are hardcoded JS constants
-- with no on/off state whatsoever. This migration registers all four as
-- honest, DOCUMENTATION-ONLY leo_feature_flags rows -- it does not wire a live
-- DB reader for any of them (that is explicitly out of scope, see the PRD's
-- TR-2) and does not invent an _ENFORCE-style key that no code reads (the
-- PRD's own flag_key is the REAL mechanism identifier).
--
-- lifecycle_state='archived' is chosen deliberately (not 'draft'/'disabled'):
-- migration 20260607's own comment documents 'archived'/'expired' as this
-- repo's mapping for "retired/end-of-life", and lib/feature-flags/
-- governance-review.js's classifyFlag() returns null (healthy, never-stale)
-- immediately for lifecycle_state IN ('archived','expired'), before any
-- staleness branch runs -- so these rows can never be nagged as
-- never-reviewed/disabled-aging/stale-off-pending, with zero classifier code
-- changes. is_enabled=false is required alongside lifecycle_state='archived'
-- by chk_flag_lifecycle_enabled_consistency (CHECK (is_enabled = (lifecycle_state
-- = 'enabled'))).
--
-- This migration is INSERT-only (mirrors the 20260821_register_synthetic_actor_
-- fence_enforce_flag.sql / 20260823_register_path_integrity_flags.sql
-- precedent) and touches no pre-existing row. Item-5-exempt per docs/03_
-- protocols_and_standards/only-the-chairman-can.md (single-batch idempotent
-- INSERT, no ALTER/DROP/UPDATE of any existing row, documented rollback below).
--
-- Idempotent: ON CONFLICT (flag_key) DO NOTHING.
--
-- Rollback:
--   DELETE FROM leo_feature_flags
--    WHERE flag_key IN ('DESIGN_FIDELITY_GATE_MODE', 'LEO_THESIS_KILL_GATE',
--                        'WARN_CAPPED_CATEGORIES', 'VISION_ABSENCE_SEVERITY');

INSERT INTO leo_feature_flags (
  flag_key, display_name, description, is_enabled, lifecycle_state,
  risk_tier, is_temporary, gates_what, enablement_criteria,
  owner_type, owner_id, last_reviewed_at
) VALUES
(
  'DESIGN_FIDELITY_GATE_MODE',
  'Design-Fidelity Gate Mode (observe/bind)',
  'Documentation-only registry entry -- NOT a live DB-governed switch. The real control is the DESIGN_FIDELITY_GATE_MODE environment variable, read by resolveDesignFidelityGateMode() at lib/eva/bridge/customer-facing-design-detector.js:87-89: any value other than the literal string ''bind'' means observe (log a would-reject via lib/eva/bridge/design-fidelity-observe.js, never blocks). This row exists so the mechanism is inventoried, not to govern it.',
  false,
  'archived',
  'low',
  false,
  'Customer-facing design-fidelity review on venture stage advancement (docs/01_architecture/venture-design-fidelity-gate.md)',
  'DOCUMENTATION ONLY -- no live reader. A future SD wiring a real DB-backed reader for this mechanism must deliberately move this row off lifecycle_state=''archived'' via a direct UPDATE (archived has no valid outgoing transition in the existing lifecycle validator, transitionLifecycleState() VALID_TRANSITIONS.archived=[]) as part of that separate work. Until then, this row never changes behavior -- the env var keeps controlling the real gate.',
  'team', 'coordinator', now()
),
(
  'LEO_THESIS_KILL_GATE',
  'Thesis Kill Gate Mode (off/observe/binding)',
  'Documentation-only registry entry -- NOT a live DB-governed switch. The real control is the LEO_THESIS_KILL_GATE environment variable, read via process.env[FLAG_NAME] bracket notation at lib/eva/lifecycle/thesis-kill-gate.js:37-42: default (unset/empty) is ''observe'' -- fired/held verdicts are logged to system_events only, advancement never blocks; only mode=''binding'' can block. This row exists so the mechanism is inventoried, not to govern it.',
  false,
  'archived',
  'low',
  false,
  'Venture thesis-kill verdict evaluation (docs/guides/workflow/cli-venture-lifecycle/reference/kill-gates.md)',
  'DOCUMENTATION ONLY -- no live reader. A future SD wiring a real DB-backed reader for this mechanism must deliberately move this row off lifecycle_state=''archived'' via a direct UPDATE (archived has no valid outgoing transition in the existing lifecycle validator, transitionLifecycleState() VALID_TRANSITIONS.archived=[]) as part of that separate work. Until then, this row never changes behavior -- the env var keeps controlling the real gate.',
  'team', 'coordinator', now()
),
(
  'WARN_CAPPED_CATEGORIES',
  'WARN-Capped Finding Categories (permanent code constant)',
  'Documentation-only registry entry for a PERMANENT CODE-LEVEL CONSTANT with NO on/off state at all -- not a toggle. WARN_CAPPED_CATEGORIES at lib/eva/quality-findings/finding-shape.js:78-82 lists (usability, accessibility, journey_coherence) as categories structurally excluded from the FAIL/WARN verdict scan in computeStage20Verdict() (lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js:694-699) -- findings in these categories are persisted at true severity but can never block a venture. This row exists so the mechanism is inventoried, not to govern it (there is nothing to enable/disable).',
  false,
  'archived',
  'low',
  false,
  'Stage 20 code-quality verdict computation -- severity cap on 3 finding categories',
  'DOCUMENTATION ONLY -- no reader at all, live or otherwise. This is a fixed array in code, not a flag; is_enabled/lifecycle_state carry no operational meaning here beyond keeping this row out of the staleness-nag pipeline. Changing this mechanism requires a code change to finding-shape.js, never a DB write.',
  'team', 'coordinator', now()
),
(
  'VISION_ABSENCE_SEVERITY',
  'Vision-Absence Severity Cap (permanent code constant)',
  'Documentation-only registry entry for a PERMANENT CODE-LEVEL CONSTANT with NO on/off state at all -- not a toggle. VISION_ABSENCE_SEVERITY at lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js:246-249 is a fixed string (currently ''medium'') applied to feedback_widget_present/error_capture_wired absence findings -- medium severity alone never crosses the FAIL threshold in computeStage20Verdict(), so this is non-binding by construction. This row exists so the mechanism is inventoried, not to govern it (there is nothing to enable/disable).',
  false,
  'archived',
  'low',
  false,
  'Stage 20 code-quality verdict computation -- severity assigned to vision-compliance absence findings',
  'DOCUMENTATION ONLY -- no reader at all, live or otherwise. This is a fixed string constant in code, not a flag; is_enabled/lifecycle_state carry no operational meaning here beyond keeping this row out of the staleness-nag pipeline. Changing this mechanism requires a code change to stage-20-code-quality.js, never a DB write.',
  'team', 'coordinator', now()
)
ON CONFLICT (flag_key) DO NOTHING;
