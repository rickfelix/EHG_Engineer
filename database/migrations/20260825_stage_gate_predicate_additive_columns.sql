-- 20260825_stage_gate_predicate_additive_columns.sql
-- SD-LEO-INFRA-STAGE-GATE-PREDICATE-001 (FR-4, FR-5)
--
-- Two additive, nullable columns needed by the new stage-gate predicate
-- (lib/governance/stage-gate-predicate.js):
--
-- chairman_decisions.override_key (FR-4): chairman_decisions already has undo_deadline
-- and consumed_at (TTL-like columns) but no per-ACTION scoping column -- a chairman
-- override for this predicate must target ONE specific gated action, not a venture or
-- component in general (chairman_decisions.venture_id already exists but is the
-- wrong grain for "override this one action's stage-gate block").
--
-- NAMED override_key, NOT sd_key (corrected during EXEC, TESTING finding): the only
-- 2 call sites actually wired in this SD's shipped scope are the action-time re-checks
-- (email-campaigns.js, autonomy-gate.js), whose actorId is a campaign_id or a
-- channelType:contentId composite -- never an SD key. A column literally named
-- sd_key would mislead a chairman into expecting to type an SD key here. The 3
-- deferred early-layer sites (SD mint, claim gate, dispatch) would use an actual
-- sd_key value here too when built -- this column holds whatever unique key
-- identifies the gated action, generically.
--
-- quick_fixes.venture_id (FR-5): quick_fixes has no venture linkage at all today
-- (verified live via information_schema.columns) -- QF triage cannot classify a
-- QF's target venture without it. Nullable: most QFs are not venture-specific and
-- remain out of scope for the predicate (same null-venture_id-is-out-of-scope rule
-- FR-1 applies to SDs). Ships as pre-positioned schema for the deferred QF-triage
-- follow-on -- not yet consumed by any code in this SD's shipped scope.
--
-- Both are pure ADD COLUMN, no backfill, no existing column touched.

ALTER TABLE chairman_decisions
  ADD COLUMN IF NOT EXISTS override_key TEXT;

COMMENT ON COLUMN chairman_decisions.override_key IS
  'SD-LEO-INFRA-STAGE-GATE-PREDICATE-001 (FR-4): scopes a chairman override decision to one specific gated action (an SD key, a campaign_id, or a channelType:contentId composite -- whatever the calling site''s actorId is), using this row''s existing undo_deadline/consumed_at as the TTL/consumption mechanism. NOT globally unique on its own (SECURITY finding H3, EXEC-TO-PLAN review): a call-site actorId like campaign_id can recur across ventures (campaign_enrollments only enforces uniqueness per venture_id+lead_email+campaign_id), so hasActiveOverride() ALSO filters on this row''s existing venture_id column. Any tool that mints a stage_gate_override decision MUST set venture_id -- an override row with a null venture_id will never match any lookup, by design (fail-closed, not silently global).';

ALTER TABLE quick_fixes
  ADD COLUMN IF NOT EXISTS venture_id UUID REFERENCES ventures(id);

COMMENT ON COLUMN quick_fixes.venture_id IS
  'SD-LEO-INFRA-STAGE-GATE-PREDICATE-001 (FR-5): structured venture linkage for QF triage stage-gate classification. NULL means this QF is out of scope for the stage-gate predicate (not fail-closed-blocked) -- most QFs are not venture-specific.';
