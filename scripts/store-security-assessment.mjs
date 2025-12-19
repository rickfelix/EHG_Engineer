import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function storeSecurityAssessment() {
  // Based on schema: sd_id, sub_agent_code, sub_agent_name, verdict, confidence,
  // critical_issues (JSONB), warnings (JSONB), recommendations (JSONB),
  // detailed_analysis (TEXT), execution_time, metadata (JSONB)

  const criticalIssues = [
    { table: 'chairman_decisions', file: 'supabase/migrations/20251216000001_chairman_unified_decisions.sql', issue: 'USING(true) on SELECT, INSERT, UPDATE policies', impact: 'ANY authenticated user can read/write ALL chairman decisions', severity: 'CRITICAL', cwe: 'CWE-862' },
    { table: 'venture_decisions', file: 'supabase/migrations/20251218_create_venture_decisions_table.sql', issue: 'USING(true) on SELECT, INSERT, UPDATE policies', impact: 'ANY authenticated user can read/write ALL venture decisions', severity: 'CRITICAL', cwe: 'CWE-862' },
    { table: 'board_members', file: 'database/migrations/20251011_board_governance_mvp.sql', issue: 'USING(true) on all CRUD policies', impact: 'ANY authenticated user can manage board membership', severity: 'CRITICAL', cwe: 'CWE-269' },
    { table: 'board_meetings', file: 'database/migrations/20251011_board_governance_mvp.sql', issue: 'USING(true) on all CRUD policies', impact: 'ANY authenticated user can manage board meetings', severity: 'CRITICAL', cwe: 'CWE-269' }
  ];

  const warnings = [
    { table: 'board_meeting_attendance', issue: 'USING(true) on all CRUD policies', severity: 'HIGH' },
    { gap: 'No fn_is_chairman() function exists', severity: 'HIGH', remediation: 'Create function first' },
    { gap: 'No app_config table exists', severity: 'HIGH', remediation: 'Create app_config table with chairman_user_id' },
    { gap: 'SECURITY DEFINER without search_path', severity: 'MEDIUM', function: 'fn_sync_venture_to_chairman_decisions()', remediation: 'Add SET search_path = public' }
  ];

  const recommendations = [
    'CRITICAL: Create app_config table and fn_is_chairman() function BEFORE implementing RLS fixes',
    'CRITICAL: Replace USING(true) on chairman_decisions with fn_is_chairman() predicate',
    'CRITICAL: Replace USING(true) on venture_decisions with venture-scoped predicate',
    'HIGH: Replace USING(true) on board_* tables with fn_is_chairman() predicate',
    'MEDIUM: Add SET search_path = public to SECURITY DEFINER functions',
    'LOW: Document single-user vs multi-tenant decision'
  ];

  const detailedAnalysis = `
# SECURITY ASSESSMENT: SD-HARDENING-V1-001 - RLS Security Hardening (ehg repo)

## Executive Summary
**Verdict: WARNING** - Multiple tables have CRITICAL security vulnerabilities with USING(true) RLS policies.

## Current Vulnerability Severity: CRITICAL

### Tables with USING(true) Policies (Allowing ANY authenticated user full access):

1. **chairman_decisions** (CRITICAL)
   - File: supabase/migrations/20251216000001_chairman_unified_decisions.sql
   - Policies: SELECT, INSERT, UPDATE all use USING(true)
   - Impact: ANY authenticated user can read/write ALL chairman decisions including executive gate approvals
   - CWE: CWE-862 (Missing Authorization)

2. **venture_decisions** (CRITICAL)
   - File: supabase/migrations/20251218_create_venture_decisions_table.sql
   - Policies: SELECT, INSERT, UPDATE all use USING(true)
   - Impact: ANY authenticated user can read/write ALL venture decisions for ANY venture
   - CWE: CWE-862 (Missing Authorization)

3. **board_members** (CRITICAL)
   - File: database/migrations/20251011_board_governance_mvp.sql
   - Policies: All CRUD operations use USING(true)
   - Impact: ANY authenticated user can manage board membership, modify voting weights
   - CWE: CWE-269 (Improper Privilege Management)

4. **board_meetings** (CRITICAL)
   - File: database/migrations/20251011_board_governance_mvp.sql
   - Policies: All CRUD operations use USING(true)
   - Impact: ANY authenticated user can create/modify/delete board meetings
   - CWE: CWE-269 (Improper Privilege Management)

5. **board_meeting_attendance** (HIGH)
   - File: database/migrations/20251011_board_governance_mvp.sql
   - Impact: ANY authenticated user can manipulate meeting attendance records

## Proposed Solution Review

### fn_is_chairman() Function
- **Status**: NOT_IMPLEMENTED
- **Assessment**: Function is REFERENCED in middleware but NOT CREATED in database
- **Files Referencing**:
  - src/middleware/chairman-auth.ts (line 75)
  - src/pages/api/v2/stream/global.ts (line 48)
  - src/pages/api/v2/stream/venture/[id].ts (line 57)
- **Recommendation**: MUST create fn_is_chairman() function BEFORE enforcing RLS policies

### app_config Table Approach
- **Status**: NOT_IMPLEMENTED
- **Assessment**: app_config table does NOT EXIST in current schema
- **Recommendation**: Create app_config table with strict RLS (service_role only for writes)
- **Security Considerations**:
  - app_config must be immutable by regular users
  - Only service_role should be able to modify chairman_user_id
  - Add audit trail for config changes

### Venture-Scoped Approach
- **Status**: PARTIALLY_IMPLEMENTED
- **Good Examples**:
  - stage_dependencies uses company_id join
  - technical_artifacts uses company access pattern
- **Recommendation**: Apply consistent venture-scoped pattern to decision tables

## Security Gaps Identified

1. **No fn_is_chairman() function exists** (HIGH)
   - Cannot implement chairman-only policies until function is created
   - Remediation: Create function first, then create chairman-only policies

2. **No app_config table exists** (HIGH)
   - No way to identify chairman user_id in database layer
   - Remediation: Create app_config table with chairman_user_id before RLS policies

3. **SECURITY DEFINER trigger function without search_path** (MEDIUM)
   - Function: fn_sync_venture_to_chairman_decisions()
   - Impact: Potential search_path hijacking vulnerability
   - Remediation: Add SET search_path = public to SECURITY DEFINER function

4. **No DELETE policy on venture_decisions** (LOW)
   - May be intentional for audit trail
   - Remediation: Add explicit DELETE policy or document why missing

## Recommended Implementation Order

1. Create app_config table with proper RLS (service_role only for writes)
2. Insert chairman_user_id configuration value
3. Create fn_is_chairman() SECURITY DEFINER function
4. Update chairman_decisions RLS to use fn_is_chairman() for INSERT/UPDATE
5. Update venture_decisions RLS to use venture-scoped pattern
6. Update board_* tables RLS to use fn_is_chairman() pattern
7. Add search_path to SECURITY DEFINER trigger function

## Additional Security Recommendations

- Ensure fn_is_chairman() checks auth.uid() IS NOT NULL first
- Add audit trigger to chairman_decisions for all modifications
- Document that EHG is single-user (Rick-only) but design for multi-tenant in case of future expansion
- Add RLS policy tests using different user contexts
`.trim();

  // Use insert instead of upsert since there's no unique constraint
  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .insert({
      sd_id: 'SD-HARDENING-V1-001',
      sub_agent_code: 'SECURITY',
      sub_agent_name: 'Chief Security Architect',
      verdict: 'WARNING',
      confidence: 95,
      critical_issues: criticalIssues,
      warnings: warnings,
      recommendations: recommendations,
      detailed_analysis: detailedAnalysis,
      execution_time: 0,
      metadata: {
        model: 'claude-opus-4-5-20251101',
        assessment_type: 'RLS_SECURITY_HARDENING',
        tables_assessed: 5,
        critical_findings: 4,
        high_findings: 1,
        proposed_solution_status: {
          fn_is_chairman: 'NOT_IMPLEMENTED',
          app_config: 'NOT_IMPLEMENTED',
          venture_scoped: 'PARTIALLY_IMPLEMENTED'
        }
      }
    })
    .select();

  if (error) {
    console.error('Failed to store assessment:', error);
    process.exit(1);
  }

  console.log('Security assessment stored successfully');
  console.log('Result:', JSON.stringify(data, null, 2));
}

storeSecurityAssessment();
