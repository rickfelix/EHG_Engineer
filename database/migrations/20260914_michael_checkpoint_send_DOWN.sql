-- @chairman-gated: applied by the chairman after sign-off (Tier 3: DROP is permission-class)
-- DOWN for 20260914_michael_checkpoint_send.sql (SD-LEO-INFRA-MICHAEL-TIER2-CHECKPOINT-SEND-001).
-- Drops the two checkpoint-send tables (triggers, policies and indexes go with them). No CASCADE
-- anywhere. Deliberately does NOT drop public.michael_set_updated_at() -- the other michael_*
-- tables still depend on it.
DROP TABLE IF EXISTS public.michael_checkpoint_send_ledger;
DROP TABLE IF EXISTS public.michael_checkpoint_send_enabled;
