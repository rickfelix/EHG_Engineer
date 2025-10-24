# Database-First Enforcement - Expanded

**Generated**: 2025-10-24T11:50:52.774Z
**Source**: Database (leo_protocol_sections)
**Context Tier**: REFERENCE

---

**Database-First Enforcement (MANDATORY)**:

**❌ NEVER create**: Strategic Directive files, PRD files, Retrospective files, Handoff documents, Verification reports

**✅ REQUIRED**: All data in database tables only
- SDs → `strategic_directives_v2`
- PRDs → `product_requirements_v2`
- Retrospectives → `retrospectives`
- Handoffs → `sd_phase_handoffs`

**Why**: Single source of truth, real-time updates, automated tracking, no file sync issues

**Verification**: `find . -name "SD-*.md" -o -name "PRD-*.md"` should return ONLY legacy files

---

*This is reference documentation, load on-demand only*
*Generated from: scripts/generate-claude-md-from-db-v3.js*
