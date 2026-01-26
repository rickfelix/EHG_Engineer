# Database Trigger Management for Special Cases


## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, rls, protocol, leo

**Generated**: 2025-10-28T21:47:56.037Z
**Source**: Database (leo_protocol_sections)
**Context Tier**: REFERENCE

---

**Database Trigger Management**: Temporary trigger disable for special cases (infrastructure/protocol SDs).

**Safe Pattern**:
```javascript
// Step 1: Disable trigger
await client.query('ALTER TABLE ... DISABLE TRIGGER trigger_name');

// Step 2: Critical operation
await client.query('UPDATE ...');

// Step 3: Re-enable (ALWAYS in finally block)
await client.query('ALTER TABLE ... ENABLE TRIGGER trigger_name');
```

**When to Use**: Legitimate special cases, RLS blocking trigger validation, no other solution available

**Complete Pattern**: See `docs/reference/trigger-management.md`

---

*This is reference documentation, load on-demand only*
*Generated from: scripts/generate-claude-md-from-db-v3.js*
