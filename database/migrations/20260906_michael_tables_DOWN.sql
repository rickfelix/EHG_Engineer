-- @chairman-gated: applied by the chairman after sign-off (Tier 3: DROP is permission-class)
-- DOWN for 20260906_michael_tables.sql (SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B).
-- Drops the eleven michael_* tables (triggers, policies and indexes go with them), then the
-- trigger function. No CASCADE anywhere; public.set_updated_at() is never touched. The self-FK on
-- michael_rules imposes no cross-table order (DROP TABLE takes its own constraint).
DROP TABLE IF EXISTS public.michael_staged_items;
DROP TABLE IF EXISTS public.michael_credentials;
DROP TABLE IF EXISTS public.michael_brief_runs;
DROP TABLE IF EXISTS public.michael_todoist_snapshot;
DROP TABLE IF EXISTS public.michael_gmail_triage_items;
DROP TABLE IF EXISTS public.michael_calendar_day;
DROP TABLE IF EXISTS public.michael_feeder_runs;
DROP TABLE IF EXISTS public.michael_feedback_ledger;
DROP TABLE IF EXISTS public.michael_closures;
DROP TABLE IF EXISTS public.michael_gmail_labels;
DROP TABLE IF EXISTS public.michael_rules;
DROP FUNCTION IF EXISTS public.michael_set_updated_at();
