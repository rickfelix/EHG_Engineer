---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# Stage Review Best Practices - Index



## Table of Contents

- [Metadata](#metadata)
- [Purpose](#purpose)
- [Core Policies](#core-policies)
  - [1. CrewAI Compliance Policy](#1-crewai-compliance-policy)
  - [2. Evidence Standards](#2-evidence-standards)
  - [3. Technical Debt Management](#3-technical-debt-management)
  - [4. Cross-Stage Pattern Reuse](#4-cross-stage-pattern-reuse)
- [Living Documentation](#living-documentation)
  - [Stage Review Lessons Learned](#stage-review-lessons-learned)
- [Validation Checklist](#validation-checklist)
  - [CrewAI Compliance](#crewai-compliance)
  - [Evidence Quality](#evidence-quality)
  - [Cross-Stage Reuse](#cross-stage-reuse)
  - [Technical Debt](#technical-debt)
  - [Outcome Log Completeness](#outcome-log-completeness)
- [Best Practice Patterns](#best-practice-patterns)
  - [Service Role Key Pattern](#service-role-key-pattern)
  - [RLS Policy Separation (App vs Engineer)](#rls-policy-separation-app-vs-engineer)
  - [Template Versioning](#template-versioning)
  - [Error Handling Standards](#error-handling-standards)
  - [Testing Coverage Tier Requirements](#testing-coverage-tier-requirements)
- [KPI Targets](#kpi-targets)
- [Quick Reference Commands](#quick-reference-commands)
  - [Database Queries](#database-queries)
  - [File Search Patterns](#file-search-patterns)
- [Cross-References](#cross-references)
  - [Core Framework](#core-framework)
  - [Governance](#governance)
  - [Protocol Reference](#protocol-reference)
- [Continuous Improvement Process](#continuous-improvement-process)
  - [After Every Review](#after-every-review)
  - [After Every 5 Reviews](#after-every-5-reviews)
  - [Quarterly](#quarterly)
- [Version History](#version-history)

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, testing, e2e

**Version**: 1.0
**Last Updated**: 2025-11-07
**Authority**: Chairman
**Protocol**: LEO Protocol v4.2.0

---

## Purpose

This document serves as the central index for all stage review best practices, lessons learned, compliance policies, and continuous improvement initiatives. It provides quick access to essential guidance for conducting high-quality, consistent stage reviews across all 40 workflow stages.

---

## Core Policies

### 1. CrewAI Compliance Policy
**Document**: crewai_compliance_policy.md
**Status**: **MANDATORY** for all stages
**Summary**: CrewAI is foundational to EHG's automation strategy. All stages must implement prescribed agents/crews or obtain explicit Chairman-approved exceptions.

**Key Points**:
- CrewAI is no longer optional or "enhancement"
- Dossier prescriptions are binding specifications
- Non-compliance requires either SD creation or exception
- Exceptions require Chairman signature and sunset date

---

### 2. Evidence Standards
**Location**: Embedded in [review_process.md](./review_process.md) Step 3
**Policy**: **NO EVIDENCE, NO CLAIM**

**All findings MUST include**:
- File paths with line numbers (e.g., `agent-platform/app/agents/researcher.py:45-67`)
- Database queries with results (e.g., `SELECT * FROM crewai_agents WHERE stage=4;`)
- Code snippets (10-20 lines demonstrating issue)
- Dossier reference (section/page showing prescription)

**Without evidence, findings are invalid and must be removed.**

---

### 3. Technical Debt Management
**Location**: Embedded in [review_process.md](./review_process.md) Step 3 & [stage_review_template.md](./review_templates/stage_review_template.md) Section 3.7

**Debt Acceptance Criteria** (all must be true):
- Does NOT block core functionality
- Does NOT create security vulnerabilities
- Does NOT violate data integrity
- Has documented remediation plan
- Has clear revisit trigger
- Chairman explicitly accepts deferral

**Debt Categories**: Architecture, Testing, Documentation, Performance, Security

---

### 4. Cross-Stage Pattern Reuse
**Location**: Embedded in [review_process.md](./review_process.md) Step 2.75 & [stage_review_template.md](./review_templates/stage_review_template.md) Section 3.8
**Policy**: Search first, build second

**Search Requirements**:
- Must search at minimum: all prior reviewed stages
- Must use at least 3 keywords per search
- Must provide specific file paths if pattern found
- If no patterns found, must document search effort

**Reusable Pattern Types**:
- CrewAI agent configurations
- Research pipeline orchestrations
- UI component patterns
- Database schema patterns (RLS, service role keys)
- API endpoint patterns
- Testing patterns

---

## Living Documentation

### Stage Review Lessons Learned
**Document**: [stage_review_lessons.md](./stage_review_lessons.md)
**Type**: Living log (append after each review)
**Purpose**: Capture patterns, anti-patterns, and continuous improvements

**Structure per review**:
- Lessons Learned (context, impact, recommendation)
- Best Practices Validated
- Anti-Patterns Detected
- Cross-Stage Patterns Discovered
- Protocol Enhancements Triggered

---

## Validation Checklist

Use this checklist before submitting any stage review:

### CrewAI Compliance
- [ ] Section 2.6 completed with dossier prescriptions
- [ ] Database queries run and results documented
- [ ] Code verification performed with file paths
- [ ] Compliance status selected (Compliant/Exception/Non-Compliant)
- [ ] If non-compliant: SD spawned OR exception obtained

### Evidence Quality
- [ ] All findings have file paths with line numbers
- [ ] All findings have database query results (where applicable)
- [ ] All findings have code snippets
- [ ] All findings have dossier references
- [ ] Evidence completeness target: 100%

### Cross-Stage Reuse
- [ ] Search performed across all prior reviewed stages
- [ ] At least 3 keywords used
- [ ] Patterns found documented with adaptation needs
- [ ] If no patterns: search effort documented

### Technical Debt
- [ ] All deferred gaps added to debt register (Section 3.7)
- [ ] Debt IDs assigned
- [ ] Categories assigned (Architecture/Testing/Documentation/Performance/Security)
- [ ] Acceptance criteria verified for all debt items
- [ ] Revisit triggers defined
- [ ] Chairman acceptance obtained

### Outcome Log Completeness
- [ ] Section 5.2: CrewAI Compliance Score completed
- [ ] Section 5.3: Technical Debt Summary completed
- [ ] Section 5.4: Cross-Stage Patterns Applied completed
- [ ] Section 5.9: Best Practices Validated checklist completed
- [ ] Section 5.10: New KPIs calculated
- [ ] Lessons appended to stage_review_lessons.md

---

## Best Practice Patterns

### Service Role Key Pattern
**Purpose**: Enable automation to bypass RLS policies for system operations
**Location**: Used in database migrations and agent service accounts
**Evidence**: Check for `service_role` key usage in Supabase client initialization
**Validation**: Verify RLS policies have service role bypass clauses

### RLS Policy Separation (App vs Engineer)
**Purpose**: Maintain database security boundary between application data and governance data
**Pattern**: `app` database for venture/user data, `engineer` database for SDs/handoffs/reviews
**Evidence**: Verify policies use correct role checks (`app.user` vs `engineer.user`)
**Validation**: Test that policies don't leak data across database boundaries

### Template Versioning
**Purpose**: Track template evolution and ensure compatibility
**Pattern**: Version numbers in footer comments (e.g., `<!-- Template v1.1 | 2025-11-07 -->`)
**Evidence**: Check markdown file footers
**Validation**: Version increments when structure changes

### Error Handling Standards
**Purpose**: Consistent error handling across codebase
**Pattern**: Try-catch blocks with specific error types, logging, user-friendly messages
**Evidence**: Code reviews, error handling in agent implementations
**Validation**: Check for generic catch blocks (anti-pattern)

### Testing Coverage Tier Requirements
**Purpose**: Ensure adequate testing based on component criticality
**Tiers**: Unit (all functions), Integration (API endpoints), E2E (user workflows)
**Evidence**: Test file existence, coverage reports
**Validation**: Critical paths must have E2E tests

---

## KPI Targets

Track these metrics across all stage reviews:

| KPI | Target | Current | Trend |
|-----|--------|---------|-------|
| CrewAI compliance rate | ≥85% compliant without exception | [TBD] | [TBD] |
| Avg review cycle time | ≤3 days from start to decision | [TBD] | [TBD] |
| Cross-stage reuse rate | ≥30% of recommendations leverage reuse | [TBD] | [TBD] |
| Evidence citation rate | 100% of findings with citations | [TBD] | [TBD] |
| Debt resolution rate | ≥70% resolved within SLA | [TBD] | [TBD] |
| Review quality | ≥90% of reviews pass audit checklist | [TBD] | [TBD] |

**Update Frequency**: After every 5 stage reviews

---

## Quick Reference Commands

### Database Queries

**Find all SDs spawned by stage reviews**:
```sql
SELECT id, title, status,
       metadata->>'source_stage' as stage,
       metadata->>'crewai_compliance_status' as crewai_status,
       metadata->>'review_date' as reviewed_on
FROM strategic_directives_v2
WHERE metadata->>'spawned_from_review' = 'true'
ORDER BY (metadata->>'source_stage')::int;
```

**Find stages with CrewAI non-compliance**:
```sql
SELECT id, title, metadata->>'source_stage' as stage
FROM strategic_directives_v2
WHERE metadata->>'crewai_compliance_status' = 'non_compliant';
```

**Find SDs with technical debt**:
```sql
SELECT id, title,
       jsonb_array_length(metadata->'technical_debt_items') as debt_count,
       metadata->'technical_debt_items' as debt_items
FROM strategic_directives_v2
WHERE metadata->>'spawned_from_review' = 'true'
  AND metadata->'technical_debt_items' IS NOT NULL
ORDER BY debt_count DESC;
```

**Check CrewAI agents for a stage**:
```sql
SELECT id, name, role, goal, stage, version
FROM crewai_agents
WHERE stage = [STAGE_NUMBER]
ORDER BY name;
```

**Check CrewAI crews for a stage**:
```sql
SELECT id, name, orchestration_type, stage
FROM crewai_crews
WHERE stage = [STAGE_NUMBER];
```

### File Search Patterns

**Find stage review files**:
```bash
ls /mnt/c/_EHG/EHG_Engineer/docs/workflow/stage_reviews/stage-*/
```

**Search for patterns in reviews**:
```bash
grep -r "CrewAI" /mnt/c/_EHG/EHG_Engineer/docs/workflow/stage_reviews/
```

**Find reusable patterns in code**:
```bash
# Use Glob tool
pattern: "agent-platform/app/**/*crew*.py"
pattern: "src/lib/supabase/**/*.ts"
```

---

## Cross-References

### Core Framework
- [Review Process](./review_process.md) - Full step-by-step procedures
- [Stage Review Template](./review_templates/stage_review_template.md) - Comprehensive template for all 5 files
- [Source Stage Metadata Field](./source_stage_metadata_field.md) - Database metadata specification

### Governance
- Exception Documentation - Chairman-approved exceptions directory
- Strategic Directives: Query `strategic_directives_v2` table with filters

### Protocol Reference
- LEO Protocol v4.2.0: CLAUDE.md router and core documentation
- Phase Gates: LEAD, PLAN, EXEC validation requirements

---

## Continuous Improvement Process

### After Every Review
1. **Reflect**: Was the process efficient? Were tools/data available?
2. **Document**: Add lessons to `stage_review_lessons.md`
3. **Adjust**: Update this index or framework docs if needed

### After Every 5 Reviews
1. **Evaluate**: Review KPIs, identify patterns in gaps/decisions
2. **Iterate**: Revise framework based on data
3. **Communicate**: Share learnings with team

### Quarterly
1. **Audit**: Random sample of 3-5 reviews for quality check
2. **Survey**: Gather feedback from reviewers
3. **Optimize**: Update templates, tools, or procedures

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-11-07 | Initial best practices index creation | Claude Code |

---

**Document Owner**: Chairman
**Document Status**: Active
**Last Review**: 2025-11-07
**Next Review**: After 10 stage reviews or 2025-Q2, whichever comes first

---

<!-- Generated by Claude Code | Best Practices Index | 2025-11-07 -->
