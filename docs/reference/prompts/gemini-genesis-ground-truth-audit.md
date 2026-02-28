---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Gemini Ground-Truth Audit Prompt: Genesis System


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: database, api, migration, schema

**Copy everything below this line to send to Gemini:**

---

# Genesis System Ground-Truth Audit

You are auditing the Genesis system in the EHG codebase. Your task is to determine what ACTUALLY EXISTS and WORKS vs. what is merely PLANNED or DOCUMENTED.

## CRITICAL: Evidence-Based Analysis Only

**You MUST classify every feature as one of:**

| Status | Definition | Required Evidence |
|--------|------------|-------------------|
| **WORKS** | Code exists + integrated + user can trigger it | API endpoint, UI button, or CLI that calls it |
| **DISCONNECTED** | Code exists but nothing calls it | Function defined but no entry point |
| **STUBBED** | Function exists but returns placeholder | TODO, hardcoded values, empty implementation |
| **PLANNED** | In documentation only | Only in .md files, no code |
| **MISSING** | Not found anywhere | No file, no function, no docs |

**For EVERY claim, you MUST provide:**
1. File path
2. Line number(s)
3. 3-5 line code snippet
4. Classification with justification

---

## Part 1: File Existence Verification

For each file, state **EXISTS** or **DOES NOT EXIST** with proof:

### Scripts (`/scripts/genesis/`):
- genesis-pipeline.js
- genesis-gate.js
- soul-extractor.js
- production-generator.js
- regeneration-gate.js
- repo-creator.js

### API Endpoints (`/src/pages/api/genesis/`):
- create.ts
- ratify.ts
- status.ts
- incinerate.ts

### Library Modules (`/lib/genesis/`):
List ALL .js files that exist in this directory.

---

## Part 2: Stage 16/17 Verification

Answer with file:line evidence:

**Q1: What component does `CompleteWorkflowOrchestrator.tsx` use for Stage 16?**
- Find the import statement (exact line)
- Find the case/switch that renders it (exact line)
- What is the component name?

**Q2: What component does it use for Stage 17?**
- Same evidence required

**Q3: Does the orchestrator import from `venture-workflow.ts`?**
- Search for any import from this file
- Answer YES with line number, or NO

**Q4: Do Stage16SchemaFirewall.tsx or Stage17EnvironmentConfig.tsx call Genesis library functions?**
- Search for imports from `lib/genesis/`
- Search for calls to: extractSoul, regenerate, generateProduction
- Report what you find

---

## Part 3: Critical Implementation Questions

**Q1: How does a user CREATE a simulation today?**
- Find the entry point (API endpoint or UI component)
- If none exists, state: "NO ENTRY POINT - users cannot create simulations"

**Q2: Does PRD generation work or is it stubbed?**
- Find the generatePRD function
- Does it call an LLM API or return hardcoded text?
- Classify as WORKS or STUBBED

**Q3: What triggers soul extraction at Stage 16?**
- Find code that executes when venture reaches Stage 16
- Does it call soul-extractor or similar?
- If not, state: "NO SOUL EXTRACTION TRIGGER"

**Q4: Is TTL cleanup automated?**
- Find any cron job, scheduler, or trigger for expired simulations
- If none, state: "NO AUTOMATED CLEANUP"

---

## Part 4: DO NOT USE AS IMPLEMENTATION EVIDENCE

These files describe plans, NOT working code:
- `/docs/*` - Documentation
- `GENESIS_OATH_V3.md` - Vision document
- `GENESIS_VIRTUAL_BUNKER_ADDENDUM.md` - Architecture doc
- `create-*.js`, `setup-*.js` - SD creation scripts (these CREATE planning, not implementation)
- `*.test.ts` - Tests don't prove production code works
- `database/migrations/*.sql` - Schema doesn't mean business logic exists

---

## Part 5: Output Format

### File Existence Table
| File | Status | Path |
|------|--------|------|
| genesis-pipeline.js | EXISTS/MISSING | /scripts/genesis/ |
| ... | ... | ... |

### Feature Status Table
| Feature | Status | Evidence (file:line) | Entry Point |
|---------|--------|---------------------|-------------|
| Create simulation | WORKS/DISCONNECTED/STUBBED/PLANNED/MISSING | path:123 | Yes/No |
| PRD generation | ... | ... | ... |
| Stage 16 soul extraction | ... | ... | ... |
| Stage 17 regeneration | ... | ... | ... |
| TTL cleanup | ... | ... | ... |

### Stage 16/17 Integration
```
Orchestrator uses for Stage 16: [Component name] (file:line)
Orchestrator uses for Stage 17: [Component name] (file:line)
SSOT defines Stage 16 as: [Name from venture-workflow.ts]
SSOT defines Stage 17 as: [Name from venture-workflow.ts]
Match: YES/NO
```

### Vision Alignment Score: X/10

**Scoring Rules:**
- WORKS with entry point = 1 point
- DISCONNECTED = 0.5 points
- STUBBED/PLANNED/MISSING = 0 points

**Score Justification:**
[Explain score based on IMPLEMENTATION evidence, not documentation]

### Key Finding
[What is the biggest discrepancy between documentation and implementation?]

---

## Verification Checklist (Complete Before Submitting)

- [ ] Every claim has file:line evidence
- [ ] No scores based on documentation alone
- [ ] Entry points verified for "WORKS" features
- [ ] Stage 16/17 orchestrator imports checked
- [ ] Regeneration script existence verified (not assumed)

---

*End of prompt*
