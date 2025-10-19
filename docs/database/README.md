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

*Part of LEO Protocol v4.2.0 - Database-First Architecture*
