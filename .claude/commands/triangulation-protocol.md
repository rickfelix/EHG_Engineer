# Ground-Truth Triangulation Protocol

## Purpose
Ensure multi-AI analysis (OpenAI, Gemini, Claude) produces accurate, evidence-based assessments by forcing verification of actual implementation vs. documentation claims.

## When to Use
- Auditing system implementation status
- Comparing AI analyses of codebase features
- Validating claims about feature completeness
- Any multi-model triangulation exercise

---

## The Problem

AIs routinely conflate:
| What They See | What They Claim | Reality |
|---------------|-----------------|---------|
| Documentation | "It's designed this way" | Design ≠ Implementation |
| Planning scripts | "There's a script for this" | Setup script ≠ Working feature |
| Commented code | "The pattern exists" | Comment ≠ Execution |
| Database schema | "The table exists" | Schema ≠ Business logic |
| Test files | "It's tested" | Test ≠ Production code |

---

## Ground-Truth Rules

### Rule 1: File Existence Verification
Before claiming a feature exists, verify the file exists:
```
✓ "File X EXISTS at path Y" (with ls or glob proof)
✗ "File X should exist based on the documentation"
```

### Rule 2: Implementation Status Categories
Every feature must be classified as:

| Status | Definition | Evidence Required |
|--------|------------|-------------------|
| **WORKS** | Code exists + integrated + has entry point | API route, UI button, or CLI command that triggers it |
| **DISCONNECTED** | Code exists but no integration | Function defined but never called by production code |
| **STUBBED** | Function exists but returns placeholder | TODO comments, hardcoded returns, empty implementations |
| **PLANNED** | Mentioned in docs but no code | Only appears in .md files, comments, or setup scripts |
| **MISSING** | Not found anywhere | No file, no function, no mention |

### Rule 3: Integration Requirements
A feature is only "integrated" if ALL of these are true:
- [ ] Has an entry point (API route, UI button, CLI command)
- [ ] Is called by other production code
- [ ] A user can trigger it without running scripts manually
- [ ] The code path executes end-to-end

### Rule 4: Citation Required
Every claim must include:
```
- File path: /src/path/to/file.ts
- Line number(s): 45-52
- Code snippet: [3-5 relevant lines]
- Classification: WORKS | DISCONNECTED | STUBBED | PLANNED | MISSING
```

### Rule 5: Exclusion List
Do NOT use these as evidence of implementation:
```
/docs/*                     # Documentation
**/create-*.js              # SD creation scripts
**/setup-*.js               # Setup scripts
**/vision/*.md              # Vision documents
**/roadmap/*.md             # Roadmaps
*.test.ts, *.spec.ts        # Test files (tests ≠ implementation)
database/migrations/*.sql   # Schema ≠ business logic
```

---

## Evidence Hierarchy

Most reliable to least reliable:

```
1. Working API endpoint with request/response logs
2. UI component rendered in active route (verified via browser)
3. Function called by production code (trace the call chain)
4. Function defined but never called (grep for usage)
5. Mentioned in documentation only
6. Not mentioned anywhere
```

---

## Standard Prompt Template for External AIs

Use this when sending to OpenAI, Gemini, or other models:

```markdown
# [SYSTEM NAME] Ground-Truth Audit

## Your Task
Audit the [SYSTEM] implementation. For each feature, classify as:
- WORKS: Code exists + integrated + has user entry point
- DISCONNECTED: Code exists + no integration path
- STUBBED: Function exists but placeholder/TODO
- PLANNED: In docs only, no code
- MISSING: Not found

## Evidence Requirements
For EVERY claim, provide:
1. File path where you found evidence
2. Line number(s)
3. 3-5 line code snippet
4. Your classification with justification

## Do NOT Trust as Implementation Evidence
- Documentation files (/docs/*)
- Vision/roadmap markdown files
- SD creation scripts (create-*.js, setup-*.js)
- Comments describing future work
- Database migrations (schema ≠ working code)
- Test files (tests ≠ production)

## Verification Questions
Before scoring any feature, answer:
1. Can a user trigger this from UI/CLI/API today?
2. Does the code path execute end-to-end?
3. What function calls connect entry point to implementation?

## Output Format
| Feature | Status | Evidence (file:line) | Entry Point | Call Chain |
|---------|--------|---------------------|-------------|------------|
| [name]  | [status] | path:123 | Yes/No | A→B→C or "None" |

## Scoring Rules
- Only score WORKS features with Entry Point = Yes
- DISCONNECTED = 0.5 points (exists but unusable)
- STUBBED/PLANNED/MISSING = 0 points
```

---

## Triangulation Workflow

### Step 1: External AIs First
Send the ground-truth prompt to external AIs (OpenAI, Gemini) BEFORE Claude Code analyzes.

### Step 2: Claude Code Validates
Claude Code (with codebase access) verifies disputed claims:
```bash
# For each disputed claim:
1. Check file existence: ls -la [path]
2. Check function calls: grep -r "functionName" --include="*.ts"
3. Check entry points: grep -r "api/route" or search for onClick handlers
4. Trace call chain from entry point to implementation
```

### Step 3: Produce Comparison Table
```markdown
| Claim | OpenAI | Gemini | Claude Code (Ground Truth) | Verdict |
|-------|--------|--------|---------------------------|---------|
| Feature X works | Yes | Yes | DISCONNECTED (no entry point) | INCORRECT |
| Stage 16 integrated | No | Yes | MISMATCH (different components) | OpenAI correct |
```

### Step 4: Score Adjustment
Adjust external AI scores based on ground-truth findings:
```
Original Score: X/10
Corrections:
- Feature A: Claimed WORKS, actually PLANNED (-1)
- Feature B: Claimed integrated, actually DISCONNECTED (-0.5)
Adjusted Score: Y/10
```

---

## Quick Reference: Verification Commands

```bash
# File exists?
ls -la /path/to/file.ts

# Function defined?
grep -rn "function functionName\|const functionName\|export.*functionName" --include="*.ts"

# Function called?
grep -rn "functionName(" --include="*.ts" | grep -v "function\|const\|export"

# API endpoint exists?
ls -la src/pages/api/path/

# Component in active route?
grep -rn "ComponentName" src/pages/ src/app/

# Import chain?
grep -rn "from.*moduleName\|import.*moduleName" --include="*.ts"
```

---

## Example: Genesis Audit Findings

| Feature | OpenAI | Gemini | Ground Truth | Issue |
|---------|--------|--------|--------------|-------|
| Vision Alignment | 5.5/10 | 8/10 | 4.5/10 | Gemini trusted docs |
| Stage 16/17 | Mismatch | "Perfect" | Mismatch | Gemini didn't verify orchestrator |
| Regeneration scripts | Disconnected | Connected | MISSING | Scripts don't exist |
| Entry point | Missing | Not mentioned | MISSING | No way to create simulations |

**Lesson:** Gemini scored 8/10 by reading planning documents as implementation status. Ground-truth audit revealed 4.5/10.

---

## Integration with LEO Protocol

When performing triangulation as part of LEO workflow:

1. **LEAD Phase**: Use triangulation to validate SD scope claims
2. **PLAN Phase**: Verify existing implementation before planning new work
3. **EXEC Phase**: Confirm features are WORKS not DISCONNECTED before marking complete

### SD Validation Checklist
Before approving an SD as "complete":
```
[ ] All claimed features verified as WORKS (not DISCONNECTED)
[ ] Entry points confirmed (API/UI/CLI)
[ ] Call chains traced from entry to implementation
[ ] No STUBBED functions in critical path
```

---

*Protocol Version: 1.0*
*Created: 2026-01-01*
*Based on: Genesis Triangulation Audit findings*
