# RLS Policy Catalog

Row Level Security (RLS) policy reference for EHG_Engineer database.

---

## Security Model Overview

### Roles

| Role | Description | Access Level |
|------|-------------|--------------|
| `anon` | Anonymous/unauthenticated | Read-only on public data |
| `authenticated` | Logged-in users via Supabase Auth | CRUD on owned resources |
| `service_role` | Backend service key | Full access, bypasses RLS |

### Authentication

RLS policies use Supabase Auth functions:
- `auth.uid()` - Returns current user's UUID
- `auth.role()` - Returns current role
- `auth.jwt()` - Returns full JWT claims

---

## Policy Patterns

### Pattern 1: Authenticated Read, Service Write

**Use for**: System tables, configuration, protocol data

```sql
-- Enable RLS
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users
CREATE POLICY "Authenticated users can view"
ON table_name FOR SELECT TO authenticated USING (true);

-- Write access for service role only
CREATE POLICY "Service role can manage"
ON table_name FOR ALL TO service_role USING (true) WITH CHECK (true);
```

**Applied to**:
- `strategic_directives_v2`
- `product_requirements_v2`
- `leo_protocols`
- `leo_sub_agents`
- `leo_protocol_sections`
- `failure_patterns`
- `skills_inventory`

### Pattern 2: User-Owned Resources

**Use for**: User-created content, personal data

```sql
-- Enable RLS
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

-- Users can only access their own records
CREATE POLICY "Users can manage own records"
ON table_name FOR ALL TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- Service role has full access
CREATE POLICY "Service role full access"
ON table_name FOR ALL TO service_role USING (true);
```

**Applied to**:
- `directive_submissions`
- `sdip_submissions`
- `user_preferences`

### Pattern 3: Organization-Scoped

**Use for**: Multi-tenant data

```sql
-- Enable RLS
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

-- Users can access records in their organization
CREATE POLICY "Organization members can access"
ON table_name FOR ALL TO authenticated
  USING (
    organization_id IN (
      SELECT org_id FROM user_organizations
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT org_id FROM user_organizations
      WHERE user_id = auth.uid()
    )
  );
```

**Applied to**:
- `ventures`
- `venture_artifacts`
- `intake_submissions`

### Pattern 4: Public Read, Authenticated Write

**Use for**: Public reference data

```sql
-- Enable RLS
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

-- Anyone can read
CREATE POLICY "Public read access"
ON table_name FOR SELECT TO anon, authenticated USING (true);

-- Only authenticated can write
CREATE POLICY "Authenticated can write"
ON table_name FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update"
ON table_name FOR UPDATE TO authenticated USING (true);
```

**Applied to**:
- `public_reference_data`
- `shared_templates`

### Pattern 5: Chairman/Admin Only

**Use for**: Sensitive administrative functions

```sql
-- Enable RLS
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

-- Only users with chairman role
CREATE POLICY "Chairman only access"
ON table_name FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role = 'chairman'
    )
  );
```

**Applied to**:
- `chairman_decisions`
- `compliance_policies`
- `circuit_breaker_blocks`

---

## Tables by Domain

### Strategic Directives Domain

| Table | RLS Enabled | Pattern | Notes |
|-------|-------------|---------|-------|
| `strategic_directives_v2` | ✅ | Pattern 1 | Core SD table |
| `sd_phase_handoffs` | ✅ | Pattern 1 | Handoff records |
| `sd_backlog_map` | ✅ | Pattern 1 | Backlog items |
| `strategic_directives_backlog` | ✅ | Pattern 1 | Backlog view |

### Product Requirements Domain

| Table | RLS Enabled | Pattern | Notes |
|-------|-------------|---------|-------|
| `product_requirements_v2` | ✅ | Pattern 1 | PRD storage |
| `product_requirements_v3` | ✅ | Pattern 1 | Latest PRD format |
| `prd_quality_scores` | ✅ | Pattern 1 | Quality metrics |

### LEO Protocol Domain

| Table | RLS Enabled | Pattern | Notes |
|-------|-------------|---------|-------|
| `leo_protocols` | ✅ | Pattern 1 | Protocol versions |
| `leo_sub_agents` | ✅ | Pattern 1 | Sub-agent config |
| `leo_protocol_sections` | ✅ | Pattern 1 | Section content |
| `leo_pattern_triggers` | ✅ | Pattern 1 | Trigger patterns |

### Agent System Domain

| Table | RLS Enabled | Pattern | Notes |
|-------|-------------|---------|-------|
| `agent_artifacts` | ✅ | Pattern 1 | Agent outputs |
| `agent_task_contracts` | ✅ | Pattern 1 | Task assignments |
| `agent_runs` | ✅ | Pattern 1 | Run history |

### Quality Domain

| Table | RLS Enabled | Pattern | Notes |
|-------|-------------|---------|-------|
| `retrospectives` | ✅ | Pattern 1 | Retro records |
| `ai_quality_assessments` | ✅ | Pattern 1 | AI assessments |
| `lessons_learned` | ✅ | Pattern 1 | Learning records |

### Ventures Domain

| Table | RLS Enabled | Pattern | Notes |
|-------|-------------|---------|-------|
| `ventures` | ✅ | Pattern 3 | Venture records |
| `venture_artifacts` | ✅ | Pattern 3 | Venture outputs |
| `venture_stage_work` | ✅ | Pattern 3 | Stage progress |
| `opportunity_blueprints` | ✅ | Pattern 1 | AI opportunities |

### Skills Domain

| Table | RLS Enabled | Pattern | Notes |
|-------|-------------|---------|-------|
| `skills_inventory` | ✅ | Pattern 1 | Skill catalog |
| `skill_assignments` | ✅ | Pattern 1 | Skill mappings |

### Compliance Domain

| Table | RLS Enabled | Pattern | Notes |
|-------|-------------|---------|-------|
| `compliance_policies` | ✅ | Pattern 5 | Policy rules |
| `circuit_breaker_blocks` | ✅ | Pattern 5 | Safety blocks |

### Submissions Domain

| Table | RLS Enabled | Pattern | Notes |
|-------|-------------|---------|-------|
| `directive_submissions` | ✅ | Pattern 2 | SDIP submissions |
| `intake_submissions` | ✅ | Pattern 3 | Intake wizard |

---

## Migration Reference

### Enabling RLS on New Tables

Always include in migrations:

```sql
-- 1. Enable RLS
ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;

-- 2. Add policies (choose appropriate pattern)
CREATE POLICY "authenticated_read"
ON new_table FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_write"
ON new_table FOR ALL TO service_role USING (true);
```

### Key RLS Migrations

| Migration | Purpose |
|-----------|---------|
| `20251214_add_missing_rls_policies.sql` | Initial RLS coverage |
| `20251217_rls_security_hardening.sql` | Security improvements |
| `20251218_hardening_v2_001a_rls_policies.sql` | Further hardening |
| `20251227_complete_rls_coverage.sql` | Complete coverage |
| `20251227_context_usage_rls_hotfix.sql` | Context table fix |

---

## Verification Queries

### Check Tables Without RLS

```sql
SELECT schemaname, tablename
FROM pg_tables
WHERE schemaname = 'public'
AND tablename NOT IN (
  SELECT tablename
  FROM pg_policies
  WHERE schemaname = 'public'
);
```

### List All Policies

```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### Check Policy Coverage

```sql
SELECT
  t.tablename,
  COUNT(p.policyname) as policy_count,
  CASE WHEN COUNT(p.policyname) > 0 THEN 'Covered' ELSE 'MISSING' END as status
FROM pg_tables t
LEFT JOIN pg_policies p ON t.tablename = p.tablename AND t.schemaname = p.schemaname
WHERE t.schemaname = 'public'
GROUP BY t.tablename
ORDER BY policy_count, t.tablename;
```

---

## Troubleshooting

### Common Issues

#### 1. Permission Denied

**Symptom**: `permission denied for table X`

**Cause**: User doesn't match RLS policy conditions

**Fix**:
- Verify user is authenticated
- Check if user owns the resource
- Use service_role for admin operations

#### 2. No Rows Returned

**Symptom**: Query returns empty when data exists

**Cause**: RLS filtering out all rows

**Fix**:
- Check policy USING clause
- Verify auth.uid() returns expected value
- Test with service_role to confirm data exists

#### 3. Insert Fails

**Symptom**: `new row violates row-level security policy`

**Cause**: WITH CHECK clause fails

**Fix**:
- Verify created_by or organization_id is set correctly
- Ensure user has permission to write

### Bypassing RLS (Development Only)

```sql
-- Temporarily disable for testing
SET session_replication_role = replica;

-- Re-enable
SET session_replication_role = DEFAULT;
```

**Warning**: Never use in production!

---

## Best Practices

### Do

- ✅ Enable RLS on ALL new tables
- ✅ Use service_role for migrations and admin scripts
- ✅ Test policies with authenticated users
- ✅ Use pattern-based policies for consistency
- ✅ Document custom policies

### Don't

- ❌ Use USING (true) for all operations
- ❌ Forget service_role access for automation
- ❌ Bypass RLS in production code
- ❌ Mix patterns on single table
- ❌ Create overly permissive policies

---

## Audit Checklist

- [ ] All tables have RLS enabled
- [ ] Each table has at least SELECT policy
- [ ] Service role has full access for automation
- [ ] User-owned tables check created_by
- [ ] Multi-tenant tables check organization_id
- [ ] Admin tables check role permissions
- [ ] No USING (true) on sensitive write operations

---

## Related Documentation

- [Database README](../../database/README.md)
- [Database Agent Patterns](database-agent-patterns.md)
- [Migration Checklist](../guides/database-migration-checklist.md)

---

*Last Updated: 2026-01-03*
