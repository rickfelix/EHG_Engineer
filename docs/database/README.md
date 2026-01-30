# Database Documentation

This directory contains database schema documentation, RLS policies, and database architecture guides.

## Purpose

Database documentation includes:
- **Schema diagrams**: Entity relationship diagrams
- **Table documentation**: Column descriptions and constraints
- **RLS policies**: Row-level security policy documentation
- **Database patterns**: Best practices and design patterns
- **Performance guidelines**: Indexing and query optimization

## Contents

### Schema Documentation
- Table schemas and relationships
- Column types and constraints
- Foreign key relationships
- Index definitions

### RLS Policies
- Policy definitions per table
- Access control patterns
- Service role bypass scenarios
- Policy testing strategies

### Architecture
- Database design decisions
- Normalization rationale
- Partitioning strategies
- Scaling considerations

## Database Overview

### Core Tables

**Strategic Directives**:
- `strategic_directives` - Main SD records
- `sd_phase_handoffs` - Inter-phase handoffs
- `sd_user_stories` - User story decomposition
- `sd_deliverables` - Expected deliverables

**Venture Management**:
- `ventures` - Venture/project records
- `venture_stages` - Stage progression tracking

**Testing & Quality**:
- `e2e_test_records` - E2E test results
- `retrospectives` - Implementation retrospectives

**LEO Protocol**:
- `leo_protocol_versions` - Protocol version tracking
- `leo_protocol_sections` - CLAUDE.md content sections

**Session Management**:
- `claude_sessions` - Active Claude Code sessions
- `v_active_sessions` - Enhanced session view with heartbeat monitoring

### Enhanced Views

#### v_active_sessions

Provides real-time session monitoring with heartbeat-based staleness detection (SD-LEO-INFRA-MULTI-SESSION-COORDINATION-001).

**New Computed Fields**:
- `heartbeat_age_seconds`: Seconds since last heartbeat
- `heartbeat_age_minutes`: Minutes since last heartbeat
- `heartbeat_age_human`: Human-readable age ("30s ago", "2m ago", "1h ago")
- `seconds_until_stale`: Countdown to 5-minute stale threshold
- `computed_status`: Session status based on heartbeat:
  - `active`: Has SD claim and heartbeat <300s
  - `stale`: Heartbeat >300s (5 minutes)
  - `idle`: No SD claim
  - `released`: Session released
- `claim_duration_minutes`: How long SD has been claimed

**Stale Detection**:
Sessions with no heartbeat for >300 seconds (5 minutes) are automatically marked as `stale`.

**Usage**:
```sql
-- Find stale sessions
SELECT session_id, sd_id, heartbeat_age_human, seconds_until_stale
FROM v_active_sessions
WHERE computed_status = 'stale';

-- Monitor session health
SELECT session_id, sd_id, heartbeat_age_seconds, computed_status
FROM v_active_sessions
WHERE computed_status != 'released'
ORDER BY heartbeat_age_seconds DESC;
```

See: [Heartbeat Manager Reference](../reference/heartbeat-manager.md)

## Common Queries

### Check RLS Policies
```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### View Table Structure
```sql
\d+ table_name
```

### Check Indexes
```sql
SELECT * FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

## Best Practices

1. **Always use RLS**: Every table should have RLS policies
2. **Service role for admin**: Use service role key for bypass operations
3. **Index foreign keys**: Add indexes to all foreign key columns
4. **Validate constraints**: Use CHECK constraints for data integrity
5. **Document policies**: Add comments to all RLS policies

## RLS Bypass Pattern

For operations requiring RLS bypass:
```javascript
// Use service role key
const supabase = createClient(url, SERVICE_ROLE_KEY);

// Or use RPC function
const { data } = await supabase.rpc('function_with_security_definer');
```

## Migrations

Database schema changes are managed via migrations in `/database/migrations/`.

See `/database/migrations/README.md` for migration guidelines.

### Recent Migrations

- **2026-01-30**: [Multi-Session Pessimistic Locking](migrations/multi-session-pessimistic-locking.md) - Database-level single active claim constraint, heartbeat monitoring, and automatic is_working_on synchronization (SD-LEO-INFRA-MULTI-SESSION-COORDINATION-001)
- **2026-01-30**: [Baseline Constraint Fixes](migrations/baseline-constraint-fixes-2026-01-30.md) - Fixed sub-agent verdict constraints, risk assessment phase constraints, and added metadata column to retrospectives (BL-INF-2337A-D)

### Manual Migrations

Critical hotfixes and function updates that bypass the normal migration system are documented in `/database/manual-updates/`.

**When to use manual migrations**:
- Updating existing PL/pgSQL functions (CREATE OR REPLACE FUNCTION)
- Fixing triggers that require immediate application
- Critical production hotfixes
- Complex data transformations requiring human verification

See [Manual Migrations README](../../database/manual-updates/README.md) for execution guidelines and migration index.

## Related Documentation

- `/database/migrations/` - Schema migration files
- `/docs/reference/database-agent-patterns.md` - Database agent patterns
- `/docs/reference/database-migration-validation.md` - Migration validation
- `/docs/reference/unified-handoff-system.md` - Handoff table documentation

## Supabase Dashboard

Access live database:
- **Project**: dedlbzhpgkmetvhbkyzq (EHG_Engineer)
- **Dashboard**: https://app.supabase.com/project/dedlbzhpgkmetvhbkyzq

---

*Part of LEO Protocol v4.3.3 - Database-First Architecture*
*Updated: 2025-12-29*
