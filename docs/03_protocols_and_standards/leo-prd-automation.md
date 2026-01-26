# LEO Protocol - Automatic PRD Generation


## Metadata
- **Category**: Protocol
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-23
- **Tags**: database, api, schema, security

**Integration Date**: 2025-10-19
**Last Updated**: 2026-01-23
**Status**: **PRODUCTION READY**
**Automation Level**: **100% Automatic (LLM-Based)**
**Consolidation SD**: SD-LEO-INFRA-PRD-CREATION-CONSOLIDATION-001

---

## Overview

The LEO Protocol **automatically generates PRDs with LLM-derived content** when LEAD approves a Strategic Directive. This is a fully automated process with no TODO placeholders.

**Key Features**:
- LLM-based content generation from SD fields
- Sub-agent orchestration (DESIGN, DATABASE, SECURITY, RISK)
- Persona ingestion for stakeholder awareness
- Component recommendations (semantic UI matching)
- No manual editing required for initial PRD

---

## Canonical Method

**Single Entry Point**:
```bash
node scripts/add-prd-to-database.js <SD-ID> [PRD-Title]
```

This delegates to `scripts/prd/index.js` which provides:
- LLM-powered content generation
- SD field derivation (functional requirements from strategic_objectives)
- Automatic sub-agent orchestration
- Persona and component analysis

**npm Shortcut**:
```bash
npm run prd:new <SD-ID> [PRD-Title]
```

---

## Automatic Workflow

### Complete LEAD→PLAN Flow

```
1. LEAD Agent approves Strategic Directive
   ↓
2. Creates LEAD-to-PLAN handoff
   → node scripts/handoff.js execute LEAD-TO-PLAN SD-XXX
   ↓
3. AUTOMATIC: PRD creation triggers
   → Fetches SD details from database
   → Derives content from SD fields (objectives, changes, criteria)
   → Generates LLM-enhanced requirements
   → Executes sub-agents (DESIGN, DATABASE, SECURITY, RISK)
   → Creates PRD in database with full content
   ↓
4. PRD ready for PLAN→EXEC handoff
   → No manual editing required
   → User stories auto-generated
   → Component recommendations included
```

---

## What Gets Automated

### 100% Automatic

| Step | Status | Details |
|------|--------|---------|
| PRD creation | **Automatic** | Creates PRD entry in database |
| Content generation | **Automatic** | LLM derives from SD fields |
| Functional requirements | **Automatic** | Extracted from strategic_objectives, key_changes |
| Test scenarios | **Automatic** | Derived from success_criteria |
| Acceptance criteria | **Automatic** | Mapped from SD acceptance criteria |
| Sub-agent execution | **Automatic** | DESIGN, DATABASE, SECURITY, RISK |
| User story generation | **Automatic** | STORIES sub-agent triggered |
| Component recommendations | **Automatic** | Semantic UI matching |

**No TODO Placeholders**: Content is derived from SD fields, not filled with placeholders.

---

## Architecture

### Component Diagram

```
LEAD Agent
    ↓
  Creates LEAD-to-PLAN Handoff
    ↓
handoff.js (lead-to-plan executor)
    ├─ Validates handoff
    ├─ Records success
    └─ prd-generation.js → autoGeneratePRDScript()
        ↓
    add-prd-to-database.js (Canonical Method)
        ↓
    scripts/prd/index.js
        ├─ Fetches SD from database
        ├─ Handles SD type detection
        ├─ Manages persona ingestion
        ├─ Creates initial PRD entry
        ├─ Executes sub-agent analyses
        │   ├─ DESIGN analysis
        │   ├─ DATABASE analysis
        │   ├─ SECURITY analysis
        │   └─ RISK analysis
        ├─ LLM-based PRD generation
        ├─ Component recommendations
        └─ Auto-invokes PLAN sub-agents
            └─ STORIES sub-agent
```

### Key Files

| File | Purpose |
|------|---------|
| `scripts/add-prd-to-database.js` | Canonical entry point (thin wrapper) |
| `scripts/prd/index.js` | Main implementation |
| `scripts/prd/llm-generator.js` | LLM content generation |
| `scripts/prd/sub-agent-orchestrator.js` | Sub-agent execution |
| `scripts/prd/prd-creator.js` | Database operations |
| `scripts/prd/formatters.js` | Content formatting |
| `scripts/prd/config.js` | LLM prompts and config |
| `scripts/modules/handoff/executors/lead-to-plan/prd-generation.js` | Handoff integration |

---

## Example Output

### LEAD→PLAN Handoff with Automatic PRD

```bash
$ node scripts/handoff.js execute LEAD-TO-PLAN SD-AUTH-001

[Handoff validation output...]

🤖 AUTO-CREATING PRD (Canonical Method)
======================================================================
   SD: Authentication System Implementation
   Method: add-prd-to-database.js (LLM-based, no TODOs)
   Running: node scripts/add-prd-to-database.js UUID-xxx "Authentication..."

Adding PRD for UUID-xxx to database...

   SD Type (current): feature
   SD Type (detected): feature (95% confidence)

=======================================================
PHASE 1: SUB-AGENT ANALYSES
=======================================================
   DESIGN analysis: ✅ Complete
   DATABASE analysis: ✅ Complete
   SECURITY analysis: ✅ Complete
   RISK analysis: ✅ Complete (Risk: 3/10 LOW)

=======================================================
PHASE 3: LLM-BASED PRD CONTENT GENERATION
=======================================================
   Found 0 existing user stories for consistency
   Generating PRD content via LLM...
   ✅ LLM PRD generation successful (7 functional requirements)

=======================================================
SEMANTIC COMPONENT RECOMMENDATIONS
=======================================================
   Found 5 component recommendations:
   1. Button (shadcn/ui) - Priority: CRITICAL
   2. Form (shadcn/ui) - Priority: CRITICAL
   [...]

=======================================================
AUTO-INVOKE: PLAN Phase Sub-Agents (orchestrate)
=======================================================
   Sub-agents completed successfully
   Executed: STORIES, DATABASE, RISK

✅ PRD created successfully with LLM-generated content!

PRD ID: PRD-SD-AUTH-001
Status: planning
Progress: 10%

Next steps:
1. Review sub-agent results (auto-invoked above)
2. Verify PRD metadata and component recommendations
3. Mark checklist items as complete
4. Run PLAN-TO-EXEC handoff when ready
```

---

## SD Field Derivation

The canonical method extracts PRD content from SD fields:

| SD Field | Derived PRD Content |
|----------|---------------------|
| `strategic_objectives` | Functional requirements |
| `key_changes` | Additional requirements |
| `success_criteria` | Acceptance criteria |
| `risks` | Risk analysis input |
| `dependencies` | Technical dependencies |
| `description` | Executive summary, context |
| `scope` | System architecture |

### Example Derivation

**SD strategic_objectives**:
```
1. Implement OAuth 2.0 with Google and GitHub providers
2. Add session management with JWT tokens
```

**Derived Functional Requirements**:
```javascript
[
  {
    id: 'FR-1',
    requirement: 'Implement: Implement OAuth 2.0 with Google and GitHub providers',
    description: 'Derived from SD strategic objective',
    priority: 'CRITICAL',
    acceptance_criteria: ['OAuth flow works with Google', 'OAuth flow works with GitHub']
  },
  {
    id: 'FR-2',
    requirement: 'Implement: Add session management with JWT tokens',
    description: 'Derived from SD strategic objective',
    priority: 'HIGH',
    acceptance_criteria: ['JWT tokens issued on login', 'Session persists across requests']
  }
]
```

---

## Consolidated vs Legacy Approach

### Consolidated (Current)

| Aspect | Value |
|--------|-------|
| Entry point | `add-prd-to-database.js` |
| Content | LLM-generated, derived from SD |
| Sub-agents | Auto-executed |
| Manual editing | Not required |
| TODO placeholders | None |

### Legacy (Archived)

| Aspect | Value |
|--------|-------|
| Entry point | `generate-prd-script.js` |
| Content | Static template with TODOs |
| Sub-agents | Manual invocation |
| Manual editing | Required |
| TODO placeholders | Throughout |

**Legacy scripts archived to**: `docs/archive/prd-scripts-legacy/`

---

## Configuration

### Environment Variables

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

# For LLM content generation
OPENAI_API_KEY=...

# Optional: Persona features
PERSONA_INGESTION_ENABLED=true
PERSONA_PROMPT_INJECTION_ENABLED=true
PERSONA_SOFT_GATE_ENABLED=true
```

### Manual Fallback

If automatic generation fails during handoff:
```bash
# Run canonical method directly
node scripts/add-prd-to-database.js SD-XXX-001 "PRD Title"

# Or via npm
npm run prd:new SD-XXX-001 "PRD Title"
```

---

## Metrics

### Automation Coverage

| Phase | Automation |
|-------|------------|
| PRD creation | 100% Automatic |
| Content generation | 100% Automatic (LLM) |
| Sub-agent execution | 100% Automatic |
| Schema validation | 100% Automatic |
| User story generation | 100% Automatic |

**Overall**: 100% automated PRD creation

### Quality Improvements

- **Zero TODO placeholders** - Content derived from SD
- **Consistent structure** - LLM follows quality rubric
- **Sub-agent analysis** - Design, database, security built-in
- **Component recommendations** - UI components suggested

---

## Related Documentation

- **Canonical Script**: `scripts/add-prd-to-database.js`
- **Modular Implementation**: `scripts/prd/index.js`
- **Schema Validator**: `lib/prd-schema-validator.js`
- **Handoff Integration**: `scripts/modules/handoff/executors/lead-to-plan/prd-generation.js`
- **Archive (Legacy)**: `docs/archive/prd-scripts-legacy/`

---

## History

| Date | Change |
|------|--------|
| 2025-10-19 | Initial template-based automation |
| 2026-01-23 | Consolidated to canonical LLM method (SD-LEO-INFRA-PRD-CREATION-CONSOLIDATION-001) |

---

**Status**: Production Ready
**Automation Level**: 100%
**Canonical Method**: `add-prd-to-database.js`
