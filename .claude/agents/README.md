# Claude Code Agents - LEO Bridge

## Overview

This directory contains Claude Code agents that integrate with the LEO Protocol's database-driven sub-agent system via a **Generate-Time Bridge** (Prompt Compiler pattern).

## Architecture

**Source → Build Pipeline**:
```
.partial.md (source, committed) 
    ↓ Generation script reads
    ↓ + Fetches LEO database knowledge (triggers, patterns, capabilities)
    ↓ + Injects "Institutional Memory" block (500-token cap)
    ↓
.md (build artifact, gitignored)
```

**Key Files**:
- `*.partial.md` - Human-authored agent identity (committed to git)
- `*.md` - Generated agents with institutional memory (gitignored)
- `AGENT-MANIFEST.md` - Complete agent registry with capabilities
- `_model-tracking-section.md` - Model tier routing reference

## Agent List

| Agent | Code | Use For |
|-------|------|---------|
| api-agent | API | API design, endpoint documentation |
| database-agent | DATABASE | Schema design, migrations, RLS policies |
| dependency-agent | DEPENDENCY | npm updates, CVE scanning |
| design-agent | DESIGN | UI/UX validation, accessibility |
| docmon-agent | DOCMON | Documentation generation |
| github-agent | GITHUB | CI/CD validation, GitHub Actions |
| orchestrator-child-agent | ORCHESTRATOR_CHILD | Parallel child SD execution |
| performance-agent | PERFORMANCE | Performance validation, load testing |
| rca-agent | RCA | Root cause analysis, 5-whys |
| regression-agent | REGRESSION | Backward compatibility validation |
| retro-agent | RETRO | Retrospective generation |
| risk-agent | RISK | Risk assessment, mitigation |
| security-agent | SECURITY | Auth, vulnerability scanning |
| stories-agent | STORIES | User story engineering |
| testing-agent | TESTING | E2E test generation, coverage |
| uat-agent | UAT | User acceptance testing |
| validation-agent | VALIDATION | Codebase validation, duplicate detection |

## Usage

### Compile Agents

```bash
# Automatic: Session-start hook runs this
# Manual: Compile all agents
npm run agents:compile

# Incremental (skip if unchanged)
node scripts/generate-agent-md-from-db.js --incremental

# Dry-run (preview)
node scripts/generate-agent-md-from-db.js --dry-run
```

### Audit Agent Systems

```bash
# Check for gaps between Claude Code and LEO database
node scripts/agent-reconciliation-audit.js

# Outputs:
# - artifacts/agent-reconciliation.json (machine-readable)
# - artifacts/agent-reconciliation.md (human-readable)
```

### Invoke Agents

**Single agent** (via Task tool):
```
Task tool with subagent_type="rca-agent":
"Analyze why the handoff failed for SD-XXX-001"
```

**Team** (via Claude Code Teams):
```
Spawn lead (orchestrator-child-agent)
Lead spawns teammates (security-agent, testing-agent, design-agent)
Teammates collaborate via SendMessage
```

## Institutional Memory

Every agent arrives with pre-loaded knowledge:

✅ **Included** (pre-generated at session start):
- Top 8 trigger keywords
- Top 3 recurring issue patterns (with proven fixes)
- Registered capabilities
- NOT EXHAUSTIVE disclaimer

⚠️ **NOT Included** (agent must query DB):
- Task-specific data
- Real-time database state
- Complete trigger list (only top 8)
- Specific incident details

## Creating New Agents

1. **Create `.partial.md`**:
   ```bash
   cp .claude/agents/template.partial.md .claude/agents/new-agent.partial.md
   ```

2. **Add to `AGENT_CODE_MAP`** in `scripts/generate-agent-md-from-db.js`:
   ```javascript
   'new-agent': 'NEW_CODE',
   ```

3. **Register in LEO database**:
   ```sql
   INSERT INTO leo_sub_agents (code, name, description, capabilities, active)
   VALUES ('NEW_CODE', 'New Agent', 'Description...', '["cap1"]', true);
   ```

4. **Add triggers**:
   ```sql
   INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, priority, active)
   SELECT id, 'keyword1', 100, true FROM leo_sub_agents WHERE code = 'NEW_CODE';
   ```

5. **Add config routing** in `config/phase-model-routing.json`

6. **Compile**:
   ```bash
   npm run agents:compile
   ```

## Documentation

- **[Agent Systems Bridge Architecture](../../docs/01_architecture/agent-systems-bridge-architecture.md)** - Full technical architecture
- **[Agent Team Collaboration Guide](../../docs/reference/agent-team-collaboration-guide.md)** - How agents work together
- **[Agent Patterns Guide](../../docs/reference/agent-patterns-guide.md)** - Base classes and patterns
- **[LEO Protocol v4.2 - Hybrid Sub-Agent System](../../docs/03_protocols_and_standards/LEO_v4.2_HYBRID_SUB_AGENTS.md)** - Original design

## Performance

- **Generation time**: ~2.5s full, ~400ms incremental (unchanged)
- **Runtime overhead**: Zero (knowledge pre-compiled)
- **Token budget**: 500 tokens/agent cap, ~5,100-6,800 total for 17 agents

## Validation

Config validation enforces required registrations:
- `RCA` must be in defaults, phaseOverrides, categoryMappings
- `ORCHESTRATOR_CHILD` must be in defaults, phaseOverrides, categoryMappings

Missing registrations cause generation to fail with error.

---

*For SD-LEO-INFRA-BRIDGE-AGENT-SYSTEMS-001*
*LEO Protocol v4.3.3*
