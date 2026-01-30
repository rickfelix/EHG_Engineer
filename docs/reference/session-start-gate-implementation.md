# SESSION_START Gate Implementation

## Metadata
- **Category**: Reference
- **Status**: Approved
- **Version**: 1.2.0
- **Author**: LEO Protocol Team
- **Last Updated**: 2026-01-30
- **Tags**: protocol, gates, session, enforcement, infrastructure, sub-agent-triggers, handoff-validation
- **SD**: SD-LEO-INFRA-SESSION-START-GATE-001, SD-LEO-INFRA-HARDENING-001, SD-LEO-FIX-PHASE0-INTEGRATION-001

## Overview

This document describes the SESSION_START gate implementation, which enforces CLAUDE_CORE.md reading at the earliest point of LEO session initialization. This addresses a compliance gap in the protocol file enforcement system.

## Problem Statement

### State Structure Mismatch Bug

The protocol file enforcement system had a critical bug where two different tracking mechanisms wrote to incompatible state structures:

1. **protocol-file-tracker.cjs** (PostToolUse hook): Wrote to `state.protocolFilesRead` array
2. **core-protocol-gate.js**: Read from `state.protocolGate.fileReads` object

This caused gates to fail even after CLAUDE_CORE.md was read, because the hook and gate couldn't communicate.

### Missing SESSION_START Gate

The `CORE_PROTOCOL_REQUIREMENTS` constant defined a `SESSION_START` trigger point, but no validation function existed to enforce it. This left a gap in protocol enforcement at session initialization.

## Solution

### 1. Fixed State Structure Compatibility

Updated `checkFileNeedsRead()` in `core-protocol-gate.js` to check BOTH state structures:

```javascript
// Check both new and legacy state structures
const fileRead = state.protocolGate?.fileReads?.[filename];
const legacyFileRead = state.protocolFilesRead?.includes(filename);
const legacyTimestamp = state.protocolFilesReadAt?.[filename];

// File is considered read if found in EITHER structure
const wasRead = fileRead || legacyFileRead;
```

This provides backward compatibility while the PostToolUse hook continues using the legacy structure.

### 2. Implemented SESSION_START Gate

Added new validation function `validateSessionStartGate()`:

```javascript
export async function validateSessionStartGate(sessionId, ctx = {}) {
  const requiredFiles = CORE_PROTOCOL_REQUIREMENTS.SESSION_START;
  const issues = [];

  for (const filename of requiredFiles) {
    const check = checkFileNeedsRead(filename, 'SESSION_START');
    if (check.needsRead) {
      issues.push(`Protocol file not read for session: ${filename}`);
    }
  }

  if (issues.length > 0) {
    return {
      pass: false,
      errorCode: 'PROTOCOL_GATE_BLOCKED',
      gateName: 'SESSION_START',
      requiredArtifacts: requiredFiles,
      remediation: 'Read CLAUDE_CORE.md using the Read tool...'
    };
  }

  // Update session state
  state.protocolGate.sessionStartValidatedAt = new Date().toISOString();

  return { pass: true, score: 100 };
}
```

### 3. Fixed Hook Module Format

Renamed `protocol-file-tracker.js` → `protocol-file-tracker.cjs` because:
- Project has `"type": "module"` in package.json
- Hook script uses CommonJS `require()`
- Node treats `.js` files as ES modules by default

Updated `.claude/settings.json` to reference the `.cjs` file.

## Architecture

### State Tracking Mechanism

```
┌─────────────────────────────────────────────┐
│  Read Tool Invoked (CLAUDE_CORE.md)        │
└──────────────────┬──────────────────────────┘
                   │
                   v
┌─────────────────────────────────────────────┐
│  PostToolUse Hook: protocol-file-tracker.cjs│
│  - Writes to state.protocolFilesRead[]      │
│  - Writes to state.protocolFilesReadAt{}    │
└──────────────────┬──────────────────────────┘
                   │
                   v
┌─────────────────────────────────────────────┐
│  Gate: checkFileNeedsRead()                 │
│  - Checks state.protocolGate.fileReads      │
│  - ALSO checks state.protocolFilesRead      │
│  - Returns needsRead: false if in EITHER    │
└──────────────────┬──────────────────────────┘
                   │
                   v
┌─────────────────────────────────────────────┐
│  Gate: validateSessionStartGate()           │
│  - Validates CLAUDE_CORE.md was read        │
│  - Blocks session init if not read          │
│  - Records validation in state              │
└─────────────────────────────────────────────┘
```

### Trigger Points

The protocol file enforcement system now supports three trigger points:

| Trigger | When | Required Files | Implementation |
|---------|------|----------------|----------------|
| **SESSION_START** | LEO session initialization | CLAUDE.md, CLAUDE_CORE.md | `validateSessionStartGate()` |
| **SD_START** | Before any SD work begins | CLAUDE.md, CLAUDE_CORE.md + destination phase file | `validateSdStartGate(sdId, ctx, handoffType)` |
| **POST_COMPACTION** | After context compaction | CLAUDE.md, CLAUDE_CORE.md + phase file | `validatePostCompactionGate()` |

**Enhancement (v1.2.0)**: The SD_START gate now accepts an optional `handoffType` parameter that enforces reading the **destination** phase's protocol file:

| Handoff Type | Destination Phase File |
|--------------|------------------------|
| LEAD-TO-PLAN | CLAUDE_PLAN.md |
| PLAN-TO-EXEC | CLAUDE_EXEC.md |
| EXEC-TO-PLAN | CLAUDE_PLAN.md |
| PLAN-TO-LEAD | CLAUDE_LEAD.md |

**Why CLAUDE.md is Required** (Added 2026-01-30):
CLAUDE.md contains the sub-agent trigger keywords table that enables proactive sub-agent invocation. Without it, agents miss actionable triggers like:
- "created migration" → invoke DATABASE sub-agent
- "pending migration" → invoke DATABASE sub-agent
- "apply migration" → invoke DATABASE sub-agent

This was identified during RCA investigation (SD-LEO-INFRA-HARDENING-001) when AUTO-PROCEED stopped due to empty success_metrics, and the agent didn't proactively invoke the database-agent despite creating a migration file.

### Handoff-Specific Phase File Validation (v1.2.0)

The SD_START gate was enhanced to validate **destination phase protocol files** at handoff boundaries. This ensures agents load the correct phase-specific instructions before transitioning.

**Problem**: Agents were only checking CLAUDE.md and CLAUDE_CORE.md at handoffs, but not the destination phase's protocol file (CLAUDE_LEAD.md, CLAUDE_PLAN.md, or CLAUDE_EXEC.md).

**Solution**: Added optional `handoffType` parameter to `validateSdStartGate()` and `createSdStartGate()`:

```javascript
// Enhanced function signature
export async function validateSdStartGate(sdId, ctx = {}, handoffType = null) {
  // Start with core requirements
  const requiredFiles = [...CORE_PROTOCOL_REQUIREMENTS.SD_START];

  // Add phase-specific file if handoff type is specified
  if (handoffType && HANDOFF_PHASE_FILES[handoffType]) {
    const phaseFile = HANDOFF_PHASE_FILES[handoffType];
    if (!requiredFiles.includes(phaseFile)) {
      requiredFiles.push(phaseFile);
    }
  }

  // Validate all required files...
}
```

**Mapping Logic** (`HANDOFF_PHASE_FILES` constant):
- Maps to the **destination** phase's protocol file (where you're going TO)
- `LEAD-TO-PLAN` → `CLAUDE_PLAN.md` (going TO Plan)
- `PLAN-TO-EXEC` → `CLAUDE_EXEC.md` (going TO Exec)
- `EXEC-TO-PLAN` → `CLAUDE_PLAN.md` (going back TO Plan)
- `PLAN-TO-LEAD` → `CLAUDE_LEAD.md` (going TO Lead for final approval)

**Integration**: All handoff executors updated to pass handoff type:

```javascript
// Example: lead-to-plan/index.js
gates.push(createSdStartGate(sd?.sd_key || sd?.id || 'unknown', 'LEAD-TO-PLAN'));
```

**Validation Output**:
```
📚 GATE: SD Start Protocol Enforcement
--------------------------------------------------
   SD: SD-XXX-001
   Handoff Type: LEAD-TO-PLAN
   Phase file required: CLAUDE_PLAN.md

   ✅ CLAUDE.md already read (hash: 3f2a1b5c...)
   ✅ CLAUDE_CORE.md already read (hash: 8d4e9f12...)
   ✅ CLAUDE_PLAN.md already read (hash: 7c5b2a91...)
```

## Implementation Files

### Modified Files

1. **scripts/modules/handoff/gates/core-protocol-gate.js**
   - Updated `checkFileNeedsRead()` to check both state structures
   - Added `validateSessionStartGate()` function
   - Added `createSessionStartGate()` factory function
   - Updated exports

2. **scripts/hooks/protocol-file-tracker.cjs** (renamed from .js)
   - No code changes, just file extension change
   - Continues writing to legacy state structure

3. **.claude/settings.json**
   - Updated hook path from `.js` to `.cjs`

4. **scripts/modules/session-summary/index.js**
   - Fixed module export pattern for constants
   - Changed from named re-exports to default import destructuring

### Code Locations

```javascript
// Gate validation in handoffs
scripts/modules/handoff/gates/core-protocol-gate.js:validateSessionStartGate()

// Hook tracking
scripts/hooks/protocol-file-tracker.cjs:main()

// Hook configuration
.claude/settings.json:hooks.PostToolUse[matcher="Read"]
```

## Testing

### Manual Validation

Test that the gate recognizes files read via the PostToolUse hook:

```bash
# Trigger the hook manually
CLAUDE_TOOL_NAME=Read \
CLAUDE_TOOL_INPUT='{"file_path":"CLAUDE_CORE.md"}' \
node scripts/hooks/protocol-file-tracker.cjs

# Verify session state was updated
node -e "
const fs = require('fs');
const content = fs.readFileSync('.claude/unified-session-state.json', 'utf8')
  .replace(/^\uFEFF/, '');
const state = JSON.parse(content);
console.log('protocolFilesRead:', state.protocolFilesRead);
"

# Test gate recognition
node -e "
import('./scripts/modules/handoff/gates/core-protocol-gate.js').then(m => {
  const result = m.checkFileNeedsRead('CLAUDE_CORE.md', 'SD_START');
  console.log('needsRead:', result.needsRead, 'reason:', result.reason);
});
"
```

Expected results:
- Hook output: `[protocol-file-tracker] Marked CLAUDE_CORE.md as read`
- State query: `protocolFilesRead: [ 'CLAUDE_CORE.md' ]`
- Gate check: `needsRead: false reason: ALREADY_READ`

### Integration Testing

The fix was validated during SD-LEO-INFRA-SESSION-START-GATE-001 execution:

1. **Before fix**: Gate blocked even after reading CLAUDE_CORE.md
   ```
   ❌ CLAUDE_CORE.md needs to be read (NEVER_READ)
   ```

2. **After fix**: Gate passed successfully
   ```
   ✅ CLAUDE_CORE.md already read
   ✅ GATE_SD_START_PROTOCOL validation passed (Score: 100/100)
   ```

## Usage

### Invoking SESSION_START Gate

```javascript
import { validateSessionStartGate, createSessionStartGate } from './core-protocol-gate.js';

// Direct validation
const result = await validateSessionStartGate('session-123');
if (!result.pass) {
  console.error('SESSION_START gate failed:', result.issues);
}

// As handoff gate
const gate = createSessionStartGate('session-123');
const handoff = {
  gates: [gate, ...otherGates]
};
```

### Invoking SD_START Gate with Handoff Type (v1.2.0)

```javascript
import { validateSdStartGate, createSdStartGate } from './core-protocol-gate.js';

// Direct validation with handoff type
const result = await validateSdStartGate('SD-XXX-001', {}, 'LEAD-TO-PLAN');
// Now validates: CLAUDE.md, CLAUDE_CORE.md, AND CLAUDE_PLAN.md

// In handoff executor
class LeadToPlanExecutor extends BaseExecutor {
  getRequiredGates(sd, _options) {
    const gates = [];

    // Pass handoff type to include destination phase file
    gates.push(createSdStartGate(sd?.sd_key || sd?.id || 'unknown', 'LEAD-TO-PLAN'));

    // ...other gates
    return gates;
  }
}
```

### Integration with LEO Session Init

The SESSION_START gate should be invoked at the earliest point of `/leo` skill session initialization:

```javascript
// In /leo skill entry point
async function initializeSession() {
  const sessionId = generateSessionId();

  // Run SESSION_START gate FIRST
  const gateResult = await validateSessionStartGate(sessionId);
  if (!gateResult.pass) {
    return {
      success: false,
      error: 'SESSION_START gate blocked',
      remediation: gateResult.remediation
    };
  }

  // Continue with normal initialization
  // ...
}
```

## Troubleshooting

### Gate Fails Even After Reading File

**Symptom**: Gate reports `NEVER_READ` despite file being read.

**Diagnosis**:
1. Check that PostToolUse hook is configured in `.claude/settings.json`
2. Verify hook is using `.cjs` extension (not `.js`)
3. Check session state file for `protocolFilesRead` array

```bash
# Check hook configuration
grep -A5 "protocol-file-tracker" .claude/settings.json

# Check session state
node -e "
const fs = require('fs');
const state = JSON.parse(fs.readFileSync('.claude/unified-session-state.json', 'utf8').replace(/^\uFEFF/, ''));
console.log('Hook data:', {
  protocolFilesRead: state.protocolFilesRead,
  protocolFilesReadAt: state.protocolFilesReadAt
});
console.log('Gate data:', state.protocolGate);
"
```

### Hook Not Running

**Symptom**: `protocolFilesRead` not populating in session state.

**Common Causes**:
1. **Wrong file extension**: Hook must be `.cjs`, not `.js`
2. **Module format error**: If using `.js`, convert `require()` to `import`
3. **Hook not configured**: Check `.claude/settings.json`

**Fix**:
```bash
# Rename to .cjs
mv scripts/hooks/protocol-file-tracker.js scripts/hooks/protocol-file-tracker.cjs

# Update settings.json
# Change: "command": "node .../protocol-file-tracker.js"
# To:     "command": "node .../protocol-file-tracker.cjs"
```

## Related Documentation

- [Claude Code Hooks](./claude-code-hooks.md) - Hook system overview
- [Validation Agent Proactive Gates](./validation-agent-proactive-gates.md) - Gate patterns
- [CORE_PROTOCOL_REQUIREMENTS](../../scripts/modules/handoff/gates/core-protocol-gate.js) - Source code

## Version History

- **v1.2.0** (2026-01-30): Enhanced SD_START gate with handoff-specific validation
  - Added optional `handoffType` parameter to `validateSdStartGate()`
  - Introduced `HANDOFF_PHASE_FILES` mapping for destination phase files
  - SD_START gate now validates destination phase protocol file at handoffs
  - Example: LEAD-TO-PLAN now requires CLAUDE.md, CLAUDE_CORE.md, AND CLAUDE_PLAN.md
  - Updated all handoff executors to pass handoff type to gate
  - Fixed protocol-file-read-gate.js mappings to use destination files (not source)
  - SD reference: SD-LEO-FIX-PHASE0-INTEGRATION-001

- **v1.1.0** (2026-01-30): Added CLAUDE.md requirement
  - Updated all trigger points to require both CLAUDE.md and CLAUDE_CORE.md
  - Documented rationale: sub-agent trigger keywords in CLAUDE.md
  - RCA reference: SD-LEO-INFRA-HARDENING-001 (AUTO-PROCEED empty success_metrics)

- **v1.0.0** (2026-01-25): Initial documentation
  - Documented state structure mismatch bug fix
  - Documented SESSION_START gate implementation
  - Documented hook module format fix
