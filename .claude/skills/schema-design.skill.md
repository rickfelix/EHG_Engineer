---
name: schema-design
version: 1.0.0
triggers: [schema, table, column, create table, alter table, add column, database design]
context_keywords: [database, infrastructure, migration]
required_tools: [Bash, Read]
context_access: readonly
agent_scope: [DATABASE]
dependencies: []
---
# Schema Design Patterns

When designing database schemas for this project:

1. **Use UUID primary keys** with `gen_random_uuid()` default
2. **Always add timestamps**: `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at TIMESTAMPTZ`
3. **Add CHECK constraints** for enum-like columns instead of using VARCHAR
4. **Use JSONB** for flexible metadata fields, with GIN indexes for querying
5. **Name tables in snake_case**, columns in snake_case
6. **Add COMMENT ON** for tables and non-obvious columns
7. **Create update timestamp triggers** for tables with `updated_at`

### Proven Pattern (PAT-001)
Always verify existing schema before modifications:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'target_table'
ORDER BY ordinal_position;
```
