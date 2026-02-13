---
name: migration-safety
version: 1.0.0
triggers: [migration, migrate, alter table, drop, rename column, schema change]
context_keywords: [database, infrastructure]
required_tools: [Bash, Read, Write]
context_access: full
agent_scope: [DATABASE]
dependencies: [schema-design]
---
# Migration Safety Patterns

When writing database migrations:

1. **Use IF NOT EXISTS / IF EXISTS** guards for idempotent migrations
2. **Never DROP without backup** - always create a backup migration step
3. **Test migrations** against a snapshot before applying to production
4. **Add rollback SQL** in comments at the bottom of each migration file
5. **Name migrations** with date prefix: `YYYYMMDD_description.sql`
6. **Validate column references** in trigger functions after schema changes

### Two-Phase Migration Pattern
```sql
-- Phase 1: Add new column (non-breaking)
ALTER TABLE target ADD COLUMN IF NOT EXISTS new_col TYPE DEFAULT value;

-- Phase 2: Migrate data (separate migration)
UPDATE target SET new_col = compute_from(old_col) WHERE new_col IS NULL;
```
