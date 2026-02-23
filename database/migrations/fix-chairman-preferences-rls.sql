-- Fix RLS policies on chairman_preferences table
-- Drops unrestricted policies (WHERE true) and creates function-gated access

-- Drop existing unrestricted policies
DROP POLICY IF EXISTS "chairman_preferences_select" ON public.chairman_preferences;
DROP POLICY IF EXISTS "chairman_preferences_insert" ON public.chairman_preferences;
DROP POLICY IF EXISTS "chairman_preferences_update" ON public.chairman_preferences;
DROP POLICY IF EXISTS "chairman_preferences_delete" ON public.chairman_preferences;

-- Ensure fn_is_chairman() function exists
CREATE OR REPLACE FUNCTION public.fn_is_chairman()
RETURNS BOOLEAN AS $$
BEGIN
  -- Returns true if current user is the chairman
  -- Checks auth.uid() against chairman role in user metadata
  RETURN (SELECT EXISTS(
    SELECT 1 FROM auth.users u
    WHERE u.id = auth.uid()
    AND (
      u.raw_user_meta_data->>'role' = 'chairman'
      OR u.raw_user_meta_data->'roles' @> '"chairman"'::jsonb
    )
  ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create SELECT policy - read only for chairman
CREATE POLICY "chairman_preferences_select"
ON public.chairman_preferences
FOR SELECT
USING (fn_is_chairman());

-- Create INSERT policy - insert only for chairman
CREATE POLICY "chairman_preferences_insert"
ON public.chairman_preferences
FOR INSERT
WITH CHECK (fn_is_chairman());

-- Create UPDATE policy - update only for chairman
CREATE POLICY "chairman_preferences_update"
ON public.chairman_preferences
FOR UPDATE
USING (fn_is_chairman())
WITH CHECK (fn_is_chairman());

-- Create DELETE policy - delete only for chairman
CREATE POLICY "chairman_preferences_delete"
ON public.chairman_preferences
FOR DELETE
USING (fn_is_chairman());

-- Verification query (should show 4 policies, none with WHERE true)
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive, 
  roles, 
  qual as using_clause, 
  with_check as with_check_clause
FROM pg_policies
WHERE tablename = 'chairman_preferences'
ORDER BY policyname;
