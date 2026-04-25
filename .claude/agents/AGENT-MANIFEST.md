# Custom Agent Manifest

**Last Updated**: 2026-04-25
**Active Agents**: 17 (`.partial` sources in `.claude/agents/`)
**Archived Agents**: 3 (`.md` files in `.claude/agents/_archived/`)
**Total**: 20
**Generator**: `node scripts/generate-agent-manifest.js` — re-run after agent additions/removals.

> Source of truth is the `.partial` files (committed). Compiled `.md` files in `.claude/agents/` are build artifacts (gitignored) produced by `scripts/generate-agent-md-from-db.js`. This manifest enumerates the canonical sources, not the compiled outputs.

---

## Active Agents

Listed alphabetically. Each entry shows the agent name, model, reasoning-effort tag (Module H), and one-line description from frontmatter.

### api-agent
- **File**: `api-agent.partial`
- **Model**: `sonnet`
- **Reasoning effort**: `medium`
- **Description**: MUST BE USED PROACTIVELY for all API-related tasks. Handles REST/GraphQL endpoint design, API architecture, versioning, and documentation. Trigger on keywords: API, REST, GraphQL, endpoint, route, controller, middleware, API design.

### database-agent
- **File**: `database-agent.partial`
- **Model**: `sonnet`
- **Reasoning effort**: `high`
- **Description**: MUST BE USED PROACTIVELY for all database tasks. Handles schema design, Supabase migrations, RLS policies, SQL validation, and architecture. Trigger on keywords: database, migration, schema, table, RLS, SQL, Postgres, created migration, wrote migration, execute migration, apply migration, run migration, pending migration.

### dependency-agent
- **File**: `dependency-agent.partial`
- **Model**: `sonnet`
- **Reasoning effort**: `medium`
- **Description**: MUST BE USED PROACTIVELY for all dependency-related tasks. Handles npm/package updates, security vulnerabilities (CVE), dependency conflicts, version management, and CI/CD dependency failures. Trigger on keywords: dependency, npm, package, vulnerability, CVE, outdated, upgrade, npm audit.

### design-agent
- **File**: `design-agent.partial`
- **Model**: `sonnet`
- **Reasoning effort**: `high`
- **Description**: MUST BE USED PROACTIVELY for all code-producing SD types (feature, enhancement, bugfix, refactor, performance) AND for UI/UX tasks. Handles component sizing, design validation, accessibility, and user experience assessment. Trigger on: (1) SD types: feature, enhancement, refactor, performance; (2) Keywords: UI, UX, design, component, interface, accessibility, a11y, layout, responsive, frontend, dashboard, API endpoint, new feature, new endpoint, backend feature, service layer, controller, database table.

### docmon-agent
- **File**: `docmon-agent.partial`
- **Model**: `sonnet`
- **Reasoning effort**: `medium`
- **Description**: MUST BE USED PROACTIVELY for all documentation tasks. Handles AI documentation generation, workflow documentation, and information architecture. Trigger on keywords: documentation, docs, README, guide, documentation generation, workflow docs.

### github-agent
- **File**: `github-agent.partial`
- **Model**: `sonnet`
- **Reasoning effort**: `medium`
- **Description**: MUST BE USED PROACTIVELY for all CI/CD and GitHub Actions tasks. Handles pipeline verification, workflow validation, deployment checks, and refactoring safety. Trigger on keywords: GitHub Actions, CI/CD, pipeline, workflow, deployment, build, actions, refactor.

### orchestrator-child-agent
- **File**: `orchestrator-child-agent.partial`
- **Model**: `opus`
- **Reasoning effort**: `low`
- **Description**: Teammate agent for parallel child SD execution within an orchestrator. Each teammate works in its own worktree, following the full LEO Protocol workflow for its assigned child SD.

### performance-agent
- **File**: `performance-agent.partial`
- **Model**: `sonnet`
- **Reasoning effort**: `high`
- **Description**: MUST BE USED PROACTIVELY for all performance engineering lead tasks. Trigger on keywords: performance, optimization, speed, latency, load, scalability, caching, indexing.

### rca-agent
- **File**: `rca-agent.partial`
- **Model**: `opus`
- **Reasoning effort**: `high`
- **Description**: MUST BE USED PROACTIVELY for all root cause analysis tasks. Handles defect triage, root cause determination, and CAPA generation. Trigger on keywords: root cause, 5 whys, diagnose, debug, investigate, why is this happening, what caused this, rca, defect analysis, recurring issue, keeps happening.

### regression-agent
- **File**: `regression-agent.partial`
- **Model**: `sonnet`
- **Reasoning effort**: `medium`
- **Description**: MUST BE USED PROACTIVELY for all refactoring validation tasks. Validates backward compatibility, captures baseline state, compares before/after results. Trigger on keywords: refactor, refactoring, restructure, backward compatibility, regression, no behavior change.

### retro-agent
- **File**: `retro-agent.partial`
- **Model**: `sonnet`
- **Reasoning effort**: `medium`
- **Description**: MUST BE USED PROACTIVELY for retrospective generation and continuous improvement. Handles retrospective creation, lesson extraction, and quality scoring. Trigger on keywords: retrospective, retro, lessons learned, continuous improvement, post-mortem.

### risk-agent
- **File**: `risk-agent.partial`
- **Model**: `sonnet`
- **Reasoning effort**: `high`
- **Description**: MUST BE USED PROACTIVELY for all risk assessment sub-agent tasks. Trigger on keywords: risk, mitigation, contingency, risk assessment, risk management.

### security-agent
- **File**: `security-agent.partial`
- **Model**: `opus`
- **Reasoning effort**: `high`
- **Description**: MUST BE USED PROACTIVELY for all security tasks. Handles authentication, authorization, RLS policies, security validation, and threat assessment. Trigger on keywords: security, auth, RLS, permissions, roles, authentication, authorization, vulnerability, OWASP.

### stories-agent
- **File**: `stories-agent.partial`
- **Model**: `sonnet`
- **Reasoning effort**: `medium`
- **Description**: MUST BE USED PROACTIVELY for all user story context engineering sub-agent tasks. Trigger on keywords: user story, story, acceptance criteria, user journey.

### testing-agent
- **File**: `testing-agent.partial`
- **Model**: `sonnet`
- **Reasoning effort**: `medium`
- **Description**: MUST BE USED PROACTIVELY for all testing and QA tasks. Handles E2E testing, test generation, coverage validation, and QA workflows. Trigger on keywords: test, testing, QA, E2E, Playwright, coverage, test cases, user stories.

### uat-agent
- **File**: `uat-agent.partial`
- **Model**: `sonnet`
- **Reasoning effort**: `low`
- **Description**: MUST BE USED PROACTIVELY for all uat test executor tasks. Trigger on keywords: UAT, user acceptance, acceptance testing, user journey, acceptance criteria.

### validation-agent
- **File**: `validation-agent.partial`
- **Model**: `sonnet`
- **Reasoning effort**: `high`
- **Description**: MUST BE USED PROACTIVELY for codebase validation and duplicate detection. Handles existing implementation checks, duplicate detection, and systems analysis. Trigger on keywords: validation, duplicate, existing, codebase audit, systems analysis.

---

## Archived Agents

Retired agents kept for reference. Re-activate by moving the `.md` file out of `_archived/` and creating the corresponding `.partial` in `.claude/agents/` (then re-run this generator). Direct script invocation still works while archived: `node scripts/execute-subagent.js --code <CODE> --sd-id <SD-ID>`.

### performance-agent
- **File**: `performance-agent.md`
- **Model**: `inherit`
- **Reasoning effort**: `medium` *(default — file is missing tag)*
- **Description**: MUST BE USED PROACTIVELY for all performance tasks. Handles performance validation, optimization assessment, load testing, and resource monitoring. Trigger on keywords: performance, optimization, speed, latency, load, scalability, caching, indexing.

### retro-agent
- **File**: `retro-agent.md`
- **Model**: `inherit`
- **Reasoning effort**: `medium` *(default — file is missing tag)*
- **Description**: MUST BE USED PROACTIVELY for retrospective generation and continuous improvement. Handles retrospective creation, lesson extraction, and quality scoring. Trigger on keywords: retrospective, retro, lessons learned, continuous improvement, post-mortem.

### uat-agent
- **File**: `uat-agent.md`
- **Model**: `inherit`
- **Reasoning effort**: `medium` *(default — file is missing tag)*
- **Description**: MUST BE USED PROACTIVELY for user acceptance testing. Handles UAT validation, user journey testing, and acceptance criteria verification. Trigger on keywords: UAT, user acceptance, acceptance testing, user journey, acceptance criteria.

---

## Notes

- Module H (`SD-LEO-INFRA-OPUS-HARNESS-ALIGNMENT-001-A`) added the `reasoning_effort` tag convention. Agents missing the tag default to `medium` — fix the source file rather than this manifest.
- The compiler at `scripts/generate-agent-md-from-db.js` reads `.partial` files + LEO database knowledge to produce the gitignored `.md` files Claude Code loads at session start.
- Non-agent partials in `.claude/agents/` (e.g., `_model-tracking-section.partial`) are excluded from the inventory by design.
