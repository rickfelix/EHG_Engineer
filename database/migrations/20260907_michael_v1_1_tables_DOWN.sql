-- @chairman-gated: applied by the chairman after sign-off (Tier 3: DROP is permission-class)
-- DOWN for 20260907_michael_v1_1_tables.sql (SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-J).
-- Drops the four v1.1 michael_* tables (triggers, policies and indexes go with them). No CASCADE
-- anywhere. Deliberately does NOT drop public.michael_set_updated_at() — the eleven v1 tables from
-- child B's migration still depend on it.
DROP TABLE IF EXISTS public.michael_check_in_journal;
DROP TABLE IF EXISTS public.michael_health_daily;
DROP TABLE IF EXISTS public.michael_oracle_alignment;
DROP TABLE IF EXISTS public.michael_oracle_history;
