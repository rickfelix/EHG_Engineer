<!-- reasoning_effort: medium -->

---
description: Run batch operations on the SD fleet — accept handoffs, rescore vision, complete children
argument-hint: <operation> [--apply] [--type <value>] [--parent <SD-KEY>] [--list]
---

# /batch — Batch Operations Dispatcher

Unified interface for fleet-level maintenance operations. Wraps existing batch scripts with dry-run enforcement, audit logging, and write verification.

## Quick Reference

| Operation | Description | Flags |
|-----------|-------------|-------|
| `accept-handoffs` | Accept all valid pending handoffs | `--type <lead-to-plan\|plan-to-exec\|all>` |
| `rescore` | Rescore vision scores | `--type <manual\|round1\|round2>` |
| `complete-children` | Complete children of an orchestrator | `--parent <SD-KEY>` |

## Usage

Parse the arguments provided by the user to determine the operation and flags.

### Step 1: Determine Mode

- If arguments contain `--list` or no operation → Show available operations
- If arguments contain an operation name → Execute that operation

### Step 2: Execute

Run the batch dispatcher with the parsed arguments:

```bash
node scripts/batch-dispatcher.mjs <operation> [flags]
```

**Default mode is dry-run** (preview only). The user must pass `--apply` to execute writes.

### Examples

```bash
# Preview all pending handoffs
node scripts/batch-dispatcher.mjs accept-handoffs

# Accept only lead-to-plan handoffs
node scripts/batch-dispatcher.mjs accept-handoffs --type lead-to-plan --apply

# Preview manual override rescores
node scripts/batch-dispatcher.mjs rescore --type manual

# Complete children of an orchestrator (preview)
node scripts/batch-dispatcher.mjs complete-children --parent SD-ORCH-001

# List all available operations
node scripts/batch-dispatcher.mjs --list
```

### Step 3: Review Output

The dispatcher shows:
- Item count and per-item status
- Processed/skipped/failed counts
- Duration

All executions are logged to `batch_operation_log` for audit.

## Safety

- **Dry-run by default**: No `--apply` = no writes
- **Write verification**: Read-back after each mutation catches silent Supabase failures
- **Audit trail**: Every execution (dry-run and apply) logged to `batch_operation_log`
