-- Venture app RLS policies (vh_ namespace)

-- Helper predicate reused across policies
CREATE OR REPLACE FUNCTION vh_user_can_access_company(p_company UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM vh_user_company_access uca
        WHERE uca.company_id = p_company
          AND uca.user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Companies
ALTER TABLE vh_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE vh_companies FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vh_companies_service_rw ON vh_companies;
CREATE POLICY vh_companies_service_rw ON vh_companies
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS vh_companies_member_ro ON vh_companies;
CREATE POLICY vh_companies_member_ro ON vh_companies
    FOR SELECT
    USING (auth.role() IN ('service_role','authenticated') AND vh_user_can_access_company(id));

-- User company access
ALTER TABLE vh_user_company_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE vh_user_company_access FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vh_uca_service_rw ON vh_user_company_access;
CREATE POLICY vh_uca_service_rw ON vh_user_company_access
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS vh_uca_self_ro ON vh_user_company_access;
CREATE POLICY vh_uca_self_ro ON vh_user_company_access
    FOR SELECT
    USING (user_id = auth.uid());

-- Ventures
ALTER TABLE vh_ventures ENABLE ROW LEVEL SECURITY;
ALTER TABLE vh_ventures FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vh_ventures_service_rw ON vh_ventures;
CREATE POLICY vh_ventures_service_rw ON vh_ventures
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS vh_ventures_member_ro ON vh_ventures;
CREATE POLICY vh_ventures_member_ro ON vh_ventures
    FOR SELECT
    USING (vh_user_can_access_company(company_id));

DROP POLICY IF EXISTS vh_ventures_member_update ON vh_ventures;
CREATE POLICY vh_ventures_member_update ON vh_ventures
    FOR UPDATE
    USING (vh_user_can_access_company(company_id) AND auth.role() IN ('service_role'))
    WITH CHECK (vh_user_can_access_company(company_id) AND auth.role() IN ('service_role'));

-- Ideas
ALTER TABLE vh_ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE vh_ideas FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vh_ideas_service_rw ON vh_ideas;
CREATE POLICY vh_ideas_service_rw ON vh_ideas
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS vh_ideas_member_ro ON vh_ideas;
CREATE POLICY vh_ideas_member_ro ON vh_ideas
    FOR SELECT
    USING (vh_user_can_access_company(company_id));

-- Feedback intelligence tables
ALTER TABLE vh_feedback_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE vh_feedback_intelligence FORCE ROW LEVEL SECURITY;
ALTER TABLE vh_feedback_trends ENABLE ROW LEVEL SECURITY;
ALTER TABLE vh_feedback_trends FORCE ROW LEVEL SECURITY;
ALTER TABLE vh_customer_sentiment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE vh_customer_sentiment_history FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vh_feedback_service_rw ON vh_feedback_intelligence;
CREATE POLICY vh_feedback_service_rw ON vh_feedback_intelligence
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS vh_feedback_ro ON vh_feedback_intelligence;
CREATE POLICY vh_feedback_ro ON vh_feedback_intelligence
    FOR SELECT USING (vh_user_can_access_company((SELECT company_id FROM vh_ventures WHERE id = venture_id)));

DROP POLICY IF EXISTS vh_trends_service_rw ON vh_feedback_trends;
CREATE POLICY vh_trends_service_rw ON vh_feedback_trends
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS vh_trends_ro ON vh_feedback_trends;
CREATE POLICY vh_trends_ro ON vh_feedback_trends
    FOR SELECT USING (vh_user_can_access_company((SELECT company_id FROM vh_ventures WHERE id = venture_id)));

DROP POLICY IF EXISTS vh_sentiment_service_rw ON vh_customer_sentiment_history;
CREATE POLICY vh_sentiment_service_rw ON vh_customer_sentiment_history
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS vh_sentiment_ro ON vh_customer_sentiment_history;
CREATE POLICY vh_sentiment_ro ON vh_customer_sentiment_history
    FOR SELECT USING (vh_user_can_access_company((SELECT company_id FROM vh_ventures WHERE id = venture_id)));

-- Onboarding tables
ALTER TABLE vh_onboarding_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE vh_onboarding_progress FORCE ROW LEVEL SECURITY;
ALTER TABLE vh_onboarding_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE vh_onboarding_steps FORCE ROW LEVEL SECURITY;
ALTER TABLE vh_onboarding_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE vh_onboarding_preferences FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vh_onboarding_service_rw ON vh_onboarding_progress;
CREATE POLICY vh_onboarding_service_rw ON vh_onboarding_progress
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS vh_onboarding_owner ON vh_onboarding_progress;
CREATE POLICY vh_onboarding_owner ON vh_onboarding_progress
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS vh_onboarding_steps_owner ON vh_onboarding_steps;
CREATE POLICY vh_onboarding_steps_owner ON vh_onboarding_steps
    FOR ALL
    USING (progress_id IN (SELECT id FROM vh_onboarding_progress WHERE user_id = auth.uid()))
    WITH CHECK (progress_id IN (SELECT id FROM vh_onboarding_progress WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS vh_onboarding_preferences_owner ON vh_onboarding_preferences;
CREATE POLICY vh_onboarding_preferences_owner ON vh_onboarding_preferences
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
