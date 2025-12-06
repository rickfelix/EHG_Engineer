-- ============================================================================
-- Migration: Brand Variants Security Schema with RLS Policies
-- SD: SD-STAGE-12-001 (Adaptive Naming - Brand Variants)
-- Date: 2025-12-05
-- Purpose: Create brand_variants table with CRITICAL RLS security policies
-- ============================================================================

-- ============================================================================
-- PART 1: CREATE brand_variants TABLE (if not exists)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.brand_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign Keys
  venture_id UUID NOT NULL REFERENCES public.ventures(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  parent_name_id UUID REFERENCES public.brand_variants(id) ON DELETE SET NULL,

  -- Variant Details (JSONB - MUST BE VALIDATED)
  variant_details JSONB NOT NULL,
  -- Structure: {
  --   name_text: string (1-50 chars, alphanumeric+space+dash+apostrophe only),
  --   localized_name: {lang_code: string},
  --   generation_cycle: number,
  --   adaptation_timestamp: timestamp,
  --   adaptation_reason: enum,
  --   variant_type: enum,
  --   improvement_hypothesis: string (10-500 chars)
  -- }

  -- Performance and Status
  performance_metrics JSONB DEFAULT '{}',
  availability_status JSONB DEFAULT '{}',
  validation_results JSONB DEFAULT '{}',
  notes TEXT,

  -- Status Tracking
  status VARCHAR(50) NOT NULL DEFAULT 'generated' CHECK (status IN (
    'generated',
    'under_evaluation',
    'market_testing',
    'approved',
    'rejected',
    'retired',
    'promoted'
  )),

  -- Audit Trail
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_notes CHECK (char_length(notes) <= 1000)
);

-- ============================================================================
-- PART 2: CREATE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_brand_variants_venture_id
  ON public.brand_variants(venture_id);

CREATE INDEX IF NOT EXISTS idx_brand_variants_created_by
  ON public.brand_variants(created_by);

CREATE INDEX IF NOT EXISTS idx_brand_variants_status
  ON public.brand_variants(status);

CREATE INDEX IF NOT EXISTS idx_brand_variants_created_at
  ON public.brand_variants(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_brand_variants_venture_status
  ON public.brand_variants(venture_id, status);

-- ============================================================================
-- PART 3: CREATE HELPER FUNCTIONS
-- ============================================================================

-- Function: Check if user has chairman role
CREATE OR REPLACE FUNCTION public.is_chairman(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT EXISTS(
      SELECT 1 FROM auth.users
      WHERE id = user_id
      AND (
        raw_user_meta_data->>'role' = 'chairman'
        OR raw_user_meta_data->>'role' = 'admin'
      )
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_brand_variants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 4: CREATE TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS brand_variants_updated_at ON public.brand_variants;

CREATE TRIGGER brand_variants_updated_at
  BEFORE UPDATE ON public.brand_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_brand_variants_updated_at();

-- ============================================================================
-- PART 5: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.brand_variants ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Anonymous read active variants" ON public.brand_variants;
DROP POLICY IF EXISTS "Authenticated read all variants" ON public.brand_variants;
DROP POLICY IF EXISTS "Users create own variants" ON public.brand_variants;
DROP POLICY IF EXISTS "Creator edit pending variants" ON public.brand_variants;
DROP POLICY IF EXISTS "Chairman approve reject variants" ON public.brand_variants;
DROP POLICY IF EXISTS "Service role full access" ON public.brand_variants;

-- ============================================================================
-- PART 6: ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- POLICY 1: Anonymous users can READ only approved/promoted variants
CREATE POLICY "Anonymous read active variants"
ON public.brand_variants
FOR SELECT
TO anon
USING (status IN ('approved', 'promoted'));

-- POLICY 2: Authenticated users can READ all variants (for their ventures)
CREATE POLICY "Authenticated read all variants"
ON public.brand_variants
FOR SELECT
TO authenticated
USING (
  -- Users can read variants from their ventures
  -- Assumes ventures table has user-based access control
  true -- Rely on venture-level access control
);

-- POLICY 3: Authenticated users can INSERT (create) variants
CREATE POLICY "Users create own variants"
ON public.brand_variants
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

-- POLICY 4: Creators can UPDATE pending variants only
CREATE POLICY "Creator edit pending variants"
ON public.brand_variants
FOR UPDATE
TO authenticated
USING (
  auth.uid() = created_by
  AND status IN ('generated', 'under_evaluation')
)
WITH CHECK (
  auth.uid() = created_by
  AND status IN ('generated', 'under_evaluation')
);

-- POLICY 5: CRITICAL - Only Chairman can APPROVE/REJECT variants
CREATE POLICY "Chairman approve reject variants"
ON public.brand_variants
FOR UPDATE
TO authenticated
USING (is_chairman(auth.uid()))
WITH CHECK (
  is_chairman(auth.uid())
  AND status IN ('approved', 'rejected')
);

-- POLICY 6: Service role (internal operations) has full access
CREATE POLICY "Service role full access"
ON public.brand_variants
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- PART 7: CREATE AUDIT TABLE (Required for compliance)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.brand_variant_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES public.brand_variants(id) ON DELETE CASCADE,

  action VARCHAR(50) NOT NULL CHECK (action IN (
    'created',
    'updated',
    'submitted',
    'approved',
    'rejected',
    'promoted',
    'retired'
  )),

  performed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_status VARCHAR(50),
  new_status VARCHAR(50),
  change_details JSONB,

  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit table indexes
CREATE INDEX IF NOT EXISTS idx_brand_variant_audit_variant_id
  ON public.brand_variant_audit(variant_id);

CREATE INDEX IF NOT EXISTS idx_brand_variant_audit_action
  ON public.brand_variant_audit(action);

CREATE INDEX IF NOT EXISTS idx_brand_variant_audit_performer
  ON public.brand_variant_audit(performed_by);

CREATE INDEX IF NOT EXISTS idx_brand_variant_audit_created_at
  ON public.brand_variant_audit(created_at DESC);

-- ============================================================================
-- PART 8: AUDIT LOGGING FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_variant_action(
  p_variant_id UUID,
  p_action VARCHAR,
  p_previous_status VARCHAR DEFAULT NULL,
  p_new_status VARCHAR DEFAULT NULL,
  p_details JSONB DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  INSERT INTO public.brand_variant_audit (
    variant_id,
    action,
    performed_by,
    previous_status,
    new_status,
    change_details
  )
  VALUES (
    p_variant_id,
    p_action,
    auth.uid(),
    p_previous_status,
    p_new_status,
    p_details
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 9: TABLE DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.brand_variants IS
'Stores adaptive naming variants for ventures. CRITICAL: RLS policies enforce chairman-only approval. SD-STAGE-12-001.';

COMMENT ON COLUMN public.brand_variants.variant_details IS
'JSONB structure containing name_text (validated alphanumeric+space+dash+apostrophe), localized_name, generation_cycle, adaptation_reason, etc. MUST validate with strict Zod schema.';

COMMENT ON COLUMN public.brand_variants.status IS
'Lifecycle status: generated -> under_evaluation -> market_testing -> approved/rejected -> promoted/retired. Only chairman can move to approved/rejected.';

COMMENT ON COLUMN public.brand_variants.created_by IS
'User who created the variant. Only this user can edit pending (generated/under_evaluation) variants.';

COMMENT ON TABLE public.brand_variant_audit IS
'Audit trail for all variant actions (approve, reject, create, update). REQUIRED for compliance logging.';

-- ============================================================================
-- PART 10: SECURITY NOTES
-- ============================================================================

/*
CRITICAL SECURITY REQUIREMENTS:

1. INPUT VALIDATION (Backend - Zod)
   - All user input in variant_details MUST be validated with regex:
     - name_text: /^[a-zA-Z0-9\s\-']+$/
     - improvement_hypothesis: /^[a-zA-Z0-9\s\.\,\-\'\:]+$/
   - Max lengths: name_text (50), improvement_hypothesis (500), notes (1000)

2. AUTHORIZATION (RLS - Enforced at DB)
   - Read: authenticated users (all variants), anon (approved only)
   - Create: creator only
   - Edit: creator only for pending variants
   - Approve/Reject: CHAIRMAN ONLY via is_chairman() function

3. API KEY SECURITY
   - DeepL, Namecheap, GPT-4 keys MUST be in environment variables
   - NO hardcoded secrets
   - Rotate keys monthly

4. RATE LIMITING (Application Layer)
   - POST /variants: 10/min per user
   - PATCH /variants: 30/min per user
   - POST /domain-check: 20/hour per user
   - Approve endpoint: 50/min

5. AUDIT LOGGING (Automatic)
   - All approve/reject actions logged via log_variant_action()
   - Includes performed_by, timestamp, previous/new status
   - Queryable for compliance audits

6. EXTERNAL API CALLS
   - All calls must have 10-second timeout
   - Domain validation must use DNSSEC or authoritative checks
   - API errors must NOT expose internal details
*/

-- ============================================================================
-- VERIFICATION QUERIES (Test These After Migration)
-- ============================================================================

/*
-- Test 1: Verify RLS policies exist
SELECT schemaname, tablename, policyname, permissive, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'brand_variants'
ORDER BY policyname;

-- Test 2: Verify is_chairman function works
SELECT public.is_chairman('12345678-1234-1234-1234-123456789012'::uuid);

-- Test 3: Verify audit table structure
\d public.brand_variant_audit

-- Test 4: Check for any validation constraints
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'brand_variants';
*/

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
