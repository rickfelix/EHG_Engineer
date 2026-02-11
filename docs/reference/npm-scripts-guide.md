# NPM Scripts Guide


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.1.0
- **Author**: DOCMON
- **Last Updated**: 2026-02-11
- **Tags**: database, api, testing, e2e, gap-analysis, integration

This guide documents all 140+ npm scripts available in EHG_Engineer.

## Quick Reference

| Category | Count | Key Commands |
|----------|-------|--------------|
| [LEO Protocol](#leo-protocol-management) | 25+ | `leo:status`, `leo:generate`, `leo:orchestrate` |
| [Strategic Directives](#strategic-directive-operations) | 10+ | `sd:next`, `sd:start`, `sd:status` |
| [PRD Management](#prd-management) | 15+ | `prd:validate`, `prd:health`, `prd:new` |
| [Database](#database-operations) | 10+ | `db:create`, `schema:docs`, `check-db` |
| [Testing](#testing) | 15+ | `test`, `test:e2e`, `test:uat` |
| [Validation](#validation) | 6+ | `validate:bypass`, `validate:sd-type-sync` |
| [Context Management](#context-management) | 8+ | `context:usage`, `context:compact` |
| [Pattern Management](#pattern-management) | 12+ | `pattern:resolve`, `pattern:sync` |
| [Handoffs](#handoffs) | 5+ | `handoff`, `handoff:list`, `handoff:compliance` |
| [RCA (Root Cause Analysis)](#rca-root-cause-analysis) | 12+ | `rca:list`, `rca:trigger`, `rca:status` |

---

## LEO Protocol Management

### Core Commands

```bash
npm run leo              # Main LEO CLI
npm run leo:help         # Show LEO help
npm run leo:status       # Show LEO Protocol status
npm run leo-status       # Show status line
npm run leo:version      # Check LEO version
npm run leo:version:fix  # Fix version issues
```

### Orchestration

```bash
npm run leo:orchestrate  # Run LEO orchestrator (enforced)
npm run leo:execute      # Execute LEO workflow
npm run leo:commit       # Commit with LEO feedback
npm run leo:new          # Create new strategic directive
```

### Maintenance

```bash
npm run leo:maintenance      # Run maintenance tasks
npm run leo:cleanup          # Cleanup LEO artifacts
npm run leo:cleanup:full     # Full cleanup
npm run leo:cleanup:force    # Force cleanup
npm run leo:cleanup:root     # Cleanup root temp files
npm run leo:cleanup:root:force
```

### Refresh & Generate

```bash
npm run leo:refresh          # Refresh LEO state
npm run leo:refresh:check    # Check-only mode
npm run leo:refresh:force    # Force refresh
npm run leo:generate         # Generate CLAUDE.md from database
npm run leo:summary          # Generate LEO summary
```

### Schema Discovery

```bash
npm run leo:discover         # Discover schema constraints
npm run leo:discover:dry     # Dry run discovery
```

### Genesis Branches

```bash
npm run genesis:branches         # List genesis branches
npm run genesis:branches:list    # List branches
npm run genesis:branches:incinerate  # Remove expired branches
npm run genesis:branches:extend  # Extend branch lifetime
npm run genesis:branches:check   # Check for expired branches
```

### Artifacts

```bash
npm run leo:artifacts:clean      # Clean artifacts
npm run leo:artifacts:clean:dry  # Dry run
npm run leo:artifacts:clean:full # Full cleanup
npm run leo:artifacts:clean:verbose
```

### Git Operations

```bash
npm run git:recover              # Scan reflog for orphaned commits (last 24h)
npm run git:recover -- --hours 72    # Scan last 3 days
npm run git:recover -- --recover <SHA>  # Recover specific orphaned commit
```

**Purpose**: Automated git commit recovery for multi-session environments.

**Use Cases**:
- **Cross-session contamination recovery**: When `/ship` in one session switched branches for another, leaving commits orphaned
- **Interrupted work recovery**: Find commits from crashed sessions
- **Branch deletion recovery**: Commits from accidentally deleted branches

**How It Works**:
- Scans `git reflog` for commits in the time window
- Checks reachability via `git branch -a --contains` (includes remote branches)
- Reports orphaned commits with: SHA, message, date, files changed
- Recovery creates branch `recovery/<short-sha>-<timestamp>` from orphaned commit

**See**: [Git Commit Recovery Guide](git-commit-recovery-guide.md) for detailed usage

### Gap Analysis

```bash
npm run gap:analyze -- --sd SD-KEY       # Analyze single SD
npm run gap:analyze -- --sd SD-KEY --verbose  # Detailed output with steps
npm run gap:analyze:batch                # Analyze last 10 completed SDs
npm run gap:analyze -- --all --limit 20  # Batch with custom limit
npm run gap:analyze -- --sd SD-KEY --json    # JSON output
npm run gap:analyze -- --sd SD-KEY --create-sds  # Auto-create corrective SDs
```

**Purpose**: Detect gaps between PRD requirements and actual implementation.

**How It Works**:
- Extracts functional requirements from `product_requirements_v2`
- Identifies deliverables via git history (commit grep, branch diff, or date range)
- Matches requirements to deliverables with confidence scoring
- Classifies root causes: `prd_omission`, `scope_creep`, `technical_blocker`, `dependency_gap`, `protocol_bypass`
- Stores results in `gap_analysis_results` table

**Integration**: Runs automatically in `orchestrator-completion-hook.js` for completed orchestrator children.

---

## Strategic Directive Operations

### Queue & Navigation

```bash
npm run sd:next          # Show intelligent SD queue (RECOMMENDED start)
npm run sd:start         # Start working on an SD
npm run sd:status        # View SD progress
npm run sd:burnrate      # View velocity and forecasting
```

### Baseline Management

```bash
npm run sd:baseline          # Show baseline
npm run sd:baseline:create   # Create baseline
npm run sd:baseline:view     # View baseline
```

### Session Management

```bash
npm run sd:claim         # Claim SD for current session
npm run sd:release       # Release SD claim
```

### Creating SDs

#### Recommended: /leo create Command

The `/leo create` command provides a unified interface for SD creation (SD-LEO-SDKEY-001):

```bash
# Interactive mode - Prompts for type, title, etc.
/leo create

# From UAT finding
/leo create --from-uat <test-id>

# From /learn pattern
/leo create --from-learn <pattern-id>

# From /inbox feedback
/leo create --from-feedback <feedback-id>

# Create child SD
/leo create --child <parent-key> [index]
```

**Features**:
- Unified SDKeyGenerator with source traceability (UAT, LEARN, FEEDBACK, PATTERN, LEO)
- Consistent key format: `SD-{SOURCE}-{TYPE}-{SEMANTIC}-{NUM}`
- Automatic collision detection across `sd_key` and `id` columns
- Hierarchy support (parent/child/grandchild/great-grandchild)

See: `docs/reference/sd-key-generator-guide.md` for API documentation.

#### Legacy Commands

```bash
npm run new-sd           # Interactive new SD wizard (legacy)
npm run add-sd           # Add SD to database (legacy)
npm run create-app-sd    # Create app-specific SD (legacy)
```

### Gap Analysis

**Purpose**: Detect integration gaps between PRD requirements and actual deliverables.

```bash
# Analyze single completed SD
npm run gap:analyze -- --sd SD-LEO-FEAT-001

# Batch analysis (last 10 completed SDs)
npm run gap:analyze:batch

# Batch analysis with custom limit
npm run gap:analyze:batch -- --limit 5

# Verbose output (shows analysis steps)
npm run gap:analyze:verbose -- --sd SD-LEO-FEAT-001

# JSON output (for automation)
npm run gap:analyze -- --sd SD-LEO-FEAT-001 --json

# Create corrective SDs for gaps found
npm run gap:analyze -- --sd SD-LEO-FEAT-001 --create-sds
```

**Output Metrics**:
- **Coverage Score**: % of requirements matched (0-100, or NULL if no PRD)
- **Gaps Found**: Count of unmatched/partially matched requirements
- **Severity Distribution**: Critical, High, Medium, Low
- **Root Cause Categories**: protocol_bypass, scope_creep, technical_blocker, dependency_gap, prd_omission
- **Corrective SDs**: Auto-created SDs for critical/high gaps

**Use Cases**:
- **Post-Completion Validation**: Automatic via orchestrator-completion-hook
- **Retroactive Audit**: Analyze historical SDs to validate completeness
- **Quality Metrics**: Track PRD → implementation alignment over time

**See**: `docs/04_features/post-completion-integration-gap-detector.md` for full documentation.

---

## PRD Management

### Validation

```bash
npm run prd:validate         # Validate all PRD formats
npm run prd:fix              # Auto-fix PRD issues
npm run prd:schema           # Validate against schema
```

### Diagnostics

```bash
npm run prd:health           # Health check
npm run prd:check            # Check SD-PRD linkage
npm run prd:report           # Format report
npm run prd:tables           # Table status
npm run prd:orphaned         # Find orphaned PRDs
```

### Generation & Audit

```bash
npm run prd:new              # Generate new PRD
npm run prd:consolidated     # Generate consolidated PRD
npm run prd:audit            # Audit all PRD scripts
npm run prd:audit:fix        # Fix PRD script issues
npm run prd:audit:dry        # Dry run fixes
```

---

## Database Operations

### Connection & Setup

```bash
npm run check-db             # Verify database connection
npm run setup-db             # Setup database (local)
npm run setup-db-supabase    # Setup database (Supabase)
npm run test-database        # Test database connectivity
```

### Schema Creation

```bash
npm run db:create            # Create schema from SQL
npm run db:timeline          # Create SD execution timeline
npm run db:leo               # Apply LEO Protocol schema
npm run db:agent-metrics     # Apply context learning schema
npm run db:ehg               # Apply EHG-specific schema
npm run db:subagent          # Apply subagent schema
```

### Schema Documentation

```bash
npm run schema:docs          # Generate schema docs (default: engineer)
npm run schema:docs:engineer # Generate engineer DB docs
npm run schema:docs:app      # Generate app DB docs
npm run schema:docs:ehg      # Generate EHG docs
npm run schema:docs:all      # Generate all docs
npm run schema:docs:table    # Generate single table docs
npm run schema:docs:verbose  # Verbose output
```

---

## Testing

### Unit & Integration Tests

```bash
npm test                     # Run all tests
npm run test:unit            # Run unit tests only
npm run test:integration     # Run integration tests
npm run test:smoke           # Run smoke tests
npm run test:watch           # Watch mode
npm run test:coverage        # Run with coverage
```

### E2E Tests

```bash
npm run test:e2e             # Run Playwright E2E tests
npm run test:e2e:human       # Run human-like E2E tests
npm run test:e2e:human:restart  # With frontend restart
npm run test:e2e:a11y        # Accessibility tests only
npm run test:e2e:retro       # Generate E2E retrospective
```

### User Acceptance Testing

```bash
npm run test:uat             # Run UAT suite
```

### RCA Tests

```bash
npm run rca:test             # Run all RCA tests
npm run rca:test:unit        # Run RCA unit tests
npm run rca:test:integration # Run RCA integration tests
```

### Validation

### Story Mapping

```bash
npm run validate:story-mapping          # Validate story-test mapping
npm run validate:story-mapping:verbose  # Verbose output
npm run validate:story-mapping:fix      # Auto-fix mapping
```

### LEO Protocol Validation

```bash
npm run validate:bypass                 # Run bypass detection on recent SDs (last 7 days)
npm run validate:bypass:all             # Run bypass detection on all SDs
npm run validate:sd-type-sync           # Verify SD type synchronization across constraint/profiles/code
```

---

## Context Management

### Usage & Monitoring

```bash
npm run context:usage        # Show context usage summary
npm run context:sync         # Sync context usage
npm run context:analyze      # Analyze context patterns
npm run context:monitor      # Monitor context health
npm run context:status       # Show memory manager status
```

### Optimization

```bash
npm run context:refresh      # Refresh file trees
npm run context:compact      # Compact context (reduce size)
```

### Memory

```bash
npm run memory:view          # View memory state
```

---

## Pattern Management

### Core Operations

```bash
npm run pattern:resolve      # Resolve pattern matches
npm run pattern:stale        # Detect stale patterns
npm run pattern:stale:dry    # Dry run detection
```

### Sync & Ingest

```bash
npm run pattern:sync         # Sync pattern triggers
npm run pattern:sync:dry     # Dry run sync
npm run pattern:ingest       # Ingest lessons learned markdown
npm run pattern:ingest:dry   # Dry run ingest
```

### Extraction & Maintenance

```bash
npm run pattern:extract      # Auto-extract from retrospectives
npm run pattern:backfill     # Backfill pattern subagents
npm run pattern:backfill:dry # Dry run backfill
npm run pattern:maintenance  # Run pattern maintenance
npm run pattern:maintenance:dry
```

### Alerts

```bash
npm run pattern:alert        # Create alert SDs from patterns
npm run pattern:alert:dry    # Dry run alerts
```

---

## Handoffs

```bash
npm run handoff              # Create handoff
npm run handoff:list         # List handoffs
npm run handoff:stats        # Show handoff statistics
npm run handoff:compliance   # Check handoff compliance
```

---

## RCA (Root Cause Analysis)

### Core Operations

```bash
npm run rca:list             # List RCA records
npm run rca:view             # View specific RCA
npm run rca:trigger          # Trigger RCA analysis
npm run rca:status           # Check RCA status
npm run rca:gate-check       # Check RCA gates
```

### CAPA (Corrective Actions)

```bash
npm run rca:capa:generate    # Generate corrective actions
npm run rca:capa:approve     # Approve CAPA
npm run rca:capa:update      # Update CAPA status
npm run rca:capa:verify      # Verify CAPA implementation
```

### Learning

```bash
npm run rca:ingest-learnings # Ingest lessons learned
```

---

## Session Management

```bash
npm run session:prologue     # Generate session prologue
npm run session:status       # Show session status
npm run session:cleanup      # Cleanup sessions
npm run session:info         # Session info
npm run session:worktree     # Manage git worktrees for concurrent sessions
```

### Git Worktree Management

Create isolated git worktrees for concurrent Claude Code sessions (SD-LEO-INFRA-GIT-WORKTREE-AUTOMATION-001).

```bash
# Create worktree
npm run session:worktree -- --session <name> --branch <branch>

# List active worktrees
npm run session:worktree -- --list

# Cleanup worktree
npm run session:worktree -- --cleanup --session <name>
```

**Options**:
- `--session <name>` - Session name (directory under `.sessions/`)
- `--branch <branch>` - Branch to check out in worktree
- `--force` - Force recreate if exists with different branch
- `--no-symlink` - Skip node_modules symlink/junction
- `--list` - List all active worktree sessions
- `--cleanup` - Remove worktree and deregister

**Features**:
- Creates isolated worktrees under `.sessions/` directory
- Symlinks node_modules to avoid npm reinstall (junction on Windows)
- Branch guard pre-commit hook blocks commits to wrong branch
- Idempotent create (safe to run multiple times)

**Use Cases**:
- Parallel track execution (infrastructure + features)
- Hotfix while feature work in progress
- Testing different approaches concurrently

**See also**: [Multi-Session Coordination Ops Guide](../06_deployment/multi-session-coordination-ops.md#git-worktree-automation-sd-leo-infra-git-worktree-automation-001)

---

## Baseline Operations

```bash
npm run baseline:list        # List baselines
npm run baseline:assign      # Assign to baseline
npm run baseline:resolve     # Resolve baseline issues
npm run baseline:summary     # Baseline summary
npm run baseline:add         # Add to baseline
```

---

## Audit & Compliance

```bash
npm run audit-compliance     # Run LEO compliance audit
npm run audit:validate       # Validate audit file
npm run audit:ingest         # Ingest audit file
npm run audit:generate-sds   # Generate SDs from audit
npm run audit:retro          # Generate audit retrospective
```

---

## Protocol Improvements

```bash
npm run protocol:improvements    # List improvements
npm run protocol:review          # Review pending improvements
npm run protocol:apply-auto      # Apply auto-improvements
npm run protocol:effectiveness   # Check effectiveness
npm run protocol:rescan          # Rescan for improvements
npm run protocol:stats           # Show statistics
```

---

## Proposals

```bash
npm run proposal:list        # List proposals
npm run proposal:approve     # Approve proposal
npm run proposal:dismiss     # Dismiss proposal
npm run proposal:view        # View proposal details
```

---

## Gate Health

```bash
npm run gate:health          # Check gate health
npm run gate:health:dry      # Dry run check
npm run gate:health:refresh  # Refresh gate data
```

---

## Documentation

```bash
npm run docs:boundary        # Generate boundary examples
npm run docs:bg-scripts      # Generate script docs
npm run docs:bg-agents       # Generate agent docs
npm run docs:bg-compliance   # Run DOCMON sub-agent
npm run docs:bg-health       # Documentation health check
npm run docs:bg-all          # Generate all docs
```

---

## Evidence & Tracing

```bash
npm run evidence:manifest    # Generate evidence manifest
npm run evidence:verify      # Verify evidence
npm run trace:cleanup        # Cleanup passing traces
npm run trace:cleanup:dry    # Dry run cleanup
npm run trace:cleanup:verbose
```

---

## Tokens & Budget

```bash
npm run token:budget         # Show budget status
npm run token:log            # Token logger
```

---

## Agent Operations

```bash
npm run agent:metrics        # Agent metrics dashboard
npm run agent:metrics:agent  # Per-agent metrics
npm run agent:metrics:top    # Top agents view
```

---

## Priority & Planning

```bash
npm run prio:top3            # Show top 3 priorities (WSJF)
npm run preflight            # Phase preflight check
```

---

## Application Management

```bash
npm run register-app         # Register new application
npm run switch-context       # Switch application context
npm run show-context         # Show current context
npm run list-apps            # List all applications
npm run sync-app             # Sync application state
npm run sync-github          # Sync with GitHub
npm run sync-supabase        # Sync with Supabase
npm run deploy-sd            # Deploy SD to application
```

---

## Linting

```bash
npm run lint                 # Lint all code
npm run lint:fix             # Auto-fix lint issues
npm run lint:e2e             # Lint E2E tests
npm run lint:e2e:fix         # Fix E2E lint issues
```

---

## Build

```bash
npm run build:loader         # Build TypeScript loader
npm run test:loader:dry      # Test loader (dry run)
```

---

## Git Hooks

```bash
npm run prepare              # Setup husky hooks
```

---

## Untrack Operations

```bash
npm run untrack:manifest     # Generate untrack manifest
npm run untrack:execute      # Execute untracking
npm run untrack:execute:force
```

---

## CLI

```bash
npm run cli                  # Interactive CLI
npm run leo                  # LEO CLI (alias)
```

---

## Common Workflows

### Starting a New Session

```bash
npm run sd:next              # See what to work on
npm run session:prologue     # Generate session context
npm run prio:top3            # Check priorities
```

### Before Committing

```bash
npm run lint                 # Check code style
npm run test:smoke           # Quick smoke tests
npm run handoff:compliance   # Check handoff compliance
```

### After Completing Work

```bash
npm run handoff              # Create handoff
npm run leo:summary          # Generate summary
npm run pattern:extract      # Extract lessons learned
```

### Database Changes

```bash
npm run check-db             # Verify connection
npm run db:create            # Apply migrations
npm run schema:docs          # Regenerate docs
```

### Debugging Issues

```bash
npm run rca:trigger          # Start RCA
npm run context:analyze      # Analyze context
npm run prd:health           # Check PRD health
npm run gate:health          # Check gates
```

### Validating Protocol Integrity

```bash
npm run validate:bypass      # Check for artifact chronology violations
npm run validate:sd-type-sync # Verify SD type consistency
npm run handoff:compliance   # Check handoff compliance
```

---

## Environment Variables

Many scripts respect these environment variables:

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `OPENAI_API_KEY` | OpenAI API key (for AI features) |
| `NODE_ENV` | Environment (development/production) |

---

## Related Documentation

- [API Documentation](../02_api/api-documentation-overview.md)
- [Database README](../../database/README.md)
- [LEO Protocol](../../CLAUDE.md)

---

*Last Updated: 2026-01-19*
