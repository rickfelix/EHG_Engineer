/**
 * Security Definer Remediation Tests
 * SD: SD-MAN-GEN-TITLE-REMEDIATE-SECURITY-001
 *
 * Verifies:
 * 1. All 11 views have security_invoker=on
 * 2. agent_skills has RLS enabled
 * 3. service_role_full_access policy exists
 * 4. anon/authenticated grants revoked from agent_skills
 * 5. service_role can still query remediated views
 * 6. service_role can still query agent_skills
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const REMEDIATED_VIEWS = [
  'v_active_sessions',
  'v_agent_departments',
  'v_agent_effective_capabilities',
  'v_chairman_escalation_events',
  'v_chairman_pending_decisions',
  'v_cross_venture_patterns',
  'v_department_membership',
  'v_eva_accuracy',
  'v_flywheel_velocity',
  'v_live_sessions',
  'v_okr_hierarchy',
];

/**
 * Helper to execute raw SQL via exec_sql RPC or fallback
 */
async function execSql(sql) {
  // Try exec_sql RPC first
  const { data, error } = await supabase.rpc('exec_sql', { sql });
  if (!error) return data;

  // Fallback: try raw_query
  const { data: d2, error: e2 } = await supabase.rpc('raw_query', { query_text: sql });
  if (!e2) return d2;

  throw new Error(`SQL execution failed: ${error.message} / ${e2.message}`);
}

describe('Security Definer Remediation', () => {
  describe('Phase 1: View Security Invoker', () => {
    it('should have zero public views without security_invoker=on', async () => {
      const sql = `
        SELECT viewname
        FROM pg_views
        WHERE schemaname = 'public'
          AND viewname IN (${REMEDIATED_VIEWS.map(v => `'${v}'`).join(',')})
          AND NOT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relname = pg_views.viewname
              AND c.relkind = 'v'
              AND (c.reloptions IS NOT NULL AND 'security_invoker=on' = ANY(c.reloptions))
          )
      `;

      const result = await execSql(sql);
      const insecureViews = Array.isArray(result) ? result : [];
      expect(insecureViews).toHaveLength(0);
    });
  });

  describe('Phase 2: RLS on agent_skills', () => {
    it('should have RLS enabled on agent_skills', async () => {
      const sql = `
        SELECT relrowsecurity
        FROM pg_class
        WHERE relname = 'agent_skills'
          AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      `;

      const result = await execSql(sql);
      const rows = Array.isArray(result) ? result : [result];
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].relrowsecurity).toBe(true);
    });

    it('should have service_role_full_access policy on agent_skills', async () => {
      const sql = `
        SELECT polname
        FROM pg_policy
        WHERE polrelid = (
          SELECT oid FROM pg_class
          WHERE relname = 'agent_skills'
            AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        )
        AND polname = 'service_role_full_access'
      `;

      const result = await execSql(sql);
      const rows = Array.isArray(result) ? result : [result];
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].polname).toBe('service_role_full_access');
    });
  });

  describe('Phase 3: Grant Revocation', () => {
    it('should have no anon or authenticated grants on agent_skills', async () => {
      const sql = `
        SELECT grantee, privilege_type
        FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND table_name = 'agent_skills'
          AND grantee IN ('anon', 'authenticated')
      `;

      const result = await execSql(sql);
      const grants = Array.isArray(result) ? result : [];
      expect(grants).toHaveLength(0);
    });
  });

  describe('Functional Verification', () => {
    it('should allow service_role to query all remediated views', async () => {
      const errors = [];

      for (const view of REMEDIATED_VIEWS) {
        const { error } = await supabase.from(view).select('*').limit(1);
        if (error) {
          errors.push(`${view}: ${error.message}`);
        }
      }

      expect(errors).toHaveLength(0);
    });

    it('should allow service_role to query agent_skills after RLS', async () => {
      const { error } = await supabase.from('agent_skills').select('*').limit(1);
      expect(error).toBeNull();
    });
  });
});
