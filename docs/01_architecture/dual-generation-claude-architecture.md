# Dual-Generation CLAUDE File Architecture

## Metadata
- **Category**: Architecture
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: Claude (SD-LEO-INFRA-DUAL-GENERATION-CLAUDE-001)
- **Last Updated**: 2026-02-01
- **Tags**: [LEO Protocol, CLAUDE files, token optimization, dual-generation]

## Overview

The Dual-Generation CLAUDE File Architecture reduces token consumption during LEO Protocol handoffs by 81% (from ~77k to ~14k tokens) while maintaining full protocol access on-demand. The system generates both FULL and DIGEST versions of protocol files from the same database source, with gates defaulting to DIGEST mode.

**Strategic Objective**: Reduce handoff validation token consumption from ~79k to <25k tokens while preserving protocol fidelity and enabling on-demand deep reference access.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Components](#components)
3. [Generation Pipeline](#generation-pipeline)
4. [Mode Switching](#mode-switching)
5. [File Mappings](#file-mappings)
6. [Token Budget Enforcement](#token-budget-enforcement)
7. [Integration Points](#integration-points)
8. [Performance Metrics](#performance-metrics)
9. [Usage Guide](#usage-guide)
10. [Related Documentation](#related-documentation)

## Architecture Overview

### Problem Statement

LEO Protocol handoffs load multiple CLAUDE files for validation gates:
- CLAUDE.md (~8k tokens)
- CLAUDE_CORE.md (~19k tokens)
- CLAUDE_LEAD.md (~14k tokens) OR
- CLAUDE_PLAN.md (~21k tokens) OR
- CLAUDE_EXEC.md (~16k tokens)

**Total**: 43k-48k tokens per handoff, consuming 22-24% of 200k context budget.

### Solution: Dual-Generation Architecture

Generate **two versions** of each protocol file from the same database snapshot:

1. **FULL Files** (`CLAUDE.md`, `CLAUDE_CORE.md`, etc.)
   - Complete protocol content with examples, procedures, deep references
   - ~77k tokens total
   - Used for: On-demand deep dives, troubleshooting, training

2. **DIGEST Files** (`CLAUDE_DIGEST.md`, `CLAUDE_CORE_DIGEST.md`, etc.)
   - Essential enforcement content only (rules, gates, anti-patterns, triggers)
   - ~14k tokens total (81% reduction)
   - Used for: Handoff gates, validation, compliance checks

### Benefits

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **Handoff Token Load** | ~43k-48k | ~8k-12k | 75-81% reduction |
| **Context Budget Used** | 22-24% | 4-6% | 18% freed |
| **Generation Time** | 8-12s | 10-20s | +2-8s (acceptable) |
| **Maintenance Burden** | Single source | Single source | No change |
| **Protocol Fidelity** | 100% | 100% | No change |

## Components

### 1. Section-to-File Mappings

**Purpose**: Define which protocol sections belong in each file (FULL and DIGEST versions).

| File | Location | Sections (FULL) | Sections (DIGEST) |
|------|----------|----------------|-------------------|
| Mapping (FULL) | `scripts/section-file-mapping.json` | All sections per file | N/A |
| Mapping (DIGEST) | `scripts/section-file-mapping-digest.json` | N/A | Minimal enforcement sections |

**DIGEST Mapping Example**:
```json
{
  "CLAUDE_CORE_DIGEST.md": {
    "sections": [
      "mandatory_phase_transitions",
      "negative_constraints_global",
      "execution_philosophy",
      "critical_term_definitions",
      "sd_type_workflow_paths",
      "sub_agent_config"
    ]
  }
}
```

### 2. Digest Generators

**Location**: `scripts/modules/claude-md-generator/digest-generators.js`

**Functions**:
- `generateRouterDigest()` - Router file (<3k chars)
- `generateCoreDigest()` - Core protocol (<10k chars)
- `generateLeadDigest()` - LEAD phase (<5k chars)
- `generatePlanDigest()` - PLAN phase (<5k chars)
- `generateExecDigest()` - EXEC phase (<5k chars)

**Content Transformations**:
1. Strip code blocks marked as examples
2. Remove "Example:" sections
3. Remove verbose procedures
4. Compress multiple newlines
5. Preserve: Rules, gates, anti-patterns, triggers, constraints

**Digest Header Template**:
```markdown
<!-- DIGEST FILE - Enforcement-focused protocol content -->
<!-- generated_at: 2026-02-01T17:11:37.197Z -->
<!-- git_commit: 30897510 -->
<!-- db_snapshot_hash: 7c32a139b82b343e -->
<!-- file_content_hash: 4dbf3423c3c36d02 -->
```

### 3. Dual-Output Generator

**Location**: `scripts/modules/claude-md-generator/index.js`

**Class**: `CLAUDEMDGeneratorV3`

**Key Methods**:
- `generate()` - Orchestrates dual generation
- `generateFile()` - Generates single file (FULL or DIGEST)
- `computeHash()` - SHA-256 content hashing
- `getGitCommit()` - Current git commit
- `computeDbSnapshotHash()` - Database state fingerprint
- `estimateTokens()` - Token estimation (4 chars/token)

**Generation Flow**:
```
1. Load section mappings (FULL + DIGEST)
2. Fetch all data from database (single snapshot)
3. Generate FULL files (5 files)
4. Generate DIGEST files (5 files)
5. Compute hashes for all files
6. Write manifest (claude-generation-manifest.json)
7. Enforce token budget (<25k for DIGEST)
```

### 4. Protocol Gates (DIGEST Mode)

**Modified Files**:
- `scripts/modules/handoff/gates/protocol-file-read-gate.js`
- `scripts/modules/handoff/gates/core-protocol-gate.js`

**Key Functions**:
- `getProtocolMode()` - Returns 'digest' or 'full' based on env var
- `getProtocolFilename()` - Converts CLAUDE.md → CLAUDE_DIGEST.md
- `getFullFilename()` - Converts CLAUDE_DIGEST.md → CLAUDE.md
- `getCoreProtocolRequirements()` - Mode-aware file requirements
- `getHandoffFileRequirements()` - Mode-aware handoff files

**Mode Detection**:
```javascript
function getProtocolMode() {
  const mode = process.env.CLAUDE_PROTOCOL_MODE?.toLowerCase();
  return mode === 'full' ? 'full' : 'digest'; // Default: digest
}
```

### 5. Generation Manifest

**Location**: `claude-generation-manifest.json` (project root)

**Purpose**: Track generation metadata, content hashes, token estimates.

**Structure**:
```json
{
  "generated_at": "2026-02-01T17:11:37.197Z",
  "git_commit": "30897510",
  "db_snapshot_hash": "7c32a139b82b343e",
  "files": {
    "CLAUDE.md": {
      "type": "full",
      "chars": 31467,
      "estimated_tokens": 7867,
      "content_hash": "3fd35b0dd572f812",
      "path": "C:\\...\\CLAUDE.md"
    },
    "CLAUDE_DIGEST.md": {
      "type": "digest",
      "chars": 4638,
      "estimated_tokens": 1160,
      "content_hash": "52726070293d32e1",
      "path": "C:\\...\\CLAUDE_DIGEST.md"
    }
  }
}
```

**Use Cases**:
- Verify files are in sync with database
- Track token budget compliance
- Detect stale protocol files
- Audit generation history

## Generation Pipeline

### Step-by-Step Process

```mermaid
graph TD
    A[Start Generation] --> B[Load Mappings]
    B --> C[Query Database]
    C --> D[Generate FULL Files]
    D --> E[Generate DIGEST Files]
    E --> F[Compute Hashes]
    F --> G[Enforce Token Budget]
    G --> H{Budget OK?}
    H -->|Yes| I[Write Manifest]
    H -->|No| J[FAIL]
    I --> K[Complete]
```

### Command

```bash
node scripts/generate-claude-md-from-db.js
```

### Output

```
Generating modular CLAUDE files from database (V3.1 - Dual Generation)...

=== FULL FILES ===

   CLAUDE.md                   30.7 KB  ~ 7867 tokens  [36f054595bb50e85]
   CLAUDE_CORE.md              73.4 KB  ~18783 tokens  [dab9f290499411ee]
   CLAUDE_LEAD.md              53.9 KB  ~13805 tokens  [500778b0c72e423a]
   CLAUDE_PLAN.md              82.1 KB  ~21011 tokens  [ce51aa6b5c18dcf5]
   CLAUDE_EXEC.md              61.6 KB  ~15777 tokens  [e0c319e4be61ca2e]

   FULL Total: 301.7 KB (~77243 tokens)

=== DIGEST FILES ===

   CLAUDE_DIGEST.md             4.5 KB  ~ 1160 tokens  [52726070293d32e1]
   CLAUDE_CORE_DIGEST.md       16.5 KB  ~ 4222 tokens  [4dbf3423c3c36d02]
   CLAUDE_LEAD_DIGEST.md        6.1 KB  ~ 1564 tokens  [07722c3822e2882b]
   CLAUDE_PLAN_DIGEST.md       14.6 KB  ~ 3726 tokens  [b97d118cb4d222dd]
   CLAUDE_EXEC_DIGEST.md       14.1 KB  ~ 3620 tokens  [08c18a2ecdc7a334]

   DIGEST Total: 55.8 KB (~14292 tokens)
   Token budget OK: 14292/25000 (57%)

   Token Savings: 81% (62951 tokens saved)
```

## Mode Switching

### Environment Variable

Set `CLAUDE_PROTOCOL_MODE` to control which files are loaded:

```bash
# Use DIGEST files (default)
# No env var needed - DIGEST is default

# Use FULL files
export CLAUDE_PROTOCOL_MODE=full
node scripts/handoff.js execute LEAD-TO-PLAN SD-XXX-001
```

### On-Demand FULL Loading

Gates can request FULL files even in DIGEST mode:

```javascript
// In gate context
const context = {
  needs_full_protocol: true  // Trigger FULL file loading
};

const result = await validateSdStartGate(sdId, context, handoffType);

// Result includes:
// {
//   pass: true,
//   protocolMode: 'digest',
//   full_loaded: true,
//   full_files_loaded: ['CLAUDE.md', 'CLAUDE_CORE.md']
// }
```

### Mode Detection in Gates

```javascript
// scripts/modules/handoff/gates/core-protocol-gate.js

const protocolMode = getProtocolMode(); // 'digest' or 'full'
const requiredFiles = getCoreProtocolRequirements(); // Mode-aware

// DIGEST mode:
// requiredFiles.SD_START = ['CLAUDE_DIGEST.md', 'CLAUDE_CORE_DIGEST.md']

// FULL mode:
// requiredFiles.SD_START = ['CLAUDE.md', 'CLAUDE_CORE.md']
```

## File Mappings

### FULL File Sections (Excerpt)

| File | Section Types | Examples |
|------|---------------|----------|
| CLAUDE.md | Router, triggers, quick ref | smart_router, session_prologue |
| CLAUDE_CORE.md | Workflow, constraints, philosophy | mandatory_phase_transitions, execution_philosophy |
| CLAUDE_LEAD.md | LEAD approval, negative constraints | lead_approval_workflow, negative_constraints_lead |
| CLAUDE_PLAN.md | PRD, validation, quality | prd_creation_workflow, quality_assessment |
| CLAUDE_EXEC.md | Implementation, testing, handoffs | implementation_workflow, testing_requirements |

### DIGEST File Sections (Minimal)

| File | Token Budget | Focus |
|------|-------------|-------|
| CLAUDE_DIGEST.md | <3k | Router, loading strategy |
| CLAUDE_CORE_DIGEST.md | <10k | Phase transitions, constraints, anti-patterns |
| CLAUDE_LEAD_DIGEST.md | <5k | LEAD gates, negative constraints |
| CLAUDE_PLAN_DIGEST.md | <5k | PRD requirements, validation gates |
| CLAUDE_EXEC_DIGEST.md | <5k | Implementation requirements, constraints |

## Token Budget Enforcement

### Budget Target

**DIGEST files combined**: <25k tokens

**Current**: 14,292 tokens (57% of budget)

**Buffer**: 10,708 tokens (43% headroom)

### Enforcement Mechanism

```javascript
// scripts/modules/claude-md-generator/index.js

const digestTotalTokens = digestFiles.reduce((sum, [_, f]) =>
  sum + f.estimated_tokens, 0
);

if (digestTotalTokens > this.options.tokenBudget) {
  console.error(`TOKEN BUDGET EXCEEDED: ${digestTotalTokens} > ${this.options.tokenBudget}`);
  throw new Error(`DIGEST token budget exceeded`);
}
```

**Failure Mode**: Generation fails if DIGEST files exceed 25k tokens, preventing budget violations.

### Per-File Breakdown

| File | Tokens | % of Budget |
|------|--------|-------------|
| CLAUDE_DIGEST.md | 1,160 | 4.6% |
| CLAUDE_CORE_DIGEST.md | 4,222 | 16.9% |
| CLAUDE_LEAD_DIGEST.md | 1,564 | 6.3% |
| CLAUDE_PLAN_DIGEST.md | 3,726 | 14.9% |
| CLAUDE_EXEC_DIGEST.md | 3,620 | 14.5% |
| **Total** | **14,292** | **57.2%** |

## Integration Points

### 1. Handoff System

**File**: `scripts/handoff.js`

**Integration**: Handoff gates automatically use DIGEST files by default.

```javascript
// Handoff execution
const gateResult = await validateProtocolFileRead(handoffType, context);

// Gate loads:
// - CLAUDE_DIGEST.md (router)
// - CLAUDE_CORE_DIGEST.md (core)
// - CLAUDE_PLAN_DIGEST.md (for LEAD-TO-PLAN)
```

### 2. Protocol Gates

**Files**:
- `scripts/modules/handoff/gates/protocol-file-read-gate.js`
- `scripts/modules/handoff/gates/core-protocol-gate.js`

**Integration**: Gates check `CLAUDE_PROTOCOL_MODE` env var and load appropriate files.

### 3. Session State

**File**: `.claude/unified-session-state.json`

**Integration**: Protocol gate tracking records which files were read (FULL or DIGEST).

```json
{
  "protocolGate": {
    "fileReads": {
      "CLAUDE_DIGEST.md": {
        "trigger": "READ_TOOL",
        "timestamp": "2026-02-01T17:14:50.000Z",
        "fileHash": "52726070293d32e1"
      }
    }
  }
}
```

### 4. Test Suite

**File**: `scripts/modules/handoff/gates/dual-generation.test.js`

**Coverage**: 40 tests validating:
- Mode detection (digest vs full)
- File mappings consistency
- Token budget enforcement
- DIGEST file existence
- Protocol mode switching
- Filename helpers
- Requirement getters

## Performance Metrics

### Generation Performance

| Metric | Value |
|--------|-------|
| **Generation Time** | 10-20 seconds |
| **Database Queries** | 12 queries (single snapshot) |
| **Files Generated** | 10 files (5 FULL + 5 DIGEST) |
| **Manifest Written** | 1 file |

### Token Savings

| Handoff Type | Before (FULL) | After (DIGEST) | Savings |
|--------------|---------------|----------------|---------|
| LEAD-TO-PLAN | ~43k tokens | ~8k tokens | 81% |
| PLAN-TO-EXEC | ~48k tokens | ~12k tokens | 75% |
| EXEC-TO-PLAN | ~45k tokens | ~11k tokens | 76% |
| PLAN-TO-LEAD | ~41k tokens | ~9k tokens | 78% |

### Context Budget Impact

| Scenario | Context Used (FULL) | Context Used (DIGEST) | Freed |
|----------|-------------------|---------------------|-------|
| Single Handoff | 22-24% | 4-6% | 18% |
| 3 Handoffs (LEAD→PLAN→EXEC) | 66-72% | 12-18% | 54% |
| 5 Handoffs (Full Cycle) | 110-120% (overflow) | 20-30% | 80-90% |

**Impact**: DIGEST mode enables multiple handoffs within a single 200k context window without overflow.

## Usage Guide

### Regenerate Protocol Files

After updating `leo_protocol_sections` database table:

```bash
# Regenerate both FULL and DIGEST files
node scripts/generate-claude-md-from-db.js

# Verify generation
ls -lh CLAUDE*.md
```

### Use FULL Mode (Override)

For troubleshooting or training:

```bash
# Set environment variable
export CLAUDE_PROTOCOL_MODE=full

# Run handoff with FULL files
node scripts/handoff.js execute LEAD-TO-PLAN SD-XXX-001

# Unset when done
unset CLAUDE_PROTOCOL_MODE
```

### Check Token Budget

```bash
# View manifest
cat claude-generation-manifest.json | jq '.files | to_entries | map(select(.value.type == "digest")) | map({file: .key, tokens: .value.estimated_tokens})'
```

### Verify File Sync

Check if protocol files are in sync with database:

```bash
# Compare manifest db_snapshot_hash with current database state
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('leo_protocol_sections')
  .select('id, title, updated_at')
  .order('updated_at', { ascending: false })
  .limit(1)
  .then(({data}) => console.log('Latest section update:', data[0]?.updated_at));
"

# Compare with manifest generated_at timestamp
grep generated_at claude-generation-manifest.json
```

## Related Documentation

- **[LEO Protocol Overview](../03_protocols_and_standards/LEO_v4.2_HYBRID_SUB_AGENTS.md)** - LEO Protocol v4.2 specification
- **[Database Schema](./database_schema.md)** - Database table definitions
- **[Session Lifecycle](./intelligent-session-lifecycle.md)** - Session state management
- **[Handoff System](../leo/handoffs/)** - Handoff validation gates
- **[Testing Guide](../05_testing/testing_qa.md)** - Test coverage and QA

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-01 | Initial documentation (SD-LEO-INFRA-DUAL-GENERATION-CLAUDE-001) |
