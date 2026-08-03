-- SD-LEO-INFRA-PLAN-POSITION-READABLE-001 (FR-1) — one readable row per committing item.
--
-- TIER-1: a bare CREATE VIEW (no OR REPLACE, no SECURITY DEFINER, no destructive statement) is
-- auto-apply eligible under scripts/lib/migration-tier-classifier.mjs. It is additive and read-only:
-- it creates nothing but a projection over tables that already exist and adds no column anywhere.
--
-- =============== WHY A VIEW AND NOT COLUMNS ON roadmap_wave_items ===============
-- The SD asks for a row carrying item key, current child SD key, CLAIM STATE and LAST-ADVANCE.
-- Claim state already lives authoritatively on strategic_directives_v2 (claiming_session_id,
-- status, current_phase). Copying it onto the item row would create a SECOND REPRESENTATION that
-- drifts — and a drifting plan instrument is precisely the failure this SD was filed about, so
-- fixing it by adding a drift surface would be self-defeating. A view derives all four fields with
-- zero duplication and cannot go stale: it is read at query time, so there is no refresh to forget.
-- This also answers the freshness question raised at PRD review — the answer is "immediately, by
-- construction", not an SLA. DO NOT "optimise" this into a materialized view or a table without
-- re-deciding that trade-off; doing so silently reintroduces the drift.
--
-- ===================== SCOPE: THE ACTIVE ROADMAP, NOT status='approved' =====================
-- Canonical scope is the waves of the single strategic_roadmaps row with status='active' — the same
-- definition lib/roadmap/canonical-roadmap.js uses and therefore the same set the belt ranker treats
-- as canonical. Scoping on wave status alone would silently include waves from ARCHIVED roadmap
-- generations, which is how the item mass (1087 proposed / 523 archived) ends up being counted as
-- plan position. Measured on the active roadmap: 8 waves, 261 items.
--
-- ===================== LAST-ADVANCE IS DERIVED AND ITS MEANING IS STATED =====================
-- There is no decided/advanced timestamp on either side, so last_advance_at is the most recent of
-- the item's own updated_at and its child SD's updated_at. That is a PROXY for "something moved on
-- this item", not a phase-transition timestamp — any row mutation moves updated_at. It is honest
-- because it is derived from real mutations rather than invented, but a reader must not treat it as
-- "the plan advanced". FOLLOW-ON: if a true advancement timestamp is wanted, stamp it explicitly at
-- the completion hook (which already exists at lead-final-approval/index.js:757-759) rather than
-- inferring it here.

CREATE VIEW public.v_plan_item_position AS
SELECT
  i.id                                   AS item_id,
  i.wave_id,
  w.sequence_rank                        AS wave_sequence_rank,
  w.title                                AS wave_title,
  w.status                               AS wave_status,
  w.time_horizon,
  i.title                                AS item_title,
  i.item_disposition,
  i.promoted_to_sd_key                   AS child_sd_key,
  sd.status                              AS child_status,
  sd.current_phase                       AS child_phase,
  -- Claim state, DERIVED. Never copied, so it cannot disagree with the claim truth.
  (sd.claiming_session_id IS NOT NULL)   AS child_is_claimed,
  sd.claiming_session_id                 AS child_claiming_session_id,
  -- A committing item is joinable when it names a child SD that actually exists. An item naming a
  -- key with no matching SD is an ORPHAN — the state FR-5's standing check must trip on, so it is
  -- surfaced as a field rather than filtered away.
  (i.promoted_to_sd_key IS NOT NULL AND sd.sd_key IS NULL) AS is_orphaned,
  GREATEST(i.updated_at, COALESCE(sd.updated_at, i.updated_at)) AS last_advance_at
FROM roadmap_wave_items i
  JOIN roadmap_waves w ON w.id = i.wave_id
  LEFT JOIN strategic_directives_v2 sd ON sd.sd_key = i.promoted_to_sd_key
WHERE w.roadmap_id IN (SELECT id FROM strategic_roadmaps WHERE status = 'active');
