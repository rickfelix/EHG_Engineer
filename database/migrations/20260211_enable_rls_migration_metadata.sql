-- Enable RLS on _migration_metadata table
-- This is an internal bookkeeping table (1 row, stores migration timestamp)
-- that should never be accessible via PostgREST/API clients.
--
-- Fixes Supabase lint: "RLS Disabled in Public Entity: public._migration_metadata"

ALTER TABLE public._migration_metadata ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._migration_metadata FROM anon, authenticated;
