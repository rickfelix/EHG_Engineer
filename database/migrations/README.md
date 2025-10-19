# Database Migrations

This directory contains SQL migration files for the EHG_Engineer database schema.

## Purpose

Database migrations track incremental changes to the database schema, allowing version control of the database structure and enabling reproducible deployments.

## File Naming Convention

```
YYYYMMDD_descriptive_name.sql
```

**Examples**:
- `20251019_create_handoff_tables.sql`
- `20251015_add_phase_tracking.sql`

## Migration Types

1. **Schema changes**: Tables, columns, indexes
2. **Data migrations**: Transforming or moving existing data
3. **Function updates**: PostgreSQL functions and triggers
4. **RLS policies**: Row-level security policy changes

## Running Migrations

### Via Supabase CLI
```bash
# Apply all pending migrations
supabase db push

# Create a new migration
supabase migration new migration_name

# Reset database (destructive)
supabase db reset
```

### Manual Application
```bash
# Connect to database
psql $DATABASE_URL

# Apply migration
\i database/migrations/YYYYMMDD_migration_name.sql
```

## Best Practices

1. **Always test migrations** in development before production
2. **Include rollback steps** in comments if possible
3. **Never modify existing migrations** that have been deployed
4. **Use transactions** to ensure atomic changes
5. **Document breaking changes** in migration comments
6. **Validate RLS policies** after schema changes

## Migration Validation

Before committing migrations:
- [ ] Migration runs successfully on fresh database
- [ ] Migration is idempotent (can run multiple times)
- [ ] RLS policies updated for new tables/columns
- [ ] Indexes added for foreign keys and common queries
- [ ] Functions/triggers tested
- [ ] Documentation updated

## Troubleshooting

- **Migration fails**: Check logs in `supabase/debug.log`
- **RLS blocking queries**: Verify service role vs anon key usage
- **Constraint violations**: Check for existing data conflicts
- **Performance issues**: Add indexes before large data migrations

## Related Documentation

- `/docs/reference/database-migration-validation.md` - Validation patterns
- `/docs/reference/database-agent-patterns.md` - Database agent guidance
- `/DEVELOPMENT_WORKFLOW.md` - Overall development workflow

---

*Part of LEO Protocol v4.2.0 - Database-First Architecture*
