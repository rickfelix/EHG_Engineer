-- Migration: Add authenticated SELECT policy to stitch_generation_metrics
-- RCA: Frontend useStitchCuration hook queries this table via authenticated
-- Supabase client, but RLS blocks it (no policy for authenticated role).
-- Result: generation_metrics is always undefined, fallback shows wrong data.

CREATE POLICY "authenticated_select" ON stitch_generation_metrics
  FOR SELECT TO authenticated USING (true);
