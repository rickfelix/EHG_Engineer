# Ground-Truth Triangulation Protocol

> **Verification Lens**: CODEBASE-AWARE, SEMI-MANUAL
> **Question it answers**: "Is it real? Does the code actually exist and work?"
> **Requires**: Codebase access (via AI Projects or Claude Code)

## Verification Taxonomy

This is one of three verification tools in the LEO ecosystem. Choose the right tool:

| Tool | Access | Mode | Question | Use When |
|------|--------|------|----------|----------|
| **Ground-Truth Triangulation** (this) | Codebase | Semi-manual | "Is it real?" | Verifying implementation claims against actual code |
| **Multi-Model Debate** (`/learn`) | API only | Automated | "Should we do it?" | Evaluating proposal quality via 3 AI critics |
| **Deep Research** (`/research`) | API only | Automated | "What's the best way?" | Exploring approaches and comparing options |

## Purpose
Ensure multi-AI analysis (OpenAI, Gemini, Claude) produces accurate, evidence-based assessments by forcing verification of actual implementation vs. documentation claims.

## When to Use
- Auditing system implementation status
- Comparing AI analyses of codebase features
- Validating claims about feature completeness
- Any multi-model triangulation exercise
- When someone says "it's already implemented" and you need proof

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
| **Single repo check** | **"It's MISSING"** | **Exists in different repo** |

---

## CRITICAL: Multi-Repository Awareness

### The Multi-Repo Blindness Failure Mode

**Problem**: Claiming a feature is "MISSING" when only checking one repository in a multi-repo architecture.

**Real Example** (2026-01-18): Quality Lifecycle UI was assessed as 0% complete by external AIs because they only received evidence from EHG_Engineer (backend). The implementation was 90% complete in EHG (frontend).

### EHG Project Repository Map

| Repository | Purpose | Location | Contains |
|------------|---------|----------|----------|
| **EHG** | Frontend (React/Vite) | `C:/_EHG/EHG/` | UI components, pages, routes, React hooks |
| **EHG_Engineer** | Backend/Tooling | `C:/_EHG/EHG_Engineer/` | CLI tools, scripts, lib modules, database |

### Component → Repository Mapping

| Component Type | Expected Repository | Path Pattern |
|----------------|---------------------|--------------|
| Web UI pages | **EHG** | `src/pages/**/*.tsx` |
| React components | **EHG** | `src/components/**/*.tsx` |
| Routes | **EHG** | `src/routes/*.tsx` |
| CLI commands/skills | **EHG_Engineer** | `.claude/skills/*.md`, `.claude/commands/*.md` |
| Library modules | **EHG_Engineer** | `lib/**/*.js` |
| Database migrations | **EHG_Engineer** | `database/migrations/*.sql` |
| API endpoints (Supabase) | **Both** | Direct Supabase calls from either repo |

### Pre-Triangulation Checklist

Before claiming ANY component is MISSING:
```
[ ] Checked EHG_Engineer repository
[ ] Checked EHG repository
[ ] Searched for component by name across both repos
[ ] Verified recent git commits in both repos
```

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

## CRITICAL: Multi-Repository Architecture
This system spans MULTIPLE repositories. Evidence must be gathered from ALL:

| Repository | Purpose | Contains |
|------------|---------|----------|
| **EHG** | Frontend | UI components, pages, routes |
| **EHG_Engineer** | Backend/Tooling | CLI tools, scripts, lib modules |

**FAILURE MODE**: Do NOT claim "MISSING" without checking BOTH repos.

## Your Task
Audit the [SYSTEM] implementation. For each feature, classify as:
- WORKS: Code exists + integrated + has user entry point
- DISCONNECTED: Code exists + no integration path
- STUBBED: Function exists but placeholder/TODO
- PLANNED: In docs only, no code
- MISSING: Not found **in ANY repository**

## Evidence Requirements
For EVERY claim, provide:
1. **Repository name** (EHG or EHG_Engineer)
2. File path where you found evidence
3. Line number(s)
4. 3-5 line code snippet
5. Your classification with justification

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
4. **Did I check BOTH repositories?**

## Output Format
| Feature | Status | Repo | Evidence (file:line) | Entry Point | Call Chain |
|---------|--------|------|---------------------|-------------|------------|
| [name]  | [status] | EHG/EHG_Engineer | path:123 | Yes/No | A→B→C or "None" |

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

### Single Repository Commands
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

### Multi-Repository Commands (CRITICAL)
```bash
# Check EHG_Engineer (backend/tooling)
cd C:/_EHG/EHG_Engineer
ls -la src/  lib/  .claude/skills/
grep -rn "featureName" --include="*.js" --include="*.ts"

# Check EHG (frontend UI)
cd C:/_EHG/EHG
ls -la src/pages/  src/components/  src/routes/
grep -rn "FeatureName" --include="*.tsx"

# Check recent commits in BOTH repos
cd C:/_EHG/EHG_Engineer && git log --oneline -10 -- "src/" "lib/"
cd C:/_EHG/EHG && git log --oneline -10 -- "src/pages/" "src/components/"

# Search across BOTH repos at once
for repo in EHG EHG_Engineer; do echo "=== $repo ===" && grep -rn "searchTerm" C:/_EHG/$repo/src/ --include="*.ts" --include="*.tsx" 2>/dev/null; done
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

## Command Ecosystem Integration

### Cross-Reference

This command is part of the **Command Ecosystem**. For full workflow context, see:
- **[Command Ecosystem Reference](../../docs/reference/command-ecosystem.md)** - Complete inter-command flow diagram and relationships

---

The `/triangulation-protocol` command connects to other commands:

### After Bug/Issue Confirmed

**If issue is small (<50 LOC fix) - Use AskUserQuestion:**

```javascript
{
  "question": "Issue confirmed (~XX LOC fix). How would you like to proceed?",
  "header": "Fix Approach",
  "multiSelect": false,
  "options": [
    {"label": "/quick-fix [issue]", "description": "Small fix workflow with auto-merge"},
    {"label": "Create full SD", "description": "Full LEO Protocol for this issue"},
    {"label": "Done for now", "description": "Document and address later"}
  ]
}
```

**If issue is larger (requires full SD) - Use AskUserQuestion:**

```javascript
{
  "question": "Issue confirmed (>50 LOC). Requires full SD. What's next?",
  "header": "SD Creation",
  "multiSelect": false,
  "options": [
    {"label": "/learn", "description": "Create SD via learning patterns"},
    {"label": "/leo next", "description": "Create SD manually via LEO Protocol"},
    {"label": "Done for now", "description": "Document and address later"}
  ]
}
```

**Auto-invoke behavior:** When user selects a command option, immediately invoke that skill using the Skill tool.

### Related Commands

| Finding | Suggest |
|---------|---------|
| Bug confirmed, <50 LOC | `/quick-fix` |
| Systemic issue, pattern-based | `/learn` (creates SD) |
| Feature gap confirmed | Create SD manually |
| Documentation mismatch | `/document` |

### Before Triangulation

If uncertain whether an issue exists:
```
Before running triangulation:
• Gather evidence from multiple AI models (OpenAI, Gemini, Claude)
• Prepare the Standard Prompt Template (see above)
• Have specific features/claims to verify
```

---

*Protocol Version: 1.1*
*Created: 2026-01-01*
*Updated: 2026-01-18 - Added multi-repository awareness (Quality Lifecycle audit lesson)*
*Based on: Genesis Triangulation Audit findings*
