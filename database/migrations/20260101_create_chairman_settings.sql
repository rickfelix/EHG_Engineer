-- Migration: Create chairman_settings table
-- SD: SD-VS-CHAIRMAN-SETTINGS-001
-- Purpose: Store configurable venture selection parameters
-- Date: 2026-01-01

-- ============================================================================
-- STEP 1: Create chairman_settings table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chairman_settings (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign keys for multi-tenant isolation
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    venture_id UUID REFERENCES public.ventures(id) ON DELETE CASCADE, -- Nullable for company-level defaults

    -- Venture selection parameters (11 settings)
    risk_tolerance INTEGER NOT NULL DEFAULT 35 CHECK (risk_tolerance >= 0 AND risk_tolerance <= 100),
    pattern_threshold INTEGER NOT NULL DEFAULT 75 CHECK (pattern_threshold >= 0 AND pattern_threshold <= 100),
    time_to_revenue_max INTEGER NOT NULL DEFAULT 21 CHECK (time_to_revenue_max > 0),
    capital_cap INTEGER NOT NULL DEFAULT 2000 CHECK (capital_cap > 0),
    feedback_speed INTEGER NOT NULL DEFAULT 8 CHECK (feedback_speed >= 1 AND feedback_speed <= 10),
    growth_curve VARCHAR(20) NOT NULL DEFAULT 'linear' CHECK (growth_curve IN ('linear', 'exponential', 'logarithmic', 's_curve')),
    exploit_ratio INTEGER NOT NULL DEFAULT 75 CHECK (exploit_ratio >= 0 AND exploit_ratio <= 100),
    explore_ratio INTEGER NOT NULL DEFAULT 25 CHECK (explore_ratio >= 0 AND explore_ratio <= 100),
    new_pattern_budget INTEGER NOT NULL DEFAULT 5000 CHECK (new_pattern_budget >= 0),
    require_dogfooding BOOLEAN NOT NULL DEFAULT true,
    kill_gate_mode VARCHAR(20) NOT NULL DEFAULT 'standard' CHECK (kill_gate_mode IN ('standard', 'strict', 'lenient', 'disabled')),

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),

    -- Constraints
    CONSTRAINT exploit_explore_ratio_sum CHECK (exploit_ratio + explore_ratio = 100),
    CONSTRAINT unique_company_venture_settings UNIQUE (company_id, venture_id)
);

-- Add comment describing the table
COMMENT ON TABLE public.chairman_settings IS 'Configurable venture selection parameters for the Chairman. Supports company-level defaults and venture-specific overrides.';

-- Column comments
COMMENT ON COLUMN public.chairman_settings.risk_tolerance IS 'Maximum acceptable risk level (0-100). Higher = more risk-tolerant.';
COMMENT ON COLUMN public.chairman_settings.pattern_threshold IS 'Minimum pattern match percentage required (0-100). Higher = stricter pattern requirements.';
COMMENT ON COLUMN public.chairman_settings.time_to_revenue_max IS 'Maximum days to first revenue. Ventures exceeding this are filtered out.';
COMMENT ON COLUMN public.chairman_settings.capital_cap IS 'Maximum initial capital investment in dollars.';
COMMENT ON COLUMN public.chairman_settings.feedback_speed IS 'Importance of fast customer feedback (1-10). Higher = faster feedback preferred.';
COMMENT ON COLUMN public.chairman_settings.growth_curve IS 'Preferred growth trajectory: linear, exponential, logarithmic, s_curve.';
COMMENT ON COLUMN public.chairman_settings.exploit_ratio IS 'Percentage of portfolio allocated to exploiting proven patterns (0-100).';
COMMENT ON COLUMN public.chairman_settings.explore_ratio IS 'Percentage of portfolio allocated to exploring new patterns (0-100).';
COMMENT ON COLUMN public.chairman_settings.new_pattern_budget IS 'Budget allocated for developing new patterns in dollars.';
COMMENT ON COLUMN public.chairman_settings.require_dogfooding IS 'Whether ventures must use our own patterns (true = required).';
COMMENT ON COLUMN public.chairman_settings.kill_gate_mode IS 'How strictly to enforce kill gates: standard, strict, lenient, disabled.';

-- ============================================================================
-- STEP 2: Create indexes for performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_chairman_settings_company_id
    ON public.chairman_settings(company_id);

CREATE INDEX IF NOT EXISTS idx_chairman_settings_venture_id
    ON public.chairman_settings(venture_id)
    WHERE venture_id IS NOT NULL;

-- ============================================================================
-- STEP 3: Enable RLS and create policies
-- ============================================================================

ALTER TABLE public.chairman_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read settings for their own company
CREATE POLICY "chairman_settings_select_own_company" ON public.chairman_settings
    FOR SELECT
    USING (
        company_id IN (
            SELECT company_id FROM public.user_company_access
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

-- Policy: Only admins can insert settings
CREATE POLICY "chairman_settings_insert_admin" ON public.chairman_settings
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_company_access
            WHERE user_id = auth.uid()
            AND company_id = chairman_settings.company_id
            AND role IN ('admin', 'owner')
            AND is_active = true
        )
    );

-- Policy: Only admins can update settings
CREATE POLICY "chairman_settings_update_admin" ON public.chairman_settings
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.user_company_access
            WHERE user_id = auth.uid()
            AND company_id = chairman_settings.company_id
            AND role IN ('admin', 'owner')
            AND is_active = true
        )
    );

-- Policy: Only owners can delete settings
CREATE POLICY "chairman_settings_delete_owner" ON public.chairman_settings
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.user_company_access
            WHERE user_id = auth.uid()
            AND company_id = chairman_settings.company_id
            AND role = 'owner'
            AND is_active = true
        )
    );

-- ============================================================================
-- STEP 4: Create trigger for updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_chairman_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chairman_settings_updated_at ON public.chairman_settings;
CREATE TRIGGER trg_chairman_settings_updated_at
    BEFORE UPDATE ON public.chairman_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_chairman_settings_timestamp();

-- ============================================================================
-- STEP 5: Create view for settings with inheritance
-- ============================================================================

CREATE OR REPLACE VIEW public.v_chairman_settings_resolved AS
SELECT
    v.id as venture_id,
    v.company_id,
    v.name as venture_name,
    -- Resolved settings: venture override > company default > system default
    COALESCE(vs.risk_tolerance, cs.risk_tolerance, 35) as risk_tolerance,
    COALESCE(vs.pattern_threshold, cs.pattern_threshold, 75) as pattern_threshold,
    COALESCE(vs.time_to_revenue_max, cs.time_to_revenue_max, 21) as time_to_revenue_max,
    COALESCE(vs.capital_cap, cs.capital_cap, 2000) as capital_cap,
    COALESCE(vs.feedback_speed, cs.feedback_speed, 8) as feedback_speed,
    COALESCE(vs.growth_curve, cs.growth_curve, 'linear') as growth_curve,
    COALESCE(vs.exploit_ratio, cs.exploit_ratio, 75) as exploit_ratio,
    COALESCE(vs.explore_ratio, cs.explore_ratio, 25) as explore_ratio,
    COALESCE(vs.new_pattern_budget, cs.new_pattern_budget, 5000) as new_pattern_budget,
    COALESCE(vs.require_dogfooding, cs.require_dogfooding, true) as require_dogfooding,
    COALESCE(vs.kill_gate_mode, cs.kill_gate_mode, 'standard') as kill_gate_mode,
    -- Source tracking
    CASE
        WHEN vs.id IS NOT NULL THEN 'venture_override'
        WHEN cs.id IS NOT NULL THEN 'company_default'
        ELSE 'system_default'
    END as settings_source
FROM public.ventures v
LEFT JOIN public.chairman_settings cs
    ON cs.company_id = v.company_id AND cs.venture_id IS NULL
LEFT JOIN public.chairman_settings vs
    ON vs.venture_id = v.id;

COMMENT ON VIEW public.v_chairman_settings_resolved IS 'Resolves chairman settings with inheritance: venture > company > system defaults';

-- ============================================================================
-- STEP 6: Grant permissions
-- ============================================================================

GRANT SELECT ON public.chairman_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.chairman_settings TO authenticated;
GRANT SELECT ON public.v_chairman_settings_resolved TO authenticated;

-- ============================================================================
-- STEP 7: Create function to get settings for a company/venture
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_chairman_settings(
    p_company_id UUID,
    p_venture_id UUID DEFAULT NULL
)
RETURNS TABLE (
    risk_tolerance INTEGER,
    pattern_threshold INTEGER,
    time_to_revenue_max INTEGER,
    capital_cap INTEGER,
    feedback_speed INTEGER,
    growth_curve VARCHAR(20),
    exploit_ratio INTEGER,
    explore_ratio INTEGER,
    new_pattern_budget INTEGER,
    require_dogfooding BOOLEAN,
    kill_gate_mode VARCHAR(20),
    settings_source TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_settings RECORD;
BEGIN
    -- First try venture-specific settings
    IF p_venture_id IS NOT NULL THEN
        SELECT cs.* INTO v_settings
        FROM public.chairman_settings cs
        WHERE cs.venture_id = p_venture_id;

        IF FOUND THEN
            RETURN QUERY SELECT
                v_settings.risk_tolerance,
                v_settings.pattern_threshold,
                v_settings.time_to_revenue_max,
                v_settings.capital_cap,
                v_settings.feedback_speed,
                v_settings.growth_curve,
                v_settings.exploit_ratio,
                v_settings.explore_ratio,
                v_settings.new_pattern_budget,
                v_settings.require_dogfooding,
                v_settings.kill_gate_mode,
                'venture_override'::TEXT;
            RETURN;
        END IF;
    END IF;

    -- Fall back to company default
    SELECT cs.* INTO v_settings
    FROM public.chairman_settings cs
    WHERE cs.company_id = p_company_id AND cs.venture_id IS NULL;

    IF FOUND THEN
        RETURN QUERY SELECT
            v_settings.risk_tolerance,
            v_settings.pattern_threshold,
            v_settings.time_to_revenue_max,
            v_settings.capital_cap,
            v_settings.feedback_speed,
            v_settings.growth_curve,
            v_settings.exploit_ratio,
            v_settings.explore_ratio,
            v_settings.new_pattern_budget,
            v_settings.require_dogfooding,
            v_settings.kill_gate_mode,
            'company_default'::TEXT;
        RETURN;
    END IF;

    -- Fall back to system defaults
    RETURN QUERY SELECT
        35::INTEGER,
        75::INTEGER,
        21::INTEGER,
        2000::INTEGER,
        8::INTEGER,
        'linear'::VARCHAR(20),
        75::INTEGER,
        25::INTEGER,
        5000::INTEGER,
        true::BOOLEAN,
        'standard'::VARCHAR(20),
        'system_default'::TEXT;
END;
$$;

COMMENT ON FUNCTION public.get_chairman_settings IS 'Get chairman settings with inheritance: venture > company > system defaults';

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_chairman_settings TO authenticated;
