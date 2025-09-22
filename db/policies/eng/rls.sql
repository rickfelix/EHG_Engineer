-- Row level security policies for EHG_Engineering canonical tables.

-- Strategic Directives governance table
ALTER TABLE strategic_directives_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategic_directives_v2 FORCE ROW LEVEL SECURITY;

REVOKE ALL ON strategic_directives_v2 FROM authenticated;

DROP POLICY IF EXISTS eng_sd_service_rw ON strategic_directives_v2;
CREATE POLICY eng_sd_service_rw ON strategic_directives_v2
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS eng_sd_analyst_ro ON strategic_directives_v2;
CREATE POLICY eng_sd_analyst_ro ON strategic_directives_v2
    FOR SELECT
    USING (auth.role() IN ('service_role','analyst') AND approved_at IS NOT NULL);

-- Product Requirements governance table
ALTER TABLE product_requirements_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_requirements_v2 FORCE ROW LEVEL SECURITY;

REVOKE ALL ON product_requirements_v2 FROM authenticated;

DROP POLICY IF EXISTS eng_prd_service_rw ON product_requirements_v2;
CREATE POLICY eng_prd_service_rw ON product_requirements_v2
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS eng_prd_analyst_ro ON product_requirements_v2;
CREATE POLICY eng_prd_analyst_ro ON product_requirements_v2
    FOR SELECT
    USING (auth.role() IN ('service_role','analyst'));

-- PRD storage table
ALTER TABLE product_requirements_v3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_requirements_v3 FORCE ROW LEVEL SECURITY;

REVOKE ALL ON product_requirements_v3 FROM authenticated;

DROP POLICY IF EXISTS eng_prd3_service_rw ON product_requirements_v3;
CREATE POLICY eng_prd3_service_rw ON product_requirements_v3
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS eng_prd3_analyst_ro ON product_requirements_v3;
CREATE POLICY eng_prd3_analyst_ro ON product_requirements_v3
    FOR SELECT
    USING (auth.role() IN ('service_role','analyst'));

-- Normalized backlog table
ALTER TABLE eng_backlog ENABLE ROW LEVEL SECURITY;
ALTER TABLE eng_backlog FORCE ROW LEVEL SECURITY;

REVOKE ALL ON eng_backlog FROM authenticated;

DROP POLICY IF EXISTS eng_backlog_service_rw ON eng_backlog;
CREATE POLICY eng_backlog_service_rw ON eng_backlog
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS eng_backlog_analyst_ro ON eng_backlog;
CREATE POLICY eng_backlog_analyst_ro ON eng_backlog
    FOR SELECT
    USING (auth.role() IN ('service_role','analyst'));
