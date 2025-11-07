CREATE POLICY IF NOT EXISTS anon_insert_user_stories
  ON public.user_stories
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS anon_read_user_stories
  ON public.user_stories
  FOR SELECT
  TO anon
  USING (true);
