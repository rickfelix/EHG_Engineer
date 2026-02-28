---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Plan Mode Integration Reference



## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Design Approach: Permission Bundling](#design-approach-permission-bundling)
- [Integration Points](#integration-points)
- [Module Structure](#module-structure)
- [Phase Permissions](#phase-permissions)
  - [LEAD Phase](#lead-phase)
  - [PLAN Phase](#plan-phase)
  - [EXEC Phase](#exec-phase)
  - [VERIFY Phase](#verify-phase)
  - [FINAL Phase](#final-phase)
- [Configuration](#configuration)
  - [Options](#options)
- [State Files](#state-files)
- [API Reference](#api-reference)
  - [LEOPlanModeOrchestrator](#leoplanmodeorchestrator)
  - [Phase Permissions API](#phase-permissions-api)
- [Integration with Handoff System](#integration-with-handoff-system)
- [Integration with Session Init](#integration-with-session-init)
- [Disabling Plan Mode Integration](#disabling-plan-mode-integration)
- [Troubleshooting](#troubleshooting)
  - [Plan Mode not activating](#plan-mode-not-activating)
  - [Permission prompts still appearing](#permission-prompts-still-appearing)
  - [State file issues](#state-file-issues)
- [Related Documentation](#related-documentation)

## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-19
- **Tags**: api, protocol, leo, sd

**SD-PLAN-MODE-001** - Claude Code Plan Mode Integration with LEO Protocol

## Overview

This module automatically integrates Claude Code's native Plan Mode into the LEO Protocol workflow. Plan Mode is used briefly at phase boundaries for permission pre-approval, reducing permission prompts by 70-85%.

## Design Approach: Permission Bundling

Instead of keeping Plan Mode active during phases (which would block LEO scripts), this integration:

1. **At phase boundary** - Enter Plan Mode briefly
2. **Immediately exit** - Use ExitPlanMode with phase-specific permissions
3. **Execute phase** - With pre-approved permissions, no prompts
4. **Repeat at next boundary**

## Integration Points

| LEO Workflow Point | Action | Permissions Pre-Approved |
|--------------------|--------|--------------------------|
| Session start (SD detected) | Enter→Exit Plan Mode | LEAD phase permissions |
| Before LEAD-TO-PLAN handoff | Enter→Exit Plan Mode | PLAN phase permissions |
| Before PLAN-TO-EXEC handoff | Enter→Exit Plan Mode | EXEC phase permissions |
| Before EXEC-TO-PLAN handoff | Enter→Exit Plan Mode | VERIFY phase permissions |
| Before LEAD-FINAL-APPROVAL | Enter→Exit Plan Mode | FINAL phase permissions |

## Module Structure

```
scripts/modules/plan-mode/
  ├── LEOPlanModeOrchestrator.js   # Main orchestrator class
  ├── phase-permissions.js          # Phase → permission mappings
  └── index.js                      # Public API exports
```

## Phase Permissions

### LEAD Phase
- Run SD queue commands
- Run handoff scripts
- Check git status

### PLAN Phase
- Run PRD generation scripts
- Run sub-agent orchestration
- Run handoff scripts
- Create git branches

### EXEC Phase
- Run tests
- Run build commands
- Git operations (add, commit, push)
- Run handoff scripts

### VERIFY Phase
- Run test suites
- Run verification scripts
- Run handoff scripts

### FINAL Phase
- Create pull requests
- Run merge operations
- Run archive scripts

## Configuration

Configuration file: `.claude/leo-plan-mode-config.json`

```json
{
  "leo_plan_mode": {
    "enabled": true,
    "auto_enter_on_sd_detection": true,
    "auto_exit_on_exec_phase": true,
    "permission_pre_approval": true
  }
}
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `true` | Master switch for Plan Mode integration |
| `auto_enter_on_sd_detection` | `true` | Auto-trigger at session start when SD detected |
| `auto_exit_on_exec_phase` | `true` | Auto-exit with permissions for EXEC phase |
| `permission_pre_approval` | `true` | Pre-approve phase-specific permissions |

## State Files

The integration uses state files for tracking:

- **Session state**: `~/.claude-session-state.json`
- **Plan Mode state**: `~/.claude-plan-mode-state.json`

## API Reference

### LEOPlanModeOrchestrator

```javascript
import { LEOPlanModeOrchestrator } from './scripts/modules/plan-mode/index.js';

const orchestrator = new LEOPlanModeOrchestrator({ verbose: true });

// Check if enabled
orchestrator.isEnabled(); // boolean

// Get current state
orchestrator.getState(); // state object or null

// Request Plan Mode entry
await orchestrator.requestPlanModeEntry({
  sdId: 'SD-XXX-001',
  phase: 'LEAD',
  reason: 'session_start'
});

// Request Plan Mode exit with permissions
await orchestrator.requestPlanModeExit({
  sdId: 'SD-XXX-001',
  phase: 'EXEC',
  allowedPrompts: orchestrator.getPhasePermissions('EXEC')
});

// Handle phase transition (auto-decides enter vs exit)
await orchestrator.handlePhaseTransition({
  sdId: 'SD-XXX-001',
  fromPhase: 'PLAN',
  toPhase: 'EXEC',
  handoffType: 'PLAN-TO-EXEC'
});

// Clear state
orchestrator.clearState();
```

### Phase Permissions API

```javascript
import {
  getPermissionsForPhase,
  getCombinedPermissions,
  LEAD_PERMISSIONS,
  PLAN_PERMISSIONS,
  EXEC_PERMISSIONS
} from './scripts/modules/plan-mode/index.js';

// Get permissions for a single phase
const perms = getPermissionsForPhase('EXEC');
// Returns: [{ tool: 'Bash', prompt: 'run tests' }, ...]

// Combine permissions for multiple phases
const combined = getCombinedPermissions(['PLAN', 'EXEC']);
// Returns: deduplicated array of all permissions
```

## Integration with Handoff System

The `BaseExecutor` class automatically triggers Plan Mode transitions after successful handoffs:

```javascript
// In BaseExecutor.js (Step 4.5)
await this._handlePlanModeTransition(sdId, sd, options);
```

This is non-blocking - any errors are logged but don't fail the handoff.

## Integration with Session Init

The `session-init.cjs` hook triggers Plan Mode when a session starts on an SD branch:

```javascript
// Automatic trigger when SD detected
if (state.current_sd && isPlanModeEnabled()) {
  requestPlanModeEntry(state.current_sd, phase);
}
```

## Disabling Plan Mode Integration

To disable without modifying code:

```json
// .claude/leo-plan-mode-config.json
{
  "leo_plan_mode": {
    "enabled": false
  }
}
```

All Plan Mode calls become no-ops when disabled.

## Troubleshooting

### Plan Mode not activating
1. Check config file exists: `.claude/leo-plan-mode-config.json`
2. Verify `enabled: true` in config
3. Ensure branch name contains SD ID pattern (e.g., `feat/SD-XXX-001-...`)

### Permission prompts still appearing
1. Verify `permission_pre_approval: true` in config
2. Check that handoff completed successfully
3. Review phase permissions match actual commands being run

### State file issues
Delete state files to reset:
```bash
rm ~/.claude-plan-mode-state.json
rm ~/.claude-session-state.json
```

## Related Documentation

- [LEO Protocol Overview](../../CLAUDE_CORE.md)
- [Handoff System](../leo/handoffs/handoff-system-guide.md)
- [Command Ecosystem](../leo/commands/command-ecosystem.md)
