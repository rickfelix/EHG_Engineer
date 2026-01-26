# LEO Protocol Helper Tools

## Metadata
- **Category**: Protocol
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, testing, migration

## Extracted from ehg-replit hooks, reimplemented as explicit tools

### Overview

Instead of automatic hooks that run on every tool call (causing overhead and errors), these are **explicit helper tools** that LEO Protocol agents can call when needed. This gives agents control over when to use these features.

## Available Helper Tools

### 1. CI/CD Monitor (`leo-ci-monitor.js`)

**Purpose**: Monitor GitHub Actions after pushing code and report results

**When to use**:
- After `git push` in EXEC tasks
- When verification of CI/CD is required
- For critical deployments

**Usage**:
```bash
# Basic usage - monitors current branch
node scripts/leo-ci-monitor.js

# With options
node scripts/leo-ci-monitor.js \
  --branch main \
  --max-wait 300 \  # seconds
  --interval 10     # seconds
```

**EXEC Agent Example**:
```bash
# After pushing code
git push origin feature-branch
node scripts/leo-ci-monitor.js --max-wait 180
```

### 2. Evidence Capture (`leo-evidence-capture.js`)

**Purpose**: Capture and organize completion evidence for tasks

**When to use**:
- Task completion (EXEC)
- Verification phase (PLAN)
- Creating evidence packages

**Usage**:
```bash
node scripts/leo-evidence-capture.js <task-id> \
  --role EXEC \
  --files "app/page.tsx,lib/api.ts" \
  --test "npm test" \
  --vision-qa "TEST-APP-001-20250830" \
  --git
```

**Output**:
- Markdown report in `docs/verification-packages/<task-id>/`
- JSON evidence file
- Screenshots (if Vision QA was run)

### 3. Strategic Directive Validator (`leo-sd-validator.js`)

**Purpose**: Validate strategic directives follow LEO Protocol standards

**When to use**:
- Creating new strategic directives (LEAD)
- Reviewing SD structure (PLAN)
- Before finalizing SDs

**Usage**:
```bash
# Validate a strategic directive
node scripts/leo-sd-validator.js docs/strategic-directives/SD-001.md

# Auto-fix common issues
node scripts/leo-sd-validator.js SD-001.md --fix

# Strict mode (fail on warnings)
node scripts/leo-sd-validator.js SD-001.md --strict
```

**Validation Checks**:
- Required sections (Objective, Scope, Requirements, Success Criteria)
- Vision QA status for UI work
- Proper SD ID format
- Document structure and readability

### 4. Product Requirements Document Validator (`leo-prd-validator.js`)

**Purpose**: Validate PRDs follow LEO Protocol standards and link properly to SDs

**When to use**:
- Creating new PRDs (LEAD/PLAN)
- Reviewing PRD completeness (PLAN)
- Before implementation starts (EXEC)
- Quality assurance checks

**Usage**:
```bash
# Validate a PRD
node scripts/leo-prd-validator.js docs/product-requirements/PRD-001.md

# Auto-fix common issues and add missing sections
node scripts/leo-prd-validator.js PRD-001.md --fix

# Strict mode (fail on warnings)
node scripts/leo-prd-validator.js PRD-001.md --strict

# Generate a new PRD template
node scripts/leo-prd-validator.js --template docs/templates/PRD-new.md
```

**Validation Checks**:
- ✅ All required sections (9 critical sections)
- ✅ PRD ID format (PRD-XXX)
- ✅ Links to Strategic Directive (SD-XXX)
- ✅ User story format ("As a... I want... So that...")
- ✅ Requirements have unique IDs (FR-XXX, NFR-XXX, US-XXX)
- ✅ Vision QA requirements for UI work
- ✅ Testability score (acceptance criteria, measurable metrics)
- ✅ Document completeness score
- ✅ Quality metrics (well-formed stories, requirements with IDs)

**Quality Scoring**:
- **A+ (95-100)**: Production-ready PRD
- **A (90-94)**: Minor improvements needed
- **B+ (85-89)**: Good structure, some gaps
- **B (80-84)**: Acceptable, needs work
- **C+ (75-79)**: Significant gaps
- **C (70-74)**: Major rework needed
- **D (60-69)**: Incomplete
- **F (<60)**: Requires complete rewrite

**Auto-Fix Features**:
- Adds PRD ID if missing
- Creates Document Information section
- Adds Vision QA section for UI work
- Inserts templates for missing required sections
- Creates backup before modifications

## Integration with LEO Protocol Workflow

### LEAD Agent Workflow

```bash
# 1. Create strategic directive
vim docs/strategic-directives/SD-XXX.md

# 2. Validate SD structure
node scripts/leo-sd-validator.js docs/strategic-directives/SD-XXX.md --fix

# 3. Create Product Requirements Document
node scripts/leo-prd-validator.js --template docs/product-requirements/PRD-XXX.md
vim docs/product-requirements/PRD-XXX.md

# 4. Validate PRD and link to SD
node scripts/leo-prd-validator.js docs/product-requirements/PRD-XXX.md --fix

# 5. Ensure Vision QA requirements are specified in both SD and PRD
# (Validators will warn if UI work lacks Vision QA status)
```

### PLAN Agent Workflow

```bash
# 1. Validate SD and PRD alignment before decomposition
node scripts/leo-sd-validator.js docs/strategic-directives/SD-XXX.md
node scripts/leo-prd-validator.js docs/product-requirements/PRD-XXX.md

# 2. After task decomposition, ensure PRD requirements are covered
# Check that all FR-XXX and NFR-XXX are assigned to tasks

# 3. When verifying EXEC work, capture evidence
node scripts/leo-evidence-capture.js <task-id> \
  --role PLAN \
  --files "<verified-files>"

# 4. Validate PRD acceptance criteria are met
# Cross-reference completed tasks with PRD success criteria
```

### EXEC Agent Workflow

```bash
# 1. Complete implementation
# ... code changes ...

# 2. Run tests
npm test

# 3. Run Vision QA if required
node lib/testing/vision-qa-agent.js --app-id "APP-001" --goal "Test goal"

# 4. Capture evidence
node scripts/leo-evidence-capture.js SD-001-Task-1 \
  --role EXEC \
  --files "app/page.tsx,lib/api.ts" \
  --test "npm test" \
  --vision-qa "TEST-APP-001-20250830" \
  --git

# 5. Push code
git push origin feature-branch

# 6. Monitor CI
node scripts/leo-ci-monitor.js

# 7. Report completion with evidence location
```

## Key Differences from Hooks

| Aspect | Old Hooks (ehg-replit) | New Tools (EHG_Engineer) |
|--------|------------------------|--------------------------|
| **Execution** | Automatic on every tool call | Explicit - only when called |
| **Performance** | Overhead on every operation | No overhead unless used |
| **Errors** | Silent failures, context pollution | Clear errors when tools fail |
| **Control** | No agent control | Agents decide when to use |
| **Context** | Added noise to conversation | Clean, focused output |
| **Flexibility** | Fixed behavior | Configurable per use case |

## Best Practices

1. **Use CI Monitor** after critical pushes, not every push
2. **Capture Evidence** for completed tasks, especially with UI changes
3. **Validate SDs** before starting implementation
4. **Don't over-use** - these are helpers, not requirements
5. **Check output** - tools generate reports in `docs/` directories

## Configuration

These tools respect environment variables:
- `DATABASE_URL` - For Vision QA database queries
- `GITHUB_TOKEN` - For enhanced GitHub CLI operations
- Standard git configuration

## Troubleshooting

**CI Monitor not working**: 
- Ensure `gh` CLI is installed and authenticated
- Check you're in a git repository

**Evidence Capture database issues**:
- Verify DATABASE_URL is set
- Check PostgreSQL connection

**SD Validator too strict**:
- Use without `--strict` flag for warnings only
- Use `--fix` to auto-correct common issues

## Future Enhancements

Potential additions based on need:
- Database migration validator
- Performance benchmark tracker  
- Security audit helper
- Dependency update analyzer

These would follow the same pattern: explicit tools agents can call when needed, not automatic hooks.