-- Fix RLS policies to handle null venture_id for general analytics and system access

-- Update analytics_exports policy to handle null venture_id
DROP POLICY IF EXISTS "Company access analytics_exports" ON public.analytics_exports;

CREATE POLICY "Company access analytics_exports" 
ON public.analytics_exports 
FOR ALL 
USING (
  -- Allow system services (no auth context) 
  auth.uid() IS NULL OR
  -- Allow general analytics (no specific venture)
  venture_id IS NULL OR
  -- Allow authenticated users to access their company's venture data
  (venture_id IN ( 
    SELECT v.id
    FROM ventures v
    WHERE (v.company_id IN ( 
      SELECT user_company_access.company_id
      FROM user_company_access
      WHERE (user_company_access.user_id = auth.uid())
    ))
  ))
);

-- Update ai_decisions policy to handle null venture_id
DROP POLICY IF EXISTS "Company access ai_decisions" ON public.ai_decisions;

CREATE POLICY "Company access ai_decisions" 
ON public.ai_decisions 
FOR ALL 
USING (
  -- Allow system services (no auth context)
  auth.uid() IS NULL OR
  -- Allow general decisions (no specific venture)
  venture_id IS NULL OR
  -- Allow authenticated users to access their company's venture data
  (venture_id IN ( 
    SELECT v.id
    FROM ventures v
    WHERE (v.company_id IN ( 
      SELECT user_company_access.company_id
      FROM user_company_access
      WHERE (user_company_access.user_id = auth.uid())
    ))
  ))
);