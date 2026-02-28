---
category: protocol
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [protocol, auto-generated]
---
# LEO Protocol v4.2.0 - Git Commit Guidelines



## Table of Contents

- [Metadata](#metadata)
- [Executive Summary](#executive-summary)
- [Commit Message Format](#commit-message-format)
  - [Standard Structure](#standard-structure)
  - [Required Elements](#required-elements)
- [Commit Timing Guidelines](#commit-timing-guidelines)
  - [During EXEC Implementation Phase](#during-exec-implementation-phase)
  - [Commit Frequency Rules](#commit-frequency-rules)
- [Commit Size and Scope](#commit-size-and-scope)
  - [Atomic Commits](#atomic-commits)
  - [Size Guidelines](#size-guidelines)
  - [File Scope](#file-scope)
- [Branch-Specific Requirements](#branch-specific-requirements)
  - [Development Branches (EXEC Phase)](#development-branches-exec-phase)
  - [Main Branch (Post-LEAD Approval Only)](#main-branch-post-lead-approval-only)
- [LEO Protocol Phase Integration](#leo-protocol-phase-integration)
  - [Phase 1-2: LEAD/PLAN (Database-First)](#phase-1-2-leadplan-database-first)
  - [Phase 3: EXEC Implementation](#phase-3-exec-implementation)
  - [Phase 4: PLAN Verification](#phase-4-plan-verification)
  - [Phase 5: LEAD Approval](#phase-5-lead-approval)
  - [Post-Approval: GitHub Sub-Agent](#post-approval-github-sub-agent)
- [Gate 0: Pre-Commit Validation](#gate-0-pre-commit-validation)
  - [How It Works](#how-it-works)
  - [Blocked Phases](#blocked-phases)
  - [Valid Phases](#valid-phases)
  - [LOC Threshold Trigger](#loc-threshold-trigger)
  - [Emergency Bypass](#emergency-bypass)
- [Practical Examples](#practical-examples)
  - [Feature Implementation](#feature-implementation)
  - [Documentation Update](#documentation-update)
  - [Refactoring](#refactoring)
- [AI-Assisted Development](#ai-assisted-development)
  - [When AI Generates Code](#when-ai-generates-code)
  - [AI Review Guidelines](#ai-review-guidelines)
- [Validation and Enforcement](#validation-and-enforcement)
  - [Pre-Commit Hooks](#pre-commit-hooks)
  - [Validation Rules](#validation-rules)
  - [CI/CD Integration](#cicd-integration)
- [Git Configuration](#git-configuration)
  - [Commit Template](#commit-template)
  - [Template Content (.gitmessage)](#template-content-gitmessage)
- [Common Mistakes to Avoid](#common-mistakes-to-avoid)
  - [❌ DON'T](#-dont)
  - [✅ DO](#-do)
- [Integration with Tools](#integration-with-tools)
  - [VS Code Settings](#vs-code-settings)
  - [Git Aliases](#git-aliases)
- [Metrics and Reporting](#metrics-and-reporting)
  - [Commit Quality Metrics](#commit-quality-metrics)
  - [Reporting Commands](#reporting-commands)
- [Migration from Previous Practices](#migration-from-previous-practices)
  - [For Existing Repositories](#for-existing-repositories)
  - [Transition Period](#transition-period)
- [Quick Reference Card](#quick-reference-card)
- [Conclusion](#conclusion)

## Metadata
- **Category**: Protocol
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, unit, migration

**Version**: 1.0.0
**Based On**: LEO Protocol v4.2.0 (Story Gates & Automated Release Control)
**Date**: 2025-09-26
**Status**: Active
**Integration**: Complements `leo_github_deployment_workflow_v4.1.2.md`

---

## Executive Summary

This document defines mandatory Git commit practices for all LEO Protocol implementations. It ensures traceability from commits to Strategic Directives, maintains code quality, and enables automated validation through the verification cycle.

**Core Principle**: Every commit must be traceable to a Strategic Directive and follow Conventional Commits format.

---

## Commit Message Format

### Standard Structure
```
<type>(<scope>): <subject>

<body>

<footer>
```

### Required Elements

#### Type (MANDATORY)
Must be one of:
- `feat`: New feature implementation
- `fix`: Bug fix or error correction
- `docs`: Documentation changes only
- `style`: Code formatting, no logic changes
- `refactor`: Code restructuring, no behavior changes
- `test`: Adding or updating tests
- `chore`: Maintenance, dependencies, tooling
- `perf`: Performance improvements
- `ci`: CI/CD configuration changes
- `revert`: Reverting previous commits

#### Scope (MANDATORY)
Must include Strategic Directive ID:
```
feat(SD-2025-001): Implement voice capture API
fix(SD-2025-002): Resolve authentication timeout
docs(SD-2025-003): Update API documentation
```

#### Subject (MANDATORY)
- Use imperative mood: "Add" not "Added" or "Adds"
- No period at the end
- Maximum 72 characters
- Clear and specific

#### Body (RECOMMENDED)
- Explain the "why" behind the change
- Reference specific requirements or issues
- Include technical details when relevant
- Wrap at 72 characters per line

#### Footer (SITUATIONAL)
- Breaking changes: `BREAKING CHANGE: description`
- Issue references: `Fixes #123`
- Co-authorship: `Co-Authored-By: Name <email>`
- AI attribution: `🤖 Generated with [Claude Code](https://claude.ai/code)`

---

## Commit Timing Guidelines

### During EXEC Implementation Phase

#### When to Commit (MANDATORY)
1. **After completing each checklist item**
   ```bash
   # ✅ Complete checklist item
   git add <files>
   git commit -m "feat(SD-2025-001): Complete authentication module

   - Implemented OAuth2 flow
   - Added token refresh logic
   - Completed checklist item 3/10"
   ```

2. **Before context switches**
   - End of work session
   - Switching between features
   - Before meetings or breaks

3. **At logical breakpoints**
   - Feature complete
   - Tests passing
   - Refactoring complete

4. **When tests pass**
   ```bash
   npm test
   # ✅ All tests pass
   git commit -m "test(SD-2025-001): Add unit tests for auth service"
   ```

### Commit Frequency Rules
- **Minimum**: At least once per EXEC work session
- **Maximum**: No more than 10 commits per checklist item
- **Ideal**: 3-5 commits per day during active development

---

## Commit Size and Scope

### Atomic Commits
Each commit should represent ONE logical change:

#### ✅ GOOD - Atomic
```bash
git commit -m "feat(SD-2025-001): Add user authentication service"
git commit -m "test(SD-2025-001): Add auth service unit tests"
git commit -m "docs(SD-2025-001): Document auth service API"
```

#### ❌ BAD - Multiple changes
```bash
git commit -m "feat(SD-2025-001): Add auth, update UI, fix bugs, add tests"
```

### Size Guidelines
- **Target**: 50-100 lines changed per commit
- **Maximum**: 200 lines (excluding generated files)
- **Split large changes**: Use multiple atomic commits

### File Scope
- **Ideal**: 1-3 files per commit
- **Maximum**: 10 files (excluding test files)
- **Exception**: Generated files, dependencies

---

## Branch-Specific Requirements

### Development Branches (EXEC Phase)
Format: `<type>/<sd-id>/<description>`

```bash
# Feature branch
git checkout -b feature/SD-2025-001-voice-api

# Commit on feature branch
git commit -m "feat(SD-2025-001): Initialize WebRTC connection"
```

### Main Branch (Post-LEAD Approval Only)
- **NO direct commits** to main during EXEC phase
- Commits only via approved Pull Requests
- Must include PR reference in merge commit

---

## LEO Protocol Phase Integration

### Phase 1-2: LEAD/PLAN (Database-First)
- ❌ NO commits (database operations only)
- All planning in Supabase tables

### Phase 3: EXEC Implementation
- ✅ Feature branch commits following these guidelines
- ✅ Push to development branches
- ❌ NO main branch commits

### Phase 4: PLAN Verification
- ✅ Fix commits based on review feedback
- Format: `fix(SD-XXXX): Address review comment about [specific issue]`

### Phase 5: LEAD Approval
- ✅ Final cleanup commits if needed
- ✅ Prepare for merge (squash option available)

### Post-Approval: GitHub Sub-Agent
- ✅ Automated merge to main
- ✅ Release tag creation

---

## Gate 0: Pre-Commit Validation

**CRITICAL**: Before any commit is created, the pre-commit hook validates SD status to prevent the anti-pattern where code is shipped while SDs remain in draft.

### How It Works
1. **Extraction**: Hook extracts SD ID from commit message or branch name
2. **Validation**: Queries database for SD status and current phase
3. **Enforcement**: BLOCKS commit if SD is in invalid phase

### Blocked Phases
- `draft` - SD not yet approved by LEAD
- `LEAD_APPROVAL` - SD awaiting LEAD approval

### Valid Phases
- `PLANNING`, `PLAN_PRD`, `PLAN`, `PLAN_VERIFICATION` - PRD creation
- `EXEC` - Implementation authorized

### LOC Threshold Trigger
Commits with >500 lines changed **MUST** reference an SD:
```bash
# BLOCKED: Large change without SD
git add . # 650 LOC changed
git commit -m "refactor: massive cleanup"
❌ BLOCKED: Large change (650 LOC) requires SD reference

# ALLOWED: SD referenced
git commit -m "refactor(SD-REFACTOR-001): massive cleanup"
✅ PASS
```

### Emergency Bypass
Use only for urgent hotfixes:
```bash
git commit --no-verify -m "hotfix: critical production issue"
# ⚠️ Bypass logged in .husky/bypass-log.txt
```

**See**: [Gate 0: Workflow Entry Enforcement](gate0-workflow-entry-enforcement.md) for complete documentation of all 6 enforcement layers.

---

## Practical Examples

### Feature Implementation
```bash
# Starting new feature
git commit -m "feat(SD-2025-001): Initialize voice capture module

- Set up WebRTC configuration
- Create audio context
- Add error handling

Implements requirement 2.1 from PRD"

# Adding tests
git commit -m "test(SD-2025-001): Add voice capture integration tests

- Test WebRTC initialization
- Verify audio stream handling
- Mock browser APIs

Coverage: 85% for voice module"

# Fixing issue
git commit -m "fix(SD-2025-001): Resolve audio feedback loop

- Add echo cancellation
- Implement noise suppression
- Fix gain control

Fixes issue reported in PLAN verification"
```

### Documentation Update
```bash
git commit -m "docs(SD-2025-001): Update voice API documentation

- Add WebRTC setup instructions
- Document error codes
- Include usage examples

Part of SD-2025-001 deliverables"
```

### Refactoring
```bash
git commit -m "refactor(SD-2025-001): Extract audio processing logic

- Move processing to separate module
- Improve testability
- No functional changes

Maintains 100% backward compatibility"
```

---

## AI-Assisted Development

### When AI Generates Code
Include attribution in commit footer:

```bash
git commit -m "feat(SD-2025-001): Implement retry logic for API calls

- Add exponential backoff
- Handle rate limiting
- Configure max retries

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### AI Review Guidelines
- AI should validate commit format before committing
- AI should ensure SD-ID is correct
- AI should check commit size constraints

---

## Validation and Enforcement

### Pre-Commit Hooks
Install validation hook:
```bash
# .git/hooks/commit-msg
node scripts/validate-commit-message.js $1
```

### Validation Rules
1. **Format**: Must match Conventional Commits
2. **Scope**: Must contain valid SD-ID
3. **Subject**: 10-72 characters
4. **Type**: Must be from allowed list
5. **Size**: Warn if >200 lines changed

### CI/CD Integration
- Commits without proper format fail CI
- PR titles must follow same format
- Merge commits auto-generated with PR info

---

## Git Configuration

### Commit Template
Set up template for consistency:
```bash
git config --local commit.template .gitmessage
```

### Template Content (.gitmessage)
```
<type>(<SD-ID>): <subject>

# Why this change is needed:

# What changed:

# How to test:

# Checklist item: [ ] of [ ]
# SD Reference: SD-YYYY-XXX
# Phase: EXEC/PLAN/LEAD
```

---

## Common Mistakes to Avoid

### ❌ DON'T
```bash
# Too vague
git commit -m "fix: Bug fixes"

# Missing SD-ID
git commit -m "feat: Add new feature"

# Wrong tense
git commit -m "feat(SD-2025-001): Added new feature"

# Multiple changes
git commit -m "feat(SD-2025-001): Add auth, UI, tests, docs"

# Committing to main during EXEC
git checkout main && git commit -m "feat(SD-2025-001): New feature"
```

### ✅ DO
```bash
# Clear and specific
git commit -m "fix(SD-2025-001): Resolve null pointer in auth service"

# Proper format with SD-ID
git commit -m "feat(SD-2025-001): Add OAuth2 authentication flow"

# Imperative mood
git commit -m "feat(SD-2025-001): Add password reset functionality"

# Atomic commit
git commit -m "test(SD-2025-001): Add unit tests for auth service"

# Feature branch during EXEC
git checkout feature/SD-2025-001 && git commit -m "feat(SD-2025-001): Add login API"
```

---

## Integration with Tools

### VS Code Settings
```json
{
  "git.inputValidation": "warn",
  "git.inputValidationLength": 72,
  "git.inputValidationSubjectLength": 50
}
```

### Git Aliases
```bash
# Add to .gitconfig
[alias]
  leo-commit = "!f() { git commit -m \"$1(SD-$2): $3\"; }; f"

# Usage: git leo-commit feat 2025-001 "Add new feature"
```

---

## Metrics and Reporting

### Commit Quality Metrics
- Format compliance rate: Target >95%
- Average commits per SD: 20-50
- Commit size distribution: 80% under 100 lines
- Traceability: 100% commits linked to SDs

### Reporting Commands
```bash
# Check commit compliance
node scripts/analyze-commit-history.js

# Generate commit report for SD
node scripts/sd-commit-report.js SD-2025-001
```

---

## Migration from Previous Practices

### For Existing Repositories
1. Apply guidelines to new commits only
2. Don't rewrite history
3. Update PR templates to enforce format
4. Train team on new standards

### Transition Period
- Week 1-2: Warnings only
- Week 3-4: Soft enforcement (CI warnings)
- Week 5+: Hard enforcement (CI failures)

---

## Quick Reference Card

```
Format:    <type>(<SD-ID>): <subject>
Types:     feat|fix|docs|style|refactor|test|chore|perf|ci|revert
Scope:     SD-YYYY-XXX (mandatory)
Subject:   Imperative, no period, <72 chars
Branch:    feature/SD-YYYY-XXX-description
Timing:    After checklist items, before context switches
Size:      <100 lines ideal, <200 max
Frequency: Min 1/session, Max 10/checklist item
```

---

## Conclusion

Consistent, well-formatted Git commits are essential for maintaining traceability in the LEO Protocol workflow. These guidelines ensure every code change can be traced back to its originating Strategic Directive, facilitating compliance, debugging, and project management.

---

*LEO Protocol v4.2.0 Git Commit Guidelines*
*For questions: Consult GitHub Deployment Workflow v4.1.2*
*Last Updated: 2025-09-26*