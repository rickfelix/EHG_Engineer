# Agentic Context Engineering v3.0


## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-22
- **Tags**: database, testing, migration, protocol

**Created**: 2025-12-11 (SD-FOUND-AGENTIC-CONTEXT-001)
**Purpose**: Reduce sub-agent context overhead by 50-70% through contract-based handoffs with artifact pointers
**Status**: Production-Ready

---

## Problem Solved

**Original Issue**: Sub-agents receive full inline instructions (300+ lines, 2500+ tokens) every time they execute, consuming significant context window budget even though the instructions rarely change.

**Solution**: Contract-based handoffs where sub-agents receive compact summaries (~8 lines) with pointers to stored artifacts. Full content is loaded on-demand only when needed.

**Inspiration**:
- Google ADK (Agent Development Kit) - Artifact system with pointers
- Anthropic ACCE (Anthropic Claude Context Engineering) - Memory tiers
- Manus agent patterns - Task contracts and handoffs

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     LEO EXECUTOR (Parent)                        │
│                                                                  │
│  1. executeSubAgent('DOCMON', sdId)                             │
│     ├── Load sub-agent instructions from database               │
│     ├── If instructions > 2KB:                                  │
│     │   └── Store as artifact → get artifact_id                 │
│     ├── Create task contract with artifact reference            │
│     └── Display compact summary (not full instructions)         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   TASK CONTRACT (Database)                       │
│                                                                  │
│  contract_id: 34990319-9fd6-4b66-b779-79407b442adc              │
│  target_agent: DOCMON                                            │
│  objective: "Validate documentation for SD-XXX"                  │
│  input_artifact_ids: [cb7b4901-41d9-4841-a04c-53ac92d5801d]     │
│  input_summary: "Sub-agent DOCMON for SD-XXX | Model: haiku"    │
│  status: pending → claimed → completed                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   SUB-AGENT (Child)                              │
│                                                                  │
│  1. Claim contract: claimTaskContract('DOCMON')                 │
│  2. Read artifact on-demand (only if needed):                   │
│     readArtifact(artifact_id) → full instructions               │
│  3. Execute task                                                 │
│  4. Complete contract: completeTaskContract(contract_id, result)│
└─────────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Database Tables

#### `agent_task_contracts`
Stores task contracts between parent and child agents.

| Column | Type | Description |
|--------|------|-------------|
| contract_id | UUID | Primary key |
| target_agent | TEXT | Sub-agent code (e.g., 'DOCMON') |
| parent_agent | TEXT | Parent agent (e.g., 'LEO_EXECUTOR') |
| objective | TEXT | Task objective |
| input_artifact_ids | UUID[] | References to stored artifacts |
| input_summary | TEXT | Compact summary for display |
| constraints | JSONB | Execution constraints |
| status | TEXT | pending → claimed → completed |
| created_at | TIMESTAMP | Contract creation time |
| claimed_at | TIMESTAMP | When sub-agent claimed contract |
| completed_at | TIMESTAMP | When task completed |

#### `agent_artifacts`
Stores large content (instructions, tool outputs) as compressed artifacts.

| Column | Type | Description |
|--------|------|-------------|
| artifact_id | UUID | Primary key |
| content | TEXT | Full content (compressed) |
| summary | TEXT | AI-generated summary |
| token_count | INTEGER | Estimated tokens |
| type | TEXT | Artifact type (see constraints) |
| source_tool | TEXT | Tool that created artifact |
| confidence | FLOAT | Content confidence (0-1) |
| expires_at | TIMESTAMP | Optional expiration |

**Allowed Types** (via `agent_artifacts_type_check`):
- Original: `file_read`
- Tool outputs: `tool_output`, `bash_output`, `grep_result`, `glob_result`, `web_fetch`, `database_query`
- Sub-agent: `sub_agent_instructions`, `contract_input`, `contract_output`
- Analysis: `analysis`, `summary`, `context`, `decision`
- Other: `research`, `plan`, `validation`

**Allowed Source Tools** (via `chk_source_tool`):
- Claude Code: `Read`, `Bash`, `Write`, `Glob`, `Grep`, `Edit`, `Task`, `WebFetch`, `WebSearch`, `other`
- LEO Protocol: `sub-agent-executor`, `artifact-tools`, `leo-executor`, `handoff-validator`, `contract-system`, `test-script`

### 2. Core Library Functions

#### `lib/artifact-tools.js`

```javascript
// Create an artifact (stores content, generates summary)
const artifact = await createArtifact(content, {
  source_tool: 'sub-agent-executor',
  type: 'sub_agent_instructions',
  sd_id: 'SD-XXX',
  metadata: { sub_agent_code: 'DOCMON' }
});
// Returns: { artifact_id, token_count, summary, pointer }

// Read an artifact
const { content, confidence, is_expired } = await readArtifact(artifact_id);

// Create a task contract
const contract = await createTaskContract('DOCMON', 'Validate docs', {
  parent_agent: 'LEO_EXECUTOR',
  sd_id: 'SD-XXX',
  input_artifact_ids: [artifact_id],
  input_summary: 'DOCMON for SD-XXX',
  constraints: { max_tokens: 4000 }
});
// Returns: { contract_id, summary }

// Claim a pending contract (called by sub-agent)
const contract = await claimTaskContract('DOCMON');
// Returns: { contract_id, objective, input_artifact_ids, constraints }

// Complete a contract
await completeTaskContract(contract_id, {
  success: true,
  summary: 'Documentation validated successfully',
  tokens_used: 1500
});

// Read contract details
const contract = await readTaskContract(contract_id);
```

#### `lib/sub-agent-executor.js`

```javascript
// Execute with contract mode (default)
const result = await executeSubAgent('DOCMON', sdId, options);
// Automatically creates contract, stores instructions as artifact

// Execute with full inline context (bypass contracts)
const result = await executeSubAgentWithFullContext('DOCMON', sdId, options);

// Check if contract mode is enabled
const enabled = isContractModeEnabled();
// Returns: true (unless LEO_USE_TASK_CONTRACTS=false)

// Helper exports for sub-agent modules
export { readArtifact as readArtifactContent };
export { claimTaskContract as claimPendingContract };
export { createArtifact as storeOutputArtifact };
```

### 3. Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `LEO_USE_TASK_CONTRACTS` | `true` | Enable/disable contract mode |

| Constant | Value | Description |
|----------|-------|-------------|
| `INSTRUCTION_ARTIFACT_THRESHOLD` | 2048 | Bytes before storing instructions as artifact |
| `RESULT_COMPRESSION_THRESHOLD` | 8192 | Bytes before compressing result detailed_analysis |

### 4. Automatic Result Compression

When sub-agents return large `detailed_analysis` objects (>8KB), the executor automatically:
1. Stores the analysis as an artifact
2. Replaces the field with an artifact reference
3. Records the artifact ID in metadata

This happens transparently - sub-agents don't need modification.

---

## Usage Examples

### Example 1: Automatic Contract Creation

When `executeSubAgent()` is called with contract mode enabled:

```
📜 Creating task contract for DOCMON...
   📦 Stored instructions as artifact: cb7b4901-... (2467 tokens)
   ✅ Task contract created: 34990319-...

────────────────────────────────────────────────────────────────
📜 TASK CONTRACT: 34990319-9fd6-4b66-b779-79407b442adc
────────────────────────────────────────────────────────────────
Target: DOCMON | SD: SD-FOUND-AGENTIC-CONTEXT-001 | Phase: unknown
Model: haiku | Priority: 95
📦 Input Artifacts: 1 (cb7b4901-41d9-4841-a04c-53ac92d5801d)
────────────────────────────────────────────────────────────────
```

**Before (inline context)**: ~300 lines of instructions displayed
**After (contract mode)**: 8 lines with artifact pointer

### Example 2: Sub-Agent Reading Artifacts

```javascript
// In sub-agent module (lib/sub-agents/docmon.js)
import { readArtifactContent, claimPendingContract } from '../sub-agent-executor.js';

export async function execute(sdId, subAgent, options = {}) {
  // Claim the contract (if using contract mode)
  const contract = await claimPendingContract('DOCMON');

  if (contract?.input_artifact_ids?.length > 0) {
    // Read full instructions only when needed
    const instructions = await readArtifactContent(contract.input_artifact_ids[0]);
    // Use instructions.content
  }

  // ... execute task ...
}
```

### Example 3: Storing Output Artifacts

```javascript
import { storeOutputArtifact } from '../sub-agent-executor.js';

// Store large analysis results as artifact
const artifact = await storeOutputArtifact(analysisResults, {
  source_tool: 'sub-agent-executor',
  type: 'analysis',
  sd_id: sdId,
  metadata: { sub_agent_code: 'VALIDATION' }
});

// Return artifact pointer instead of full content
return {
  verdict: 'PASS',
  analysis_artifact_id: artifact.artifact_id,
  summary: artifact.summary
};
```

---

## Benefits

### Context Reduction

| Metric | Before | After | Savings |
|--------|--------|-------|---------|
| Sub-agent instructions | ~300 lines | 8 lines | 97% |
| Token usage | ~2500 tokens | ~100 tokens | 96% |
| Per-execution overhead | Full load | Pointer only | 50-70%* |

*Actual savings depend on whether sub-agent needs to read full artifacts

### Additional Benefits

1. **Audit Trail**: All contracts and artifacts stored in database
2. **Versioning**: Artifacts track when content was stored
3. **Expiration**: Artifacts can auto-expire for transient data
4. **Confidence Scoring**: Track reliability of stored content
5. **Graceful Fallback**: Falls back to inline context if contract creation fails

---

## Database Migrations

### Required Migrations (Applied)

1. **`20251211_create_sd_agentic_context_v3.sql`**
   - Creates `agent_task_contracts` table
   - Creates `agent_artifacts` table
   - Creates RPC functions for contract operations

2. **`20251211_expand_agent_artifacts_type_constraint.sql`**
   - Expands `type` constraint from just `file_read` to 17 types

3. **`20251211_expand_agent_artifacts_source_tool_constraint.sql`**
   - Expands `source_tool` constraint to include LEO Protocol tools

---

## Testing

### Integration Test Script

```bash
# Run basic tests (1-3)
node scripts/test-task-contracts.js

# Run with full sub-agent test (4)
node scripts/test-task-contracts.js --with-subagent
```

### Test Coverage

| Test | Description | Status |
|------|-------------|--------|
| Test 1 | Basic contract flow (create → claim → complete) | PASS |
| Test 2 | Artifact integration (store → reference → read) | PASS |
| Test 3 | Sub-agent executor exports verification | PASS |
| Test 4 | Full sub-agent execution with contracts | PASS |

---

## Extending to Sub-Agents

### Step 1: Import Helper Functions

```javascript
import {
  readArtifactContent,
  claimPendingContract,
  storeOutputArtifact
} from '../sub-agent-executor.js';
```

### Step 2: Check for Contract Mode

```javascript
export async function execute(sdId, subAgent, options = {}) {
  // Check if we're in contract mode
  const contract = await claimPendingContract(subAgent.code);

  if (contract) {
    // Contract mode: read artifacts on-demand
    console.log(`📜 Claimed contract: ${contract.contract_id}`);

    if (contract.input_artifact_ids?.length > 0) {
      for (const artifactId of contract.input_artifact_ids) {
        const artifact = await readArtifactContent(artifactId);
        // Use artifact.content as needed
      }
    }
  } else {
    // Inline mode: instructions already in subAgent.formatted
  }

  // ... rest of execution ...
}
```

### Step 3: Store Large Outputs as Artifacts

```javascript
// Instead of returning large content directly:
const results = {
  verdict: 'PASS',
  detailed_analysis: hugeAnalysisObject  // Don't do this
};

// Store as artifact and return pointer:
const artifact = await storeOutputArtifact(JSON.stringify(hugeAnalysisObject), {
  source_tool: 'sub-agent-executor',
  type: 'analysis',
  sd_id: sdId
});

const results = {
  verdict: 'PASS',
  analysis_artifact_id: artifact.artifact_id,
  analysis_summary: artifact.summary
};
```

---

## Troubleshooting

### Contract Creation Fails

**Symptom**: "Falling back to inline context mode"

**Causes**:
1. Database connection issue
2. Invalid SD ID (FK constraint)
3. Missing required fields

**Solution**: Check database connectivity, use valid SD ID or null for tests

### Artifact Type Constraint Error

**Symptom**: `violates check constraint "agent_artifacts_type_check"`

**Solution**: Apply migration `20251211_expand_agent_artifacts_type_constraint.sql`

### Source Tool Constraint Error

**Symptom**: `violates check constraint "chk_source_tool"`

**Solution**: Apply migration `20251211_expand_agent_artifacts_source_tool_constraint.sql`

---

## Related Documentation

- [Generic Sub-Agent Executor Framework](./generic-sub-agent-executor-framework.md)
- [Sub-Agent Compression System](./sub-agent-compression.md)
- [Context Monitoring](./context-monitoring.md)

---

*Created: 2025-12-11*
*SD: SD-FOUND-AGENTIC-CONTEXT-001*
*Phase: EXEC*
*Author: Claude Code (Agentic Context Engineering v3.0 Implementation)*
