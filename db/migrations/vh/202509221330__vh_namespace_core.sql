-- 202509221330__vh_namespace_core.sql
-- Renames venture app tables with vh_ prefix to enforce two-app boundary.

BEGIN;

ALTER TABLE IF EXISTS companies RENAME TO vh_companies;
ALTER TABLE IF EXISTS user_company_access RENAME TO vh_user_company_access;
ALTER TABLE IF EXISTS ventures RENAME TO vh_ventures;
ALTER TABLE IF EXISTS ideas RENAME TO vh_ideas;
ALTER TABLE IF EXISTS feedback_intelligence RENAME TO vh_feedback_intelligence;
ALTER TABLE IF EXISTS feedback_trends RENAME TO vh_feedback_trends;
ALTER TABLE IF EXISTS customer_sentiment_history RENAME TO vh_customer_sentiment_history;
ALTER TABLE IF EXISTS onboarding_progress RENAME TO vh_onboarding_progress;
ALTER TABLE IF EXISTS onboarding_steps RENAME TO vh_onboarding_steps;
ALTER TABLE IF EXISTS onboarding_preferences RENAME TO vh_onboarding_preferences;

COMMIT;

/* DOWN */

BEGIN;

ALTER TABLE IF EXISTS vh_onboarding_preferences RENAME TO onboarding_preferences;
ALTER TABLE IF EXISTS vh_onboarding_steps RENAME TO onboarding_steps;
ALTER TABLE IF EXISTS vh_onboarding_progress RENAME TO onboarding_progress;
ALTER TABLE IF EXISTS vh_customer_sentiment_history RENAME TO customer_sentiment_history;
ALTER TABLE IF EXISTS vh_feedback_trends RENAME TO feedback_trends;
ALTER TABLE IF EXISTS vh_feedback_intelligence RENAME TO feedback_intelligence;
ALTER TABLE IF EXISTS vh_ideas RENAME TO ideas;
ALTER TABLE IF EXISTS vh_ventures RENAME TO ventures;
ALTER TABLE IF EXISTS vh_user_company_access RENAME TO user_company_access;
ALTER TABLE IF EXISTS vh_companies RENAME TO companies;

COMMIT;
