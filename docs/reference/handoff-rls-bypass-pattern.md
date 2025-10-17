# Handoff Creation: RLS Bypass Pattern

**Generated**: 2025-10-14T01:31:51.210Z
**Source**: Database (leo_protocol_sections)
**Context Tier**: REFERENCE

---

**Handoff RLS Bypass**: Use direct PostgreSQL to bypass RLS policies.

**Issue**: RLS blocks INSERT with ANON_KEY
**Solution**: Direct connection via `createDatabaseClient` helper
```javascript
import { createDatabaseClient } from '../lib/supabase-connection.js';
const client = await createDatabaseClient('engineer', { verify: true });
```

**Full Pattern**: See `docs/reference/handoff-rls-bypass.md`

---

*This is reference documentation, load on-demand only*
*Generated from: scripts/generate-claude-md-from-db-v3.js*
