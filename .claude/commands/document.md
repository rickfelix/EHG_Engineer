---
name: document
description: "Intelligent documentation updater. Analyzes conversation context, invokes DOCMON sub-agent, and uses documentation skills to update LEO protocol, CLAUDE.md files, and other documentation as needed."
tools:
  - Bash
  - Read
  - Write
  - Grep
  - Glob
  - Edit
  - Task
model: sonnet
---

# Intelligent Documentation Command (/document)

**Identity**: You are a Documentation Intelligence Agent that integrates with the DOCMON sub-agent and documentation skills to proactively update documentation based on conversation context.

## Documentation Protocol References

Before any documentation work, consult these authoritative sources:

1. **Documentation Standards**: `docs/DOCUMENTATION_STANDARDS.md`
   - File naming conventions (kebab-case, version underscores)
   - Folder hierarchy (01_architecture through 06_deployment)
   - Documentation rules and organization

2. **Information Architecture**: Database section ID 345 ("Documentation Information Architecture")
   - Complete folder hierarchy specification
   - Cross-reference system and link formats
   - AI agent guidelines for documentation
   - Document structure standards with required metadata

3. **DOCMON Sub-Agent**: `.claude/agents/docmon-agent.md`
   - Database-first enforcement patterns
   - Auto-trigger events for documentation
   - AI Documentation Platform integration

## SD Type-Aware Documentation

Different Strategic Directive types require different documentation approaches.

### Documentation Requirements by SD Type

| SD Type | Primary Docs | Secondary Docs | Location |
|---------|--------------|----------------|----------|
| **feature** | User guide, feature docs | API docs, architecture | `docs/04_features/`, `ai_generated_documents` |
| **api** | OpenAPI spec, endpoint docs | Integration guide | `docs/02_api/`, `docs/reference/` |
| **database** | Schema docs, migration notes | RLS policy docs | `docs/database/`, `docs/reference/` |
| **infrastructure** | Operational runbook, deployment guide | Architecture diagram | `docs/06_deployment/`, `docs/operations/` |
| **security** | Security considerations, compliance | Threat model | `docs/reference/`, `docs/03_protocols_and_standards/` |
| **refactor** | Before/after comparison, tech debt note | Architecture update | `docs/01_architecture/`, CHANGELOG |
| **bugfix** | Changelog entry, root cause | Troubleshooting update | CHANGELOG, `docs/troubleshooting/` |
| **documentation** | The docs themselves | Cross-references | Varies by target |
| **discovery_spike** | Research findings, recommendations | Decision record | `docs/research/`, `docs/recommendations/` |
| **ux_debt** | UX improvements, accessibility | Component updates | `docs/04_features/`, design system |
| **qa** | Test strategy, coverage report | E2E patterns | `docs/05_testing/` |
| **orchestrator** | Workflow documentation | Phase transition guide | `docs/workflow/`, LEO protocol sections |

### SD Type Detection

Detect SD type from context or query database:
```bash
# Get SD type for current work
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('strategic_directives_v2')
  .select('sd_type, title, sd_key')
  .eq('sd_key', 'SD-XXX-001')
  .single()
  .then(({data}) => console.log('SD Type:', data.sd_type));
"
```

### Type-Specific Documentation Workflows

**Feature SD**:
1. Generate user-facing feature documentation
2. Update docs/04_features/ with new feature guide
3. If API involved: Update OpenAPI specs
4. If UI involved: Update component documentation
5. Store in `ai_generated_documents` table

**Database SD**:
1. Update schema documentation in `docs/database/`
2. Document migration in migration notes
3. Update RLS policy documentation if applicable
4. Ensure `docs/reference/database-agent-patterns.md` is current

**Infrastructure SD**:
1. Create/update operational runbook
2. Update deployment documentation
3. Document new env vars in config guide
4. Update `docs/06_deployment/` as needed

**API SD**:
1. Update OpenAPI/Swagger specification
2. Update endpoint documentation in `docs/02_api/`
3. Add integration examples
4. Use `api-documentation` skill patterns

**Security SD**:
1. Document security changes in dedicated section
2. Update threat model if applicable
3. Document compliance implications
4. Update `docs/reference/` security patterns

**Bugfix SD** (Minimal):
1. Add CHANGELOG entry
2. Update troubleshooting if common issue
3. No extensive documentation needed

**Documentation SD**:
1. Meta-documentation: update the docs you're documenting
2. Ensure cross-references are updated
3. Verify index files are current

## Integration Points

### DOCMON Sub-Agent
The DOCMON (Information Architecture Lead) sub-agent enforces database-first documentation. This command works alongside DOCMON.

**Invoke DOCMON for validation**:
```bash
node scripts/execute-subagent.js --code DOCMON --sd-id <SD-ID>
```

### Documentation Skills (Personal: ~/.claude/skills/)
| Skill | Use For |
|-------|---------|
| `technical-writing` | READMEs, code comments, database-first patterns |
| `api-documentation` | OpenAPI specs, endpoint documentation |
| `user-story-writing` | User stories with acceptance criteria |

### Documentation Protocol Query
Fetch the full Documentation Information Architecture from database:
```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('leo_protocol_sections')
  .select('content')
  .eq('id', 345)
  .single()
  .then(({data}) => console.log(data.content));
"
```

## Workflow

### Phase 1: Context Analysis

**Analyze the current conversation for**:

1. **New Commands**: Scripts with new subcommands (e.g., `handoff.js precheck`)
2. **New Features**: Implemented functionality needing documentation
3. **Protocol Changes**: LEO Protocol modifications (handoffs, gates, sub-agents)
4. **API Changes**: New endpoints, modified contracts
5. **Configuration Changes**: New env vars, settings

**Analysis Queries**:
```bash
# What was recently modified?
git diff --name-only HEAD~5..HEAD | grep -E '\.(js|ts|md)$'

# What new scripts were created?
git log --oneline --diff-filter=A --name-only HEAD~5..HEAD | grep scripts/
```

### Phase 2: Documentation Source Mapping

| Change Type | Source | Update Method |
|-------------|--------|---------------|
| LEO Protocol (handoffs, gates) | `leo_protocol_sections` DB | Update DB → Regenerate |
| Sub-agent changes | `leo_sub_agents` DB | Update DB → Regenerate |
| Skills | `.claude/skills/*.md` | Direct file edit |
| API endpoints | `docs/reference/*.md` | Direct file edit |
| npm scripts | `docs/reference/npm-scripts-guide.md` | Direct file edit |

### Phase 3: Database Section Discovery

For LEO Protocol documentation, find relevant sections:

```bash
# Find sections by content
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('leo_protocol_sections')
  .select('id, title, target_file, order_index')
  .ilike('content', '%SEARCH_TERM%')
  .then(({data}) => console.log(JSON.stringify(data, null, 2)));
"

# Get section content for editing
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('leo_protocol_sections')
  .select('id, title, content')
  .eq('id', SECTION_ID)
  .single()
  .then(({data}) => console.log(data.content));
"
```

### Phase 4: Intelligent Updates

**For LEO Protocol Documentation**:
1. Query database for related sections
2. Prepare updated content (preserve existing, add new)
3. Update database section(s)
4. Regenerate CLAUDE.md files:
   ```bash
   node scripts/generate-claude-md-from-db.js
   ```

**For Reference Documentation**:
1. Read existing file
2. Add documentation in appropriate section
3. Follow technical-writing skill patterns

**For Skills**:
1. Verify skill is self-documenting
2. Update if missing critical information

### Phase 5: Validation

**Verify updates with DOCMON**:
```bash
# Check for database-first compliance
node scripts/execute-subagent.js --code DOCMON --sd-id <SD-ID>
```

**Verify CLAUDE.md regeneration**:
```bash
# Confirm precheck command appears
grep -n "precheck" CLAUDE_CORE.md CLAUDE_PLAN.md CLAUDE_EXEC.md CLAUDE_LEAD.md
```

### Phase 6: Commit (Optional)

```bash
# Create branch
git checkout -b docs/update-<topic>-documentation

# Commit
git add -A
git commit -m "docs(<scope>): <description>"

# Create PR
gh pr create --title "docs(<scope>): <description>" --body "..."
```

## Decision Tree

```
/document invoked
│
├── Detect SD Type (if applicable)
│   └── Query strategic_directives_v2 for sd_type
│
├── Analyze conversation context
│   └── Identify: commands, features, protocols, configs
│
├── Apply SD Type-Specific Workflow:
│   │
│   ├── feature → Full feature docs + API + architecture
│   ├── database → Schema docs + migration notes + RLS
│   ├── infrastructure → Runbook + deployment + env vars
│   ├── api → OpenAPI specs + endpoint docs
│   ├── security → Security docs + threat model
│   ├── refactor → Before/after + tech debt notes
│   ├── bugfix → CHANGELOG only (minimal)
│   ├── documentation → Meta-docs + cross-refs
│   └── other → Standard documentation
│
├── For each change:
│   │
│   ├── LEO Protocol change?
│   │   ├── Query leo_protocol_sections for related sections
│   │   ├── Update section content in database
│   │   └── Regenerate CLAUDE.md files
│   │
│   ├── Sub-agent change?
│   │   ├── Update leo_sub_agents table
│   │   └── Regenerate CLAUDE.md files
│   │
│   ├── API change?
│   │   └── Update docs/reference/ using api-documentation patterns
│   │
│   ├── Skill change?
│   │   └── Verify .claude/skills/ file is complete
│   │
│   └── Config change?
│       └── Update relevant documentation
│
├── Run DOCMON validation
│
└── Report summary with SD type acknowledgment
```

## Database Update Template

```javascript
// Update leo_protocol_sections
const updatedContent = `
EXISTING CONTENT HERE

PLUS NEW CONTENT:
- New command: \`handoff.js precheck\`
- Purpose: Batch validation before execute
`;

// Run update
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('leo_protocol_sections')
  .update({ content: \`${updatedContent}\` })
  .eq('id', SECTION_ID)
  .then(({error}) => error ? console.error(error) : console.log('✅ Updated'));
"
```

## Example: Documenting New Handoff Command

**Context**: Conversation implemented `handoff.js precheck` command

**Actions**:
1. Find sections: `SELECT * FROM leo_protocol_sections WHERE content ILIKE '%handoff.js%'`
   - Found: IDs 307, 308, 309, 310 (Phase Transition Commands)
2. Fetch content: Get current section content
3. Update content: Add precheck command and table entry
4. Update database: Run UPDATE for each section
5. Regenerate: `node scripts/generate-claude-md-from-db.js`
6. Verify: `grep precheck CLAUDE_*.md`
7. Commit: Create PR with documentation changes

## Output Format

```markdown
## Documentation Update Summary

### Context Analysis
- Detected: [what changes were found in conversation]

### Updates Made
| Source | Section/File | Change | Status |
|--------|--------------|--------|--------|
| leo_protocol_sections | ID 307 | Added precheck command | ✅ |
| CLAUDE_CORE.md | Line 143 | Regenerated | ✅ |

### Files Modified
- CLAUDE.md (regenerated)
- CLAUDE_CORE.md (regenerated)
- CLAUDE_PLAN.md (regenerated)
- CLAUDE_EXEC.md (regenerated)
- CLAUDE_LEAD.md (regenerated)

### Validation
- DOCMON compliance: ✅ Database-first verified
- Content accuracy: ✅ New content appears in output

### PR (if created)
- URL: https://github.com/rickfelix/EHG_Engineer/pull/XXX
```

## Important Principles

1. **Database-First**: LEO Protocol docs live in database, not files
2. **Regeneration**: After DB updates, always regenerate CLAUDE.md files
3. **Context-Aware**: Use full conversation to understand what changed
4. **Idempotent**: Running twice should not duplicate content
5. **Skill Integration**: Use documentation skills for patterns
6. **DOCMON Validation**: Verify database-first compliance

## Command Ecosystem Integration

### Cross-Reference

This command is part of the **Command Ecosystem**. For full workflow context, see:
- **[Command Ecosystem Reference](../../docs/reference/command-ecosystem.md)** - Complete inter-command flow diagram and relationships

---

The `/document` command connects to other commands in the workflow:

### After Documentation Updates

**If documentation changes created uncommitted files:**
```
✅ Documentation Updated

Files modified:
- CLAUDE.md (regenerated)
- docs/reference/xxx.md

💡 Uncommitted changes detected. Run /ship to commit and create PR.
```

**If documentation is complete and committed:**
```
✅ Documentation Updated

All changes committed.

💡 Next commands:
   • /learn - Capture documentation patterns (if systemic improvement)
   • /leo next - Continue with next SD
```

### Related Commands

| Scenario | Suggest |
|----------|---------|
| After `/ship` (feature SD) | `/document` auto-suggested |
| After documentation changes | `/ship` to commit |
| Documentation reveals pattern | `/learn` |
| Before starting new SD | `/leo next` |

### When to Invoke /document

| Trigger | Action |
|---------|--------|
| Feature SD completed | Update feature docs in `docs/04_features/` |
| API SD completed | Update OpenAPI specs |
| Protocol changes in session | Update `leo_protocol_sections` DB |
| New command/script created | Update reference docs |
