-- Migration: Add eva_todoist_intake.sd_refs column for SD↔Todoist cross-reference.
-- Source: SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C, PRD FR-0 Migration 1, DATABASE deep review evidence row 64396c27.
-- Why a dedicated column (not target_aspects extension): target_aspects is JSONB array of strings, not object —
-- jsonb_set(target_aspects, '{sd_refs}', ...) on an array would fail at runtime.
-- Safety: additive, non-breaking. Default '[]'::jsonb populates all 304 existing rows.
-- Rollback: ALTER TABLE eva_todoist_intake DROP COLUMN IF EXISTS sd_refs;

ALTER TABLE eva_todoist_intake
  ADD COLUMN IF NOT EXISTS sd_refs jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN eva_todoist_intake.sd_refs IS
  'JSONB array of SD cross-references for EVA Support Phase 3. Each entry: { sd_id (uuid), source ("eva_cross_ref"|"chairman_manual"), confidence (0-100), evidence_substring (min 5 chars), status?: ("active"|"rejected") }. Writes use jsonb concatenation (sd_refs = sd_refs || new_entry::jsonb) — never full-row replace. See PRD-SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C FR-2.';
