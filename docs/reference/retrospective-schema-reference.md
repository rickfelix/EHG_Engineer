# Retrospective Table Schema Reference

**Generated**: 2025-10-14T01:31:51.212Z
**Source**: Database (leo_protocol_sections)
**Context Tier**: REFERENCE

---

**Retrospective Schema**: Critical field mappings to prevent constraint errors.

**Quick Reference:**
- `generated_by`: Must be 'MANUAL'
- `status`: Must be 'PUBLISHED'
- `team_satisfaction`: 1-10 scale (NOT 0-100)
- Array fields: Use arrays, NOT JSON.stringify()
- Boolean fields: true/false, NOT integers

**Common Errors**:
- Column "lessons_learned" not found → Use `key_learnings`
- Malformed array literal → Remove JSON.stringify()
- team_satisfaction_check violation → Use 1-10 scale

**Complete Schema**: See `docs/reference/retrospective-schema.md`

---

*This is reference documentation, load on-demand only*
*Generated from: scripts/generate-claude-md-from-db-v3.js*
