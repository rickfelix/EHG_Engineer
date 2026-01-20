# Protocols and Standards

This directory contains all LEO protocol versions, development standards, and workflow guidelines for the EHG Engineer project.

## Metadata
- **Category**: protocols
- **Status**: active
- **Last Updated**: 2026-01-05

---

## Directory Contents

### Current Protocol (v4.4.2)

> **Note**: LEO Protocol v4.4.2 is the current active version.
> See `/CLAUDE.md` for the current protocol context router.

**Latest Release**: **v4.4.2 - Testing Governance** (2026-01-05)

| File | Description |
|------|-------------|
| **`LEO_v4.4.2_testing_governance.md`** | **NEW**: Testing governance gates, schema context loader, retro test metrics |
| **`LEO_v4.4.2_CHANGELOG.md`** | **NEW**: v4.4.2 changelog and migration guide |
| `LEO_v4.3_subagent_enforcement.md` | Sub-agent enforcement patterns |
| `LEO_v4.2_HYBRID_SUB_AGENTS.md` | Hybrid sub-agent architecture and execution patterns |
| `LEO_v4.2_PLAYWRIGHT_TESTING_INTEGRATION.md` | Playwright integration for E2E testing |
| `LEO_v4.2_dynamic_checklists.md` | Dynamic checklist generation |
| `leo_git_commit_guidelines_v4.2.0.md` | Git commit message standards and conventions |

### v4.4.2 Highlights (2026-01-05)

**New Features**:
1. **MANDATORY_TESTING_VALIDATION** gate (blocking) - Ensures code-producing SDs have fresh test evidence
2. **TEST_EVIDENCE_AUTO_CAPTURE** gate (advisory) - Auto-ingests test reports before sub-agent orchestration
3. **Schema Context Loader** - Auto-loads relevant schema docs for tables mentioned in SD
4. **Test Coverage Metrics in Retrospectives** - 11 new columns for quantitative test analysis

**Impact**:
- 90-91% reduction in schema/testing issues (92-165 hours/year → 10-15 hours/year)
- 100% of code-producing SDs now require test evidence
- Auto-linking of tests to user stories via `story_test_mappings`

**See**: [LEO_v4.4.2_testing_governance.md](./LEO_v4.4.2_testing_governance.md) for full specification

### Archived Protocols (Moved to Archive)

**Location**: `/docs/archive/protocols/`

Legacy protocol versions (v3.x, v4.0, v4.1.x) have been archived as of 2025-10-24:

| Version | Files Archived | Notes |
|---------|----------------|-------|
| v3.x | 3 files | v3.1.5 (83KB), v3.1.6, v3.3.0 |
| v4.0 | 1 file | First v4.x release |
| v4.1.x | 3 files | v4.1, v4.1.1, v4.1.2 |

**Total Archived**: 7 protocol files
**See**: [/docs/archive/protocols/README.md](/docs/archive/protocols/README.md)

### Protocol Extensions

| File | Description |
|------|-------------|
| `LEO_PROTOCOL_CHECKLIST_ENFORCEMENT.md` | Mandatory checklist enforcement rules |
| `LEO_v4.1_SUMMARY.md` | Summary of v4.1 features and changes |
| `leo_protocol_repository_guidelines.md` | Repository organization and maintenance |

### Supporting Tools & Integrations

| File | Description |
|------|-------------|
| `leo_helper_tools.md` | Helper tools and utilities for LEO workflows |
| `leo_status_line_integration.md` | Status line integration for CLI |
| `leo_status_reference.md` | Status codes and reference guide |
| `leo_vision_qa_integration.md` | Vision QA workflow integration |
| `leo-prd-automation.md` | PRD automation workflows |

### Deployment & Git Workflows

| File | Description |
|------|-------------|
| `leo_github_deployment_workflow_v4.1.2.md` | GitHub Actions deployment workflows |
| `leo_git_commit_guidelines_v4.2.0.md` | Git commit message standards |

---

## Quick Reference

### Current Active Protocol
**LEO Protocol v4.4.2** is the current active version. Key features:
- **Testing Governance** (v4.4.2) - Mandatory test validation in EXEC→PLAN handoff
- **Schema Context Loader** (v4.4.2) - Auto-loads schema docs for relevant tables
- **Test Metrics in Retrospectives** (v4.4.2) - Quantitative test coverage analysis
- **Sub-agent Enforcement** (v4.3) - Mandatory sub-agent execution
- **Hybrid Sub-agent Architecture** (v4.2) - Sub-agent orchestration patterns
- **Playwright E2E Testing Integration** (v4.2) - E2E test automation
- **Database-first Patterns** (v4.x) - Strictly enforced
- **Git Commit Conventions** (v4.2) - Standardized commit messages
- **UI Parity Governance** (v4.3.3) - UI consistency enforcement

### Version History

| Version | Date | Key Changes |
|---------|------|-------------|
| **4.4.2** | 2026-01-05 | Testing governance gates, schema context loader, retro test metrics |
| 4.3.3 | 2025-12-XX | UI parity governance |
| 4.3.0 | 2025-09-XX | Sub-agent enforcement |
| 4.2.0 | 2025-08-XX | Dynamic checklists, hybrid sub-agents, Playwright integration |
| 4.1.2 | 2025-07-XX | GitHub deployment workflow |

### Archived Protocols
Legacy protocols (v3.x, v4.0, v4.1.x) have been archived to `/docs/archive/protocols/` as of 2025-10-24. See archive README for historical reference and migration guidance.

---

## Migration to v4.4.2

**From v4.3.x**:

```bash
# 1. Run database migration
psql $DATABASE_URL -f database/migrations/20260105_add_retro_test_metrics.sql

# 2. (Optional) Configure environment variables
export LEO_TESTING_MAX_AGE_HOURS=24
export LEO_TEST_EVIDENCE_MAX_AGE_MINUTES=60

# 3. Test EXEC→PLAN handoff workflow
node scripts/handoff.js execute EXEC-TO-PLAN <SD-ID>
```

**Breaking Changes**:
- Code-producing SDs now **require** TESTING sub-agent execution
- Stale test evidence (>24h) will **block** EXEC-TO-PLAN handoff

**Remediation**:
```bash
npx playwright test                          # Run E2E tests
npm run subagent:execute TESTING <SD-ID>     # Execute TESTING sub-agent
node scripts/handoff.js execute EXEC-TO-PLAN <SD-ID>  # Retry handoff
```

**See**: [LEO_v4.4.2_CHANGELOG.md](./LEO_v4.4.2_CHANGELOG.md) for full migration guide

---

## Related Documentation

### Core Protocol Files
- `/CLAUDE.md` - LEO Protocol context router
- `/CLAUDE_CORE.md` - Core protocol implementation
- `/CLAUDE_LEAD.md` - LEAD phase operations
- `/CLAUDE_PLAN.md` - PLAN phase operations
- `/CLAUDE_EXEC.md` - EXEC phase operations

### Reference Documentation
- `/docs/leo/handoffs/handoff-system-guide.md` - **UPDATED**: Handoff gate architecture (v4.4.2)
- `/docs/leo/gates.md` - Gate 2A-3 validation
- `/docs/DOCUMENTATION_STANDARDS.md` - Documentation standards

### Implementation Files (v4.4.2)
- `/scripts/modules/handoff/executors/ExecToPlanExecutor.js` - EXEC→PLAN gates
- `/lib/schema-context-loader.js` - Schema docs loading
- `/lib/sub-agents/retro.js` - Test metrics integration
- `/database/migrations/20260105_add_retro_test_metrics.sql` - Schema migration

---

## Navigation

- **Parent**: [Documentation Home](/docs/README.md)
- **Next**: [04 Features](/docs/04_features/README.md)
- **Previous**: [02 API](/docs/02_api/README.md)

---

**Note**: Documentation audit cleanup completed 2025-10-24. Legacy protocol versions (v3.x - v4.1.x) archived to `/docs/archive/protocols/`. **v4.4.2 released 2026-01-05** with testing governance enhancements.

*Part of LEO Protocol v4.4.2 - Protocols and Standards*
*Updated: 2026-01-05*
