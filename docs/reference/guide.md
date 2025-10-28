# Database Migration Pre-Flight Checklist

**Generated**: 2025-10-28T21:47:56.052Z
**Source**: Database (leo_protocol_sections)
**Context Tier**: REFERENCE

---

**Database Migration Pre-Flight Checklist (MANDATORY)**:

**Before attempting ANY migration**:
1. Read established pattern: `scripts/lib/supabase-connection.js`
2. Verify connection: Region aws-1, Port 5432, SSL config
3. Use helper functions: `createDatabaseClient`, `splitPostgreSQLStatements`
4. Validate migration file: No cross-schema FKs, correct RLS syntax
5. Handle conflicts: Check existing tables, use CASCADE carefully

**Anti-Patterns to AVOID**:
- Using psql without understanding connection format
- Trial-and-error with regions/ports/SSL
- Not handling "already exists" errors

**Complete Guide**: See `docs/reference/migration-preflight.md`

---

*This is reference documentation, load on-demand only*
*Generated from: scripts/generate-claude-md-from-db-v3.js*
