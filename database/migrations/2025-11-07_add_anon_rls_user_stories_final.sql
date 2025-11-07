DROP POLICY IF EXISTS anon_insert_user_stories ON public.user_stories;
DROP POLICY IF EXISTS anon_read_user_stories ON public.user_stories;

CREATE POLICY anon_insert_user_stories
  ON public.user_stories
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY anon_read_user_stories
  ON public.user_stories
  FOR SELECT
  TO anon
  USING (true);
